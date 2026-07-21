export type NavigationSectionKey = 'deployment';

export interface NavigationChild {
  label: string;
  route: string;
}

export interface NavigationItem {
  key?: NavigationSectionKey;
  icon:
    | 'overview'
    | 'dashboard'
    | 'history'
    | 'monitoring'
    | 'deployment'
    | 'proxmox'
    | 'infrastructure';
  label: string;
  route: string;
  administrative?: boolean;
  children?: NavigationChild[];
}
