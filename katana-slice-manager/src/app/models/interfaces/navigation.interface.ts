export type NavigationSectionKey = 'deployment' | 'registration';

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
