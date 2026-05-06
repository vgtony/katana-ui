import { ProxmoxVmCreationFormModel } from './interfaces/proxmox-vm-creation-form.interface';

export const DEFAULT_PROXMOX_CUSTOM_BRIDGE_NAME = 'vmbr1:1601';

export const initialProxmoxVmCreationFormModel: ProxmoxVmCreationFormModel = {
  clusterName: '',
  vmName: 'katana-vm-1',
  template: '',
  cpu: 4,
  ram: 4096,
  storageType: 'local-lvm',
  diskSize: 20,
  vmTargets: [],
  managementBridgeName: 'vmbr0',
  managementBridgeType: 'management',
  customBridgeName: DEFAULT_PROXMOX_CUSTOM_BRIDGE_NAME,
  customBridgeType: '',
  customIp: '',
  customNetmask: '',
  customGateway: ''
};
