import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { K8sClusterRegistrationFormModel } from '../../../models/interfaces/k8s-cluster-registration-form.interface';
import { KatanaApiBaseService } from './katana-api-base.service';

@Injectable({ providedIn: 'root' })
export class KubernetesApiService extends KatanaApiBaseService {
  getK8sClusters(): Observable<unknown[]> {
    return this.http.get<unknown[]>(this.buildApiUrl('k8s'));
  }

  registerK8sCluster(payload: K8sClusterRegistrationFormModel | FormData): Observable<string> {
    return this.postText(this.buildApiUrl('k8s'), payload);
  }

  uploadK8sCredentials(file: File): Observable<string> {
    const payload = new FormData();
    payload.append('file', file);

    return this.registerK8sCluster(payload);
  }

  getK8sCluster(uuid: string): Observable<K8sClusterRegistrationFormModel> {
    return this.http.get<K8sClusterRegistrationFormModel>(this.buildApiUrl('k8s', uuid));
  }

  deleteK8sCluster(uuid: string): Observable<unknown> {
    return this.http.delete(this.buildApiUrl('k8s', uuid));
  }
}
