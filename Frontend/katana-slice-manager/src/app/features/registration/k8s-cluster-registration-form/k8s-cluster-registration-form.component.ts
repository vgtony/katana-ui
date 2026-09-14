import { ChangeDetectorRef, Component, NgZone, OnInit, inject, output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { initialK8sClusterRegistrationFormModel } from '../../../models/k8s-cluster-registration-form.model';
import { K8sClusterRegistrationFormModel } from '../../../models/interfaces/k8s-cluster-registration-form.interface';
import { NfvoSummary, VimSummary } from '../../../models/interfaces/infrastructure.interface';
import {
  KubernetesApiService,
  NfvoApiService,
  VimApiService,
  getApiErrorMessage,
} from '../../../shared/services/api';
import { DeploymentDraftService } from '../../../shared/services/deployment-draft.service';

interface K8sCredentialsSnapshot {
  fileName: string;
}

@Component({
  selector: 'app-k8s-cluster-registration-form',
  imports: [ReactiveFormsModule],
  templateUrl: './k8s-cluster-registration-form.component.html',
  styleUrl: './k8s-cluster-registration-form.component.scss',
})
export class K8sClusterRegistrationFormComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly ngZone = inject(NgZone);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly kubernetesApi = inject(KubernetesApiService);
  private readonly nfvoApi = inject(NfvoApiService);
  private readonly vimApi = inject(VimApiService);
  private readonly deploymentDraftService = inject(DeploymentDraftService);
  readonly completed = output<void>();
  readonly failed = output<void>();
  private readonly credentialsSnapshot =
    this.deploymentDraftService.getSavedFormSnapshot<K8sCredentialsSnapshot>(
      'k8s',
      'k8s-credentials',
    );
  protected readonly model: K8sClusterRegistrationFormModel = {
    ...this.deploymentDraftService.getFormValue(
      'k8s',
      'k8s-cluster',
      initialK8sClusterRegistrationFormModel,
    ),
    credentials:
      this.credentialsSnapshot?.fileName ?? initialK8sClusterRegistrationFormModel.credentials,
  };
  protected readonly savedState = this.deploymentDraftService.getFormState('k8s', 'k8s-cluster');
  protected readonly restoreMessage =
    this.savedState === 'active'
      ? 'Active K8s cluster registration loaded. Update it only if you want to replace it.'
      : this.savedState === 'draft'
        ? 'Saved K8s cluster draft restored.'
        : '';
  protected submitting = false;
  protected loadingInventory = true;
  protected inventoryError = '';
  protected nfvos: NfvoSummary[] = [];
  protected vims: VimSummary[] = [];
  protected submitMessage = '';
  protected submitError = '';

  protected readonly form = this.formBuilder.group({
    schemaVersion: [this.model.schemaVersion, Validators.required],
    credentials: [this.model.credentials, Validators.required],
    schemaType: [this.model.schemaType, Validators.required],
    name: [this.model.name, Validators.required],
    description: [this.model.description, Validators.required],
    nfvoId: [this.model.nfvoId, Validators.required],
    vimAccount: [this.model.vimAccount, Validators.required],
    k8sVersion: [this.model.k8sVersion, Validators.required],
    k8sNet1: [this.model.k8sNet1],
    namespace: [this.model.namespace, Validators.required],
    jujuBundle: [this.model.jujuBundle],
    helmChartV3: [this.model.helmChartV3],
  });

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.deploymentDraftService.saveFormValue(
        'k8s',
        'k8s-cluster',
        this.form.getRawValue() as K8sClusterRegistrationFormModel,
        'draft',
      );
    });
  }

  ngOnInit(): void {
    this.nfvoApi.getNfvos().subscribe({
      next: (nfvos) => {
        this.nfvos = nfvos;
        if (!this.form.controls.nfvoId.value && nfvos.length === 1) {
          this.form.controls.nfvoId.setValue(nfvos[0].nfvo_id);
        }
        this.loadVims();
      },
      error: (error: unknown) => {
        this.loadingInventory = false;
        this.inventoryError = getApiErrorMessage(error, 'Unable to load registered NFVOs.');
        this.changeDetectorRef.markForCheck();
      },
    });
  }

  protected nfvoChanged(): void {
    this.form.controls.vimAccount.setValue('');
    this.loadVims();
  }

  private loadVims(): void {
    const nfvoId = this.form.controls.nfvoId.value?.trim();
    this.vims = [];
    this.inventoryError = '';
    if (!nfvoId) {
      this.loadingInventory = false;
      return;
    }

    this.loadingInventory = true;
    this.vimApi.getVims(nfvoId).subscribe({
      next: (vims) => {
        this.vims = vims;
        const selected = this.form.controls.vimAccount.value;
        if (!vims.some((vim) => vim.vim_id === selected)) {
          this.form.controls.vimAccount.setValue(vims.length === 1 ? vims[0].vim_id : '');
        }
        this.loadingInventory = false;
        this.changeDetectorRef.markForCheck();
      },
      error: (error: unknown) => {
        this.loadingInventory = false;
        this.inventoryError = getApiErrorMessage(error, 'Unable to load linked VIMs.');
        this.changeDetectorRef.markForCheck();
      },
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
          }),
        ),
      )
      .subscribe({
        next: (response) => {
          this.ngZone.run(() => {
            const value = this.form.getRawValue() as K8sClusterRegistrationFormModel;
            this.deploymentDraftService.saveFormValue(
              'k8s',
              'k8s-cluster',
              {
                ...value,
                nfvoId: response.nfvo_id ?? value.nfvoId,
                osmVimAccountId: response.vim_account ?? value.vimAccount,
              },
              'active',
            );
            this.submitMessage = response.id
              ? `${response.message}. Cluster id: ${response.id}.`
              : response.message;
            this.completed.emit();
          });
        },
        error: (error: unknown) => {
          this.ngZone.run(() => {
            this.submitError = getApiErrorMessage(error, 'Unable to register Kubernetes cluster.');
            this.failed.emit();
          });
        },
      });
  }
}
