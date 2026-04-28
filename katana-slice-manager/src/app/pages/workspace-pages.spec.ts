import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { DashboardPageComponent } from './dashboard-page/dashboard-page.component';
import { HistoryPageComponent } from './history-page/history-page.component';
import { ProxmoxApiPageComponent } from './proxmox-api-page/proxmox-api-page.component';
import { DashboardDataService } from '../shared/services/dashboard-data.service';
import { DeploymentHistoryService } from '../shared/services/deployment-history.service';
import { ProxmoxStandaloneApiService } from '../shared/services/api';

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

  describe('ProxmoxApiPageComponent', () => {
    let fixture: ComponentFixture<ProxmoxApiPageComponent>;
    const proxmoxStandaloneApiService = {
      connect: () => of({ nodes: ['cls01srv06', 'cls01srv07'] }),
      getRemainingResources: () =>
        of({
          remaining_resources: {
            cluster: {
              cpu: { free_cores_estimate: 327.44, free_percent: 93.02, total_cores: 352 },
              disk: {
                free: 698925314048,
                total: 890423820288,
                free_human: '650.92 GB',
                total_human: '829.27 GB'
              },
              memory: {
                free: 526805704704,
                total: 1280904474624,
                free_human: '490.63 GB',
                total_human: '1.16 TB'
              }
            },
            servers: [
              {
                name: 'cls01srv06',
                cpu: { free_cores_estimate: 14.15, free_percent: 88.41, total_cores: 16 },
                disk: { free: 89955205120, total: 100861726720, free_human: '83.78 GB', total_human: '93.93 GB' },
                memory: { free: 25962684416, total: 67515006976, free_human: '24.18 GB', total_human: '62.88 GB' }
              },
              {
                name: 'cls01srv07',
                cpu: { free_cores_estimate: 15.86, free_percent: 99.12, total_cores: 16 },
                disk: { free: 91579314176, total: 100861726720, free_human: '85.29 GB', total_human: '93.93 GB' },
                memory: { free: 50409828352, total: 67514990592, free_human: '46.95 GB', total_human: '62.88 GB' }
              }
            ],
            storage_options: [
              {
                node: 'cls01srv06',
                storage: 'backup',
                type: 'nfs',
                content: 'images,rootdir,backup',
                shared: true,
                status: 'available',
                remaining_human: '9.99 TB',
                used_human: '7.46 TB',
                maximum_load_human: '17.44 TB',
                remaining_percent: 57.26,
                used_percent: 42.74
              },
              {
                node: 'cls01srv07',
                storage: 'datastorage',
                type: 'nfs',
                content: 'rootdir,backup,images,iso,vztmpl',
                shared: true,
                status: 'available',
                remaining_human: '9.99 TB',
                used_human: '7.46 TB',
                maximum_load_human: '17.44 TB',
                remaining_percent: 57.26,
                used_percent: 42.74
              }
            ]
          }
        })
    };

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [ProxmoxApiPageComponent],
        providers: [
          {
            provide: ProxmoxStandaloneApiService,
            useValue: proxmoxStandaloneApiService
          }
        ]
      }).compileComponents();

      fixture = TestBed.createComponent(ProxmoxApiPageComponent);
      fixture.detectChanges();
    });

    it('renders a capacity dashboard after authentication', () => {
      const component = fixture.componentInstance as unknown as {
        form: {
          patchValue: (value: Record<string, string | boolean>) => void;
        };
        submit: () => void;
      };

      component.form.patchValue({
        name: 'my-proxmox',
        url: 'https://10.160.100.11:8006',
        authMethod: 'password',
        username: 'root@pam',
        password: 'secret',
        verifySsl: false
      });

      component.submit();
      fixture.detectChanges();

      const element = fixture.nativeElement as HTMLElement;
      const text = element.textContent ?? '';

      expect(text).toContain('Proxmox Capacity Dashboard');
      expect(text).toContain('Loaded 2 Proxmox node cards from the standalone API.');
      expect(text).toContain('Cluster CPU headroom');
      expect(text).toContain('327.44 free cores');
      expect(text).toContain('cls01srv06');
      expect(text).toContain('14.15 free cores');
      expect(text).toContain('24.18 GB free');
      expect(text).toContain('backup');
      expect(text).toContain('57.26% free');
      expect(text).toContain('Storage name');
      expect(text).toContain('Disk type');
      expect(text).toContain('Total capacity');
      expect(text).toContain('17.44 TB total');
      expect(text).toContain('Capacity by storage name');
    });
  });
});
