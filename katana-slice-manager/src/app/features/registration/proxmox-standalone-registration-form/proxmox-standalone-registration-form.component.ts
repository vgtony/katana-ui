import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, NgZone, OnInit, input, inject, output } from '@angular/core';
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
import { DeploymentFormState } from '../../../models/interfaces/deployment-draft.interface';

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
  datacenters: CompactDatacenterView[];
  selectedDatacenter: CompactDatacenterView | null;
  servers: CompactServerView[];
  clusterCpu: string;
  clusterMemory: string;
  clusterDisk: string;
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
export class ProxmoxStandaloneRegistrationFormComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly ngZone = inject(NgZone);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly proxmoxApi = inject(ProxmoxApiService);
  private readonly deploymentDraftService = inject(DeploymentDraftService);

  readonly compactOnly = input(false);
  readonly serverViewMode = input<'compact' | 'detail'>('detail');
  readonly completed = output<void>();
  readonly failed = output<void>();
  readonly deregistered = output<void>();
  readonly deployed = output<DeploymentAttemptEvent>();

  protected model = this.deploymentDraftService.getFormValue(
    'proxmox-standalone',
    'proxmox-standalone',
    initialSnapshot
  );
  protected savedState = this.deploymentDraftService.getFormState(
    'proxmox-standalone',
    'proxmox-standalone'
  );
  protected restoreMessage = this.buildRestoreMessage(this.savedState);
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

  ngOnInit(): void {
    if (this.shouldRefreshRestoredOverview()) {
      this.refreshRestoredOverview();
    }
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

  protected clearSelectedDatacenter(): void {
    if (this.submitting || !this.currentSnapshot.selectedDatacenter) {
      return;
    }

    const snapshot: ProxmoxStandaloneSnapshot = {
      ...this.currentSnapshot,
      selectedDatacenter: null,
      nodes: [],
      servers: [],
      overview: null
    };

    this.currentSnapshot = snapshot;
    this.resultsView = this.buildResultsView(snapshot);
    this.selectedServerNames.clear();
    this.selectedVmTargets = [];
    this.submitSucceeded = true;
    this.submitMessage = 'Select a datacenter to continue.';
    this.submitError = '';
    this.deploymentDraftService.saveFormValue(
      'proxmox-standalone',
      'proxmox-standalone',
      snapshot,
      'active'
    );
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

  protected deregister(): void {
    if (this.submitting) {
      return;
    }

    this.submitSucceeded = false;
    this.submitMessage = '';
    this.submitError = '';

    const clusterId = this.currentSnapshot.clusterId.trim();

    if (!clusterId) {
      this.resetStandaloneRegistration('Standalone Proxmox registration removed locally.');
      this.changeDetectorRef.detectChanges();
      return;
    }

    this.submitting = true;
    this.loadingMessage = 'Removing the standalone Proxmox registration…';

    this.proxmoxApi
      .deleteCluster(clusterId)
      .pipe(
        catchError((error: unknown) => {
          if (error instanceof HttpErrorResponse && error.status === 404) {
            return of({ message: 'Cluster registration already removed.' });
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
        next: () => {
          this.ngZone.run(() => {
            this.resetStandaloneRegistration('Standalone Proxmox registration removed.');
            this.changeDetectorRef.detectChanges();
          });
        },
        error: (error: unknown) => {
          this.ngZone.run(() => {
            this.submitError = getApiErrorMessage(
              error,
              'Unable to deregister the standalone Proxmox registration.'
            );
            this.failed.emit();
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

  private resetStandaloneRegistration(message: string): void {
    this.currentSnapshot = {
      ...initialSnapshot
    };
    this.model = this.currentSnapshot;
    this.resultsView = this.buildResultsView(this.currentSnapshot);
    this.selectedServerNames.clear();
    this.selectedVmTargets = [];
    this.deploymentDraftService.clearForm('proxmox-standalone', 'proxmox-vm');
    this.form.reset({
      url: initialSnapshot.url,
      verifySsl: initialSnapshot.verifySsl,
      authMethod: initialSnapshot.authMethod,
      username: initialSnapshot.username,
      password: initialSnapshot.password,
      apiTokenId: initialSnapshot.apiTokenId,
      apiTokenSecret: initialSnapshot.apiTokenSecret
    });
    this.savedState = 'draft';
    this.restoreMessage = '';
    this.submitSucceeded = true;
    this.submitMessage = message;
    this.submitError = '';
    this.deregistered.emit();
  }

  private buildRestoreMessage(state: DeploymentFormState): string {
    return state === 'active'
      ? 'Active standalone Proxmox registration loaded.'
      : state === 'draft'
        ? 'Saved standalone Proxmox draft restored.'
        : '';
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
    const servers = this.buildServerViews(snapshot, connectedNodes);
    const clusterResource = this.extractClusterResource(snapshot.overview);

    if (
      datacenters.length === 0 &&
      connectedNodes.length === 0 &&
      servers.length === 0 &&
      !clusterResource
    ) {
      return null;
    }

    return {
      datacenters,
      selectedDatacenter,
      servers,
      clusterCpu: this.formatClusterSummaryCpuMetric(this.pickRecord(clusterResource, ['cpu'])) ?? '—',
      clusterMemory:
        this.formatClusterSummaryCapacityMetric(this.pickRecord(clusterResource, ['memory'])) ?? '—',
      clusterDisk:
        this.formatClusterSummaryCapacityMetric(this.pickRecord(clusterResource, ['disk'])) ?? '—'
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
    const node =
      this.stringify(server['node']) ?? this.stringify(server['name']) ?? this.stringify(server['id']);
    const name = this.stringify(server['name']) ?? node;

    if (!node || !name) {
      return null;
    }

    const storage = this.extractServerStorage(server, node);

    return {
      key: `${node}-${name}`,
      name,
      node,
      cpu:
        this.formatClusterMetric(this.pickRecord(server, ['cpu'])) ??
        this.formatServerCpuMetric(server) ??
        '—',
      memory:
        this.formatCapacityMetric(this.pickRecord(server, ['memory', 'ram'])) ??
        this.formatServerCapacityMetric(server, ['memory', 'mem'], ['maxmem']) ??
        '—',
      disk:
        this.formatCapacityMetric(this.pickRecord(server, ['disk', 'storage'])) ??
        this.formatServerCapacityMetric(server, ['disk'], ['maxdisk']) ??
        '—',
      storage,
      templateOptions: this.extractTemplateOptions(server)
    };
  }

  private buildServerViews(
    snapshot: ProxmoxStandaloneSnapshot,
    connectedNodes: string[]
  ): CompactServerView[] {
    const overviewServers = this.extractOverviewServers(snapshot);
    const fallbackServers = this.extractRecordArray(snapshot.servers);
    const fallbackNodes = this.extractRecordArray(snapshot.nodes);
    const storageByNode = this.groupStorageByNode(this.extractOverviewStorage(snapshot));
    const serverRecords = new Map<string, UnknownRecord>();

    for (const node of fallbackNodes) {
      const name = this.extractServerName(node);

      if (name) {
        serverRecords.set(name, node);
      }
    }

    for (const server of fallbackServers) {
      const name = this.extractServerName(server);

      if (name) {
        serverRecords.set(name, server);
      }
    }

    for (const server of overviewServers) {
      const name = this.extractServerName(server);

      if (!name) {
        continue;
      }

      serverRecords.set(name, {
        ...(serverRecords.get(name) ?? {}),
        ...server
      });
    }

    const nodeNames = [...new Set([
      ...connectedNodes,
      ...this.extractConnectedNodes(snapshot.servers),
      ...Array.from(serverRecords.keys()),
      ...Array.from(storageByNode.keys())
    ])];

    return nodeNames
      .map((nodeName) => this.mapServerView(nodeName, serverRecords.get(nodeName) ?? null, storageByNode))
      .filter(Boolean) as CompactServerView[];
  }

  private mapServerView(
    nodeName: string,
    server: UnknownRecord | null,
    storageByNode: Map<string, CompactStorageView[]>
  ): CompactServerView | null {
    const serverRecord = server ?? { name: nodeName, node: nodeName };
    const directStorage = this.extractServerStorage(serverRecord, nodeName);
    const groupedStorage = storageByNode.get(nodeName) ?? [];
    const storage = this.mergeStorageEntries(groupedStorage, directStorage);
    const mappedServer = this.mapServer({
      ...serverRecord,
      name: this.stringify(serverRecord['name']) ?? nodeName,
      node: this.stringify(serverRecord['node']) ?? nodeName
    });

    if (!mappedServer) {
      return null;
    }

    return {
      ...mappedServer,
      storage
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
      isoImages: this.extractIsoImageValues(storage['iso_images'])
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
    const nestedOverviewServers = this.extractRecordArray(
      this.readPath(this.readPath(snapshot.overview, 'remaining_resources'), 'servers')
    );
    return overviewServers.length
      ? overviewServers
      : nestedOverviewServers.length
        ? nestedOverviewServers
        : this.extractRecordArray(snapshot.servers);
  }

  private extractOverviewStorage(snapshot: ProxmoxStandaloneSnapshot): UnknownRecord[] {
    const directStorage = this.extractRecordArray(this.readPath(snapshot.overview, 'storage_options'));
    const nestedStorage = this.extractRecordArray(
      this.readPath(this.readPath(snapshot.overview, 'remaining_resources'), 'storage_options')
    );

    return directStorage.length ? directStorage : nestedStorage;
  }

  private extractClusterResource(source: unknown): UnknownRecord | null {
    const directCluster =
      this.pickRecord(source, ['cpu']) !== null && isRecord(source) ? source : null;

    if (directCluster) {
      return directCluster;
    }

    const topLevelCluster = this.readPath(source, 'cluster');

    if (this.pickRecord(topLevelCluster, ['cpu']) !== null && isRecord(topLevelCluster)) {
      return topLevelCluster;
    }

    return this.pickRecord(this.readPath(source, 'remaining_resources'), ['cluster']);
  }

  private groupStorageByNode(storageEntries: UnknownRecord[]): Map<string, CompactStorageView[]> {
    const storageByNode = new Map<string, CompactStorageView[]>();

    for (const entry of storageEntries) {
      const mappedStorage = this.mapStorage(entry, '');

      if (!mappedStorage) {
        continue;
      }

      const existingEntries = storageByNode.get(mappedStorage.node) ?? [];
      storageByNode.set(mappedStorage.node, [...existingEntries, mappedStorage]);
    }

    return storageByNode;
  }

  private mergeStorageEntries(
    primary: CompactStorageView[],
    fallback: CompactStorageView[]
  ): CompactStorageView[] {
    const storageEntries = new Map<string, CompactStorageView>();

    for (const entry of [...primary, ...fallback]) {
      storageEntries.set(`${entry.node}-${entry.name}-${entry.type}`, entry);
    }

    return [...storageEntries.values()];
  }

  private extractServerName(server: UnknownRecord): string | null {
    return this.stringify(server['name']) ?? this.stringify(server['node']) ?? this.stringify(server['id']);
  }

  private shouldRefreshRestoredOverview(): boolean {
    if (
      this.savedState !== 'active' ||
      !this.currentSnapshot.clusterId.trim() ||
      !this.currentSnapshot.selectedDatacenter
    ) {
      return false;
    }

    if (!this.resultsView?.servers.length) {
      return true;
    }

    return this.resultsView.servers.every(
      (server) =>
        server.cpu === '—' &&
        server.memory === '—' &&
        server.disk === '—' &&
        server.storage.length === 0
    );
  }

  private refreshRestoredOverview(): void {
    const datacenterId = this.stringify(this.currentSnapshot.selectedDatacenter?.['id']);
    const datacenterName = this.stringify(this.currentSnapshot.selectedDatacenter?.['name']);

    if (!this.currentSnapshot.clusterId.trim() || (!datacenterId && !datacenterName)) {
      return;
    }

    this.submitting = true;
    this.loadingMessage = 'Refreshing the saved Proxmox overview…';
    this.submitError = '';

    this.proxmoxApi
      .connect({
        cluster_id: this.currentSnapshot.clusterId,
        ...(datacenterId ? { datacenter_id: datacenterId } : {}),
        ...(!datacenterId && datacenterName ? { datacenter_name: datacenterName } : {})
      })
      .pipe(
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
        finalize(() => {
          this.submitting = false;
          this.loadingMessage = '';
          this.changeDetectorRef.detectChanges();
        })
      )
      .subscribe({
        next: ({ connectResponse, overviewResponse }) => {
          const snapshot: ProxmoxStandaloneSnapshot = {
            ...this.currentSnapshot,
            selectedDatacenter: isRecord(connectResponse.selected_datacenter)
              ? connectResponse.selected_datacenter
              : this.currentSnapshot.selectedDatacenter,
            nodes: connectResponse.nodes,
            servers: connectResponse.servers,
            overview: overviewResponse,
            loadedAt: new Date().toISOString()
          };

          this.currentSnapshot = snapshot;
          this.model = snapshot;
          this.resultsView = this.buildResultsView(snapshot);
          this.syncSelectedVmTargets();
          this.deploymentDraftService.saveFormValue(
            'proxmox-standalone',
            'proxmox-standalone',
            snapshot,
            'active'
          );
          this.changeDetectorRef.detectChanges();
        },
        error: () => {
          this.changeDetectorRef.detectChanges();
        }
      });
  }

  private extractIsoImageValues(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((entry) => {
        if (isRecord(entry)) {
          return (
            this.stringify(entry['volid']) ??
            this.stringify(entry['name']) ??
            this.stringify(entry['id'])
          );
        }

        return this.stringify(entry);
      })
      .filter((entry): entry is string => entry !== null);
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

  private formatClusterSummaryCpuMetric(metric: UnknownRecord | null): string | null {
    if (!metric) {
      return null;
    }

    const used = this.asFiniteNumber(metric['used_cores_estimate']);
    const total = this.asFiniteNumber(metric['total_cores']);
    const usedPercent = this.asFiniteNumber(metric['used_percent']);

    if (used !== null || usedPercent !== null) {
      const free = used !== null && total !== null ? Math.max(0, total - used) : null;
      const freePercent = usedPercent !== null ? Math.max(0, 100 - usedPercent) : null;

      if (free !== null && freePercent !== null) {
        return `${free.toFixed(2)} free (${freePercent.toFixed(2)}%)`;
      }

      if (free !== null) {
        return `${free.toFixed(2)} free`;
      }

      return freePercent === null ? null : `${freePercent.toFixed(2)}% free`;
    }

    return this.formatClusterMetric(metric);
  }

  private formatClusterSummaryCapacityMetric(metric: UnknownRecord | null): string | null {
    if (!metric) {
      return null;
    }

    const freeHuman = this.stringify(metric['free_human'] ?? metric['remaining_human']);
    const free = this.asFiniteNumber(metric['free'] ?? metric['remaining']);
    const total = this.asFiniteNumber(metric['total'] ?? metric['maximum_load']);
    const usedPercent = this.asFiniteNumber(metric['used_percent']);
    const freePercent =
      usedPercent !== null
        ? Math.max(0, 100 - usedPercent)
        : total && total > 0 && free !== null
          ? Math.max(0, (free / total) * 100)
          : null;

    if (freeHuman || freePercent !== null) {
      const value = freeHuman ?? '—';
      const percentLabel = freePercent === null ? '' : ` (${freePercent.toFixed(2)}% free)`;
      return `${value}${percentLabel}`;
    }

    return this.formatCapacityMetric(metric);
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

  private formatServerCpuMetric(server: UnknownRecord): string | null {
    const usageRatio = this.asFiniteNumber(server['cpu']);
    const totalCores = this.asFiniteNumber(server['maxcpu']);

    if (usageRatio === null && totalCores === null) {
      return null;
    }

    const freePercent = usageRatio === null ? null : Math.max(0, (1 - usageRatio) * 100);
    const freeCores =
      usageRatio !== null && totalCores !== null ? Math.max(0, totalCores * (1 - usageRatio)) : null;

    if (freeCores !== null && freePercent !== null) {
      return `${freeCores.toFixed(2)} free (${freePercent.toFixed(2)}%)`;
    }

    if (freeCores !== null) {
      return `${freeCores.toFixed(2)} free`;
    }

    return freePercent === null ? null : `${freePercent.toFixed(2)}% free`;
  }

  private formatServerCapacityMetric(
    server: UnknownRecord,
    usedKeys: string[],
    totalKeys: string[]
  ): string | null {
    const used = this.pickFiniteNumber(server, usedKeys);
    const total = this.pickFiniteNumber(server, totalKeys);

    if (used === null && total === null) {
      return null;
    }

    const free = used !== null && total !== null ? Math.max(0, total - used) : null;
    const freeHuman = free === null ? null : this.formatByteValue(free);
    const totalHuman = total === null ? null : this.formatByteValue(total);
    const freePercent =
      free !== null && total !== null && total > 0 ? Math.max(0, (free / total) * 100) : null;

    if (!freeHuman && !totalHuman && freePercent === null) {
      return null;
    }

    const value = freeHuman ?? '—';
    const totalValue = totalHuman ?? '—';
    const percentLabel = freePercent === null ? '' : ` (${freePercent.toFixed(2)}% free)`;
    return `${value} of ${totalValue}${percentLabel}`;
  }

  private pickFiniteNumber(source: UnknownRecord, keys: string[]): number | null {
    for (const key of keys) {
      const value = this.asFiniteNumber(source[key]);

      if (value !== null) {
        return value;
      }
    }

    return null;
  }

  private formatByteValue(value: number): string {
    if (value <= 0) {
      return '0.00 B';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    let unitIndex = 0;
    let size = value;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
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
          storageIsoImages: server.storage.map((storage) => ({
            storage: storage.name,
            isoImages: storage.isoImages
          })),
          templateOptions: server.templateOptions
        })) ?? [];
  }
}
