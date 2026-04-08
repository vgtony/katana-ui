import { ChangeDetectorRef, Component, NgZone, inject, output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { initialLocationRegistrationFormModel } from '../../../models/location-registration-form.model';
import { LocationRegistrationFormModel } from '../../../models/interfaces/location-registration-form.interface';
import { LocationApiService, getApiErrorMessage } from '../../../shared/services/api';
import { DeploymentDraftService } from '../../../shared/services/deployment-draft.service';

@Component({
  selector: 'app-location-registration-form',
  imports: [ReactiveFormsModule],
  templateUrl: './location-registration-form.component.html',
  styleUrl: './location-registration-form.component.scss'
})
export class LocationRegistrationFormComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly ngZone = inject(NgZone);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly locationApi = inject(LocationApiService);
  private readonly deploymentDraftService = inject(DeploymentDraftService);
  readonly completed = output<void>();
  protected readonly model: LocationRegistrationFormModel = this.deploymentDraftService.getFormValue(
    'slice',
    'location',
    initialLocationRegistrationFormModel
  );
  protected readonly savedState = this.deploymentDraftService.getFormState('slice', 'location');
  protected readonly restoreMessage =
    this.savedState === 'active'
      ? 'Active location registration loaded. Update it only if you want to replace it.'
      : this.savedState === 'draft'
        ? 'Saved location draft restored.'
        : '';
  protected submitting = false;
  protected submitSucceeded = false;
  protected submitMessage = '';
  protected submitError = '';

  protected readonly form = this.formBuilder.group({
    id: [this.model.id, Validators.required],
    description: [this.model.description, Validators.required]
  });

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.deploymentDraftService.saveFormValue(
        'slice',
        'location',
        this.form.getRawValue() as LocationRegistrationFormModel,
        'draft'
      );
    });
  }

  protected submit(): void {
    this.submitSucceeded = false;
    this.submitMessage = '';
    this.submitError = '';

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting = true;

    this.locationApi
      .createLocation(this.form.getRawValue() as LocationRegistrationFormModel)
      .pipe(
        finalize(() =>
          this.ngZone.run(() => {
            this.submitting = false;
            this.changeDetectorRef.detectChanges();
          })
        )
      )
      .subscribe({
        next: (id) => {
          this.ngZone.run(() => {
            this.deploymentDraftService.saveFormValue(
              'slice',
              'location',
              this.form.getRawValue() as LocationRegistrationFormModel,
              'active'
            );
            this.submitSucceeded = true;
            this.submitMessage = `Location created successfully with id ${id}.`;
            this.completed.emit();
            this.changeDetectorRef.detectChanges();
          });
        },
        error: (error: unknown) => {
          this.ngZone.run(() => {
            this.submitSucceeded = false;
            this.submitError = getApiErrorMessage(error, 'Unable to create location.');
            this.changeDetectorRef.detectChanges();
          });
        }
      });
  }
}
