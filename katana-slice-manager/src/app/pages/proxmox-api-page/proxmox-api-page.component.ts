import { ChangeDetectorRef, Component, NgZone, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize, map, switchMap } from 'rxjs';
import {
  PROXMOX_STANDALONE_API_BASE_URL,
  ProxmoxStandaloneApiService,
  ProxmoxStandaloneAuthPayload,
  getApiErrorMessage
} from '../../shared/services/api';

type AuthMethod = 'password' | 'token';
type HealthTone = 'good' | 'warn' | 'muted';
type MetricTone = 'cpu' | 'memory' | 'disk' | 'storage';
type UnknownRecord = Record<string, unknown>;

interface MetricChartView {
  label: string;
  primaryValue: string;
  secondaryValue: string;
  freePercent: number;
  usedPercent: number;
  tone: MetricTone;
}

interface StorageOptionView {
  node: string;
  name: string;
  type: string;
  status: string;
  content: string;
  shared: boolean;
  remainingLabel: string;
  usedLabel: string;
  totalLabel: string;
  remainingPercent: number;
  usedPercent: number;
}

interface StorageCatalogView {
  name: string;
  type: string;
  shared: boolean;
  nodeCount: number;
  nodesLabel: string;
  remainingLabel: string;
  usedLabel: string;
  totalLabel: string;
  remainingPercent: number;
}

interface StorageSummaryView {
  total: number;
  available: number;
  shared: number;
  warning: number;
}

interface ClusterSummaryView {
  cpu: MetricChartView | null;
  memory: MetricChartView | null;
  disk: MetricChartView | null;
  storageSummary: StorageSummaryView;
  storageCatalog: StorageCatalogView[];
  topStorageOptions: StorageOptionView[];
}

interface NodeCardView {
  name: string;
  healthLabel: string;
  healthTone: HealthTone;
  cpu: MetricChartView | null;
  memory: MetricChartView | null;
  disk: MetricChartView | null;
  storageOptions: StorageOptionView[];
}

