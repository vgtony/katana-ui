import { ChangeDetectorRef, Component, NgZone, inject } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize, map, switchMap } from 'rxjs';
import {
  PROXMOX_STANDALONE_API_BASE_URL,
  ProxmoxStandaloneApiService,
  ProxmoxStandaloneAuthPayload,
  getApiErrorMessage
} from '../../shared/services/api';

type AuthMethod = 'password' | 'token';

interface NodeCapacityFormValue {
  node: string;
  cpuRemaining: string;
  ramRemaining: string;
  diskRemaining: string;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Component({
  selector: 'app-proxmox-api-page',
  imports: [ReactiveFormsModule],
  templateUrl: './proxmox-api-page.component.html',
  styleUrl: './proxmox-api-page.component.scss'
})
export class ProxmoxApiPageComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly ngZone = inject(NgZone);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly proxmoxStandaloneApi = inject(ProxmoxStandaloneApiService);

  protected readonly baseUrl = PROXMOX_STANDALONE_API_BASE_URL;
  protected submitting = false;
  protected submitMessage = '';
  protected submitError = '';
  protected lastLoadedNodeCount = 0;

  protected readonly form = this.formBuilder.nonNullable.group({
    name: ['', Validators.required],
    url: ['', Validators.required],
    verifySsl: false,
    authMethod: 'password' as AuthMethod,
    username: '',
    password: '',
    apiTokenId: '',
    apiTokenSecret: ''
  });

  protected readonly nodeForms = this.formBuilder.array<FormGroup>([]);

  protected get authMethod(): AuthMethod {
    return this.form.controls.authMethod.getRawValue();
  }

  protected get hasLoadedNodes(): boolean {
    return this.nodeForms.length > 0;
  }

  protected submit(): void {
    this.submitMessage = '';
    this.submitError = '';

    if (this.form.invalid || !this.hasAuthenticationValues()) {
      this.form.markAllAsTouched();

      if (!this.hasAuthenticationValues()) {
        this.submitError =
          this.authMethod === 'password'
            ? 'Enter both username and password to continue.'
            : 'Enter both token id and token secret to continue.';
      }

      return;
    }

    const payload = this.buildPayload();

    if (!payload) {
      this.submitError = 'Unable to build the Proxmox authentication payload.';
      return;
    }

    this.submitting = true;

    this.proxmoxStandaloneApi
      .connect(payload)
      .pipe(
        switchMap((connectResponse) =>
          this.proxmoxStandaloneApi.getOverview(payload).pipe(map((overviewResponse) => ({ connectResponse, overviewResponse })))
        ),
        finalize(() =>
          this.ngZone.run(() => {
            this.submitting = false;
            this.changeDetectorRef.detectChanges();
          })
        )
      )
      .subscribe({
        next: ({ connectResponse, overviewResponse }) => {
          this.ngZone.run(() => {
            const nodeForms = this.buildNodeForms(connectResponse, overviewResponse);
            this.replaceNodeForms(nodeForms);
            this.lastLoadedNodeCount = nodeForms.length;
            this.submitMessage =
              nodeForms.length > 0
                ? `Loaded ${nodeForms.length} Proxmox node forms from the standalone API.`
                : 'Authentication succeeded, but no Proxmox nodes were returned.';
            this.submitError = '';
            this.changeDetectorRef.detectChanges();
          });
        },
        error: (error: unknown) => {
          this.ngZone.run(() => {
            this.submitError = getApiErrorMessage(error, 'Unable to load Proxmox nodes.');
            this.changeDetectorRef.detectChanges();
          });
        }
      });
  }

  protected trackNodeForm(index: number): string {
    return this.nodeForms.at(index)?.get('node')?.value ?? String(index);
  }

  private hasAuthenticationValues(): boolean {
    const values = this.form.getRawValue();

    if (values.authMethod === 'password') {
      return !!values.username.trim() && !!values.password.trim();
    }

    return !!values.apiTokenId.trim() && !!values.apiTokenSecret.trim();
  }

  private buildPayload(): ProxmoxStandaloneAuthPayload | null {
    const values = this.form.getRawValue();
    const basePayload: ProxmoxStandaloneAuthPayload = {
      name: values.name.trim(),
      url: values.url.trim(),
      verify_ssl: values.verifySsl
    };

    if (!basePayload.name || !basePayload.url) {
      return null;
    }

    if (values.authMethod === 'password') {
      if (!values.username.trim() || !values.password.trim()) {
        return null;
      }

      return {
        ...basePayload,
        username: values.username.trim(),
        password: values.password
      };
    }

    if (!values.apiTokenId.trim() || !values.apiTokenSecret.trim()) {
      return null;
    }

    return {
      ...basePayload,
      api_token_id: values.apiTokenId.trim(),
      api_token_secret: values.apiTokenSecret
    };
  }

  private buildNodeForms(connectResponse: unknown, overviewResponse: unknown): NodeCapacityFormValue[] {
    const nodeNames = new Set<string>([
      ...this.extractNodeNames(connectResponse),
      ...this.extractNodeNames(overviewResponse),
      ...this.extractNodeNames(this.readPath(overviewResponse, 'servers'))
    ]);
    const capacities = new Map<string, NodeCapacityFormValue>();

    this.extractCapacityEntries(this.readPath(overviewResponse, 'remaining_resources')).forEach((entry) => {
      capacities.set(entry.node, entry);
      nodeNames.add(entry.node);
    });

    this.extractCapacityEntries(this.readPath(overviewResponse, 'servers')).forEach((entry) => {
      if (!capacities.has(entry.node)) {
        capacities.set(entry.node, entry);
      }

      nodeNames.add(entry.node);
    });

    return Array.from(nodeNames)
      .filter((node) => !!node.trim())
      .sort((left, right) => left.localeCompare(right))
      .map((node) => capacities.get(node) ?? this.createEmptyNodeForm(node));
  }

