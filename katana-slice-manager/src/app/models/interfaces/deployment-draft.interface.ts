import { DeploymentOption } from './deployment.interface';

export type DeploymentFormKey =
  | 'nfvo'
  | 'function'
  | 'vim'
  | 'location'
  | 'slice'
  | 'k8s-credentials'
  | 'k8s-cluster'
  | 'k8s-deploy'
  | 'proxmox-cluster'
  | 'proxmox-vm';

export type DeploymentFormSnapshots = Partial<Record<DeploymentFormKey, unknown>>;

export type DeploymentDraftMap = Partial<Record<DeploymentOption['id'], DeploymentFormSnapshots>>;

export type DeploymentFormState = 'missing' | 'draft' | 'active';
