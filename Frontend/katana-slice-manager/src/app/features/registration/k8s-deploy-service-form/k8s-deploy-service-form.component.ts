import { Component, NgZone, inject, output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { initialK8sDeployServiceFormModel } from '../../../models/k8s-deploy-service-form.model';
import { K8sDeployServiceFormModel } from '../../../models/interfaces/k8s-deploy-service-form.interface';
import { DeploymentAttemptEvent } from '../proxmox-vm-creation-form/proxmox-vm-creation-form.component';
import { KubernetesApiService, getApiErrorMessage, getApiErrorType } from '../../../shared/services/api';
import { DeploymentDraftService } from '../../../shared/services/deployment-draft.service';

@Component({
  selector: 'app-k8s-deploy-service-form',
  imports: [ReactiveFormsModule],
  templateUrl: './k8s-deploy-service-form.component.html',
  styleUrl: './k8s-deploy-service-form.component.scss'
})
export class K8sDeployServiceFormComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly ngZone = inject(NgZone);
  private readonly kubernetesApi = inject(KubernetesApiService);
  private readonly deploymentDraftService = inject(DeploymentDraftService);
  readonly deployed = output<DeploymentAttemptEvent>();
  protected readonly model: K8sDeployServiceFormModel = this.deploymentDraftService.getFormValue(
    'k8s',
    'k8s-deploy',
    initialK8sDeployServiceFormModel
  );
  protected readonly savedState = this.deploymentDraftService.getFormState('k8s', 'k8s-deploy');
  protected readonly restoreMessage =
    this.savedState === 'active'
      ? 'Active K8s deployment configuration loaded.'
      : this.savedState === 'draft'
        ? 'Saved K8s deployment draft restored.'
        : '';
  protected submitting = false;
  protected submitSucceeded = false;
  protected submitMessage = '';
  protected submitError = '';

  protected readonly form = this.formBuilder.group({
    nfvoId: [this.model.nfvoId, Validators.required],
    nsdId: [this.model.nsdId, Validators.required],
    nsName: [this.model.nsName, Validators.required],
    nsDescription: [this.model.nsDescription, Validators.required],
    vimAccountId: [this.model.vimAccountId, Validators.required]
  });

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.deploymentDraftService.saveFormValue('k8s', 'k8s-deploy', this.form.getRawValue(), 'draft');
    });
  }

  protected submit(): void {
    this.submitSucceeded = false;
    this.submitMessage = '';
    this.submitError = '';

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting = true;

    this.kubernetesApi
      .deployK8sService(this.form.getRawValue() as K8sDeployServiceFormModel)
      .pipe(
        finalize(() =>
          this.ngZone.run(() => {
            this.submitting = false;
          })
        )
      )
      .subscribe({
        next: (response) => {
          this.ngZone.run(() => {
            this.deploymentDraftService.saveFormValue(
              'k8s',
              'k8s-deploy',
              this.form.getRawValue(),
              'active'
            );
            this.submitSucceeded = true;
            this.submitMessage = response.message || 'Deployment request sent successfully.';
            this.deployed.emit({ status: 'done' });
          });
        },
        error: (error: unknown) => {
          this.ngZone.run(() => {
            this.submitSucceeded = false;
            this.submitError = getApiErrorMessage(error, 'Unable to deploy to Kubernetes.');
            this.deployed.emit({
              status: 'failed',
              errorType: getApiErrorType(error) ?? 'Failed'
            });
          });
        }
      });
  }
}
