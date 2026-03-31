import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { FunctionRegistrationFormModel } from '../../../models/interfaces/function-registration-form.interface';
import { KatanaApiBaseService } from './katana-api-base.service';

@Injectable({ providedIn: 'root' })
export class FunctionApiService extends KatanaApiBaseService {
  getFunctions(): Observable<unknown[]> {
    return this.http.get<unknown[]>(this.buildApiUrl('function'));
  }

  createFunction(payload: FunctionRegistrationFormModel): Observable<string> {
    return this.postText(this.buildApiUrl('function'), payload);
  }

  getFunction(funcId: string): Observable<FunctionRegistrationFormModel> {
    return this.http.get<FunctionRegistrationFormModel>(this.buildApiUrl('function', funcId));
  }

  updateFunction(funcId: string, payload: FunctionRegistrationFormModel): Observable<unknown> {
    return this.http.put(this.buildApiUrl('function', funcId), payload);
  }

  deleteFunction(funcId: string): Observable<unknown> {
    return this.http.delete(this.buildApiUrl('function', funcId));
  }
}
