import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { KubernetesApiService, NfvoApiService, VimApiService } from '../../shared/services/api';
import { InfrastructurePageComponent } from './infrastructure-page.component';

describe('InfrastructurePageComponent', () => {
  it('shows linked NFVO IDs and marks unlinked VIMs unavailable without exposing secrets', async () => {
    await TestBed.configureTestingModule({
      imports: [InfrastructurePageComponent],
      providers: [
        provideRouter([]),
        {
          provide: KubernetesApiService,
          useValue: {
            getK8sClusters: () =>
              of([
                {
                  _id: 'cluster-db',
                  id: 'cluster',
                  name: 'Legacy cluster',
                  nfvo_id: 'osm-1',
                  vim_account: 'account',
                  location: '',
                },
              ]),
            setK8sLocation: vi.fn(() => of({ message: 'Saved' })),
          },
        },
        {
          provide: NfvoApiService,
          useValue: {
            getNfvos: () => of([{ _id: 'n1', nfvo_id: 'osm-1', type: 'OSM', created_at: 1 }]),
          },
        },
        {
          provide: VimApiService,
          useValue: {
            getVims: () =>
              of([
                {
                  _id: 'v1',
                  vim_id: 'linked',
                  name: 'Linked',
                  type: 'openstack',
                  location: 'core',
                  nfvo_ids: ['osm-1'],
                  created_at: 1,
                },
                {
                  _id: 'v2',
                  vim_id: 'orphan',
                  name: 'Orphan',
                  type: 'openstack',
                  location: 'edge',
                  nfvo_ids: [],
                  created_at: 1,
                },
              ]),
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(InfrastructurePageComponent);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('osm-1');
    expect(text).toContain('Legacy cluster');
    expect(text).toContain('Registration metadata incomplete');
    const input = fixture.nativeElement.querySelector('#location-cluster-db') as HTMLInputElement;
    input.value = 'edge';
    const button = Array.from(fixture.nativeElement.querySelectorAll('button')).find((item: any) =>
      item.textContent.includes('Save location'),
    ) as HTMLButtonElement;
    button.click();
    expect(TestBed.inject(KubernetesApiService).setK8sLocation).toHaveBeenCalledWith(
      'cluster',
      'edge',
    );
    expect(text).toContain('Unavailable for deployment');
    expect(text).not.toContain('password');
    expect(text).not.toContain('osm_vim_account_id');
  });
});
