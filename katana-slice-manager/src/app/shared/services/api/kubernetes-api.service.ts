import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { KatanaApiBaseService } from './katana-api-base.service';

@Injectable({ providedIn: 'root' })
export class KubernetesApiService extends KatanaApiBaseService {
  getK8sClusters(): Observable<unknown[]> {
    return this.http.get<unknown[]>(this.buildApiUrl('k8s'));
  }

  registerK8sCluster(payload: FormData | unknown): Observable<string> {
    return this.http.post<string>(this.buildApiUrl('k8s'), payload);
  }

  getK8sCluster(uuid: string): Observable<unknown> {
    return this.http.get(this.buildApiUrl('k8s', uuid));
  }

  deleteK8sCluster(uuid: string): Observable<unknown> {
    return this.http.delete(this.buildApiUrl('k8s', uuid));
  }
}
