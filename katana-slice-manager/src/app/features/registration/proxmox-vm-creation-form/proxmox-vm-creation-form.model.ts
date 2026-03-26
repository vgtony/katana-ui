export interface ProxmoxVmCreationFormModel {
  clusterName: string;
  vmName: string;
  template: string;
  cpu: number;
  ram: number;
  storageType: string;
  diskSize: number;
  managementBridgeName: string;
  managementBridgeType: string;
  customBridgeName: string;
  customBridgeType: string;
  customIp: string;
  customNetmask: string;
  customGateway: string;
}

export const initialProxmoxVmCreationFormModel: ProxmoxVmCreationFormModel = {
  clusterName: '',
  vmName: 'katana-vm-1',
  template: '101',
  cpu: 4,
  ram: 4096,
  storageType: 'local-lvm',
  diskSize: 20,
  managementBridgeName: 'vmbr0',
  managementBridgeType: 'management',
  customBridgeName: 'vmbr1',
  customBridgeType: 'custom',
  customIp: '192.168.10.10',
  customNetmask: '255.255.255.0',
  customGateway: '192.168.10.1'
};
