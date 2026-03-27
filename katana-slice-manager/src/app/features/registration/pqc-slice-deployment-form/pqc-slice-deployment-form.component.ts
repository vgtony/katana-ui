import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { initialPqcSliceDeploymentFormModel } from './pqc-slice-deployment-form.model';
import { PqcSliceDeploymentFormModel } from '../../../models/interfaces/pqc-slice-deployment-form.interface';

@Component({
  selector: 'app-pqc-slice-deployment-form',
  imports: [ReactiveFormsModule],
  templateUrl: './pqc-slice-deployment-form.component.html',
  styleUrl: './pqc-slice-deployment-form.component.scss'
})
export class PqcSliceDeploymentFormComponent {
  private readonly formBuilder = inject(FormBuilder);
  protected readonly model: PqcSliceDeploymentFormModel = initialPqcSliceDeploymentFormModel;

  protected readonly form = this.formBuilder.group({
    sliceFile: [this.model.sliceFile, Validators.required],
    proxmoxFile: [this.model.proxmoxFile, Validators.required],
    enablePqc: [this.model.enablePqc],
    enableProxmox: [this.model.enableProxmox],
    ansibleControllerIp: [this.model.ansibleControllerIp, Validators.required]
  });
}
