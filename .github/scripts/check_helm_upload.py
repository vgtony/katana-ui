#!/usr/bin/env python3
"""Run with Python 3; tests the real curl request against a local HTTP server."""
from email.parser import BytesParser
from email.policy import default
from http.server import BaseHTTPRequestHandler, HTTPServer
import os
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
from textwrap import dedent
from threading import Thread


class Repository(BaseHTTPRequestHandler):
    status = 201
    requests = []

    def do_POST(self):
        body = self.rfile.read(int(self.headers['Content-Length']))
        message = BytesParser(policy=default).parsebytes(
            f'Content-Type: {self.headers["Content-Type"]}\r\n\r\n'.encode() + body
        )
        self.requests.append((self.path, self.headers['Authorization'], message))
        self.send_response(self.status)
        self.send_header('Location', '/should-not-follow')
        self.end_headers()
        # Even a misconfigured server reflecting headers must not leak credentials.
        self.wfile.write(self.headers['Authorization'].encode())

    def log_message(self, *_):
        pass


def check_workflow(script, env):
    # Execute the actual workflow shell block, without adding a YAML dependency.
    workflow = script.parents[1] / 'workflows/upload-helm-chart.yml'
    block = dedent(workflow.read_text().split('        run: |\n', 1)[1])
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / '.github/scripts').mkdir(parents=True)
        (root / '.github/scripts' / script.name).write_bytes(script.read_bytes())
        (root / 'dist').mkdir()
        (root / 'charts').mkdir()

        def git(*args):
            return subprocess.check_output(
                ['git', '-c', 'user.name=Upload check', '-c', 'user.email=check@example.invalid',
                 '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', *args],
                cwd=root, text=True, stderr=subprocess.PIPE).strip()

        git('init', '-q')
        for name in ('unchanged', 'changed', 'deleted'):
            (root / f'dist/{name}.tgz').write_bytes(name.encode())
        git('add', '.')
        git('commit', '-qm', 'Before push')
        before = git('rev-parse', 'HEAD')
        (root / 'dist/new chart.tgz').write_bytes(b'new package')
        (root / 'dist/changed.tgz').write_bytes(b'changed package')
        (root / 'dist/deleted.tgz').unlink()
        (root / 'charts/dependency.tgz').write_bytes(b'do not publish')
        git('add', '.')
        git('commit', '-qm', 'New packages')
        after = git('rev-parse', 'HEAD')

        def run(**overrides):
            settings = dict(env, EVENT_NAME='push', BEFORE_SHA=before,
                            AFTER_SHA=after, PACKAGE_NAME='')
            settings.update(overrides)
            result = subprocess.run(['bash', '-c', block], cwd=root, env=settings,
                                    capture_output=True, text=True, timeout=15)
            assert 'test-only-token' not in result.stdout + result.stderr
            return result.returncode

        Repository.status = 201
        start = len(Repository.requests)
        assert run() == 0
        payloads = [list(request[2].iter_parts())[0].get_payload(decode=True)
                    for request in Repository.requests[start:]]
        assert sorted(payloads) == [b'changed package', b'new package'], payloads
        assert run(EVENT_NAME='workflow_dispatch', PACKAGE_NAME='new chart.tgz') == 0
        start = len(Repository.requests)
        assert run(EVENT_NAME='workflow_dispatch', PACKAGE_NAME='../charts/dependency.tgz') != 0
        assert run(BEFORE_SHA='0' * 40) != 0
        assert run(BEFORE_SHA=after) == 0
        assert len(Repository.requests) == start
        Repository.status = 409
        assert run() != 0
        assert len(Repository.requests) == start + 2, 'Must attempt each selected file once'


def check():
    script = Path(__file__).with_name('upload-helm-chart.sh')
    with HTTPServer(('127.0.0.1', 0), Repository) as server, TemporaryDirectory() as tmp:
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        env = dict(os.environ, HELM_UPLOAD_TOKEN='test-only-token',
                   HELM_UPLOAD_ENDPOINT=f'http://127.0.0.1:{server.server_port}/api/charts',
                   NO_PROXY='127.0.0.1', no_proxy='127.0.0.1')
        chart = Path(tmp) / 'chart with spaces,semi;quote"back\\slash.tgz'
        payload = b'\x1f\x8btest chart bytes\x00\xff'
        chart.write_bytes(payload)

        def upload(path=chart, token='test-only-token'):
            result = subprocess.run(['bash', '-x', str(script), str(path)],
                                    env=dict(env, HELM_UPLOAD_TOKEN=token),
                                    capture_output=True, text=True, timeout=15)
            assert 'test-only-token' not in result.stdout + result.stderr
            return result

        try:
            for status in (200, 201, 302, 401, 403, 409, 413, 415, 422, 500, 502, 504):
                Repository.status = status
                before = len(Repository.requests)
                result = upload()
                assert (result.returncode == 0) == (status in (200, 201)), result
                assert str(status) in result.stdout + result.stderr
                assert len(Repository.requests) == before + 1, 'Upload retried or redirected'
                path, authorization, multipart = Repository.requests[-1]
                assert path == '/api/charts' and authorization == 'Bearer test-only-token'
                parts = list(multipart.iter_parts())
                assert len(parts) == 1
                assert parts[0].get_param('name', header='content-disposition') == 'chart'
                assert parts[0].get_payload(decode=True) == payload

            before = len(Repository.requests)
            for name, size in (('empty.tgz', 0), ('wrong.zip', 1), ('oversize.tgz', 104857601)):
                invalid = Path(tmp) / name
                with invalid.open('wb') as file:
                    file.truncate(size)
                assert upload(invalid).returncode != 0
            assert upload(Path(tmp) / 'missing.tgz').returncode != 0
            linked = Path(tmp) / 'linked.tgz'
            linked.symlink_to(chart)
            assert upload(linked).returncode != 0
            assert upload(token='').returncode != 0
            assert upload(token='test-only-token\nextra-header: invalid').returncode != 0
            assert len(Repository.requests) == before, 'Invalid input reached the repository'
            check_workflow(script, env)
        finally:
            server.shutdown()
            thread.join()
    # The closed server port must cause a failed upload, not a success message.
    with TemporaryDirectory() as tmp:
        chart = Path(tmp) / 'chart.tgz'
        chart.write_bytes(payload)
        assert upload(chart).returncode != 0
    print('PASS: multipart bytes/auth, HTTP statuses, no retries/redirects, validation, token secrecy, connection failure, push/manual selection')


if __name__ == '__main__':
    check()
