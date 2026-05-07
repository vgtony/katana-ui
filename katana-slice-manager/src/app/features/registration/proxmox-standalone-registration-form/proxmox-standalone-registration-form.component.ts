import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, NgZone, input, inject, output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, finalize, of, switchMap } from 'rxjs';
import {
  ProxmoxStandaloneVmTarget,
  ProxmoxVmTemplateOption
} from '../../../models/interfaces/proxmox-standalone-vm-target.interface';
import { ProxmoxClusterRegistrationFormModel } from '../../../models/interfaces/proxmox-cluster-registration-form.interface';
import {
  DeploymentAttemptEvent,
  ProxmoxVmCreationFormComponent
} from '../proxmox-vm-creation-form/proxmox-vm-creation-form.component';
import {
  ProxmoxApiService,
  getApiErrorMessage
} from '../../../shared/services/api';
import { DeploymentDraftService } from '../../../shared/services/deployment-draft.service';

type AuthMethod = 'password' | 'token';
type UnknownRecord = Record<string, unknown>;

interface ProxmoxStandaloneSnapshot {
  url: string;
  verifySsl: boolean;
  authMethod: AuthMethod;
  username: string;
  password: string;
  apiTokenId: string;
  apiTokenSecret: string;
  clusterId: string;
  clusterName: string;
  datacenters: unknown[];
  selectedDatacenter: UnknownRecord | null;
  nodes: unknown[];
  servers: unknown[];
  overview: unknown;
  loadedAt: string;
}

interface CompactDatacenterView {
  id: string;
  name: string;
  nodeCount: string;
}

interface CompactServerView {
  key: string;
  name: string;
  node: string;
  cpu: string;
  memory: string;
  disk: string;
  storage: CompactStorageView[];
  isoImages: string[];
  templateOptions: ProxmoxVmTemplateOption[];
}

interface CompactStorageView {
  name: string;
  type: string;
  node: string;
  remaining: string;
  used: string;
  total: string;
  isoImages: string[];
}

interface CompactResultsView {
  clusterName: string;
  connectedNodes: string[];
  datacenters: CompactDatacenterView[];
  selectedDatacenter: CompactDatacenterView | null;
  servers: CompactServerView[];
  clusterCpu: string;
  clusterMemory: string;
  clusterDisk: string;
  storage: CompactStorageView[];
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const initialSnapshot: ProxmoxStandaloneSnapshot = {
  url: 'https://10.160.100.11:8006',
  verifySsl: false,
  authMethod: 'password',
  username: 'root@pam',
  password: '',
  apiTokenId: '',
  apiTokenSecret: '',
  clusterId: '',
  clusterName: '',
  datacenters: [],
  selectedDatacenter: null,
  nodes: [],
  servers: [],
  overview: null,
  loadedAt: ''
};

@Component({
  selector: 'app-proxmox-standalone-registration-form',
  imports: [ReactiveFormsModule, ProxmoxVmCreationFormComponent],
  templateUrl: './proxmox-standalone-registration-form.component.html',
  styleUrl: './proxmox-standalone-registration-form.component.scss'
})
export class ProxmoxStandaloneRegistrationFormComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly ngZone = inject(NgZone);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly proxmoxApi = inject(ProxmoxApiService);
  private readonly deploymentDraftService = inject(DeploymentDraftService);

  readonly compactOnly = input(false);
  readonly completed = output<void>();
  readonly failed = output<void>();
  readonly deployed = output<DeploymentAttemptEvent>();

  protected readonly model = this.deploymentDraftService.getFormValue(
    'proxmox-standalone',
    'proxmox-standalone',
    initialSnapshot
  );
  protected readonly savedState = this.deploymentDraftService.getFormState(
    'proxmox-standalone',
    'proxmox-standalone'
  );
  protected readonly restoreMessage =
    this.savedState === 'active'
      ? 'Active standalone Proxmox registration loaded.'
      : this.savedState === 'draft'
        ? 'Saved standalone Proxmox draft restored.'
        : '';
  protected submitting = false;
  protected submitSucceeded = false;
  protected submitMessage = '';
  protected submitError = '';
  protected loadingMessage = '';
  protected resultsView: CompactResultsView | null = this.buildResultsView(this.model);
  protected selectedVmTargets: ProxmoxStandaloneVmTarget[] = [];
  protected readonly selectedServerNames = new Set<string>();
  protected currentSnapshot: ProxmoxStandaloneSnapshot = this.model;

