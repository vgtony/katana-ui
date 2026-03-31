export type NavigationSectionKey = 'deployment';

export interface NavigationChild {
  label: string;
  route: string;
}

export interface NavigationItem {
  key?: NavigationSectionKey;
  label: string;
  route: string;
  children?: NavigationChild[];
}
