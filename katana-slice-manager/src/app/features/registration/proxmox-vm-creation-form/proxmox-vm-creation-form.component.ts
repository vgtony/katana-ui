import { ChangeDetectorRef, Component, NgZone, inject, output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { initialProxmoxVmCreationFormModel } from '../../../models/proxmox-vm-creation-form.model';
import { ProxmoxVmCreationFormModel } from '../../../models/interfaces/proxmox-vm-creation-form.interface';
import { DeploymentPackStatus } from '../../../models/interfaces/deployment-pack.interface';
import {
  ProxmoxBridgeConfig,
  ProxmoxVmConfig,
  ProxmoxVmDeploymentRequest
} from '../../../models/interfaces/proxmox.interface';
import { ProxmoxApiService, getApiErrorMessage, getApiErrorType } from '../../../shared/services/api';
import { DeploymentDraftService } from '../../../shared/services/deployment-draft.service';

export interface DeploymentAttemptEvent {
  status: DeploymentPackStatus;
  errorType?: string;
}

@Component({
  selector: 'app-proxmox-vm-creation-form',
  imports: [ReactiveFormsModule],
  templateUrl: './proxmox-vm-creation-form.component.html',
  styleUrl: './proxmox-vm-creation-form.component.scss'
})
export class ProxmoxVmCreationFormComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly ngZone = inject(NgZone);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly proxmoxApi = inject(ProxmoxApiService);
  private readonly deploymentDraftService = inject(DeploymentDraftService);
  readonly deployed = output<DeploymentAttemptEvent>();
  protected readonly model: ProxmoxVmCreationFormModel = this.deploymentDraftService.getFormValue(
    'proxmox',
    'proxmox-vm',
    initialProxmoxVmCreationFormModel
  );
  protected readonly savedState = this.deploymentDraftService.getFormState('proxmox', 'proxmox-vm');
  protected readonly restoreMessage =
    this.savedState === 'active'
      ? 'Active Proxmox VM configuration loaded. Update it only if you want to deploy a different VM.'
      : this.savedState === 'draft'
        ? 'Saved Proxmox VM draft restored.'
        : '';
  protected submitting = false;
  protected submitSucceeded = false;
  protected submitMessage = '';
  protected submitError = '';

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
    customBridgeName: [this.model.customBridgeName],
    customBridgeType: [this.model.customBridgeType],
    customIp: [this.model.customIp],
    customNetmask: [this.model.customNetmask],
    customGateway: [this.model.customGateway]
  });

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.deploymentDraftService.saveFormValue(
        'proxmox',
        'proxmox-vm',
        this.form.getRawValue() as ProxmoxVmCreationFormModel,
        'draft'
      );
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

    const payload = this.buildDeploymentRequest();

    if (!payload) {
      return;
    }

    this.submitting = true;

    this.proxmoxApi
      .deployVms(payload)
      .pipe(
        finalize(() =>
          this.ngZone.run(() => {
            this.submitting = false;
            this.changeDetectorRef.detectChanges();
          })
        )
      )
      .subscribe({
        next: (response) => {
          this.ngZone.run(() => {
            this.deploymentDraftService.saveFormValue(
              'proxmox',
              'proxmox-vm',
              this.form.getRawValue() as ProxmoxVmCreationFormModel,
              'active'
            );
            this.submitSucceeded = true;
            this.submitMessage = `${response.message}. Status: ${response.deployment_status}. Estimated time: ${response.estimated_time}.`;
            this.deployed.emit({ status: 'done' });
            this.changeDetectorRef.detectChanges();
          });
        },
        error: (error: unknown) => {
          this.ngZone.run(() => {
            this.submitSucceeded = false;
            this.submitError = getApiErrorMessage(error, 'Unable to deploy Proxmox VM.');
            this.deployed.emit({
              status: 'failed',
              errorType: getApiErrorType(error) ?? 'Failed'
            });
            this.changeDetectorRef.detectChanges();
          });
        }
      });
  }

  private buildDeploymentRequest(): ProxmoxVmDeploymentRequest | null {
    const formValue = this.form.getRawValue() as ProxmoxVmCreationFormModel;
    const managementBridge = this.buildRequiredBridgeConfig(
      formValue.managementBridgeName,
      formValue.managementBridgeType
    );
    const customBridge = this.buildOptionalBridgeConfig(
      formValue.customBridgeName,
      formValue.customBridgeType,
      formValue.customIp,
      formValue.customNetmask,
      formValue.customGateway
    );

    if (!managementBridge) {
      this.submitError = 'Management bridge name and type are required.';
      return null;
    }

    if (customBridge === 'invalid') {
      this.submitError =
        'If you provide custom bridge details, include both bridge name and type. For non-management bridges, IP address, netmask, and gateway are also required.';
      return null;
    }

    const vm: ProxmoxVmConfig = {
      name: formValue.vmName,
      template: formValue.template,
      cpu: formValue.cpu,
      ram: formValue.ram,
      storage_type: formValue.storageType,
      disk_size: formValue.diskSize,
      bridges: customBridge ? [managementBridge, customBridge] : [managementBridge]
    };

    return {
      cluster_name: formValue.clusterName,
      vms: [vm]
    };
  }

  private buildRequiredBridgeConfig(name: string, type: string): ProxmoxBridgeConfig | null {
    const normalizedName = name.trim();
    const normalizedType = type.trim();

    if (!normalizedName || !normalizedType) {
      return null;
    }

    return {
      name: normalizedName,
      type: normalizedType
    };
  }

  private buildOptionalBridgeConfig(
    name: string,
    type: string,
    ip?: string,
    netmask?: string,
    gateway?: string
  ): ProxmoxBridgeConfig | null | 'invalid' {
    const normalizedName = name.trim();
    const normalizedType = type.trim();
    const normalizedIp = ip?.trim() ?? '';
    const normalizedNetmask = netmask?.trim() ?? '';
    const normalizedGateway = gateway?.trim() ?? '';

    const hasAnyCustomValue = [
      normalizedName,
      normalizedType,
      normalizedIp,
      normalizedNetmask,
      normalizedGateway
    ].some(Boolean);

    if (!hasAnyCustomValue) {
      return null;
    }

    if (!normalizedName || !normalizedType) {
      return 'invalid';
    }

    if (normalizedType === 'management') {
      return { name: normalizedName, type: normalizedType };
    }

    if (!normalizedIp || !normalizedNetmask || !normalizedGateway) {
      return 'invalid';
    }

    return {
      name: normalizedName,
      type: normalizedType,
      ip: normalizedIp,
      netmask: normalizedNetmask,
      gateway: normalizedGateway
    };
  }
}
