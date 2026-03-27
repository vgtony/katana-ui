import { NfvoRegistrationFormModel } from '../../../models/interfaces/nfvo-registration-form.interface';

export const initialNfvoRegistrationFormModel: NfvoRegistrationFormModel = {
  id: '',
  name: '',
  nfvoip: 'nbi.<osm-ip>.nip.io',
  nfvousername: 'admin',
  nfvopassword: 'admin',
  tenantname: 'admin',
  type: 'OSM',
  version: '',
  description: '',
  configId: '0',
  configNfvoUsername: 'admin',
  configNfvoPassword: 'admin',
  configNfvoIp: 'nbi.<osm-ip>.nip.io',
  configTenantName: 'admin'
};
