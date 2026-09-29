#!/usr/bin/env python3
"""Render and verify the SD profile against a reviewed source checkout (Helm + PyYAML)."""
import argparse
import hashlib
import json
import runpy
from pathlib import Path
import subprocess
import tempfile
import yaml
from prepare_free5gc_nest_chart import prepare


def render(chart, sd=None, values=None):
    command = ['helm', 'template', 'nest-check', str(chart)]
    if sd is not None:
        command += ['--set-string', f'global.katanaNestSd={sd}']
    if values is not None:
        command += ['--values', str(values)]
    result = subprocess.run(command, text=True, capture_output=True, check=True)
    configs = {}
    for resource in yaml.safe_load_all(result.stdout):
        if resource and resource['kind'] == 'ConfigMap':
            for name, value in resource.get('data', {}).items():
                if name.endswith(('.yaml', '.json')):
                    configs[(resource['metadata']['name'], name)] = (
                        json.loads(value) if name.endswith('.json') else yaml.safe_load(value)
                    )
    return configs


def check(source=None):
    root = Path(__file__).resolve().parents[2]
    base = root / 'Helm/free5gc-1.2.11'
    for line in (root / 'Helm/free5gc-1.2.11.sha256').read_text().splitlines():
        digest, name = line.split('  ', 1)
        assert hashlib.sha256((base / name).read_bytes()).hexdigest() == digest, f'Base chart changed: {name}'
    parameters = runpy.run_path(str(root / 'Backend/katana-nbi/katana/shared_utils/nestHelm.py'))['free5gc_parameters']
    with tempfile.TemporaryDirectory() as tmp:
        chart = (prepare(source, Path(tmp) / 'chart') if source else
                 root / 'Helm/free5gc-1.3.1')
        baseline = render(source or base)
        assert render(chart) == baseline, 'Default configuration changed'
        for requested in ('000002', 'ABCDEF'):
            sd = requested.lower()
            params = parameters(dict(profile='free5gc-sd-v1', member_vnf_index='free5gc', kdu_name='free5gc', sd=requested))
            values = params[0]['additionalParamsForKdu'][0]['additionalParams']
            values_path = Path(tmp) / 'nest-values.json'
            values_path.write_text(json.dumps(values))
            actual = render(chart, values=values_path)
            changed = set()

            def compare(before, after, resource):
                if isinstance(before, dict):
                    assert before.keys() == after.keys()
                    for key, value in before.items():
                        # Core YAML defaults use unquoted octal; UERANSIM uses hex;
                        # subscriber JSON preserves the string representation.
                        if key == 'sd' and before.get('sst') == 1 and value in ('010203', 0o010203, 0x010203):
                            expected = int(sd, 16) if value == 0x010203 else sd
                            assert after[key] == expected, (resource, after[key], expected)
                            changed.add(resource)
                        else:
                            compare(value, after[key], resource)
                elif isinstance(before, list):
                    assert len(before) == len(after)
                    for left, right in zip(before, after):
                        compare(left, right, resource)
                else:
                    assert before == after, (resource, before, after)

            assert baseline.keys() == actual.keys()
            for resource in baseline:
                compare(baseline[resource], actual[resource], resource)
            names = {filename for _, filename in changed}
            assert {'amfcfg.yaml', 'smfcfg.yaml', 'nssfcfg.yaml', 'gnb-config.yaml', 'ue-config.yaml', 'subscriber.json'} <= names, names
        assert render(chart) == baseline, 'Per-deployment settings changed the base chart'
        for invalid in ('123', 'ffffff', 'FFFFff', 'nothex'):
            try:
                render(chart, invalid)
            except subprocess.CalledProcessError:
                continue
            raise AssertionError(f'Chart accepted {invalid}')
        for invalid in (2, None, True):
            values_path.write_text(json.dumps({'global': {'katanaNestSd': invalid}}))
            try:
                render(chart, values=values_path)
            except subprocess.CalledProcessError:
                continue
            raise AssertionError(f'Chart accepted non-string SD {invalid!r}')
        # Unrelated slice fields and strings must not be rewritten.
        values_path.write_text(json.dumps({
            'global': {'katanaNestSd': '000002'},
            'free5gc-amf': {'amf': {'configuration': {'configuration':
                'primary:\n  sst: 1 # chosen slice\n  sd: "010203"\n'
                'other:\n  sst: 2\n  sd: 010203\nmarker: "010203"\n'}}},
            'ueransim': {'gnb': {'config': {'slices': [
                {'sst': 1, 'sd': '010203'}, {'sst': 2, 'sd': '010203'}, {'sst': 1, 'sd': '112233'},
            ]}}, 'ue': {'config': {'marker': '010203', 'sd': '010203', 'configuredNssai': [
                {'sst': 1, 'sd': '010203'}, {'sst': 2, 'sd': '010203'},
            ]}}},
        }))
        configured = render(chart, values=values_path)
        amf = next(v for (_, name), v in configured.items() if name == 'amfcfg.yaml')['configuration']
        assert amf['primary'] == {'sst': 1, 'sd': '000002'}
        assert amf['other'] == {'sst': 2, 'sd': 0o010203}
        assert amf['marker'] == '010203'
        gnb = next(v for (_, name), v in configured.items() if name == 'gnb-config.yaml')
        assert gnb['slices'] == [{'sst': 1, 'sd': 2}, {'sst': 2, 'sd': 0x010203}, {'sst': 1, 'sd': 0x112233}]
        subscriber = next(v for (_, name), v in configured.items() if name == 'subscriber.json')
        assert subscriber['marker'] == subscriber['sd'] == '010203'
        assert subscriber['configuredNssai'] == [{'sst': 1, 'sd': '000002'}, {'sst': 2, 'sd': '010203'}]
    print('PASS: core, gNB, UE and subscriber SDs; unchanged other settings; independent renders; invalid SD rejection')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path, nargs='?',
                        help='Optional upstream checkout; defaults to the in-repository adapted chart')
    check(parser.parse_args().source)
