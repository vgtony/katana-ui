import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { combineLatest, Observable } from 'rxjs';
import { NfvoRegistrationFormComponent } from '../../features/registration/nfvo-registration-form/nfvo-registration-form.component';
import { FunctionRegistrationFormComponent } from '../../features/registration/function-registration-form/function-registration-form.component';
import { VimRegistrationFormComponent } from '../../features/registration/vim-registration-form/vim-registration-form.component';
import { LocationRegistrationFormComponent } from '../../features/registration/location-registration-form/location-registration-form.component';
import { K8sCredentialsUploadFormComponent } from '../../features/registration/k8s-credentials-upload-form/k8s-credentials-upload-form.component';
import { K8sClusterRegistrationFormComponent } from '../../features/registration/k8s-cluster-registration-form/k8s-cluster-registration-form.component';
import { K8sDeployServiceFormComponent } from '../../features/registration/k8s-deploy-service-form/k8s-deploy-service-form.component';
import { ProxmoxClusterRegistrationFormComponent } from '../../features/registration/proxmox-cluster-registration-form/proxmox-cluster-registration-form.component';
import { ProxmoxVmCreationFormComponent } from '../../features/registration/proxmox-vm-creation-form/proxmox-vm-creation-form.component';
import { SliceRegistrationFormComponent } from '../../features/registration/slice-registration-form/slice-registration-form.component';
import { DeploymentAttemptEvent } from '../../features/registration/proxmox-vm-creation-form/proxmox-vm-creation-form.component';
import {
  DeploymentFormKey,
  DeploymentFormState
} from '../../models/interfaces/deployment-draft.interface';
import { DeploymentPack, DeploymentPackStatus } from '../../models/interfaces/deployment-pack.interface';
import { DeploymentOption } from '../../models/interfaces/deployment.interface';
import {
  getApiErrorMessage,
  KubernetesApiService,
  ProxmoxApiService,
  SliceApiService
} from '../../shared/services/api';
import { DeploymentDraftService } from '../../shared/services/deployment-draft.service';
import { DeploymentHistoryService } from '../../shared/services/deployment-history.service';

type DeploymentInventoryKey = 'slice' | 'k8s' | 'proxmox';
type DeploymentStatusTone = 'success' | 'warning' | 'error' | 'neutral';

interface DeploymentInventoryColumn {
  key: string;
  label: string;
  valueKeys: string[];
}

type DeploymentInventoryRow = Record<string, string>;

interface DeploymentInventoryTableConfig {
  fallbackPrimaryValue: string;
  columns: DeploymentInventoryColumn[];
}

