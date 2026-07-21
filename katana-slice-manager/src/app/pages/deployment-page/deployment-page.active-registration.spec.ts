import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import {
  AmarisoftSliceApiService,
  KubernetesApiService,
  SliceApiService
} from '../../shared/services/api';
import { DeploymentDraftService } from '../../shared/services/deployment-draft.service';
import { DeploymentPageComponent } from './deployment-page.component';

describe('DeploymentPageComponent active registration', () => {
  let fixture: ComponentFixture<DeploymentPageComponent>;
  let component: DeploymentPageComponent;
  let draftService: DeploymentDraftService;
  let paramMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  beforeEach(async () => {
    localStorage.clear();
    paramMap$ = new BehaviorSubject(convertToParamMap({ option: 'proxmox-standalone' }));

    await TestBed.configureTestingModule({
      imports: [DeploymentPageComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        DeploymentDraftService,
        {
          provide: ActivatedRoute,
          useValue: {
            get paramMap() {
              return paramMap$.asObservable();
            },
            queryParamMap: new BehaviorSubject(convertToParamMap({})).asObservable()
          }
        },
        {
          provide: SliceApiService,
          useValue: {
            getSlices: () => of([])
          }
        },
        {
          provide: AmarisoftSliceApiService,
          useValue: {
            getSlices: () => of([])
          }
        },
        {
          provide: KubernetesApiService,
          useValue: {
            getK8sClusters: () => of([])
          }
        }
      ]
    }).compileComponents();

    draftService = TestBed.inject(DeploymentDraftService);
  });

  function createComponent(): void {
    fixture = TestBed.createComponent(DeploymentPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('unlocks the standalone overview when an active standalone Proxmox registration already exists', () => {
    draftService.saveFormValue(
      'proxmox-standalone',
      'proxmox-standalone',
      {
        url: 'https://proxmox.example:8006',
        verifySsl: false,
        authMethod: 'password',
        username: 'root@pam',
        password: 'secret',
        apiTokenId: '',
        apiTokenSecret: '',
        clusterId: 'saved-katana-id',
        clusterName: 'Antares',
        datacenters: [{ id: 'cluster', name: 'Antares', node_count: 1 }],
        selectedDatacenter: { id: 'cluster', name: 'Antares' },
        nodes: [{ name: 'pve-01' }],
        servers: [{ name: 'pve-01', node: 'pve-01' }],
        overview: {
          cluster: {
            cpu: { free_cores_estimate: 8, free_percent: 50 },
            memory: { free_human: '16.00 GB', total_human: '32.00 GB', free: 16, total: 32 },
            disk: { free_human: '500.00 GB', total_human: '1.00 TB', free: 5, total: 10 }
          },
          servers: [
            {
              name: 'pve-01',
              node: 'pve-01',
              cpu: { free_cores_estimate: 8, free_percent: 50 },
              memory: {
                free_human: '16.00 GB',
                total_human: '32.00 GB',
                free: 16,
                total: 32
              },
              disk: { free_human: '500.00 GB', total_human: '1.00 TB', free: 5, total: 10 },
              storage_options: []
            }
          ]
        },
        loadedAt: '2026-04-27T08:00:00.000Z'
      },
      'active'
    );

    paramMap$.next(convertToParamMap({ option: 'proxmox-standalone' }));
    createComponent();

    expect(component['canAccessStepTwo']()).toBe(true);
    expect(component['currentStep']).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('Servers');
  });
});
