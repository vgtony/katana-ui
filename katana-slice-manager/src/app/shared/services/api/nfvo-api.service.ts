import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { NfvoRegistrationFormModel } from '../../../models/interfaces/nfvo-registration-form.interface';
import { KatanaApiBaseService } from './katana-api-base.service';

@Injectable({ providedIn: 'root' })
export class NfvoApiService extends KatanaApiBaseService {
  getNfvos(): Observable<unknown[]> {
    return this.http.get<unknown[]>(this.buildApiUrl('nfvo'));
  }

  createNfvo(payload: NfvoRegistrationFormModel): Observable<string> {
    return this.postText(this.buildApiUrl('nfvo'), payload);
  }

  getNfvo(nfvoId: string): Observable<NfvoRegistrationFormModel> {
    return this.http.get<NfvoRegistrationFormModel>(this.buildApiUrl('nfvo', nfvoId));
  }

  updateNfvo(nfvoId: string, payload: NfvoRegistrationFormModel): Observable<unknown> {
    return this.http.put(this.buildApiUrl('nfvo', nfvoId), payload);
  }

  deleteNfvo(nfvoId: string): Observable<unknown> {
    return this.http.delete(this.buildApiUrl('nfvo', nfvoId));
  }
}