interface DeploymentInventorySection {
  key: DeploymentInventoryKey;
  title: string;
  emptyLabel: string;
  loading: boolean;
  error: string | null;
  columns: DeploymentInventoryColumn[];
  rows: DeploymentInventoryRow[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly deploymentHistoryService = inject(DeploymentHistoryService);
  private readonly deploymentDraftService = inject(DeploymentDraftService);
  private readonly sliceApiService = inject(SliceApiService);
  private readonly kubernetesApiService = inject(KubernetesApiService);
  private readonly proxmoxApiService = inject(ProxmoxApiService);
  private restoredPackId: string | null = null;
  private keepModalOpenAfterRouteClear = false;

  protected currentStep = 1;
  protected deploymentStarted = false;
  protected expandedInventorySectionKeys = new Set<DeploymentInventoryKey>([
    'slice',
    'k8s',
    'proxmox'
  ]);
  protected expandedRequirementIds = new Set<string>();
  protected completedRequirementIds = new Set<string>();
  protected failedRequirementIds = new Set<string>();
  protected requirementContextTags: Partial<Record<string, string>> = {};
  protected pendingRequirementDeactivationId: string | null = null;
  protected pendingConfigurationDeactivation = false;
  protected sliceConfigurationComplete = false;
  protected lastDeploymentStatus: DeploymentPackStatus = 'done';
  protected isNewDeploymentModalOpen = false;
  protected selectedRouteOptionId: DeploymentOption['id'] | null = null;

  protected readonly deploymentOptions: DeploymentOption[] = [
    {
      id: 'slice',
      label: 'Slice / OpenStack',
      shortLabel: 'Slice',
      description: 'OpenStack-backed slice deployment.',
      requirementsTitle: 'Slice registrations',
      requirementsDescription: 'Finish the registrations, then deploy.',
      requirements: [
        {
          id: 'nfvo',
          label: 'NFVO',
          route: '/deployment/slice',
          type: 'registration',
          guidance: 'Register the orchestrator.'
        },
        {
          id: 'location',
          label: 'Location',
          route: '/deployment/slice',
          type: 'registration',
          guidance: 'Set the target location.'
        },
        {
          id: 'function',
          label: 'Function',
          route: '/deployment/slice',
          type: 'registration',
          guidance: 'Register the function package.'
        },
        {
          id: 'vim',
          label: 'VIM',
          route: '/deployment/slice',
          type: 'registration',
          guidance: 'Register the infrastructure target.'
        }
      ],
      finalConfigurationLabel: 'Slice configuration',
      deployActionLabel: 'Deploy Slice'
    },
    {
      id: 'k8s',
      label: 'K8s Deploy',
      shortLabel: 'K8s',
      description: 'Kubernetes deployment flow.',
      requirementsTitle: 'K8s registrations',
      requirementsDescription: 'Finish the registrations, then deploy.',
      requirements: [
        {
          id: 'k8s-credentials',
          label: 'K8s Credentials',
          route: '/deployment/k8s',
          type: 'registration',
          guidance: 'Upload cluster access credentials.'
        },
        {
          id: 'k8s-cluster',
          label: 'K8s Cluster',
          route: '/deployment/k8s',
          type: 'registration',
          guidance: 'Register the cluster target.'
        }
      ],
      finalConfigurationLabel: 'K8s deployment configuration',
      deployActionLabel: 'Deploy To K8s'
    },
    {
      id: 'proxmox',
      label: 'Proxmox VM',
      shortLabel: 'Proxmox',
      description: 'Proxmox virtual machine deployment.',
      requirementsTitle: 'Proxmox registrations',
      requirementsDescription: 'Finish the registration, then deploy.',
      requirements: [
        {
          id: 'proxmox-cluster',
          label: 'Proxmox Cluster',
          route: '/deployment/proxmox',
          type: 'registration',
          guidance: 'Register the cluster target.'
        }
      ],
      finalConfigurationLabel: 'Proxmox VM configuration',
      deployActionLabel: 'Deploy VM'
    }
  ];

  protected readonly inventorySections: DeploymentInventorySection[] = [
    {
      key: 'slice',
      title: 'Slices',
      emptyLabel: 'No slices have been created yet.',
      loading: true,
      error: null,
      columns: [
        { key: 'name', label: 'Name', valueKeys: ['name', 'ns_name', 'slice_name', 'id', '_id', 'uuid', 'slice_id', 'nsi_id'] },
        { key: 'status', label: 'Status', valueKeys: ['status', 'state'] },
        { key: 'coverage', label: 'Coverage', valueKeys: ['coverage'] },
        { key: 'location', label: 'Location', valueKeys: ['location'] }
      ],
      rows: []
    },
    {
      key: 'k8s',
      title: 'K8s Clusters',
      emptyLabel: 'No Kubernetes clusters have been registered yet.',
      loading: true,
      error: null,
      columns: [
        { key: 'name', label: 'Name', valueKeys: ['name', 'id', '_id', 'uuid'] },
        { key: 'namespace', label: 'Namespace', valueKeys: ['namespace'] },
        { key: 'version', label: 'Version', valueKeys: ['k8s_version', 'version'] },
        { key: 'vimAccount', label: 'VIM Account', valueKeys: ['vim_account', 'vimAccount'] },
        { key: 'endpoint', label: 'Endpoint', valueKeys: ['nfvo_ip', 'endpoint', 'url'] }
      ],
      rows: []
    },
    {
      key: 'proxmox',
      title: 'Proxmox Clusters',
      emptyLabel: 'No Proxmox clusters have been registered yet.',
      loading: true,
      error: null,
      columns: [
        { key: 'name', label: 'Name', valueKeys: ['name', '_id', 'id'] },
        { key: 'node', label: 'Node', valueKeys: ['node'] },
        { key: 'status', label: 'Status', valueKeys: ['status'] },
        { key: 'url', label: 'URL', valueKeys: ['url'] },
        { key: 'username', label: 'Username', valueKeys: ['username'] }
      ],
      rows: []
    }
  ];

  protected selectedOption = this.deploymentOptions[0];

  ngOnInit(): void {
    this.loadCurrentDeployments();

    combineLatest([this.route.paramMap, this.route.queryParamMap])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([params, queryParams]) => {
        this.restoredPackId = queryParams.get('packId');
        this.setSelectedOption(params.get('option'));
        this.restoreHistoryPackState();
      });
  }

