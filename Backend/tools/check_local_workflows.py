"""Opt-in Flask/MongoDB/Kafka checks on EMPTY, disposable local services only.

Run in the NBI image on an internal Docker network with aliases mongo/kafka,
current backend mounted at /workspace and PYTHONPATH=/workspace/katana-nbi.
Set KATANA_DISPOSABLE_CHECKS=1. External adapters are simulated, never contacted.
"""
import json
import os
from unittest.mock import patch

assert os.environ.get('KATANA_DISPOSABLE_CHECKS') == '1', 'Disposable environment required'

from katana.app import create_app
from katana.shared_utils.mongoUtils import mongoUtils as mongo
from katana.shared_utils.kafkaUtils import kafkaUtils as kafka
from katana.shared_utils.emsUtils.amarisoft_sliceUtils import AmarisoftSliceClient
from katana.api.slice import queued_slice_record

assert not any(mongo.db[name].count_documents({}) for name in mongo.db.list_collection_names()), 'Database must be empty'
app = create_app()
app.config['TESTING'] = True
client = app.test_client()


def call(method, path, expected=200, **kwargs):
    response = getattr(client, method)(path, **kwargs)
    assert response.status_code == expected, (method, path, response.status_code, response.get_data(as_text=True)[:200])
    return response


for path in ('vim', 'nfvo', 'wim', 'ems', 'function', 'policy', 'location', 'k8s',
             'slice', 'slice/observability', 'amarisoft-slices', 'proxmox/cluster'):
    call('get', '/api/' + path)
call('post', '/api/proxmox/tasks', 404, json={})
call('get', '/api/helm/charts', 503)
call('post', '/api/k8s/deploy', 400, json={})
call('post', '/api/slice', 400, json={})
call('delete', '/api/slice/missing', 404)
print('PASS Flask routes, empty inventories, invalid requests, removed monitoring endpoint')

mongo.add('nfvo', {'_id': 'local-osm', 'id': 'local-osm', 'name': 'Disposable OSM', 'type': 'osm', 'created_at': 1, 'ip': 'osm.invalid', 'username': 'test', 'password': 'must-not-leak'})
mongo.add('k8sclusters', {'_id': 'local-cluster', 'id': 'local-cluster', 'name': 'Disposable cluster',
                        'nfvo_id': 'local-osm', 'vim_account': 'account', 'osm_id': 'remote-id', 'created_at': 1})
for _ in range(2):
    call('patch', '/api/k8s/local-cluster/location', json={'location': 'edge'})
cluster = mongo.get('k8sclusters', 'local-cluster')
assert cluster['location'] == 'edge' and cluster['osm_id'] == 'remote-id'
assert mongo.find('location', {'id': 'edge'})['vims'] == ['local-cluster']
assert 'must-not-leak' not in call('get', '/api/nfvo').get_data(as_text=True)
assert 'edge' in call('get', '/api/k8s').get_data(as_text=True)
print('PASS persisted cluster location, repeated repair, refreshed inventory, credential exclusion')

payload = dict(name='local-slice', s_nssai=dict(sst=1, sd='000001'), plmn='00101', dnn='internet',
               targets={'ran': {'url': 'http://ran.invalid'}, 'core': {'url': 'http://core.invalid'}}, dry_run=True)
with patch.object(AmarisoftSliceClient, 'create_slice') as create, patch.object(AmarisoftSliceClient, 'delete_slice') as delete:
    call('post', '/api/amarisoft-slices/preview', json=payload)
    assert mongo.count('amarisoft_slices') == 0
    create.assert_not_called()
    record = json.loads(call('post', '/api/amarisoft-slices', 201, json=payload).data)
    assert record['status'] == 'planned' and record['s_nssai']['sd'] == '000001'
    create.assert_not_called()
    path = '/api/amarisoft-slices/' + record['_id']
    create.side_effect = [{'ok': True}, {'ok': False, 'error': 'simulated outage'}]
    call('post', path + '/apply', 502)
    assert mongo.get('amarisoft_slices', record['_id'])['status'] == 'error'
    create.side_effect = None
    create.return_value = {'ok': True}
    call('post', path + '/apply')
    assert mongo.get('amarisoft_slices', record['_id'])['status'] == 'running'
    delete.side_effect = [{'ok': True}, {'ok': False}]
    call('delete', path, 502)
    assert mongo.get('amarisoft_slices', record['_id'])
    delete.side_effect = None
    delete.return_value = {'ok': True}
    call('delete', path)
    assert mongo.get('amarisoft_slices', record['_id']) is None
print('PASS Amarisoft non-mutating preview, persisted plan, partial apply/delete, recovery')

kafka.create_topic('slice')
consumer = kafka.create_consumer('slice')
mongo.add('slice', queued_slice_record({'_id': 'local-slice', 'slice_name': 'Disposable', 'ns_list': []}))
call('get', '/api/slice/local-slice')
call('delete', '/api/slice/local-slice')
messages = []
for _ in range(10):
    messages.extend(record.value for records in consumer.poll(timeout_ms=1000).values() for record in records)
    if messages:
        break
consumer.close()
assert any(message.get('action') == 'delete' and message.get('message') == 'local-slice' for message in messages), messages
assert mongo.get('slice', 'local-slice'), 'Acceptance must not erase the persisted record'
print('PASS real Flask → Kafka delivery and readable MongoDB state (manager execution not simulated as proof)')
print('LOCAL INTEGRATION CHECKS PASSED; no live infrastructure or service-functionality claim')
