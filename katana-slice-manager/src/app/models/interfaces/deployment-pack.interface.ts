import { DeploymentOption } from './deployment.interface';

export interface DeploymentPackRequirement {
  id: string;
  label: string;
  status: 'done';
}

export interface DeploymentPack {
  id: string;
  name: string;
  optionId: DeploymentOption['id'];
  optionLabel: string;
  shortLabel: string;
  status: 'done';
  completedAt: string;
  finalConfigurationLabel: string;
  requirements: DeploymentPackRequirement[];
}
