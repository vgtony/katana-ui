import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { initialSliceRegistrationFormModel } from './slice-registration-form.model';
import { SliceRegistrationFormModel } from '../../../models/interfaces/slice-registration-form.interface';

@Component({
  selector: 'app-slice-registration-form',
  imports: [ReactiveFormsModule],
  templateUrl: './slice-registration-form.component.html',
  styleUrl: './slice-registration-form.component.scss'
})
export class SliceRegistrationFormComponent {
  private readonly formBuilder = inject(FormBuilder);
  protected readonly model: SliceRegistrationFormModel = initialSliceRegistrationFormModel;

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
}
