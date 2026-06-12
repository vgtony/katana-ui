import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { combineLatest, finalize, Observable } from 'rxjs';
import { NfvoRegistrationFormComponent } from '../../features/registration/nfvo-registration-form/nfvo-registration-form.component';
import { FunctionRegistrationFormComponent } from '../../features/registration/function-registration-form/function-registration-form.component';
import { VimRegistrationFormComponent } from '../../features/registration/vim-registration-form/vim-registration-form.component';
import { LocationRegistrationFormComponent } from '../../features/registration/location-registration-form/location-registration-form.component';
import { K8sCredentialsUploadFormComponent } from '../../features/registration/k8s-credentials-upload-form/k8s-credentials-upload-form.component';
import { K8sClusterRegistrationFormComponent } from '../../features/registration/k8s-cluster-registration-form/k8s-cluster-registration-form.component';
import { K8sDeployServiceFormComponent } from '../../features/registration/k8s-deploy-service-form/k8s-deploy-service-form.component';
import { ProxmoxStandaloneRegistrationFormComponent } from '../../features/registration/proxmox-standalone-registration-form/proxmox-standalone-registration-form.component';
import { DeploymentAttemptEvent } from '../../features/registration/proxmox-vm-creation-form/proxmox-vm-creation-form.component';
import { SliceRegistrationFormComponent } from '../../features/registration/slice-registration-form/slice-registration-form.component';
import { AmarisoftSliceDeploymentFormComponent } from '../../features/registration/amarisoft-slice-deployment-form/amarisoft-slice-deployment-form.component';
import {
  DeploymentFormKey,
  DeploymentFormState
} from '../../models/interfaces/deployment-draft.interface';
import { DeploymentPack, DeploymentPackStatus } from '../../models/interfaces/deployment-pack.interface';
import { DeploymentOption } from '../../models/interfaces/deployment.interface';
import {
  getApiErrorMessage,
  AmarisoftSliceApiService,
  KubernetesApiService,
  SliceApiService
} from '../../shared/services/api';
import { DeploymentDraftService } from '../../shared/services/deployment-draft.service';
import { DeploymentHistoryService } from '../../shared/services/deployment-history.service';

type DeploymentInventoryKey = 'slice' | 'k8s' | 'amari';
type DeploymentStatusTone = 'success' | 'warning' | 'error' | 'neutral';
const INVENTORY_ROW_ID_KEY = '__inventoryRowId';

interface DeploymentInventoryColumn {
  key: string;
  label: string;
  valueKeys: string[];
}

type DeploymentInventoryRow = Record<string, string>;

