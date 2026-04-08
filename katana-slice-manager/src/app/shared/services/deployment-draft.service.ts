import { Injectable } from '@angular/core';
import {
  DeploymentDraftMap,
  DeploymentFormKey,
  DeploymentFormSnapshots,
  DeploymentFormState
} from '../../models/interfaces/deployment-draft.interface';
import { DeploymentOption } from '../../models/interfaces/deployment.interface';
import { DeploymentPack } from '../../models/interfaces/deployment-pack.interface';

const DEPLOYMENT_DRAFT_STORAGE_KEY = 'katana-slice-manager.deployment-drafts';
const DEPLOYMENT_HISTORY_CONTEXT_STORAGE_KEY = 'katana-slice-manager.deployment-history-context';

interface DeploymentHistoryContext {
  optionId: DeploymentOption['id'];
  formKeys: DeploymentFormKey[];
}

interface DeploymentStoredFormEntry {
  state?: Exclude<DeploymentFormState, 'missing'>;
  value: unknown;
}

type DeploymentStoredOptionDrafts = Partial<
  Record<DeploymentFormKey, unknown | DeploymentStoredFormEntry>
>;

type DeploymentStoredDraftMap = Partial<
  Record<DeploymentOption['id'], DeploymentStoredOptionDrafts>
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStoredFormEntry(value: unknown): value is DeploymentStoredFormEntry {
  return isRecord(value) && 'value' in value;
}

function createEmptyLike<T extends object>(fallback: T): T {
  return Object.fromEntries(
    Object.entries(fallback).map(([key, value]) => [key, emptyValueOf(value)])
  ) as T;
}

function emptyValueOf(value: unknown): unknown {
  if (typeof value === 'string') {
    return '';
  }

  if (typeof value === 'number') {
    return null;
  }

  if (typeof value === 'boolean') {
    return false;
  }

  if (Array.isArray(value)) {
    return [];
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, emptyValueOf(nestedValue)])
    );
  }

  return null;
}

@Injectable({ providedIn: 'root' })
export class DeploymentDraftService {
  getSavedFormSnapshot<T extends object>(
    optionId: DeploymentOption['id'],
    formKey: DeploymentFormKey
  ): Partial<T> | null {
    const savedValue = this.getStoredFormValue(optionId, formKey);
    return isRecord(savedValue) ? (savedValue as Partial<T>) : null;
  }

  getFormValue<T extends object>(
    optionId: DeploymentOption['id'],
    formKey: DeploymentFormKey,
    fallback: T
  ): T {
    const savedValue = this.getStoredFormValue(optionId, formKey);
    const historyContext = this.readHistoryContext();

    if (!isRecord(savedValue)) {
      if (this.isMissingHistorySnapshot(optionId, formKey, historyContext)) {
        return createEmptyLike(fallback);
      }

      return fallback;
    }

    return {
      ...createEmptyLike(fallback),
      ...savedValue
    } as T;
  }

  saveFormValue(
    optionId: DeploymentOption['id'],
    formKey: DeploymentFormKey,
    value: unknown,
    state: Exclude<DeploymentFormState, 'missing'> = 'draft'
  ): void {
    const storableValue = this.toStorableValue(value);

    if (storableValue === null) {
      return;
    }

    const drafts = this.readDrafts();
    const optionDrafts = drafts[optionId] ?? {};

    drafts[optionId] = {
      ...optionDrafts,
      [formKey]: {
        state,
        value: storableValue
      }
    };

    this.writeDrafts(drafts);

    const historyContext = this.readHistoryContext();
    if (historyContext?.optionId === optionId) {
      this.clearHistoryContext();
    }
  }

  getSnapshotsForOption(optionId: DeploymentOption['id']): DeploymentFormSnapshots {
    return Object.fromEntries(
      Object.entries(this.readDrafts()[optionId] ?? {}).flatMap(([formKey, entry]) => {
        const storedValue = isStoredFormEntry(entry) ? entry.value : entry;
        return storedValue === undefined ? [] : [[formKey, storedValue]];
      })
    ) as DeploymentFormSnapshots;
  }

