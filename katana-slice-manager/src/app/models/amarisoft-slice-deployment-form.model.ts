import { AmarisoftSliceDeploymentFormModel } from './interfaces/amarisoft-slice-deployment-form.interface';

export const initialAmarisoftSliceDeploymentFormModel: AmarisoftSliceDeploymentFormModel = {
  name: '',
  description: '',
  sst: 1,
  sd: '010203',
  mcc: '001',
  mnc: '01',
  dnn: 'internet',
  fiveQi: 9,
  sessionAmbrUl: '100Mbps',
  sessionAmbrDl: '500Mbps',
  subscribersText: '001010000000001',
  isolationMode: 'shared',
  ranEmsId: '',
  ranUrl: 'http://10.45.101.53:8081',
  coreEmsId: '',
  coreUrl: 'http://10.45.101.53:8082'
};
