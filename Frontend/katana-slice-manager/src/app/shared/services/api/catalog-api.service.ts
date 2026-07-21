import { HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { NsdSummary } from '../../../models/interfaces/infrastructure.interface';
import { KatanaApiBaseService } from './katana-api-base.service';

export interface NsListQuery {
  nfvoId?: string;
  nsdId?: string;
}

@Injectable({ providedIn: 'root' })
export class CatalogApiService extends KatanaApiBaseService {
  getGsts(): Observable<unknown[]> {
    return this.http.get<unknown[]>(this.buildApiUrl('gst'));
  }

  getGst(gstId: string): Observable<unknown> {
    return this.http.get(this.buildApiUrl('gst', gstId));
  }

  getBaseSliceDescriptors(): Observable<unknown[]> {
    return this.http.get<unknown[]>(this.buildApiUrl('base_slice_des'));
  }

  createBaseSliceDescriptor(payload: unknown): Observable<string> {
    return this.postText(this.buildApiUrl('base_slice_des'), payload);
  }

  getBaseSliceDescriptor(id: string): Observable<unknown> {
    return this.http.get(this.buildApiUrl('base_slice_des', id));
  }

  updateBaseSliceDescriptor(id: string, payload: unknown): Observable<unknown> {
    return this.http.put(this.buildApiUrl('base_slice_des', id), payload);
  }

  deleteBaseSliceDescriptor(id: string): Observable<unknown> {
    return this.http.delete(this.buildApiUrl('base_slice_des', id));
  }

  getNsList(query?: NsListQuery): Observable<NsdSummary[]> {
    let params = new HttpParams();

    if (query?.nsdId) {
      params = params.set('nsd-id', query.nsdId);
    }

    if (query?.nfvoId) {
      params = params.set('nfvo-id', query.nfvoId);
    }

    return this.http.get<NsdSummary[]>(this.buildApiUrl('nslist'), { params });
  }
}
