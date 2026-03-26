import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  initialLocationRegistrationFormModel,
  LocationRegistrationFormModel
} from './location-registration-form.model';

@Component({
  selector: 'app-location-registration-form',
  imports: [ReactiveFormsModule],
  templateUrl: './location-registration-form.component.html',
  styleUrl: './location-registration-form.component.scss'
})
export class LocationRegistrationFormComponent {
  private readonly formBuilder = inject(FormBuilder);
  protected readonly model: LocationRegistrationFormModel = initialLocationRegistrationFormModel;

  protected readonly form = this.formBuilder.group({
    id: [this.model.id, Validators.required],
    description: [this.model.description, Validators.required]
  });
}
