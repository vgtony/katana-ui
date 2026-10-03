import copy
import io
import re
import time
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import Mock, patch
from tests.test_unified_infrastructure import load_definitions, MongoStub, PymongoStub
from tests.test_nest_helm import load_method


class KubernetesLocationTests(unittest.TestCase):
    def setUp(self):
        self.cluster = {'_id': 'cluster-db', 'id': 'cluster', 'name': 'Existing',
                        'nfvo_id': 'osm', 'vim_account': 'account', 'osm_id': 'remote-cluster'}
        self.mongo = MongoStub({'nfvo': [{'id': 'osm'}], 'k8sclusters': [self.cluster]})
        self.functions = load_definitions('katana-nbi/katana/shared_utils/infrastructureUtils.py',
            {'InfrastructureError', 'kubernetes_location', 'set_kubernetes_location', '_ensure_location', '_add_location_target'},
            {'mongoUtils': self.mongo, 're': re, 'uuid': uuid, 'time': time, 'pymongo': PymongoStub})
        self.save = self.functions['set_kubernetes_location']

    def test_legacy_cluster_becomes_a_valid_nest_target_without_changing_osm_ids(self):
        saved = self.save(self.cluster, ' EDGE ')
        self.assertEqual(saved['location'], 'edge')
        self.assertEqual(saved['type'], 'kubernetes')
        self.assertEqual(saved['osm_id'], 'remote-cluster')
        self.assertEqual(saved['vim_account'], 'account')
        self.save(saved, 'edge')
        self.assertEqual(self.mongo.collections['location'][0]['vims'], ['cluster'])
        self.mongo.collections['nsd'] = [{'nsd-id': 'nsd', 'deployment_runtime': 'kubernetes', 'nfvo_id': 'osm'}]
        validate = load_method('katana-nbi/katana/api/slice.py', '_validate_deployment_targets', {'mongoUtils': self.mongo})
        self.assertEqual(validate(None, {'service_descriptor': {'ns_list': [
            {'nsd-id': 'nsd', 'nfvo-id': 'osm', 'target': 'cluster', 'placement': 'edge'}
        ]}}), ('kubernetes', None))

    def test_invalid_locations_and_relocation_fail_without_changing_record(self):
        for value in (None, {}, '', ' ', 'a/b', 'a' * 65):
            with self.subTest(value=value), self.assertRaises(self.functions['InfrastructureError']):
                self.save(self.cluster, value)
        saved = self.save(self.cluster, 'edge')
        before = copy.deepcopy(self.mongo.collections)
        with self.assertRaises(self.functions['InfrastructureError']):
            self.save(saved, 'core')
        self.assertEqual(self.mongo.collections, before)

    def test_missing_owner_or_account_cannot_be_repaired_by_inventing_links(self):
        for field in ('nfvo_id', 'vim_account'):
            broken = {**self.cluster, field: ''}
            with self.assertRaises(self.functions['InfrastructureError']):
                self.save(broken, 'edge')
        self.assertNotIn('location', self.mongo.collections)

    def test_standard_registration_saves_type_and_location(self):
        data = {'name': 'New cluster', 'nfvo_id': 'osm', 'location': 'EDGE',
                'vim_account': 'account', 'credentials': 'kubeconfig.yaml', 'k8s_version': 'v1.30'}
        osm = SimpleNamespace(nfvo_id='osm', ip='osm.example', token='token', verify=True, getToken=Mock())
        response = SimpleNamespace(status_code=201, text='response')
        namespace = {**self.functions, 'mongoUtils': self.mongo, 'request': SimpleNamespace(is_json=True, json=data, content_type='application/json'),
            'jsonify': lambda value: value, 'logger': Mock(), 'pymongo': PymongoStub,
            '_new_cluster_identity': lambda: {'_id': 'new-db', 'id': 'new-cluster'},
            '_osm_client': lambda **kwargs: osm, '_vim_account_id': lambda *args: 'account',
            'requests': SimpleNamespace(post=Mock(return_value=response)),
            'os': SimpleNamespace(path=SimpleNamespace(join=lambda *args: '/fake/kubeconfig', exists=lambda *args: True)),
            'yaml': SimpleNamespace(safe_load=lambda value: {'id': 'remote-new'} if value == 'response' else {'clusters': []})}
        post = load_method('katana-nbi/katana/api/k8s.py', 'post', namespace)
        with patch('builtins.open', return_value=io.StringIO('kubeconfig')):
            result, status = post(SimpleNamespace(req_fields=['name', 'vim_account', 'credentials', 'k8s_version'], create_dashboard_for_cluster=Mock()))
        self.assertEqual(status, 201, result)
        saved = self.mongo.find('k8sclusters', {'id': 'new-cluster'})
        self.assertEqual((saved['type'], saved['location']), ('kubernetes', 'edge'))
        self.assertIn('new-cluster', self.mongo.collections['location'][0]['vims'])
        self.assertNotIn('location', namespace['requests'].post.call_args.kwargs['json'])


if __name__ == '__main__':
    unittest.main()
