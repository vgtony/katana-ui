import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, NgZone, input, inject, output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, finalize, forkJoin, of, switchMap } from 'rxjs';
import { ProxmoxStandaloneVmTarget } from '../../../models/interfaces/proxmox-standalone-vm-target.interface';
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
  name: string;
  url: string;
  node: string;
  verifySsl: boolean;
  authMethod: AuthMethod;
  username: string;
  password: string;
  apiTokenId: string;
  apiTokenSecret: string;
  connectedNodes: string[];
  clusters: unknown[];
  servers: unknown[];
  remainingResources: unknown;
  loadedAt: string;
}

interface CompactClusterView {
  name: string;
  status: string;
  nodeCount: string;
}

interface CompactServerView {
  name: string;
  cpu: string;
  memory: string;
  disk: string;
  storage: CompactStorageView[];
}

interface CompactStorageView {
  name: string;
  type: string;
  node: string;
  remaining: string;
  used: string;
  total: string;
}

interface CompactResultsView {
  connectedNodes: string[];
  clusters: CompactClusterView[];
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
  name: '',
  url: 'https://10.160.100.11:8006',
  node: '',
  verifySsl: false,
  authMethod: 'password',
  username: 'root@pam',
  password: '',
  apiTokenId: '',
  apiTokenSecret: '',
  connectedNodes: [],
  clusters: [],
  servers: [],
  remainingResources: null,
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
  protected resultsView: CompactResultsView | null = this.buildResultsView(this.model);
  protected selectedVmTargets: ProxmoxStandaloneVmTarget[] = [];
  protected readonly selectedServerNames = new Set<string>();
  protected currentSnapshot: ProxmoxStandaloneSnapshot = this.model;

