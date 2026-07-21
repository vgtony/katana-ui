export interface SliceRegistrationFormModel {
  baseSliceDesId: string;
  coverage: string;
  delayTolerance: boolean;
  networkDlGuaranteed: number;
  ueDlGuaranteed: number;
  networkUlGuaranteed: number;
  ueUlGuaranteed: number;
  mtu: number;
  nsdId: string;
  nsName: string;
  placement: number;
  optional: boolean;
}
