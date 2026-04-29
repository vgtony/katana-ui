import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import {
  KubernetesApiService,
  SliceApiService
} from '../../shared/services/api';
import { DeploymentPageComponent } from './deployment-page.component';

describe('DeploymentPageComponent inventory refresh', () => {
  let fixture: ComponentFixture<DeploymentPageComponent>;
  let sliceInventory$: BehaviorSubject<unknown[]>;

  beforeEach(async () => {
    sliceInventory$ = new BehaviorSubject<unknown[]>([
      { id: 'slice-1', status: 'running', coverage: ['group0_edge'] }
    ]);

    await TestBed.configureTestingModule({
      imports: [DeploymentPageComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: new BehaviorSubject(convertToParamMap({})).asObservable(),
            queryParamMap: new BehaviorSubject(convertToParamMap({})).asObservable()
          }
        },
        {
          provide: SliceApiService,
          useValue: {
            getSlices: () => sliceInventory$.asObservable()
          }
        },
        {
          provide: KubernetesApiService,
          useValue: {
            getK8sClusters: () => new BehaviorSubject<unknown[]>([]).asObservable()
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(DeploymentPageComponent);
    fixture.detectChanges();
  });

  function getTextContent(): string {
    return fixture.nativeElement.textContent.replace(/\s+/g, ' ').trim();
  }

  it('updates the page after the slice GET response emits new data', () => {
    expect(getTextContent()).toContain('slice-1');

    sliceInventory$.next([
      { id: 'slice-2', status: 'active', coverage: ['group1_core'], location: 'Athens' }
    ]);
    fixture.detectChanges();

    expect(getTextContent()).toContain('slice-2');
    expect(getTextContent()).toContain('Athens');
    expect(getTextContent()).not.toContain('slice-1');
  });
});
