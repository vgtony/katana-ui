import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { FunctionRegistrationFormModel } from '../../../models/interfaces/function-registration-form.interface';
import { KatanaApiBaseService } from './katana-api-base.service';

interface FunctionApiPayload {
  id: string;
  name: string;
  gen: number;
  func: number;
  shared: {
    availability: boolean;
  };
  type: number;
  location: string;
  ns_list: Array<{
    'nsd-id': string;
    'ns-name': string;
    placement: number;
    optional: boolean;
  }>;
}

function toApiPayload(payload: FunctionRegistrationFormModel): FunctionApiPayload {
  return {
    id: payload.id,
    name: payload.name,
    gen: payload.gen,
    func: payload.func,
    shared: {
      availability: payload.sharedAvailability
    },
    type: payload.type,
    location: payload.location,
    ns_list: [
      {
        'nsd-id': payload.nsdId,
        'ns-name': payload.nsName,
        placement: payload.placement,
        optional: payload.optional
      }
    ]
  };
}

function fromApiPayload(
  payload: Partial<FunctionApiPayload> & Record<string, unknown>
): FunctionRegistrationFormModel {
  const firstNetworkService = Array.isArray(payload.ns_list) && payload.ns_list.length > 0
    ? (payload.ns_list[0] as Record<string, unknown>)
    : null;

  return {
    id: String(payload.id ?? ''),
    name: String(payload.name ?? ''),
    gen: Number(payload.gen ?? 0),
    func: Number(payload.func ?? 0),
    sharedAvailability: Boolean(
      (payload.shared as { availability?: unknown } | undefined)?.availability ?? false
    ),
    type: Number(payload.type ?? 0),
    location: String(payload.location ?? ''),
    nsdId: String(firstNetworkService?.['nsd-id'] ?? ''),
    nsName: String(firstNetworkService?.['ns-name'] ?? ''),
    placement: Number(firstNetworkService?.['placement'] ?? 0),
    optional: Boolean(firstNetworkService?.['optional'] ?? false)
  };
}

@Injectable({ providedIn: 'root' })
export class FunctionApiService extends KatanaApiBaseService {
  getFunctions(): Observable<unknown[]> {
    return this.http.get<unknown[]>(this.buildApiUrl('function'));
  }

  createFunction(payload: FunctionRegistrationFormModel): Observable<string> {
    return this.postText(this.buildApiUrl('function'), toApiPayload(payload));
  }

  getFunction(funcId: string): Observable<FunctionRegistrationFormModel> {
    return this.http
      .get<Partial<FunctionApiPayload> & Record<string, unknown>>(this.buildApiUrl('function', funcId))
      .pipe(map((payload) => fromApiPayload(payload)));
  }

  updateFunction(funcId: string, payload: FunctionRegistrationFormModel): Observable<unknown> {
    return this.http.put(this.buildApiUrl('function', funcId), toApiPayload(payload));
  }

  deleteFunction(funcId: string): Observable<unknown> {
    return this.http.delete(this.buildApiUrl('function', funcId));
  }
}