  protected openNewDeploymentModal(): void {
    this.openDeploymentChooser();
  }

  protected closeNewDeploymentModal(): void {
    this.keepModalOpenAfterRouteClear = false;

    if (this.selectedRouteOptionId) {
      void this.router.navigate(['/deployment']);
      return;
    }

    this.isNewDeploymentModalOpen = false;
  }

  protected chooseDeploymentOption(optionId: DeploymentOption['id']): void {
    void this.router.navigate(['/deployment', optionId]);
  }

  protected returnToDeploymentChooser(): void {
    this.openDeploymentChooser();
  }

  protected hasSelectedDeploymentOption(): boolean {
    return this.selectedRouteOptionId !== null;
  }

  protected getWizardStepNumbers(): number[] {
    return Array.from({ length: this.selectedOption.requirements.length + 1 }, (_, index) => index + 1);
  }

  protected isStatusColumn(columnKey: string): boolean {
    return columnKey === 'status';
  }

  protected getStatusTone(value: string): DeploymentStatusTone {
    const normalizedValue = value.trim().toLowerCase();

    if (!normalizedValue || normalizedValue === '—') {
      return 'neutral';
    }

    if (
      normalizedValue.includes('active') ||
      normalizedValue.includes('running') ||
      normalizedValue.includes('online') ||
      normalizedValue.includes('ready') ||
      normalizedValue.includes('healthy') ||
      normalizedValue.includes('done') ||
      normalizedValue.includes('success')
    ) {
      return 'success';
    }

    if (
      normalizedValue.includes('provision') ||
      normalizedValue.includes('pending') ||
      normalizedValue.includes('starting') ||
      normalizedValue.includes('creating') ||
      normalizedValue.includes('deploying') ||
      normalizedValue.includes('warning')
    ) {
      return 'warning';
    }

    if (
      normalizedValue.includes('error') ||
      normalizedValue.includes('fail') ||
      normalizedValue.includes('offline') ||
      normalizedValue.includes('degraded') ||
      normalizedValue.includes('stopped') ||
      normalizedValue.includes('inactive')
    ) {
      return 'error';
    }

    return 'neutral';
  }

  protected toggleInventorySection(key: DeploymentInventoryKey): void {
    if (this.expandedInventorySectionKeys.has(key)) {
      this.expandedInventorySectionKeys.delete(key);
      return;
    }

    this.expandedInventorySectionKeys.add(key);
  }

  protected isInventorySectionExpanded(key: DeploymentInventoryKey): boolean {
    return this.expandedInventorySectionKeys.has(key);
  }

  protected isDeployWizardStep(step: number): boolean {
    return step === this.getDeployStepNumber();
  }

  protected getWizardStepLabel(step: number): string {
    if (this.isDeployWizardStep(step)) {
      return 'Deploy';
    }

    return this.selectedOption.requirements[step - 1]?.label ?? '';
  }

  protected isWizardStepActive(step: number): boolean {
    return this.currentStep === step;
  }

  protected isWizardStepComplete(step: number): boolean {
    if (this.isDeployWizardStep(step)) {
      return this.deploymentStarted;
    }

    const requirement = this.selectedOption.requirements[step - 1];
    return requirement ? this.isRequirementComplete(requirement.id) : false;
  }

  protected isWizardStepError(step: number): boolean {
    if (this.isDeployWizardStep(step)) {
      return false;
    }

    const requirement = this.selectedOption.requirements[step - 1];
    return requirement ? this.failedRequirementIds.has(requirement.id) : false;
  }

