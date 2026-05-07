import { ProxmoxVmCreationFormModel } from './interfaces/proxmox-vm-creation-form.interface';

export const initialProxmoxVmCreationFormModel: ProxmoxVmCreationFormModel = {
  clusterName: '',
  vmName: 'katana-vm-1',
  template: '',
  isoImage: '',
  start: false,
  cpu: 4,
  ram: 4096,
  storageType: 'local-lvm',
  diskSize: 20,
  vmTargets: [],
  managementBridgeName: 'vmbr0',
  managementBridgeType: 'management',
  customBridgeName: '',
  customBridgeType: '',
  customIp: '',
  customNetmask: '',
  customGateway: ''
};
