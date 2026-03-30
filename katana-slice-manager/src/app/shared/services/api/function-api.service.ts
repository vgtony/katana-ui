import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { KatanaApiBaseService } from './katana-api-base.service';

@Injectable({ providedIn: 'root' })
export class FunctionApiService extends KatanaApiBaseService {
  getFunctions(): Observable<unknown[]> {
    return this.http.get<unknown[]>(this.buildApiUrl('function'));
  }

  createFunction(payload: unknown): Observable<string> {
    return this.http.post<string>(this.buildApiUrl('function'), payload);
  }

  getFunction(funcId: string): Observable<unknown> {
    return this.http.get(this.buildApiUrl('function', funcId));
  }

  updateFunction(funcId: string, payload: unknown): Observable<unknown> {
    return this.http.put(this.buildApiUrl('function', funcId), payload);
  }

  deleteFunction(funcId: string): Observable<unknown> {
    return this.http.delete(this.buildApiUrl('function', funcId));
  }
}
