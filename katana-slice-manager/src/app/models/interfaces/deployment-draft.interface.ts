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
  | 'proxmox-standalone';

export type DeploymentFormSnapshots = Partial<Record<DeploymentFormKey, unknown>>;

export type DeploymentFormState = 'missing' | 'draft' | 'active';
