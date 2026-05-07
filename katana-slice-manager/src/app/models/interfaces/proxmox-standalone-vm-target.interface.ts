export interface ProxmoxVmTemplateOption {
  label: string;
  value: string;
}

export interface ProxmoxStorageIsoOption {
  storage: string;
  isoImages: string[];
}

export interface ProxmoxStandaloneVmTarget {
  node: string;
  storageOptions: string[];
  storageIsoImages?: ProxmoxStorageIsoOption[];
  templateOptions?: ProxmoxVmTemplateOption[];
}
