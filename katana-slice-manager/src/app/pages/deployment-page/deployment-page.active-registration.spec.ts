import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import {
  KubernetesApiService,
  ProxmoxApiService,
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
    paramMap$ = new BehaviorSubject(convertToParamMap({ option: 'proxmox' }));

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
          provide: KubernetesApiService,
          useValue: {
            getK8sClusters: () => of([])
          }
        },
        {
          provide: ProxmoxApiService,
          useValue: {
            getClusters: () => of([])
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

  it('unlocks the Proxmox VM deployment step when an active VM cluster registration already exists', () => {
    draftService.saveFormValue(
      'proxmox',
      'proxmox-cluster',
      {
        name: 'lab-cluster',
        url: 'https://proxmox.example:8006',
        username: 'root@pam',
        password: 'secret',
        node: 'pve-01'
      },
      'active'
    );

    createComponent();

    expect(component['canAccessStepTwo']()).toBe(true);
    expect(component['currentStep']).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('Deploy Configuration');
  });

  it('unlocks the standalone overview when an active standalone Proxmox registration already exists', () => {
    draftService.saveFormValue(
      'proxmox-standalone',
      'proxmox-standalone',
      {
        name: 'lab-cluster',
        url: 'https://proxmox.example:8006',
        verifySsl: false,
        authMethod: 'password',
        username: 'root@pam',
        password: 'secret',
        apiTokenId: '',
        apiTokenSecret: '',
        connectedNodes: ['pve-01'],
        clusters: [],
        servers: [],
        remainingResources: null,
        loadedAt: '2026-04-27T08:00:00.000Z'
      },
      'active'
    );

    paramMap$.next(convertToParamMap({ option: 'proxmox-standalone' }));
    createComponent();

    expect(component['canAccessStepTwo']()).toBe(true);
    expect(component['currentStep']).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('Compact Overview');
  });
});
