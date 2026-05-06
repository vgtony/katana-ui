import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ProxmoxClusterRegistrationFormModel } from '../../../models/interfaces/proxmox-cluster-registration-form.interface';
import {
  ProxmoxListVmsResponse,
  ProxmoxClusterRegistrationResponse,
  ProxmoxNodesRequest,
  ProxmoxNodesResponse,
  ProxmoxProvisionResponse,
  ProxmoxClusterResponse,
  ProxmoxDeleteClusterResponse,
  ProxmoxVmDeploymentRequest,
  ProxmoxVmDeploymentResponse
} from '../../../models/interfaces/proxmox.interface';
import { KatanaApiBaseService } from './katana-api-base.service';

@Injectable({ providedIn: 'root' })
export class ProxmoxApiService extends KatanaApiBaseService {
  getClusters(): Observable<ProxmoxClusterResponse[]> {
    return this.http.get<ProxmoxClusterResponse[]>(this.buildApiUrl('proxmox', 'cluster'));
  }

  createCluster(
    payload: ProxmoxClusterRegistrationFormModel
  ): Observable<ProxmoxClusterRegistrationResponse> {
    return this.http.post<ProxmoxClusterRegistrationResponse>(this.buildApiUrl('proxmox', 'cluster'), payload);
  }

  getCluster(clusterId: string): Observable<ProxmoxClusterResponse> {
    return this.http.get<ProxmoxClusterResponse>(this.buildApiUrl('proxmox', 'cluster', clusterId));
  }

  deleteCluster(clusterId: string): Observable<ProxmoxDeleteClusterResponse> {
    return this.http.delete<ProxmoxDeleteClusterResponse>(this.buildApiUrl('proxmox', 'cluster', clusterId));
  }

  getNodes(payload: ProxmoxNodesRequest): Observable<ProxmoxNodesResponse> {
    return this.http.post<ProxmoxNodesResponse>(this.buildApiUrl('proxmox', 'nodes'), payload);
  }

  getStandaloneClusters(payload: ProxmoxNodesRequest): Observable<unknown> {
    return this.http.post(this.buildApiUrl('proxmox', 'clusters'), payload);
  }

  getStandaloneServers(payload: ProxmoxNodesRequest): Observable<unknown> {
    return this.http.post(this.buildApiUrl('proxmox', 'servers'), payload);
  }

  getStandaloneRemainingResources(payload: ProxmoxNodesRequest): Observable<unknown> {
    return this.http.post(this.buildApiUrl('proxmox', 'remaining-resources'), payload);
  }

  provisionVms(payload: ProxmoxVmDeploymentRequest): Observable<ProxmoxProvisionResponse> {
    return this.http.post<ProxmoxProvisionResponse>(this.buildApiUrl('proxmox', 'provision'), payload);
  }

  listVms(payload: ProxmoxNodesRequest, node: string): Observable<ProxmoxListVmsResponse> {
    return this.http.post<ProxmoxListVmsResponse>(`${this.buildApiUrl('proxmox', 'list-vms')}?node=${encodeURIComponent(node)}`, payload);
  }

  deployVms(payload: ProxmoxVmDeploymentRequest): Observable<ProxmoxVmDeploymentResponse> {
    return this.http.post<ProxmoxVmDeploymentResponse>(this.buildApiUrl('proxmox', 'vm'), payload);
  }
}