  protected readonly form = this.formBuilder.nonNullable.group({
    name: [this.model.name, Validators.required],
    url: [this.model.url, Validators.required],
    node: [this.model.node, Validators.required],
    verifySsl: this.model.verifySsl,
    authMethod: 'password' as AuthMethod,
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
          ...this.currentSnapshot,
          ...this.form.getRawValue(),
          connectedNodes: this.currentSnapshot.connectedNodes,
          clusters: this.currentSnapshot.clusters,
          servers: this.currentSnapshot.servers,
          remainingResources: this.currentSnapshot.remainingResources,
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

  protected handleVmDeployed(event: DeploymentAttemptEvent): void {
    this.deployed.emit(event);
  }

  protected submit(): void {
    this.submitSucceeded = false;
    this.submitMessage = '';
    this.submitError = '';

    if (this.form.invalid || !this.hasAuthenticationValues()) {
      this.form.markAllAsTouched();
      this.submitError = 'Enter cluster name, URL, username, password, and node to continue.';
      return;
    }

    if (this.isUsingLoadedActiveRegistration() && this.resultsView) {
      this.submitSucceeded = true;
      this.submitMessage = 'Using the existing active standalone Proxmox registration.';
      this.completed.emit();
      this.changeDetectorRef.detectChanges();
      return;
    }

    const payload = this.buildClusterRegistrationPayload();

    if (!payload) {
      this.submitError = 'Unable to build the Proxmox cluster registration payload.';
      return;
    }

    const clusterLookupPayload = {
      cluster_name: payload.name
    };

    this.submitting = true;

    this.proxmoxApi
      .createCluster(payload)
      .pipe(
        catchError((error: unknown) => {
          if (error instanceof HttpErrorResponse && error.status === 409) {
            return of({
              message: 'A Proxmox cluster with these details is already active.',
              cluster_id: null,
              reusedExistingCluster: true
            });
          }

          throw error;
        }),
        switchMap((clusterResponse) =>
          forkJoin({
            clusterResponse: of(clusterResponse),
            nodes: this.proxmoxApi.getNodes(clusterLookupPayload),
            clusters: this.proxmoxApi.getStandaloneClusters(clusterLookupPayload),
            servers: this.proxmoxApi.getStandaloneServers(clusterLookupPayload),
            remainingResources: this.proxmoxApi.getStandaloneRemainingResources(
              clusterLookupPayload
            )
          })
        ),
        finalize(() =>
          this.ngZone.run(() => {
            this.submitting = false;
            this.changeDetectorRef.detectChanges();
          })
        )
      )
      .subscribe({
        next: ({ clusterResponse, nodes, clusters, servers, remainingResources }) => {
          this.ngZone.run(() => {
            const snapshot: ProxmoxStandaloneSnapshot = {
              ...this.form.getRawValue(),
              connectedNodes: this.extractConnectedNodes(nodes),
              clusters: this.extractClusters(clusters),
              servers: this.extractServers(servers),
              remainingResources,
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
            this.submitMessage =
              'reusedExistingCluster' in clusterResponse && clusterResponse.reusedExistingCluster
                ? `Using existing Proxmox cluster registration. Loaded ${snapshot.connectedNodes.length} nodes and ${snapshot.servers.length} servers.`
                : `Registered Proxmox cluster and loaded ${snapshot.connectedNodes.length} nodes and ${snapshot.servers.length} servers.`;
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

  protected trackCluster(_: number, cluster: CompactClusterView): string {
    return `${cluster.name}-${cluster.status}`;
  }

  protected trackServer(_: number, server: CompactServerView): string {
    return server.name;
  }

  protected trackStorage(_: number, storage: CompactStorageView): string {
    return `${storage.node}-${storage.name}-${storage.type}`;
  }

  protected isUsingLoadedActiveRegistration(): boolean {
    return (
      this.savedState === 'active' &&
      JSON.stringify(this.form.getRawValue()) ===
        JSON.stringify({
          name: this.model.name,
          url: this.model.url,
          node: this.model.node,
          verifySsl: this.model.verifySsl,
          authMethod: 'password',
          username: this.model.username,
          password: this.model.password,
          apiTokenId: this.model.apiTokenId,
          apiTokenSecret: this.model.apiTokenSecret
        })
    );
  }

  private hasAuthenticationValues(): boolean {
    const value = this.form.getRawValue();
    return (
      !!value.name.trim() &&
      !!value.url.trim() &&
      !!value.node.trim() &&
      !!value.username.trim() &&
      !!value.password.trim()
    );
  }

  private buildClusterRegistrationPayload(): ProxmoxClusterRegistrationFormModel | null {
    const value = this.form.getRawValue();
    const name = value.name.trim();
    const url = value.url.trim();
    const username = value.username.trim();
    const node = value.node.trim();

    if (!name || !url || !username || !value.password.trim() || !node) {
      return null;
    }

    return {
      name,
      url,
      username,
      password: value.password,
      node
    };
  }

  private buildResultsView(snapshot: ProxmoxStandaloneSnapshot): CompactResultsView | null {
    const remainingResources = this.readPath(snapshot.remainingResources, 'remaining_resources') ?? snapshot.remainingResources;
    const clusterResource = this.pickRecord(remainingResources, ['cluster']);
    const serverResources = this.extractRecordArray(this.readPath(remainingResources, 'servers'));
    const storageResources = this.extractRecordArray(
      this.readPath(remainingResources, 'storage_options') ??
        this.readPath(clusterResource, 'storage_options')
    );
    const clusters = this.extractRecordArray(snapshot.clusters).map((cluster) => this.mapCluster(cluster)).filter(Boolean) as CompactClusterView[];
    const storage = storageResources
      .map((entry) => this.mapStorage(entry))
      .filter(Boolean) as CompactStorageView[];
    const storageByNode = this.groupStorageByNode(storage);
    const servers = (serverResources.length ? serverResources : this.extractRecordArray(snapshot.servers))
      .map((server) => this.mapServer(server, storageByNode))
      .filter(Boolean) as CompactServerView[];

    if (
      snapshot.connectedNodes.length === 0 &&
      clusters.length === 0 &&
      servers.length === 0 &&
      !clusterResource &&
      storage.length === 0
    ) {
      return null;
    }

    return {
      connectedNodes: snapshot.connectedNodes,
      clusters,
      servers,
      clusterCpu: this.formatClusterMetric(this.pickRecord(clusterResource, ['cpu'])) ?? '—',
      clusterMemory: this.formatCapacityMetric(this.pickRecord(clusterResource, ['memory'])) ?? '—',
      clusterDisk: this.formatCapacityMetric(this.pickRecord(clusterResource, ['disk'])) ?? '—',
      storage
    };
  }

  private mapCluster(cluster: UnknownRecord): CompactClusterView | null {
    const name =
      this.stringify(cluster['name']) ??
      this.stringify(cluster['cluster']) ??
      this.stringify(cluster['_id']) ??
      this.stringify(cluster['id']);

    if (!name) {
      return null;
    }

    return {
      name,
      status: this.stringify(cluster['status']) ?? '—',
      nodeCount:
        this.stringify(cluster['node_count']) ??
        this.stringify(cluster['nodes']) ??
        this.stringify(cluster['servers']) ??
        '—'
    };
  }

  private mapServer(
    server: UnknownRecord,
    storageByNode: Map<string, CompactStorageView[]>
  ): CompactServerView | null {
    const name = this.stringify(server['name']) ?? this.stringify(server['node']) ?? this.stringify(server['id']);

    if (!name) {
      return null;
    }

    return {
      name,
      cpu: this.formatClusterMetric(this.pickRecord(server, ['cpu'])) ?? '—',
      memory: this.formatCapacityMetric(this.pickRecord(server, ['memory'])) ?? '—',
      disk: this.formatCapacityMetric(this.pickRecord(server, ['disk'])) ?? '—',
      storage: storageByNode.get(name) ?? []
    };
  }

  private mapStorage(storage: UnknownRecord): CompactStorageView | null {
    const node = this.stringify(storage['node']);
    const name = this.stringify(storage['storage']);
    const type = this.stringify(storage['type']);

    if (!node || !name || !type) {
      return null;
    }

    return {
      node,
      name,
      type,
      remaining: this.stringify(storage['remaining_human']) ?? '—',
      used: this.stringify(storage['used_human']) ?? '—',
      total: this.stringify(storage['maximum_load_human'] ?? storage['total_human']) ?? '—'
    };
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

  private extractRecordArray(value: unknown): UnknownRecord[] {
    return Array.isArray(value) ? value.filter((entry): entry is UnknownRecord => isRecord(entry)) : [];
  }

  private extractClusters(value: unknown): UnknownRecord[] {
    return this.extractRecordArray(this.readPath(value, 'clusters') ?? value);
  }

  private extractServers(value: unknown): UnknownRecord[] {
    return this.extractRecordArray(this.readPath(value, 'servers') ?? value);
  }

  private groupStorageByNode(storage: CompactStorageView[]): Map<string, CompactStorageView[]> {
    const grouped = new Map<string, CompactStorageView[]>();

    for (const entry of storage) {
      const existing = grouped.get(entry.node) ?? [];
      existing.push(entry);
      grouped.set(entry.node, existing);
    }

    return grouped;
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
          node: server.name,
          storageOptions: [...new Set(server.storage.map((storage) => storage.name))]
        })) ?? [];
  }
}
