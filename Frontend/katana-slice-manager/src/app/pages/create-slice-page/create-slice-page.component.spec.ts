import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { CatalogApiService, SliceApiService, VimApiService } from '../../shared/services/api';
import { CreateSlicePageComponent } from './create-slice-page.component';

describe('CreateSlicePageComponent', () => {
  const nsd = {
    _id: 'catalog-1',
    'nsd-id': 'nsd-1',
    'nsd-name': 'Core NSD',
    nfvo_id: 'osm-1',
    deployment_runtime: 'openstack',
  };
  const linkedVims = [
    {
      _id: 'vim-db-1',
      vim_id: 'core-1',
      name: 'Core One',
      type: 'openstack',
      location: 'core',
      nfvo_ids: ['osm-1'],
      created_at: 1,
    },
    {
      _id: 'vim-db-2',
      vim_id: 'edge-1',
      name: 'Edge One',
      type: 'openstack',
      location: 'edge',
      nfvo_ids: ['osm-1'],
      created_at: 1,
    },
  ];
  let createUnifiedSlice: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    createUnifiedSlice = vi.fn(() => of('{"uuid":"slice-123"}'));
    await TestBed.configureTestingModule({
      imports: [CreateSlicePageComponent],
      providers: [
        provideRouter([]),
        { provide: SliceApiService, useValue: { createUnifiedSlice } },
        { provide: CatalogApiService, useValue: { getNsList: () => of([nsd]) } },
        { provide: VimApiService, useValue: { getVims: vi.fn(() => of(linkedVims)) } },
      ],
    }).compileComponents();
  });

  it('marks the view for refresh after asynchronously reading a dropped NEST', async () => {
    const fixture = TestBed.createComponent(CreateSlicePageComponent);
    const component = fixture.componentInstance as any;
    const markForCheck = vi.spyOn(component.changeDetectorRef, 'markForCheck');
    component.nsds = [nsd];

    await component.loadNest({
      name: 'slice.yaml',
      text: async () => 'name: edge-slice\nbase_slice_descriptor:\n  coverage: [edge]',
    });

    expect(component.summary.sliceName).toBe('edge-slice');
    expect(component.rows.length).toBe(1);
    expect(markForCheck).toHaveBeenCalled();
  });

  it('derives the NFVO, filters VIMs by placement, and does not auto-select a target', () => {
    const fixture = TestBed.createComponent(CreateSlicePageComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance as any;
    component.addService();
    const row = component.rows.at(0);
    row.controls.nsdId.setValue('nsd-1');

    component.nsdChanged(row);

    expect(row.controls.nfvoId.value).toBe('osm-1');
    expect(component.placementOptions(row)).toEqual(['core', 'edge']);
    expect(row.controls.target.value).toBe('');
    row.controls.placement.setValue('core');
    component.placementChanged(row);
    expect(component.targetsFor(row).map((vim: any) => vim.vim_id)).toEqual(['core-1']);
    expect(row.controls.target.value).toBe('');
  });

  it('submits exact service keys without infrastructure, credentials, or VIM aliases', () => {
    const fixture = TestBed.createComponent(CreateSlicePageComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance as any;
    component.nestDocument = {
      infrastructure: { credentials_file: './clouds.yaml', password: 'secret' },
      credentials_file: './creds.yaml',
      base_slice_descriptor: {},
      service_descriptor: {
        ns_list: [
          { 'osm-vim-account-id': 'manual', vim_id: 'alias', credentials: { password: 'secret' } },
        ],
      },
    };
    component.summary = { sliceName: 'test', coverage: [], nsdReferences: [], infrastructure: {} };
    component.addService();
    const row = component.rows.at(0);
    row.setValue({
      nsdId: 'nsd-1',
      nsName: 'core-ns',
      nfvoId: 'osm-1',
      placement: 'core',
      target: 'core-1',
      optional: false,
    });
    component.vimOptions.set(row, linkedVims);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');

    component.deploy();

    const payload = createUnifiedSlice.mock.calls[0][0];
    expect(payload.infrastructure).toBeUndefined();
    expect(payload.credentials_file).toBeUndefined();
    expect(payload.service_descriptor.ns_list).toEqual([
      {
        'nsd-id': 'nsd-1',
        'ns-name': 'core-ns',
        'nfvo-id': 'osm-1',
        target: 'core-1',
        placement: 'core',
        optional: false,
      },
    ]);
    expect(JSON.stringify(payload)).not.toContain('osm-vim-account-id');
    expect(JSON.stringify(payload)).not.toContain('vim_id');
    expect(JSON.stringify(payload)).not.toContain('password');
    expect(navigate).toHaveBeenCalledWith(['/slices', 'slice-123']);
  });

  it('rejects rows missing NFVO or target', () => {
    const fixture = TestBed.createComponent(CreateSlicePageComponent);
    const component = fixture.componentInstance as any;
    component.nestDocument = { base_slice_descriptor: {} };
    component.addService();
    component.rows.at(0).patchValue({ nsdId: 'nsd-1', nsName: 'core-ns', placement: 'core' });

    component.deploy();

    expect(createUnifiedSlice).not.toHaveBeenCalled();
  });
});
