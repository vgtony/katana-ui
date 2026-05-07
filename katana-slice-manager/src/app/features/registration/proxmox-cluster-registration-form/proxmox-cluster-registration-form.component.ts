import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, NgZone, inject, output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { initialProxmoxClusterRegistrationFormModel } from '../../../models/proxmox-cluster-registration-form.model';
import { ProxmoxClusterRegistrationFormModel } from '../../../models/interfaces/proxmox-cluster-registration-form.interface';
import { ProxmoxApiService, getApiErrorMessage } from '../../../shared/services/api';
import { DeploymentDraftService } from '../../../shared/services/deployment-draft.service';

@Component({
  selector: 'app-proxmox-cluster-registration-form',
  imports: [ReactiveFormsModule],
  templateUrl: './proxmox-cluster-registration-form.component.html',
  styleUrl: './proxmox-cluster-registration-form.component.scss'
})
export class ProxmoxClusterRegistrationFormComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly ngZone = inject(NgZone);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly proxmoxApi = inject(ProxmoxApiService);
  private readonly deploymentDraftService = inject(DeploymentDraftService);
  readonly completed = output<void>();
  readonly failed = output<void>();
  protected readonly model: ProxmoxClusterRegistrationFormModel = this.deploymentDraftService.getFormValue(
    'proxmox',
    'proxmox-cluster',
    initialProxmoxClusterRegistrationFormModel
  );
  protected readonly savedState = this.deploymentDraftService.getFormState(
    'proxmox',
    'proxmox-cluster'
  );
  protected readonly restoreMessage =
    this.savedState === 'active'
      ? 'Active Proxmox cluster registration loaded. Update it only if you want to replace it.'
      : this.savedState === 'draft'
        ? 'Saved Proxmox cluster draft restored.'
        : '';
  protected submitting = false;
  protected submitSucceeded = false;
  protected submitMessage = '';
  protected submitError = '';

  protected readonly form = this.formBuilder.group({
    url: [this.model.url, Validators.required],
    username: [this.model.username, Validators.required],
    password: [this.model.password, Validators.required]
  });

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.deploymentDraftService.saveFormValue(
        'proxmox',
        'proxmox-cluster',
        this.form.getRawValue() as ProxmoxClusterRegistrationFormModel,
        'draft'
      );
    });
  }

  protected submit(): void {
    this.submitSucceeded = false;
    this.submitMessage = '';
    this.submitError = '';

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (this.isUsingLoadedActiveCluster()) {
      this.deploymentDraftService.saveFormValue(
        'proxmox',
        'proxmox-cluster',
        this.form.getRawValue() as ProxmoxClusterRegistrationFormModel,
        'active'
      );
      this.submitSucceeded = true;
      this.submitMessage = 'Using the existing active Proxmox cluster registration.';
      this.completed.emit();
      this.changeDetectorRef.detectChanges();
      return;
    }

    this.submitting = true;

    this.proxmoxApi
      .createCluster(this.form.getRawValue() as ProxmoxClusterRegistrationFormModel)
      .pipe(
        finalize(() =>
          this.ngZone.run(() => {
            this.submitting = false;
            this.changeDetectorRef.detectChanges();
          })
        )
      )
      .subscribe({
        next: (response) => {
          this.ngZone.run(() => {
            this.deploymentDraftService.saveFormValue(
              'proxmox',
              'proxmox-cluster',
              this.form.getRawValue() as ProxmoxClusterRegistrationFormModel,
              'active'
            );
            this.submitSucceeded = true;
            this.submitMessage = `Registered Proxmox cluster. Found ${response.datacenters.length} datacenters.`;
            this.completed.emit();
            this.changeDetectorRef.detectChanges();
          });
        },
        error: (error: unknown) => {
          this.ngZone.run(() => {
            if (error instanceof HttpErrorResponse && error.status === 409) {
              this.deploymentDraftService.saveFormValue(
                'proxmox',
                'proxmox-cluster',
                this.form.getRawValue() as ProxmoxClusterRegistrationFormModel,
                'active'
              );
              this.submitSucceeded = true;
              this.submitError = '';
              this.submitMessage =
                'A Proxmox cluster with these details is already active. Using the existing registration.';
              this.completed.emit();
              this.changeDetectorRef.detectChanges();
              return;
            }

            this.submitSucceeded = false;
            this.submitError = getApiErrorMessage(error, 'Unable to register Proxmox cluster.');
            this.failed.emit();
            this.changeDetectorRef.detectChanges();
          });
        }
      });
  }

  protected isUsingLoadedActiveCluster(): boolean {
    return (
      this.savedState === 'active' &&
      JSON.stringify(this.form.getRawValue()) === JSON.stringify(this.model)
    );
  }
}
