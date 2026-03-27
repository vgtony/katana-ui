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