  protected isWizardStepAccessible(step: number): boolean {
    if (step <= 1) {
      return true;
    }

    if (this.isDeployWizardStep(step)) {
      return this.canAccessStepTwo();
    }

    const previousRequirement = this.selectedOption.requirements[step - 2];
    return previousRequirement ? this.isRequirementComplete(previousRequirement.id) : false;
  }

  protected selectWizardStep(step: number): void {
    if (!this.isWizardStepAccessible(step)) {
      return;
    }

    this.currentStep = step;
    this.deploymentStarted = false;
  }

  protected getCurrentRequirement() {
    if (this.isDeployWizardStep(this.currentStep)) {
      return null;
    }

    return this.selectedOption.requirements[this.currentStep - 1] ?? null;
  }

  private setSelectedOption(optionId: string | null): void {
    const option = this.deploymentOptions.find((item) => item.id === optionId);

    if (!option) {
      this.selectedRouteOptionId = null;
      this.isNewDeploymentModalOpen = this.keepModalOpenAfterRouteClear;
      this.keepModalOpenAfterRouteClear = false;
      this.selectedOption = this.deploymentOptions[0];
      this.resetStepState();
      return;
    }

    this.keepModalOpenAfterRouteClear = false;
    this.selectedRouteOptionId = option.id;
    this.isNewDeploymentModalOpen = true;
    this.selectedOption = option;
    this.resetStepState();
  }

  private openDeploymentChooser(): void {
    this.selectedRouteOptionId = null;
    this.selectedOption = this.deploymentOptions[0];
    this.isNewDeploymentModalOpen = true;
    this.resetStepState();
  }

  protected goToStep(step: number): void {
    this.selectWizardStep(step);
  }

  protected moveToReview(): void {
    if (!this.isStepOneComplete()) {
      return;
    }

    this.currentStep = 2;
    this.deploymentStarted = false;
  }

  protected canAccessStepTwo(): boolean {
    return this.selectedOption.requirements.every((requirement) =>
      this.isRequirementComplete(requirement.id)
    );
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
    this.failedRequirementIds.delete(requirementId);
    this.refreshRequirementContextTags();

    if (requirementId === 'k8s-cluster' || requirementId === 'proxmox-cluster') {
      this.loadCurrentDeployments();
    }

    this.moveToNextWizardStepIfAvailable(requirementId);
  }

  protected isRequirementComplete(requirementId: string): boolean {
    return this.isRequirementActive(requirementId);
  }

  protected markRequirementFailed(requirementId: string): void {
    this.failedRequirementIds.add(requirementId);
  }

  protected isRequirementError(requirementId: string): boolean {
    return this.failedRequirementIds.has(requirementId);
  }

  protected getRequirementStatusLabel(requirementId: string): string {
    if (this.isRequirementComplete(requirementId)) {
      return 'Active';
    }

    if (this.isRequirementError(requirementId)) {
      return 'Error';
    }

    return 'Pending';
  }

