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

interface DeploymentRequirement {
  id: string;
  label: string;
  route: string;
  type: 'registration' | 'configuration';
  guidance: string;
}

interface DeploymentOption {
  id: 'slice' | 'k8s' | 'proxmox';
  label: string;
  shortLabel: string;
  description: string;
  requirementsTitle: string;
  requirementsDescription: string;
  requirements: DeploymentRequirement[];
  finalConfigurationLabel: string;
  deployActionLabel: string;
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
    ProxmoxRegistrationFormComponent,
    SliceRegistrationFormComponent
  ],
  templateUrl: './deployment-page.component.html',
  styleUrl: './deployment-page.component.scss'
})
export class DeploymentPageComponent {
  private readonly route = inject(ActivatedRoute);

  protected currentStep = 1;
  protected deploymentStarted = false;
  protected expandedRequirementIds = new Set<string>();
  protected completedRequirementIds = new Set<string>();
  protected sliceConfigurationComplete = false;

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
          route: '/registration/nfvo',
          type: 'registration',
          guidance: 'Register the orchestrator endpoint, credentials, and onboarding details that the slice deployment depends on.'
        },
        {
          id: 'function',
          label: 'Function',
          route: '/registration/function',
          type: 'registration',
          guidance: 'Keep the function package and its metadata ready here so the deployment request can reference the right service building blocks.'
        },
        {
          id: 'vim',
          label: 'VIM',
          route: '/registration/vim',
          type: 'registration',
          guidance: 'Capture the OpenStack or virtualized infrastructure target where the slice resources will ultimately be placed.'
        },
        {
          id: 'location',
          label: 'Location',
          route: '/registration/location',
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
      requirementsTitle: 'K8s registrations and configuration',
      requirementsDescription: 'Open the relevant registration forms to prepare everything needed for a K8s deployment.',
      requirements: [
        {
          id: 'k8s-credentials',
          label: 'K8s Credentials',
          route: '/registration/k8s-credentials',
          type: 'registration',
          guidance: 'Keep the cluster access credentials documented here so the future deploy request can reuse them directly.'
        },
        {
          id: 'k8s-cluster',
          label: 'K8s Cluster',
          route: '/registration/k8s-cluster',
          type: 'registration',
          guidance: 'Register the Kubernetes cluster target and its connectivity details for the deployment flow.'
        },
        {
          id: 'k8s-deploy',
          label: 'K8s Deploy',
          route: '/registration/k8s-deploy',
          type: 'configuration',
          guidance: 'Collect the runtime deployment settings here so Step 2 can later send the full payload in a single POST request.'
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
      requirementsTitle: 'Proxmox registrations and configuration',
      requirementsDescription: 'Use the existing Proxmox forms as references before confirming the VM deployment setup.',
      requirements: [
        {
          id: 'proxmox-cluster',
          label: 'Proxmox Cluster',
          route: '/registration/proxmox-cluster',
          type: 'registration',
          guidance: 'Register the Proxmox cluster and connectivity details that the VM deployment will target.'
        },
        {
          id: 'proxmox-vms',
          label: 'Proxmox VMs',
          route: '/registration/proxmox-vms',
          type: 'configuration',
          guidance: 'Keep the VM sizing, image, and placement details here so the deploy request can include the complete VM plan.'
        },
        {
          id: 'proxmox-legacy',
          label: 'Proxmox Legacy',
          route: '/registration/proxmox',
          type: 'registration',
          guidance: 'Retain the legacy Proxmox registration context when this deployment still depends on that older integration path.'
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
      .subscribe((params) => this.setSelectedOption(params.get('option')));
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

  protected deploy(): void {
    this.deploymentStarted = true;
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
}
