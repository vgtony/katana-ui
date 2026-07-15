import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./layout/main-layout/main-layout.component').then((m) => m.MainLayoutComponent),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./pages/home-page/home-page.component').then((m) => m.HomePageComponent)
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./pages/dashboard-page/dashboard-page.component').then(
            (m) => m.DashboardPageComponent
          )
      },
      {
        path: 'history',
        loadComponent: () =>
          import('./pages/history-page/history-page.component').then((m) => m.HistoryPageComponent)
      },
      {
        path: 'proxmox-monitoring',
        loadComponent: () =>
          import('./pages/proxmox-monitoring-page/proxmox-monitoring-page.component').then(
            (m) => m.ProxmoxMonitoringPageComponent
          )
      },
      {
        path: 'monitoring',
        loadComponent: () =>
          import('./pages/monitoring-page/monitoring-page.component').then(
            (m) => m.MonitoringPageComponent
          )
      },
      {
        path: 'monitoring/:sliceId',
        loadComponent: () =>
          import('./pages/monitoring-page/monitoring-page.component').then(
            (m) => m.MonitoringPageComponent
          )
      },
      {
        path: 'slices/create',
        loadComponent: () =>
          import('./pages/create-slice-page/create-slice-page.component').then(
            (m) => m.CreateSlicePageComponent
          )
      },
      {
        path: 'slices/:sliceId',
        loadComponent: () =>
          import('./pages/slice-status-page/slice-status-page.component').then(
            (m) => m.SliceStatusPageComponent
          )
      },
      {
        path: 'deployment',
        loadComponent: () =>
          import('./pages/deployment-page/deployment-page.component').then(
            (m) => m.DeploymentPageComponent
          )
      },
      {
        path: 'deployment/:option',
        loadComponent: () =>
          import('./pages/deployment-page/deployment-page.component').then(
            (m) => m.DeploymentPageComponent
          )
      }
    ]
  },
  { path: '**', redirectTo: '' }
];
