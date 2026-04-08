import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { combineLatest } from 'rxjs';
import { NfvoRegistrationFormComponent } from '../../features/registration/nfvo-registration-form/nfvo-registration-form.component';
import { FunctionRegistrationFormComponent } from '../../features/registration/function-registration-form/function-registration-form.component';
import { VimRegistrationFormComponent } from '../../features/registration/vim-registration-form/vim-registration-form.component';
import { LocationRegistrationFormComponent } from '../../features/registration/location-registration-form/location-registration-form.component';
import { K8sCredentialsUploadFormComponent } from '../../features/registration/k8s-credentials-upload-form/k8s-credentials-upload-form.component';
import { K8sClusterRegistrationFormComponent } from '../../features/registration/k8s-cluster-registration-form/k8s-cluster-registration-form.component';
import { K8sDeployServiceFormComponent } from '../../features/registration/k8s-deploy-service-form/k8s-deploy-service-form.component';
import { ProxmoxClusterRegistrationFormComponent } from '../../features/registration/proxmox-cluster-registration-form/proxmox-cluster-registration-form.component';
import { ProxmoxVmCreationFormComponent } from '../../features/registration/proxmox-vm-creation-form/proxmox-vm-creation-form.component';
import { ProxmoxRegistrationFormComponent } from '../../features/registration/proxmox-registration-form/proxmox-registration-form.component';
import { SliceRegistrationFormComponent } from '../../features/registration/slice-registration-form/slice-registration-form.component';
import { DeploymentAttemptEvent } from '../../features/registration/proxmox-vm-creation-form/proxmox-vm-creation-form.component';
import {
  DeploymentFormKey,
  DeploymentFormState
} from '../../models/interfaces/deployment-draft.interface';
import { DeploymentPack, DeploymentPackStatus } from '../../models/interfaces/deployment-pack.interface';
import { DeploymentOption } from '../../models/interfaces/deployment.interface';
import { DeploymentDraftService } from '../../shared/services/deployment-draft.service';
import { DeploymentHistoryService } from '../../shared/services/deployment-history.service';

