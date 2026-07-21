import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { KatanaApiBaseService } from './katana-api-base.service';

@Injectable({ providedIn: 'root' })
export class BootstrapApiService extends KatanaApiBaseService {
  bootstrap(payload: unknown): Observable<unknown> {
    return this.http.post(this.buildApiUrl('bootstrap'), payload);
  }
}
