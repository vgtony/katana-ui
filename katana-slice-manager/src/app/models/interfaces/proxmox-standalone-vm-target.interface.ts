export interface ProxmoxVmTemplateOption {
  label: string;
  value: string;
}

export interface ProxmoxStandaloneVmTarget {
  node: string;
  storageOptions: string[];
  isoImages?: string[];
  templateOptions?: ProxmoxVmTemplateOption[];
}
