import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { K8sClusterRegistrationFormModel } from '../../../models/interfaces/k8s-cluster-registration-form.interface';
import { KatanaApiBaseService } from './katana-api-base.service';

interface KubernetesApiResponse {
  message: string;
  id?: string;
}

export interface K8sDeployServiceFormApiPayload {
  nfvo_id: string;
  nsdId: string;
  nsName: string;
  nsDescription: string;
  vimAccountId: string;
}

export interface K8sDeploymentResponse {
  message: string;
  osm_response?: unknown;
}

interface KubernetesApiPayload {
  schema_version: string;
  credentials: string;
  schema_type: string;
  name: string;
  description: string;
  vim_account: string;
  nfvo_ip: string;
  nfvo_username: string;
  nfvo_password: string;
  k8s_version: string;
  nets: {
    k8s_net1: string | null;
  };
  namespace: string;
  deployment_methods: {
    'juju-bundle': boolean;
    'helm-chart-v3': boolean;
  };
}

function toApiPayload(payload: K8sClusterRegistrationFormModel): KubernetesApiPayload {
  return {
    schema_version: payload.schemaVersion,
    credentials: payload.credentials,
    schema_type: payload.schemaType,
    name: payload.name,
    description: payload.description,
    vim_account: payload.vimAccount,
    nfvo_ip: payload.nfvoIp,
    nfvo_username: payload.nfvoUsername,
    nfvo_password: payload.nfvoPassword,
    k8s_version: payload.k8sVersion,
    nets: {
      k8s_net1: payload.k8sNet1.trim() || null
    },
    namespace: payload.namespace,
    deployment_methods: {
      'juju-bundle': payload.jujuBundle,
      'helm-chart-v3': payload.helmChartV3
    }
  };
}

function fromApiPayload(payload: Partial<KubernetesApiPayload> & Record<string, unknown>): K8sClusterRegistrationFormModel {
  const nets =
    payload['nets'] && typeof payload['nets'] === 'object' && !Array.isArray(payload['nets'])
      ? (payload['nets'] as Record<string, unknown>)
      : {};
  const deploymentMethods =
    payload['deployment_methods'] &&
    typeof payload['deployment_methods'] === 'object' &&
    !Array.isArray(payload['deployment_methods'])
      ? (payload['deployment_methods'] as Record<string, unknown>)
      : {};

  return {
    schemaVersion: String(payload['schema_version'] ?? ''),
    credentials: String(payload['credentials'] ?? ''),
    schemaType: String(payload['schema_type'] ?? ''),
    name: String(payload['name'] ?? ''),
    description: String(payload['description'] ?? ''),
    vimAccount: String(payload['vim_account'] ?? ''),
    nfvoIp: String(payload['nfvo_ip'] ?? ''),
    nfvoUsername: String(payload['nfvo_username'] ?? ''),
    nfvoPassword: String(payload['nfvo_password'] ?? ''),
    k8sVersion: String(payload['k8s_version'] ?? ''),
    k8sNet1: String(nets['k8s_net1'] ?? ''),
    namespace: String(payload['namespace'] ?? 'default'),
    jujuBundle: Boolean(deploymentMethods['juju-bundle']),
    helmChartV3: Boolean(deploymentMethods['helm-chart-v3'])
  };
}

@Injectable({ providedIn: 'root' })
export class KubernetesApiService extends KatanaApiBaseService {
  getK8sClusters(): Observable<unknown[]> {
    return this.http.get<unknown[]>(this.buildApiUrl('k8s'));
  }

  registerK8sCluster(payload: K8sClusterRegistrationFormModel): Observable<KubernetesApiResponse> {
    return this.http.post<KubernetesApiResponse>(this.buildApiUrl('k8s'), toApiPayload(payload));
  }

  uploadK8sCredentials(file: File): Observable<KubernetesApiResponse> {
    const payload = new FormData();
    payload.append('file', file);

    return this.http.post<KubernetesApiResponse>(this.buildApiUrl('k8s'), payload);
  }

  getK8sCluster(uuid: string): Observable<K8sClusterRegistrationFormModel> {
    return this.http
      .get<Partial<KubernetesApiPayload> & Record<string, unknown>>(this.buildApiUrl('k8s', uuid))
      .pipe(map((payload) => fromApiPayload(payload)));
  }

  deleteK8sCluster(uuid: string): Observable<unknown> {
    return this.http.delete(this.buildApiUrl('k8s', uuid));
  }

  deployK8sService(payload: {
    nfvoId: string;
    nsdId: string;
    nsName: string;
    nsDescription: string;
    vimAccountId: string;
  }): Observable<K8sDeploymentResponse> {
    const requestPayload: K8sDeployServiceFormApiPayload = {
      nfvo_id: payload.nfvoId,
      nsdId: payload.nsdId,
      nsName: payload.nsName,
      nsDescription: payload.nsDescription,
      vimAccountId: payload.vimAccountId
    };

    return this.http.post<K8sDeploymentResponse>(this.buildApiUrl('k8s', 'deploy'), requestPayload);
  }
}