  private replaceNodeForms(nodeForms: NodeCapacityFormValue[]): void {
    this.nodeForms.clear();

    nodeForms.forEach((nodeForm) => {
      this.nodeForms.push(
        this.formBuilder.nonNullable.group({
          node: nodeForm.node,
          cpuRemaining: nodeForm.cpuRemaining,
          ramRemaining: nodeForm.ramRemaining,
          diskRemaining: nodeForm.diskRemaining
        })
      );
    });
  }

  private extractNodeNames(source: unknown): string[] {
    if (Array.isArray(source)) {
      return source
        .map((entry) => {
          if (typeof entry === 'string') {
            return entry.trim();
          }

          if (!isRecord(entry)) {
            return '';
          }

          return this.extractNodeName(entry) ?? '';
        })
        .filter((node) => !!node);
    }

    if (!isRecord(source)) {
      return [];
    }

    const nestedSources = ['nodes', 'data', 'servers']
      .map((key) => source[key])
      .flatMap((value) => this.extractNodeNames(value));

    if (nestedSources.length > 0) {
      return nestedSources;
    }

    const objectEntries = Object.entries(source);

    const wrapperKeys = new Set([
      'data',
      'nodes',
      'servers',
      'clusters',
      'vms',
      'usage',
      'remaining_resources',
      'remainingResources'
    ]);

    if (objectEntries.length > 0 && objectEntries.every(([key, value]) => !wrapperKeys.has(key) && isRecord(value))) {
      return objectEntries.map(([key, value]) => (isRecord(value) ? this.extractNodeName(value) ?? key : key));
    }

    const directNodeName = this.extractNodeName(source);

    return directNodeName ? [directNodeName] : [];
  }

  private extractCapacityEntries(source: unknown): NodeCapacityFormValue[] {
    if (Array.isArray(source)) {
      return source
        .map((entry) => this.normalizeCapacityEntry(entry))
        .filter((entry): entry is NodeCapacityFormValue => entry !== null);
    }

    if (!isRecord(source)) {
      return [];
    }

    const directEntry = this.normalizeCapacityEntry(source);

    if (directEntry) {
      return [directEntry];
    }

    return Object.entries(source)
      .map(([key, value]) => this.normalizeCapacityEntry(value, key))
      .filter((entry): entry is NodeCapacityFormValue => entry !== null);
  }

  private normalizeCapacityEntry(source: unknown, fallbackNode?: string): NodeCapacityFormValue | null {
    if (!isRecord(source)) {
      return fallbackNode ? this.createEmptyNodeForm(fallbackNode) : null;
    }

    const node = this.extractNodeName(source) ?? fallbackNode;

    if (!node) {
      return null;
    }

    const nestedRemaining =
      this.pickRecord(source, ['remaining_resources', 'remainingResources', 'remaining', 'resources']) ?? source;

    return {
      node,
      cpuRemaining:
        this.extractMetricValue([nestedRemaining, source], [
          'cpu_remaining',
          'cpuRemaining',
          'remaining_cpu',
          'remainingCpu',
          'cpu_available',
          'cpuAvailable',
          'cpus_remaining'
        ]) ?? '—',
      ramRemaining:
        this.extractMetricValue([nestedRemaining, source], [
          'ram_remaining',
          'ramRemaining',
          'remaining_ram',
          'remainingRam',
          'memory_remaining',
          'memoryRemaining',
          'available_ram',
          'available_memory'
        ]) ?? '—',
      diskRemaining:
        this.extractMetricValue([nestedRemaining, source], [
          'disk_remaining',
          'diskRemaining',
          'remaining_disk',
          'remainingDisk',
          'storage_remaining',
          'storageRemaining',
          'available_disk',
          'available_storage'
        ]) ?? '—'
    };
  }

  private extractNodeName(source: UnknownRecord): string | null {
    const candidates = ['node', 'name', 'server', 'hostname', 'id'];

    for (const candidate of candidates) {
      const value = source[candidate];

      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return null;
  }

  private pickRecord(source: UnknownRecord, keys: string[]): UnknownRecord | null {
    for (const key of keys) {
      const value = source[key];

      if (isRecord(value)) {
        return value;
      }
    }

    return null;
  }

  private extractMetricValue(sources: UnknownRecord[], keys: string[]): string | null {
    for (const source of sources) {
      for (const key of keys) {
        const value = source[key];
        const normalizedValue = this.stringifyMetric(value);

        if (normalizedValue !== null) {
          return normalizedValue;
        }
      }
    }

    return null;
  }

  private stringifyMetric(value: unknown): string | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (isRecord(value)) {
      for (const key of ['remaining', 'available', 'free', 'value']) {
        const nestedValue = value[key];

        if (typeof nestedValue === 'number' && Number.isFinite(nestedValue)) {
          return String(nestedValue);
        }

        if (typeof nestedValue === 'string' && nestedValue.trim()) {
          return nestedValue.trim();
        }
      }
    }

    return null;
  }

  private readPath(source: unknown, key: string): unknown {
    if (!isRecord(source)) {
      return null;
    }

    return source[key] ?? this.readPath(source['data'], key);
  }

  private createEmptyNodeForm(node: string): NodeCapacityFormValue {
    return {
      node,
      cpuRemaining: '—',
      ramRemaining: '—',
      diskRemaining: '—'
    };
  }
}
