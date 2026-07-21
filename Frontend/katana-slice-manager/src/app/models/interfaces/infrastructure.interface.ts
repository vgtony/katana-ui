export type BootstrapState = 'never_run' | 'succeeded' | 'failed';
export type BootstrapAction = 'created' | 'adopted' | 'updated' | 'unchanged';

export interface BootstrapResult {
  kind: string;
  id: string;
  action: BootstrapAction;
}

export interface BootstrapStatus {
  status: BootstrapState;
  started_at?: number;
  finished_at?: number;
  error?: string;
  results?: BootstrapResult[];
}

export interface BootstrapNfvo {
  id: string;
  name?: string;
  type: 'osm';
  endpoint: string;
  project: string;
  credentials: { username: string; password: string };
  tls_verify: boolean;
}

export interface BootstrapVimLink {
  id: string;
  account_name?: string;
  config: Record<string, unknown>;
}

export interface BootstrapVim {
  id: string;
  name?: string;
  type: 'openstack';
  location: string;
  credentials: {
    auth: {
      auth_url: string;
      username: string;
      password: string;
      project_name: string;
    };
  };
  verify: boolean;
  nfvos: BootstrapVimLink[];
}

export interface BootstrapManifest {
  api_version: 'katana/v1';
  nfvos: BootstrapNfvo[];
  vims: BootstrapVim[];
}

export interface NfvoSummary {
  _id: string;
  nfvo_id: string;
  type: string;
  created_at: number;
}

export interface VimSummary {
  _id: string;
  vim_id: string;
  name: string;
  type: string;
  location: string;
  nfvo_ids: string[];
  created_at: number;
}

export interface NsdSummary extends Record<string, unknown> {
  _id?: string;
  'nsd-id'?: string;
  'nsd-name'?: string;
  nfvo_id?: string;
  deployment_runtime?: string;
}
