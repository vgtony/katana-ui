import { Routes } from '@angular/router';
import { MainLayoutComponent } from './layout/main-layout/main-layout.component';
import { HomePageComponent } from './pages/home-page/home-page.component';
import { DashboardPageComponent } from './pages/dashboard-page/dashboard-page.component';
import { DeploymentPageComponent } from './pages/deployment-page/deployment-page.component';
import { HistoryPageComponent } from './pages/history-page/history-page.component';

export const routes: Routes = [
  {
    path: '',
    component: MainLayoutComponent,
    children: [
      { path: '', pathMatch: 'full', component: HomePageComponent },
      { path: 'dashboard', component: DashboardPageComponent },
      { path: 'history', component: HistoryPageComponent },
      { path: 'deployment', component: DeploymentPageComponent },
      { path: 'deployment/:option', component: DeploymentPageComponent }
    ]
  },
  { path: '**', redirectTo: '' }
];
