import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, ParamMap, provideRouter, Router } from '@angular/router';
import { By } from '@angular/platform-browser';
import { BehaviorSubject, of } from 'rxjs';
import { vi } from 'vitest';
import { K8sDeployServiceFormComponent } from '../../features/registration/k8s-deploy-service-form/k8s-deploy-service-form.component';
import { ProxmoxStandaloneRegistrationFormComponent } from '../../features/registration/proxmox-standalone-registration-form/proxmox-standalone-registration-form.component';
import {
  AmarisoftSliceApiService,
  KubernetesApiService,
  SliceApiService
} from '../../shared/services/api';
import { DeploymentDraftService } from '../../shared/services/deployment-draft.service';
import { DeploymentPageComponent } from './deployment-page.component';

describe('DeploymentPageComponent', () => {
  let fixture!: ComponentFixture<DeploymentPageComponent>;
  let component!: DeploymentPageComponent;
  let router!: Router;
  let deploymentDraftService!: DeploymentDraftService;
  let paramMap$!: BehaviorSubject<ParamMap>;
  let queryParamMap$!: BehaviorSubject<ParamMap>;

  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [DeploymentPageComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap({})
            },
            get paramMap() {
              return paramMap$.asObservable();
            },
            get queryParamMap() {
              return queryParamMap$.asObservable();
            }
          }
        },
        {
          provide: SliceApiService,
          useValue: {
            getSlices: () => of([{ id: 'slice-1', status: 'running', coverage: ['group0_edge'] }])
          }
        },
        {
          provide: AmarisoftSliceApiService,
          useValue: {
            getSlices: () =>
              of([
                {
                  name: 'enterprise-video',
                  s_nssai: { sst: 1, sd: '010203' },
                  plmn: { mcc: '001', mnc: '01' },
                  dnn: 'internet',
                  status: 'planned'
                }
              ])
          }
        },
        {
          provide: KubernetesApiService,
          useValue: {
            getK8sClusters: () =>
              of([{ name: 'k8s-lab', namespace: 'default', k8s_version: '1.30' }])
          }
        }
      ]
    }).compileComponents();

    router = TestBed.inject(Router);
    deploymentDraftService = TestBed.inject(DeploymentDraftService);
  });

  function createComponentForOption(
    option: 'slice' | 'k8s' | 'proxmox-standalone' | 'amari' | null
  ): void {
    paramMap$ = new BehaviorSubject(convertToParamMap(option ? { option } : {}));
    queryParamMap$ = new BehaviorSubject(convertToParamMap({}));
    fixture = TestBed.createComponent(DeploymentPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function getTextContent(): string {
    return fixture.nativeElement.textContent.replace(/\s+/g, ' ').trim();
  }

  function getButtonByText(label: string): HTMLButtonElement {
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('button')
    ) as HTMLButtonElement[];
    const match = buttons.find((button) =>
      button.textContent?.replace(/\s+/g, ' ').trim() === label
    );

    if (!match) {
      throw new Error(`Button with label "${label}" not found.`);
    }

    return match;
  }

  function getButtonByAriaLabel(label: string): HTMLButtonElement {
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('button')
    ) as HTMLButtonElement[];
    const match = buttons.find((button) => button.getAttribute('aria-label') === label);

    if (!match) {
      throw new Error(`Button with aria-label "${label}" not found.`);
    }

    return match;
  }

  function getWizardButtons(): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.deployment-page__step')) as HTMLButtonElement[];
  }

  describe('Deployment chooser', () => {
    beforeEach(() => {
      createComponentForOption(null);
    });

    it('renders current resources and opens the deployment modal chooser', () => {
      expect(getTextContent()).toContain('Live targets');
      expect(getTextContent()).toContain('slice-1');
      expect(getTextContent()).toContain('k8s-lab');

      getButtonByText('+ New Deployment').click();
      fixture.detectChanges();

      expect(getTextContent()).toContain('Create New Network Slice');
      expect(getTextContent()).not.toContain('Slice / OpenStack');
      expect(getTextContent()).toContain('K8s Deploy');
      expect(getTextContent()).toContain('Proxmox');
      expect(getTextContent()).toContain('Amari');
    });

    it('collapses and expands an inventory table independently', () => {
      const firstToggle = getButtonByText('Collapse');

      expect(fixture.nativeElement.querySelectorAll('.deployment-page__table').length).toBe(3);

      firstToggle.click();
      fixture.detectChanges();

      expect(component['isInventorySectionExpanded']('slice')).toBe(false);
      expect(getButtonByText('Expand')).toBeTruthy();

      firstToggle.click();
      fixture.detectChanges();

      expect(component['isInventorySectionExpanded']('slice')).toBe(true);
    });
  });

  it('does not expose slice-time infrastructure registration', () => {
    createComponentForOption('slice');
    expect(component['deploymentOptions'].some((option) => option.id === 'slice')).toBe(false);
    expect(getTextContent()).not.toContain('Register NFVO');
    expect(getTextContent()).not.toContain('Register VIM');
  });

  describe('K8s wizard', () => {
    beforeEach(() => {
      createComponentForOption('k8s');
    });

    it('uses a sequential two-registration flow before deploy', async () => {
      expect(getWizardButtons()).toHaveLength(3);
      expect(getTextContent()).toContain('Upload Credentials');
      expect(getTextContent()).toContain('Credentials file');

      component['markRequirementDone']('k8s-credentials');
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component['currentStep']).toBe(2);
      expect(getTextContent()).toContain('Register K8s Cluster');

      component['markRequirementDone']('k8s-cluster');
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component['currentStep']).toBe(3);
      expect(fixture.debugElement.query(By.directive(K8sDeployServiceFormComponent))).not.toBeNull();
    });

    it('shows deployment feedback after the K8s deploy form emits success', async () => {
      component['markRequirementDone']('k8s-credentials');
      await fixture.whenStable();
      component['markRequirementDone']('k8s-cluster');
      await fixture.whenStable();
      fixture.detectChanges();

      const k8sForm = fixture.debugElement.query(By.directive(K8sDeployServiceFormComponent));
      (k8sForm.componentInstance as K8sDeployServiceFormComponent).deployed.emit({ status: 'done' });
      fixture.detectChanges();

      expect(component['deploymentStarted']).toBe(true);
      expect(getTextContent()).toContain('pack saved to History as a completed deployment');
    });
  });

  describe('Standalone Proxmox wizard', () => {
    beforeEach(() => {
      createComponentForOption('proxmox-standalone');
    });

    it('unlocks the compact overview after the standalone registration is active', async () => {
      expect(getWizardButtons()).toHaveLength(2);
      expect(component['canAccessStepTwo']()).toBe(false);

      component['markRequirementDone']('proxmox-standalone');
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component['canAccessStepTwo']()).toBe(true);
      expect(component['currentStep']).toBe(2);
      expect(getTextContent()).toContain('Step 2');
      expect(
        fixture.debugElement.query(By.directive(ProxmoxStandaloneRegistrationFormComponent))
      ).not.toBeNull();
    });
  });

  describe('Proxmox standalone wizard', () => {
    beforeEach(() => {
      createComponentForOption('proxmox-standalone');
    });

    it('lets Proxmox be selected again after returning to the chooser', () => {
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      getButtonByAriaLabel('Change deployment type').click();
      expect(navigateSpy).toHaveBeenCalledWith(['/deployment'], {
        replaceUrl: true,
        queryParams: { modal: 'chooser' }
      });
      fixture.detectChanges();

      expect(component['selectedRouteOptionId']).toBeNull();
      expect(component['isNewDeploymentModalOpen']).toBe(true);
      expect(component['isDeploymentChooserOpen']).toBe(true);
      expect(getTextContent()).toContain('Create New Network Slice');

      paramMap$.next(convertToParamMap({ option: 'proxmox-standalone' }));
      fixture.detectChanges();

      expect(component['isDeploymentChooserOpen']).toBe(true);
      expect(getTextContent()).toContain('Create New Network Slice');

      paramMap$.next(convertToParamMap({}));
      fixture.detectChanges();

      getButtonByText('Proxmox').click();
      paramMap$.next(convertToParamMap({ option: 'proxmox-standalone' }));
      fixture.detectChanges();

      expect(component['selectedRouteOptionId']).toBe('proxmox-standalone');
      expect(getTextContent()).toContain('Standalone API');
    });

    it('keeps the chooser open when an active Proxmox registration exists', () => {
      deploymentDraftService.saveFormValue(
        'proxmox-standalone',
        'proxmox-standalone',
        {
          url: 'https://proxmox.example:8006',
          clusterId: 'cluster-1',
          selectedDatacenter: { id: 'antares', name: 'antares' }
        },
        'active'
      );
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      getButtonByAriaLabel('Change deployment type').click();
      expect(navigateSpy).toHaveBeenCalledWith(['/deployment'], {
        replaceUrl: true,
        queryParams: { modal: 'chooser' }
      });

      queryParamMap$.next(convertToParamMap({ modal: 'chooser' }));
      paramMap$.next(convertToParamMap({}));
      fixture.detectChanges();

      expect(component['selectedRouteOptionId']).toBeNull();
      expect(component['isNewDeploymentModalOpen']).toBe(true);
      expect(component['isDeploymentChooserOpen']).toBe(true);
      expect(getTextContent()).toContain('Create New Network Slice');
      expect(getTextContent()).toContain('Proxmox');
      expect(getTextContent()).not.toContain('Deploy Proxmox');
    });

    it('shows a compact/detail toggle next to change type on the deploy step', async () => {
      component['markRequirementDone']('proxmox-standalone');
      await fixture.whenStable();
      fixture.detectChanges();

      expect(getButtonByAriaLabel('Compact view')).toBeTruthy();
      expect(getButtonByAriaLabel('Detail view')).toBeTruthy();
      expect(getButtonByAriaLabel('Change deployment type')).toBeTruthy();

      getButtonByAriaLabel('Detail view').click();
      fixture.detectChanges();

      expect(component['proxmoxServerViewMode']).toBe('detail');
      expect(getButtonByAriaLabel('Detail view').getAttribute('aria-pressed')).toBe('true');
    });

    it('passes the selected server view mode into the embedded standalone form', async () => {
      component['markRequirementDone']('proxmox-standalone');
      await fixture.whenStable();
      fixture.detectChanges();

      const proxmoxStandaloneForm = fixture.debugElement.query(
        By.directive(ProxmoxStandaloneRegistrationFormComponent)
      );
      expect(proxmoxStandaloneForm.componentInstance.serverViewMode()).toBe('compact');

      getButtonByAriaLabel('Detail view').click();
      fixture.detectChanges();

      expect(proxmoxStandaloneForm.componentInstance.serverViewMode()).toBe('detail');
    });

    it('returns to the registration step when the standalone registration is deregistered', async () => {
      deploymentDraftService.saveFormValue(
        'proxmox-standalone',
        'proxmox-standalone',
        {
          url: 'https://proxmox.example:8006',
          clusterId: 'cluster-1',
          selectedDatacenter: { id: 'antares', name: 'antares' }
        },
        'active'
      );
      component['markRequirementDone']('proxmox-standalone');
      await fixture.whenStable();
      fixture.detectChanges();

      component['handleRequirementDeregistered']('proxmox-standalone');
      await fixture.whenStable();
      fixture.detectChanges();

      expect(
        deploymentDraftService.getFormState('proxmox-standalone', 'proxmox-standalone')
      ).toBe('missing');
      expect(component['canAccessStepTwo']()).toBe(false);
      expect(component['currentStep']).toBe(1);
      expect(getTextContent()).toContain('Standalone API');
    });
  });
});
