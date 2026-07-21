import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { NEVER } from 'rxjs';
import { SliceApiService } from '../../shared/services/api';
import { SliceStatusPageComponent } from './slice-status-page.component';

describe('SliceStatusPageComponent', () => {
  it('refreshes the view and stops polling when the slice reaches Running', async () => {
    await TestBed.configureTestingModule({
      imports: [SliceStatusPageComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ sliceId: 'slice-123' }) } }
        },
        {
          provide: SliceApiService,
          useValue: { pollSlice: () => NEVER, getSliceDeploymentTime: () => NEVER }
        }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(SliceStatusPageComponent);
    const component = fixture.componentInstance as any;
    const markForCheck = vi.spyOn(component.changeDetectorRef, 'markForCheck');

    component.handlePollResult({ kind: 'success', value: { status: 'Running ' } });

    expect(component.status).toBe('Running');
    expect(component.currentStageIndex).toBe(4);
    expect(component.polling).toBe(false);
    expect(markForCheck).toHaveBeenCalled();
  });
});