interface DeploymentInventoryTableConfig {
  fallbackPrimaryValue: string;
  columns: DeploymentInventoryColumn[];
  identityValueKeys?: string[];
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
    ProxmoxStandaloneRegistrationFormComponent,
    SliceRegistrationFormComponent,
    AmarisoftSliceDeploymentFormComponent
  ],
  templateUrl: './deployment-page.component.html',
  styleUrl: './deployment-page.component.scss'
})
export class DeploymentPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly deploymentHistoryService = inject(DeploymentHistoryService);
  private readonly deploymentDraftService = inject(DeploymentDraftService);
  private readonly sliceApiService = inject(SliceApiService);
  private readonly amarisoftSliceApiService = inject(AmarisoftSliceApiService);
  private readonly kubernetesApiService = inject(KubernetesApiService);
  private restoredPackId: string | null = null;
  private keepModalOpenAfterRouteClear = false;

  protected currentStep = 1;
  protected deploymentStarted = false;
  protected expandedInventorySectionKeys = new Set<DeploymentInventoryKey>([
    'slice',
    'k8s',
    'amari'
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
  protected isDeploymentChooserOpen = false;
  protected selectedRouteOptionId: DeploymentOption['id'] | null = null;
  protected proxmoxServerViewMode: 'compact' | 'detail' = 'compact';
  protected selectedAmariSliceId: string | null = null;
  protected confirmingAmariSliceId: string | null = null;
  protected deletingAmariSliceId: string | null = null;
  protected amariDeleteError = '';

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
      id: 'proxmox-standalone',
      label: 'Proxmox',
      shortLabel: 'Proxmox',
      description: 'Standalone Proxmox discovery and VM deployment.',
      requirementsTitle: 'Proxmox standalone registration',
      requirementsDescription:
        'Authenticate once, choose a server, and deploy VMs through the standalone API.',
      requirements: [
        {
          id: 'proxmox-standalone',
          label: 'Standalone API',
          route: '/deployment/proxmox-standalone',
          type: 'registration',
          guidance: 'Authenticate against the standalone API and load the compact overview.'
        }
      ],
      finalConfigurationLabel: 'Proxmox VM deployment',
      deployActionLabel: 'Deploy VMs'
    },
    {
      id: 'amari',
      label: 'Amari',
      shortLabel: 'Amari',
      description: 'Amarisoft RAN and CORE network slice deployment.',
      requirementsTitle: 'Amari slice',
      requirementsDescription: 'Create, preview, save, and apply an Amari slice.',
      requirements: [],
      finalConfigurationLabel: 'Amari slice configuration',
      deployActionLabel: 'Apply Amari Slice'
    }
  ];

  protected inventorySections: DeploymentInventorySection[] = [
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
      key: 'amari',
      title: 'Amari Network Slices',
      emptyLabel: 'No Amari network slices have been created yet.',
      loading: true,
      error: null,
      columns: [
        { key: 'name', label: 'Name', valueKeys: ['name', 'slice_name', 'id', '_id', 'uuid', 'slice_id'] },
        { key: 'sNssai', label: 'S-NSSAI', valueKeys: ['s_nssai', 'sNssai'] },
        { key: 'plmn', label: 'PLMN', valueKeys: ['plmn'] },
        { key: 'dnn', label: 'DNN', valueKeys: ['dnn'] },
        { key: 'status', label: 'Status', valueKeys: ['status', 'state'] },
        { key: 'updatedAt', label: 'Updated', valueKeys: ['updated_at', 'updatedAt', 'modified_at'] }
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
        if (queryParams.get('modal') === 'chooser') {
          this.restoredPackId = null;
          this.openDeploymentChooser();
          return;
        }

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
    this.isDeploymentChooserOpen = false;

    if (this.selectedRouteOptionId) {
      void this.router.navigate(['/deployment']);
      return;
    }

    if (this.route.snapshot.queryParamMap.get('modal') === 'chooser') {
      void this.router.navigate(['/deployment'], { replaceUrl: true });
    }

    this.isNewDeploymentModalOpen = false;
  }

  protected chooseDeploymentOption(optionId: DeploymentOption['id']): void {
    this.keepModalOpenAfterRouteClear = false;
    this.isDeploymentChooserOpen = false;
    void this.router.navigate(['/deployment', optionId]);
  }

  protected returnToDeploymentChooser(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.keepModalOpenAfterRouteClear = true;
    this.selectedRouteOptionId = null;
    this.selectedOption = this.deploymentOptions[0];
    this.isNewDeploymentModalOpen = true;
    this.isDeploymentChooserOpen = true;
    this.resetStepState();
    this.changeDetectorRef.detectChanges();

    void this.router.navigate(['/deployment'], {
      replaceUrl: true,
      queryParams: { modal: 'chooser' }
    });
  }

  protected toggleProxmoxServerViewMode(): void {
    this.proxmoxServerViewMode =
      this.proxmoxServerViewMode === 'compact' ? 'detail' : 'compact';
  }

  protected setProxmoxServerViewMode(mode: 'compact' | 'detail'): void {
    this.proxmoxServerViewMode = mode;
  }

  protected hasSelectedDeploymentOption(): boolean {
    return this.selectedRouteOptionId !== null && !this.isDeploymentChooserOpen;
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

  protected isAmariInventorySection(section: DeploymentInventorySection): boolean {
    return section.key === 'amari';
  }

  protected getInventoryRowId(row: DeploymentInventoryRow): string {
    return row[INVENTORY_ROW_ID_KEY] ?? '';
  }

  protected selectAmariInventoryRow(row: DeploymentInventoryRow): void {
    const sliceId = this.getInventoryRowId(row);

    if (!sliceId || this.deletingAmariSliceId === sliceId) {
      return;
    }

    this.selectedAmariSliceId =
      this.selectedAmariSliceId === sliceId ? null : sliceId;
    this.confirmingAmariSliceId = null;
    this.amariDeleteError = '';
  }

  protected isAmariInventoryRowSelected(row: DeploymentInventoryRow): boolean {
    return this.selectedAmariSliceId === this.getInventoryRowId(row);
  }

  protected requestAmariSliceDelete(event: Event, row: DeploymentInventoryRow): void {
    event.stopPropagation();

    const sliceId = this.getInventoryRowId(row);

    if (!sliceId || this.deletingAmariSliceId === sliceId) {
      return;
    }

    this.selectedAmariSliceId = sliceId;
    this.confirmingAmariSliceId = sliceId;
    this.amariDeleteError = '';
  }

  protected cancelAmariSliceDelete(event: Event): void {
    event.stopPropagation();
    this.confirmingAmariSliceId = null;
  }

  protected isAmariSliceDeletePending(row: DeploymentInventoryRow): boolean {
    return this.confirmingAmariSliceId === this.getInventoryRowId(row);
  }

  protected isAmariSliceDeleting(row: DeploymentInventoryRow): boolean {
    return this.deletingAmariSliceId === this.getInventoryRowId(row);
  }

  protected confirmAmariSliceDelete(event: Event, row: DeploymentInventoryRow): void {
    event.stopPropagation();

    const sliceId = this.getInventoryRowId(row);

    if (!sliceId || this.deletingAmariSliceId) {
      return;
    }

    this.deletingAmariSliceId = sliceId;
    this.amariDeleteError = '';

    this.amarisoftSliceApiService
      .deleteSlice(sliceId)
      .pipe(
        finalize(() => {
          this.deletingAmariSliceId = null;
          this.changeDetectorRef.markForCheck();
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: () => {
          this.selectedAmariSliceId = null;
          this.confirmingAmariSliceId = null;
          this.loadAmariInventory();
        },
        error: (error: unknown) => {
          this.amariDeleteError = getApiErrorMessage(
            error,
            `Unable to delete Amari slice ${sliceId}.`
          );
        }
      });
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
      this.isDeploymentChooserOpen = this.isNewDeploymentModalOpen;
      this.keepModalOpenAfterRouteClear = false;
      this.selectedOption = this.deploymentOptions[0];
      this.resetStepState();
      return;
    }

    if (this.keepModalOpenAfterRouteClear) {
      return;
    }

    this.keepModalOpenAfterRouteClear = false;
    this.isDeploymentChooserOpen = false;
    this.selectedRouteOptionId = option.id;
    this.isNewDeploymentModalOpen = true;
    this.selectedOption = option;
    this.resetStepState();
  }

  private openDeploymentChooser(): void {
    this.selectedRouteOptionId = null;
    this.selectedOption = this.deploymentOptions[0];
    this.isNewDeploymentModalOpen = true;
    this.isDeploymentChooserOpen = true;
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
    this.deferRequirementStateUpdate(() => {
      this.completedRequirementIds.add(requirementId);
      this.failedRequirementIds.delete(requirementId);
      this.refreshRequirementContextTags();

      if (requirementId === 'k8s-cluster') {
        this.loadCurrentDeployments();
      }

      this.moveToNextWizardStepIfAvailable(requirementId);
    });
  }

  protected markEverythingDone(): void {
    this.completedRequirementIds = new Set(
      this.selectedOption.requirements.map((requirement) => requirement.id)
    );
    this.failedRequirementIds = new Set<string>();
    this.expandedRequirementIds = new Set<string>();
    this.pendingRequirementDeactivationId = null;
    this.pendingConfigurationDeactivation = false;
    this.deploymentStarted = false;
    this.sliceConfigurationComplete = this.selectedOption.id === 'slice';
    this.refreshRequirementContextTags();
    this.currentStep = this.getDeployStepNumber();
  }

  protected isRequirementComplete(requirementId: string): boolean {
    return this.completedRequirementIds.has(requirementId) || this.isRequirementActive(requirementId);
  }

  protected markRequirementFailed(requirementId: string): void {
    this.deferRequirementStateUpdate(() => {
      this.failedRequirementIds.add(requirementId);
    });
  }

  protected handleRequirementDeregistered(requirementId: string): void {
    this.deferRequirementStateUpdate(() => {
      const target = this.getRequirementDraftTarget(requirementId);

      if (target) {
        this.deploymentDraftService.clearForm(target.optionId, target.formKey);
      }

      this.completedRequirementIds.delete(requirementId);
      this.failedRequirementIds.delete(requirementId);
      this.pendingRequirementDeactivationId = null;
      this.pendingConfigurationDeactivation = false;
      this.deploymentStarted = false;
      this.currentStep = this.selectedOption.requirements.findIndex(
        (requirement) => requirement.id === requirementId
      ) + 1 || this.getFirstIncompleteRequirementStep();
      this.refreshRequirementContextTags();
    });
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
    this.proxmoxServerViewMode = 'compact';
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

    if (this.currentStep === 1 && this.canAccessStepTwo()) {
      this.currentStep = this.getDeployStepNumber();
      return;
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

  private deferRequirementStateUpdate(callback: () => void): void {
    queueMicrotask(() => {
      callback();
      this.changeDetectorRef.markForCheck();
    });
  }

  private getRequirementDraftTarget(
    requirementId: string
  ): { optionId: DeploymentOption['id']; formKey: DeploymentFormKey } | null {
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
      case 'proxmox-standalone':
        return {
          optionId: 'proxmox-standalone',
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
      case 'proxmox-standalone':
        return this.deploymentDraftService.getFormState(
          'proxmox-standalone',
          'proxmox-standalone'
        );
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
      case 'proxmox-standalone': {
        const snapshot = this.deploymentDraftService.getSavedFormSnapshot<Record<string, string>>(
          'proxmox-standalone',
          'proxmox-standalone'
        );
        const detail = this.combineContextValues(snapshot?.['name'], snapshot?.['url']);
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
      case 'proxmox-standalone':
        return this.deploymentDraftService.getFormState('proxmox-standalone', 'proxmox-vm');
      case 'amari':
        return this.deploymentDraftService.getFormState('amari', 'amari-slice');
      default:
        return 'missing';
    }
  }

  private getFinalConfigurationDraftTarget():
    | {
        optionId: DeploymentOption['id'];
        formKey: DeploymentFormKey;
      }
    | null {
    switch (this.selectedOption.id) {
      case 'slice':
        return { optionId: 'slice', formKey: 'slice' };
      case 'k8s':
        return { optionId: 'k8s', formKey: 'k8s-deploy' };
      case 'proxmox-standalone':
        return { optionId: 'proxmox-standalone', formKey: 'proxmox-vm' };
      case 'amari':
        return { optionId: 'amari', formKey: 'amari-slice' };
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
      case 'proxmox-standalone': {
        const snapshot = this.deploymentDraftService.getSavedFormSnapshot<Record<string, string>>(
          'proxmox-standalone',
          'proxmox-vm'
        );
        const detail = this.combineContextValues(snapshot?.['vmName'], snapshot?.['clusterName']);
        return this.formatContextTag(this.getFinalConfigurationState(), detail);
      }
      case 'amari': {
        const snapshot = this.deploymentDraftService.getSavedFormSnapshot<Record<string, string>>(
          'amari',
          'amari-slice'
        );
        const detail = this.combineContextValues(snapshot?.['name'], snapshot?.['dnn']);
        return this.formatContextTag(this.getFinalConfigurationState(), detail);
      }
      default:
        return null;
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
    this.loadAmariInventory();
    this.loadInventorySection('k8s', this.kubernetesApiService.getK8sClusters(), {
      fallbackPrimaryValue: 'Registered K8s cluster',
      columns: this.getInventorySection('k8s').columns
    });
  }

  private loadAmariInventory(): void {
    this.loadInventorySection('amari', this.amarisoftSliceApiService.getSlices(), {
      fallbackPrimaryValue: 'Amari network slice',
      columns: this.getInventorySection('amari').columns,
      identityValueKeys: ['slice_id', 'id', '_id', 'uuid', 'name']
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
    this.patchInventorySection(key, {
      ...section,
      loading: true,
      error: null
    });

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (items) => {
        this.patchInventorySection(key, {
          ...this.getInventorySection(key),
          rows: this.mapInventoryRows(items, config),
          loading: false,
          error: null
        });
      },
      error: (error: unknown) => {
        this.patchInventorySection(key, {
          ...this.getInventorySection(key),
          rows: [],
          loading: false,
          error: getApiErrorMessage(error, `Unable to load ${section.title.toLowerCase()}.`)
        });
      }
    });
  }

  private patchInventorySection(
    key: DeploymentInventoryKey,
    patch: DeploymentInventorySection
  ): void {
    this.inventorySections = this.inventorySections.map((section) =>
      section.key === key ? patch : section
    );
    this.changeDetectorRef.markForCheck();
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
      defaultRow[INVENTORY_ROW_ID_KEY] = this.toDisplayValue(item) ?? '';
      return defaultRow;
    }

    defaultRow[INVENTORY_ROW_ID_KEY] = this.pickFirstValue(
      item,
      config.identityValueKeys ?? ['id', '_id', 'uuid']
    ) ?? '';

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
      const value = this.toDisplayValue(this.getRecordValue(record, key));

      if (value) {
        return value;
      }
    }

    return null;
  }

  private getRecordValue(record: Record<string, unknown>, key: string): unknown {
    if (!key.includes('.')) {
      return record[key];
    }

    return key.split('.').reduce<unknown>((value, segment) => {
      if (!isRecord(value)) {
        return undefined;
      }

      return value[segment];
    }, record);
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

    if (isRecord(value)) {
      const sst = this.toDisplayValue(value['sst']);
      const sd = this.toDisplayValue(value['sd']);
      const mcc = this.toDisplayValue(value['mcc']);
      const mnc = this.toDisplayValue(value['mnc']);

      if (sst && sd) {
        return `${sst}/${sd}`;
      }

      if (mcc && mnc) {
        return `${mcc}-${mnc}`;
      }
    }

    return null;
  }
}
