import { HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { SliceRegistrationFormModel } from '../../../models/interfaces/slice-registration-form.interface';
import { KatanaApiBaseService } from './katana-api-base.service';

interface SliceApiPayload {
  base_slice_descriptor: {
    base_slice_des_id: string;
    coverage: string[];
    delay_tolerance: boolean;
    network_DL_throughput: {
      guaranteed: number;
    };
    ue_DL_throughput: {
      guaranteed: number;
    };
    network_UL_throughput: {
      guaranteed: number;
    };
    ue_UL_throughput: {
      guaranteed: number;
    };
    mtu: number;
  };
  service_descriptor: {
    ns_list: Array<{
      'nsd-id': string;
      'ns-name': string;
      placement: number;
      optional: boolean;
    }>;
  };
}

export interface CreateSliceRequest {
  gst: SliceRegistrationFormModel;
}

function toApiPayload(payload: SliceRegistrationFormModel): SliceApiPayload {
  return {
    base_slice_descriptor: {
      base_slice_des_id: payload.baseSliceDesId,
      coverage: [payload.coverage],
      delay_tolerance: payload.delayTolerance,
      network_DL_throughput: {
        guaranteed: payload.networkDlGuaranteed
      },
      ue_DL_throughput: {
        guaranteed: payload.ueDlGuaranteed
      },
      network_UL_throughput: {
        guaranteed: payload.networkUlGuaranteed
      },
      ue_UL_throughput: {
        guaranteed: payload.ueUlGuaranteed
      },
      mtu: payload.mtu
    },
    service_descriptor: {
      ns_list: [
        {
          'nsd-id': payload.nsdId,
          'ns-name': payload.nsName,
          placement: payload.placement,
          optional: payload.optional
        }
      ]
    }
  };
}

@Injectable({ providedIn: 'root' })
export class SliceApiService extends KatanaApiBaseService {
  getSlices(): Observable<unknown[]> {
    return this.http.get<unknown[]>(this.buildApiUrl('slice'));
  }

  createSlice(payload: CreateSliceRequest): Observable<string> {
    return this.postText(this.buildApiUrl('slice'), toApiPayload(payload.gst));
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
