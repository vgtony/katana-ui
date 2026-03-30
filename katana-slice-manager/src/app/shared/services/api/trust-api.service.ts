import { HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { KatanaApiBaseService } from './katana-api-base.service';

export interface TrustLevelQuery {
  domainId?: string;
  serviceId?: string;
  targetUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class TrustApiService extends KatanaApiBaseService {
  getLotMonitors(): Observable<unknown[]> {
    return this.http.get<unknown[]>(this.buildApiUrl('lot'));
  }

  createLotMonitor(payload: unknown): Observable<unknown> {
    return this.http.post(this.buildApiUrl('lot'), payload);
  }

  getLotMonitor(uuid: string): Observable<unknown> {
    return this.http.get(this.buildApiUrl('lot', uuid));
  }

  initSgc(payload?: unknown): Observable<unknown> {
    return this.http.post(this.buildApiUrl('initsgc'), payload ?? {});
  }

  getTrustLevel(query?: TrustLevelQuery): Observable<unknown> {
    let params = new HttpParams();

    if (query?.targetUrl) {
      params = params.set('target_url', query.targetUrl);
    }

    if (query?.serviceId) {
      params = params.set('serviceId', query.serviceId);
    }

    if (query?.domainId) {
      params = params.set('domainId', query.domainId);
    }

    return this.http.get(this.buildApiUrl('trustlevel'), { params });
  }
}
