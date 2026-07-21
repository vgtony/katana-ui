import { K8sDeployServiceFormModel } from './interfaces/k8s-deploy-service-form.interface';

export const initialK8sDeployServiceFormModel: K8sDeployServiceFormModel = {
  nfvoId: '',
  nsdId: '',
  nsName: '',
  nsDescription: 'default description',
  vimAccountId: ''
};
