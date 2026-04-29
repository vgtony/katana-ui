import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  ProxmoxVmDeploymentRequest,
  ProxmoxVmDeploymentResponse
} from '../../../models/interfaces/proxmox.interface';

export const PROXMOX_STANDALONE_API_BASE_URL = 'http://127.0.0.1:8099';

export interface ProxmoxStandaloneAuthPayload {
  name: string;
  url: string;
  verify_ssl: boolean;
  username?: string;
  password?: string;
  api_token_id?: string;
  api_token_secret?: string;
}

export type ProxmoxStandaloneVmDeploymentRequest = ProxmoxStandaloneAuthPayload &
  ProxmoxVmDeploymentRequest;

@Injectable({ providedIn: 'root' })
export class ProxmoxStandaloneApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = PROXMOX_STANDALONE_API_BASE_URL;

  connect(payload: ProxmoxStandaloneAuthPayload): Observable<unknown> {
    return this.http.post(this.buildUrl('/api/proxmox/connect'), payload);
  }

  getClusters(payload: ProxmoxStandaloneAuthPayload): Observable<unknown> {
    return this.http.post(this.buildUrl('/api/proxmox/clusters'), payload);
  }

  getServers(payload: ProxmoxStandaloneAuthPayload): Observable<unknown> {
    return this.http.post(this.buildUrl('/api/proxmox/servers'), payload);
  }

  getRemainingResources(payload: ProxmoxStandaloneAuthPayload): Observable<unknown> {
    return this.http.post(this.buildUrl('/api/proxmox/remaining-resources'), payload);
  }

  deployVms(
    payload: ProxmoxStandaloneVmDeploymentRequest
  ): Observable<ProxmoxVmDeploymentResponse> {
    return this.http.post<ProxmoxVmDeploymentResponse>(this.buildUrl('/api/proxmox/vms'), payload);
  }

  private buildUrl(path: string): string {
    return `${this.baseUrl}${path}`;
  }
}
