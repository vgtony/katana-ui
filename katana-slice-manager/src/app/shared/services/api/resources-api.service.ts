import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { KatanaApiBaseService } from './katana-api-base.service';

@Injectable({ providedIn: 'root' })
export class ResourcesApiService extends KatanaApiBaseService {
  getResources(): Observable<unknown> {
    return this.http.get(this.buildApiUrl('resources'));
  }

  getResourcesByLocation(location: string): Observable<unknown> {
    return this.http.get(this.buildApiUrl('resources', location));
  }

  triggerResourceUpdate(): Observable<unknown> {
    return this.http.get(this.buildApiUrl('resources', 'update'));
  }

  triggerResourceUpdatePost(payload?: unknown): Observable<unknown> {
    return this.http.post(this.buildApiUrl('resources', 'update'), payload ?? {});
  }
}
