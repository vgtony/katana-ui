import { K8sMigrationFormModel } from './interfaces/k8s-migration-form.interface';

export const initialK8sMigrationFormModel: K8sMigrationFormModel = {
  podPrefix: '',
  targetNode: '',
  namespace: '',
  deployment: '',
  config: 'creds/<credential-file>'
};
