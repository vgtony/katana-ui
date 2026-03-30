import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { KatanaApiBaseService } from './katana-api-base.service';

@Injectable({ providedIn: 'root' })
export class WimApiService extends KatanaApiBaseService {
  getWims(): Observable<unknown[]> {
    return this.http.get<unknown[]>(this.buildApiUrl('wim'));
  }

  createWim(payload: unknown): Observable<string> {
    return this.http.post<string>(this.buildApiUrl('wim'), payload);
  }

  getWim(wimId: string): Observable<unknown> {
    return this.http.get(this.buildApiUrl('wim', wimId));
  }

  updateWim(wimId: string, payload: unknown): Observable<unknown> {
    return this.http.put(this.buildApiUrl('wim', wimId), payload);
  }

  deleteWim(wimId: string): Observable<unknown> {
    return this.http.delete(this.buildApiUrl('wim', wimId));
  }
}
