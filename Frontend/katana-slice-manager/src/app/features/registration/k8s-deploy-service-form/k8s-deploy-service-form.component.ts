import { FORM_FEEDBACK_IMPORTS } from '../../../shared/forms/form-feedback';
import { ChangeDetectorRef, Component, DestroyRef, NgZone, OnInit, inject, output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize, forkJoin } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { K8sOperation } from '../../../models/interfaces/k8s-operation.interface';
import {
  NestRecord,
  firstString,
  isNestRecord,
  parseStructuredFile,
} from '../../../shared/nest-file.utils';
import { initialK8sDeployServiceFormModel } from '../../../models/k8s-deploy-service-form.model';
import { K8sDeployServiceFormModel } from '../../../models/interfaces/k8s-deploy-service-form.interface';
import { NsdSummary } from '../../../models/interfaces/infrastructure.interface';
import { DeploymentAttemptEvent } from '../proxmox-vm-creation-form/proxmox-vm-creation-form.component';
import {
  CatalogApiService,
  K8sClusterSummary,
  KubernetesApiService,
  LocationApiService,
  OsmVimAccountSummary,
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
  imports: [...FORM_FEEDBACK_IMPORTS, ReactiveFormsModule, RouterLink],
  templateUrl: './k8s-deploy-service-form.component.html',
  styleUrl: './k8s-deploy-service-form.component.scss',
})
export class K8sDeployServiceFormComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);
  private readonly ngZone = inject(NgZone);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly kubernetesApi = inject(KubernetesApiService);
  private readonly catalogApi = inject(CatalogApiService);
  private readonly locationApi = inject(LocationApiService);
  protected locations: NestRecord[] = [];
  protected nest: NestRecord | null = null;
  protected nestService: NestRecord | null = null;
  protected nestFileName = '';
  protected nestError = '';
  private inventoryLoaded = false;
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
  protected requestId = this.savedModel.requestId ?? '';
  protected operationLocked = !!this.requestId;
  protected operation: K8sOperation | null = null;
  protected submitting = false;
  protected loadingInventory = true;
  protected inventoryError = '';
  protected nsds: NsdSummary[] = [];
  protected clusters: K8sClusterSummary[] = [];
  protected vims: OsmVimAccountSummary[] = [];
  private vimRequestId = 0;
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
        { ...this.form.getRawValue(), nestRequired: !!this.nestFileName, requestId: this.requestId },
        'draft',
      );
    });
  }

  ngOnInit(): void {
    if (this.requestId) {
      this.form.disable({ emitEvent: false });
      this.checkOperation();
    }
    if (this.savedModel.nestRequired)
      this.nestError =
        'Re-upload the NEST for this saved deployment, or remove NEST configuration to deploy chart defaults.';
    forkJoin({
      nsds: this.catalogApi.getNsList(),
      clusters: this.kubernetesApi.getK8sClusters(),
      locations: this.locationApi.getLocations(),
    }).subscribe({
      next: ({ nsds, clusters, locations }) => {
        this.nsds = nsds.filter(
          (nsd) => String(nsd.deployment_runtime ?? '').toLowerCase() === 'kubernetes',
        );
        this.clusters = clusters;
        this.locations = locations.filter(isNestRecord);
        this.inventoryLoaded = true;
        this.syncSelection();
        this.loadOsmVims();
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

  protected async onNestSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.nest = null;
    this.nestService = null;
    this.nestError = 'Reading NEST file…';
    this.nestFileName = file.name;
    try {
      const nest = parseStructuredFile(await file.text());
      const descriptor = nest['service_descriptor'];
      const services = isNestRecord(descriptor) ? descriptor['ns_list'] : null;
      if (!Array.isArray(services) || services.length !== 1 || !isNestRecord(services[0])) {
        throw new Error(
          'This deployment requires exactly one service in service_descriptor.ns_list.',
        );
      }
      const service = services[0];
      const config = service['helm_configuration'];
      if (
        !isNestRecord(config) ||
        config['profile'] !== 'free5gc-sd-v1' ||
        typeof config['sd'] !== 'string' ||
        !/^[0-9a-fA-F]{6}$/.test(config['sd']) ||
        config['sd'].toLowerCase() === 'ffffff'
      ) {
        throw new Error(
          'NEST requires the free5gc-sd-v1 profile and a quoted six-digit SD other than FFFFFF.',
        );
      }
      const name = firstString(service, ['ns-name'], firstString(nest, ['name']));
      if (!name) throw new Error('NEST requires a service name in ns-name or name.');
      this.nestError = '';
      this.nest = nest;
      this.nestService = service;
      this.form.patchValue({
        nsName: name,
        nsDescription: firstString(
          service,
          ['description'],
          firstString(nest, ['description'], `NEST deployment: ${name}`),
        ),
      });
      if (this.inventoryLoaded) {
        this.syncSelection();
        this.loadOsmVims();
      }
    } catch (error) {
      this.nestError = error instanceof Error ? error.message : 'Unable to read NEST.';
    } finally {
      input.value = '';
      this.changeDetectorRef.markForCheck();
    }
  }

  protected clearNest(): void {
    this.nest = null;
    this.nestService = null;
    this.nestFileName = '';
    this.nestError = '';
    this.deploymentDraftService.saveFormValue(
      'k8s',
      'k8s-deploy',
      { ...this.form.getRawValue(), nestRequired: false },
      'draft',
    );
  }

  protected nestSelectionError(): string {
    const service = this.nestService;
    if (!service) return '';
    if (service['nsd-id'] && service['nsd-id'] !== this.form.controls.nsdId.value)
      return 'The NEST NSD is not selected or is not available in OSM.';
    if (service['nfvo-id'] && service['nfvo-id'] !== this.form.controls.nfvoId.value)
      return 'The selected NSD does not belong to the NEST NFVO.';
    if (
      service['target'] &&
      !this.availableClusters().some(
        (cluster) =>
          cluster.id === service['target'] &&
          cluster.vim_account === this.form.controls.vimAccountId.value,
      )
    )
      return 'The NEST target does not match the selected OSM VIM account.';
    return '';
  }

  protected helmValues(): string {
    const config = this.nestService?.['helm_configuration'];
    return isNestRecord(config)
      ? JSON.stringify({ global: { katanaNestSd: String(config['sd']).toLowerCase() } }, null, 2)
      : '';
  }

  protected locationLabel(): string {
    const clusters = this.availableClusters().filter(
      (cluster) => cluster.vim_account === this.form.controls.vimAccountId.value,
    );
    const direct = [...new Set(clusters.map((cluster) => cluster.location).filter(Boolean))];
    if (direct.length) return direct.join(', ');
    const linked = this.locations.filter(
      (location) =>
        Array.isArray(location['vims']) &&
        clusters.some((cluster) => (location['vims'] as unknown[]).includes(cluster.id)),
    );
    return (
      (linked.length ? linked : this.locations)
        .map((location) => firstString(location, ['id', 'name']))
        .filter(Boolean)
        .join(', ') || 'No registered location returned'
    );
  }

  protected nsdChanged(): void {
    const selected = this.selectedNsd();
    this.form.controls.nfvoId.setValue(String(selected?.nfvo_id ?? ''));
    this.form.controls.vimAccountId.setValue('');
    this.loadOsmVims();
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

  protected vimLabel(vim: OsmVimAccountSummary): string {
    return `${vim.name} · ${vim.id} (${vim.k8s_cluster_count} K8s clusters)`;
  }

  private syncSelection(): void {
    const explicit = this.nestService?.['nsd-id'];
    if (typeof explicit === 'string' && explicit) this.form.controls.nsdId.setValue(explicit);
    const selected = this.selectedNsd();
    if (selected) {
      this.form.controls.nfvoId.setValue(String(selected.nfvo_id ?? ''));
    } else if (!explicit) {
      const candidates = this.nsds.filter(
        (nsd) => !this.nestService?.['nfvo-id'] || nsd.nfvo_id === this.nestService['nfvo-id'],
      );
      if (candidates.length === 1) {
        this.form.controls.nsdId.setValue(this.catalogNsdId(candidates[0]));
        this.form.controls.nfvoId.setValue(String(candidates[0].nfvo_id ?? ''));
      }
    }
  }

  private selectDefaultVim(): void {
    const clusters = this.availableClusters();
    const vims = this.vims.filter((vim) => vim.k8s_cluster_count > 0);
    const nestTarget = this.nestService?.['target'];
    const match = nestTarget ? clusters.find((cluster) => cluster.id === nestTarget) : null;
    if (match && vims.some((vim) => vim.id === match.vim_account))
      this.form.controls.vimAccountId.setValue(match.vim_account);
    const selected = this.form.controls.vimAccountId.value;
    if (!vims.some((vim) => vim.id === selected)) {
      const clusterDefault = clusters.length === 1 ? clusters[0].vim_account : '';
      this.form.controls.vimAccountId.setValue(
        vims.some((vim) => vim.id === clusterDefault)
          ? clusterDefault
          : vims.length === 1
            ? vims[0].id
            : '',
      );
    }
  }

  private loadOsmVims(): void {
    const requestId = ++this.vimRequestId;
    const nfvoId = this.form.controls.nfvoId.value?.trim();
    this.vims = [];
    this.inventoryError = '';
    if (!nfvoId) {
      this.loadingInventory = false;
      return;
    }
    this.loadingInventory = true;
    this.kubernetesApi.getOsmVimAccounts(nfvoId).subscribe({
      next: (vims) => {
        if (requestId !== this.vimRequestId) return;
        this.vims = vims;
        this.selectDefaultVim();
        this.loadingInventory = false;
        this.changeDetectorRef.markForCheck();
      },
      error: (error: unknown) => {
        if (requestId !== this.vimRequestId) return;
        this.loadingInventory = false;
        this.inventoryError = getApiErrorMessage(error, 'Unable to load active OSM VIMs.');
        this.changeDetectorRef.markForCheck();
      },
    });
  }

  private selectedNsd(): NsdSummary | null {
    const id = this.form.controls.nsdId.value;
    return this.nsds.find((nsd) => this.catalogNsdId(nsd) === id) ?? null;
  }

  protected submit(): void {
    this.submitSucceeded = false;
    this.submitMessage = '';
    this.submitError = '';

    if (
      this.form.invalid ||
      this.loadingInventory ||
      this.inventoryError ||
      this.nestError ||
      this.nestSelectionError() ||
      this.submitting ||
      this.operationLocked ||
      !this.selectedNsd() ||
      !this.vims.some(
        (vim) => vim.id === this.form.controls.vimAccountId.value && vim.k8s_cluster_count > 0,
      )
    ) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting = true;
    if (!this.requestId) {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 15) | 64;
      bytes[8] = (bytes[8] & 63) | 128;
      const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
      this.requestId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
    this.operationLocked = true;
    this.form.disable({ emitEvent: false });
    // Persist identity before the request; reload must recover this attempt, not create another.
    this.deploymentDraftService.saveFormValue('k8s', 'k8s-deploy', {
      ...this.form.getRawValue(), nestRequired: !!this.nest, requestId: this.requestId,
    }, 'draft');

    this.kubernetesApi
      .deployK8sService({
        ...(this.form.getRawValue() as K8sDeployServiceFormModel),
        requestId: this.requestId,
        ...(this.nest ? { nest: this.nest } : {}),
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
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
              { ...this.form.getRawValue(), nestRequired: !!this.nest, requestId: this.requestId },
              'active',
            );
            this.submitSucceeded = true;
            this.submitMessage = response.message || 'Deployment request sent successfully.';
            this.deployed.emit({
              status: response.phase === 'unknown' ? 'unknown' : response.phase === 'failed' ? 'failed' : 'accepted',
              osmResponse: response.osm_response,
              operationId: response.operation_id ?? this.requestId,
            });
          });
        },
        error: (error: unknown) => {
          this.ngZone.run(() => {
            this.submitSucceeded = false;
            const rejected = error instanceof HttpErrorResponse && [400, 404].includes(error.status);
            this.operationLocked = !rejected;
            if (rejected) this.form.enable({ emitEvent: false });
            this.submitError = rejected
              ? getApiErrorMessage(error, 'Unable to deploy to Kubernetes.')
              : 'Submission outcome is unconfirmed. Check this operation before deploying again.';
            this.deployed.emit({
              status: rejected ? 'failed' : 'unknown',
              operationId: rejected ? undefined : this.requestId,
              errorType: getApiErrorType(error) ?? 'Failed',
            });
          });
        },
      });
  }

  protected checkOperation(): void {
    if (!this.requestId) return;
    this.kubernetesApi.getOperation(this.requestId).pipe(
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: (operation) => {
        this.operation = operation;
        this.operationLocked = true;
        this.submitMessage = operation.message;
        this.deployed.emit({ status: operation.phase === 'completed' ? 'done' : operation.phase === 'failed' ? 'failed' : operation.phase === 'unknown' ? 'unknown' : 'accepted',
          operationId: operation.operation_id, operation });
        this.submitError = '';
        this.changeDetectorRef.markForCheck();
      },
      error: (error: unknown) => {
        // A missing record allows retry with THE SAME key; concurrent creates still deduplicate.
        this.operationLocked = !(error instanceof HttpErrorResponse && error.status === 404);
        if (!this.operationLocked) this.form.enable({ emitEvent: false });
        this.submitError = this.operationLocked
          ? 'Status is unavailable. Keep this request identity and check again.'
          : 'No submission record exists. You can correct the input and retry this request.';
        this.changeDetectorRef.markForCheck();
      },
    });
  }

  protected startNewOperation(): void {
    if (!this.operation || !['completed', 'failed'].includes(this.operation.phase)) return;
    this.requestId = '';
    this.operation = null;
    this.operationLocked = false;
    this.form.enable({ emitEvent: false });
    this.submitMessage = '';
    this.form.updateValueAndValidity({ emitEvent: true });
  }

}
