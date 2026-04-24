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

  beforeEach(async () => {
    localStorage.clear();

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
            paramMap: new BehaviorSubject(convertToParamMap({ option: 'proxmox' })).asObservable(),
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

    fixture = TestBed.createComponent(DeploymentPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('unlocks the deploy step when an active Proxmox cluster already exists', () => {
    expect(component['canAccessStepTwo']()).toBe(true);
    expect(component['currentStep']).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('Deploy Configuration');
  });
});
