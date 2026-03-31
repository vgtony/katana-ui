import { Component, NgZone, inject, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { initialK8sCredentialsUploadFormModel } from '../../../models/k8s-credentials-upload-form.model';
import { K8sCredentialsUploadFormModel } from '../../../models/interfaces/k8s-credentials-upload-form.interface';
import { KubernetesApiService, getApiErrorMessage } from '../../../shared/services/api';

@Component({
  selector: 'app-k8s-credentials-upload-form',
  imports: [ReactiveFormsModule],
  templateUrl: './k8s-credentials-upload-form.component.html',
  styleUrl: './k8s-credentials-upload-form.component.scss'
})
export class K8sCredentialsUploadFormComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly ngZone = inject(NgZone);
  private readonly kubernetesApi = inject(KubernetesApiService);
  readonly completed = output<void>();
  protected readonly model: K8sCredentialsUploadFormModel = initialK8sCredentialsUploadFormModel;
  protected submitting = false;
  protected submitMessage = '';
  protected submitError = '';
  protected selectedFileName = '';

  protected readonly form = this.formBuilder.group({
    credentialsFile: this.formBuilder.control<File | null>(this.model.credentialsFile, Validators.required)
  });

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    this.selectedFileName = file?.name ?? '';
    this.form.controls.credentialsFile.setValue(file);
    this.form.controls.credentialsFile.markAsTouched();
    this.form.controls.credentialsFile.updateValueAndValidity();
  }

  protected submit(): void {
    this.submitMessage = '';
    this.submitError = '';
    const file = this.form.controls.credentialsFile.value;

    if (this.form.invalid || !file) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting = true;

    this.kubernetesApi
      .uploadK8sCredentials(file)
      .pipe(
        finalize(() =>
          this.ngZone.run(() => {
            this.submitting = false;
          })
        )
      )
      .subscribe({
        next: (id) => {
          this.ngZone.run(() => {
            this.submitMessage = `Kubernetes credentials uploaded successfully with id ${id}.`;
            this.completed.emit();
          });
        },
        error: (error: unknown) => {
          this.ngZone.run(() => {
            this.submitError = getApiErrorMessage(
              error,
              'Unable to upload Kubernetes credentials.'
            );
          });
        }
      });
  }
}
