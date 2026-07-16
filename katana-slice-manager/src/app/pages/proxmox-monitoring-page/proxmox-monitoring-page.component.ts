import { NgClass } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { asyncScheduler, observeOn } from 'rxjs';
import {
  ProxmoxClusterResponse,
  ProxmoxOverviewResponse,
  ProxmoxOverviewServer,
  ProxmoxOverviewVm,
  ProxmoxResourceBlock,
  ProxmoxStorageOption,
  ProxmoxTask,
} from '../../models/interfaces/proxmox.interface';
import { ProxmoxApiService } from '../../shared/services/api';

interface MetricCard {
  label: string;
  value: string;
  detail: string;
}

@Component({
  selector: 'app-proxmox-monitoring-page',
  imports: [FormsModule, NgClass],
  templateUrl: './proxmox-monitoring-page.component.html',
  styleUrl: './proxmox-monitoring-page.component.scss',
})
export class ProxmoxMonitoringPageComponent implements OnInit {
  private readonly proxmoxApi = inject(ProxmoxApiService);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);

  protected clusters: ProxmoxClusterResponse[] = [];
  protected selectedClusterId = '';
  protected overview: ProxmoxOverviewResponse | null = null;
  protected loadingClusters = true;
  protected loadingOverview = false;
  protected loadingTasks = false;
  protected loadingTaskLog = false;
  protected errorMessage = '';
  protected taskErrorMessage = '';
  protected tasks: ProxmoxTask[] = [];
  protected selectedTaskUpid = '';
  protected selectedTaskLog: Array<Record<string, unknown> | string> = [];

  ngOnInit(): void {
    this.loadClusters();
  }

  protected get selectedCluster(): ProxmoxClusterResponse | undefined {
    return this.clusters.find((cluster) => cluster._id === this.selectedClusterId);
  }

  protected get metricCards(): MetricCard[] {
    const summary = this.overview?.clusters?.[0]?.summary ?? {};
    const physical = this.overview?.usage?.physical_resources;

    return [
      {
        label: 'Nodes',
        value: `${summary.online_node_count ?? 0}/${summary.node_count ?? 0}`,
        detail: 'online',
      },
      {
        label: 'VMs',
        value: `${summary.running_vm_count ?? 0}/${summary.vm_count ?? 0}`,
        detail: 'running',
      },
      {
        label: 'CPU',
        value: this.formatPercent(physical?.cpu?.used_percent),
        detail: this.formatCores(physical?.cpu),
      },
      {
        label: 'Memory',
        value: this.formatPercent(physical?.memory?.used_percent),
        detail: `${physical?.memory?.used_human ?? '0 B'} used`,
      },
      {
        label: 'Disk',
        value: this.formatPercent(physical?.disk?.used_percent),
        detail: `${physical?.disk?.used_human ?? '0 B'} used`,
      },
    ];
  }

  protected get servers(): ProxmoxOverviewServer[] {
    return this.overview?.servers ?? [];
  }

  protected get vms(): ProxmoxOverviewVm[] {
    return this.overview?.vms ?? [];
  }

  protected get storageOptions(): ProxmoxStorageOption[] {
    const clusterStorage = this.overview?.remaining_resources?.cluster?.storage_options;
    if (clusterStorage?.length) {
      return clusterStorage;
    }

    const seen = new Set<string>();
    return this.servers
      .flatMap((server) => server.storage_options ?? [])
      .filter((storage) => {
        const key = `${storage.node}:${storage.storage}`;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
  }

  protected loadClusters(): void {
    this.loadingClusters = true;
    this.errorMessage = '';

    this.proxmoxApi
      .getClusters()
      .pipe(observeOn(asyncScheduler))
      .subscribe({
        next: (clusters) => {
          this.clusters = clusters;
          this.loadingClusters = false;
          if (!this.selectedClusterId && clusters.length) {
            this.selectedClusterId = clusters[0]._id;
            this.loadOverview();
          }
          this.changeDetectorRef.markForCheck();
        },
        error: () => {
          this.loadingClusters = false;
          this.errorMessage = 'Unable to load Proxmox clusters.';
          this.changeDetectorRef.markForCheck();
        },
      });
  }

  protected loadOverview(): void {
    if (!this.selectedClusterId) {
      this.overview = null;
      return;
    }

    this.loadingOverview = true;
    this.errorMessage = '';
    this.tasks = [];
    this.selectedTaskUpid = '';
    this.selectedTaskLog = [];

    this.proxmoxApi
      .getOverview({ cluster_id: this.selectedClusterId })
      .pipe(observeOn(asyncScheduler))
      .subscribe({
        next: (overview) => {
          this.overview = overview;
          this.loadingOverview = false;
          this.loadTasks();
          this.changeDetectorRef.markForCheck();
        },
        error: () => {
          this.overview = null;
          this.loadingOverview = false;
          this.errorMessage = 'Unable to load Proxmox monitoring data.';
          this.changeDetectorRef.markForCheck();
        },
      });
  }

  protected onClusterChange(): void {
    this.loadOverview();
  }

  protected refresh(): void {
    if (this.clusters.length) {
      this.loadOverview();
    } else {
      this.loadClusters();
    }
  }

  protected loadTasks(): void {
    if (!this.selectedClusterId) {
      this.tasks = [];
      return;
    }

    this.loadingTasks = true;
    this.taskErrorMessage = '';

    this.proxmoxApi
      .getTasks({ cluster_id: this.selectedClusterId, limit: 20 })
      .pipe(observeOn(asyncScheduler))
      .subscribe({
        next: (response) => {
          this.tasks = response.tasks;
          this.loadingTasks = false;
          this.changeDetectorRef.markForCheck();
        },
        error: () => {
          this.tasks = [];
          this.loadingTasks = false;
          this.taskErrorMessage = 'Unable to load Proxmox task history.';
          this.changeDetectorRef.markForCheck();
        },
      });
  }

  protected openTaskLog(task: ProxmoxTask): void {
    if (!this.selectedClusterId || !task.upid) {
      return;
    }

    if (this.selectedTaskUpid === task.upid) {
      this.selectedTaskUpid = '';
      this.selectedTaskLog = [];
      return;
    }

    this.selectedTaskUpid = task.upid;
    this.selectedTaskLog = [];
    this.loadingTaskLog = true;

    this.proxmoxApi
      .getTaskLog({
        cluster_id: this.selectedClusterId,
        node: task.node,
        upid: task.upid,
      })
      .pipe(observeOn(asyncScheduler))
      .subscribe({
        next: (response) => {
          this.selectedTaskLog = response.log;
          this.loadingTaskLog = false;
          this.changeDetectorRef.markForCheck();
        },
        error: () => {
          this.selectedTaskLog = ['Unable to load task log.'];
          this.loadingTaskLog = false;
          this.changeDetectorRef.markForCheck();
        },
      });
  }

  protected formatPercent(value: number | undefined): string {
    return `${Math.round(value ?? 0)}%`;
  }

  protected formatCores(block: ProxmoxResourceBlock | undefined): string {
    const used = block?.used_cores_estimate ?? 0;
    const total = block?.total_cores ?? 0;
    return `${used} / ${total} cores`;
  }

  protected formatUptime(seconds: number | undefined): string {
    if (!seconds) {
      return '0m';
    }
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days) {
      return `${days}d ${hours}h`;
    }
    if (hours) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  protected formatTime(epochSeconds: number | undefined): string {
    if (!epochSeconds) {
      return 'n/a';
    }
    return new Date(epochSeconds * 1000).toLocaleString();
  }

  protected logLineText(line: Record<string, unknown> | string): string {
    if (typeof line === 'string') {
      return line;
    }
    return String(line['t'] ?? line['msg'] ?? line['n'] ?? JSON.stringify(line));
  }

  protected statusClass(status: string | undefined): string {
    const normalized = (status ?? '').toLowerCase();
    if (normalized === 'online' || normalized === 'running') {
      return 'proxmox-monitoring-page__status--ok';
    }
    if (normalized === 'offline' || normalized === 'stopped') {
      return 'proxmox-monitoring-page__status--muted';
    }
    return 'proxmox-monitoring-page__status--warn';
  }

  protected trackByCluster(_: number, cluster: ProxmoxClusterResponse): string {
    return cluster._id;
  }

  protected trackByServer(_: number, server: ProxmoxOverviewServer): string {
    return server.name;
  }

  protected trackByVm(_: number, vm: ProxmoxOverviewVm): number {
    return vm.vmid;
  }

  protected trackByStorage(_: number, storage: ProxmoxStorageOption): string {
    return `${storage.node}:${storage.storage}`;
  }

  protected trackByTask(_: number, task: ProxmoxTask): string {
    return task.upid;
  }
}
