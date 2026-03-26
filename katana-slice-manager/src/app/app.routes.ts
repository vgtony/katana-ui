import { Routes } from '@angular/router';
import { MainLayoutComponent } from './layout/main-layout/main-layout.component';
import { HomePageComponent } from './pages/home-page/home-page.component';
import { RegistrationPageComponent } from './pages/registration-page/registration-page.component';
import { NfvoRegistrationFormComponent } from './features/registration/nfvo-registration-form/nfvo-registration-form.component';
import { LocationRegistrationFormComponent } from './features/registration/location-registration-form/location-registration-form.component';
import { VimRegistrationFormComponent } from './features/registration/vim-registration-form/vim-registration-form.component';
import { FunctionRegistrationFormComponent } from './features/registration/function-registration-form/function-registration-form.component';
import { SliceRegistrationFormComponent } from './features/registration/slice-registration-form/slice-registration-form.component';
import { K8sCredentialsUploadFormComponent } from './features/registration/k8s-credentials-upload-form/k8s-credentials-upload-form.component';
import { K8sClusterRegistrationFormComponent } from './features/registration/k8s-cluster-registration-form/k8s-cluster-registration-form.component';
import { K8sDeployServiceFormComponent } from './features/registration/k8s-deploy-service-form/k8s-deploy-service-form.component';
import { K8sMigrationFormComponent } from './features/registration/k8s-migration-form/k8s-migration-form.component';
import { PqcSliceDeploymentFormComponent } from './features/registration/pqc-slice-deployment-form/pqc-slice-deployment-form.component';
import { ProxmoxClusterRegistrationFormComponent } from './features/registration/proxmox-cluster-registration-form/proxmox-cluster-registration-form.component';
import { ProxmoxVmCreationFormComponent } from './features/registration/proxmox-vm-creation-form/proxmox-vm-creation-form.component';
import { ProxmoxRegistrationFormComponent } from './features/registration/proxmox-registration-form/proxmox-registration-form.component';
import { KubernetesRegistrationFormComponent } from './features/registration/kubernetes-registration-form/kubernetes-registration-form.component';

export const routes: Routes = [
  {
    path: '',
    component: MainLayoutComponent,
    children: [
      { path: '', pathMatch: 'full', component: HomePageComponent },
      {
        path: 'registration',
        component: RegistrationPageComponent,
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'nfvo' },
          { path: 'nfvo', component: NfvoRegistrationFormComponent },
          { path: 'location', component: LocationRegistrationFormComponent },
          { path: 'vim', component: VimRegistrationFormComponent },
          { path: 'function', component: FunctionRegistrationFormComponent },
          { path: 'slice', component: SliceRegistrationFormComponent },
          { path: 'k8s-credentials', component: K8sCredentialsUploadFormComponent },
          { path: 'k8s-cluster', component: K8sClusterRegistrationFormComponent },
          { path: 'k8s-deploy', component: K8sDeployServiceFormComponent },
          { path: 'k8s-migration', component: K8sMigrationFormComponent },
          { path: 'pqc-slice', component: PqcSliceDeploymentFormComponent },
          { path: 'proxmox-cluster', component: ProxmoxClusterRegistrationFormComponent },
          { path: 'proxmox-vms', component: ProxmoxVmCreationFormComponent },
          { path: 'proxmox', component: ProxmoxRegistrationFormComponent },
          { path: 'kubernetes', component: KubernetesRegistrationFormComponent }
        ]
      }
    ]
  },
  { path: '**', redirectTo: '' }
];
