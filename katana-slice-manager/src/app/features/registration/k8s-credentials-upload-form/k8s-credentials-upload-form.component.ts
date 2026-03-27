import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { initialK8sCredentialsUploadFormModel } from './k8s-credentials-upload-form.model';
import { K8sCredentialsUploadFormModel } from '../../../models/interfaces/k8s-credentials-upload-form.interface';

@Component({
  selector: 'app-k8s-credentials-upload-form',
  imports: [ReactiveFormsModule],
  templateUrl: './k8s-credentials-upload-form.component.html',
  styleUrl: './k8s-credentials-upload-form.component.scss'
})
export class K8sCredentialsUploadFormComponent {
  private readonly formBuilder = inject(FormBuilder);
  protected readonly model: K8sCredentialsUploadFormModel = initialK8sCredentialsUploadFormModel;

  protected readonly form = this.formBuilder.group({
    credentialsFilePath: [this.model.credentialsFilePath, Validators.required]
  });
}
