export interface KubernetesRegistrationFormModel {
  clusterName: string;
  apiServer: string;
  namespace: string;
  serviceAccount: string;
  kubeconfigSecret: string;
}
