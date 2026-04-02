import { Component, NgZone, inject, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { initialNfvoRegistrationFormModel } from '../../../models/nfvo-registration-form.model';
import { NfvoRegistrationFormModel } from '../../../models/interfaces/nfvo-registration-form.interface';
import { NfvoApiService, getApiErrorMessage } from '../../../shared/services/api';
import { DeploymentDraftService } from '../../../shared/services/deployment-draft.service';

@Component({
  selector: 'app-nfvo-registration-form',
  imports: [ReactiveFormsModule],
  templateUrl: './nfvo-registration-form.component.html',
  styleUrl: './nfvo-registration-form.component.scss'
})
export class NfvoRegistrationFormComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly ngZone = inject(NgZone);
  private readonly nfvoApi = inject(NfvoApiService);
  private readonly deploymentDraftService = inject(DeploymentDraftService);
  readonly completed = output<void>();
  protected readonly model: NfvoRegistrationFormModel = this.deploymentDraftService.getFormValue(
    'slice',
    'nfvo',
    initialNfvoRegistrationFormModel
  );
  protected submitting = false;
  protected submitMessage = '';
  protected submitError = '';

  protected readonly form = this.formBuilder.group({
    id: [this.model.id, Validators.required],
    name: [this.model.name, Validators.required],
    nfvoip: [this.model.nfvoip, Validators.required],
    nfvousername: [this.model.nfvousername, Validators.required],
    nfvopassword: [this.model.nfvopassword, Validators.required],
    tenantname: [this.model.tenantname, Validators.required],
    type: [this.model.type, Validators.required],
    version: [this.model.version],
    description: [this.model.description],
    configId: [this.model.configId, Validators.required],
    configNfvoUsername: [this.model.configNfvoUsername, Validators.required],
    configNfvoPassword: [this.model.configNfvoPassword, Validators.required],
    configNfvoIp: [this.model.configNfvoIp, Validators.required],
    configTenantName: [this.model.configTenantName, Validators.required]
  });

  protected submit(): void {
    this.submitMessage = '';
    this.submitError = '';

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting = true;

    this.nfvoApi
      .createNfvo(this.form.getRawValue() as NfvoRegistrationFormModel)
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
            this.deploymentDraftService.saveFormValue(
              'slice',
              'nfvo',
              this.form.getRawValue() as NfvoRegistrationFormModel
            );
            this.submitMessage = `NFVO registered successfully with id ${id}.`;
            this.completed.emit();
          });
        },
        error: (error: unknown) => {
          this.ngZone.run(() => {
            this.submitError = getApiErrorMessage(error, 'Unable to register NFVO.');
          });
        }
      });
  }
}
