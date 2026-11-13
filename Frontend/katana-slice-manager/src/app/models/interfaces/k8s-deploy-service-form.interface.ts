export interface K8sDeployServiceFormModel {
  nestRequired?: boolean;
  requestId?: string;
  nfvoId: string;
  nsdId: string;
  nsName: string;
  nsDescription: string;
  vimAccountId: string;
}
