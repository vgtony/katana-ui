export interface ProxmoxRegistrationFormModel {
  clusterName: string;
  nodeEndpoint: string;
  tokenId: string;
  secret: string;
  resourcePool: string;
}

export const initialProxmoxRegistrationFormModel: ProxmoxRegistrationFormModel = {
  clusterName: '',
  nodeEndpoint: 'https://proxmox.example:8006',
  tokenId: 'katana@pve!manager',
  secret: '',
  resourcePool: 'privateer-slices'
};
