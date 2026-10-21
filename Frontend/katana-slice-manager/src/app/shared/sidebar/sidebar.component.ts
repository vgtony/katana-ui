import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NavigationItem } from '../../models/interfaces/navigation.interface';

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent {
  protected menuOpen = false;
  protected readonly navigationItems: NavigationItem[] = [
    { icon: 'overview', label: 'Overview', route: '/' },
    { icon: 'dashboard', label: 'Dashboard', route: '/dashboard' },
    { icon: 'monitoring', label: 'Monitoring', route: '/monitoring' },
    { icon: 'history', label: 'History', route: '/history' },
    { icon: 'deployment', label: 'Deployments', route: '/deployment' },
    { icon: 'infrastructure', label: 'Infrastructure', route: '/infrastructure' },
    { icon: 'deployment', label: 'Helm charts', route: '/helm-charts' },
    {
      icon: 'infrastructure',
      label: 'Time-0 Setup',
      route: '/admin/infrastructure/bootstrap',
      administrative: true,
    },
  ];
}
