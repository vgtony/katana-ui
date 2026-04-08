import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { VimRegistrationFormModel } from '../../../models/interfaces/vim-registration-form.interface';
import { KatanaApiBaseService } from './katana-api-base.service';

interface VimApiPayload {
  id: string;
  name: string;
  auth_url: string;
  username: string;
  password: string;
  admin_project_name: string;
  location: string;
  type: string;
  version: string;
  description: string;
  infrastructure_monitoring: string;
  security_groups: string;
}

function toApiPayload(payload: VimRegistrationFormModel): VimApiPayload {
  return {
    id: payload.id,
    name: payload.name,
    auth_url: payload.authUrl,
    username: payload.username,
    password: payload.password,
    admin_project_name: payload.adminProjectName,
    location: payload.location,
    type: payload.type,
    version: payload.version,
    description: payload.description,
    infrastructure_monitoring: payload.infrastructureMonitoring,
    security_groups: payload.securityGroups
  };
}

function fromApiPayload(payload: Partial<VimApiPayload> & Record<string, unknown>): VimRegistrationFormModel {
  return {
    id: String(payload.id ?? ''),
    name: String(payload.name ?? ''),
    authUrl: String(payload.auth_url ?? ''),
    username: String(payload.username ?? ''),
    password: String(payload.password ?? ''),
    adminProjectName: String(payload.admin_project_name ?? ''),
    location: String(payload.location ?? ''),
    type: String(payload.type ?? ''),
    version: String(payload.version ?? ''),
    description: String(payload.description ?? ''),
    infrastructureMonitoring: String(payload.infrastructure_monitoring ?? ''),
    securityGroups: String(payload.security_groups ?? '')
  };
}

@Injectable({ providedIn: 'root' })
export class VimApiService extends KatanaApiBaseService {
  getVims(): Observable<unknown[]> {
    return this.http.get<unknown[]>(this.buildApiUrl('vim'));
  }

  createVim(payload: VimRegistrationFormModel): Observable<string> {
    return this.postText(this.buildApiUrl('vim'), toApiPayload(payload));
  }

  getVim(vimId: string): Observable<VimRegistrationFormModel> {
    return this.http
      .get<Partial<VimApiPayload> & Record<string, unknown>>(this.buildApiUrl('vim', vimId))
      .pipe(map((payload) => fromApiPayload(payload)));
  }

  updateVim(vimId: string, payload: VimRegistrationFormModel): Observable<unknown> {
    return this.http.put(this.buildApiUrl('vim', vimId), toApiPayload(payload));
  }

  deleteVim(vimId: string): Observable<unknown> {
    return this.http.delete(this.buildApiUrl('vim', vimId));
  }
}
