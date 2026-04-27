import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

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

@Injectable({ providedIn: 'root' })
export class ProxmoxStandaloneApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = PROXMOX_STANDALONE_API_BASE_URL;

  connect(payload: ProxmoxStandaloneAuthPayload): Observable<unknown> {
    return this.http.post(this.buildUrl('/api/proxmox/connect'), payload);
  }

  getOverview(payload: ProxmoxStandaloneAuthPayload): Observable<unknown> {
    return this.http.post(this.buildUrl('/api/proxmox/overview'), payload);
  }

  private buildUrl(path: string): string {
    return `${this.baseUrl}${path}`;
  }
}