@Component({
  selector: 'app-deployment-page',
  imports: [
    NfvoRegistrationFormComponent,
    FunctionRegistrationFormComponent,
    VimRegistrationFormComponent,
    LocationRegistrationFormComponent,
    K8sCredentialsUploadFormComponent,
    K8sClusterRegistrationFormComponent,
    K8sDeployServiceFormComponent,
    ProxmoxClusterRegistrationFormComponent,
    ProxmoxVmCreationFormComponent,
    SliceRegistrationFormComponent
],
  templateUrl: './deployment-page.component.html',
  styleUrl: './deployment-page.component.scss'
})
export class DeploymentPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly deploymentHistoryService = inject(DeploymentHistoryService);
  private readonly deploymentDraftService = inject(DeploymentDraftService);
  private restoredPackId: string | null = null;

  protected currentStep = 1;
  protected deploymentStarted = false;
  protected expandedRequirementIds = new Set<string>();
  protected completedRequirementIds = new Set<string>();
  protected requirementContextTags: Partial<Record<string, string>> = {};
  protected pendingRequirementDeactivationId: string | null = null;
  protected pendingConfigurationDeactivation = false;
  protected sliceConfigurationComplete = false;
  protected lastDeploymentStatus: DeploymentPackStatus = 'done';

  protected readonly deploymentOptions: DeploymentOption[] = [
    {
      id: 'slice',
      label: 'Slice / OpenStack',
      shortLabel: 'Slice',
      description: 'Prepare an OpenStack-backed slice deployment using the core slice registration flow.',
      requirementsTitle: 'Slice registrations',
      requirementsDescription: 'Complete the required registrations before moving into the final slice configuration step.',
      requirements: [
        {
          id: 'nfvo',
          label: 'NFVO',
          route: '/deployment/slice',
          type: 'registration',
          guidance: 'Register the orchestrator endpoint, credentials, and onboarding details that the slice deployment depends on.'
        },
        {
          id: 'function',
          label: 'Function',
          route: '/deployment/slice',
          type: 'registration',
          guidance: 'Keep the function package and its metadata ready here so the deployment request can reference the right service building blocks.'
        },
        {
          id: 'vim',
          label: 'VIM',
          route: '/deployment/slice',
          type: 'registration',
          guidance: 'Capture the OpenStack or virtualized infrastructure target where the slice resources will ultimately be placed.'
        },
        {
          id: 'location',
          label: 'Location',
          route: '/deployment/slice',
          type: 'registration',
          guidance: 'Store the location context used to place and validate the slice deployment against the expected site.'
        }
      ],
      finalConfigurationLabel: 'Slice configuration',
      deployActionLabel: 'Deploy Slice'
    },
    {
      id: 'k8s',
      label: 'K8s Deploy',
      shortLabel: 'K8s',
      description: 'Guide a Kubernetes deployment by preparing credentials, cluster access, and deployment settings.',
      requirementsTitle: 'K8s registrations',
      requirementsDescription: 'Complete the required registrations before moving into the K8s deployment configuration step.',
      requirements: [
        {
          id: 'k8s-credentials',
          label: 'K8s Credentials',
          route: '/deployment/k8s',
          type: 'registration',
          guidance: 'Keep the cluster access credentials documented here so the future deploy request can reuse them directly.'
        },
        {
          id: 'k8s-cluster',
          label: 'K8s Cluster',
          route: '/deployment/k8s',
          type: 'registration',
          guidance: 'Register the Kubernetes cluster target and its connectivity details for the deployment flow.'
        }
      ],
      finalConfigurationLabel: 'K8s deployment configuration',
      deployActionLabel: 'Deploy To K8s'
    },
    {
      id: 'proxmox',
      label: 'Proxmox VM',
      shortLabel: 'Proxmox',
      description: 'Prepare a Proxmox-based virtual machine deployment with cluster and VM setup details.',
      requirementsTitle: 'Proxmox registrations',
      requirementsDescription: 'Complete the required Proxmox registration before moving into the VM deployment configuration step.',
      requirements: [
        {
          id: 'proxmox-cluster',
          label: 'Proxmox Cluster',
          route: '/deployment/proxmox',
          type: 'registration',
          guidance: 'Register the Proxmox cluster and connectivity details that the VM deployment will target.'
        }
      ],
      finalConfigurationLabel: 'Proxmox VM configuration',
      deployActionLabel: 'Deploy VM'
    }
  ];

  protected selectedOption = this.deploymentOptions[0];

  ngOnInit(): void {
    combineLatest([this.route.paramMap, this.route.queryParamMap])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([params, queryParams]) => {
        this.restoredPackId = queryParams.get('packId');
        this.setSelectedOption(params.get('option'));
        this.restoreHistoryPackState();
      });
  }

  private setSelectedOption(optionId: string | null): void {
    const option = this.deploymentOptions.find((item) => item.id === optionId);

    if (!option) {
      this.selectedOption = this.deploymentOptions[0];
      this.resetStepState();
      return;
    }

    this.selectedOption = option;
    this.resetStepState();
  }

  protected goToStep(step: number): void {
    if (step === 1) {
      this.currentStep = 1;
      this.deploymentStarted = false;
      return;
    }

    if (step === 2 && this.selectedOption && this.isStepOneComplete()) {
      this.currentStep = 2;
      this.deploymentStarted = false;
    }
  }

  protected moveToReview(): void {
    if (!this.isStepOneComplete()) {
      return;
    }

    this.currentStep = 2;
    this.deploymentStarted = false;
  }

  protected canAccessStepTwo(): boolean {
    return this.isStepOneComplete();
  }

  protected toggleSliceConfigurationComplete(): void {
    this.sliceConfigurationComplete = !this.sliceConfigurationComplete;
  }

  protected isSliceFlow(): boolean {
    return this.selectedOption.id === 'slice';
  }

  protected isSliceConfigurationComplete(): boolean {
    return this.selectedOption.id !== 'slice' || this.sliceConfigurationComplete;
  }

  protected toggleRequirement(requirementId: string): void {
    if (this.expandedRequirementIds.has(requirementId)) {
      this.expandedRequirementIds.delete(requirementId);
      return;
    }

    this.expandedRequirementIds.add(requirementId);
  }

  protected isRequirementExpanded(requirementId: string): boolean {
    return this.expandedRequirementIds.has(requirementId);
  }

  protected toggleRequirementComplete(requirementId: string): void {
    if (this.completedRequirementIds.has(requirementId)) {
      this.completedRequirementIds.delete(requirementId);
      return;
    }

    this.completedRequirementIds.add(requirementId);
  }

  protected markRequirementDone(requirementId: string): void {
    this.completedRequirementIds.add(requirementId);
    this.refreshRequirementContextTags();
  }

  protected isRequirementComplete(requirementId: string): boolean {
    return this.completedRequirementIds.has(requirementId);
  }

  protected getRequirementContextTag(requirementId: string): string | null {
    return this.requirementContextTags[requirementId] ?? null;
  }

  protected getRequirementStatusLabel(requirementId: string): string {
    return this.getRequirementState(requirementId) === 'active'
      ? 'Active'
      : this.isRequirementComplete(requirementId)
        ? 'Done'
        : 'Pending';
  }

  protected isRequirementActive(requirementId: string): boolean {
    return this.getRequirementState(requirementId) === 'active';
  }

  protected requestRequirementDeactivation(event: Event, requirementId: string): void {
    event.stopPropagation();

    if (!this.isRequirementActive(requirementId)) {
      return;
    }

    this.pendingRequirementDeactivationId =
      this.pendingRequirementDeactivationId === requirementId ? null : requirementId;
  }

  protected isRequirementDeactivationPending(requirementId: string): boolean {
    return this.pendingRequirementDeactivationId === requirementId;
  }

  protected confirmRequirementDeactivation(requirementId: string): void {
    const target = this.getRequirementDraftTarget(requirementId);

    if (!target) {
      this.pendingRequirementDeactivationId = null;
      return;
    }

    this.deploymentDraftService.deactivateForm(target.optionId, target.formKey);
    this.completedRequirementIds.delete(requirementId);
    this.pendingRequirementDeactivationId = null;
    this.refreshRequirementContextTags();
  }

  protected cancelRequirementDeactivation(): void {
    this.pendingRequirementDeactivationId = null;
  }

  protected getFinalConfigurationContextTag(): string | null {
    return this.buildFinalConfigurationContextTag();
  }

  protected isFinalConfigurationActive(): boolean {
    return this.getFinalConfigurationState() === 'active';
  }

  protected requestConfigurationDeactivation(): void {
    if (!this.isFinalConfigurationActive()) {
      return;
    }

    this.pendingConfigurationDeactivation = !this.pendingConfigurationDeactivation;
  }

  protected confirmConfigurationDeactivation(): void {
    const target = this.getFinalConfigurationDraftTarget();

    if (!target) {
      this.pendingConfigurationDeactivation = false;
      return;
    }

    this.deploymentDraftService.deactivateForm(target.optionId, target.formKey);
    this.pendingConfigurationDeactivation = false;

    if (target.optionId === 'slice') {
      this.sliceConfigurationComplete = false;
    }
  }

  protected cancelConfigurationDeactivation(): void {
    this.pendingConfigurationDeactivation = false;
  }

  protected getFinalConfigurationNotice(): string | null {
    const state = this.getFinalConfigurationState();

    if (state === 'active') {
      return 'An active configuration was restored for this step, so you can reuse it without refilling the form.';
    }

    if (state === 'draft') {
      return 'A saved draft was restored for this configuration step.';
    }

    return null;
  }

  protected completedRequirementsCount(): number {
    return this.selectedOption.requirements.filter((requirement) =>
      this.completedRequirementIds.has(requirement.id)
    ).length;
  }

  protected isStepOneComplete(): boolean {
    return this.completedRequirementsCount() === this.selectedOption.requirements.length;
  }

  protected deploy(attempt: DeploymentAttemptEvent = { status: 'done' }): void {
    const pack: Omit<DeploymentPack, 'id'> = {
      name: `${this.selectedOption.label} Pack`,
      optionId: this.selectedOption.id,
      optionLabel: this.selectedOption.label,
      shortLabel: this.selectedOption.shortLabel,
      status: attempt.status,
      errorType: attempt.errorType,
      completedAt: new Date().toISOString(),
      finalConfigurationLabel: this.selectedOption.finalConfigurationLabel,
      formSnapshots: this.deploymentDraftService.getSnapshotsForOption(this.selectedOption.id),
      requirements: this.selectedOption.requirements.map((requirement) => ({
        id: requirement.id,
        label: requirement.label,
        status: 'done'
      }))
    };

    this.deploymentHistoryService.addPack(pack);
    this.lastDeploymentStatus = attempt.status;
    this.deploymentStarted = true;
  }

  protected getDeploymentFeedbackMessage(): string {
    return this.lastDeploymentStatus === 'failed'
      ? `${this.selectedOption.label} pack saved to History with a failed deployment.`
      : `${this.selectedOption.label} pack saved to History as a completed deployment.`;
  }

  private resetStepState(): void {
    this.currentStep = 1;
    this.deploymentStarted = false;
    this.pendingRequirementDeactivationId = null;
    this.pendingConfigurationDeactivation = false;
    this.sliceConfigurationComplete = false;
    this.completedRequirementIds = new Set<string>();
    this.expandedRequirementIds = new Set<string>(
      this.selectedOption.requirements[0] ? [this.selectedOption.requirements[0].id] : []
    );
    this.syncSavedState();
    this.refreshRequirementContextTags();
  }

  private restoreHistoryPackState(): void {
    if (!this.restoredPackId) {
      this.deploymentDraftService.clearHistoryContext();
      this.syncSavedState();
      return;
    }

    const pack = this.deploymentHistoryService.getPackById(this.restoredPackId);

    if (!pack || pack.optionId !== this.selectedOption.id) {
      return;
    }

    this.completedRequirementIds = new Set(pack.requirements.map((requirement) => requirement.id));
    this.expandedRequirementIds = new Set<string>();
    this.currentStep = 2;
    this.deploymentStarted = false;
    this.pendingRequirementDeactivationId = null;
    this.pendingConfigurationDeactivation = false;
    this.sliceConfigurationComplete = this.selectedOption.id === 'slice';
    this.syncSavedState();
    this.refreshRequirementContextTags();
  }

  private syncSavedState(): void {
    const savedActiveRequirementIds = this.selectedOption.requirements
      .filter((requirement) => this.getRequirementState(requirement.id) === 'active')
      .map((requirement) => requirement.id);

    this.completedRequirementIds = new Set([
      ...this.completedRequirementIds,
      ...savedActiveRequirementIds
    ]);

    if (this.selectedOption.id === 'slice' && this.getFinalConfigurationState() === 'active') {
      this.sliceConfigurationComplete = true;
    }
  }

  private refreshRequirementContextTags(): void {
    this.requirementContextTags = Object.fromEntries(
      this.selectedOption.requirements.flatMap((requirement) => {
        const contextTag = this.buildRequirementContextTag(requirement.id);
        return contextTag ? [[requirement.id, contextTag]] : [];
      })
    );
  }

  private getRequirementDraftTarget(
    requirementId: string
  ): { optionId: 'slice' | 'k8s' | 'proxmox'; formKey: DeploymentFormKey } | null {
    switch (requirementId) {
      case 'nfvo':
      case 'function':
      case 'vim':
      case 'location':
        return {
          optionId: 'slice',
          formKey: requirementId
        };
      case 'k8s-credentials':
      case 'k8s-cluster':
        return {
          optionId: 'k8s',
          formKey: requirementId
        };
      case 'proxmox-cluster':
        return {
          optionId: 'proxmox',
          formKey: requirementId
        };
      default:
        return null;
    }
  }

  private getRequirementState(requirementId: string): DeploymentFormState {
    switch (requirementId) {
      case 'nfvo':
        return this.deploymentDraftService.getFormState('slice', 'nfvo');
      case 'function':
        return this.deploymentDraftService.getFormState('slice', 'function');
      case 'vim':
        return this.deploymentDraftService.getFormState('slice', 'vim');
      case 'location':
        return this.deploymentDraftService.getFormState('slice', 'location');
      case 'k8s-credentials':
        return this.deploymentDraftService.getFormState('k8s', 'k8s-credentials');
      case 'k8s-cluster':
        return this.deploymentDraftService.getFormState('k8s', 'k8s-cluster');
      case 'proxmox-cluster':
        return this.deploymentDraftService.getFormState('proxmox', 'proxmox-cluster');
      default:
        return 'missing';
    }
  }

  private buildRequirementContextTag(requirementId: string): string | null {
    switch (requirementId) {
      case 'nfvo': {
        const snapshot = this.deploymentDraftService.getSavedFormSnapshot<Record<string, string>>(
          'slice',
          'nfvo'
        );
        return this.formatContextTag(
          this.getRequirementState(requirementId),
          snapshot?.['name'] ?? snapshot?.['id']
        );
      }
      case 'function': {
        const snapshot = this.deploymentDraftService.getSavedFormSnapshot<Record<string, string>>(
          'slice',
          'function'
        );
        return this.formatContextTag(
          this.getRequirementState(requirementId),
          snapshot?.['name'] ?? snapshot?.['id']
        );
      }
      case 'vim': {
        const snapshot = this.deploymentDraftService.getSavedFormSnapshot<Record<string, string>>(
          'slice',
          'vim'
        );
        const detail = this.combineContextValues(snapshot?.['name'], snapshot?.['location']);
        return this.formatContextTag(this.getRequirementState(requirementId), detail);
      }
      case 'location': {
        const snapshot = this.deploymentDraftService.getSavedFormSnapshot<Record<string, string>>(
          'slice',
          'location'
        );
        return this.formatContextTag(this.getRequirementState(requirementId), snapshot?.['id']);
      }
      case 'k8s-credentials': {
        const snapshot = this.deploymentDraftService.getSavedFormSnapshot<Record<string, string>>(
          'k8s',
          'k8s-credentials'
        );
        return this.formatContextTag(this.getRequirementState(requirementId), snapshot?.['fileName']);
      }
      case 'k8s-cluster': {
        const snapshot = this.deploymentDraftService.getSavedFormSnapshot<Record<string, string>>(
          'k8s',
          'k8s-cluster'
        );
        const detail = this.combineContextValues(snapshot?.['name'], snapshot?.['namespace']);
        return this.formatContextTag(this.getRequirementState(requirementId), detail);
      }
      case 'proxmox-cluster': {
        const snapshot = this.deploymentDraftService.getSavedFormSnapshot<Record<string, string>>(
          'proxmox',
          'proxmox-cluster'
        );
        const detail = this.combineContextValues(snapshot?.['name'], snapshot?.['node']);
        return this.formatContextTag(this.getRequirementState(requirementId), detail);
      }
      default:
        return null;
    }
  }

  private getFinalConfigurationState(): DeploymentFormState {
    switch (this.selectedOption.id) {
      case 'slice':
        return this.deploymentDraftService.getFormState('slice', 'slice');
      case 'k8s':
        return this.deploymentDraftService.getFormState('k8s', 'k8s-deploy');
      case 'proxmox':
        return this.deploymentDraftService.getFormState('proxmox', 'proxmox-vm');
    }
  }

  private getFinalConfigurationDraftTarget():
    | { optionId: 'slice' | 'k8s' | 'proxmox'; formKey: 'slice' | 'k8s-deploy' | 'proxmox-vm' }
    | null {
    switch (this.selectedOption.id) {
      case 'slice':
        return { optionId: 'slice', formKey: 'slice' };
      case 'k8s':
        return { optionId: 'k8s', formKey: 'k8s-deploy' };
      case 'proxmox':
        return { optionId: 'proxmox', formKey: 'proxmox-vm' };
      default:
        return null;
    }
  }

  private buildFinalConfigurationContextTag(): string | null {
    switch (this.selectedOption.id) {
      case 'slice': {
        const snapshot = this.deploymentDraftService.getSavedFormSnapshot<Record<string, string>>(
          'slice',
          'slice'
        );
        const detail = this.combineContextValues(snapshot?.['nsName'], snapshot?.['coverage']);
        return this.formatContextTag(this.getFinalConfigurationState(), detail);
      }
      case 'k8s': {
        const snapshot = this.deploymentDraftService.getSavedFormSnapshot<Record<string, string>>(
          'k8s',
          'k8s-deploy'
        );
        const detail = this.combineContextValues(
          snapshot?.['nsName'],
          snapshot?.['vimAccountId']
        );
        return this.formatContextTag(this.getFinalConfigurationState(), detail);
      }
      case 'proxmox': {
        const snapshot = this.deploymentDraftService.getSavedFormSnapshot<Record<string, string>>(
          'proxmox',
          'proxmox-vm'
        );
        const detail = this.combineContextValues(
          snapshot?.['vmName'],
          snapshot?.['clusterName']
        );
        return this.formatContextTag(this.getFinalConfigurationState(), detail);
      }
    }
  }

  private formatContextTag(state: DeploymentFormState, detail?: string | null): string | null {
    const trimmedDetail = detail?.trim() ?? '';

    if (!trimmedDetail || state === 'missing') {
      return null;
    }

    return state === 'active' ? `Active: ${trimmedDetail}` : `Saved draft: ${trimmedDetail}`;
  }

  private combineContextValues(primary?: string | null, secondary?: string | null): string | null {
    const firstValue = primary?.trim() ?? '';
    const secondValue = secondary?.trim() ?? '';

    if (firstValue && secondValue) {
      return `${firstValue} / ${secondValue}`;
    }

    if (firstValue) {
      return firstValue;
    }

    return secondValue || null;
  }
}
