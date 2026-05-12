import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NavigationItem } from '../../models/interfaces/navigation.interface';

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss'
})
export class SidebarComponent {
  protected readonly navigationItems: NavigationItem[] = [
    { icon: 'overview', label: 'Overview', route: '/' },
    { icon: 'dashboard', label: 'Dashboard', route: '/dashboard' },
    { icon: 'history', label: 'History', route: '/history' },
    { icon: 'deployment', label: 'Deployments', route: '/deployment' }
  ];
}
