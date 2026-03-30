import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

type ApiPathSegment = string | number | boolean;

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, '');
}

function encodePathSegment(segment: ApiPathSegment): string {
  return encodeURIComponent(trimSlashes(String(segment)));
}

export abstract class KatanaApiBaseService {
  protected readonly http = inject(HttpClient);

  private readonly configuredApiBase = withoutTrailingSlash(environment.apiBase);

  protected readonly apiBase = this.configuredApiBase;
  protected readonly apiRoot = this.configuredApiBase.endsWith('/api')
    ? this.configuredApiBase.slice(0, -4)
    : this.configuredApiBase;

  protected buildApiUrl(...segments: ApiPathSegment[]): string {
    return this.buildUrl(this.apiBase, segments);
  }

  protected buildRootUrl(...segments: ApiPathSegment[]): string {
    return this.buildUrl(this.apiRoot, segments);
  }

  private buildUrl(base: string, segments: ApiPathSegment[]): string {
    const normalizedSegments = segments.map(encodePathSegment);

    if (normalizedSegments.length === 0) {
      return base || '/';
    }

    if (!base) {
      return `/${normalizedSegments.join('/')}`;
    }

    return `${base}/${normalizedSegments.join('/')}`;
  }
}
