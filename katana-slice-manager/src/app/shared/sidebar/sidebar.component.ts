import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

interface NavigationChild {
  label: string;
  route: string;
}

interface NavigationItem {
  key?: 'deployment' | 'registration';
  label: string;
  route: string;
  children?: NavigationChild[];
}

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss'
})
export class SidebarComponent {
  protected expandedSections: Record<'deployment' | 'registration', boolean> = {
    deployment: true,
    registration: true
  };

  protected readonly navigationItems: NavigationItem[] = [
    { label: 'Overview', route: '/' },
    {
      key: 'deployment',
      label: 'Deployment',
      route: '/deployment',
      children: [
        { label: 'Slice / OpenStack', route: '/deployment/slice' },
        { label: 'K8s Deploy', route: '/deployment/k8s' },
        { label: 'Proxmox VM', route: '/deployment/proxmox' }
      ]
    },
    {
      key: 'registration',
      label: 'Registration',
      route: '/registration',
      children: [
        { label: 'NFVO', route: '/registration/nfvo' },
        { label: 'Location', route: '/registration/location' },
        { label: 'VIM', route: '/registration/vim' },
        { label: 'Function', route: '/registration/function' },
        { label: 'Slice', route: '/registration/slice' },
        { label: 'K8s Credentials', route: '/registration/k8s-credentials' },
        { label: 'K8s Cluster', route: '/registration/k8s-cluster' },
        { label: 'K8s Deploy', route: '/registration/k8s-deploy' },
        { label: 'K8s Migration', route: '/registration/k8s-migration' },
        { label: 'PQC Slice', route: '/registration/pqc-slice' },
        { label: 'Proxmox Cluster', route: '/registration/proxmox-cluster' },
        { label: 'Proxmox VMs', route: '/registration/proxmox-vms' },
        { label: 'Proxmox Legacy', route: '/registration/proxmox' },
        { label: 'Kubernetes Legacy', route: '/registration/kubernetes' }
      ]
    }
  ];

  protected toggleSection(section: 'deployment' | 'registration'): void {
    this.expandedSections[section] = !this.expandedSections[section];
  }

  protected isExpanded(section: 'deployment' | 'registration'): boolean {
    return this.expandedSections[section];
  }
}
