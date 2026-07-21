import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { KatanaApiBaseService } from './katana-api-base.service';

@Injectable({ providedIn: 'root' })
export class AlertApiService extends KatanaApiBaseService {
  receiveAlert(payload: unknown): Observable<unknown> {
    return this.http.post(this.buildApiUrl('alert'), payload);
  }
}
