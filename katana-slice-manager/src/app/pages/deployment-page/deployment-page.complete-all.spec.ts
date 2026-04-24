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
import { DeploymentPageComponent } from './deployment-page.component';

describe('DeploymentPageComponent mark everything done', () => {
  let fixture: ComponentFixture<DeploymentPageComponent>;
  let component: DeploymentPageComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DeploymentPageComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: new BehaviorSubject(convertToParamMap({ option: 'slice' })).asObservable(),
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

    fixture = TestBed.createComponent(DeploymentPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

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

  it('moves the slice flow to the deploy step and enables deploy', () => {
    getButtonByText('Mark Everything as Done').click();
    fixture.detectChanges();

    expect(component['canAccessStepTwo']()).toBe(true);
    expect(component['currentStep']).toBe(5);
    expect(component['isSliceConfigurationComplete']()).toBe(true);
    expect(getButtonByText('Deploy Slice').disabled).toBe(false);
  });
});
