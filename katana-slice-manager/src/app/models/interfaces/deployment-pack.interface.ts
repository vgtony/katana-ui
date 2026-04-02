import { DeploymentOption } from './deployment.interface';
import { DeploymentFormSnapshots } from './deployment-draft.interface';

export interface DeploymentPackRequirement {
  id: string;
  label: string;
  status: 'done';
}

export type DeploymentPackStatus = 'done' | 'failed';

export interface DeploymentPack {
  id: string;
  name: string;
  optionId: DeploymentOption['id'];
  optionLabel: string;
  shortLabel: string;
  status: DeploymentPackStatus;
  errorType?: string;
  completedAt: string;
  finalConfigurationLabel: string;
  requirements: DeploymentPackRequirement[];
  formSnapshots?: DeploymentFormSnapshots;
}
