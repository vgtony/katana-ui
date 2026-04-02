import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
export class DeploymentPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly deploymentHistoryService = inject(DeploymentHistoryService);
  private readonly deploymentDraftService = inject(DeploymentDraftService);
  private restoredPackId: string | null = null;

  protected currentStep = 1;
  protected deploymentStarted = false;
  protected expandedRequirementIds = new Set<string>();
  protected completedRequirementIds = new Set<string>();
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

  constructor() {
    this.route.paramMap
      .pipe(takeUntilDestroyed())
      .subscribe((params) => {
        this.setSelectedOption(params.get('option'));
        this.restoreHistoryPackState();
      });

    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe((params) => {
        this.restoredPackId = params.get('packId');
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
  }

  protected isRequirementComplete(requirementId: string): boolean {
    return this.completedRequirementIds.has(requirementId);
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
    this.sliceConfigurationComplete = false;
    this.completedRequirementIds = new Set<string>();
    this.expandedRequirementIds = new Set<string>(
      this.selectedOption.requirements[0] ? [this.selectedOption.requirements[0].id] : []
    );
  }

  private restoreHistoryPackState(): void {
    if (!this.restoredPackId) {
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
    this.sliceConfigurationComplete = this.selectedOption.id === 'slice';
  }
}
