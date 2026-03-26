export interface K8sCredentialsUploadFormModel {
  credentialsFilePath: string;
}

export const initialK8sCredentialsUploadFormModel: K8sCredentialsUploadFormModel = {
  credentialsFilePath: 'creds.yaml'
};
