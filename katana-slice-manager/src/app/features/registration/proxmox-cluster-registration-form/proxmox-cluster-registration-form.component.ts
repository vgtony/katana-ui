import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  initialProxmoxClusterRegistrationFormModel,
  ProxmoxClusterRegistrationFormModel
} from './proxmox-cluster-registration-form.model';

@Component({
  selector: 'app-proxmox-cluster-registration-form',
  imports: [ReactiveFormsModule],
  templateUrl: './proxmox-cluster-registration-form.component.html',
  styleUrl: './proxmox-cluster-registration-form.component.scss'
})
export class ProxmoxClusterRegistrationFormComponent {
  private readonly formBuilder = inject(FormBuilder);
  protected readonly model: ProxmoxClusterRegistrationFormModel = initialProxmoxClusterRegistrationFormModel;

  protected readonly form = this.formBuilder.group({
    name: [this.model.name, Validators.required],
    url: [this.model.url, Validators.required],
    username: [this.model.username, Validators.required],
    password: [this.model.password, Validators.required],
    node: [this.model.node, Validators.required]
  });
}
