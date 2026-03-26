import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  FunctionRegistrationFormModel,
  initialFunctionRegistrationFormModel
} from './function-registration-form.model';

@Component({
  selector: 'app-function-registration-form',
  imports: [ReactiveFormsModule],
  templateUrl: './function-registration-form.component.html',
  styleUrl: './function-registration-form.component.scss'
})
export class FunctionRegistrationFormComponent {
  private readonly formBuilder = inject(FormBuilder);
  protected readonly model: FunctionRegistrationFormModel = initialFunctionRegistrationFormModel;

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
}
