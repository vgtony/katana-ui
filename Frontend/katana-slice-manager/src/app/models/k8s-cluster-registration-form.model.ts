import { K8sClusterRegistrationFormModel } from './interfaces/k8s-cluster-registration-form.interface';

export const initialK8sClusterRegistrationFormModel: K8sClusterRegistrationFormModel = {
  schemaVersion: '1.0',
  credentials: '',
  schemaType: 'k8scluster',
  name: '',
  description: '',
  nfvoId: '',
  vimAccount: '',
  k8sVersion: 'v1.30.7',
  k8sNet1: '',
  namespace: 'default',
  jujuBundle: true,
  helmChartV3: true,
};
