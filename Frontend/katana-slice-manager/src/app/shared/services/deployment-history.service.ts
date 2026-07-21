import { Injectable } from '@angular/core';
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
  private readonly packsSubject = new BehaviorSubject<DeploymentPack[]>(this.readPacks());

  readonly packs$ = this.packsSubject.asObservable();

  getPacks(): DeploymentPack[] {
    return this.packsSubject.value;
  }

  getPackById(packId: string): DeploymentPack | undefined {
    return this.packsSubject.value.find((pack) => pack.id === packId);
  }

  addPack(pack: Omit<DeploymentPack, 'id'>): DeploymentPack {
    const createdPack = redactStoredSecrets<DeploymentPack>({
      ...pack,
      id: createPackId(),
    });

    const nextPacks = [createdPack, ...this.packsSubject.value];
    this.writePacks(nextPacks);
    this.packsSubject.next(nextPacks);

    return createdPack;
  }

  clearPacks(): void {
    this.writePacks([]);
    this.packsSubject.next([]);
  }

  private readPacks(): DeploymentPack[] {
    const storage = this.getStorage();
    const rawValue = storage?.getItem(DEPLOYMENT_HISTORY_STORAGE_KEY);

    if (!rawValue) {
      return [];
    }

    try {
      const parsedValue = JSON.parse(rawValue) as DeploymentPack[];
      if (!Array.isArray(parsedValue)) {
        return [];
      }

      const redactedValue = redactStoredSecrets(parsedValue);
      const serializedValue = JSON.stringify(redactedValue);
      if (serializedValue !== rawValue) {
        storage?.setItem(DEPLOYMENT_HISTORY_STORAGE_KEY, serializedValue);
      }
      return redactedValue;
    } catch {
      return [];
    }
  }

  private writePacks(packs: DeploymentPack[]): void {
    this.getStorage()?.setItem(
      DEPLOYMENT_HISTORY_STORAGE_KEY,
      JSON.stringify(redactStoredSecrets(packs)),
    );
  }

  private getStorage(): Storage | null {
    return typeof localStorage === 'undefined' ? null : localStorage;
  }
}
