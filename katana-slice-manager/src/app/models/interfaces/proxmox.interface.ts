export type ProxmoxClusterStatus = 'online' | 'offline';

export interface ProxmoxClusterResponse {
  _id: string;
  name: string;
  url: string;
  username: string;
  node: string;
  status: ProxmoxClusterStatus;
}

export interface ProxmoxClusterRegistrationResponse {
  message: string;
  cluster_id: string;
}

export interface ProxmoxDeleteClusterResponse {
  message: string;
}

export interface ProxmoxBridgeConfig {
  name: string;
  type: string;
  ip?: string;
  netmask?: string;
  gateway?: string;
}

export interface ProxmoxVmConfig {
  name: string;
  template?: string;
  cpu: number;
  ram: number;
  storage_type: string;
  disk_size: number;
  start?: boolean;
  bridges: ProxmoxBridgeConfig[];
}

export interface ProxmoxVmDeploymentRequest {
  cluster_id?: string;
  cluster_name?: string;
  node?: string;
  vms: ProxmoxVmConfig[];
}

export interface ProxmoxVmNetworkSummary {
  name: string;
  type: string;
  ip?: string;
  gateway?: string;
}

export interface ProxmoxVmSummary {
  vm_name: string;
  vm_id: number;
  template: string;
  cpu: number;
  ram: number;
  disk_size: number;
  status: string;
  cluster: string;
  networks: ProxmoxVmNetworkSummary[];
}

export interface ProxmoxVmDeploymentResponse {
  message: string;
  deployment_status: string;
  estimated_time: string;
  vms: ProxmoxVmSummary[];
}

export interface ProxmoxNodesRequest {
  cluster_id?: string;
  cluster_name?: string;
  name?: string;
  url?: string;
  username?: string;
  password?: string;
  verify_ssl?: boolean;
  node?: string;
}

export interface ProxmoxNodesResponse {
  cluster: string;
  nodes: Array<string | Record<string, unknown>>;
}

export interface ProxmoxProvisionResult {
  name: string;
  vmid: number;
  template: number | null;
  source: string;
  node: string;
  status: string;
  started: boolean;
  clone_task?: string | null;
  create_task?: string | null;
  start_task?: string | null;
  warnings?: string[];
  bridges: ProxmoxBridgeConfig[];
}

export interface ProxmoxProvisionResponse {
  cluster: string;
  node: string;
  vm_count: number;
  results: ProxmoxProvisionResult[];
}

export interface ProxmoxListVmsResponse {
  cluster: string;
  node: string;
  vms: unknown[];
}
