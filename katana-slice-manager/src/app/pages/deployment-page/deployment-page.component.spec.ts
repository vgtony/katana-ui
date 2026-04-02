import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, ParamMap } from '@angular/router';
import { By } from '@angular/platform-browser';
import { BehaviorSubject } from 'rxjs';
import { NfvoRegistrationFormComponent } from '../../features/registration/nfvo-registration-form/nfvo-registration-form.component';
import { ProxmoxVmCreationFormComponent } from '../../features/registration/proxmox-vm-creation-form/proxmox-vm-creation-form.component';
import { DeploymentPageComponent } from './deployment-page.component';

describe('DeploymentPageComponent', () => {
  let fixture!: ComponentFixture<DeploymentPageComponent>;
  let component!: DeploymentPageComponent;
  let paramMap$!: BehaviorSubject<ParamMap>;
  let queryParamMap$!: BehaviorSubject<ParamMap>;

  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [DeploymentPageComponent],
      providers: [
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
        }
      ]
    }).compileComponents();
  });

  function createComponentForOption(option: 'slice' | 'k8s' | 'proxmox'): void {
    paramMap$ = new BehaviorSubject(convertToParamMap({ option }));
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

  function getStepperButton(stepIndex: number): HTMLButtonElement {
    const stepButtons = fixture.nativeElement.querySelectorAll('.deployment-page__step');
    const match = stepButtons.item(stepIndex - 1) as HTMLButtonElement | null;

    if (!match) {
      throw new Error(`Stepper button ${stepIndex} not found.`);
    }

    return match;
  }

  function toggleRequirementCard(label: string): void {
    const toggles = fixture.debugElement.queryAll(By.css('.deployment-page__requirement-toggle'));
    const match = toggles.find((toggle) =>
      toggle.nativeElement.textContent?.replace(/\s+/g, ' ').includes(label)
    );

    if (!match) {
      throw new Error(`Requirement toggle for "${label}" not found.`);
    }

    match.nativeElement.click();
    fixture.detectChanges();
  }

  function markExpandedRequirementComplete(): void {
    getButtonByText('Mark as done').click();
    fixture.detectChanges();
  }

  function completeStepOne(requirementLabels: string[]): void {
    requirementLabels.forEach((label, index) => {
      if (index > 0) {
        toggleRequirementCard(label);
      }

      markExpandedRequirementComplete();
    });
  }

  describe('K8s flow', () => {
    beforeEach(() => {
      createComponentForOption('k8s');
    });

    it('loads the K8s deployment option from the route', () => {
      expect(component['selectedOption'].id).toBe('k8s');
      expect(getTextContent()).toContain('K8s registrations');
      expect(getTextContent()).not.toContain('Proxmox registrations');
    });

    it('keeps step 2 disabled until all K8s step 1 requirements are completed', () => {
      const stepTwoButton = getStepperButton(2);
      const primaryButton = getButtonByText('Configuration');

      expect(stepTwoButton.disabled).toBe(true);
      expect(primaryButton.disabled).toBe(true);

      markExpandedRequirementComplete();

      expect(component['completedRequirementsCount']()).toBe(1);
      expect(getButtonByText('Configuration').disabled).toBe(true);

      toggleRequirementCard('K8s Cluster');
      markExpandedRequirementComplete();

      expect(component['completedRequirementsCount']()).toBe(2);
      expect(getButtonByText('Configuration').disabled).toBe(false);
      expect(getStepperButton(2).disabled).toBe(false);
    });

    it('opens the K8s deploy configuration step once step 1 is completed', () => {
      completeStepOne(['K8s Credentials', 'K8s Cluster']);

      getButtonByText('Configuration').click();
      fixture.detectChanges();

      expect(component['currentStep']).toBe(2);
      expect(getTextContent()).toContain('Deploy Configuration');
      expect(getTextContent()).toContain('Complete the K8s deployment form here');
      expect(fixture.debugElement.query(By.css('app-k8s-deploy-service-form'))).not.toBeNull();
    });

    it('shows the deployment started status after deploying from the K8s step 2 panel', () => {
      completeStepOne(['K8s Credentials', 'K8s Cluster']);

      getStepperButton(2).click();
      fixture.detectChanges();

      getButtonByText('Deploy To K8s').click();
      fixture.detectChanges();

      expect(component['deploymentStarted']).toBe(true);
      expect(getTextContent()).toContain('pack saved to History as a completed deployment');
    });
  });

  describe('Slice/OpenStack flow', () => {
    beforeEach(() => {
      createComponentForOption('slice');
    });

    it('loads the Slice/OpenStack deployment option from the route', () => {
      expect(component['selectedOption'].id).toBe('slice');
      expect(getTextContent()).toContain('Slice registrations');
      expect(getTextContent()).not.toContain('K8s registrations');
    });

    it('keeps step 2 disabled until all Slice step 1 requirements are completed', () => {
      expect(getStepperButton(2).disabled).toBe(true);
      expect(getButtonByText('Configuration').disabled).toBe(true);

      completeStepOne(['NFVO', 'Function', 'VIM']);

      expect(component['completedRequirementsCount']()).toBe(3);
      expect(getStepperButton(2).disabled).toBe(true);
      expect(getButtonByText('Configuration').disabled).toBe(true);

      toggleRequirementCard('Location');
      markExpandedRequirementComplete();

      expect(component['completedRequirementsCount']()).toBe(4);
      expect(getStepperButton(2).disabled).toBe(false);
      expect(getButtonByText('Configuration').disabled).toBe(false);
    });

    it('marks a requirement as done after the embedded form emits success', () => {
      const nfvoForm = fixture.debugElement.query(By.directive(NfvoRegistrationFormComponent));

      (nfvoForm.componentInstance as NfvoRegistrationFormComponent).completed.emit();
      fixture.detectChanges();

      expect(component['isRequirementComplete']('nfvo')).toBe(true);
      expect(getTextContent()).toContain('Done');
    });

    it('opens the Slice deploy configuration step once registrations are completed', () => {
      completeStepOne(['NFVO', 'Function', 'VIM', 'Location']);

      getButtonByText('Configuration').click();
      fixture.detectChanges();

      expect(component['currentStep']).toBe(2);
      expect(getTextContent()).toContain('Deploy Configuration');
      expect(getTextContent()).toContain('Complete the slice registration form here');
      expect(fixture.debugElement.query(By.css('app-slice-registration-form'))).not.toBeNull();
      expect(getButtonByText('Deploy Slice').disabled).toBe(true);
    });

    it('enables Deploy Slice only after the slice configuration is marked complete', () => {
      completeStepOne(['NFVO', 'Function', 'VIM', 'Location']);

      getStepperButton(2).click();
      fixture.detectChanges();

      const deployButton = getButtonByText('Deploy Slice');
      expect(deployButton.disabled).toBe(true);

      getButtonByText('Mark as complete').click();
      fixture.detectChanges();

      expect(getButtonByText('Deploy Slice').disabled).toBe(false);

      getButtonByText('Deploy Slice').click();
      fixture.detectChanges();

      expect(component['sliceConfigurationComplete']).toBe(true);
      expect(component['deploymentStarted']).toBe(true);
      expect(getTextContent()).toContain('pack saved to History as a completed deployment');
    });
  });

  describe('Proxmox VM flow', () => {
    beforeEach(() => {
      createComponentForOption('proxmox');
    });

    it('loads the Proxmox deployment option from the route', () => {
      expect(component['selectedOption'].id).toBe('proxmox');
      expect(getTextContent()).toContain('Proxmox registrations');
      expect(getTextContent()).not.toContain('Slice registrations');
    });

    it('enables step 2 after the Proxmox cluster requirement is completed', () => {
      expect(getStepperButton(2).disabled).toBe(true);
      expect(getButtonByText('Configuration').disabled).toBe(true);

      markExpandedRequirementComplete();

      expect(component['completedRequirementsCount']()).toBe(1);
      expect(getStepperButton(2).disabled).toBe(false);
      expect(getButtonByText('Configuration').disabled).toBe(false);
    });

    it('opens the Proxmox VM configuration step once step 1 is completed', () => {
      completeStepOne(['Proxmox Cluster']);

      getButtonByText('Configuration').click();
      fixture.detectChanges();

      expect(component['currentStep']).toBe(2);
      expect(getTextContent()).toContain('Complete the Proxmox VM deployment form here');
      expect(fixture.debugElement.query(By.css('app-proxmox-vm-creation-form'))).not.toBeNull();
    });

    it('shows the deployment started status after deploying from the Proxmox step 2 panel', () => {
      completeStepOne(['Proxmox Cluster']);

      getStepperButton(2).click();
      fixture.detectChanges();

      const proxmoxVmForm = fixture.debugElement.query(By.css('app-proxmox-vm-creation-form'))
        .componentInstance as ProxmoxVmCreationFormComponent;
      proxmoxVmForm.deployed.emit({ status: 'done' });
      fixture.detectChanges();

      expect(component['deploymentStarted']).toBe(true);
      expect(getTextContent()).toContain('pack saved to History as a completed deployment');
    });

    it('saves failed Proxmox deployments to history and shows the failure state', () => {
      completeStepOne(['Proxmox Cluster']);

      getStepperButton(2).click();
      fixture.detectChanges();

      const proxmoxVmForm = fixture.debugElement.query(By.css('app-proxmox-vm-creation-form'))
        .componentInstance as ProxmoxVmCreationFormComponent;
      proxmoxVmForm.deployed.emit({ status: 'failed', errorType: 'Internal Server Error' });
      fixture.detectChanges();

      expect(component['deploymentStarted']).toBe(true);
      expect(component['lastDeploymentStatus']).toBe('failed');
      expect(getTextContent()).toContain('pack saved to History with a failed deployment');
    });
  });
});
