import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { KatanaApiBaseService } from './katana-api-base.service';

@Injectable({ providedIn: 'root' })
export class NfvoApiService extends KatanaApiBaseService {
  getNfvos(): Observable<unknown[]> {
    return this.http.get<unknown[]>(this.buildApiUrl('nfvo'));
  }

  createNfvo(payload: unknown): Observable<string> {
    return this.http.post<string>(this.buildApiUrl('nfvo'), payload);
  }

  getNfvo(nfvoId: string): Observable<unknown> {
    return this.http.get(this.buildApiUrl('nfvo', nfvoId));
  }

  updateNfvo(nfvoId: string, payload: unknown): Observable<unknown> {
    return this.http.put(this.buildApiUrl('nfvo', nfvoId), payload);
  }

  deleteNfvo(nfvoId: string): Observable<unknown> {
    return this.http.delete(this.buildApiUrl('nfvo', nfvoId));
  }
}
