import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ProxmoxClusterRegistrationFormModel } from '../../../models/interfaces/proxmox-cluster-registration-form.interface';
import {
  ProxmoxClusterRegistrationResponse,
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

  deployVms(payload: ProxmoxVmDeploymentRequest): Observable<ProxmoxVmDeploymentResponse> {
    return this.http.post<ProxmoxVmDeploymentResponse>(this.buildApiUrl('proxmox', 'vm'), payload);
  }
}
