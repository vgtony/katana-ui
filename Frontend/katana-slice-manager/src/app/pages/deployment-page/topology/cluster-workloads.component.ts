import { DatePipe } from '@angular/common';
import { ChangeDetectorRef, Component, Input, OnChanges, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Subject, catchError, map, of, switchMap } from 'rxjs';
import {
  KubernetesNode,
  KubernetesPod,
  KubernetesTopology,
} from '../../../models/interfaces/kubernetes-topology.interface';
import { KubernetesApiService, getApiErrorMessage } from '../../../shared/services/api';

@Component({
  selector: 'app-cluster-workloads',
  imports: [DatePipe, FormsModule],
  templateUrl: './cluster-workloads.component.html',
  styleUrl: './cluster-workloads.component.scss',
})
export class ClusterWorkloadsComponent implements OnChanges {
  @Input({ required: true }) clusterId = '';
  private readonly api = inject(KubernetesApiService);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly requests = new Subject<{ id: string; namespace: string }>();
  protected snapshot: KubernetesTopology | null = null;
  protected loading = false;
  protected error = '';
  protected namespace = '*';
  protected search = '';
  protected phase = '';

  constructor() {
    this.requests
      .pipe(
        switchMap(({ id, namespace }) =>
          this.api.getClusterTopology(id, namespace).pipe(
            map((snapshot) => ({ snapshot, error: '' })),
            catchError((error: unknown) =>
              of({
                snapshot: null,
                error: getApiErrorMessage(
                  error,
                  'Unable to inspect this cluster. Check its credentials and connectivity.',
                ),
              }),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe(({ snapshot, error }) => {
        if (snapshot) this.snapshot = snapshot;
        this.error = error;
        this.loading = false;
        if (snapshot) this.namespace = snapshot.namespace;
        this.changeDetector.markForCheck();
      });
  }

  ngOnChanges(): void {
    this.namespace = '*';
    this.search = '';
    this.phase = '';
    this.snapshot = null;
    this.refresh();
  }

  protected refresh(): void {
    this.loading = true;
    this.error = '';
    this.requests.next({ id: this.clusterId, namespace: this.namespace.trim() });
  }

  protected get workloadView() {
    if (!this.snapshot) return { groups: [], cpuMax: 0, memoryMax: 0 };
    const search = this.search.trim().toLowerCase();
    const pods = this.snapshot.pods.filter(
      (pod) =>
        (!this.phase || pod.phase === this.phase) &&
        (!search || `${pod.name} ${pod.namespace}`.toLowerCase().includes(search)),
    );
    const groups: { name: string; node: KubernetesNode | null; pods: KubernetesPod[] }[] =
      this.snapshot.nodes.map((node) => ({ name: node.name, node, pods: [] }));
    const byNode = new Map(groups.map((group) => [group.name, group]));
    for (const pod of pods) {
      const name = pod.node || 'Awaiting scheduling';
      let group = byNode.get(name);
      if (!group) {
        group = { name, node: null, pods: [] };
        groups.push(group);
        byNode.set(name, group);
      }
      group.pods.push(pod);
    }
    return {
      groups: this.search || this.phase ? groups.filter((group) => group.pods.length) : groups,
      cpuMax: pods.reduce((max, pod) => Math.max(max, pod.usage.cpu_millicores ?? 0), 0),
      memoryMax: pods.reduce((max, pod) => Math.max(max, pod.usage.memory_bytes ?? 0), 0),
    };
  }

  protected barWidth(value: number | null, maximum: number | null): number | null {
    if (value === 0 && maximum === 0) return 0;
    if (value === null || maximum === null || maximum <= 0) return null;
    return Math.min(100, Math.max(0, (value / maximum) * 100));
  }

  protected cpu(value: number | null, missing = 'Unavailable'): string {
    return value === null
      ? missing
      : `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} mCPU`;
  }

  protected memory(value: number | null, missing = 'Unavailable'): string {
    return value === null
      ? missing
      : `${(value / 1048576).toLocaleString(undefined, { maximumFractionDigits: 1 })} MiB`;
  }

  protected stale(timestamp: string | null): boolean {
    return !!timestamp && Date.now() - Date.parse(timestamp) > 120000;
  }
}
