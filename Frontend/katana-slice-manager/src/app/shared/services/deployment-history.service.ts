import { K8sOperation } from '../../models/interfaces/k8s-operation.interface';
import { Injectable, signal } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { DeploymentPack } from '../../models/interfaces/deployment-pack.interface';
import { redactStoredSecrets } from '../storage-redaction.utils';

const DEPLOYMENT_HISTORY_STORAGE_KEY = 'katana-slice-manager.deployment-history';

function createPackId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `pack-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

@Injectable({ providedIn: 'root' })
export class DeploymentHistoryService {
  readonly storageUnavailable = signal(false);
  private readonly packsSubject = new BehaviorSubject<DeploymentPack[]>(this.readPacks());

  readonly packs$ = this.packsSubject.asObservable();

  getPacks(): DeploymentPack[] {
    return this.packsSubject.value;
  }

  getPackById(packId: string): DeploymentPack | undefined {
    return this.packsSubject.value.find((pack) => pack.id === packId);
  }

  addPack(pack: Omit<DeploymentPack, 'id'>): DeploymentPack {
    const previous = pack.operationId
      ? this.getPacks().find((item) => item.operationId === pack.operationId)
      : undefined;
    const createdPack = redactStoredSecrets<DeploymentPack>({
      ...previous,
      ...pack,
      completedAt: previous?.completedAt ?? pack.completedAt,
      id: previous?.id ?? createPackId(),
    });

    const nextPacks = [createdPack, ...this.packsSubject.value.filter((item) => item.id !== createdPack.id)];
    this.writePacks(nextPacks);
    this.packsSubject.next(nextPacks);

    return createdPack;
  }

  updateOperation(operation: K8sOperation): void {
    const packs = this.getPacks().map((pack): DeploymentPack => pack.operationId === operation.operation_id
      ? { ...pack, operation, status: operation.phase === 'completed' ? 'done'
          : operation.phase === 'failed' ? 'failed' : operation.phase === 'unknown' ? 'unknown' : 'accepted' }
      : pack);
    this.writePacks(packs);
    this.packsSubject.next(packs);
  }

  clearPacks(): void {
    this.writePacks([]);
    this.packsSubject.next([]);
  }

  private readPacks(): DeploymentPack[] {
    try {
      const rawValue = this.getStorage()?.getItem(DEPLOYMENT_HISTORY_STORAGE_KEY);
      if (!rawValue) return [];
      const parsedValue = JSON.parse(rawValue) as DeploymentPack[];
      if (!Array.isArray(parsedValue)) {
        return [];
      }

      const validPacks = parsedValue.filter((pack) =>
        pack && typeof pack === 'object' && typeof pack.id === 'string' &&
        ['slice', 'k8s', 'proxmox', 'proxmox-standalone', 'amari'].includes(pack.optionId) &&
        typeof pack.completedAt === 'string' && Number.isFinite(Date.parse(pack.completedAt)) &&
        Array.isArray(pack.requirements) && pack.requirements.every((requirement) =>
          requirement && typeof requirement.id === 'string' && typeof requirement.label === 'string'),
      );
      const redactedValue = redactStoredSecrets(validPacks);
      const serializedValue = JSON.stringify(redactedValue);
      if (serializedValue !== rawValue) {
        this.writePacks(redactedValue);
      }
      return redactedValue;
    } catch (error) {
      if (!(error instanceof SyntaxError)) this.storageUnavailable.set(true);
      return [];
    }
  }

  private writePacks(packs: DeploymentPack[]): void {
    try {
      this.getStorage()?.setItem(
        DEPLOYMENT_HISTORY_STORAGE_KEY,
        JSON.stringify(redactStoredSecrets(packs)),
      );
    } catch {
      this.storageUnavailable.set(true);
    }
  }

  private getStorage(): Storage | null {
    if (this.storageUnavailable()) return null;
    if (typeof localStorage === 'undefined') {
      this.storageUnavailable.set(true);
      return null;
    }
    return localStorage;
  }
}
