import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { NfvoApiService, VimApiService } from '../../shared/services/api';
import { InfrastructurePageComponent } from './infrastructure-page.component';

describe('InfrastructurePageComponent', () => {
  it('shows linked NFVO IDs and marks unlinked VIMs unavailable without exposing secrets', async () => {
    await TestBed.configureTestingModule({
      imports: [InfrastructurePageComponent],
      providers: [
        provideRouter([]),
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
    expect(text).toContain('Unavailable for deployment');
    expect(text).not.toContain('password');
    expect(text).not.toContain('osm_vim_account_id');
  });
});
