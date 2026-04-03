import { buildKatanaApiEndpoints } from './api-endpoints';

const apiBase = '/api';

export const environment = {
  production: true,
  apiBase,
  endpoints: buildKatanaApiEndpoints(apiBase)
};
