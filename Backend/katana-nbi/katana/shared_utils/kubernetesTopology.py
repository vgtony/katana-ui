"""Read-only Kubernetes snapshots. Credentials and raw pod specifications never leave the NBI."""
from datetime import datetime, timezone
from decimal import DecimalException
from pathlib import Path
import math
import re
from urllib.parse import urlsplit

import yaml
from kubernetes import client, config
from kubernetes.client.exceptions import ApiException
from kubernetes.utils.quantity import parse_quantity


class TopologyError(Exception):
    def __init__(self, message, status=502):
        super().__init__(message)
        self.status = status


def validate_namespace(namespace):
    if namespace != '*' and not re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?', namespace or ''):
        raise TopologyError('Choose all namespaces (*) or a valid Kubernetes namespace.', 400)
    return namespace


def stored_kubeconfig(cluster):
    credentials = cluster.get('credentials')
    if isinstance(credentials, dict):
        return credentials
    if not credentials:
        return None  # Registrations created through bootstrap keep their kubeconfig in OSM.
    root = Path('creds').resolve()
    if not isinstance(credentials, str) or Path(credentials).name != credentials:
        raise TopologyError('The registered kubeconfig filename is invalid.', 409)
    path = (root / credentials).resolve()
    if not path.is_relative_to(root):
        raise TopologyError('The registered kubeconfig filename is invalid.', 409)
    try:
        return yaml.safe_load(path.read_text())
    except (OSError, yaml.YAMLError):
        raise TopologyError('Upload the registered kubeconfig file again before inspecting this cluster.', 409)


def safe_kubeconfig(value):
    """Select one context and disallow kubeconfig features that execute code or read host files."""
    try:
        context_name = value['current-context']
        context = next(item for item in value['contexts'] if item['name'] == context_name)
        cluster = next(item for item in value['clusters'] if item['name'] == context['context']['cluster'])
        user = next(item for item in value['users'] if item['name'] == context['context']['user'])
        cluster_data, user_data = cluster['cluster'], user['user']
        if not isinstance(cluster_data, dict) or not isinstance(user_data, dict):
            raise ValueError('Invalid configuration')
        endpoint = urlsplit(cluster_data['server'])
        if endpoint.scheme != 'https' or not endpoint.hostname or endpoint.username or endpoint.password:
            raise ValueError('Invalid API endpoint')
        if any(key in user_data for key in ('exec', 'auth-provider', 'tokenFile', 'client-certificate', 'client-key')):
            raise ValueError('External authentication or file references')
        if any(key in cluster_data for key in ('certificate-authority', 'proxy-url')):
            raise ValueError('External certificate or proxy')
        if not (user_data.get('token') or (user_data.get('client-certificate-data') and user_data.get('client-key-data'))):
            raise ValueError('Missing embedded authentication')
        return {'apiVersion': 'v1', 'kind': 'Config', 'current-context': context_name,
                'contexts': [context], 'clusters': [cluster], 'users': [user]}
    except (KeyError, TypeError, StopIteration, ValueError):
        raise TopologyError('Use a kubeconfig with a current context, an HTTPS server, and an embedded token or client certificate. External credential commands and file references are not supported.', 409)


def quantity(value, cpu=False):
    if value is None:
        return None
    try:
        result = float(parse_quantity(value) * (1000 if cpu else 1))
        return result if math.isfinite(result) and result >= 0 else None
    except (ValueError, TypeError, DecimalException):
        return None


def resources(value):
    return {'cpu_millicores': quantity(value.get('cpu'), True),
            'memory_bytes': quantity(value.get('memory'))}


def usage(metric=None):
    metric = metric or {}
    return {**resources(metric.get('usage') or {}),
            'timestamp': metric.get('timestamp'), 'window': metric.get('window')}


def pod_summary(pod, metric=None):
    metadata, spec, status = pod.get('metadata', {}), pod.get('spec', {}), pod.get('status', {})
    measurements = {item['name']: item for item in (metric or {}).get('containers', [])}
    containers = []
    for kind, spec_key, status_key in (
        ('container', 'containers', 'containerStatuses'),
        ('init', 'initContainers', 'initContainerStatuses'),
        ('ephemeral', 'ephemeralContainers', 'ephemeralContainerStatuses'),
    ):
        states = {item['name']: item for item in (status.get(status_key) or [])}
        for container in (spec.get(spec_key) or []):
            name = container['name']
            current = states.get(name, {})
            state = current.get('state') or {}
            state_name = next(iter(state), 'unknown')
            limits = container.get('resources') or {}
            measured = measurements.get(name, {})
            containers.append({
                'name': name, 'kind': kind, 'state': state_name,
                'reason': (state.get(state_name) or {}).get('reason'),
                'ready': current.get('ready', False), 'restarts': current.get('restartCount', 0),
                'requests': resources(limits.get('requests') or {}),
                'limits': resources(limits.get('limits') or {}),
                'usage': usage({**measured, 'timestamp': (metric or {}).get('timestamp'),
                                'window': (metric or {}).get('window')}),
            })
    running = [item['name'] for item in containers if item['state'] == 'running']
    total = usage(metric)
    # Do not present partial container measurements as a complete pod total.
    for field in ('cpu_millicores', 'memory_bytes'):
        values = [resources(item.get('usage') or {})[field] for item in measurements.values()]
        total[field] = sum(values) if values and all(value is not None for value in values) and all(name in measurements for name in running) else None
    regular = [item for item in containers if item['kind'] == 'container']
    return {'uid': metadata.get('uid'), 'name': metadata.get('name'),
            'namespace': metadata.get('namespace'), 'node': spec.get('nodeName'),
            'phase': 'Terminating' if metadata.get('deletionTimestamp') else status.get('phase', 'Unknown'),
            'ready': sum(1 for item in regular if item['ready']), 'container_count': len(regular),
            'restarts': sum(item['restarts'] for item in containers), 'containers': containers, 'usage': total}


