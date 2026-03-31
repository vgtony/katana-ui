import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { KatanaApiBaseService } from './katana-api-base.service';

@Injectable({ providedIn: 'root' })
export class EmsApiService extends KatanaApiBaseService {
  getEmsList(): Observable<unknown[]> {
    return this.http.get<unknown[]>(this.buildApiUrl('ems'));
  }

  createEms(payload: unknown): Observable<string> {
    return this.postText(this.buildApiUrl('ems'), payload);
  }

  getEms(emsId: string): Observable<unknown> {
    return this.http.get(this.buildApiUrl('ems', emsId));
  }

  updateEms(emsId: string, payload: unknown): Observable<unknown> {
    return this.http.put(this.buildApiUrl('ems', emsId), payload);
  }

  deleteEms(emsId: string): Observable<unknown> {
    return this.http.delete(this.buildApiUrl('ems', emsId));
  }
}
