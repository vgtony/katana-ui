export interface K8sMigrationFormModel {
  podPrefix: string;
  targetNode: string;
  namespace: string;
  deployment: string;
  config: string;
}
