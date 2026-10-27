"""Run from Backend: PYTHONPATH=katana-nbi python -m unittest tests.test_kubernetes_topology"""
import copy
import json
import os
from pathlib import Path
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch
from urllib.parse import urlsplit, parse_qs
from urllib3 import HTTPResponse
from flask import Flask, jsonify, request
from kubernetes.client.exceptions import ApiException
from katana.shared_utils import kubernetesTopology as t
from tests.test_nest_helm import load_method
from tests.test_unified_infrastructure import MongoStub

CONFIG = {'current-context': 'lab',
          'contexts': [{'name': 'lab', 'context': {'cluster': 'lab', 'user': 'reader'}}],
          'clusters': [{'name': 'lab', 'cluster': {'server': 'https://cluster.example'}}],
          'users': [{'name': 'reader', 'user': {'token': 'private-token'}}]}
POD = {'metadata': {'uid': 'pod-uid', 'name': 'web', 'namespace': 'apps'},
       'spec': {'nodeName': 'worker', 'containers': [{'name': 'web',
                 'resources': {'requests': {'cpu': '100m', 'memory': '64Mi'}, 'limits': {'cpu': '1'}}}]},
       'status': {'phase': 'Running', 'containerStatuses': [{'name': 'web', 'ready': True,
                  'restartCount': 2, 'state': {'running': {}}}]}}
METRIC = {'metadata': {'name': 'web', 'namespace': 'apps'}, 'timestamp': '2026-10-27T10:01:00Z',
          'window': '30s', 'containers': [{'name': 'web', 'usage': {'cpu': '25000000n', 'memory': '128Mi'}}]}

