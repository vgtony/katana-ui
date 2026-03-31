import { Component, NgZone, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { initialSliceRegistrationFormModel } from '../../../models/slice-registration-form.model';
import { SliceRegistrationFormModel } from '../../../models/interfaces/slice-registration-form.interface';
import { CreateSliceRequest, SliceApiService, getApiErrorMessage } from '../../../shared/services/api';

@Component({
  selector: 'app-slice-registration-form',
  imports: [ReactiveFormsModule],
  templateUrl: './slice-registration-form.component.html',
  styleUrl: './slice-registration-form.component.scss'
})
export class SliceRegistrationFormComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly ngZone = inject(NgZone);
  private readonly sliceApi = inject(SliceApiService);
  protected readonly model: SliceRegistrationFormModel = initialSliceRegistrationFormModel;
  protected submitting = false;
  protected submitMessage = '';
  protected submitError = '';

  protected readonly form = this.formBuilder.group({
    baseSliceDesId: [this.model.baseSliceDesId, Validators.required],
    coverage: [this.model.coverage, Validators.required],
    delayTolerance: [this.model.delayTolerance],
    networkDlGuaranteed: [this.model.networkDlGuaranteed, Validators.required],
    ueDlGuaranteed: [this.model.ueDlGuaranteed, Validators.required],
    networkUlGuaranteed: [this.model.networkUlGuaranteed, Validators.required],
    ueUlGuaranteed: [this.model.ueUlGuaranteed, Validators.required],
    mtu: [this.model.mtu, Validators.required],
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

    const payload: CreateSliceRequest = {
      gst: this.form.getRawValue() as SliceRegistrationFormModel
    };

    this.submitting = true;

    this.sliceApi
      .createSlice(payload)
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
            this.submitMessage = `Slice created successfully with id ${id}.`;
          });
        },
        error: (error: unknown) => {
          this.ngZone.run(() => {
            this.submitError = getApiErrorMessage(error, 'Unable to create slice.');
          });
        }
      });
  }
}
