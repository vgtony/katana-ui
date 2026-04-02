import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { initialK8sDeployServiceFormModel } from '../../../models/k8s-deploy-service-form.model';
import { K8sDeployServiceFormModel } from '../../../models/interfaces/k8s-deploy-service-form.interface';
import { DeploymentDraftService } from '../../../shared/services/deployment-draft.service';

@Component({
  selector: 'app-k8s-deploy-service-form',
  imports: [ReactiveFormsModule],
  templateUrl: './k8s-deploy-service-form.component.html',
  styleUrl: './k8s-deploy-service-form.component.scss'
})
export class K8sDeployServiceFormComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly deploymentDraftService = inject(DeploymentDraftService);
  protected readonly model: K8sDeployServiceFormModel = this.deploymentDraftService.getFormValue(
    'k8s',
    'k8s-deploy',
    initialK8sDeployServiceFormModel
  );

  protected readonly form = this.formBuilder.group({
    nfvoId: [this.model.nfvoId, Validators.required],
    nsdId: [this.model.nsdId, Validators.required],
    nsName: [this.model.nsName, Validators.required],
    nsDescription: [this.model.nsDescription, Validators.required],
    vimAccountId: [this.model.vimAccountId, Validators.required]
  });

  constructor() {
    this.deploymentDraftService.saveFormValue('k8s', 'k8s-deploy', this.form.getRawValue());

    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.deploymentDraftService.saveFormValue('k8s', 'k8s-deploy', this.form.getRawValue());
    });
  }
}
