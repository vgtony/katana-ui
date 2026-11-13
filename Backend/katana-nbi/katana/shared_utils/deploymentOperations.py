"""Durable Kubernetes submission identities; OSM remains the lifecycle authority."""
import hashlib
import json
import re
import time
import uuid
from urllib.parse import urlsplit
import yaml

from pymongo.errors import DuplicateKeyError, PyMongoError


class OperationError(Exception):
    def __init__(self, message, status=409):
        super().__init__(message)
        self.status = status


def request_id(data):
    value = data.get('request_id')
    if value is None:
        return str(uuid.uuid4())
    try:
        if not isinstance(value, str) or str(uuid.UUID(value)) != value:
            raise ValueError()
    except (ValueError, AttributeError):
        raise OperationError('request_id must be a canonical UUID', 400)
    return value


def fingerprint(data):
    payload = {key: value for key, value in data.items() if key != 'request_id'}
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(',', ':'),
                                     allow_nan=False).encode()).hexdigest()


def existing(collection, key, data):
    record = collection.find_one({'_id': key})
    if record and record['fingerprint'] != fingerprint(data):
        raise OperationError('This request_id was already used for different deployment input')
    return record


def claim(collection, key, data, nfvo, vim_id):
    """MongoDB's built-in unique _id index arbitrates across workers/replicas."""
    now = time.time()
    record = dict(_id=key, fingerprint=fingerprint(data), nfvo_id=nfvo['id'],
                  nfvo_db_id=nfvo.get('_id'), project=nfvo['tenantname'],
                  endpoint=nfvo['nfvoip'], vim_account_id=vim_id, nsd_id=data['nsdId'],
                  submission_state='submitting', phase='pending', created_at=now,
                  updated_at=now)
    try:
        collection.insert_one(record)
        return record, True
    except DuplicateKeyError:
        found = existing(collection, key, data)
        if not found:
            raise OperationError('Submission identity could not be recovered; do not resubmit', 503)
        return found, False


def public(record):
    """Expose an allowlist, never a raw request, credentials, or OSM response."""
    result = {key: record[key] for key in (
        'nfvo_id', 'submission_state', 'phase', 'created_at', 'updated_at',
        'osm_instance_id', 'osm_operation_id', 'osm_operation_state', 'observed_at',
    ) if key in record}
    result['operation_id'] = record['_id']
    if result['submission_state'] == 'submitting' and time.time() - record['created_at'] > 120:
        result.update(submission_state='unknown', phase='unknown')
    result['message'] = {
        'submitting': 'Submission is in progress. Check its status; do not submit again.',
        'accepted': 'OSM accepted the request. Workload readiness is not verified.',
        'unknown': 'Submission outcome is unknown. Reconcile this operation before deploying again.',
        'rejected': 'OSM rejected this submission.',
    }[result['submission_state']]
    result['osm_response'] = ({'id': result['osm_instance_id']}
                              if result.get('osm_instance_id') else {})
    return result


def save_submission(collection, record, **changes):
    record.update(changes, updated_at=time.time())
    try:
        result = collection.update_one({'_id': record['_id']}, {'$set': {
            **changes, 'updated_at': record['updated_at'],
        }})
        if result.matched_count != 1:
            record.update(submission_state='unknown', phase='unknown')
    except PyMongoError:
        # The original claim survives. Never turn a post-write DB failure into a retryable create.
        record.update(submission_state='unknown', phase='unknown')
    return public(record)


def instance_id(response):
    """Read supported IDs, including the documented Location header; never follow URLs."""
    candidates = []
    location = response.headers.get('Location', '')
    if isinstance(location, str):
        match = re.fullmatch(r'/osm/nslcm/v1/ns_instances(?:_content)?/([^/]+)/?',
                             urlsplit(location).path)
        if match:
            candidates.append(match.group(1))
    try:
        body = response.json()
    except ValueError:
        try:
            body = yaml.safe_load(response.text)
        except yaml.YAMLError:
            body = None
    if isinstance(body, dict):
        candidates.extend(body.get(key) for key in ('nsInstanceId', 'id', '_id'))
    valid = {value for value in candidates if isinstance(value, str)
             and re.fullmatch(r'[A-Za-z0-9_-]{1,128}', value)}
    return next(iter(valid)) if len(valid) == 1 else None


def owner(record, find_nfvo):
    nfvo = find_nfvo(record.get('nfvo_db_id') or record['nfvo_id'])
    if not nfvo:
        raise OperationError('The owning NFVO registration is unavailable', 409)
    if (nfvo.get('id') != record['nfvo_id'] or nfvo.get('tenantname') != record['project']
            or nfvo.get('nfvoip') != record['endpoint']):
        raise OperationError('The owning NFVO/project changed; reconcile this operation first')
    return nfvo


def by_instance(collection, instance, nfvo_id=None):
    query = {'osm_instance_id': instance}
    if nfvo_id:
        query['nfvo_id'] = nfvo_id
    records = list(collection.find(query).limit(2))
    if len(records) != 1:
        raise OperationError('No unique stored NFVO owner. Legacy deployments require verified adoption.')
    return records[0]


def observe(collection, record, operations, started_at):
    if not isinstance(operations, list):
        raise OperationError('OSM returned an invalid operation list', 502)
    matches = [item for item in operations if isinstance(item, dict)
               and item.get('nsInstanceId') == record.get('osm_instance_id')
               and str(item.get('lcmOperationType', '')).lower() == 'instantiate']
    if not matches:
        return public(record)
    # A fresh instance normally has one instantiation. Re-instantiation is ordered by OSM time.
    def start(item):
        value = item.get('startTime', 0)
        return float(value) if isinstance(value, (int, float)) else 0
    matches.sort(key=start, reverse=True)
    if len(matches) > 1 and start(matches[0]) == start(matches[1]):
        raise OperationError('OSM instantiation identity is ambiguous', 502)
    operation = matches[0]
    state = str(operation.get('operationState', 'UNKNOWN')).upper()
    phase = ('completed' if state == 'COMPLETED' else 'failed'
             if state in ('FAILED', 'FAILED_TEMP', 'ROLLED_BACK', 'PARTIALLY_COMPLETED')
             else 'pending' if state in ('STARTING', 'PROCESSING', 'ROLLING_BACK') else 'unknown')
    changes = dict(osm_operation_state=state, phase=phase,
                   observed_at=time.time(), observation_started_at=started_at)
    operation_id = operation.get('id') or operation.get('_id')
    if isinstance(operation_id, str) and re.fullmatch(r'[A-Za-z0-9_-]{1,128}', operation_id):
        changes['osm_operation_id'] = operation_id
    # A slow older poll cannot overwrite an observation from a newer request.
    collection.update_one({'_id': record['_id'], '$or': [
        {'observation_started_at': {'$exists': False}},
        {'observation_started_at': {'$lte': started_at}},
    ]}, {'$set': changes})
    return public(collection.find_one({'_id': record['_id']}))
