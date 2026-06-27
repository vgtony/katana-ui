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
  cluster_id: string;
  cluster_name: string;
  datacenters: ProxmoxDatacenterSummary[];
  nodes: Array<string | Record<string, unknown>>;
  servers: Array<string | Record<string, unknown>>;
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
  template?: string | number;
  cpu: number;
  ram: number;
  storage_type: string;
  disk_size: number;
  iso_image?: string;
  start?: boolean;
  bridges: ProxmoxBridgeConfig[];
}

export interface ProxmoxVmDeploymentRequest {
  cluster_id?: string;
  cluster_name?: string;
  node?: string;
  vms: ProxmoxVmConfig[];
}

export interface ProxmoxDatacenterSummary {
  id: string;
  name: string;
  node_count: number;
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

export interface ProxmoxConnectRequest {
  cluster_id: string;
  datacenter_id?: string;
  datacenter_name?: string;
}

export interface ProxmoxConnectResponse {
  selected_datacenter: {
    id: string;
    name: string;
  };
  nodes: Array<string | Record<string, unknown>>;
  servers: Array<string | Record<string, unknown>>;
}

export interface ProxmoxOverviewRequest {
  cluster_id: string;
}

export interface ProxmoxResourceBlock {
  used?: number;
  total?: number;
  free?: number;
  used_percent?: number;
  free_percent?: number;
  used_human?: string;
  total_human?: string;
  free_human?: string;
  used_cores_estimate?: number;
  total_cores?: number;
  free_cores_estimate?: number;
}

export interface ProxmoxStorageOption {
  storage: string;
  node: string;
  type?: string;
  status?: string;
  content?: string;
  maximum_load?: number;
  maximum_load_human?: string;
  used?: number;
  used_human?: string;
  used_percent?: number;
  remaining?: number;
  remaining_human?: string;
  remaining_percent?: number;
}

export interface ProxmoxOverviewServer {
  name: string;
  status: string;
  uptime_seconds?: number;
  storage_options?: ProxmoxStorageOption[];
  usage: {
    cpu: ProxmoxResourceBlock;
    memory: ProxmoxResourceBlock;
    disk: ProxmoxResourceBlock;
  };
  remaining_resources?: {
    cpu: ProxmoxResourceBlock;
    memory: ProxmoxResourceBlock;
    disk: ProxmoxResourceBlock;
  };
}

export interface ProxmoxOverviewVm {
  vmid: number;
  name: string;
  node: string;
  status: string;
  template: boolean;
  uptime_seconds?: number;
  usage: {
    cpu: ProxmoxResourceBlock;
    memory: ProxmoxResourceBlock;
    disk: ProxmoxResourceBlock;
  };
  allocated_resources?: {
    cpu: ProxmoxResourceBlock;
    memory: ProxmoxResourceBlock;
    disk: ProxmoxResourceBlock;
  };
}

export interface ProxmoxOverviewResponse {
  clusters: Array<{
    id?: string;
    name?: string;
    summary?: {
      node_count?: number;
      online_node_count?: number;
      vm_count?: number;
      running_vm_count?: number;
    };
  }>;
  servers: ProxmoxOverviewServer[];
  vms: ProxmoxOverviewVm[];
  usage: {
    physical_resources: {
      cpu: ProxmoxResourceBlock;
      memory: ProxmoxResourceBlock;
      disk: ProxmoxResourceBlock;
    };
    vm_resources: {
      cpu: ProxmoxResourceBlock & { allocated_cores?: number };
      memory: ProxmoxResourceBlock & { label?: string };
      disk: ProxmoxResourceBlock & { label?: string };
    };
  };
  remaining_resources?: {
    cluster?: {
      cpu: ProxmoxResourceBlock;
      memory: ProxmoxResourceBlock;
      disk: ProxmoxResourceBlock;
      storage_options?: ProxmoxStorageOption[];
    };
  };
}

export interface ProxmoxTasksRequest {
  cluster_id: string;
  node?: string;
  vmid?: number;
  limit?: number;
  statusfilter?: string;
  typefilter?: string;
}

export interface ProxmoxTask {
  node: string;
  upid: string;
  id?: string;
  type?: string;
  user?: string;
  status?: string;
  exitstatus?: string;
  starttime?: number;
  endtime?: number;
}

export interface ProxmoxTasksResponse {
  cluster: string;
  tasks: ProxmoxTask[];
  errors: Array<{ node: string; error: string }>;
}

export interface ProxmoxTaskLogRequest {
  cluster_id: string;
  node: string;
  upid: string;
}

export interface ProxmoxTaskLogResponse {
  cluster: string;
  node: string;
  upid: string;
  log: Array<Record<string, unknown> | string>;
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

export interface ProxmoxVmIpRequest {
  cluster_id?: string;
  cluster_name?: string;
  node: string;
  vmid: number;
}

export interface ProxmoxVmIpNetworkInterface {
  name: string;
  ipv4: string[];
}

export interface ProxmoxVmIpResponse {
  cluster: string;
  node: string;
  vmid: number;
  primary_ip: string | null;
  ip_addresses: string[];
  ip_status: 'pending' | 'ready';
  network_interfaces: ProxmoxVmIpNetworkInterface[];
  error: string | null;
}

export interface ProxmoxListVmsResponse {
  cluster: string;
  node: string;
  vms: unknown[];
}
