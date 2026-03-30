import { HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { KatanaApiBaseService } from './katana-api-base.service';

@Injectable({ providedIn: 'root' })
export class SliceApiService extends KatanaApiBaseService {
  getSlices(): Observable<unknown[]> {
    return this.http.get<unknown[]>(this.buildApiUrl('slice'));
  }

  createSlice(payload: unknown): Observable<string> {
    return this.http.post<string>(this.buildApiUrl('slice'), payload);
  }

  getSlice(sliceId: string): Observable<unknown> {
    return this.http.get(this.buildApiUrl('slice', sliceId));
  }

  deleteSlice(sliceId: string, force?: boolean): Observable<unknown> {
    const params =
      force === undefined ? undefined : new HttpParams().set('force', String(force));

    return this.http.delete(this.buildApiUrl('slice', sliceId), { params });
  }

  getSliceDeploymentTime(sliceId: string): Observable<unknown> {
    return this.http.get(this.buildApiUrl('slice', sliceId, 'time'));
  }

  modifySlice(sliceId: string, payload: unknown): Observable<unknown> {
    return this.http.post(this.buildApiUrl('slice', sliceId, 'modify'), payload);
  }

  getSliceErrors(sliceId: string): Observable<unknown> {
    return this.http.get(this.buildApiUrl('slice', sliceId, 'errors'));
  }
}
