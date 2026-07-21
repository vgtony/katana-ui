import { Injectable } from '@angular/core';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { DashboardRow, DashboardSection } from '../../models/interfaces/dashboard.interface';
import {
  CatalogApiService,
  EmsApiService,
  FunctionApiService,
  KubernetesApiService,
  LocationApiService,
  NfvoApiService,
  PolicyApiService,
  ProxmoxApiService,
  ResourcesApiService,
  SliceApiService,
  TrustApiService,
  VimApiService,
  WimApiService,
  getApiErrorMessage
} from './api';

interface DashboardSource {
  key: string;
  label: string;
  category: DashboardSection['category'];
  request: Observable<unknown>;
}

@Injectable({ providedIn: 'root' })
export class DashboardDataService {
  constructor(
    private readonly sliceApi: SliceApiService,
    private readonly vimApi: VimApiService,
    private readonly nfvoApi: NfvoApiService,
    private readonly wimApi: WimApiService,
    private readonly emsApi: EmsApiService,
    private readonly functionApi: FunctionApiService,
    private readonly policyApi: PolicyApiService,
    private readonly resourcesApi: ResourcesApiService,
    private readonly catalogApi: CatalogApiService,
    private readonly locationApi: LocationApiService,
    private readonly kubernetesApi: KubernetesApiService,
    private readonly trustApi: TrustApiService,
    private readonly proxmoxApi: ProxmoxApiService
  ) {}

  loadSections(): Observable<DashboardSection[]> {
    const sources: DashboardSource[] = [
      {
        key: 'slices',
        label: 'Slices',
        category: 'deployment',
        request: this.sliceApi.getSlices()
      },
      {
        key: 'functions',
        label: 'Functions',
        category: 'deployment',
        request: this.functionApi.getFunctions()
      },
      {
        key: 'vims',
        label: 'VIMs',
        category: 'infrastructure',
        request: this.vimApi.getVims()
      },
      {
        key: 'nfvos',
        label: 'NFVOs',
        category: 'infrastructure',
        request: this.nfvoApi.getNfvos()
      },
      {
        key: 'wims',
        label: 'WIMs',
        category: 'infrastructure',
        request: this.wimApi.getWims()
      },
      {
        key: 'ems',
        label: 'EMS',
        category: 'infrastructure',
        request: this.emsApi.getEmsList()
      },
      {
        key: 'locations',
        label: 'Locations',
        category: 'infrastructure',
        request: this.locationApi.getLocations()
      },
      {
        key: 'k8s',
        label: 'K8s Clusters',
        category: 'infrastructure',
        request: this.kubernetesApi.getK8sClusters()
      },
      {
        key: 'proxmox-clusters',
        label: 'Proxmox Clusters',
        category: 'infrastructure',
        request: this.proxmoxApi.getClusters()
      },
      {
        key: 'gsts',
        label: 'GSTs',
        category: 'catalog',
        request: this.catalogApi.getGsts()
      },
      {
        key: 'base-slice-descriptors',
        label: 'Base Slice Descriptors',
        category: 'catalog',
        request: this.catalogApi.getBaseSliceDescriptors()
      },
      {
        key: 'ns-list',
        label: 'NS Descriptors',
        category: 'catalog',
        request: this.catalogApi.getNsList()
      },
      {
        key: 'policies',
        label: 'Policies',
        category: 'operations',
        request: this.policyApi.getPolicies()
      },
      {
        key: 'resources',
        label: 'Resources',
        category: 'operations',
        request: this.resourcesApi.getResources()
      },
      {
        key: 'lot',
        label: 'LoT Monitors',
        category: 'operations',
        request: this.trustApi.getLotMonitors()
      }
    ];

    return forkJoin(
      sources.map((source) =>
        source.request.pipe(
          map((payload) => this.createSection(source, payload, null)),
          catchError((error: unknown) =>
            of(
              this.createSection(
                source,
                [],
                getApiErrorMessage(error, `Unable to load ${source.label.toLowerCase()}.`)
              )
            )
          )
        )
      )
    );
  }

  private createSection(
    source: DashboardSource,
    payload: unknown,
    error: string | null
  ): DashboardSection {
    const rows = this.toRows(payload);
    const columns = rows.flatMap((row) => Object.keys(row)).filter((value, index, array) => {
      return array.indexOf(value) === index;
    });

    return {
      key: source.key,
      label: source.label,
      category: source.category,
      columns,
      rows,
      error
    };
  }

  private toRows(payload: unknown): DashboardRow[] {
    if (Array.isArray(payload)) {
      return payload.map((entry, index) => this.normalizeArrayEntry(entry, index));
    }

    if (payload && typeof payload === 'object') {
      return Object.entries(payload as Record<string, unknown>).map(([field, value]) => ({
        field,
        value: this.normalizeValue(value)
      }));
    }

    if (payload === null || payload === undefined || payload === '') {
      return [];
    }

    return [{ value: this.normalizeValue(payload) }];
  }

  private normalizeArrayEntry(entry: unknown, index: number): DashboardRow {
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      return Object.fromEntries(
        Object.entries(entry as Record<string, unknown>).map(([key, value]) => [
          key,
          this.normalizeValue(value)
        ])
      );
    }

    return {
      index: index + 1,
      value: this.normalizeValue(entry)
    };
  }

  private normalizeValue(value: unknown): string | number | boolean | null {
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value;
    }

    return JSON.stringify(value);
  }
}
