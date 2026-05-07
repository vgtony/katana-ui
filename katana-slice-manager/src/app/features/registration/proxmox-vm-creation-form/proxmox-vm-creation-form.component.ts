import { ChangeDetectorRef, Component, DestroyRef, NgZone, effect, inject, input, output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription, finalize, switchMap, takeWhile, timer } from 'rxjs';
import { initialProxmoxVmCreationFormModel } from '../../../models/proxmox-vm-creation-form.model';
import {
  ProxmoxVmCreationFormModel,
  ProxmoxVmTargetFormModel
} from '../../../models/interfaces/proxmox-vm-creation-form.interface';
import { DeploymentPackStatus } from '../../../models/interfaces/deployment-pack.interface';
import {
  ProxmoxStandaloneVmTarget,
  ProxmoxStorageIsoOption,
  ProxmoxVmTemplateOption
} from '../../../models/interfaces/proxmox-standalone-vm-target.interface';
import {
  ProxmoxBridgeConfig,
  ProxmoxVmConfig,
  ProxmoxVmIpRequest,
  ProxmoxVmIpResponse,
  ProxmoxProvisionResponse,
  ProxmoxVmDeploymentRequest
} from '../../../models/interfaces/proxmox.interface';
import {
  ProxmoxApiService,
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
  private readonly destroyRef = inject(DestroyRef);
  private readonly ngZone = inject(NgZone);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly proxmoxApi = inject(ProxmoxApiService);
  private readonly deploymentDraftService = inject(DeploymentDraftService);
  private readonly standaloneStorageOptions = new Map<string, string[]>();
  private readonly standaloneIsoImageOptions = new Map<string, Map<string, string[]>>();
  private readonly standaloneTemplateOptions = new Map<string, ProxmoxVmTemplateOption[]>();
  private readonly vmIpPollIntervalMs = 4000;
  private vmIpPollingSubscription: Subscription | null = null;
  readonly standaloneClusterId = input('');
  readonly standaloneClusterName = input('');
  readonly serverTargets = input<ProxmoxStandaloneVmTarget[]>([]);
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
  protected waitingForVmIp = false;
  protected submitSucceeded = false;
  protected submitMessage = '';
  protected submitError = '';
  protected vmIpStatusMessage = '';

  protected readonly form = this.formBuilder.group({
    clusterName: [this.model.clusterName, Validators.required],
    vmName: [this.model.vmName, Validators.required],
    template: [this.model.template],
    isoImage: [this.model.isoImage],
    start: [this.model.start],
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
    this.destroyRef.onDestroy(() => {
      this.stopVmIpPolling();
    });

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

  protected get hasCustomBridgeValues(): boolean {
    const values = this.form.getRawValue();

    return [
      values.customBridgeName,
      values.customBridgeType,
      values.customIp,
      values.customNetmask,
      values.customGateway
    ].some((value) => (value ?? '').trim().length > 0);
  }

  protected getStorageOptions(index: number): string[] {
    const node = this.vmTargetControls[index]?.get('node')?.value;
    return typeof node === 'string' ? this.standaloneStorageOptions.get(node) ?? [] : [];
  }

  protected getTemplateOptions(index: number): ProxmoxVmTemplateOption[] {
    const node = this.vmTargetControls[index]?.get('node')?.value;
    return typeof node === 'string' ? this.standaloneTemplateOptions.get(node) ?? [] : [];
  }

  protected getIsoImageOptions(index: number): string[] {
    const node = this.vmTargetControls[index]?.get('node')?.value;
    const storageType = this.vmTargetControls[index]?.get('storageType')?.value;

    if (typeof node !== 'string' || typeof storageType !== 'string' || !storageType.trim()) {
      return [];
    }

    return this.standaloneIsoImageOptions.get(node)?.get(storageType.trim()) ?? [];
  }

  protected isIsoImageDisabled(index: number): boolean {
    const storageType = this.vmTargetControls[index]?.get('storageType')?.value;
    return typeof storageType !== 'string' || !storageType.trim();
  }

  protected handleStorageSelectionChange(index: number): void {
    const vmTargetControl = this.vmTargetControls[index];

    if (!vmTargetControl) {
      return;
    }

    this.syncIsoImageControlState(vmTargetControl);

    const isoImageControl = vmTargetControl.get('isoImage');
    const currentIsoImage = isoImageControl?.value;
    const isoImageOptions = this.getIsoImageOptions(index);

    if (typeof currentIsoImage === 'string' && currentIsoImage && !isoImageOptions.includes(currentIsoImage)) {
      isoImageControl?.patchValue('');
    }
  }

  protected submit(): void {
    this.stopVmIpPolling();
    this.waitingForVmIp = false;
    this.vmIpStatusMessage = '';
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

    this.proxmoxApi
      .provisionVms(payload)
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
            this.startVmIpLookup(response, payload);
            this.changeDetectorRef.detectChanges();
          });
        },
        error: (error: unknown) => {
          this.ngZone.run(() => {
            this.stopVmIpPolling();
            this.waitingForVmIp = false;
            this.vmIpStatusMessage = '';
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
    const clusterId = this.standaloneClusterId().trim();
    const clusterName = formValue.clusterName.trim();

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
    const targetNodes = [...new Set(standaloneVmTargets.map((vmTarget) => vmTarget.node.trim()).filter(Boolean))];

    if (!clusterId && !clusterName) {
      this.submitError = 'Cluster selection is required before deploying.';
      return null;
    }

    if (targetNodes.length > 1) {
      this.submitError = 'Provisioning currently supports one selected Proxmox node per request.';
      return null;
    }

    const provisionNode = targetNodes[0] ?? '';
    const vmInputs = standaloneVmTargets.length
      ? standaloneVmTargets
      : [
          {
            node: '',
            vmName: formValue.vmName,
            template: formValue.template,
            isoImage: formValue.isoImage,
            start: formValue.start,
            cpu: formValue.cpu,
            ram: formValue.ram,
            storageType: formValue.storageType,
            diskSize: formValue.diskSize
          }
        ];
    const vms: ProxmoxVmConfig[] = [];

    for (const vmInput of vmInputs) {
      const vmConfig = this.buildVmConfig(vmInput, bridges);

      if (!vmConfig) {
        return null;
      }

      vms.push(vmConfig);
    }

    return {
      ...(clusterId ? { cluster_id: clusterId } : { cluster_name: clusterName }),
      ...(provisionNode ? { node: provisionNode } : {}),
      vms
    };
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
      this.standaloneIsoImageOptions.clear();
      this.standaloneTemplateOptions.clear();
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
    this.standaloneIsoImageOptions.clear();
    this.standaloneTemplateOptions.clear();
    while (this.vmTargetsArray.length) {
      this.vmTargetsArray.removeAt(0, { emitEvent: false });
    }

    for (const target of targets) {
      this.standaloneStorageOptions.set(target.node, target.storageOptions);
      this.standaloneIsoImageOptions.set(target.node, this.buildStorageIsoImageMap(target.storageIsoImages));
      this.standaloneTemplateOptions.set(target.node, target.templateOptions ?? []);
      const savedTarget =
        existingTargets.get(target.node) ?? this.findSavedVmTarget(target.node) ?? null;
      const vmTargetGroup = this.createVmTargetGroup(savedTarget ?? this.createDefaultVmTarget(target));
      this.syncIsoImageControlState(vmTargetGroup);
      this.vmTargetsArray.push(vmTargetGroup, { emitEvent: false });
    }
  }

  private syncStandaloneFormMode(hasTargets: boolean): void {
    const singleVmControlNames: Array<
      'vmName' | 'template' | 'isoImage' | 'start' | 'cpu' | 'ram' | 'storageType' | 'diskSize'
    > = ['vmName', 'template', 'isoImage', 'start', 'cpu', 'ram', 'storageType', 'diskSize'];

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
      isoImage: '',
      start: false,
      customBridgeName: '',
      customBridgeType: '',
      customIp: '',
      customNetmask: '',
      customGateway: '',
      vmTargets: model.vmTargets.map((target) => ({
        ...target,
        template: '',
        isoImage: '',
        start: false
      }))
    };
  }

  private createDefaultVmTarget(target: ProxmoxStandaloneVmTarget): ProxmoxVmTargetFormModel {
    return {
      node: target.node,
      vmName: `${this.model.vmName}-${target.node}`,
      template: this.model.template,
      isoImage: this.model.isoImage,
      start: this.model.start,
      cpu: this.model.cpu,
      ram: this.model.ram,
      storageType: '',
      diskSize: this.model.diskSize
    };
  }

  private createVmTargetGroup(value: ProxmoxVmTargetFormModel): FormGroup {
    return this.formBuilder.group({
      node: [value.node, Validators.required],
      vmName: [value.vmName, Validators.required],
      template: [value.template],
      isoImage: [value.isoImage],
      start: [value.start],
      cpu: [value.cpu, [Validators.required, Validators.min(1)]],
      ram: [value.ram, [Validators.required, Validators.min(1)]],
      storageType: [value.storageType, Validators.required],
      diskSize: [value.diskSize, [Validators.required, Validators.min(1)]]
    });
  }

  private syncIsoImageControlState(vmTargetGroup: FormGroup): void {
    const storageType = vmTargetGroup.get('storageType')?.value;
    const isoImageControl = vmTargetGroup.get('isoImage');
    const hasStorageSelection = typeof storageType === 'string' && !!storageType.trim();

    if (!isoImageControl) {
      return;
    }

    if (hasStorageSelection) {
      isoImageControl.enable({ emitEvent: false });
      return;
    }

    isoImageControl.disable({ emitEvent: false });
  }

  private buildVmConfig(
    vmValue: ProxmoxVmTargetFormModel,
    bridges: ProxmoxBridgeConfig[]
  ): ProxmoxVmConfig | null {
    const template = vmValue.template.trim();
    const isoImage = vmValue.isoImage.trim();

    if (!template && !isoImage) {
      this.submitError = 'Provide a template or choose an ISO image before deploying.';
      return null;
    }

    const parsedTemplate = this.parseTemplateValue(template);

    return {
      name: vmValue.vmName,
      ...(parsedTemplate !== null ? { template: parsedTemplate } : {}),
      cpu: vmValue.cpu,
      ram: vmValue.ram,
      storage_type: vmValue.storageType,
      disk_size: vmValue.diskSize,
      ...(parsedTemplate === null ? { iso_image: isoImage } : {}),
      start: vmValue.start,
      bridges
    };
  }

  private parseTemplateValue(template: string): string | number | null {
    if (!template) {
      return null;
    }

    return /^\d+$/.test(template) ? Number(template) : template;
  }

  private buildStorageIsoImageMap(
    storageIsoImages: ProxmoxStorageIsoOption[] | undefined
  ): Map<string, string[]> {
    const storageIsoImageMap = new Map<string, string[]>();

    for (const entry of storageIsoImages ?? []) {
      storageIsoImageMap.set(entry.storage, entry.isoImages);
    }

    return storageIsoImageMap;
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

  private startVmIpLookup(
    response: ProxmoxProvisionResponse,
    request: ProxmoxVmDeploymentRequest
  ): void {
    const vmIpRequest = this.buildVmIpRequest(response, request);

    if (!vmIpRequest) {
      this.completeSuccessfulDeployment(this.buildProvisionSuccessMessage(response, request));
      return;
    }

    this.waitingForVmIp = true;
    this.vmIpStatusMessage = this.buildPendingVmIpMessage(vmIpRequest);
    this.vmIpPollingSubscription = timer(0, this.vmIpPollIntervalMs)
      .pipe(
        switchMap(() => this.proxmoxApi.getVmIp(vmIpRequest)),
        takeWhile((vmIpResponse) => vmIpResponse.ip_status !== 'ready', true),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (vmIpResponse) => {
          this.ngZone.run(() => {
            if (vmIpResponse.ip_status === 'ready') {
              this.completeSuccessfulDeployment(this.buildVmIpReadyMessage(vmIpResponse, response, request));
              return;
            }

            this.vmIpStatusMessage = this.buildPendingVmIpMessage(vmIpRequest, vmIpResponse);
            this.changeDetectorRef.detectChanges();
          });
        },
        error: () => {
          this.ngZone.run(() => {
            this.completeSuccessfulDeployment(this.buildProvisionSuccessMessage(response, request));
          });
        }
      });
  }

  private buildVmIpRequest(
    response: ProxmoxProvisionResponse,
    request: ProxmoxVmDeploymentRequest
  ): ProxmoxVmIpRequest | null {
    const vmid = response.results[0]?.vmid;
    const node = response.results[0]?.node?.trim() || response.node.trim() || request.node?.trim() || '';

    if (!vmid || !node) {
      return null;
    }

    return {
      ...(request.cluster_id ? { cluster_id: request.cluster_id } : {}),
      ...(!request.cluster_id && request.cluster_name?.trim()
        ? { cluster_name: request.cluster_name.trim() }
        : {}),
      node,
      vmid
    };
  }

  private buildProvisionSuccessMessage(
    response: ProxmoxProvisionResponse,
    request: ProxmoxVmDeploymentRequest
  ): string {
    const ipAddress = this.findProvisionedVmIp(response, request);
    return `VM Deployed. IP: ${ipAddress ?? 'unavailable'}`;
  }

  private buildPendingVmIpMessage(
    request: ProxmoxVmIpRequest,
    response?: ProxmoxVmIpResponse
  ): string {
    const statusLabel = response?.error?.trim() ? ` Last update: ${response.error.trim()}.` : '';
    return `Deployment started on ${request.node}. Waiting for Proxmox to report the guest IP for VM ${request.vmid}. Current status: IP pending.${statusLabel}`;
  }

  private buildVmIpReadyMessage(
    response: ProxmoxVmIpResponse,
    provisionResponse: ProxmoxProvisionResponse,
    request: ProxmoxVmDeploymentRequest
  ): string {
    const primaryIp =
      this.readString(response.primary_ip) ??
      response.ip_addresses.map((ip) => this.readString(ip)).find((ip) => ip !== null) ??
      response.network_interfaces
        .flatMap((networkInterface) => networkInterface.ipv4)
        .map((ip) => this.readString(ip))
        .find((ip) => ip !== null) ??
      this.findProvisionedVmIp(provisionResponse, request);

    return `VM Deployed. IP: ${primaryIp ?? 'unavailable'}`;
  }

  private completeSuccessfulDeployment(message: string): void {
    this.stopVmIpPolling();
    this.waitingForVmIp = false;
    this.vmIpStatusMessage = '';
    this.submitSucceeded = true;
    this.submitMessage = message;
    this.deployed.emit({ status: 'done' });
    this.changeDetectorRef.detectChanges();
  }

  private stopVmIpPolling(): void {
    this.vmIpPollingSubscription?.unsubscribe();
    this.vmIpPollingSubscription = null;
  }

  private findProvisionedVmIp(
    response: ProxmoxProvisionResponse,
    request: ProxmoxVmDeploymentRequest
  ): string | null {
    const deployedVmName =
      response.results.find((result) => this.readString(result.name))?.name?.trim() ??
      request.vms.find((vm) => this.readString(vm.name))?.name?.trim() ??
      null;

    const responseIp = this.extractBridgeIp(
      response.results.find((result) => !deployedVmName || result.name === deployedVmName)?.bridges ??
        response.results[0]?.bridges
    );

    if (responseIp) {
      return responseIp;
    }

    return this.extractBridgeIp(
      request.vms.find((vm) => !deployedVmName || vm.name === deployedVmName)?.bridges ??
        request.vms[0]?.bridges
    );
  }

  private extractBridgeIp(bridges: ProxmoxBridgeConfig[] | undefined): string | null {
    if (!bridges?.length) {
      return null;
    }

    return bridges.map((bridge) => this.readString(bridge.ip)).find((ip) => ip !== null) ?? null;
  }

  private readString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    return normalized || null;
  }
}
