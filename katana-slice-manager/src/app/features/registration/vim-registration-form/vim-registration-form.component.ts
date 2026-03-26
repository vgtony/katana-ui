import { Component, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import {
  initialVimRegistrationFormModel,
  VimRegistrationFormModel
} from './vim-registration-form.model';

@Component({
  selector: 'app-vim-registration-form',
  imports: [ReactiveFormsModule],
  templateUrl: './vim-registration-form.component.html',
  styleUrl: './vim-registration-form.component.scss'
})
export class VimRegistrationFormComponent {
  private readonly formBuilder = inject(FormBuilder);
  protected readonly model: VimRegistrationFormModel = initialVimRegistrationFormModel;

  protected readonly form = this.formBuilder.group({
    id: [this.model.id, Validators.required],
    name: [this.model.name, Validators.required],
    authUrl: [this.model.authUrl, Validators.required],
    username: [this.model.username, Validators.required],
    password: [this.model.password, Validators.required],
    adminProjectName: [this.model.adminProjectName, Validators.required],
    location: [this.model.location, Validators.required],
    type: [this.model.type, Validators.required],
    version: [this.model.version, Validators.required],
    description: [this.model.description],
    infrastructureMonitoring: [this.model.infrastructureMonitoring],
    securityGroups: [this.model.securityGroups]
  });
}
