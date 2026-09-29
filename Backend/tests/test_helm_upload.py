"""Run: python -m unittest discover -s Backend/tests -p test_helm_upload.py"""
import base64
from email.parser import BytesParser
from email.policy import default
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch

from flask import Flask
import requests
from werkzeug.datastructures import MultiDict
from werkzeug.security import generate_password_hash


MODULE = Path(__file__).resolve().parents[1] / "katana-nbi/katana/api/helm.py"
spec = importlib.util.spec_from_file_location("helm_api", MODULE)
helm_api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helm_api)
ADMIN_HASH = generate_password_hash("operator-password", method="pbkdf2:sha256:1000")
TOKEN = "repository-token-never-in-browser"
METADATA = dict(name="free5gc", version="1.3.1", filename="free5gc-1.3.1.tgz",
                sha256="a" * 64, url="http://repository/free5gc-1.3.1.tgz", size=123)


def response(status=201, body=None):
    result = requests.Response()
    result.status_code = status
    result._content = body if isinstance(body, bytes) else json.dumps(body or METADATA).encode()
    result._content_consumed = True
    return result


def credentials(username="operator", password="operator-password"):
    encoded = base64.b64encode(f"{username}:{password}".encode()).decode()
    return {"Authorization": f"Basic {encoded}"}


