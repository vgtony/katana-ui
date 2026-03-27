import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, ParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { By } from '@angular/platform-browser';
import { DeploymentPageComponent } from './deployment-page.component';

describe('DeploymentPageComponent K8s flow', () => {
  let fixture: ComponentFixture<DeploymentPageComponent>;
  let component: DeploymentPageComponent;
  let paramMap$: BehaviorSubject<ParamMap>;

  beforeEach(async () => {
    paramMap$ = new BehaviorSubject(convertToParamMap({ option: 'k8s' }));

    await TestBed.configureTestingModule({
      imports: [DeploymentPageComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: paramMap$.asObservable()
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(DeploymentPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

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

    return match as HTMLButtonElement;
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

  it('loads the K8s deployment option from the route', () => {
    expect(component['selectedOption'].id).toBe('k8s');
    expect(getTextContent()).toContain('K8s registrations');
    expect(getTextContent()).not.toContain('K8s Deploy Pending');
  });

  it('keeps step 2 disabled until all K8s step 1 requirements are completed', () => {
    const stepTwoButton = getStepperButton(2);
    const primaryButton = getButtonByText('Configuration');

    expect(stepTwoButton.disabled).toBe(true);
    expect(primaryButton.disabled).toBe(true);

    getButtonByText('Mark as complete').click();
    fixture.detectChanges();

    expect(component['completedRequirementsCount']()).toBe(1);
    expect(getButtonByText('Configuration').disabled).toBe(true);

    toggleRequirementCard('K8s Cluster');
    getButtonByText('Mark as complete').click();
    fixture.detectChanges();

    expect(component['completedRequirementsCount']()).toBe(2);
    expect(getButtonByText('Configuration').disabled).toBe(false);
    expect(getStepperButton(2).disabled).toBe(false);
  });

  it('opens the K8s deploy configuration step once step 1 is completed', () => {
    getButtonByText('Mark as complete').click();
    fixture.detectChanges();

    toggleRequirementCard('K8s Cluster');
    getButtonByText('Mark as complete').click();
    fixture.detectChanges();

    getButtonByText('Configuration').click();
    fixture.detectChanges();

    expect(component['currentStep']).toBe(2);
    expect(getTextContent()).toContain('Deploy Configuration');
    expect(getTextContent()).toContain('Complete the K8s deployment form here');
    expect(fixture.debugElement.query(By.css('app-k8s-deploy-service-form'))).not.toBeNull();
  });

  it('shows the deployment started status after deploying from the K8s step 2 panel', () => {
    getButtonByText('Mark as complete').click();
    fixture.detectChanges();

    toggleRequirementCard('K8s Cluster');
    getButtonByText('Mark as complete').click();
    fixture.detectChanges();

    getStepperButton(2).click();
    fixture.detectChanges();

    getButtonByText('Deploy To K8s').click();
    fixture.detectChanges();

    expect(component['deploymentStarted']).toBe(true);
    expect(getTextContent()).toContain('Deployment flow started for K8s Deploy');
  });
});
