"""NEST validation, OSM serialization and restart checks without live infrastructure."""
import ast
import copy
import json
import os
from pathlib import Path
import runpy
import sys
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
NEST_PATH = ROOT / 'katana-nbi/katana/shared_utils/nestHelm.py'
free5gc_parameters = runpy.run_path(str(NEST_PATH))['free5gc_parameters']


def config(sd='000002'):
    return dict(profile='free5gc-sd-v1', member_vnf_index='free5gc', kdu_name='free5gc', sd=sd)


def load_method(path, name, namespace):
    tree = ast.parse((ROOT / path).read_text())
    node = next(n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name == name)
    node.decorator_list = []
    exec(compile(ast.Module(body=[node], type_ignores=[]), str(path), 'exec'), namespace)
    return namespace[name]


class NestHelmTests(unittest.TestCase):
    def test_validation_and_independent_parameters(self):
        original = config()
        first = free5gc_parameters(original)
        second = free5gc_parameters(config('ABCDEF'))
        self.assertEqual(original, config())
        self.assertEqual(first[0]['additionalParamsForKdu'][0]['additionalParams']['global']['katanaNestSd'], '000002')
        self.assertEqual(second[0]['additionalParamsForKdu'][0]['additionalParams']['global']['katanaNestSd'], 'abcdef')
        for invalid in (2, None, '', '123', '0x000002', 'ffffff', 'FFFFff', '000002\n', 'gggggg'):
            with self.subTest(sd=invalid), self.assertRaises(ValueError):
                free5gc_parameters(config(invalid))
        for invalid in ([], {**config(), 'throughput': 100}, {**config(), 'profile': 'unknown'}, {**config(), 'kdu_name': '../other'}):
            with self.subTest(config=invalid), self.assertRaises(ValueError):
                free5gc_parameters(invalid)

    def test_api_requires_adapted_kubernetes_nsd_and_generates_parameters(self):
        records = {
            'nsd': {'deployment_runtime': 'kubernetes', 'nfvo_id': 'osm'},
            'nfvo': {'id': 'osm'},
            'vim': {'id': 'cluster', 'type': 'kubernetes', 'location': 'edge', 'nfvo_id': 'osm'},
        }
        validate = load_method('katana-nbi/katana/api/slice.py', '_validate_deployment_targets', {
            'os': os, 'mongoUtils': SimpleNamespace(find=lambda collection, query: records.get(collection)),
        })
        service = {'nsd-id': 'nsd', 'nfvo-id': 'osm', 'target': 'cluster', 'placement': 'edge', 'helm_configuration': config()}
        module = ModuleType('katana.shared_utils.nestHelm')
        module.free5gc_parameters = free5gc_parameters
        with patch.dict(sys.modules, {'katana.shared_utils.nestHelm': module}), patch.dict(os.environ, {'KATANA_FREE5GC_NEST_NSD_IDS': 'nsd'}):
            data = {'service_descriptor': {'ns_list': [copy.deepcopy(service)]}}
            self.assertEqual(validate(None, data), ('kubernetes', None))
            self.assertEqual(data['service_descriptor']['ns_list'][0]['additionalParamsForVnf'], free5gc_parameters(config()))
            # Users cannot inject arbitrary Helm settings through the generated field.
            self.assertEqual(validate(None, data)[1][1], 400)
            with patch.dict(os.environ, {'KATANA_FREE5GC_NEST_NSD_IDS': ''}):
                self.assertEqual(validate(None, {'service_descriptor': {'ns_list': [copy.deepcopy(service)]}})[1][1], 400)
            records['nsd']['deployment_runtime'] = 'openstack'
            self.assertEqual(validate(None, {'service_descriptor': {'ns_list': [copy.deepcopy(service)]}})[1][1], 400)

    def test_kubernetes_deployment_reuses_nsd_and_passes_nest_overrides(self):
        translate = runpy.run_path(str(NEST_PATH))['deployment_nest_parameters']
        nest = {'service_descriptor': {'ns_list': [{'helm_configuration': config()}]}}
        self.assertEqual(translate(nest, 'nsd', 'osm', []), free5gc_parameters(config()))
        for field, value in [('nsd-id', 'other'), ('nfvo-id', 'other'), ('target', 'missing'), ('placement', 'missing'), ('additionalParamsForVnf', [])]:
            invalid = copy.deepcopy(nest)
            invalid['service_descriptor']['ns_list'][0][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                translate(invalid, 'nsd', 'osm', [])
        for invalid in (None, {}, {'service_descriptor': {'ns_list': [{}, {}]}}):
            with self.assertRaises(ValueError):
                translate(invalid, 'nsd', 'osm', [])

        with self.assertRaises(ValueError):
            translate({'service_descriptor': {'ns_list': [{'target': 'a', 'helm_configuration': config()}]}}, 'nsd', 'osm', [{'id': 'a'}, {'id': 'b'}])

        request = SimpleNamespace(is_json=True, json={
            'nsName': 'from-yaml', 'nsDescription': 'description', 'nsdId': 'nsd',
            'nfvo_id': 'osm', 'vimAccountId': 'vim', 'nest': nest,
        })
        nfvo = dict(id='osm', nfvoip='osm', nfvousername='user', nfvopassword='password', tenantname='project')
        mongo = Mock()
        mongo.find.return_value = {'nfvo_id': 'osm', 'deployment_runtime': 'kubernetes'}
        mongo.find_all.return_value = []
        post = Mock(return_value=Mock(status_code=202, text='accepted', json=lambda: {'id': 'instance'}))
        deploy = load_method('katana-nbi/katana/api/k8s.py', 'deploy', {
            'request': request, 'jsonify': lambda value: value, 'logger': Mock(),
            '_find_nfvo': lambda value: nfvo, '_osm_client': lambda **kwargs: Mock(token='token', verify=True),
            '_vim_account_id': lambda *args: 'vim', 'mongoUtils': mongo,
            'requests': SimpleNamespace(post=post), 'os': os,
        })
        module = ModuleType('katana.shared_utils.nestHelm')
        module.deployment_nest_parameters = translate
        with patch.dict(sys.modules, {'katana.shared_utils.nestHelm': module}), patch.dict(os.environ, {'KATANA_FREE5GC_NEST_NSD_IDS': 'nsd'}):
            self.assertEqual(deploy(None)[1], 202)
            self.assertEqual(post.call_args.kwargs['json'], {
                'nsName': 'from-yaml', 'nsDescription': 'description', 'nsdId': 'nsd',
                'vimAccountId': 'vim', 'additionalParamsForVnf': free5gc_parameters(config()),
            })
            post.reset_mock()
            with patch.dict(os.environ, {'KATANA_FREE5GC_NEST_NSD_IDS': ''}):
                self.assertEqual(deploy(None)[1], 400)
            mongo.find.return_value['nfvo_id'] = 'different-owner'
            self.assertEqual(deploy(None)[1], 400)
            post.assert_not_called()

    def test_all_osm_clients_serialize_parameters_and_quoted_names(self):
        paths = ('katana-mngr/katana/shared_utils/nfvoUtils/osmUtils.py',
                 'katana-nbi/katana/shared_utils/nfvoUtils/osmUtils.py',
                 'katana-nfv_mon/katana/utils/nfvoUtils/osmUtils.py')
        for path in paths:
            with self.subTest(path=path):
                response = Mock(status_code=201)
                response.json.return_value = {'id': 'instance'}
                requests = SimpleNamespace(post=Mock(return_value=response), Timeout=TimeoutError, RequestException=RuntimeError)
                instantiate = load_method(path, 'instantiateNs', {
                    'json': json, 'requests': requests, 'OSM_WRITE_TIMEOUT': 30,
                    'OSM_REQUEST_ATTEMPTS': 3, 'OsmRequestError': RuntimeError, 'OsmAuthenticationError': RuntimeError,
                })
                client = SimpleNamespace(ip='osm', token='token', timeout=5, verify=True)
                params = free5gc_parameters(config())
                self.assertEqual(instantiate(client, 'name: "quoted"\nvalue', 'nsd', 'vim', params), 'instance')
                payload = json.loads(requests.post.call_args.kwargs['data'])
                self.assertEqual(payload['additionalParamsForVnf'], params)
                self.assertEqual(payload['nsName'], 'name: "quoted"\nvalue')
                instantiate(client, 'old-client', 'nsd', 'vim')
                self.assertNotIn('additionalParamsForVnf', json.loads(requests.post.call_args.kwargs['data']))

    def test_restart_reuses_stored_sd(self):
        params = free5gc_parameters(config())
        instance = {'ns-name': 'service', 'nsd-id': 'nsd', 'nfvo-id': 'osm', 'vim': 'cluster', 'nfvo_inst_ns': 'old', 'additionalParamsForVnf': params}
        nest = {'ns_inst_info': {'service': {'edge': instance}}, 'vim_list': {'cluster': {'nfvo_vim_account': {'osm': 'account'}}}, 'runtime_errors': {}}
        osm = Mock()
        osm.checkNsLife.return_value = True
        osm.instantiateNs.return_value = 'new'
        osm.getNsr.return_value = {'operational-status': 'running', 'config-status': 'configured'}
        osm.getVnfrId.return_value = []
        mongo = Mock()
        mongo.get.return_value = nest
        mongo.find.return_value = {'obj': b'object'}
        update = load_method('katana-mngr/katana/utils/sliceUtils/sliceUtils.py', 'update_slice', {
            'mongoUtils': mongo, 'os': SimpleNamespace(getenv=lambda *args: None),
            'logger': Mock(), 'pickle': SimpleNamespace(loads=lambda value: osm), 'time': Mock(),
        })
        update('slice', {'domain': 'NFV', 'action': 'RestartNS', 'details': {'ns_id': 'service', 'location': 'edge'}})
        osm.instantiateNs.assert_called_once_with('service', 'nsd', 'account', additionalParamsForVnf=params)
        self.assertEqual(instance['nfvo_inst_ns'], 'new')
        self.assertEqual(instance['additionalParamsForVnf'], params)


if __name__ == '__main__':
    unittest.main()
