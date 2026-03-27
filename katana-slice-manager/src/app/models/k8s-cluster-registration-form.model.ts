import { K8sClusterRegistrationFormModel } from './interfaces/k8s-cluster-registration-form.interface';

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
