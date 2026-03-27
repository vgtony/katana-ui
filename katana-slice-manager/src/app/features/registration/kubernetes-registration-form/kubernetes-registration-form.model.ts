import { KubernetesRegistrationFormModel } from '../../../models/interfaces/kubernetes-registration-form.interface';

export const initialKubernetesRegistrationFormModel: KubernetesRegistrationFormModel = {
  clusterName: '',
  apiServer: 'https://k8s.example:6443',
  namespace: 'slice-manager',
  serviceAccount: 'katana-orchestrator',
  kubeconfigSecret: ''
};
