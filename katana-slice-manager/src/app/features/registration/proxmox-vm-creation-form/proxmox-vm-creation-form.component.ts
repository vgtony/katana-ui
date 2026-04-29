import { ChangeDetectorRef, Component, NgZone, effect, inject, input, output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { initialProxmoxVmCreationFormModel } from '../../../models/proxmox-vm-creation-form.model';
import {
  ProxmoxVmCreationFormModel,
  ProxmoxVmTargetFormModel
} from '../../../models/interfaces/proxmox-vm-creation-form.interface';
import { DeploymentPackStatus } from '../../../models/interfaces/deployment-pack.interface';
import { ProxmoxStandaloneVmTarget } from '../../../models/interfaces/proxmox-standalone-vm-target.interface';
import {
  ProxmoxBridgeConfig,
  ProxmoxVmConfig
} from '../../../models/interfaces/proxmox.interface';
import {
  ProxmoxStandaloneVmDeploymentRequest,
  ProxmoxStandaloneApiService,
  ProxmoxStandaloneAuthPayload,
  getApiErrorMessage,
  getApiErrorType
} from '../../../shared/services/api';
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
  private readonly proxmoxStandaloneApi = inject(ProxmoxStandaloneApiService);
  private readonly deploymentDraftService = inject(DeploymentDraftService);
  private readonly standaloneStorageOptions = new Map<string, string[]>();
  readonly standaloneClusterName = input('');
  readonly serverTargets = input<ProxmoxStandaloneVmTarget[]>([]);
  readonly standaloneAuthPayload = input<ProxmoxStandaloneAuthPayload | null>(null);
  readonly deployed = output<DeploymentAttemptEvent>();
  protected readonly model: ProxmoxVmCreationFormModel = this.clearOptionalPrefill(
    this.deploymentDraftService.getFormValue(
      'proxmox-standalone',
      'proxmox-vm',
      initialProxmoxVmCreationFormModel
    )
  );
  protected readonly savedState = this.deploymentDraftService.getFormState(
    'proxmox-standalone',
    'proxmox-vm'
  );
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
    template: [this.model.template],
    cpu: [this.model.cpu, Validators.required],
    ram: [this.model.ram, Validators.required],
    storageType: [this.model.storageType, Validators.required],
    diskSize: [this.model.diskSize, Validators.required],
    vmTargets: this.formBuilder.array([]),
    managementBridgeName: [this.model.managementBridgeName, Validators.required],
    managementBridgeType: [this.model.managementBridgeType, Validators.required],
    customBridgeName: [this.model.customBridgeName],
    customBridgeType: [this.model.customBridgeType],
    customIp: [this.model.customIp],
    customNetmask: [this.model.customNetmask],
    customGateway: [this.model.customGateway]
  });

  constructor() {
    effect(() => {
      const serverTargets = this.serverTargets();
      this.syncStandaloneTargets(serverTargets, this.standaloneClusterName());
      this.syncStandaloneFormMode(serverTargets.length > 0);
    });

    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.deploymentDraftService.saveFormValue(
        'proxmox-standalone',
        'proxmox-vm',
        this.form.getRawValue() as ProxmoxVmCreationFormModel,
        'draft'
      );
    });
  }

  protected get hasStandaloneTargets(): boolean {
    return this.serverTargets().length > 0;
  }

  protected get vmTargetControls(): FormGroup[] {
    return this.vmTargetsArray.controls as FormGroup[];
  }

  protected getStorageOptions(index: number): string[] {
    const node = this.vmTargetControls[index]?.get('node')?.value;
    return typeof node === 'string' ? this.standaloneStorageOptions.get(node) ?? [] : [];
  }

  protected submit(): void {
    this.submitSucceeded = false;
    this.submitMessage = '';
    this.submitError = '';

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.submitError = 'Complete all required fields before deploying.';
      return;
    }

    const payload = this.buildDeploymentRequest();

    if (!payload) {
      return;
    }

    this.submitting = true;

    this.proxmoxStandaloneApi
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
              'proxmox-standalone',
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

  private buildDeploymentRequest(): ProxmoxStandaloneVmDeploymentRequest | null {
    const formValue = this.form.getRawValue() as ProxmoxVmCreationFormModel;
    const authPayload = this.resolveStandaloneAuthPayload();

    if (!authPayload) {
      this.submitError = 'Standalone Proxmox authentication is required before deploying VMs.';
      return null;
    }

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

    const bridges = customBridge ? [managementBridge, customBridge] : [managementBridge];
    const standaloneVmTargets =
      this.hasStandaloneTargets && formValue.vmTargets.length
        ? formValue.vmTargets
        : [];
    const vms = standaloneVmTargets.length
      ? standaloneVmTargets.map((vmTarget) => this.buildVmConfig(vmTarget, bridges))
      : [
          this.buildVmConfig(
            {
              node: '',
              vmName: formValue.vmName,
              template: formValue.template,
              cpu: formValue.cpu,
              ram: formValue.ram,
              storageType: formValue.storageType,
              diskSize: formValue.diskSize
            },
            bridges
          )
        ];

    return {
      ...authPayload,
      cluster_name: formValue.clusterName,
      vms
    };
  }

  private resolveStandaloneAuthPayload(): ProxmoxStandaloneAuthPayload | null {
    const inputPayload = this.standaloneAuthPayload();

    if (inputPayload) {
      return inputPayload;
    }

    const snapshot = this.deploymentDraftService.getSavedFormSnapshot<Record<string, unknown>>(
      'proxmox-standalone',
      'proxmox-standalone'
    );

    if (!snapshot) {
      return null;
    }

    const name = this.readString(snapshot['name']);
    const url = this.readString(snapshot['url']);

    if (!name || !url) {
      return null;
    }

    const payload: ProxmoxStandaloneAuthPayload = {
      name,
      url,
      verify_ssl: snapshot['verifySsl'] === true
    };
    const username = this.readString(snapshot['username']);
    const password = this.readString(snapshot['password'], false);
    const apiTokenId = this.readString(snapshot['apiTokenId']);
    const apiTokenSecret = this.readString(snapshot['apiTokenSecret'], false);

    if (username && password) {
      return {
        ...payload,
        username,
        password
      };
    }

    if (apiTokenId && apiTokenSecret) {
      return {
        ...payload,
        api_token_id: apiTokenId,
        api_token_secret: apiTokenSecret
      };
    }

    return null;
  }

  private get vmTargetsArray(): FormArray {
    return this.form.controls.vmTargets as FormArray;
  }

  private syncStandaloneTargets(targets: ProxmoxStandaloneVmTarget[], clusterName: string): void {
    if (clusterName.trim()) {
      this.form.controls.clusterName.patchValue(clusterName, { emitEvent: false });
    }

    if (!targets.length) {
      this.standaloneStorageOptions.clear();
      while (this.vmTargetsArray.length) {
        this.vmTargetsArray.removeAt(0, { emitEvent: false });
      }
      return;
    }

    const existingTargets = new Map(
      (this.vmTargetsArray.getRawValue() as ProxmoxVmTargetFormModel[]).map((target) => [
        target.node,
        target
      ])
    );

    this.standaloneStorageOptions.clear();
    while (this.vmTargetsArray.length) {
      this.vmTargetsArray.removeAt(0, { emitEvent: false });
    }

    for (const target of targets) {
      this.standaloneStorageOptions.set(target.node, target.storageOptions);
      const savedTarget =
        existingTargets.get(target.node) ?? this.findSavedVmTarget(target.node) ?? null;
      this.vmTargetsArray.push(
        this.createVmTargetGroup(savedTarget ?? this.createDefaultVmTarget(target)),
        { emitEvent: false }
      );
    }
  }

  private syncStandaloneFormMode(hasTargets: boolean): void {
    const singleVmControlNames: Array<
      'vmName' | 'template' | 'cpu' | 'ram' | 'storageType' | 'diskSize'
    > = ['vmName', 'template', 'cpu', 'ram', 'storageType', 'diskSize'];

    for (const controlName of singleVmControlNames) {
      const control = this.form.controls[controlName];

      if (hasTargets) {
        control.disable({ emitEvent: false });
        continue;
      }

      control.enable({ emitEvent: false });
    }
  }

  private findSavedVmTarget(node: string): ProxmoxVmTargetFormModel | null {
    return this.model.vmTargets.find((target) => target.node === node) ?? null;
  }

  private clearOptionalPrefill(
    model: ProxmoxVmCreationFormModel
  ): ProxmoxVmCreationFormModel {
    return {
      ...model,
      template: '',
      customBridgeName: '',
      customBridgeType: '',
      customIp: '',
      customNetmask: '',
      customGateway: '',
      vmTargets: model.vmTargets.map((target) => ({
        ...target,
        template: ''
      }))
    };
  }

  private createDefaultVmTarget(target: ProxmoxStandaloneVmTarget): ProxmoxVmTargetFormModel {
    return {
      node: target.node,
      vmName: `${this.model.vmName}-${target.node}`,
      template: this.model.template,
      cpu: this.model.cpu,
      ram: this.model.ram,
      storageType: target.storageOptions[0] ?? this.model.storageType,
      diskSize: this.model.diskSize
    };
  }

  private createVmTargetGroup(value: ProxmoxVmTargetFormModel): FormGroup {
    return this.formBuilder.group({
      node: [value.node, Validators.required],
      vmName: [value.vmName, Validators.required],
      template: [value.template],
      cpu: [value.cpu, [Validators.required, Validators.min(1)]],
      ram: [value.ram, [Validators.required, Validators.min(1)]],
      storageType: [value.storageType, Validators.required],
      diskSize: [value.diskSize, [Validators.required, Validators.min(1)]]
    });
  }

  private buildVmConfig(
    vmValue: ProxmoxVmTargetFormModel,
    bridges: ProxmoxBridgeConfig[]
  ): ProxmoxVmConfig {
    const node = vmValue.node.trim();
    const template = vmValue.template.trim();

    return {
      ...(node ? { node } : {}),
      name: vmValue.vmName,
      ...(template ? { template } : {}),
      cpu: vmValue.cpu,
      ram: vmValue.ram,
      storage_type: vmValue.storageType,
      disk_size: vmValue.diskSize,
      bridges
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

  private readString(value: unknown, trim = true): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = trim ? value.trim() : value;
    return normalized ? normalized : null;
  }
}
