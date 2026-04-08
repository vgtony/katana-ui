import { Component, NgZone, inject, output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { initialK8sClusterRegistrationFormModel } from '../../../models/k8s-cluster-registration-form.model';
import { K8sClusterRegistrationFormModel } from '../../../models/interfaces/k8s-cluster-registration-form.interface';
import { KubernetesApiService, getApiErrorMessage } from '../../../shared/services/api';
import { DeploymentDraftService } from '../../../shared/services/deployment-draft.service';

@Component({
  selector: 'app-k8s-cluster-registration-form',
  imports: [ReactiveFormsModule],
  templateUrl: './k8s-cluster-registration-form.component.html',
  styleUrl: './k8s-cluster-registration-form.component.scss'
})
export class K8sClusterRegistrationFormComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly ngZone = inject(NgZone);
  private readonly kubernetesApi = inject(KubernetesApiService);
  private readonly deploymentDraftService = inject(DeploymentDraftService);
  readonly completed = output<void>();
  protected readonly model: K8sClusterRegistrationFormModel = this.deploymentDraftService.getFormValue(
    'k8s',
    'k8s-cluster',
    initialK8sClusterRegistrationFormModel
  );
  protected readonly savedState = this.deploymentDraftService.getFormState('k8s', 'k8s-cluster');
  protected readonly restoreMessage =
    this.savedState === 'active'
      ? 'Active K8s cluster registration loaded. Update it only if you want to replace it.'
      : this.savedState === 'draft'
        ? 'Saved K8s cluster draft restored.'
        : '';
  protected submitting = false;
  protected submitMessage = '';
  protected submitError = '';

  protected readonly form = this.formBuilder.group({
    schemaVersion: [this.model.schemaVersion, Validators.required],
    credentials: [this.model.credentials, Validators.required],
    schemaType: [this.model.schemaType, Validators.required],
    name: [this.model.name, Validators.required],
    description: [this.model.description, Validators.required],
    vimAccount: [this.model.vimAccount, Validators.required],
    nfvoIp: [this.model.nfvoIp, Validators.required],
    nfvoUsername: [this.model.nfvoUsername, Validators.required],
    nfvoPassword: [this.model.nfvoPassword, Validators.required],
    k8sVersion: [this.model.k8sVersion, Validators.required],
    k8sNet1: [this.model.k8sNet1],
    namespace: [this.model.namespace, Validators.required],
    jujuBundle: [this.model.jujuBundle],
    helmChartV3: [this.model.helmChartV3]
  });

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.deploymentDraftService.saveFormValue(
        'k8s',
        'k8s-cluster',
        this.form.getRawValue() as K8sClusterRegistrationFormModel,
        'draft'
      );
    });
  }

  protected submit(): void {
    this.submitMessage = '';
    this.submitError = '';

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting = true;

    this.kubernetesApi
      .registerK8sCluster(this.form.getRawValue() as K8sClusterRegistrationFormModel)
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
              'k8s-cluster',
              this.form.getRawValue() as K8sClusterRegistrationFormModel,
              'active'
            );
            this.submitMessage = response.id
              ? `${response.message}. Cluster id: ${response.id}.`
              : response.message;
            this.completed.emit();
          });
        },
        error: (error: unknown) => {
          this.ngZone.run(() => {
            this.submitError = getApiErrorMessage(
              error,
              'Unable to register Kubernetes cluster.'
            );
          });
        }
      });
  }
}
