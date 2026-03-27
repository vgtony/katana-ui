import { ProxmoxVmCreationFormModel } from './interfaces/proxmox-vm-creation-form.interface';

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
