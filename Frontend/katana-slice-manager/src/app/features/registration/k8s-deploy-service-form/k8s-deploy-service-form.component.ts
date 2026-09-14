import { ChangeDetectorRef, Component, NgZone, OnInit, inject, output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize, forkJoin } from 'rxjs';
import { initialK8sDeployServiceFormModel } from '../../../models/k8s-deploy-service-form.model';
import { K8sDeployServiceFormModel } from '../../../models/interfaces/k8s-deploy-service-form.interface';
import { NsdSummary } from '../../../models/interfaces/infrastructure.interface';
import { DeploymentAttemptEvent } from '../proxmox-vm-creation-form/proxmox-vm-creation-form.component';
import {
  CatalogApiService,
  K8sClusterSummary,
  KubernetesApiService,
  getApiErrorMessage,
  getApiErrorType,
} from '../../../shared/services/api';
import { DeploymentDraftService } from '../../../shared/services/deployment-draft.service';

interface K8sClusterSnapshot {
  name?: string;
  nfvoId?: string;
  osmVimAccountId?: string;
}

@Component({
  selector: 'app-k8s-deploy-service-form',
  imports: [ReactiveFormsModule],
  templateUrl: './k8s-deploy-service-form.component.html',
  styleUrl: './k8s-deploy-service-form.component.scss',
})
export class K8sDeployServiceFormComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly ngZone = inject(NgZone);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly kubernetesApi = inject(KubernetesApiService);
  private readonly catalogApi = inject(CatalogApiService);
  private readonly deploymentDraftService = inject(DeploymentDraftService);
  readonly deployed = output<DeploymentAttemptEvent>();
  private readonly clusterSnapshot =
    this.deploymentDraftService.getSavedFormSnapshot<K8sClusterSnapshot>('k8s', 'k8s-cluster');
  private readonly savedModel = this.deploymentDraftService.getFormValue(
    'k8s',
    'k8s-deploy',
    initialK8sDeployServiceFormModel,
  );
  protected readonly model: K8sDeployServiceFormModel = {
    ...this.savedModel,
    nfvoId: this.savedModel.nfvoId || this.clusterSnapshot?.nfvoId || '',
    vimAccountId: this.savedModel.vimAccountId || this.clusterSnapshot?.osmVimAccountId || '',
  };
  protected readonly savedState = this.deploymentDraftService.getFormState('k8s', 'k8s-deploy');
  protected readonly restoreMessage =
    this.savedState === 'active'
      ? 'Active K8s deployment configuration loaded.'
      : this.savedState === 'draft'
        ? 'Saved K8s deployment draft restored.'
        : '';
  protected submitting = false;
  protected loadingInventory = true;
  protected inventoryError = '';
  protected nsds: NsdSummary[] = [];
  protected clusters: K8sClusterSummary[] = [];
  protected submitSucceeded = false;
  protected submitMessage = '';
  protected submitError = '';

  protected readonly form = this.formBuilder.group({
    nfvoId: [this.model.nfvoId, Validators.required],
    nsdId: [this.model.nsdId, Validators.required],
    nsName: [this.model.nsName, Validators.required],
    nsDescription: [this.model.nsDescription, Validators.required],
    vimAccountId: [this.model.vimAccountId, Validators.required],
  });

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.deploymentDraftService.saveFormValue(
        'k8s',
        'k8s-deploy',
        this.form.getRawValue(),
        'draft',
      );
    });
  }

  ngOnInit(): void {
    forkJoin({
      nsds: this.catalogApi.getNsList(),
      clusters: this.kubernetesApi.getK8sClusters(),
    }).subscribe({
      next: ({ nsds, clusters }) => {
        this.nsds = nsds.filter(
          (nsd) => String(nsd.deployment_runtime ?? '').toLowerCase() === 'kubernetes',
        );
        this.clusters = clusters;
        this.syncSelection();
        this.loadingInventory = false;
        this.changeDetectorRef.markForCheck();
      },
      error: (error: unknown) => {
        this.loadingInventory = false;
        this.inventoryError = getApiErrorMessage(
          error,
          'Unable to load registered Kubernetes deployment targets.',
        );
        this.changeDetectorRef.markForCheck();
      },
    });
  }

  protected nsdChanged(): void {
    const selected = this.selectedNsd();
    this.form.controls.nfvoId.setValue(String(selected?.nfvo_id ?? ''));
    this.form.controls.vimAccountId.setValue('');
    this.selectOnlyCluster();
  }

  protected catalogNsdId(nsd: NsdSummary): string {
    return String(nsd['nsd-id'] ?? nsd['nsd_id'] ?? '');
  }

  protected nsdLabel(nsd: NsdSummary): string {
    const id = this.catalogNsdId(nsd);
    const name = String(nsd['nsd-name'] ?? nsd['nsd_name'] ?? id);
    return `${name} · ${id}`;
  }

  protected availableClusters(): K8sClusterSummary[] {
    const nfvoId = this.form.controls.nfvoId.value;
    return this.clusters.filter((cluster) => !nfvoId || cluster.nfvo_id === nfvoId);
  }

  protected clusterLabel(cluster: K8sClusterSummary): string {
    return `${cluster.name} · ${cluster.namespace}`;
  }

  private syncSelection(): void {
    const selected = this.selectedNsd();
    if (selected) {
      this.form.controls.nfvoId.setValue(String(selected.nfvo_id ?? ''));
    } else if (this.nsds.length === 1) {
      this.form.controls.nsdId.setValue(this.catalogNsdId(this.nsds[0]));
      this.form.controls.nfvoId.setValue(String(this.nsds[0].nfvo_id ?? ''));
    }
    this.selectOnlyCluster();
  }

  private selectOnlyCluster(): void {
    const clusters = this.availableClusters();
    const selected = this.form.controls.vimAccountId.value;
    if (!clusters.some((cluster) => cluster.vim_account === selected)) {
      this.form.controls.vimAccountId.setValue(
        clusters.length === 1 ? clusters[0].vim_account : '',
      );
    }
  }

  private selectedNsd(): NsdSummary | null {
    const id = this.form.controls.nsdId.value;
    return this.nsds.find((nsd) => this.catalogNsdId(nsd) === id) ?? null;
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
          }),
        ),
      )
      .subscribe({
        next: (response) => {
          this.ngZone.run(() => {
            this.deploymentDraftService.saveFormValue(
              'k8s',
              'k8s-deploy',
              this.form.getRawValue(),
              'active',
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
              errorType: getApiErrorType(error) ?? 'Failed',
            });
          });
        },
      });
  }
}
