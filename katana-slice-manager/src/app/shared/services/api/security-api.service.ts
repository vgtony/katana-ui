import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { KatanaApiBaseService } from './katana-api-base.service';

@Injectable({ providedIn: 'root' })
export class SecurityApiService extends KatanaApiBaseService {
  mitigateAttack(payload: unknown): Observable<unknown> {
    return this.http.post(this.buildRootUrl('mitigate'), payload);
  }

  reportRecovered(payload: unknown): Observable<unknown> {
    return this.http.post(this.buildRootUrl('recovered'), payload);
  }
}
