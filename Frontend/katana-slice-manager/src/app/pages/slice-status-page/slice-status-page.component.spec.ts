import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { NEVER, of } from 'rxjs';
import { CatalogApiService, SliceApiService, VimApiService } from '../../shared/services/api';
import { SliceStatusPageComponent } from './slice-status-page.component';

describe('SliceStatusPageComponent', () => {
  const nsd = {
    _id: 'n1',
    'nsd-id': 'nsd-1',
    'nsd-name': 'Core',
    nfvo_id: 'osm-1',
    deployment_runtime: 'openstack',
  };
  const vims = [
    {
      _id: 'v1',
      vim_id: 'core-a',
      name: 'Core A',
      type: 'openstack',
      location: 'core',
      nfvo_ids: ['osm-1'],
      created_at: 1,
    },
    {
      _id: 'v2',
      vim_id: 'edge-a',
      name: 'Edge A',
      type: 'openstack',
      location: 'edge',
      nfvo_ids: ['osm-1'],
      created_at: 1,
    },
  ];
  const runningSlice = {
    status: 'Running',
    ns_inst_info: {
      'instance-1': { core: { 'nfvo-id': 'osm-1', 'ns-name': 'existing', vim: 'core-a' } },
    },
  };
  let modifySlice: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    modifySlice = vi.fn(() => of({}));
    await TestBed.configureTestingModule({
      imports: [SliceStatusPageComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ sliceId: 'slice-123' }) } },
        },
        { provide: CatalogApiService, useValue: { getNsList: () => of([nsd]) } },
        { provide: VimApiService, useValue: { getVims: vi.fn(() => of(vims)) } },
        {
          provide: SliceApiService,
          useValue: {
            pollSlice: () => NEVER,
            getSliceDeploymentTime: () => NEVER,
            modifySlice,
            getSlice: () => of(runningSlice),
          },
        },
      ],
    }).compileComponents();
  });

  it('refreshes the view and stops polling when the slice reaches Running', () => {
    const fixture = TestBed.createComponent(SliceStatusPageComponent);
    const component = fixture.componentInstance as any;
    const markForCheck = vi.spyOn(component.changeDetectorRef, 'markForCheck');
    component.handlePollResult({ kind: 'success', value: { status: 'Running ' } });
    expect(component.status).toBe('Running');
    expect(component.currentStageIndex).toBe(4);
    expect(component.polling).toBe(false);
    expect(markForCheck).toHaveBeenCalled();
  });

  it('submits AddNS with owner and explicit linked target', () => {
    const fixture = TestBed.createComponent(SliceStatusPageComponent);
    const component = fixture.componentInstance as any;
    component.nsds = [nsd];
    component.addNsForm.controls.nsdId.setValue('nsd-1');
    component.addNsdChanged();
    component.addNsForm.patchValue({ nsName: 'new-core', location: 'core', target: 'core-a' });

    component.addNetworkService();

    expect(modifySlice).toHaveBeenCalledWith('slice-123', {
      domain: 'NFV',
      action: 'AddNS',
      details: {
        nsd_id: 'nsd-1',
        ns_name: 'new-core',
        location: 'core',
        nfvo_id: 'osm-1',
        target: 'core-a',
      },
    });
  });

  it('requires RestartNS change_vim target from the same NFVO and location', () => {
    const fixture = TestBed.createComponent(SliceStatusPageComponent);
    const component = fixture.componentInstance as any;
    component.handlePollResult({ kind: 'success', value: runningSlice });
    component.restartNsForm.controls.instanceKey.setValue('instance-1:core');
    component.restartInstanceChanged();
    component.restartNsForm.controls.changeVim.setValue(true);
    component.restartNsForm.controls.target.setValue('edge-a');
    component.restartNetworkService();
    expect(modifySlice).not.toHaveBeenCalled();

    component.restartNsForm.controls.target.setValue('core-a');
    component.restartNsForm.patchValue({ nsId: 'tampered-id', location: 'edge' });
    component.restartNetworkService();
    expect(modifySlice).toHaveBeenCalledWith('slice-123', {
      domain: 'NFV',
      action: 'RestartNS',
      details: { ns_id: 'instance-1', location: 'core', change_vim: true, target: 'core-a' },
    });
  });
});
