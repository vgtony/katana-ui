import { K8sOperation } from './k8s-operation.interface';
import { DeploymentOption } from './deployment.interface';
import { DeploymentFormSnapshots } from './deployment-draft.interface';

export interface DeploymentPackRequirement {
  id: string;
  label: string;
  status: 'done';
}

export type DeploymentPackStatus = 'accepted' | 'unknown' | 'done' | 'failed';

export interface DeploymentPack {
  id: string;
  name: string;
  optionId: DeploymentOption['id'];
  optionLabel: string;
  shortLabel: string;
  status: DeploymentPackStatus;
  errorType?: string;
  osmResponse?: unknown;
  operationId?: string;
  operation?: K8sOperation;
  completedAt: string;
  finalConfigurationLabel: string;
  requirements: DeploymentPackRequirement[];
  formSnapshots?: DeploymentFormSnapshots;
}
