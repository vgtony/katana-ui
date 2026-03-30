import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { KatanaApiBaseService } from './katana-api-base.service';

@Injectable({ providedIn: 'root' })
export class LocationApiService extends KatanaApiBaseService {
  getLocations(): Observable<unknown[]> {
    return this.http.get<unknown[]>(this.buildApiUrl('location'));
  }

  createLocation(payload: unknown): Observable<string> {
    return this.http.post<string>(this.buildApiUrl('location'), payload);
  }

  getLocation(id: string): Observable<unknown> {
    return this.http.get(this.buildApiUrl('location', id));
  }

  updateLocation(id: string, payload: unknown): Observable<unknown> {
    return this.http.put(this.buildApiUrl('location', id), payload);
  }

  deleteLocation(id: string): Observable<unknown> {
    return this.http.delete(this.buildApiUrl('location', id));
  }
}
