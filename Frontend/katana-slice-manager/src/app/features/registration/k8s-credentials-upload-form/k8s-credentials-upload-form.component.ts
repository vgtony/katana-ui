import { HttpEventType } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FORM_FEEDBACK_IMPORTS } from '../../../shared/forms/form-feedback';
import { ChangeDetectorRef, Component, DestroyRef, NgZone, inject, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription, finalize } from 'rxjs';
import { initialK8sCredentialsUploadFormModel } from '../../../models/k8s-credentials-upload-form.model';
import { K8sCredentialsUploadFormModel } from '../../../models/interfaces/k8s-credentials-upload-form.interface';
import { KubernetesApiService, getApiErrorMessage } from '../../../shared/services/api';
import { DeploymentDraftService } from '../../../shared/services/deployment-draft.service';

interface K8sCredentialsSnapshot {
  fileName: string;
}

@Component({
  selector: 'app-k8s-credentials-upload-form',
  imports: [...FORM_FEEDBACK_IMPORTS, ReactiveFormsModule],
  templateUrl: './k8s-credentials-upload-form.component.html',
  styleUrl: './k8s-credentials-upload-form.component.scss',
})
export class K8sCredentialsUploadFormComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private uploadRequest?: Subscription;
  protected uploadProgress: number | null = null;
  protected uploadCancelled = false;
  private readonly formBuilder = inject(FormBuilder);
  private readonly ngZone = inject(NgZone);
  private readonly kubernetesApi = inject(KubernetesApiService);
  private readonly deploymentDraftService = inject(DeploymentDraftService);
  readonly completed = output<void>();
  readonly failed = output<void>();
  protected readonly model: K8sCredentialsUploadFormModel = initialK8sCredentialsUploadFormModel;
  private readonly savedSnapshot =
    this.deploymentDraftService.getSavedFormSnapshot<K8sCredentialsSnapshot>(
      'k8s',
      'k8s-credentials',
    );
  protected readonly savedState = this.deploymentDraftService.getFormState(
    'k8s',
    'k8s-credentials',
  );
  protected readonly restoreMessage =
    this.savedState === 'active'
      ? `Active K8s credentials found${this.savedSnapshot?.fileName ? `: ${this.savedSnapshot.fileName}` : ''}. Upload a new file only if you need to replace them.`
      : '';
  protected submitting = false;
  protected submitMessage = '';
  protected submitError = '';
  protected selectedFileName = this.savedSnapshot?.fileName ?? '';

  protected readonly form = this.formBuilder.group({
    credentialsFile: this.formBuilder.control<File | null>(
      this.model.credentialsFile,
      Validators.required,
    ),
  });

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    this.submitError = '';
    this.submitMessage = '';
    this.uploadCancelled = false;
    this.selectedFileName = file?.name ?? '';
    this.form.controls.credentialsFile.setValue(file);
    this.form.controls.credentialsFile.markAsTouched();
    if (file && !/\.(yaml|yml|json)$/i.test(file.name))
      this.form.controls.credentialsFile.setErrors({ fileType: true });
    else if (file && !file.size) this.form.controls.credentialsFile.setErrors({ emptyFile: true });
  }

  protected submit(): void {
    if (this.submitting) return;
    this.submitMessage = '';
    this.submitError = '';
    const file = this.form.controls.credentialsFile.value;

    if (this.form.invalid || !file) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting = true;
    this.uploadProgress = null;
    this.uploadCancelled = false;

    this.uploadRequest = this.kubernetesApi
      .uploadK8sCredentials(file)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() =>
          this.ngZone.run(() => {
            this.submitting = false;
            this.changeDetectorRef.markForCheck();
          }),
        ),
      )
      .subscribe({
        next: (event) => {
          if (event.type === HttpEventType.UploadProgress) {
            this.uploadProgress = event.total
              ? Math.min(100, Math.round((event.loaded / event.total) * 100))
              : null;
            this.changeDetectorRef.markForCheck();
            return;
          }
          if (event.type !== HttpEventType.Response || !event.body) return;
          const response = event.body;
          this.ngZone.run(() => {
            this.deploymentDraftService.saveFormValue(
              'k8s',
              'k8s-credentials',
              { fileName: file.name } as K8sCredentialsSnapshot,
              'active',
            );
            this.submitMessage =
              response.message || `Kubernetes credentials '${file.name}' uploaded successfully.`;
            this.completed.emit();
            this.changeDetectorRef.markForCheck();
          });
        },
        error: (error: unknown) => {
          this.ngZone.run(() => {
            this.submitError = getApiErrorMessage(
              error,
              'Unable to upload Kubernetes credentials.',
            );
            this.failed.emit();
            this.changeDetectorRef.markForCheck();
          });
        },
      });
  }
  protected cancelUpload(): void {
    this.uploadRequest?.unsubscribe();
    this.uploadCancelled = true;
    this.changeDetectorRef.markForCheck();
  }
}
