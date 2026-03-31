export type DashboardCategory = 'deployment' | 'infrastructure' | 'catalog' | 'operations';

export interface DashboardRow {
  [key: string]: string | number | boolean | null;
}

export interface DashboardSection {
  key: string;
  label: string;
  category: DashboardCategory;
  description: string;
  columns: string[];
  rows: DashboardRow[];
  error: string | null;
}
