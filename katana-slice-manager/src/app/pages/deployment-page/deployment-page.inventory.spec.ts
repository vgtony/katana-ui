import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { vi } from 'vitest';
import {
  AmarisoftSliceApiService,
  KubernetesApiService,
  SliceApiService
} from '../../shared/services/api';
import { DeploymentPageComponent } from './deployment-page.component';

describe('DeploymentPageComponent inventory refresh', () => {
  let fixture: ComponentFixture<DeploymentPageComponent>;
  let sliceInventory$: BehaviorSubject<unknown[]>;
  let amariInventory$: BehaviorSubject<unknown[]>;
  let deleteAmariSliceMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    sliceInventory$ = new BehaviorSubject<unknown[]>([
      { id: 'slice-1', status: 'running', coverage: ['group0_edge'] }
    ]);
    amariInventory$ = new BehaviorSubject<unknown[]>([
      {
        slice_id: 'amari-slice-1',
        name: 'enterprise-video',
        s_nssai: { sst: 1, sd: '010203' },
        plmn: { mcc: '001', mnc: '01' },
        dnn: 'internet',
        status: 'running'
      }
    ]);
    deleteAmariSliceMock = vi.fn(() => of({}));

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
          provide: AmarisoftSliceApiService,
          useValue: {
            getSlices: () => amariInventory$.asObservable(),
            deleteSlice: deleteAmariSliceMock
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

  it('reveals and confirms Amari slice deletion from the inventory row', () => {
    const row = Array.from<HTMLTableRowElement>(
      fixture.nativeElement.querySelectorAll('tbody tr')
    ).find((item) => item.textContent?.includes('enterprise-video') ?? false);

    if (!row) {
      throw new Error('Amari inventory row not found.');
    }

    row.click();
    fixture.detectChanges();

    const deleteButton = fixture.nativeElement.querySelector(
      'button[aria-label="Delete Amari slice enterprise-video"]'
    ) as HTMLButtonElement | null;

    if (!deleteButton) {
      throw new Error('Amari delete button not found.');
    }

    deleteButton.click();
    fixture.detectChanges();

    const confirmButton = Array.from<HTMLButtonElement>(
      fixture.nativeElement.querySelectorAll('.deployment-page__delete-confirm-danger')
    ).find((button) => button.textContent?.includes('Delete') ?? false);

    if (!confirmButton) {
      throw new Error('Amari delete confirmation button not found.');
    }

    amariInventory$.next([]);
    confirmButton.click();
    fixture.detectChanges();

    expect(deleteAmariSliceMock).toHaveBeenCalledWith('amari-slice-1');
    expect(getTextContent()).not.toContain('enterprise-video');
  });
});
