import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { CreateSlicePageComponent } from './create-slice-page.component';
import { SliceApiService } from '../../shared/services/api';

describe('CreateSlicePageComponent', () => {
  it('replaces credentials_file with parsed credentials before deployment', async () => {
    const createUnifiedSlice = vi.fn(() => of('{"uuid":"slice-123"}'));

    await TestBed.configureTestingModule({
      imports: [CreateSlicePageComponent],
      providers: [
        provideRouter([]),
        { provide: SliceApiService, useValue: { createUnifiedSlice } }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(CreateSlicePageComponent);
    const component = fixture.componentInstance as any;
    const credentials = { apiVersion: 'v1', clusters: [], contexts: [], users: [] };
    component.nestDocument = {
      infrastructure: {
        id: 'edge-k8s-1',
        type: 'kubernetes',
        credentials_file: './creds.yaml'
      },
      base_slice_descriptor: {},
      service_descriptor: { ns_list: [] }
    };
    component.showInfrastructure = true;
    component.credentialReference = './creds.yaml';
    component.credentialData = credentials;
    component.infrastructureForm.setValue({
      id: 'edge-k8s-1',
      type: 'kubernetes',
      location: 'edge',
      nfvoId: 'osm-1',
      k8sVersion: 'v1.30.7',
      namespace: 'default',
      cloud: ''
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');

    component.deploy();

    expect(createUnifiedSlice).toHaveBeenCalledWith({
      infrastructure: {
        id: 'edge-k8s-1',
        type: 'kubernetes',
        location: 'edge',
        nfvo_id: 'osm-1',
        k8s_version: 'v1.30.7',
        namespace: 'default',
        credentials
      },
      base_slice_descriptor: {},
      service_descriptor: { ns_list: [] }
    });
    expect(navigate).toHaveBeenCalledWith(['/slices', 'slice-123']);
  });
});
