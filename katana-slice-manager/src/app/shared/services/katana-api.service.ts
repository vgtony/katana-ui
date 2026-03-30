import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class KatanaApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBase;

  // ─── Slice ────────────────────────────────────────────────────────────────

  getSlices(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/slice`);
  }

  createSlice(payload: unknown): Observable<any> {
    return this.http.post(`${this.base}/slice`, payload);
  }

  getSlice(sliceId: string): Observable<any> {
    return this.http.get(`${this.base}/slice/${sliceId}`);
  }

  deleteSlice(sliceId: string): Observable<any> {
    return this.http.delete(`${this.base}/slice/${sliceId}`);
  }

  getSliceDeploymentTime(sliceId: string): Observable<any> {
    return this.http.get(`${this.base}/slice/${sliceId}/time`);
  }

  modifySlice(sliceId: string, payload: unknown): Observable<any> {
    return this.http.post(`${this.base}/slice/${sliceId}/modify`, payload);
  }

  getSliceErrors(sliceId: string): Observable<any> {
    return this.http.get(`${this.base}/slice/${sliceId}/errors`);
  }

  // ─── VIM ──────────────────────────────────────────────────────────────────

  getVims(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/vim`);
  }

  createVim(payload: unknown): Observable<any> {
    return this.http.post(`${this.base}/vim`, payload);
  }

  getVim(vimId: string): Observable<any> {
    return this.http.get(`${this.base}/vim/${vimId}`);
  }

  updateVim(vimId: string, payload: unknown): Observable<any> {
    return this.http.put(`${this.base}/vim/${vimId}`, payload);
  }

  deleteVim(vimId: string): Observable<any> {
    return this.http.delete(`${this.base}/vim/${vimId}`);
  }

  // ─── NFVO ─────────────────────────────────────────────────────────────────

  getNfvos(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/nfvo`);
  }

  createNfvo(payload: unknown): Observable<any> {
    return this.http.post(`${this.base}/nfvo`, payload);
  }

  getNfvo(nfvoId: string): Observable<any> {
    return this.http.get(`${this.base}/nfvo/${nfvoId}`);
  }

  updateNfvo(nfvoId: string, payload: unknown): Observable<any> {
    return this.http.put(`${this.base}/nfvo/${nfvoId}`, payload);
  }

  deleteNfvo(nfvoId: string): Observable<any> {
    return this.http.delete(`${this.base}/nfvo/${nfvoId}`);
  }

  // ─── WIM ──────────────────────────────────────────────────────────────────

  getWims(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/wim`);
  }

  createWim(payload: unknown): Observable<any> {
    return this.http.post(`${this.base}/wim`, payload);
  }

  getWim(wimId: string): Observable<any> {
    return this.http.get(`${this.base}/wim/${wimId}`);
  }

  updateWim(wimId: string, payload: unknown): Observable<any> {
    return this.http.put(`${this.base}/wim/${wimId}`, payload);
  }

  deleteWim(wimId: string): Observable<any> {
    return this.http.delete(`${this.base}/wim/${wimId}`);
  }

  // ─── EMS ──────────────────────────────────────────────────────────────────

  getEmsList(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/ems`);
  }

  createEms(payload: unknown): Observable<any> {
    return this.http.post(`${this.base}/ems`, payload);
  }

  getEms(emsId: string): Observable<any> {
    return this.http.get(`${this.base}/ems/${emsId}`);
  }

  updateEms(emsId: string, payload: unknown): Observable<any> {
    return this.http.put(`${this.base}/ems/${emsId}`, payload);
  }

  deleteEms(emsId: string): Observable<any> {
    return this.http.delete(`${this.base}/ems/${emsId}`);
  }

  // ─── GST ──────────────────────────────────────────────────────────────────

  getGsts(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/gst`);
  }

  getGst(gstId: string): Observable<any> {
    return this.http.get(`${this.base}/gst/${gstId}`);
  }

  // ─── Base Slice Descriptors ───────────────────────────────────────────────

  getBaseSliceDescriptors(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/base_slice_des`);
  }

  createBaseSliceDescriptor(payload: unknown): Observable<any> {
    return this.http.post(`${this.base}/base_slice_des`, payload);
  }

  getBaseSliceDescriptor(id: string): Observable<any> {
    return this.http.get(`${this.base}/base_slice_des/${id}`);
  }

  updateBaseSliceDescriptor(id: string, payload: unknown): Observable<any> {
    return this.http.put(`${this.base}/base_slice_des/${id}`, payload);
  }

  deleteBaseSliceDescriptor(id: string): Observable<any> {
    return this.http.delete(`${this.base}/base_slice_des/${id}`);
  }

  // ─── Network Functions ────────────────────────────────────────────────────

  getFunctions(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/function`);
  }

  createFunction(payload: unknown): Observable<any> {
    return this.http.post(`${this.base}/function`, payload);
  }

  getFunction(funcId: string): Observable<any> {
    return this.http.get(`${this.base}/function/${funcId}`);
  }

  updateFunction(funcId: string, payload: unknown): Observable<any> {
    return this.http.put(`${this.base}/function/${funcId}`, payload);
  }

  deleteFunction(funcId: string): Observable<any> {
    return this.http.delete(`${this.base}/function/${funcId}`);
  }

  // ─── Policy ───────────────────────────────────────────────────────────────

  getPolicies(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/policy`);
  }

  createPolicy(payload: unknown): Observable<any> {
    return this.http.post(`${this.base}/policy`, payload);
  }

  getPolicy(policyId: string): Observable<any> {
    return this.http.get(`${this.base}/policy/${policyId}`);
  }

  updatePolicy(policyId: string, payload: unknown): Observable<any> {
    return this.http.put(`${this.base}/policy/${policyId}`, payload);
  }

  deletePolicy(policyId: string): Observable<any> {
    return this.http.delete(`${this.base}/policy/${policyId}`);
  }

  getNeatPolicy(sliceId: string): Observable<any> {
    return this.http.get(`${this.base}/policy/neat/${sliceId}`);
  }

  apexPolicyAction(payload: unknown): Observable<any> {
    return this.http.post(`${this.base}/policy/apex/action`, payload);
  }

  // ─── Resources ────────────────────────────────────────────────────────────

  getResources(): Observable<any> {
    return this.http.get(`${this.base}/resources`);
  }

  getResourcesByLocation(location: string): Observable<any> {
    return this.http.get(`${this.base}/resources/${location}`);
  }

  triggerResourceUpdate(): Observable<any> {
    return this.http.get(`${this.base}/resources/update`);
  }

  triggerResourceUpdatePost(payload?: unknown): Observable<any> {
    return this.http.post(`${this.base}/resources/update`, payload ?? {});
  }

  // ─── NS List ──────────────────────────────────────────────────────────────

  getNsList(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/nslist`);
  }

  // ─── Bootstrap ────────────────────────────────────────────────────────────

  bootstrap(payload: unknown): Observable<any> {
    return this.http.post(`${this.base}/bootstrap`, payload);
  }

  // ─── Locations ────────────────────────────────────────────────────────────

  getLocations(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/location`);
  }

  createLocation(payload: unknown): Observable<any> {
    return this.http.post(`${this.base}/location`, payload);
  }

  getLocation(id: string): Observable<any> {
    return this.http.get(`${this.base}/location/${id}`);
  }

  updateLocation(id: string, payload: unknown): Observable<any> {
    return this.http.put(`${this.base}/location/${id}`, payload);
  }

  deleteLocation(id: string): Observable<any> {
    return this.http.delete(`${this.base}/location/${id}`);
  }

  // ─── Alerts ───────────────────────────────────────────────────────────────

  receivAlert(payload: unknown): Observable<any> {
    return this.http.post(`${this.base}/alert`, payload);
  }

  // ─── Kubernetes ───────────────────────────────────────────────────────────

  getK8sClusters(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/k8s`);
  }

  registerK8sCluster(payload: unknown): Observable<any> {
    return this.http.post(`${this.base}/k8s`, payload);
  }

  getK8sCluster(uuid: string): Observable<any> {
    return this.http.get(`${this.base}/k8s/${uuid}`);
  }

  deleteK8sCluster(uuid: string): Observable<any> {
    return this.http.delete(`${this.base}/k8s/${uuid}`);
  }

  // ─── Level of Trust (LoT) ─────────────────────────────────────────────────

  getLotMonitors(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/lot`);
  }

  createLotMonitor(payload: unknown): Observable<any> {
    return this.http.post(`${this.base}/lot`, payload);
  }

  getLotMonitor(uuid: string): Observable<any> {
    return this.http.get(`${this.base}/lot/${uuid}`);
  }

  // ─── InitSGC ──────────────────────────────────────────────────────────────

  initSgc(payload: unknown): Observable<any> {
    return this.http.post(`${this.base}/initsgc`, payload);
  }

  // ─── Trust Level ──────────────────────────────────────────────────────────

  getTrustLevel(): Observable<any> {
    return this.http.get(`${this.base}/trustlevel`);
  }

  // ─── PAO Security ─────────────────────────────────────────────────────────

  mitigateAttack(payload: unknown): Observable<any> {
    return this.http.post(`${this.base}/mitigate`, payload);
  }

  reportRecovered(payload: unknown): Observable<any> {
    return this.http.post(`${this.base}/recovered`, payload);
  }
}
