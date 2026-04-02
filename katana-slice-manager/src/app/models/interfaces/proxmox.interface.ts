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
  template: string;
  cpu: number;
  ram: number;
  storage_type: string;
  disk_size: number;
  bridges: ProxmoxBridgeConfig[];
}

export interface ProxmoxVmDeploymentRequest {
  cluster_id?: string;
  cluster_name?: string;
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
