import { Component, NgZone, inject, output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { initialFunctionRegistrationFormModel } from '../../../models/function-registration-form.model';
import { FunctionRegistrationFormModel } from '../../../models/interfaces/function-registration-form.interface';
import { FunctionApiService, getApiErrorMessage } from '../../../shared/services/api';
import { DeploymentDraftService } from '../../../shared/services/deployment-draft.service';

@Component({
  selector: 'app-function-registration-form',
  imports: [ReactiveFormsModule],
  templateUrl: './function-registration-form.component.html',
  styleUrl: './function-registration-form.component.scss'
})
export class FunctionRegistrationFormComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly ngZone = inject(NgZone);
  private readonly functionApi = inject(FunctionApiService);
  private readonly deploymentDraftService = inject(DeploymentDraftService);
  readonly completed = output<void>();
  protected readonly model: FunctionRegistrationFormModel = this.deploymentDraftService.getFormValue(
    'slice',
    'function',
    initialFunctionRegistrationFormModel
  );
  protected readonly savedState = this.deploymentDraftService.getFormState('slice', 'function');
  protected readonly restoreMessage =
    this.savedState === 'active'
      ? 'Active function registration loaded. Update it only if you want to replace it.'
      : this.savedState === 'draft'
        ? 'Saved function draft restored.'
        : '';
  protected submitting = false;
  protected submitMessage = '';
  protected submitError = '';

  protected readonly form = this.formBuilder.group({
    id: [this.model.id, Validators.required],
    name: [this.model.name, Validators.required],
    gen: [this.model.gen, Validators.required],
    func: [this.model.func, Validators.required],
    sharedAvailability: [this.model.sharedAvailability],
    type: [this.model.type, Validators.required],
    location: [this.model.location, Validators.required],
    nsdId: [this.model.nsdId, Validators.required],
    nsName: [this.model.nsName, Validators.required],
    placement: [this.model.placement, Validators.required],
    optional: [this.model.optional]
  });

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.deploymentDraftService.saveFormValue(
        'slice',
        'function',
        this.form.getRawValue() as FunctionRegistrationFormModel,
        'draft'
      );
    });
  }

  protected submit(): void {
    this.submitMessage = '';
    this.submitError = '';

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting = true;

    this.functionApi
      .createFunction(this.form.getRawValue() as FunctionRegistrationFormModel)
      .pipe(
        finalize(() =>
          this.ngZone.run(() => {
            this.submitting = false;
          })
        )
      )
      .subscribe({
        next: (id) => {
          this.ngZone.run(() => {
            this.deploymentDraftService.saveFormValue(
              'slice',
              'function',
              this.form.getRawValue() as FunctionRegistrationFormModel,
              'active'
            );
            this.submitMessage = `Function created successfully with id ${id}.`;
            this.completed.emit();
          });
        },
        error: (error: unknown) => {
          this.ngZone.run(() => {
            this.submitError = getApiErrorMessage(error, 'Unable to create function.');
          });
        }
      });
  }
}
