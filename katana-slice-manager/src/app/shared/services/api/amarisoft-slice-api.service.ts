import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { KatanaApiBaseService } from './katana-api-base.service';

export interface AmarisoftSliceTarget {
  ems_id?: string;
  url?: string;
}

export interface AmarisoftSliceRequest {
  name: string;
  description?: string;
  s_nssai: {
    sst: number;
    sd: string;
  };
  plmn: {
    mcc: string;
    mnc: string;
  };
  dnn: string;
  qos: {
    five_qi: number;
    session_ambr_ul: string;
    session_ambr_dl: string;
  };
  subscribers: string[];
  isolation_mode: string;
  targets: {
    ran: AmarisoftSliceTarget;
    core: AmarisoftSliceTarget;
  };
  dry_run?: boolean;
}

@Injectable({ providedIn: 'root' })
export class AmarisoftSliceApiService extends KatanaApiBaseService {
  getSlices(): Observable<unknown[]> {
    return this.http.get<unknown[]>(this.buildApiUrl('amarisoft-slices'));
  }

  createSlice(payload: AmarisoftSliceRequest): Observable<unknown> {
    return this.http.post(this.buildApiUrl('amarisoft-slices'), payload);
  }

  getSlice(sliceId: string): Observable<unknown> {
    return this.http.get(this.buildApiUrl('amarisoft-slices', sliceId));
  }

  deleteSlice(sliceId: string): Observable<unknown> {
    return this.http.delete(this.buildApiUrl('amarisoft-slices', sliceId));
  }

  previewSlice(payload: AmarisoftSliceRequest): Observable<unknown> {
    return this.http.post(this.buildApiUrl('amarisoft-slices', 'preview'), payload);
  }

  applySlice(sliceId: string): Observable<unknown> {
    return this.http.post(this.buildApiUrl('amarisoft-slices', sliceId, 'apply'), null);
  }
}
