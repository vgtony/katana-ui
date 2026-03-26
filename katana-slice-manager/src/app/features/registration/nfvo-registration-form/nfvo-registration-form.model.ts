export interface NfvoRegistrationFormModel {
  id: string;
  name: string;
  nfvoip: string;
  nfvousername: string;
  nfvopassword: string;
  tenantname: string;
  type: string;
  version: string;
  description: string;
  configId: string;
  configNfvoUsername: string;
  configNfvoPassword: string;
  configNfvoIp: string;
  configTenantName: string;
}

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
