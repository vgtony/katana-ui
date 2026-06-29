import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { convertToParamMap, ActivatedRoute, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { DashboardPageComponent } from './dashboard-page/dashboard-page.component';
import { HistoryPageComponent } from './history-page/history-page.component';
import { MonitoringPageComponent } from './monitoring-page/monitoring-page.component';
import { DashboardDataService } from '../shared/services/dashboard-data.service';
import { DeploymentHistoryService } from '../shared/services/deployment-history.service';
import { SliceApiService } from '../shared/services/api/slice-api.service';

describe('Workspace pages', () => {
  describe('DashboardPageComponent', () => {
    let fixture: ComponentFixture<DashboardPageComponent>;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [DashboardPageComponent],
        providers: [
          {
            provide: DashboardDataService,
            useValue: {
              loadSections: () =>
                of([
                  {
                    key: 'locations',
                    label: 'Locations',
                    category: 'infrastructure',
                    columns: ['id', 'description'],
                    rows: [
                      { id: 'group0_edge', description: 'Group 0 Edge' },
                      { id: 'group1_core', description: 'Group 1 Core' }
                    ],
                    error: null
                  }
                ])
            }
          }
        ]
      }).compileComponents();

      fixture = TestBed.createComponent(DashboardPageComponent);
      fixture.detectChanges();
    });

    it('renders dashboard sections from the loader service', () => {
      expect(fixture.nativeElement.textContent).toContain('Dashboard');
      expect(fixture.nativeElement.textContent).toContain('Locations');
      expect(fixture.nativeElement.textContent).toContain('Group 0 Edge');
    });
  });

  describe('HistoryPageComponent', () => {
    let fixture: ComponentFixture<HistoryPageComponent>;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [HistoryPageComponent],
        providers: [
          {
            provide: DeploymentHistoryService,
            useValue: {
              packs$: of([
                {
                  id: 'pack-1',
                  name: 'Slice / OpenStack Pack',
                  optionId: 'slice',
                  optionLabel: 'Slice / OpenStack',
                  shortLabel: 'Slice',
                  status: 'done',
                  completedAt: '2026-03-31T08:00:00.000Z',
                  finalConfigurationLabel: 'Slice configuration',
                  requirements: [
                    { id: 'nfvo', label: 'NFVO', status: 'done' },
                    { id: 'vim', label: 'VIM', status: 'done' }
                  ]
                },
                {
                  id: 'pack-2',
                  name: 'Proxmox VM Pack',
                  optionId: 'proxmox',
                  optionLabel: 'Proxmox VM',
                  shortLabel: 'Proxmox',
                  status: 'failed',
                  errorType: 'Internal Server Error',
                  completedAt: '2026-04-01T09:00:00.000Z',
                  finalConfigurationLabel: 'Proxmox VM configuration',
                  requirements: [{ id: 'proxmox-cluster', label: 'Proxmox Cluster', status: 'done' }]
                }
              ]),
              clearPacks: () => undefined
            }
          }
        ]
      }).compileComponents();

      fixture = TestBed.createComponent(HistoryPageComponent);
      fixture.detectChanges();
    });

    it('renders completed and failed deployment packs', () => {
      expect(fixture.nativeElement.textContent).toContain('Deployment Packs');
      expect(fixture.nativeElement.textContent).toContain('Slice / OpenStack');
      expect(fixture.nativeElement.textContent).toContain('Proxmox VM');
      expect(fixture.nativeElement.textContent).toContain('Internal Server Error');
      expect(fixture.nativeElement.textContent).toContain('NFVO');
    });
  });

  describe('MonitoringPageComponent', () => {
    it('renders slice observability cards from the Katana NBI API', async () => {
      await TestBed.configureTestingModule({
        imports: [MonitoringPageComponent],
        providers: [
          provideRouter([]),
          {
            provide: ActivatedRoute,
            useValue: {
              paramMap: of(convertToParamMap({}))
            }
          },
          {
            provide: SliceApiService,
            useValue: {
              getSliceObservabilityCards: () =>
                of([
                  {
                    _id: 'slice-1',
                    name: 'Edge Slice',
                    status: 'running',
                    created_at: '2026-06-29T08:00:00.000Z',
                    monitoring: {
                      configured: true,
                      prometheus: {
                        queries: {
                          slice_status: 'query'
                        }
                      }
                    }
                  }
                ])
            }
          }
        ]
      }).compileComponents();

      const fixture = TestBed.createComponent(MonitoringPageComponent);
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('Slice Observability');
      expect(fixture.nativeElement.textContent).toContain('Edge Slice');
      expect(fixture.nativeElement.textContent).toContain('Configured');
    });

    it('falls back to the slice inventory when observability cards are unavailable', async () => {
      await TestBed.configureTestingModule({
        imports: [MonitoringPageComponent],
        providers: [
          provideRouter([]),
          {
            provide: ActivatedRoute,
            useValue: {
              paramMap: of(convertToParamMap({}))
            }
          },
          {
            provide: SliceApiService,
            useValue: {
              getSliceObservabilityCards: () =>
                throwError(() => new HttpErrorResponse({ status: 404 })),
              getSlices: () =>
                of([
                  {
                    id: 'slice-legacy',
                    name: 'Legacy Slice',
                    status: 'running'
                  }
                ])
            }
          }
        ]
      }).compileComponents();

      const fixture = TestBed.createComponent(MonitoringPageComponent);
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('Legacy Slice');
      expect(fixture.nativeElement.textContent).toContain('Not configured');
    });

    it('renders selected slice monitoring summary and local chart data', async () => {
      await TestBed.configureTestingModule({
        imports: [MonitoringPageComponent],
        providers: [
          provideRouter([]),
          {
            provide: ActivatedRoute,
            useValue: {
              paramMap: of(convertToParamMap({ sliceId: 'slice-1' }))
            }
          },
          {
            provide: SliceApiService,
            useValue: {
              getSliceObservabilityCards: () => of([]),
              getSliceObservability: () =>
                of({
                  _id: 'slice-1',
                  name: 'Edge Slice',
                  monitoring: {
                    configured: true,
                    prometheus: {
                      queries: {
                        slice_status: 'query'
                      }
                    }
                  }
                }),
              getSliceMonitoringSummary: () =>
                of({
                  monitoring: {
                    configured: true,
                    prometheus: {
                      queries: {
                        slice_status: 'query'
                      },
                      unavailable: ['openstack_vm_memory_usage']
                    }
                  },
                  metrics: {
                    slice_status: { label: 'Active' },
                    network_services: [{ name: 'ns-1', status: 'running' }],
                    wim_flows_per_second: { ingress: 4 },
                    infrastructure: { cpu: { value: 41, unit: '%' } }
                  }
                }),
              getSliceMonitoringMetadata: () => of({ prometheus: { base_url: 'metadata-only' } }),
              getSliceMonitoringRange: () =>
                of({
                  data: {
                    result: [
                      {
                        metric: { instance: 'vm-1' },
                        values: [
                          [1000, '1'],
                          [1030, '2']
                        ]
                      }
                    ]
                  }
                }),
              getSliceLogs: () => of('logs')
            }
          }
        ]
      }).compileComponents();

      const fixture = TestBed.createComponent(MonitoringPageComponent);
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('Edge Slice');
      expect(fixture.nativeElement.textContent).toContain('Active');
      expect(fixture.nativeElement.textContent).toContain('Network Services');
      expect(fixture.nativeElement.querySelector('polyline')).not.toBeNull();
    });
  });

});