def node_summary(node, metric=None):
    status = node.get('status') or {}
    ready = next((item.get('status') for item in status.get('conditions', []) if item.get('type') == 'Ready'), None)
    return {'name': node['metadata']['name'], 'ready': True if ready == 'True' else False if ready == 'False' else None,
            'allocatable': resources(status.get('allocatable') or {}), 'usage': usage(metric), 'reported': True}


def api_error(error, subject):
    status = getattr(error, 'status', None)
    if status == 403:
        return f'Cluster credentials cannot list {subject}. Check their Kubernetes read permissions.'
    if status == 401:
        return 'Cluster credentials were rejected. Update the registered kubeconfig.'
    if status == 404:
        return f'{subject.capitalize()} are unavailable on this cluster.'
    return f'Unable to read {subject}. Check cluster connectivity and TLS trust, then refresh.'


def snapshot(api, cluster, namespace):
    warnings = []

    def get(path, query=None):
        # Kubernetes client 37 separates request serialization from transport.
        if hasattr(api, 'param_serialize'):
            params = api.param_serialize('GET', path, query_params=query or [],
                                         auth_settings=['BearerToken'], header_params={'Accept': 'application/json'})
            response = api.call_api(*params, _request_timeout=(3, 8))
            response.read()
            return api.response_deserialize(response, {'200': 'object'}).data
        return api.call_api(path, 'GET', query_params=query or [],
                            auth_settings=['BearerToken'], response_type='object',
                            _return_http_data_only=True, _request_timeout=(3, 8))

    def listing(path, label):
        # ponytail: cap each resource list at 2500 items; add server pagination for larger clusters.
        items, token = [], ''
        for _ in range(5):
            data = get(path, [('limit', 500)] + ([('continue', token)] if token else []))
            items.extend(data.get('items') or [])
            token = (data.get('metadata') or {}).get('continue', '')
            if not token or len(items) >= 2500:
                break
        if token or len(items) > 2500:
            warnings.append(f'{label} are limited to 2500 records in this snapshot. Narrow the namespace to inspect more pods.')
        return items[:2500]

    def optional(path, label):
        try:
            return listing(path, label)
        except Exception as error:
            warnings.append(api_error(error, label))
            return []

    pod_path = '/api/v1/pods' if namespace == '*' else f'/api/v1/namespaces/{namespace}/pods'
    try:
        pods = listing(pod_path, 'pods')
    except ApiException as error:
        fallback = cluster.get('namespace') or 'default'
        if error.status != 403 or namespace != '*':
            raise TopologyError(api_error(error, 'pods'), 403 if error.status == 403 else 502)
        validate_namespace(fallback)
        try:
            pods = listing(f'/api/v1/namespaces/{fallback}/pods', 'pods')
        except Exception as fallback_error:
            raise TopologyError(api_error(fallback_error, 'pods'), 403 if getattr(fallback_error, 'status', None) == 403 else 502)
        namespace = fallback
        warnings.append(f'Cluster-wide pod access is unavailable. Showing the registered namespace: {fallback}.')

    nodes = optional('/api/v1/nodes', 'nodes')
    pod_metrics, node_metrics = [], []
    try:
        discovery = get('/apis/metrics.k8s.io')
        version = (discovery.get('preferredVersion') or {}).get('version')
        if version not in ('v1', 'v1beta1'):
            raise ValueError('Unsupported Metrics API version')
        base = f'/apis/metrics.k8s.io/{version}'
        path = f'{base}/pods' if namespace == '*' else f'{base}/namespaces/{namespace}/pods'
        pod_metrics = optional(path, 'pod metrics')
        node_metrics = optional(f'{base}/nodes', 'node metrics')
    except Exception as error:
        warnings.append(api_error(error, 'resource metrics') + ' A Metrics API provider such as Metrics Server is required for CPU and memory usage.')

    pod_lookup = {(item['metadata']['namespace'], item['metadata']['name']): item for item in pod_metrics}
    node_lookup = {item['metadata']['name']: item for item in node_metrics}
    result_pods = [pod_summary(pod, pod_lookup.get((pod['metadata']['namespace'], pod['metadata']['name']))) for pod in pods]
    result_nodes = [node_summary(node, node_lookup.get(node['metadata']['name'])) for node in nodes]
    known_nodes = {node['name'] for node in result_nodes}
    for name in sorted({pod['node'] for pod in result_pods if pod['node']} - known_nodes):
        result_nodes.append({'name': name, 'ready': None, 'reported': False,
                             'allocatable': resources({}), 'usage': usage(node_lookup.get(name))})
    return {'cluster_id': cluster.get('id') or str(cluster['_id']), 'name': cluster['name'],
            'namespace': namespace, 'collected_at': datetime.now(timezone.utc).isoformat(),
            'nodes': result_nodes, 'pods': result_pods, 'warnings': warnings}


def cluster_snapshot(cluster, credentials, namespace='*'):
    validate_namespace(namespace)
    credentials = safe_kubeconfig(credentials)
    try:
        # Separate clients prevent one cluster's credentials changing another request's defaults.
        configuration = client.Configuration()
        configuration.retries = 0
        config.load_kube_config_from_dict(credentials, client_configuration=configuration, persist_config=False)
        with client.ApiClient(configuration) as api:
            return snapshot(api, cluster, namespace)
    except TopologyError:
        raise
    except Exception as error:
        raise TopologyError(api_error(error, 'cluster topology'))
