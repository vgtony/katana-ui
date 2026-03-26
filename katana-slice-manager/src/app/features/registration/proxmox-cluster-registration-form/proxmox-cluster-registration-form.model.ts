export interface ProxmoxClusterRegistrationFormModel {
  name: string;
  url: string;
  username: string;
  password: string;
  node: string;
}

export const initialProxmoxClusterRegistrationFormModel: ProxmoxClusterRegistrationFormModel = {
  name: '',
  url: 'https://10.160.100.11:8006',
  username: 'root@pam',
  password: '',
  node: ''
};