class KubernetesTopologyTests(unittest.TestCase):
    def test_units_missing_zero_and_partial_container_totals(self):
        pod = t.pod_summary(POD, METRIC)
        self.assertEqual(pod['usage']['cpu_millicores'], 25)
        self.assertEqual(pod['usage']['memory_bytes'], 128 * 1024 ** 2)
        self.assertEqual(pod['containers'][0]['requests']['cpu_millicores'], 100)
        self.assertIsNone(pod['containers'][0]['limits']['memory_bytes'])
        self.assertEqual(t.quantity('0'), 0)
        self.assertEqual(t.quantity('1e3'), 1000)
        self.assertEqual(t.quantity('5Gi'), 5 * 1024 ** 3)
        for value in (None, 'bad', 'NaN', 'Infinity', '-1'):
            self.assertIsNone(t.quantity(value))
        self.assertIsNone(t.pod_summary(POD)['usage']['cpu_millicores'])
        partial = copy.deepcopy(POD)
        partial['spec']['containers'].append({'name': 'sidecar'})
        partial['status']['containerStatuses'].append({'name': 'sidecar', 'state': {'running': {}}})
        self.assertIsNone(t.pod_summary(partial, METRIC)['usage']['cpu_millicores'])

    def test_running_phase_does_not_imply_readiness(self):
        pod = copy.deepcopy(POD)
        pod['status']['containerStatuses'][0].update(ready=False, state={'waiting': {'reason': 'CrashLoopBackOff'}})
        result = t.pod_summary(pod)
        self.assertEqual((result['phase'], result['ready'], result['restarts']), ('Running', 0, 2))
        self.assertEqual(result['containers'][0]['reason'], 'CrashLoopBackOff')
        pod['metadata']['deletionTimestamp'] = 'now'
        self.assertEqual(t.pod_summary(pod)['phase'], 'Terminating')

    def test_namespace_and_kubeconfig_validation(self):
        self.assertEqual(t.safe_kubeconfig(CONFIG)['current-context'], 'lab')
        for value in ('../secrets', '', 'Invalid', 'a' * 64):
            with self.assertRaises(t.TopologyError): t.validate_namespace(value)
        for key in ('exec', 'auth-provider', 'tokenFile', 'client-key', 'client-certificate'):
            bad = copy.deepcopy(CONFIG)
            bad['users'][0]['user'][key] = {'command': 'do-not-run'}
            with self.subTest(key=key), self.assertRaises(t.TopologyError): t.safe_kubeconfig(bad)
        for config in (None, {}, {'current-context': 'missing'}, {'current-context': 'x', 'contexts': None}):
            with self.assertRaises(t.TopologyError): t.safe_kubeconfig(config)
        bad = copy.deepcopy(CONFIG)
        bad['clusters'][0]['cluster']['certificate-authority'] = '/private/file'
        with self.assertRaises(t.TopologyError): t.safe_kubeconfig(bad)

    def test_uploaded_kubeconfig_path_and_symlink_boundaries(self):
        current = os.getcwd()
        with tempfile.TemporaryDirectory() as directory:
            try:
                os.chdir(directory)
                Path('creds').mkdir()
                Path('creds/config').write_text(json.dumps(CONFIG))
                Path('private').write_text('private')
                Path('creds/link').symlink_to(Path('private').resolve())
                self.assertEqual(t.stored_kubeconfig({'credentials': 'config'}), CONFIG)
                for path in ('../private', 'link', 'missing'):
                    with self.assertRaises(t.TopologyError): t.stored_kubeconfig({'credentials': path})
                self.assertIsNone(t.stored_kubeconfig({}))
            finally:
                os.chdir(current)

    def api(self, failures=None):
        responses = {
            '/api/v1/pods': {'items': [POD]}, '/api/v1/namespaces/apps/pods': {'items': [POD]},
            '/api/v1/nodes': {'items': [{'metadata': {'name': 'worker'}, 'status': {
                'conditions': [{'type': 'Ready', 'status': 'True'}], 'allocatable': {'cpu': '4', 'memory': '8Gi'}}}]},
            '/apis/metrics.k8s.io': {'preferredVersion': {'version': 'v1beta1'}},
            '/apis/metrics.k8s.io/v1beta1/pods': {'items': [METRIC]},
            '/apis/metrics.k8s.io/v1beta1/namespaces/apps/pods': {'items': [METRIC]},
            '/apis/metrics.k8s.io/v1beta1/nodes': {'items': []},
        }
        def call(path, method, **kwargs):
            self.assertEqual(method, 'GET')
            self.assertEqual(kwargs['_request_timeout'], (3, 8))
            self.assertEqual(kwargs['auth_settings'], ['BearerToken'])
            if path in (failures or {}): raise ApiException(status=failures[path], reason='private-token')
            return responses[path]
        return SimpleNamespace(call_api=Mock(side_effect=call))

    def test_snapshot_whitelists_fields(self):
        result = t.snapshot(self.api(), {'id': 'cluster', 'name': 'Lab'}, '*')
        self.assertEqual(result['nodes'][0]['allocatable']['cpu_millicores'], 4000)
        self.assertEqual(result['pods'][0]['usage']['cpu_millicores'], 25)
        self.assertEqual(result['warnings'], [])
        self.assertNotIn('spec', result['pods'][0])
        self.assertNotIn('private-token', json.dumps(result))

    def test_optional_node_and_metric_failures_keep_pods(self):
        result = t.snapshot(self.api({'/api/v1/nodes': 403, '/apis/metrics.k8s.io': 404}), {'id': 'c', 'name': 'Lab'}, '*')
        self.assertEqual(result['pods'][0]['name'], 'web')
        self.assertIsNone(result['pods'][0]['usage']['memory_bytes'])
        self.assertFalse(result['nodes'][0]['reported'])
        self.assertIsNone(result['nodes'][0]['ready'])
        self.assertEqual(len(result['warnings']), 2)
        self.assertNotIn('private-token', json.dumps(result))

    def test_namespace_fallback_and_denial(self):
        result = t.snapshot(self.api({'/api/v1/pods': 403}), {'id': 'c', 'name': 'Lab', 'namespace': 'apps'}, '*')
        self.assertEqual(result['namespace'], 'apps')
        self.assertIn('registered namespace', result['warnings'][0])
        with self.assertRaises(t.TopologyError):
            t.snapshot(self.api({'/api/v1/namespaces/apps/pods': 403}), {'id': 'c', 'name': 'Lab'}, 'apps')

    def test_pagination_and_unscheduled_pods(self):
        api = self.api()
        original = api.call_api.side_effect
        pending = copy.deepcopy(POD)
        pending['metadata'].update(name='pending', uid='pending')
        pending['spec'].pop('nodeName')
        pending['status'] = {'phase': 'Pending'}
        def call(path, method, **kwargs):
            if path == '/api/v1/pods':
                return {'items': [pending]} if ('continue', 'next') in kwargs['query_params'] else {'items': [POD], 'metadata': {'continue': 'next'}}
            return original(path, method, **kwargs)
        api.call_api.side_effect = call
        result = t.snapshot(api, {'id': 'c', 'name': 'c'}, '*')
        self.assertEqual(len(result['pods']), 2)
        self.assertIsNone(result['pods'][1]['node'])

    def test_client_configuration_is_isolated_and_retries_are_bounded(self):
        from kubernetes.client import Configuration
        default = Configuration.get_default_copy().host
        with patch.object(t, 'snapshot', return_value={'pods': []}) as snapshot:
            t.cluster_snapshot({'id': 'c', 'name': 'Lab'}, CONFIG)
            api = snapshot.call_args.args[0]
            self.assertEqual(api.configuration.host, 'https://cluster.example')
            self.assertEqual(api.configuration.retries, 0)
            self.assertEqual(api.configuration.auth_settings()['BearerToken']['value'], 'Bearer private-token')
        self.assertEqual(Configuration.get_default_copy().host, default)

    def test_real_sdk_transport_authentication_pagination_and_denial(self):
        configuration = t.client.Configuration()
        t.config.load_kube_config_from_dict(CONFIG, client_configuration=configuration, persist_config=False)
        calls = []
        def transport(method, url, **kwargs):
            self.assertEqual(method, 'GET')
            headers = {key.lower(): value for key, value in kwargs['headers'].items()}
            self.assertEqual(headers['authorization'], 'Bearer private-token')
            path = urlsplit(url).path
            query = parse_qs(urlsplit(url).query) or dict(kwargs.get('fields') or [])
            calls.append(path)
            status = 200
            if path == '/api/v1/pods':
                status, data = 403, {'message': 'private-token'}
            elif path == '/api/v1/namespaces/apps/pods':
                self.assertIn('limit', query)
                data = {'items': []} if 'continue' in query else {'items': [POD], 'metadata': {'continue': 'next+/='}}
                if 'continue' in query:
                    token = query['continue']
                    self.assertEqual(token[0] if isinstance(token, list) else token, 'next+/=')
            elif path == '/apis/metrics.k8s.io':
                status, data = 404, {}
            else:
                data = {'items': []}
            return HTTPResponse(body=json.dumps(data).encode(), status=status,
                                headers={'content-type': 'application/json'}, reason='test')
        with t.client.ApiClient(configuration) as api:
            with patch.object(api.rest_client.pool_manager, 'request', side_effect=transport):
                result = t.snapshot(api, {'id': 'c', 'name': 'Lab', 'namespace': 'apps'}, '*')
        self.assertEqual(result['namespace'], 'apps')
        self.assertEqual(len(result['pods']), 1)
        self.assertEqual(calls.count('/api/v1/namespaces/apps/pods'), 2)
        self.assertNotIn('private-token', json.dumps(result))

    def test_route_lookup_namespace_validation_and_error_redaction(self):
        mongo = MongoStub({'k8sclusters': [{'_id': 'db', 'id': 'cluster', 'name': 'Lab', 'credentials': CONFIG}]})
        fetch = Mock(return_value={'nodes': [], 'pods': [], 'warnings': []})
        route = load_method('katana-nbi/katana/api/k8s.py', 'topology', {
            'mongoUtils': mongo, 'request': request, 'jsonify': jsonify, 'logger': Mock(),
            'TopologyError': t.TopologyError, 'validate_namespace': t.validate_namespace,
            'stored_kubeconfig': t.stored_kubeconfig, 'cluster_snapshot': fetch,
        })
        app = Flask(__name__)
        with app.test_request_context('/?namespace=apps'):
            self.assertEqual(route(None, 'cluster')[1], 200)
            fetch.assert_called_once_with(mongo.collections['k8sclusters'][0], CONFIG, 'apps')
            self.assertEqual(route(None, 'missing')[1], 404)
        with app.test_request_context('/?namespace=../secret'):
            self.assertEqual(route(None, 'cluster')[1], 400)
        fetch.side_effect = RuntimeError('private-token')
        with app.test_request_context('/'):
            response, status = route(None, 'cluster')
            self.assertEqual(status, 502)
            self.assertNotIn('private-token', response.get_data(as_text=True))

if __name__ == '__main__': unittest.main()
