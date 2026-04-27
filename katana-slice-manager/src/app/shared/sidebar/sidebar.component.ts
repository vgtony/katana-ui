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
    { label: 'Overview', route: '/' },
    { label: 'Dashboard', route: '/dashboard' },
    { label: 'History', route: '/history' },
    { label: 'Proxmox API', route: '/proxmox-api' },
    { label: 'Deployments', route: '/deployment' }
  ];
}
