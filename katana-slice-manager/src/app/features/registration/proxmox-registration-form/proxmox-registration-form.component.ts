import { Component, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { initialProxmoxRegistrationFormModel } from '../../../models/proxmox-registration-form.model';
import { ProxmoxRegistrationFormModel } from '../../../models/interfaces/proxmox-registration-form.interface';

@Component({
  selector: 'app-proxmox-registration-form',
  imports: [ReactiveFormsModule],
  templateUrl: './proxmox-registration-form.component.html',
  styleUrl: './proxmox-registration-form.component.scss'
})
export class ProxmoxRegistrationFormComponent {
  private readonly formBuilder = inject(FormBuilder);
  protected readonly model: ProxmoxRegistrationFormModel = initialProxmoxRegistrationFormModel;

  protected readonly form = this.formBuilder.group({
    clusterName: [this.model.clusterName, Validators.required],
    nodeEndpoint: [this.model.nodeEndpoint, Validators.required],
    tokenId: [this.model.tokenId, Validators.required],
    secret: [this.model.secret, Validators.required],
    resourcePool: [this.model.resourcePool, Validators.required]
  });
}
