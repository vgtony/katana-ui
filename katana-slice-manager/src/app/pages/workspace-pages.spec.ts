import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { DashboardPageComponent } from './dashboard-page/dashboard-page.component';
import { HistoryPageComponent } from './history-page/history-page.component';
import { DashboardDataService } from '../shared/services/dashboard-data.service';
import { DeploymentHistoryService } from '../shared/services/deployment-history.service';

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

    it('renders completed deployment packs', () => {
      expect(fixture.nativeElement.textContent).toContain('Deployment Packs');
      expect(fixture.nativeElement.textContent).toContain('Slice / OpenStack Pack');
      expect(fixture.nativeElement.textContent).toContain('NFVO');
    });
  });
});
