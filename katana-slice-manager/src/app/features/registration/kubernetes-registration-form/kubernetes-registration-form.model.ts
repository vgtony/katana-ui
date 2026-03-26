export interface KubernetesRegistrationFormModel {
  clusterName: string;
  apiServer: string;
  namespace: string;
  serviceAccount: string;
  kubeconfigSecret: string;
}

export const initialKubernetesRegistrationFormModel: KubernetesRegistrationFormModel = {
  clusterName: '',
  apiServer: 'https://k8s.example:6443',
  namespace: 'slice-manager',
  serviceAccount: 'katana-orchestrator',
  kubeconfigSecret: ''
};