  protected readonly form = this.formBuilder.nonNullable.group({
    url: [this.model.url, Validators.required],
    verifySsl: this.model.verifySsl,
    authMethod: this.model.authMethod,
    username: [this.model.username, Validators.required],
    password: [this.model.password, Validators.required],
    apiTokenId: this.model.apiTokenId,
    apiTokenSecret: this.model.apiTokenSecret
  });

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.deploymentDraftService.saveFormValue(
        'proxmox-standalone',
        'proxmox-standalone',
        {
          url: this.form.controls.url.getRawValue(),
          verifySsl: this.form.controls.verifySsl.getRawValue(),
          authMethod: this.form.controls.authMethod.getRawValue(),
          username: this.form.controls.username.getRawValue(),
          password: this.form.controls.password.getRawValue(),
          apiTokenId: this.form.controls.apiTokenId.getRawValue(),
          apiTokenSecret: this.form.controls.apiTokenSecret.getRawValue(),
          clusterId: this.currentSnapshot.clusterId,
          clusterName: this.currentSnapshot.clusterName,
          datacenters: this.currentSnapshot.datacenters,
          selectedDatacenter: this.currentSnapshot.selectedDatacenter,
          nodes: this.currentSnapshot.nodes,
          servers: this.currentSnapshot.servers,
          overview: this.currentSnapshot.overview,
          loadedAt: this.currentSnapshot.loadedAt
        } satisfies ProxmoxStandaloneSnapshot,
        'draft'
      );
    });
  }

  protected get authMethod(): AuthMethod {
    return this.form.controls.authMethod.getRawValue();
  }

  protected get hasResults(): boolean {
    return this.resultsView !== null;
  }

  protected isServerSelected(serverName: string): boolean {
    return this.selectedServerNames.has(serverName);
  }

  protected isDatacenterSelected(datacenterId: string): boolean {
    return this.resultsView?.selectedDatacenter?.id === datacenterId;
  }

  protected chooseServer(serverName: string): void {
    if (!this.compactOnly()) {
      return;
    }

    this.selectedServerNames.clear();
    this.selectedServerNames.add(serverName);
    this.syncSelectedVmTargets();
  }

  protected clearServerSelection(): void {
    this.selectedServerNames.clear();
    this.syncSelectedVmTargets();
  }

  protected selectDatacenter(datacenter: CompactDatacenterView): void {
    if (!this.currentSnapshot.clusterId || this.submitting) {
      return;
    }

    this.submitting = true;
    this.loadingMessage = `Loading ${datacenter.name} and the deployment overview…`;
    this.submitError = '';
    this.selectedServerNames.clear();
    this.selectedVmTargets = [];

    this.proxmoxApi
      .connect({
        cluster_id: this.currentSnapshot.clusterId,
        datacenter_id: datacenter.id
      })
      .pipe(
        catchError(() =>
          this.proxmoxApi.connect({
            cluster_id: this.currentSnapshot.clusterId,
            datacenter_name: datacenter.name
          })
        ),
        switchMap((connectResponse) =>
          this.proxmoxApi.getOverview({ cluster_id: this.currentSnapshot.clusterId }).pipe(
            switchMap((overviewResponse) =>
              of({
                connectResponse,
                overviewResponse
              })
            )
          )
        ),
        finalize(() =>
          this.ngZone.run(() => {
            this.submitting = false;
            this.loadingMessage = '';
            this.changeDetectorRef.detectChanges();
          })
        )
      )
      .subscribe({
        next: ({ connectResponse, overviewResponse }) => {
          this.ngZone.run(() => {
            const selectedDatacenter = isRecord(connectResponse.selected_datacenter)
              ? connectResponse.selected_datacenter
              : { id: datacenter.id, name: datacenter.name };
            const snapshot: ProxmoxStandaloneSnapshot = {
              ...this.currentSnapshot,
              selectedDatacenter,
              nodes: connectResponse.nodes,
              servers: connectResponse.servers,
              overview: overviewResponse,
              loadedAt: new Date().toISOString()
            };

            this.currentSnapshot = snapshot;
            this.resultsView = this.buildResultsView(snapshot);
            this.syncSelectedVmTargets();
            this.deploymentDraftService.saveFormValue(
              'proxmox-standalone',
              'proxmox-standalone',
              snapshot,
              'active'
            );
            this.submitSucceeded = true;
            this.submitMessage = `Loaded ${datacenter.name}. Select a server to continue.`;
            this.completed.emit();
            this.changeDetectorRef.detectChanges();
          });
        },
        error: (error: unknown) => {
          this.ngZone.run(() => {
            this.submitSucceeded = false;
            this.submitError = getApiErrorMessage(
              error,
              'Unable to connect to the selected datacenter.'
            );
            this.failed.emit();
            this.changeDetectorRef.detectChanges();
          });
        }
      });
  }

  protected handleVmDeployed(event: DeploymentAttemptEvent): void {
    this.deployed.emit(event);

    if (event.status !== 'done' || !this.currentSnapshot.clusterId || !this.resultsView?.selectedDatacenter) {
      return;
    }

    this.proxmoxApi.getOverview({ cluster_id: this.currentSnapshot.clusterId }).subscribe({
      next: (overviewResponse) => {
        this.ngZone.run(() => {
          const snapshot: ProxmoxStandaloneSnapshot = {
            ...this.currentSnapshot,
            overview: overviewResponse,
            loadedAt: new Date().toISOString()
          };

          this.currentSnapshot = snapshot;
          this.resultsView = this.buildResultsView(snapshot);
          this.syncSelectedVmTargets();
          this.deploymentDraftService.saveFormValue(
            'proxmox-standalone',
            'proxmox-standalone',
            snapshot,
            'active'
          );
          this.changeDetectorRef.detectChanges();
        });
      }
    });
  }

  protected submit(): void {
    this.submitSucceeded = false;
    this.submitMessage = '';
    this.submitError = '';

    if (this.form.invalid || !this.hasAuthenticationValues()) {
      this.form.markAllAsTouched();
      this.submitError = 'Enter the Proxmox URL, username, and password to continue.';
      return;
    }

    if (this.isUsingLoadedActiveRegistration() && this.resultsView) {
      this.submitSucceeded = true;
      this.submitMessage = this.resultsView.selectedDatacenter
        ? `Using the existing ${this.resultsView.selectedDatacenter.name} overview.`
        : 'Using the existing active standalone Proxmox registration.';
      this.completed.emit();
      this.changeDetectorRef.detectChanges();
      return;
    }

    const payload = this.buildClusterRegistrationPayload();

    if (!payload) {
      this.submitError = 'Unable to build the Proxmox registration payload.';
      return;
    }

    this.submitting = true;
    this.loadingMessage = 'Registering the cluster and loading datacenters…';

    this.proxmoxApi
      .createCluster(payload)
      .pipe(
        catchError((error: unknown) => {
          if (error instanceof HttpErrorResponse && error.status === 409 && isRecord(error.error)) {
            return of(error.error);
          }

          throw error;
        }),
        finalize(() =>
          this.ngZone.run(() => {
            this.submitting = false;
            this.loadingMessage = '';
            this.changeDetectorRef.detectChanges();
          })
        )
      )
      .subscribe({
        next: (response) => {
          this.ngZone.run(() => {
            const clusterId = this.stringify(response['cluster_id']) ?? '';
            const clusterName = this.stringify(response['cluster_name']) ?? '';
            const snapshot: ProxmoxStandaloneSnapshot = {
              url: this.form.controls.url.getRawValue(),
              verifySsl: this.form.controls.verifySsl.getRawValue(),
              authMethod: this.form.controls.authMethod.getRawValue(),
              username: this.form.controls.username.getRawValue(),
              password: this.form.controls.password.getRawValue(),
              apiTokenId: this.form.controls.apiTokenId.getRawValue(),
              apiTokenSecret: this.form.controls.apiTokenSecret.getRawValue(),
              clusterId,
              clusterName,
              datacenters: Array.isArray(response['datacenters']) ? response['datacenters'] : [],
              selectedDatacenter: null,
              nodes: Array.isArray(response['nodes']) ? response['nodes'] : [],
              servers: Array.isArray(response['servers']) ? response['servers'] : [],
              overview: null,
              loadedAt: new Date().toISOString()
            };

            this.currentSnapshot = snapshot;
            this.resultsView = this.buildResultsView(snapshot);
            this.syncSelectedVmTargets();
            this.deploymentDraftService.saveFormValue(
              'proxmox-standalone',
              'proxmox-standalone',
              snapshot,
              'active'
            );
            this.submitSucceeded = true;
            this.submitMessage = clusterName
              ? `Connected to ${clusterName}. Select a datacenter to continue.`
              : 'Connected to Proxmox. Select a datacenter to continue.';
            this.completed.emit();
            this.changeDetectorRef.detectChanges();
          });
        },
        error: (error: unknown) => {
          this.ngZone.run(() => {
            this.submitSucceeded = false;
            this.submitError = getApiErrorMessage(
              error,
              'Unable to load standalone Proxmox data.'
            );
            this.failed.emit();
            this.changeDetectorRef.detectChanges();
          });
        }
      });
  }

  protected trackDatacenter(_: number, datacenter: CompactDatacenterView): string {
    return `${datacenter.id}-${datacenter.name}`;
  }

  protected trackServer(_: number, server: CompactServerView): string {
    return server.key;
  }

  protected trackStorage(_: number, storage: CompactStorageView): string {
    return `${storage.node}-${storage.name}-${storage.type}`;
  }

  protected isUsingLoadedActiveRegistration(): boolean {
    return (
      this.savedState === 'active' &&
      JSON.stringify(this.form.getRawValue()) ===
        JSON.stringify({
          url: this.model.url,
          verifySsl: this.model.verifySsl,
          authMethod: this.model.authMethod,
          username: this.model.username,
          password: this.model.password,
          apiTokenId: this.model.apiTokenId,
          apiTokenSecret: this.model.apiTokenSecret
        })
    );
  }

  private hasAuthenticationValues(): boolean {
    const value = this.form.getRawValue();
    return !!value.url.trim() && !!value.username.trim() && !!value.password.trim();
  }

  private buildClusterRegistrationPayload(): ProxmoxClusterRegistrationFormModel | null {
    const value = this.form.getRawValue();
    const url = value.url.trim();
    const username = value.username.trim();

    if (!url || !username || !value.password.trim()) {
      return null;
    }

    return {
      url,
      username,
      password: value.password
    };
  }

  private buildResultsView(snapshot: ProxmoxStandaloneSnapshot): CompactResultsView | null {
    const datacenters = this.extractDatacenters(snapshot.datacenters)
      .map((datacenter) => this.mapDatacenter(datacenter))
      .filter(Boolean) as CompactDatacenterView[];
    const selectedDatacenter = this.mapSelectedDatacenter(snapshot.selectedDatacenter, datacenters);
    const connectedNodes = this.extractConnectedNodes(snapshot.nodes);
    const servers = this.extractOverviewServers(snapshot)
      .map((server) => this.mapServer(server))
      .filter(Boolean) as CompactServerView[];
    const storage = servers.flatMap((server) => server.storage);
    const clusterResource =
      this.pickRecord(this.readPath(snapshot.overview, 'cluster'), ['cpu']) !== null
        ? (this.readPath(snapshot.overview, 'cluster') as UnknownRecord)
        : this.pickRecord(this.readPath(snapshot.overview, 'remaining_resources'), ['cluster']);

    if (
      datacenters.length === 0 &&
      connectedNodes.length === 0 &&
      servers.length === 0 &&
      !clusterResource
    ) {
      return null;
    }

    return {
      clusterName: snapshot.clusterName || selectedDatacenter?.name || 'Proxmox',
      connectedNodes,
      datacenters,
      selectedDatacenter,
      servers,
      clusterCpu: this.formatClusterMetric(this.pickRecord(clusterResource, ['cpu'])) ?? '—',
      clusterMemory: this.formatCapacityMetric(this.pickRecord(clusterResource, ['memory'])) ?? '—',
      clusterDisk: this.formatCapacityMetric(this.pickRecord(clusterResource, ['disk'])) ?? '—',
      storage
    };
  }

  private extractDatacenters(value: unknown): UnknownRecord[] {
    return this.extractRecordArray(this.readPath(value, 'datacenters') ?? value);
  }

  private mapDatacenter(datacenter: UnknownRecord): CompactDatacenterView | null {
    const id = this.stringify(datacenter['id']);
    const name = this.stringify(datacenter['name']);

    if (!id || !name) {
      return null;
    }

    return {
      id,
      name,
      nodeCount:
        this.stringify(datacenter['node_count']) ??
        this.stringify(datacenter['nodeCount']) ??
        this.stringify(datacenter['nodes']) ??
        '—'
    };
  }

  private mapSelectedDatacenter(
    selectedDatacenter: UnknownRecord | null,
    datacenters: CompactDatacenterView[]
  ): CompactDatacenterView | null {
    if (!selectedDatacenter) {
      return null;
    }

    const selectedId = this.stringify(selectedDatacenter['id']);
    const selectedName = this.stringify(selectedDatacenter['name']);

    return (
      datacenters.find((datacenter) =>
        (selectedId && datacenter.id === selectedId) ||
        (selectedName && datacenter.name === selectedName)
      ) ?? null
    );
  }

  private mapServer(server: UnknownRecord): CompactServerView | null {
    const node = this.stringify(server['node']) ?? this.stringify(server['name']) ?? this.stringify(server['id']);
    const name = this.stringify(server['name']) ?? node;

    if (!node || !name) {
      return null;
    }

    const storage = this.extractServerStorage(server, node);

    return {
      key: `${node}-${name}`,
      name,
      node,
      cpu: this.formatClusterMetric(this.pickRecord(server, ['cpu'])) ?? '—',
      memory: this.formatCapacityMetric(this.pickRecord(server, ['memory'])) ?? '—',
      disk: this.formatCapacityMetric(this.pickRecord(server, ['disk'])) ?? '—',
      storage,
      isoImages: [...new Set(storage.flatMap((entry) => entry.isoImages))],
      templateOptions: this.extractTemplateOptions(server)
    };
  }

  private extractServerStorage(server: UnknownRecord, fallbackNode: string): CompactStorageView[] {
    return this.extractRecordArray(server['storage_options'])
      .map((entry) => this.mapStorage(entry, fallbackNode))
      .filter(Boolean) as CompactStorageView[];
  }

  private mapStorage(storage: UnknownRecord, fallbackNode: string): CompactStorageView | null {
    const node = this.stringify(storage['node']) ?? fallbackNode;
    const name = this.stringify(storage['storage']) ?? this.stringify(storage['name']);
    const type = this.stringify(storage['type']);

    if (!node || !name || !type) {
      return null;
    }

    return {
      node,
      name,
      type,
      remaining: this.stringify(storage['remaining_human'] ?? storage['free_human']) ?? '—',
      used: this.stringify(storage['used_human']) ?? '—',
      total: this.stringify(storage['maximum_load_human'] ?? storage['total_human']) ?? '—',
      isoImages: this.extractStringArray(storage['iso_images'])
    };
  }

  private extractTemplateOptions(server: UnknownRecord): ProxmoxVmTemplateOption[] {
    const candidates = [
      this.readPath(server, 'templates'),
      this.readPath(server, 'existing_vms'),
      this.readPath(server, 'vms')
    ];
    const options = new Map<string, ProxmoxVmTemplateOption>();

    for (const candidate of candidates) {
      for (const entry of this.extractRecordArray(candidate)) {
        const templateId =
          this.stringify(entry['template_id']) ??
          this.stringify(entry['vmid']) ??
          this.stringify(entry['vm_id']) ??
          this.stringify(entry['id']);
        const labelName =
          this.stringify(entry['name']) ??
          this.stringify(entry['vm_name']) ??
          this.stringify(entry['template_name']);
        const isTemplate =
          entry['template'] === true ||
          this.stringify(entry['type']) === 'template' ||
          this.stringify(entry['status']) === 'template' ||
          candidate === this.readPath(server, 'templates');

        if (!templateId || !isTemplate) {
          continue;
        }

        options.set(templateId, {
          value: templateId,
          label: labelName ? `${labelName} (${templateId})` : templateId
        });
      }
    }

    return [...options.values()];
  }

  private extractConnectedNodes(response: unknown): string[] {
    const nodes = this.readPath(response, 'nodes') ?? response;

    if (!Array.isArray(nodes)) {
      return [];
    }

    return nodes
      .map((entry) => {
        if (typeof entry === 'string') {
          return entry.trim();
        }

        if (!isRecord(entry)) {
          return '';
        }

        return this.stringify(entry['name']) ?? this.stringify(entry['node']) ?? '';
      })
      .filter((value) => !!value);
  }

  private extractOverviewServers(snapshot: ProxmoxStandaloneSnapshot): UnknownRecord[] {
    const overviewServers = this.extractRecordArray(this.readPath(snapshot.overview, 'servers'));
    return overviewServers.length ? overviewServers : this.extractRecordArray(snapshot.servers);
  }

  private extractStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value
          .map((entry) => this.stringify(entry))
          .filter((entry): entry is string => entry !== null)
      : [];
  }

  private formatClusterMetric(metric: UnknownRecord | null): string | null {
    if (!metric) {
      return null;
    }

    const free = this.asFiniteNumber(metric['free_cores_estimate'] ?? metric['free']);
    const percent = this.asFiniteNumber(metric['free_percent']);

    if (free === null && percent === null) {
      return null;
    }

    if (free !== null && percent !== null) {
      return `${free.toFixed(2)} free (${percent.toFixed(2)}%)`;
    }

    if (free !== null) {
      return `${free.toFixed(2)} free`;
    }

    return `${percent?.toFixed(2)}% free`;
  }

  private formatCapacityMetric(metric: UnknownRecord | null): string | null {
    if (!metric) {
      return null;
    }

    const freeHuman = this.stringify(metric['free_human'] ?? metric['remaining_human']);
    const totalHuman = this.stringify(metric['total_human'] ?? metric['maximum_load_human']);
    const free = this.asFiniteNumber(metric['free'] ?? metric['remaining']);
    const total = this.asFiniteNumber(metric['total'] ?? metric['maximum_load']);
    const percent = total && total > 0 && free !== null ? (free / total) * 100 : null;

    if (!freeHuman && !totalHuman && percent === null) {
      return null;
    }

    const value = freeHuman ?? '—';
    const totalValue = totalHuman ?? '—';
    const percentLabel = percent === null ? '' : ` (${percent.toFixed(2)}% free)`;
    return `${value} of ${totalValue}${percentLabel}`;
  }

  private extractRecordArray(value: unknown): UnknownRecord[] {
    return Array.isArray(value) ? value.filter((entry): entry is UnknownRecord => isRecord(entry)) : [];
  }

  private pickRecord(source: unknown, keys: string[]): UnknownRecord | null {
    if (!isRecord(source)) {
      return null;
    }

    for (const key of keys) {
      const value = source[key];

      if (isRecord(value)) {
        return value;
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

  private stringify(value: unknown): string | null {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed || null;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }

    return null;
  }

  private asFiniteNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private syncSelectedVmTargets(): void {
    const availableServers = new Set(this.resultsView?.servers.map((server) => server.name) ?? []);

    for (const selectedServerName of [...this.selectedServerNames]) {
      if (!availableServers.has(selectedServerName)) {
        this.selectedServerNames.delete(selectedServerName);
      }
    }

    this.selectedVmTargets =
      this.resultsView?.servers
        .filter((server) => this.selectedServerNames.has(server.name))
        .map((server) => ({
          node: server.node,
          storageOptions: [...new Set(server.storage.map((storage) => storage.name))],
          isoImages: server.isoImages,
          templateOptions: server.templateOptions
        })) ?? [];
  }
}
