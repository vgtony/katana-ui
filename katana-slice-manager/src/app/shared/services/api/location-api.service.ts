import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { LocationRegistrationFormModel } from '../../../models/interfaces/location-registration-form.interface';
import { KatanaApiBaseService } from './katana-api-base.service';

@Injectable({ providedIn: 'root' })
export class LocationApiService extends KatanaApiBaseService {
  getLocations(): Observable<unknown[]> {
    return this.http.get<unknown[]>(this.buildApiUrl('location'));
  }

  createLocation(payload: LocationRegistrationFormModel): Observable<string> {
    return this.postText(this.buildApiUrl('location'), payload);
  }

  getLocation(id: string): Observable<LocationRegistrationFormModel> {
    return this.http.get<LocationRegistrationFormModel>(this.buildApiUrl('location', id));
  }

  updateLocation(id: string, payload: LocationRegistrationFormModel): Observable<unknown> {
    return this.http.put(this.buildApiUrl('location', id), payload);
  }

  deleteLocation(id: string): Observable<unknown> {
    return this.http.delete(this.buildApiUrl('location', id));
  }
}