  getFormState(
    optionId: DeploymentOption['id'],
    formKey: DeploymentFormKey
  ): DeploymentFormState {
    const entry = this.readDrafts()[optionId]?.[formKey];

    if (entry === undefined) {
      return 'missing';
    }

    if (isStoredFormEntry(entry)) {
      return entry.state ?? 'draft';
    }

    return 'active';
  }

  deactivateForm(optionId: DeploymentOption['id'], formKey: DeploymentFormKey): void {
    const drafts = this.readDrafts();
    const optionDrafts = drafts[optionId];

    if (!optionDrafts) {
      return;
    }

    const existingEntry = optionDrafts[formKey];

    if (existingEntry === undefined) {
      return;
    }

    const storedValue = isStoredFormEntry(existingEntry) ? existingEntry.value : existingEntry;

    drafts[optionId] = {
      ...optionDrafts,
      [formKey]: {
        state: 'draft',
        value: storedValue
      }
    };

    this.writeDrafts(drafts);
  }

  loadPackAsDraft(pack: DeploymentPack): void {
    const drafts = this.readDrafts();
    drafts[pack.optionId] = Object.fromEntries(
      Object.entries(pack.formSnapshots ?? {}).map(([formKey, value]) => [
        formKey,
        {
          state: 'draft',
          value
        }
      ])
    ) as DeploymentStoredOptionDrafts;

    this.writeDrafts(drafts);
    this.writeHistoryContext({
      optionId: pack.optionId,
      formKeys: Object.keys(pack.formSnapshots ?? {}) as DeploymentFormKey[]
    });
  }

  clearHistoryContext(): void {
    this.getStorage()?.removeItem(DEPLOYMENT_HISTORY_CONTEXT_STORAGE_KEY);
  }

  private toStorableValue(value: unknown): unknown | null {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return null;
    }
  }

  private getStoredFormValue(
    optionId: DeploymentOption['id'],
    formKey: DeploymentFormKey
  ): unknown {
    const entry = this.readDrafts()[optionId]?.[formKey];

    if (entry === undefined) {
      return undefined;
    }

    return isStoredFormEntry(entry) ? entry.value : entry;
  }

  private readDrafts(): DeploymentStoredDraftMap {
    const storage = this.getStorage();
    const rawValue = storage?.getItem(DEPLOYMENT_DRAFT_STORAGE_KEY);

    if (!rawValue) {
      return {};
    }

    try {
      const parsedValue = JSON.parse(rawValue) as DeploymentStoredDraftMap;
      return parsedValue && typeof parsedValue === 'object' ? parsedValue : {};
    } catch {
      return {};
    }
  }

  private writeDrafts(drafts: DeploymentStoredDraftMap): void {
    this.getStorage()?.setItem(DEPLOYMENT_DRAFT_STORAGE_KEY, JSON.stringify(drafts));
  }

  private isMissingHistorySnapshot(
    optionId: DeploymentOption['id'],
    formKey: DeploymentFormKey,
    historyContext: DeploymentHistoryContext | null
  ): boolean {
    return historyContext?.optionId === optionId && !historyContext.formKeys.includes(formKey);
  }

  private readHistoryContext(): DeploymentHistoryContext | null {
    const storage = this.getStorage();
    const rawValue = storage?.getItem(DEPLOYMENT_HISTORY_CONTEXT_STORAGE_KEY);

    if (!rawValue) {
      return null;
    }

    try {
      const parsedValue = JSON.parse(rawValue) as DeploymentHistoryContext;

      if (
        parsedValue &&
        typeof parsedValue === 'object' &&
        typeof parsedValue.optionId === 'string' &&
        Array.isArray(parsedValue.formKeys)
      ) {
        return parsedValue;
      }
    } catch {
      return null;
    }

    return null;
  }

  private writeHistoryContext(context: DeploymentHistoryContext): void {
    this.getStorage()?.setItem(DEPLOYMENT_HISTORY_CONTEXT_STORAGE_KEY, JSON.stringify(context));
  }

  private getStorage(): Storage | null {
    return typeof localStorage === 'undefined' ? null : localStorage;
  }
}
