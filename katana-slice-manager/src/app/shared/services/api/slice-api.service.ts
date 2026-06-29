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

export interface SliceObservabilityCard {
  _id?: string;
  id?: string;
  name?: string;
  status?: string;
  created_at?: string;
  monitoring?: {
    configured?: boolean;
    details?: unknown;
    prometheus?: {
      queries?: Record<string, unknown>;
      unavailable?: unknown;
    };
  };
  links?: Record<string, string>;
}

export interface SliceMonitoringSummary {
  monitoring?: {
    configured?: boolean;
    prometheus?: {
      queries?: Record<string, unknown>;
      unavailable?: unknown;
    };
  };
  metrics?: {
    slice_status?: {
      label?: string;
      value?: unknown;
    };
    network_services?: unknown;
    wim_flows_per_second?: unknown;
    infrastructure?: unknown;
  };
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

  getSliceObservabilityCards(): Observable<SliceObservabilityCard[]> {
    return this.http.get<SliceObservabilityCard[]>(this.buildApiUrl('slice', 'observability'));
  }

  getSliceObservability(sliceId: string): Observable<SliceObservabilityCard> {
    return this.http.get<SliceObservabilityCard>(
      this.buildApiUrl('slice', sliceId, 'observability')
    );
  }

  getSliceMonitoringMetadata(sliceId: string): Observable<unknown> {
    return this.http.get(this.buildApiUrl('slice', sliceId, 'monitoring'));
  }

  getSliceMonitoringSummary(sliceId: string): Observable<SliceMonitoringSummary> {
    return this.http.get<SliceMonitoringSummary>(
      this.buildApiUrl('slice', sliceId, 'monitoring', 'summary')
    );
  }

  getSliceMonitoringRange(
    sliceId: string,
    metric: string,
    start: number,
    end: number,
    step = '30s'
  ): Observable<unknown> {
    const params = new HttpParams()
      .set('metric', metric)
      .set('start', String(start))
      .set('end', String(end))
      .set('step', step);

    return this.http.get(this.buildApiUrl('slice', sliceId, 'monitoring', 'range'), { params });
  }

  getSliceLogs(sliceId: string, logsLink?: string): Observable<string> {
    const url = this.getKatanaApiLink(logsLink) ?? this.buildApiUrl('slice', sliceId, 'logs');

    return this.http.get(url, { responseType: 'text' });
  }

  private getKatanaApiLink(link?: string): string | null {
    const trimmedLink = link?.trim();

    if (!trimmedLink) {
      return null;
    }

    if (trimmedLink.startsWith('/')) {
      return `${this.apiRoot}${trimmedLink}`;
    }

    if (trimmedLink.startsWith('api/')) {
      return `${this.apiRoot}/${trimmedLink}`;
    }

    try {
      const url = new URL(trimmedLink);
      const apiRootUrl = new URL(this.apiRoot);

      if (url.origin === apiRootUrl.origin && url.pathname.startsWith('/api/')) {
        return url.toString();
      }
    } catch {
      return null;
    }

    return null;
  }
}
