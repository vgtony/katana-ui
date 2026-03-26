export interface PqcSliceDeploymentFormModel {
  sliceFile: string;
  proxmoxFile: string;
  enablePqc: boolean;
  enableProxmox: boolean;
  ansibleControllerIp: string;
}

export const initialPqcSliceDeploymentFormModel: PqcSliceDeploymentFormModel = {
  sliceFile: 'slice.yaml',
  proxmoxFile: 'proxmox_vms.yaml',
  enablePqc: true,
  enableProxmox: false,
  ansibleControllerIp: '10.160.101.122'
};
