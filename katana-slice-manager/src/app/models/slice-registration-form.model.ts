import { SliceRegistrationFormModel } from './interfaces/slice-registration-form.interface';

export const initialSliceRegistrationFormModel: SliceRegistrationFormModel = {
  baseSliceDesId: '',
  coverage: '',
  delayTolerance: true,
  networkDlGuaranteed: 1500000,
  ueDlGuaranteed: 1500000,
  networkUlGuaranteed: 50000,
  ueUlGuaranteed: 60000,
  mtu: 1500,
  nsdId: '',
  nsName: '',
  placement: 0,
  optional: false
};
