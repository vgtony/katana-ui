import { Component, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import {
  initialKubernetesRegistrationFormModel,
  KubernetesRegistrationFormModel
} from './kubernetes-registration-form.model';

@Component({
  selector: 'app-kubernetes-registration-form',
  imports: [ReactiveFormsModule],
  templateUrl: './kubernetes-registration-form.component.html',
  styleUrl: './kubernetes-registration-form.component.scss'
})
export class KubernetesRegistrationFormComponent {
  private readonly formBuilder = inject(FormBuilder);
  protected readonly model: KubernetesRegistrationFormModel = initialKubernetesRegistrationFormModel;

  protected readonly form = this.formBuilder.group({
    clusterName: [this.model.clusterName, Validators.required],
    apiServer: [this.model.apiServer, Validators.required],
    namespace: [this.model.namespace, Validators.required],
    serviceAccount: [this.model.serviceAccount, Validators.required],
    kubeconfigSecret: [this.model.kubeconfigSecret, Validators.required]
  });
}
