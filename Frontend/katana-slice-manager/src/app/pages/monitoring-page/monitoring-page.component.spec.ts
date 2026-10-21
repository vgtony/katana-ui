import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { SliceApiService } from '../../shared/services/api';
import { MonitoringPageComponent } from './monitoring-page.component';

describe('Monitoring request lifecycle', () => {
  it('aligns sparse series to the requested time window and keeps unknown states neutral', async () => {
    await TestBed.configureTestingModule({
      imports: [MonitoringPageComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({})) } },
        { provide: SliceApiService, useValue: { getSliceObservabilityCards: () => of([]) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(MonitoringPageComponent);
    const component = fixture.componentInstance;
    component['chartStart'] = 100;
    component['chartEnd'] = 200;
    const series = component['buildChartSeries']({
      data: {
        result: [
          {
            metric: { instance: 'edge' },
            values: [
              [100, '0.1'],
              [200, '0.2'],
            ],
          },
          {
            metric: { instance: 'core' },
            values: [
              [150, '0.15'],
              [200, 'NaN'],
            ],
          },
        ],
      },
    });
    expect(series[0].svgPoints).toBe('18.0,202.0 702.0,18.0');
    expect(series[1].svgPoints).toBe('360.0,110.0');
    expect(component['statusTone']('failed')).toBe('critical');
    expect(component['statusTone']('unrecognized')).toBe('unknown');
    component['cards'] = [
      { _id: 'edge', monitoring: { configured: true } },
      { _id: 'core', monitoring: { configured: false } },
    ];
    component['monitoringFilter'] = 'unconfigured';
    expect(component['filteredCards'].map((card) => card._id)).toEqual(['core']);
    fixture.destroy();
  });

  it('cancels old chart and log requests when selecting another slice', async () => {
    const route = new BehaviorSubject(convertToParamMap({ sliceId: 'old' }));
    const oldChart = new Subject<unknown>();
    const oldLogs = new Subject<string>();
    const newChart = new Subject<unknown>();
    const newLogs = new Subject<string>();
    await TestBed.configureTestingModule({
      imports: [MonitoringPageComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: route } },
        {
          provide: SliceApiService,
          useValue: {
            getSliceObservabilityCards: () => of([]),
            getSliceObservability: (id: string) =>
              of({ _id: id, monitoring: { configured: true } }),
            getSliceMonitoringSummary: () =>
              of({ monitoring: { prometheus: { queries: { cpu: 'q' } } } }),
            getSliceMonitoringMetadata: () => of({}),
            getSliceMonitoringRange: (id: string) => (id === 'old' ? oldChart : newChart),
            getSliceLogs: (id: string) => (id === 'old' ? oldLogs : newLogs),
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(MonitoringPageComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 10));
    component['loadLogs']();
    expect(oldChart.observed).toBe(true);
    expect(oldLogs.observed).toBe(true);
    route.next(convertToParamMap({ sliceId: 'new' }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(oldChart.observed).toBe(false);
    expect(oldLogs.observed).toBe(false);
    expect(component['loadingLogs']).toBe(false);
    component['loadLogs']();
    newLogs.next('new slice logs');
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(component['logsText']).toBe('new slice logs');
    component['updateRange']();
    fixture.destroy();
    expect(newChart.observed).toBe(false);
    expect(newLogs.observed).toBe(false);
  });
});
