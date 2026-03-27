import { ProxmoxRegistrationFormModel } from '../../../models/interfaces/proxmox-registration-form.interface';

export const initialProxmoxRegistrationFormModel: ProxmoxRegistrationFormModel = {
  clusterName: '',
  nodeEndpoint: 'https://proxmox.example:8006',
  tokenId: 'katana@pve!manager',
  secret: '',
  resourcePool: 'privateer-slices'
};
