export interface K8sMigrationFormModel {
  podPrefix: string;
  targetNode: string;
  namespace: string;
  deployment: string;
  config: string;
}

export const initialK8sMigrationFormModel: K8sMigrationFormModel = {
  podPrefix: '',
  targetNode: '',
  namespace: '',
  deployment: '',
  config: 'creds/<credential-file>'
};
