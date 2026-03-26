export interface FunctionRegistrationFormModel {
  id: string;
  name: string;
  gen: number;
  func: number;
  sharedAvailability: boolean;
  type: number;
  location: string;
  nsdId: string;
  nsName: string;
  placement: number;
  optional: boolean;
}

export const initialFunctionRegistrationFormModel: FunctionRegistrationFormModel = {
  id: '',
  name: '',
  gen: 5,
  func: 0,
  sharedAvailability: false,
  type: 0,
  location: '',
  nsdId: '',
  nsName: '',
  placement: 0,
  optional: false
};
