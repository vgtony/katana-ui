import { buildKatanaApiEndpoints } from './api-endpoints';

const apiBase = 'http://localhost:8000/api';

export const environment = {
  production: false,
  apiBase,
  endpoints: buildKatanaApiEndpoints(apiBase)
};
