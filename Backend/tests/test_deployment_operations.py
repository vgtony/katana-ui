"""Deployment submission/recovery regressions; remote writes are always mocked."""
import copy
from concurrent.futures import ThreadPoolExecutor
import os
import time
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import Mock
from urllib.parse import quote, urlsplit

from flask import Flask, jsonify, request
from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError, PyMongoError
from pymongo.write_concern import WriteConcern
from pymongo.read_concern import ReadConcern
import requests
import yaml

from katana.shared_utils import deploymentOperations as ops
from tests.test_nest_helm import load_method

PATH = 'katana-nbi/katana/api/k8s.py'
KEY = 'cd35cb3f-35b6-46f8-84f9-d311b00e45f0'
NFVO = dict(_id='registered-b', id='b', tenantname='project-b', nfvoip='b.invalid',
            nfvousername='operator', nfvopassword='must-not-leak')
DATA = dict(request_id=KEY, nfvo_id='b', nsName='test', nsdId='nsd', vimAccountId='vim')


def record():
    collection = Mock()
    value, _ = ops.claim(collection, KEY, DATA, NFVO, 'vim')
    return value


class DeploymentOperationsTests(unittest.TestCase):
    def setUp(self):
        self.collection = Mock()
        self.collection.find_one.return_value = None
        self.collection.update_one.return_value.matched_count = 1
        self.remote = SimpleNamespace(post=Mock(return_value=Mock(status_code=202,
            headers={'Location': '/osm/nslcm/v1/ns_instances/instance-b'}, json=lambda: {})),
            get=Mock(), delete=Mock(return_value=Mock(status_code=202)),
            RequestException=requests.RequestException)
        self.find_nfvo = Mock(return_value=NFVO)
        self.namespace = dict(operations=ops, mongoUtils=SimpleNamespace(k8s_operations=self.collection), request=request, jsonify=jsonify, logger=Mock(),
            _find_nfvo=self.find_nfvo, _osm_client=Mock(return_value=Mock(token='secret', verify=True)),
            _vim_account_id=Mock(return_value='vim'), requests=self.remote, os=os, time=time, quote=quote, yaml=yaml)
        self.namespace['_observe_operation'] = load_method(PATH, '_observe_operation', self.namespace)
        self.app = Flask(__name__)
        for path, name, methods in (
            ('/deploy', 'deploy', ['POST']),
            ('/operations/<operation_id>', 'get_operation', ['GET']),
            ('/deploy/<nsInstanceId>', 'get_deployment_status_by_instance', ['GET']),
            ('/deploy/<nsInstanceId>', 'delete_deployment', ['DELETE']),
        ):
            method = load_method(PATH, name, self.namespace)
            def view(method=method, **kwargs):
                return method(None, **kwargs)
            self.app.add_url_rule(path, name, view, methods=methods)
        self.client = self.app.test_client()

    def test_accepted_submission_is_durable_and_duplicate_returns_same_identity(self):
        response = self.client.post('/deploy', json=DATA)
        self.assertEqual(response.status_code, 202)
        result = response.json
        self.assertEqual((result['operation_id'], result['nfvo_id'], result['phase']), (KEY, 'b', 'pending'))
        self.assertEqual(result['osm_instance_id'], 'instance-b')
        stored = self.collection.insert_one.call_args.args[0]
        self.assertNotIn('must-not-leak', str(stored))
        self.assertNotIn('fingerprint', result)
        self.assertEqual(self.remote.post.call_args.kwargs['timeout'], (5, 60))
        self.assertFalse(self.remote.post.call_args.kwargs['allow_redirects'])
        self.assertEqual(self.remote.post.call_args.kwargs['headers']['Accept'], 'application/json')
        self.collection.find_one.return_value = stored
        # Retry/restart does not even re-authenticate against the external NFVO.
        duplicate = self.client.post('/deploy', json=DATA)
        self.assertEqual(duplicate.json['operation_id'], KEY)
        self.assertEqual(self.remote.post.call_count, 1)
        self.assertEqual(self.namespace['_osm_client'].call_count, 1)
        conflict = self.client.post('/deploy', json={**DATA, 'nsName': 'different'})
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(self.remote.post.call_count, 1)

    def test_unknown_timeout_cannot_be_retried_as_a_second_remote_create(self):
        self.remote.post.side_effect = requests.Timeout()
        response = self.client.post('/deploy', json=DATA)
        self.assertEqual((response.status_code, response.json['phase']), (202, 'unknown'))
        self.collection.find_one.return_value = self.collection.insert_one.call_args.args[0]
        again = self.client.post('/deploy', json=DATA)
        self.assertEqual(again.json['submission_state'], 'unknown')
        self.assertEqual(self.remote.post.call_count, 1)

    def test_database_failure_before_write_prevents_remote_call_and_after_write_is_uncertain(self):
        self.collection.insert_one.side_effect = PyMongoError('unavailable')
        self.assertEqual(self.client.post('/deploy', json=DATA).status_code, 503)
        self.remote.post.assert_not_called()
        self.collection.insert_one.side_effect = None
        self.collection.update_one.side_effect = PyMongoError('unavailable')
        response = self.client.post('/deploy', json=DATA)
        self.assertEqual((response.status_code, response.json['submission_state']), (202, 'unknown'))
        self.remote.post.assert_called_once()

    def test_ambiguous_upstream_failures_and_malformed_acceptance_do_not_claim_success(self):
        for code in (302, 408, 409, 429, 500, 504):
            with self.subTest(code=code):
                self.remote.post.return_value.status_code = code
                self.assertEqual(self.client.post('/deploy', json=DATA).json['phase'], 'unknown')
        self.remote.post.return_value.status_code = 400
        self.assertEqual(self.client.post('/deploy', json=DATA).json['submission_state'], 'rejected')
        self.remote.post.return_value = Mock(status_code=202, headers={}, json=lambda: ['bad'])
        self.assertEqual(self.client.post('/deploy', json=DATA).json['phase'], 'unknown')

    def test_header_and_body_identity_validation(self):
        yaml_response = Mock(headers={}, text='id: abc\n')
        yaml_response.json.side_effect = ValueError()
        self.assertEqual(ops.instance_id(yaml_response), 'abc')
        operation_yaml = Mock(headers={}, text='id: abc\nnslcmop_id: op-1\n')
        operation_yaml.json.side_effect = ValueError()
        self.assertEqual(ops.submission_identity(operation_yaml), ('abc', 'op-1'))
        for body in ({'id': 'abc'}, {'_id': 'abc'}, {'nsInstanceId': 'abc'}):
            self.assertEqual(ops.instance_id(Mock(headers={}, json=lambda: body)), 'abc')
        self.assertIsNone(ops.instance_id(Mock(headers={'Location': '/osm/nslcm/v1/ns_instances/abc'},
                                             json=lambda: {'id': 'different'})))
        self.assertIsNone(ops.instance_id(Mock(headers={}, json=lambda: {'id': '../escape'})))
        for value in ('bad', 42, {}, None):
            if value is None:
                self.assertTrue(ops.request_id({'request_id': None}))
            else:
                with self.assertRaises(ops.OperationError): ops.request_id({'request_id': value})

    def test_create_operation_id_is_bound_and_later_occurrence_cannot_replace_it(self):
        self.remote.post.return_value = Mock(status_code=202,
            headers={'Location': '/osm/nslcm/v1/ns_instances/instance-b'},
            json=lambda: {'id': 'instance-b', 'nslcmop_id': 'authoritative-op'})
        created = self.client.post('/deploy', json=DATA)
        self.assertEqual(created.json['osm_operation_id'], 'authoritative-op')
        stored = self.collection.insert_one.call_args.args[0]
        self.assertEqual(stored['osm_operation_id'], 'authoritative-op')

        self.collection.find_one.return_value = stored
        self.collection.update_one.reset_mock()
        self.remote.get.return_value = Mock(status_code=200, json=lambda: [
            dict(id='later-op', nsInstanceId='instance-b', lcmOperationType='instantiate',
                 operationState='COMPLETED', startTime=20),
        ])
        observed = self.client.get('/operations/' + KEY)
        self.assertEqual(observed.json['osm_operation_id'], 'authoritative-op')
        self.assertEqual(observed.json['phase'], 'pending')
        self.collection.update_one.assert_not_called()

    def test_invalid_optional_create_operation_id_is_not_stored(self):
        self.remote.post.return_value = Mock(status_code=202,
            headers={'Location': '/osm/nslcm/v1/ns_instances/instance-b'},
            json=lambda: {'id': 'instance-b', 'nslcmop_id': '../invalid'})
        response = self.client.post('/deploy', json=DATA)
        stored = self.collection.insert_one.call_args.args[0]
        self.assertEqual(response.status_code, 202)
        self.assertNotIn('osm_operation_id', stored)

    def test_accepted_messages_follow_operation_phase(self):
        for phase, phrase in (
                ('pending', 'OSM accepted the request'),
                ('failed', 'Inspect the remaining resources'),
                ('completed', 'OSM completed the operation'),
                ('unknown', 'Reconcile this operation')):
            with self.subTest(phase=phase):
                self.assertIn(phrase, ops.public({'_id': KEY, 'submission_state': 'accepted',
                    'phase': phase, 'created_at': time.time()})['message'])

    def test_atomic_claim_loser_recovers_winner_and_changed_payload_conflicts(self):
        saved = record()
        self.collection.insert_one.side_effect = DuplicateKeyError('duplicate')
        self.collection.find_one.return_value = saved
        self.assertEqual(ops.claim(self.collection, KEY, DATA, NFVO, 'vim'), (saved, False))
        with self.assertRaises(ops.OperationError):
            ops.claim(self.collection, KEY, {**DATA, 'nsName': 'different'}, NFVO, 'vim')

    def test_crashed_submission_is_recoverable_without_guessing_remote_success(self):
        saved = record()
        saved['created_at'] = time.time() - 121
        self.collection.find_one.return_value = saved
        response = self.client.get('/operations/' + KEY)
        self.assertEqual(response.json['submission_state'], 'unknown')
        self.remote.get.assert_not_called()
        self.remote.post.assert_not_called()

    def test_status_uses_saved_owner_and_correct_instantiation_not_another_operation(self):
        saved = {**record(), 'osm_instance_id': 'instance-b', 'submission_state': 'accepted'}
        self.collection.find_one.return_value = saved
        self.collection.update_one.side_effect = lambda query, update: saved.update(update['$set'])
        self.remote.get.return_value = Mock(status_code=200, json=lambda: [
            dict(id='unrelated', nsInstanceId='another', lcmOperationType='instantiate', operationState='FAILED'),
            dict(id='terminate', nsInstanceId='instance-b', lcmOperationType='terminate', operationState='FAILED'),
            dict(id='instantiate', nsInstanceId='instance-b', lcmOperationType='instantiate', operationState='COMPLETED'),
        ])
        response = self.client.get('/operations/' + KEY)
        self.assertEqual(response.json['phase'], 'completed')
        self.assertEqual(response.json['osm_operation_id'], 'instantiate')
        self.find_nfvo.assert_called_once_with('registered-b')
        self.assertTrue(self.remote.get.call_args.args[0].startswith('https://b.invalid/'))
        self.assertEqual(self.remote.get.call_args.kwargs['params'], {'nsInstanceId': 'instance-b'})
        self.remote.post.assert_not_called()

    def test_unbound_status_selects_earliest_instantiation(self):
        saved = {**record(), 'osm_instance_id': 'instance-b', 'submission_state': 'accepted'}
        self.collection.find_one.return_value = saved
        self.collection.update_one.side_effect = lambda query, update: saved.update(update['$set'])
        result = ops.observe(self.collection, saved, [
            dict(id='earliest', nsInstanceId='instance-b', lcmOperationType='instantiate',
                 operationState='FAILED', startTime=10),
            dict(id='later', nsInstanceId='instance-b', lcmOperationType='instantiate',
                 operationState='COMPLETED', startTime=20),
        ], 1)
        self.assertEqual((result['osm_operation_id'], result['phase']), ('earliest', 'failed'))
        query = self.collection.update_one.call_args.args[0]
        self.assertEqual(query['osm_operation_id'], {'$exists': False})

    def test_bound_status_never_switches_and_missing_bound_preserves_state(self):
        bound = {**record(), 'osm_instance_id': 'instance-b', 'osm_operation_id': 'first',
                 'osm_operation_state': 'FAILED', 'phase': 'failed'}
        later = dict(id='later', nsInstanceId='instance-b', lcmOperationType='instantiate',
                     operationState='COMPLETED', startTime=20)
        self.collection.find_one.return_value = bound
        result = ops.observe(self.collection, bound, [later], 2)
        self.assertEqual((result['osm_operation_id'], result['osm_operation_state'], result['phase']),
                         ('first', 'FAILED', 'failed'))
        self.collection.update_one.assert_not_called()

        first = dict(id='first', nsInstanceId='instance-b', lcmOperationType='instantiate',
                     operationState='COMPLETED', startTime=10)
        self.collection.update_one.side_effect = lambda query, update: bound.update(update['$set'])
        result = ops.observe(self.collection, bound, [first, later], 3)
        self.assertEqual(result['osm_operation_id'], 'first')
        self.assertEqual(self.collection.update_one.call_args.args[0]['osm_operation_id'], 'first')

    def test_ambiguous_or_malformed_unbound_instantiations_do_not_write(self):
        saved = {**record(), 'osm_instance_id': 'instance-b'}
        candidates = [
            [dict(id='a', startTime=float('nan')), dict(id='b', startTime=2)],
            [dict(id='a', startTime=float('inf')), dict(id='b', startTime=2)],
            [dict(id='a', startTime=True), dict(id='b', startTime=2)],
            [dict(id='a'), dict(id='b', startTime=2)],
            [dict(id='a', startTime=1), dict(id='b', startTime=1)],
            [dict(id='a', startTime='1'), dict(id='b', startTime=2)],
        ]
        for pair in candidates:
            with self.subTest(pair=pair):
                self.collection.update_one.reset_mock()
                with self.assertRaises(ops.OperationError) as raised:
                    ops.observe(self.collection, saved, [
                        {**item, 'nsInstanceId': 'instance-b', 'lcmOperationType': 'instantiate',
                         'operationState': 'COMPLETED'} for item in pair
                    ], 1)
                self.assertEqual(raised.exception.status, 502)
                self.collection.update_one.assert_not_called()

    def test_invalid_selected_operation_id_is_rejected_before_write(self):
        saved = {**record(), 'osm_instance_id': 'instance-b'}
        with self.assertRaises(ops.OperationError) as raised:
            ops.observe(self.collection, saved, [dict(id='../bad', nsInstanceId='instance-b',
                lcmOperationType='instantiate', operationState='COMPLETED')], 1)
        self.assertEqual(raised.exception.status, 502)
        self.collection.update_one.assert_not_called()

    def test_status_preserves_yaml_response_support_and_rejects_malformed_data(self):
        saved = {**record(), 'osm_instance_id': 'instance-b', 'submission_state': 'accepted'}
        self.collection.find_one.return_value = saved
        self.collection.update_one.side_effect = lambda query, update: saved.update(update['$set'])
        response = Mock(status_code=200, text=yaml.safe_dump([
            dict(id='instantiate', nsInstanceId='instance-b', lcmOperationType='instantiate', operationState='COMPLETED'),
        ]))
        response.json.side_effect = ValueError()
        self.remote.get.return_value = response
        result = self.client.get('/operations/' + KEY)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json['phase'], 'completed')
        self.assertEqual(self.remote.get.call_args.kwargs['headers']['Accept'], 'application/json')
        for text in ('[invalid', 'unstructured error', 'error: unavailable'):
            response.text = text
            self.collection.update_one.reset_mock()
            self.assertEqual(self.client.get('/operations/' + KEY).status_code, 502)
            self.collection.update_one.assert_not_called()

    def test_owner_drift_and_legacy_instances_fail_closed(self):
        saved = {**record(), 'osm_instance_id': 'instance-b'}
        self.collection.find_one.return_value = saved
        for nfvo in (None, {**NFVO, 'tenantname': 'changed'}, {**NFVO, 'nfvoip': 'changed'}):
            self.find_nfvo.return_value = nfvo
            self.assertEqual(self.client.get('/operations/' + KEY).status_code, 409)
        self.remote.get.assert_not_called()
        self.collection.find.return_value.limit.return_value = []
        self.assertEqual(self.client.delete('/deploy/legacy').status_code, 409)
        self.remote.delete.assert_not_called()

    def test_delete_uses_bound_nfvo_and_returns_acceptance_not_completion(self):
        saved = {**record(), 'osm_instance_id': 'instance-b'}
        self.collection.find.return_value.limit.return_value = [saved]
        response = self.client.delete('/deploy/instance-b')
        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.json['nfvo_id'], 'b')
        self.assertEqual(self.remote.delete.call_args.args[0],
                         'https://b.invalid/osm/nslcm/v1/ns_instances_content/instance-b')
        self.remote.delete.side_effect = requests.Timeout()
        self.assertEqual(self.client.delete('/deploy/instance-b').status_code, 502)