class HelmUploadTests(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.config.update(
            TESTING=True, HELM_UPLOAD_ENABLED=True, HELM_UPLOAD_TOKEN=TOKEN,
            HELM_UPLOAD_ADMIN_USER="operator", HELM_UPLOAD_ADMIN_PASSWORD_HASH=ADMIN_HASH,
            HELM_REPOSITORY_URL="http://repository/charts", HELM_UPLOAD_URL="http://repository/api/charts",
        )
        helm_api.configure_helm(self.app)
        self.app.register_blueprint(helm_api.helm)
        self.client = self.app.test_client()
        self.post_patch = patch.object(helm_api.requests, "post", return_value=response())
        self.get_patch = patch.object(helm_api.requests, "get", return_value=response(200, b"entries: {}"))
        self.post = self.post_patch.start()
        self.get = self.get_patch.start()
        self.addCleanup(self.post_patch.stop)
        self.addCleanup(self.get_patch.stop)

    def upload(self, body=b"chart bytes", filename="chart.tgz", headers=None, data=None):
        result = self.client.post("/api/helm/charts", headers=credentials() if headers is None else headers,
                                  data=data if data is not None else {"chart": (io.BytesIO(body), filename)})
        # Werkzeug's test client also spools the simulated incoming HTTP body.
        self.addCleanup(result.request.environ["wsgi.input"].close)
        self.addCleanup(result.close)
        return result

    def catalogue(self):
        return self.client.get("/api/helm/charts", headers=credentials())

    def test_authentication_required_for_both_routes_and_no_repository_call(self):
        for headers in ({}, credentials(password="wrong"), credentials(username="reader"),
                        {"Authorization": f"Bearer {TOKEN}"}):
            self.assertEqual(self.upload(headers=headers).status_code, 401)
            self.assertEqual(self.client.get("/api/helm/charts", headers=headers).status_code, 401)
        self.post.assert_not_called()
        self.get.assert_not_called()
        self.app.config["HELM_UPLOAD_ENABLED"] = False
        self.assertEqual(self.catalogue().status_code, 503)

    def test_configuration_fails_closed_without_printing_secrets(self):
        for key, value in (("HELM_UPLOAD_TOKEN", ""), ("HELM_UPLOAD_ADMIN_USER", ""),
                           ("HELM_UPLOAD_ADMIN_PASSWORD_HASH", "not-a-hash"),
                           ("HELM_UPLOAD_ADMIN_PASSWORD_HASH", "scrypt:32768:8:1"),
                           ("HELM_UPLOAD_URL", "http://name:password@repository/api/charts"),
                           ("HELM_REPOSITORY_URL", "file:///etc/passwd"),
                           ("HELM_UPLOAD_MAX_BYTES", "0"), ("HELM_UPLOAD_MAX_BYTES", "104857601"),
                           ("HELM_UPLOAD_TIMEOUT_SECONDS", "nan")):
            with self.subTest(key=key):
                app = Flask(__name__)
                app.config.update(self.app.config)
                app.config[key] = value
                with self.assertRaises(ValueError) as caught:
                    helm_api.configure_helm(app)
                self.assertNotIn(TOKEN, str(caught.exception))

    def test_streamed_multipart_and_cleanup_with_large_file(self):
        payload = b"\x1f\x8b\x00\xff" * 300000
        streams = []

        def receive(url, **kwargs):
            self.assertEqual(url, "http://repository/api/charts")
            self.assertEqual(kwargs["headers"]["Authorization"], f"Bearer {TOKEN}")
            self.assertFalse(kwargs["allow_redirects"])
            self.assertEqual(kwargs["timeout"], (10, 300))
            encoder = kwargs["data"]
            streams.append(encoder.fields["chart"][1])
            self.assertFalse(streams[0].closed)
            data = b"".join(iter(lambda: encoder.read(8192), b""))
            message = BytesParser(policy=default).parsebytes(
                f'Content-Type: {kwargs["headers"]["Content-Type"]}\r\n\r\n'.encode() + data)
            parts = list(message.iter_parts())
            self.assertEqual(len(parts), 1)
            self.assertEqual(parts[0].get_param("name", header="content-disposition"), "chart")
            self.assertEqual(parts[0].get_payload(decode=True), payload)
            return response()

        self.post.side_effect = receive
        with self.assertLogs("katana.helm", level="INFO") as logs:
            result = self.upload(payload, "../my chart.tgz")
        self.assertEqual(result.status_code, 201, result.json)
        self.assertEqual(result.json["name"], "free5gc")
        self.assertEqual(result.json["size"], len(payload))
        self.assertEqual(result.headers["X-Request-ID"], result.json["request_id"])
        self.assertEqual(result.headers["Cache-Control"], "no-store")
        self.assertTrue(streams[0].closed)
        self.assertIn("user=operator", " ".join(logs.output))
        self.assertNotIn(TOKEN, " ".join(logs.output) + result.get_data(as_text=True))
        self.assertNotIn("operator-password", " ".join(logs.output))

    def test_input_validation_never_contacts_repository(self):
        self.app.config["HELM_UPLOAD_MAX_BYTES"] = 10
        cases = [(b"", "empty.tgz", 400), (b"x", "chart.zip", 415),
                 (b"x" * 11, "large.tgz", 413), (b"x" * 70000, "huge.tgz", 413)]
        for body, filename, status in cases:
            self.assertEqual(self.upload(body, filename).status_code, status)
        self.assertEqual(self.upload(data={}).status_code, 415)
        for data in (
            {"other": (io.BytesIO(b"x"), "chart.tgz")},
            {"chart": (io.BytesIO(b"x"), "chart.tgz"), "extra": "value"},
            MultiDict([("chart", (io.BytesIO(b"a"), "one.tgz")),
                       ("chart", (io.BytesIO(b"b"), "two.tgz"))]),
        ):
            self.assertEqual(self.upload(data=data).status_code, 400)
        self.post.assert_not_called()
        self.assertEqual(self.upload(b"x" * 10).status_code, 201)

    def test_repository_errors_no_retries_or_credential_leaks_and_stream_closed(self):
        for upstream, expected in ((200, 201), (302, 502), (401, 502), (403, 502), (409, 409),
                                   (413, 413), (415, 415), (422, 422), (500, 502), (502, 502), (504, 502)):
            with self.subTest(upstream=upstream):
                self.post.reset_mock()
                body = METADATA if upstream == 200 else {"error": f"Invalid chart: {TOKEN}"}
                self.post.return_value = response(upstream, body)
                result = self.upload()
                self.assertEqual(result.status_code, expected, result.json)
                self.assertNotIn(TOKEN, result.get_data(as_text=True))
                self.post.assert_called_once()
                self.assertTrue(self.post.call_args.kwargs["data"].fields["chart"][1].closed)
                self.assertIn("request_id", result.json)
        for failure in (requests.Timeout(TOKEN), requests.ConnectionError(TOKEN)):
            self.post.side_effect = failure
            result = self.upload()
            self.assertEqual(result.status_code, 503)
            self.assertNotIn(TOKEN, result.get_data(as_text=True))
            self.assertTrue(self.post.call_args.kwargs["data"].fields["chart"][1].closed)

    def test_invalid_success_metadata_is_not_a_success(self):
        for body in (b"not json", {**METADATA, "url": "javascript:alert(1)"},
                     {**METADATA, "name": TOKEN}, {**METADATA, "sha256": "bad"}):
            self.post.return_value = response(body=body)
            result = self.upload()
            self.assertEqual(result.status_code, 502)
            self.assertNotIn(TOKEN, result.get_data(as_text=True))

    def test_catalogue_sorting_relative_urls_missing_metadata_and_no_token(self):
        versions = ["1.9.0", "2.0.0-rc.2", "1.10.0", "2.0.0", "2.0.0-rc.10", "2.0.0-alpha"]
        entries = {"z-chart": [], "free5gc": [dict(version=value, urls=[f"free5gc-{value}.tgz"])
                                                   for value in versions]}
        self.get.return_value = response(200, {"entries": entries})
        result = self.catalogue()
        self.assertEqual(result.status_code, 200, result.json)
        self.assertEqual([chart["name"] for chart in result.json["charts"]], ["free5gc", "z-chart"])
        items = result.json["charts"][0]["versions"]
        self.assertEqual([item["version"] for item in items],
                         ["2.0.0", "2.0.0-rc.10", "2.0.0-rc.2", "2.0.0-alpha", "1.10.0", "1.9.0"])
        self.assertEqual(items[0]["description"], "")
        self.assertEqual(items[0]["url"], "http://repository/charts/free5gc-2.0.0.tgz")
        self.assertEqual(result.json["max_bytes"], 104857600)
        self.assertEqual(self.get.call_args.args[0], "http://repository/charts/index.yaml")
        self.assertNotIn("headers", self.get.call_args.kwargs)
        self.assertNotIn(TOKEN, str(self.get.call_args))

    def test_catalogue_empty_invalid_unavailable_and_no_redirects(self):
        for body in (b"apiVersion: v1", b"entries: {}", b"entries: null"):
            self.get.return_value = response(200, body)
            self.assertEqual(self.catalogue().json["charts"], [])
        for body in (b"[broken", b"hello", b"entries: []", b"entries: {chart: [bad]}",
                     b"entries: {chart: [{version: '1.01.0'}]}",
                     b"entries: {chart: [{version: '1.0.0', description: &a [*a]}]}",
                     b"entries: {chart: [{version: '1.0.0', urls: ['javascript:alert(1)']}]}",
                     b"x" * (2 * 1024 * 1024 + 1)):
            self.get.return_value = response(200, body)
            self.assertEqual(self.catalogue().status_code, 502, body[:100])
        self.get.return_value = response(302)
        self.assertEqual(self.catalogue().status_code, 502)
        self.assertFalse(self.get.call_args.kwargs["allow_redirects"])
        self.get.side_effect = requests.Timeout(TOKEN)
        self.assertEqual(self.catalogue().status_code, 503)


if __name__ == "__main__":
    unittest.main()
