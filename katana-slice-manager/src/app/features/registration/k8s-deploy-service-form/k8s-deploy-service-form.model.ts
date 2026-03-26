export interface K8sDeployServiceFormModel {
  nfvoId: string;
  nsdId: string;
  nsName: string;
  nsDescription: string;
  vimAccountId: string;
}

export const initialK8sDeployServiceFormModel: K8sDeployServiceFormModel = {
  nfvoId: '',
  nsdId: '',
  nsName: '',
  nsDescription: 'default description',
  vimAccountId: ''
};
