import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  initialK8sClusterRegistrationFormModel,
  K8sClusterRegistrationFormModel
} from './k8s-cluster-registration-form.model';

@Component({
  selector: 'app-k8s-cluster-registration-form',
  imports: [ReactiveFormsModule],
  templateUrl: './k8s-cluster-registration-form.component.html',
  styleUrl: './k8s-cluster-registration-form.component.scss'
})
export class K8sClusterRegistrationFormComponent {
  private readonly formBuilder = inject(FormBuilder);
  protected readonly model: K8sClusterRegistrationFormModel = initialK8sClusterRegistrationFormModel;

  protected readonly form = this.formBuilder.group({
    schemaVersion: [this.model.schemaVersion, Validators.required],
    credentials: [this.model.credentials, Validators.required],
    schemaType: [this.model.schemaType, Validators.required],
    name: [this.model.name, Validators.required],
    description: [this.model.description, Validators.required],
    vimAccount: [this.model.vimAccount, Validators.required],
    nfvoIp: [this.model.nfvoIp, Validators.required],
    nfvoUsername: [this.model.nfvoUsername, Validators.required],
    nfvoPassword: [this.model.nfvoPassword, Validators.required],
    k8sVersion: [this.model.k8sVersion, Validators.required],
    k8sNet1: [this.model.k8sNet1],
    namespace: [this.model.namespace, Validators.required],
    jujuBundle: [this.model.jujuBundle],
    helmChartV3: [this.model.helmChartV3]
  });
}
