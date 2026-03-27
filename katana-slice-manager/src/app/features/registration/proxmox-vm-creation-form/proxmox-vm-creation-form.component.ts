import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { initialProxmoxVmCreationFormModel } from '../../../models/proxmox-vm-creation-form.model';
import { ProxmoxVmCreationFormModel } from '../../../models/interfaces/proxmox-vm-creation-form.interface';

@Component({
  selector: 'app-proxmox-vm-creation-form',
  imports: [ReactiveFormsModule],
  templateUrl: './proxmox-vm-creation-form.component.html',
  styleUrl: './proxmox-vm-creation-form.component.scss'
})
export class ProxmoxVmCreationFormComponent {
  private readonly formBuilder = inject(FormBuilder);
  protected readonly model: ProxmoxVmCreationFormModel = initialProxmoxVmCreationFormModel;

  protected readonly form = this.formBuilder.group({
    clusterName: [this.model.clusterName, Validators.required],
    vmName: [this.model.vmName, Validators.required],
    template: [this.model.template, Validators.required],
    cpu: [this.model.cpu, Validators.required],
    ram: [this.model.ram, Validators.required],
    storageType: [this.model.storageType, Validators.required],
    diskSize: [this.model.diskSize, Validators.required],
    managementBridgeName: [this.model.managementBridgeName, Validators.required],
    managementBridgeType: [this.model.managementBridgeType, Validators.required],
    customBridgeName: [this.model.customBridgeName, Validators.required],
    customBridgeType: [this.model.customBridgeType, Validators.required],
    customIp: [this.model.customIp],
    customNetmask: [this.model.customNetmask],
    customGateway: [this.model.customGateway]
  });
}
