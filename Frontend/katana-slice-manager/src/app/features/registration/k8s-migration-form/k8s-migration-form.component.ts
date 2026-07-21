import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { initialK8sMigrationFormModel } from '../../../models/k8s-migration-form.model';
import { K8sMigrationFormModel } from '../../../models/interfaces/k8s-migration-form.interface';

@Component({
  selector: 'app-k8s-migration-form',
  imports: [ReactiveFormsModule],
  templateUrl: './k8s-migration-form.component.html',
  styleUrl: './k8s-migration-form.component.scss'
})
export class K8sMigrationFormComponent {
  private readonly formBuilder = inject(FormBuilder);
  protected readonly model: K8sMigrationFormModel = initialK8sMigrationFormModel;

  protected readonly form = this.formBuilder.group({
    podPrefix: [this.model.podPrefix, Validators.required],
    targetNode: [this.model.targetNode, Validators.required],
    namespace: [this.model.namespace, Validators.required],
    deployment: [this.model.deployment, Validators.required],
    config: [this.model.config, Validators.required]
  });
}
