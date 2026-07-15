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
    { icon: 'monitoring', label: 'Monitoring', route: '/monitoring' },
    { icon: 'history', label: 'History', route: '/history' },
    { icon: 'proxmox', label: 'Proxmox', route: '/proxmox-monitoring' },
    { icon: 'deployment', label: 'Create Slice', route: '/slices/create' },
    { icon: 'deployment', label: 'Deployments', route: '/deployment' }
  ];
}
