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
  | 'proxmox-vm'
  | 'proxmox-standalone'
  | 'amari-slice';

export type DeploymentFormSnapshots = Partial<Record<DeploymentFormKey, unknown>>;

export type DeploymentFormState = 'missing' | 'draft' | 'active';
