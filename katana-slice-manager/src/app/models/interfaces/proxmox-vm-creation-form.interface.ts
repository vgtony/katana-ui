export interface ProxmoxVmTargetFormModel {
  node: string;
  vmName: string;
  template: string;
  cpu: number;
  ram: number;
  storageType: string;
  diskSize: number;
}

export interface ProxmoxVmCreationFormModel {
  clusterName: string;
  vmName: string;
  template: string;
  cpu: number;
  ram: number;
  storageType: string;
  diskSize: number;
  vmTargets: ProxmoxVmTargetFormModel[];
  managementBridgeName: string;
  managementBridgeType: string;
  customBridgeName: string;
  customBridgeType: string;
  customIp: string;
  customNetmask: string;
  customGateway: string;
}
