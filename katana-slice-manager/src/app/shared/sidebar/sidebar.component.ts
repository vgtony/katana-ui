import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss'
})
export class SidebarComponent {
  protected registrationExpanded = true;

  protected readonly navigationItems = [
    { label: 'Overview', route: '/' },
    {
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

  protected toggleRegistration(): void {
    this.registrationExpanded = !this.registrationExpanded;
  }
}
