import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  initialNfvoRegistrationFormModel,
  NfvoRegistrationFormModel
} from './nfvo-registration-form.model';

@Component({
  selector: 'app-nfvo-registration-form',
  imports: [ReactiveFormsModule],
  templateUrl: './nfvo-registration-form.component.html',
  styleUrl: './nfvo-registration-form.component.scss'
})
export class NfvoRegistrationFormComponent {
  private readonly formBuilder = inject(FormBuilder);
  protected readonly model: NfvoRegistrationFormModel = initialNfvoRegistrationFormModel;

  protected readonly form = this.formBuilder.group({
    id: [this.model.id, Validators.required],
    name: [this.model.name, Validators.required],
    nfvoip: [this.model.nfvoip, Validators.required],
    nfvousername: [this.model.nfvousername, Validators.required],
    nfvopassword: [this.model.nfvopassword, Validators.required],
    tenantname: [this.model.tenantname, Validators.required],
    type: [this.model.type, Validators.required],
    version: [this.model.version],
    description: [this.model.description],
    configId: [this.model.configId, Validators.required],
    configNfvoUsername: [this.model.configNfvoUsername, Validators.required],
    configNfvoPassword: [this.model.configNfvoPassword, Validators.required],
    configNfvoIp: [this.model.configNfvoIp, Validators.required],
    configTenantName: [this.model.configTenantName, Validators.required]
  });
}
