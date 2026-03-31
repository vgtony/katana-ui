import { Component, NgZone, inject, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { initialFunctionRegistrationFormModel } from '../../../models/function-registration-form.model';
import { FunctionRegistrationFormModel } from '../../../models/interfaces/function-registration-form.interface';
import { FunctionApiService, getApiErrorMessage } from '../../../shared/services/api';

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
  readonly completed = output<void>();
  protected readonly model: FunctionRegistrationFormModel = initialFunctionRegistrationFormModel;
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