@unittest.skipUnless(os.getenv('KATANA_TEST_MONGO_URI'), 'Opt-in disposable MongoDB required')
class MongoDeploymentConcurrencyTests(unittest.TestCase):
    def test_concurrent_claims_restart_and_out_of_order_observations(self):
        uri = os.environ['KATANA_TEST_MONGO_URI']
        self.assertIn(urlsplit(uri).hostname, ('localhost', '127.0.0.1', '::1'))
        client = MongoClient(uri, serverSelectionTimeoutMS=3000)
        database = 'katana_operation_test_' + uuid.uuid4().hex
        collection = client[database].get_collection('operations',
            write_concern=WriteConcern(w='majority', j=True, wtimeout=10000),
            read_concern=ReadConcern('majority'))
        try:
            client.admin.command('ping')
            with ThreadPoolExecutor(max_workers=12) as executor:
                results = list(executor.map(lambda _: ops.claim(collection, KEY, DATA, NFVO, 'vim'), range(12)))
            self.assertEqual(sum(created for _, created in results), 1)
            self.assertEqual(collection.count_documents({}), 1)
            restarted = MongoClient(uri, serverSelectionTimeoutMS=3000)
            try:
                saved = ops.existing(restarted[database].operations, KEY, DATA)
                self.assertEqual(saved['nfvo_id'], 'b')
            finally:
                restarted.close()
            saved.update(osm_instance_id='instance', submission_state='accepted')
            collection.update_one({'_id': KEY}, {'$set': saved})
            base = dict(nsInstanceId='instance', lcmOperationType='instantiate', id='op')
            ops.observe(collection, saved, [{**base, 'operationState': 'COMPLETED'}], 2)
            bound = collection.find_one({'_id': KEY})
            result = ops.observe(collection, bound, [{**base, 'operationState': 'PROCESSING'}], 1)
            self.assertEqual(result['phase'], 'completed')
            unbound = {**saved, 'osm_operation_id': None}
            collection.update_one({'_id': KEY}, {'$unset': {'osm_operation_id': ''}})
            unbound.pop('osm_operation_id', None)
            collection.update_one({'_id': KEY}, {'$unset': {'observation_started_at': ''}})
            ops.observe(collection, unbound, [{**base, 'id': 'winner', 'operationState': 'FAILED'}], 2)
            stale = ops.observe(collection, unbound,
                                [{**base, 'id': 'stale', 'operationState': 'COMPLETED'}], 3)
            self.assertEqual((stale['osm_operation_id'], stale['phase']), ('winner', 'failed'))
        finally:
            client.drop_database(database)
            client.close()
