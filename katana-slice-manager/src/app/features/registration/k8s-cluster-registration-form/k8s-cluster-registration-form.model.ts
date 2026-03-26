export interface K8sClusterRegistrationFormModel {
  schemaVersion: string;
  credentials: string;
  schemaType: string;
  name: string;
  description: string;
  vimAccount: string;
  nfvoIp: string;
  nfvoUsername: string;
  nfvoPassword: string;
  k8sVersion: string;
  k8sNet1: string;
  namespace: string;
  jujuBundle: boolean;
  helmChartV3: boolean;
}

export const initialK8sClusterRegistrationFormModel: K8sClusterRegistrationFormModel = {
  schemaVersion: '1.0',
  credentials: 'creds.yaml',
  schemaType: 'k8scluster',
  name: '',
  description: '',
  vimAccount: '',
  nfvoIp: 'nbi.<osm-ip>.nip.io',
  nfvoUsername: 'admin',
  nfvoPassword: 'admin',
  k8sVersion: 'v1.30.7',
  k8sNet1: '',
  namespace: 'default',
  jujuBundle: true,
  helmChartV3: true
};
