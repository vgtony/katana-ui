#!/usr/bin/env python3
"""Render and verify the SD profile against a reviewed source checkout (Helm + PyYAML)."""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile
import yaml
from prepare_free5gc_nest_chart import prepare


def render(chart, sd=None):
    command = ['helm', 'template', 'nest-check', str(chart)]
    if sd is not None:
        command += ['--set-string', f'global.katanaNestSd={sd}']
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


def check(source):
    baseline = render(source)
    with tempfile.TemporaryDirectory() as tmp:
        chart = prepare(source, Path(tmp) / 'chart')
        assert render(chart) == baseline, 'Default configuration changed'
        for sd in ('000002', 'abcdef'):
            actual = render(chart, sd)
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
        for invalid in ('123', 'ffffff', 'nothex'):
            try:
                render(chart, invalid)
            except subprocess.CalledProcessError:
                continue
            raise AssertionError(f'Chart accepted {invalid}')
    print('PASS: core, gNB, UE and subscriber SDs; unchanged other settings; independent renders; invalid SD rejection')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    check(parser.parse_args().source)
