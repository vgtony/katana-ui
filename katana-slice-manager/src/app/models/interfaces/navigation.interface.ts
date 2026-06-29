export type NavigationSectionKey = 'deployment';

export interface NavigationChild {
  label: string;
  route: string;
}

export interface NavigationItem {
  key?: NavigationSectionKey;
  icon: 'overview' | 'dashboard' | 'history' | 'monitoring' | 'deployment' | 'proxmox';
  label: string;
  route: string;
  children?: NavigationChild[];
}