  protected getRequirementContextTag(requirementId: string): string | null {
    return this.requirementContextTags[requirementId] ?? null;
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
    this.failedRequirementIds.delete(requirementId);
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
      this.isRequirementComplete(requirement.id)
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

  protected handleSliceCreated(): void {
    this.loadCurrentDeployments();
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
    this.failedRequirementIds = new Set<string>();
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
    this.currentStep = this.canAccessStepTwo() ? this.getDeployStepNumber() : this.getFirstIncompleteRequirementStep();
    this.deploymentStarted = false;
    this.pendingRequirementDeactivationId = null;
    this.pendingConfigurationDeactivation = false;
    this.sliceConfigurationComplete = this.selectedOption.id === 'slice';
    this.failedRequirementIds = new Set<string>();
    this.syncSavedState();
    this.refreshRequirementContextTags();
  }

  private syncSavedState(): void {
    const savedActiveRequirementIds = this.selectedOption.requirements
      .filter((requirement) => this.getRequirementState(requirement.id) === 'active')
      .map((requirement) => requirement.id);

    this.completedRequirementIds = new Set([...this.completedRequirementIds, ...savedActiveRequirementIds]);

    if (this.selectedOption.id === 'slice' && this.getFinalConfigurationState() === 'active') {
      this.sliceConfigurationComplete = true;
    }

    if (!this.isWizardStepAccessible(this.currentStep)) {
      this.currentStep = this.canAccessStepTwo()
        ? this.getDeployStepNumber()
        : this.getFirstIncompleteRequirementStep();
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

  private loadCurrentDeployments(): void {
    this.loadInventorySection('slice', this.sliceApiService.getSlices(), {
      fallbackPrimaryValue: 'Created slice',
      columns: this.getInventorySection('slice').columns
    });
    this.loadInventorySection('k8s', this.kubernetesApiService.getK8sClusters(), {
      fallbackPrimaryValue: 'Registered K8s cluster',
      columns: this.getInventorySection('k8s').columns
    });
    this.loadInventorySection('proxmox', this.proxmoxApiService.getClusters(), {
      fallbackPrimaryValue: 'Registered Proxmox cluster',
      columns: this.getInventorySection('proxmox').columns
    });
  }

  private getDeployStepNumber(): number {
    return this.selectedOption.requirements.length + 1;
  }

  private getFirstIncompleteRequirementStep(): number {
    const index = this.selectedOption.requirements.findIndex(
      (requirement) => !this.isRequirementComplete(requirement.id)
    );

    return index === -1 ? this.getDeployStepNumber() : index + 1;
  }

  private moveToNextWizardStepIfAvailable(requirementId: string): void {
    const currentRequirement = this.getCurrentRequirement();

    if (!currentRequirement || currentRequirement.id !== requirementId) {
      return;
    }

    const currentRequirementIndex = this.selectedOption.requirements.findIndex(
      (requirement) => requirement.id === requirementId
    );

    if (currentRequirementIndex === -1) {
      return;
    }

    const nextStep = currentRequirementIndex + 2;

    if (this.isWizardStepAccessible(nextStep)) {
      this.currentStep = nextStep;
    }
  }

  private loadInventorySection(
    key: DeploymentInventoryKey,
    request$: Observable<unknown[]>,
    config: DeploymentInventoryTableConfig
  ): void {
    const section = this.getInventorySection(key);
    section.loading = true;
    section.error = null;

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (items) => {
        section.rows = this.mapInventoryRows(items, config);
        section.loading = false;
      },
      error: (error: unknown) => {
        section.rows = [];
        section.loading = false;
        section.error = getApiErrorMessage(error, `Unable to load ${section.title.toLowerCase()}.`);
      }
    });
  }

  private getInventorySection(key: DeploymentInventoryKey): DeploymentInventorySection {
    const section = this.inventorySections.find((item) => item.key === key);

    if (!section) {
      throw new Error(`Inventory section ${key} not found.`);
    }

    return section;
  }

  private mapInventoryRows(
    items: unknown[],
    config: DeploymentInventoryTableConfig
  ): DeploymentInventoryRow[] {
    return items.map((item) => this.mapInventoryRow(item, config));
  }

  private mapInventoryRow(
    item: unknown,
    config: DeploymentInventoryTableConfig
  ): DeploymentInventoryRow {
    const defaultRow = Object.fromEntries(
      config.columns.map((column) => [column.key, '—'])
    ) as DeploymentInventoryRow;

    if (!isRecord(item)) {
      defaultRow[config.columns[0]?.key ?? 'name'] = this.toDisplayValue(item) ?? config.fallbackPrimaryValue;
      return defaultRow;
    }

    for (const [index, column] of config.columns.entries()) {
      const value = this.pickFirstValue(item, column.valueKeys);

      if (value) {
        defaultRow[column.key] = value;
        continue;
      }

      if (index === 0) {
        defaultRow[column.key] = config.fallbackPrimaryValue;
      }
    }

    return defaultRow;
  }

  private pickFirstValue(record: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
      const value = this.toDisplayValue(record[key]);

      if (value) {
        return value;
      }
    }

    return null;
  }
  private toDisplayValue(value: unknown): string | null {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed || null;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    if (Array.isArray(value)) {
      const items = value
        .map((entry) => this.toDisplayValue(entry))
        .filter((entry): entry is string => Boolean(entry));

      return items.length ? items.join(', ') : null;
    }

    return null;
  }
}
