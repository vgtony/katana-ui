import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { KatanaApiBaseService } from './katana-api-base.service';

@Injectable({ providedIn: 'root' })
export class PolicyApiService extends KatanaApiBaseService {
  getPolicies(): Observable<unknown[]> {
    return this.http.get<unknown[]>(this.buildApiUrl('policy'));
  }

  createPolicy(payload: unknown): Observable<string> {
    return this.postText(this.buildApiUrl('policy'), payload);
  }

  getPolicy(policySystemId: string): Observable<unknown> {
    return this.http.get(this.buildApiUrl('policy', policySystemId));
  }

  updatePolicy(policySystemId: string, payload: unknown): Observable<unknown> {
    return this.http.put(this.buildApiUrl('policy', policySystemId), payload);
  }

  deletePolicy(policySystemId: string): Observable<unknown> {
    return this.http.delete(this.buildApiUrl('policy', policySystemId));
  }

  getNeatPolicy(sliceId: string): Observable<unknown> {
    return this.http.get(this.buildApiUrl('policy', 'neat', sliceId));
  }

  apexPolicyAction(payload: unknown): Observable<unknown> {
    return this.http.post(this.buildApiUrl('policy', 'apex', 'action'), payload);
  }
}
