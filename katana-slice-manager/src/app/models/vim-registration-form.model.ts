import { VimRegistrationFormModel } from './interfaces/vim-registration-form.interface';

export const initialVimRegistrationFormModel: VimRegistrationFormModel = {
  id: '',
  name: '',
  authUrl: 'http://<openstack-ip>:5000/v3/',
  username: 'admin',
  password: '',
  adminProjectName: 'admin',
  location: '',
  type: 'openstack',
  version: '2024.1/stable',
  description: '',
  infrastructureMonitoring: 'http://<openstack-ip>:9093/metrics',
  securityGroups: 'TBA'
};
