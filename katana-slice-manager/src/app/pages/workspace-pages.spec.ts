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
      getOverview: () =>
        of({
          remaining_resources: {
            cls01srv06: { cpu_remaining: 16, ram_remaining: 64, disk_remaining: 300 },
            cls01srv07: { cpu_remaining: 24, ram_remaining: 96, disk_remaining: 520 }
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

    it('loads node forms with remaining capacity after authentication', () => {
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
      const inputValues = Array.from(element.querySelectorAll('input'))
        .map((input) => (input as HTMLInputElement).value)
        .join(' ');

      expect(text).toContain('Proxmox Node Discovery');
      expect(text).toContain('Loaded 2 Proxmox node forms from the standalone API.');
      expect(inputValues).toContain('cls01srv06');
      expect(inputValues).toContain('cls01srv07');
      expect(inputValues).toContain('16');
      expect(inputValues).toContain('520');
    });
  });
});
