import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { KatanaApiBaseService } from './katana-api-base.service';

@Injectable({ providedIn: 'root' })
export class VimApiService extends KatanaApiBaseService {
  getVims(): Observable<unknown[]> {
    return this.http.get<unknown[]>(this.buildApiUrl('vim'));
  }

  createVim(payload: unknown): Observable<string> {
    return this.http.post<string>(this.buildApiUrl('vim'), payload);
  }

  getVim(vimId: string): Observable<unknown> {
    return this.http.get(this.buildApiUrl('vim', vimId));
  }

  updateVim(vimId: string, payload: unknown): Observable<unknown> {
    return this.http.put(this.buildApiUrl('vim', vimId), payload);
  }

  deleteVim(vimId: string): Observable<unknown> {
    return this.http.delete(this.buildApiUrl('vim', vimId));
  }
}
