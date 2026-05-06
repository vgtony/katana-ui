import { buildKatanaApiEndpoints } from './api-endpoints';

const apiBase = '/api';

export const environment = {
  production: false,
  apiBase,
  endpoints: buildKatanaApiEndpoints(apiBase)
};
