import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { VimRegistrationFormModel } from '../../../models/interfaces/vim-registration-form.interface';
import { KatanaApiBaseService } from './katana-api-base.service';

@Injectable({ providedIn: 'root' })
export class VimApiService extends KatanaApiBaseService {
  getVims(): Observable<unknown[]> {
    return this.http.get<unknown[]>(this.buildApiUrl('vim'));
  }

  createVim(payload: VimRegistrationFormModel): Observable<string> {
    return this.postText(this.buildApiUrl('vim'), payload);
  }

  getVim(vimId: string): Observable<VimRegistrationFormModel> {
    return this.http.get<VimRegistrationFormModel>(this.buildApiUrl('vim', vimId));
  }

  updateVim(vimId: string, payload: VimRegistrationFormModel): Observable<unknown> {
    return this.http.put(this.buildApiUrl('vim', vimId), payload);
  }

  deleteVim(vimId: string): Observable<unknown> {
    return this.http.delete(this.buildApiUrl('vim', vimId));
  }
}
