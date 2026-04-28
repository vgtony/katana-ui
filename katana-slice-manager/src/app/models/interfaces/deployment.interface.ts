export interface DeploymentRequirement {
  id: string;
  label: string;
  route: string;
  type: 'registration' | 'configuration';
  guidance: string;
}

export interface DeploymentOption {
  id: 'slice' | 'k8s' | 'proxmox' | 'proxmox-standalone';
  label: string;
  shortLabel: string;
  description: string;
  requirementsTitle: string;
  requirementsDescription: string;
  requirements: DeploymentRequirement[];
  finalConfigurationLabel: string;
  deployActionLabel: string;
}
