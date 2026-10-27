import { ClusterWorkloadsComponent } from './cluster-workloads.component';
import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Subject, catchError, defer, map, of, switchMap } from 'rxjs';
import { isNestRecord } from '../../../shared/nest-file.utils';
import {
  AmarisoftSliceApiService,
  SliceApiService,
  getApiErrorMessage,
} from '../../../shared/services/api';

export interface TopologySource {
  key: 'slice' | 'k8s' | 'amari';
  title: string;
  loading: boolean;
  error: string | null;
  items: unknown[];
}
interface TopologyOption {
  key: string;
  id: string;
  kind: TopologySource['key'];
  name: string;
  group: string;
  record: Record<string, unknown>;
}
interface TopologyBranch {
  key: string;
  kind: string;
  name: string;
  details: { label: string; value: string }[];
  target?: { kind: string; name: string };
}

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

// Only explicit relationships from the API are drawn; location/name similarity is not a link.
export function topologyBranches(kind: TopologySource['key'], value: unknown): TopologyBranch[] {
  if (!isNestRecord(value)) return [];
  if (kind === 'k8s') {
    const account = text(value['vim_account']);
    const nfvo = text(value['nfvo_id']);
    return account || nfvo
      ? [
          {
            key: 'registration',
            kind: 'VIM account',
            name: account || 'Not reported',
            details: [],
            ...(nfvo ? { target: { kind: 'Registered with orchestrator', name: nfvo } } : {}),
          },
        ]
      : [];
  }
  if (kind === 'amari') {
    const targets = value['targets'];
    if (!isNestRecord(targets)) return [];
    return ['ran', 'core'].flatMap((role) => {
      const target = targets[role];
      if (!isNestRecord(target)) return [];
      let host = '';
      try {
        host = new URL(text(target['url'])).host;
      } catch {
        /* No usable endpoint. */
      }
      const ems = text(target['ems_id']);
      if (!ems && !host) return [];
      return [
        {
          key: role,
          kind: `${role.toUpperCase()} target`,
          name: ems || host,
          details: ems && host ? [{ label: 'Endpoint', value: host }] : [],
        },
      ];
    });
  }
  const instances = value['ns_inst_info'];
  if (!isNestRecord(instances)) return [];
  return Object.entries(instances).flatMap(([serviceId, locations]) => {
    if (!isNestRecord(locations)) return [];
    return Object.entries(locations).flatMap(([location, instance]) => {
      if (!isNestRecord(instance)) return [];
      return [
        {
          key: JSON.stringify([serviceId, location]),
          kind: 'Network service',
          name: text(instance['ns-name']) || serviceId,
          details: [
            { label: 'Location', value: location },
            { label: 'Status', value: text(instance['status']) || 'Not reported' },
            { label: 'Orchestrator', value: text(instance['nfvo-id']) || 'Not reported' },
          ],
          target: { kind: 'Placement target', name: text(instance['vim']) || 'Not reported' },
        },
      ];
    });
  });
}

@Component({
  selector: 'app-deployment-topology',
  imports: [RouterLink, ClusterWorkloadsComponent],
  templateUrl: './deployment-topology.component.html',
  styleUrl: './deployment-topology.component.scss',
})
export class DeploymentTopologyComponent implements OnChanges {
  @Input({ required: true }) sources: TopologySource[] = [];
  @Output() retryInventory = new EventEmitter<void>();
  private readonly sliceApi = inject(SliceApiService);
  private readonly amariApi = inject(AmarisoftSliceApiService);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly selection = new Subject<TopologyOption | null>();
  protected options: TopologyOption[] = [];
  protected selected: TopologyOption | null = null;
  protected branches: TopologyBranch[] = [];
  protected status = '';
  protected loading = false;
  protected error = '';
  protected updatedAt = '';

  constructor() {
    this.selection
      .pipe(
        switchMap((option) => {
          this.loading = !!option;
          this.error = '';
          this.branches = [];
          this.updatedAt = '';
          this.status = '';
          return defer(() =>
            option?.kind === 'slice'
              ? this.sliceApi.getSlice(option.id)
              : option?.kind === 'amari'
                ? this.amariApi.getSlice(option.id)
                : of(option?.record ?? null),
          ).pipe(
            map((value) => {
              if (option && !isNestRecord(value)) throw new Error('Invalid topology response.');
              return { value, error: '' };
            }),
            catchError((error: unknown) =>
              of({
                value: null,
                error: getApiErrorMessage(error, 'Unable to load topology. Try again.'),
              }),
            ),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe(({ value, error }) => {
        this.loading = false;
        this.error = error;
        if (this.selected && !error) {
          this.branches = topologyBranches(this.selected.kind, value);
          this.status = isNestRecord(value)
            ? text(value['status']) || 'Not reported'
            : 'Not reported';
          this.updatedAt = new Date().toLocaleTimeString();
        }
        this.changeDetector.markForCheck();
      });
  }

  ngOnChanges(): void {
    this.options = this.sources.flatMap((source) =>
      source.items.flatMap((item) => {
        if (!isNestRecord(item)) return [];
        const id = text(item['_id']) || text(item['id']) || text(item['slice_id']);
        if (!id) return [];
        return [
          {
            key: JSON.stringify([source.key, id]),
            id,
            kind: source.key,
            group: source.title,
            name: text(item['name']) || text(item['slice_name']) || id,
            record: item,
          },
        ];
      }),
    );
    const next =
      this.options.find((option) => option.key === this.selected?.key) ?? this.options[0] ?? null;
    if (next?.key !== this.selected?.key || next?.record !== this.selected?.record) {
      this.selected = next;
      this.selection.next(next);
    }
  }

  protected select(key: string): void {
    this.selected = this.options.find((option) => option.key === key) ?? null;
    this.selection.next(this.selected);
  }

  protected clusterKey(target: string): string | null {
    return (
      this.options.find(
        (option) =>
          option.kind === 'k8s' && (option.id === target || text(option.record['id']) === target),
      )?.key ?? null
    );
  }

  protected refresh(): void {
    // Cluster relationships come from the inventory response; slice details have their own endpoint.
    if (this.selected?.kind === 'k8s') this.retryInventory.emit();
    else this.selection.next(this.selected);
  }

  protected get inventoryLoading(): boolean {
    return this.sources.some((source) => source.loading);
  }
}
