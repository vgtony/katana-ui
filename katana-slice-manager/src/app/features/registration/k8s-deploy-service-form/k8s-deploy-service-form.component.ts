import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { initialK8sDeployServiceFormModel } from '../../../models/k8s-deploy-service-form.model';
import { K8sDeployServiceFormModel } from '../../../models/interfaces/k8s-deploy-service-form.interface';

@Component({
  selector: 'app-k8s-deploy-service-form',
  imports: [ReactiveFormsModule],
  templateUrl: './k8s-deploy-service-form.component.html',
  styleUrl: './k8s-deploy-service-form.component.scss'
})
export class K8sDeployServiceFormComponent {
  private readonly formBuilder = inject(FormBuilder);
  protected readonly model: K8sDeployServiceFormModel = initialK8sDeployServiceFormModel;

  protected readonly form = this.formBuilder.group({
    nfvoId: [this.model.nfvoId, Validators.required],
    nsdId: [this.model.nsdId, Validators.required],
    nsName: [this.model.nsName, Validators.required],
    nsDescription: [this.model.nsDescription, Validators.required],
    vimAccountId: [this.model.vimAccountId, Validators.required]
  });
}