interface ResourceDashboardView {
  cluster: ClusterSummaryView | null;
  nodes: NodeCardView[];
}

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
  protected clusterSummary: ClusterSummaryView | null = null;
  protected nodeCards: NodeCardView[] = [];

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

  protected get authMethod(): AuthMethod {
    return this.form.controls.authMethod.getRawValue();
  }

  protected get hasLoadedNodes(): boolean {
    return this.nodeCards.length > 0;
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
          this.proxmoxStandaloneApi
            .getRemainingResources(payload)
            .pipe(map((remainingResourcesResponse) => ({ connectResponse, remainingResourcesResponse })))
        ),
        finalize(() =>
          this.ngZone.run(() => {
            this.submitting = false;
            this.changeDetectorRef.detectChanges();
          })
        )
      )
      .subscribe({
        next: ({ connectResponse, remainingResourcesResponse }) => {
          this.ngZone.run(() => {
            const dashboard = this.buildDashboard(connectResponse, remainingResourcesResponse);
            this.clusterSummary = dashboard.cluster;
            this.nodeCards = dashboard.nodes;
            this.lastLoadedNodeCount = dashboard.nodes.length;
            this.submitMessage =
              dashboard.nodes.length > 0
                ? `Loaded ${dashboard.nodes.length} Proxmox node cards from the standalone API.`
                : 'Authentication succeeded, but no Proxmox nodes were returned.';
            this.submitError = '';
            this.changeDetectorRef.detectChanges();
          });
        },
        error: (error: unknown) => {
          this.ngZone.run(() => {
            this.submitError = getApiErrorMessage(
              error,
              'Unable to load Proxmox nodes and remaining resources.'
            );
            this.changeDetectorRef.detectChanges();
          });
        }
      });
  }

  protected trackNodeCard(_: number, node: NodeCardView): string {
    return node.name;
  }

  protected trackStorageOption(_: number, storage: StorageOptionView): string {
    return `${storage.node}-${storage.name}-${storage.type}-${storage.content}`;
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

  private buildDashboard(connectResponse: unknown, remainingResourcesResponse: unknown): ResourceDashboardView {
    const remainingResources = this.readPath(remainingResourcesResponse, 'remaining_resources') ?? remainingResourcesResponse;
    const clusterRecord = this.pickRecord(remainingResources, ['cluster']);
    const serverRecords = this.extractRecordArray(this.readPath(remainingResources, 'servers'));
    const storageOptions = this.extractStorageOptions(remainingResources);
    const storageOptionsByNode = this.groupStorageOptionsByNode(storageOptions);
    const nodeNames = new Set<string>([
      ...this.extractNodeNames(connectResponse),
      ...serverRecords.map((record) => this.extractNodeName(record) ?? '').filter((name) => !!name),
      ...Array.from(storageOptionsByNode.keys())
    ]);

    const nodes = Array.from(nodeNames)
      .map((name) => this.buildNodeCard(name, serverRecords, storageOptionsByNode.get(name) ?? []))
      .sort((left, right) => left.name.localeCompare(right.name));

    return {
      cluster: clusterRecord ? this.buildClusterSummary(clusterRecord, storageOptions) : null,
      nodes
    };
  }

  private buildClusterSummary(clusterRecord: UnknownRecord, storageOptions: StorageOptionView[]): ClusterSummaryView {
    return {
      cpu: this.buildCpuMetric(this.pickRecord(clusterRecord, ['cpu']), 'Cluster CPU headroom'),
      memory: this.buildCapacityMetric(this.pickRecord(clusterRecord, ['memory']), 'Cluster memory free', 'memory'),
      disk: this.buildCapacityMetric(this.pickRecord(clusterRecord, ['disk']), 'Cluster disk free', 'disk'),
      storageSummary: {
        total: storageOptions.length,
        available: storageOptions.filter((option) => option.status === 'available').length,
        shared: storageOptions.filter((option) => option.shared).length,
        warning: storageOptions.filter((option) => option.status !== 'available').length
      },
      storageCatalog: this.buildStorageCatalog(storageOptions),
      topStorageOptions: [...storageOptions]
        .sort((left, right) => right.remainingPercent - left.remainingPercent)
        .slice(0, 6)
    };
  }

  private buildNodeCard(
    name: string,
    serverRecords: UnknownRecord[],
    storageOptions: StorageOptionView[]
  ): NodeCardView {
    const serverRecord = serverRecords.find((record) => this.extractNodeName(record) === name) ?? null;
    const cpu = this.buildCpuMetric(this.pickRecord(serverRecord, ['cpu']), 'CPU headroom');
    const memory = this.buildCapacityMetric(this.pickRecord(serverRecord, ['memory', 'ram']), 'Memory free', 'memory');
    const disk = this.buildCapacityMetric(this.pickRecord(serverRecord, ['disk', 'storage']), 'Disk free', 'disk');
    const hasMetrics = !!cpu || !!memory || !!disk;
    const hasWarningStorage = storageOptions.some((option) => option.status !== 'available');
    const healthLabel = !hasMetrics
      ? 'Waiting for metrics'
      : hasWarningStorage
        ? 'Storage needs attention'
        : 'Capacity available';
    const healthTone: HealthTone = !hasMetrics ? 'muted' : hasWarningStorage ? 'warn' : 'good';

    return {
      name,
      healthLabel,
      healthTone,
      cpu,
      memory,
      disk,
      storageOptions
    };
  }

  private buildCpuMetric(cpuRecord: UnknownRecord | null, label: string): MetricChartView | null {
    if (!cpuRecord) {
      return null;
    }

    const freeCores = this.asFiniteNumber(cpuRecord['free_cores_estimate'] ?? cpuRecord['freeCoresEstimate'] ?? cpuRecord['free']);
    const freePercent = this.asFiniteNumber(cpuRecord['free_percent'] ?? cpuRecord['freePercent']);
    const totalCores = this.asFiniteNumber(cpuRecord['total_cores'] ?? cpuRecord['totalCores']);

    if (freeCores === null && freePercent === null && totalCores === null) {
      return null;
    }

    const normalizedFreePercent = this.clampPercent(freePercent);

    return {
      label,
      primaryValue: freeCores === null ? '—' : `${freeCores.toFixed(2)} free cores`,
      secondaryValue:
        totalCores === null
          ? `${normalizedFreePercent.toFixed(2)}% free`
          : `${normalizedFreePercent.toFixed(2)}% free of ${totalCores.toFixed(0)} total`,
      freePercent: normalizedFreePercent,
      usedPercent: 100 - normalizedFreePercent,
      tone: 'cpu'
    };
  }

  private buildCapacityMetric(
    metricRecord: UnknownRecord | null,
    label: string,
    tone: MetricTone
  ): MetricChartView | null {
    if (!metricRecord) {
      return null;
    }

    const freeValue = this.asFiniteNumber(metricRecord['free'] ?? metricRecord['available']);
    const totalValue = this.asFiniteNumber(metricRecord['total'] ?? metricRecord['maximum_load']);
    const freePercent = totalValue && totalValue > 0 && freeValue !== null ? (freeValue / totalValue) * 100 : null;
    const freeHuman =
      this.stringifyMetric(metricRecord['free_human'] ?? metricRecord['freeHuman'] ?? metricRecord['remaining_human']) ?? '—';
    const totalHuman =
      this.stringifyMetric(metricRecord['total_human'] ?? metricRecord['totalHuman'] ?? metricRecord['maximum_load_human']) ??
      '—';

    if (freeValue === null && totalValue === null && freeHuman === '—' && totalHuman === '—') {
      return null;
    }

    const normalizedFreePercent = this.clampPercent(freePercent);

    return {
      label,
      primaryValue: `${freeHuman} free`,
      secondaryValue: `${normalizedFreePercent.toFixed(2)}% free of ${totalHuman}`,
      freePercent: normalizedFreePercent,
      usedPercent: 100 - normalizedFreePercent,
      tone
    };
  }

  private extractStorageOptions(source: unknown): StorageOptionView[] {
    const storageSource = this.readPath(source, 'storage_options');

    if (!Array.isArray(storageSource)) {
      return [];
    }

    return storageSource
      .map((entry) => this.normalizeStorageOption(entry))
      .filter((entry): entry is StorageOptionView => entry !== null);
  }

  private normalizeStorageOption(source: unknown): StorageOptionView | null {
    if (!isRecord(source)) {
      return null;
    }

    const node = this.extractNodeName(source);
    const name = this.stringifyMetric(source['storage']);
    const type = this.stringifyMetric(source['type']);
    const status = (this.stringifyMetric(source['status']) ?? 'unknown').toLowerCase();
    const content = this.stringifyMetric(source['content']) ?? '—';

    if (!node || !name || !type) {
      return null;
    }

    return {
      node,
      name,
      type,
      status,
      content,
      shared: Boolean(source['shared']),
      remainingLabel: this.stringifyMetric(source['remaining_human']) ?? '—',
      usedLabel: this.stringifyMetric(source['used_human']) ?? '—',
      totalLabel: this.stringifyMetric(source['maximum_load_human'] ?? source['total_human']) ?? '—',
      remainingPercent: this.clampPercent(this.asFiniteNumber(source['remaining_percent'])),
      usedPercent: this.clampPercent(this.asFiniteNumber(source['used_percent']))
    };
  }

  private buildStorageCatalog(storageOptions: StorageOptionView[]): StorageCatalogView[] {
    const grouped = new Map<string, StorageOptionView[]>();

    storageOptions.forEach((option) => {
      const key = `${option.name}__${option.type}`;
      const existing = grouped.get(key) ?? [];
      existing.push(option);
      grouped.set(key, existing);
    });

    return Array.from(grouped.entries())
      .map(([, options]) => {
        const [first] = options;
        const sortedNodes = [...new Set(options.map((option) => option.node))].sort((left, right) => left.localeCompare(right));

        return {
          name: first.name,
          type: first.type,
          shared: options.some((option) => option.shared),
          nodeCount: sortedNodes.length,
          nodesLabel: sortedNodes.join(', '),
          remainingLabel: first.remainingLabel,
          usedLabel: first.usedLabel,
          totalLabel: first.totalLabel,
          remainingPercent: first.remainingPercent
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  private groupStorageOptionsByNode(storageOptions: StorageOptionView[]): Map<string, StorageOptionView[]> {
    return storageOptions.reduce((map, option) => {
      const existing = map.get(option.node) ?? [];
      existing.push(option);
      map.set(option.node, existing);
      return map;
    }, new Map<string, StorageOptionView[]>());
  }

  private extractNodeNames(source: unknown): string[] {
    if (Array.isArray(source)) {
      return source
        .map((entry) => {
          if (typeof entry === 'string') {
            return entry.trim();
          }

          return isRecord(entry) ? this.extractNodeName(entry) ?? '' : '';
        })
        .filter((name) => !!name);
    }

    if (!isRecord(source)) {
      return [];
    }

    return ['nodes', 'data', 'servers']
      .map((key) => source[key])
      .flatMap((value) => this.extractNodeNames(value));
  }

  private extractNodeName(source: UnknownRecord): string | null {
    for (const key of ['node', 'name', 'server', 'hostname', 'id']) {
      const value = source[key];

      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return null;
  }

  private extractRecordArray(source: unknown): UnknownRecord[] {
    return Array.isArray(source) ? source.filter((entry): entry is UnknownRecord => isRecord(entry)) : [];
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

  private stringifyMetric(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }

    return null;
  }

  private asFiniteNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private clampPercent(value: number | null): number {
    if (value === null || !Number.isFinite(value)) {
      return 0;
    }

    return Math.min(100, Math.max(0, value));
  }

  private readPath(source: unknown, key: string): unknown {
    if (!isRecord(source)) {
      return null;
    }

    return source[key] ?? this.readPath(source['data'], key);
  }
}
