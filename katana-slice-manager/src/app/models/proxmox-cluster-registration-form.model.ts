import { ProxmoxClusterRegistrationFormModel } from './interfaces/proxmox-cluster-registration-form.interface';

export const initialProxmoxClusterRegistrationFormModel: ProxmoxClusterRegistrationFormModel = {
  name: '',
  url: 'https://10.160.100.11:8006',
  username: 'root@pam',
  password: '',
  node: ''
};
