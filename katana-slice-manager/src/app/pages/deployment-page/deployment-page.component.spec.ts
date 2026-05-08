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
  KubernetesApiService,
  SliceApiService
} from '../../shared/services/api';
import { DeploymentPageComponent } from './deployment-page.component';

describe('DeploymentPageComponent', () => {
  let fixture!: ComponentFixture<DeploymentPageComponent>;
  let component!: DeploymentPageComponent;
  let router!: Router;
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
          provide: KubernetesApiService,
          useValue: {
            getK8sClusters: () =>
              of([{ name: 'k8s-lab', namespace: 'default', k8s_version: '1.30' }])
          }
        }
      ]
    }).compileComponents();

    router = TestBed.inject(Router);
  });

  function createComponentForOption(
    option: 'slice' | 'k8s' | 'proxmox-standalone' | null
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
      expect(getTextContent()).toContain('Slice / OpenStack');
      expect(getTextContent()).toContain('K8s Deploy');
      expect(getTextContent()).toContain('Proxmox');
    });

    it('collapses and expands an inventory table independently', () => {
      const firstToggle = getButtonByText('Collapse');

      expect(fixture.nativeElement.querySelectorAll('.deployment-page__table').length).toBe(2);

      firstToggle.click();
      fixture.detectChanges();

      expect(component['isInventorySectionExpanded']('slice')).toBe(false);
      expect(getButtonByText('Expand')).toBeTruthy();

      firstToggle.click();
      fixture.detectChanges();

      expect(component['isInventorySectionExpanded']('slice')).toBe(true);
    });
  });

  describe('Slice/OpenStack wizard', () => {
    beforeEach(() => {
      createComponentForOption('slice');
    });

    it('clears the selected route before returning to the deployment chooser', () => {
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      getButtonByText('Change Type').click();
      expect(navigateSpy).toHaveBeenCalledWith(['/deployment']);

      paramMap$.next(convertToParamMap({}));
      fixture.detectChanges();

      expect(component['selectedRouteOptionId']).toBeNull();
      expect(component['isNewDeploymentModalOpen']).toBe(true);
      expect(getTextContent()).toContain('Create New Network Slice');
      expect(getTextContent()).toContain('Slice / OpenStack');
      expect(getTextContent()).toContain('K8s Deploy');
      expect(getTextContent()).toContain('Proxmox');
    });

    it('shows five sequential wizard steps in the expected order', () => {
      const wizardLabels = getWizardButtons().map((button) =>
        button.textContent?.replace(/\s+/g, ' ').trim()
      );

      expect(wizardLabels).toHaveLength(5);
      expect(wizardLabels[0]).toContain('NFVO');
      expect(wizardLabels[1]).toContain('Location');
      expect(wizardLabels[2]).toContain('Function');
      expect(wizardLabels[3]).toContain('VIM');
      expect(wizardLabels[4]).toContain('Deploy');
      expect(getTextContent()).toContain('Register NFVO');
      expect(getTextContent()).toContain('NFVO IP');
    });

    it('advances one form at a time and unlocks deploy after all registrations are active', async () => {
      component['markRequirementDone']('nfvo');
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component['currentStep']).toBe(2);
      expect(getTextContent()).toContain('Create Location');
      expect(getTextContent()).toContain('Description');

      component['markRequirementDone']('location');
      await fixture.whenStable();
      fixture.detectChanges();
      component['markRequirementDone']('function');
      await fixture.whenStable();
      fixture.detectChanges();
      component['markRequirementDone']('vim');
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component['canAccessStepTwo']()).toBe(true);
      expect(component['currentStep']).toBe(5);
      expect(getTextContent()).toContain('Deploy Configuration');
      expect(getButtonByText('Deploy Slice').disabled).toBe(true);
    });
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

      getButtonByText('Change Type').click();
      expect(navigateSpy).toHaveBeenCalledWith(['/deployment']);

      paramMap$.next(convertToParamMap({}));
      fixture.detectChanges();

      getButtonByText('Proxmox').click();
      paramMap$.next(convertToParamMap({ option: 'proxmox-standalone' }));
      fixture.detectChanges();

      expect(component['selectedRouteOptionId']).toBe('proxmox-standalone');
      expect(getTextContent()).toContain('Standalone API');
    });

    it('shows a compact/detail toggle next to change type on the deploy step', async () => {
      component['markRequirementDone']('proxmox-standalone');
      await fixture.whenStable();
      fixture.detectChanges();

      expect(getButtonByAriaLabel('Compact view')).toBeTruthy();
      expect(getButtonByAriaLabel('Detail view')).toBeTruthy();
      expect(getButtonByText('Change Type')).toBeTruthy();

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
      component['markRequirementDone']('proxmox-standalone');
      await fixture.whenStable();
      fixture.detectChanges();

      component['handleRequirementDeregistered']('proxmox-standalone');
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component['canAccessStepTwo']()).toBe(false);
      expect(component['currentStep']).toBe(1);
      expect(getTextContent()).toContain('Standalone API');
    });
  });
});
