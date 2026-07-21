import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  BootstrapManifest,
  BootstrapStatus,
} from '../../../models/interfaces/infrastructure.interface';
import { KatanaApiBaseService } from './katana-api-base.service';

@Injectable({ providedIn: 'root' })
export class BootstrapApiService extends KatanaApiBaseService {
  getStatus(): Observable<BootstrapStatus> {
    return this.http.get<BootstrapStatus>(this.buildApiUrl('bootstrap'));
  }

  bootstrap(payload: BootstrapManifest): Observable<BootstrapStatus> {
    return this.http.post<BootstrapStatus>(this.buildApiUrl('bootstrap'), payload);
  }
}
