import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NavigationItem, NavigationSectionKey } from '../../models/interfaces/navigation.interface';

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss'
})
export class SidebarComponent {
  protected expandedSections: Record<NavigationSectionKey, boolean> = {
    deployment: true
  };

  protected readonly navigationItems: NavigationItem[] = [
    { label: 'Overview', route: '/' },
    { label: 'Dashboard', route: '/dashboard' },
    { label: 'History', route: '/history' },
    {
      key: 'deployment',
      label: 'Deployment',
      route: '/deployment',
      children: [
        { label: 'Slice / OpenStack', route: '/deployment/slice' },
        { label: 'K8s Deploy', route: '/deployment/k8s' },
        { label: 'Proxmox VM', route: '/deployment/proxmox' }
      ]
    }
  ];

  protected toggleSection(section: NavigationSectionKey): void {
    this.expandedSections[section] = !this.expandedSections[section];
  }

  protected isExpanded(section: NavigationSectionKey): boolean {
    return this.expandedSections[section];
  }
}
