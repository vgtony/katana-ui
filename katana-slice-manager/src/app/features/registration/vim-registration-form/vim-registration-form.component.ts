import { Component, NgZone, inject, output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { initialVimRegistrationFormModel } from '../../../models/vim-registration-form.model';
import { VimRegistrationFormModel } from '../../../models/interfaces/vim-registration-form.interface';
import { VimApiService, getApiErrorMessage } from '../../../shared/services/api';
import { DeploymentDraftService } from '../../../shared/services/deployment-draft.service';

@Component({
  selector: 'app-vim-registration-form',
  imports: [ReactiveFormsModule],
  templateUrl: './vim-registration-form.component.html',
  styleUrl: './vim-registration-form.component.scss'
})
export class VimRegistrationFormComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly ngZone = inject(NgZone);
  private readonly vimApi = inject(VimApiService);
  private readonly deploymentDraftService = inject(DeploymentDraftService);
  readonly completed = output<void>();
  protected readonly model: VimRegistrationFormModel = this.deploymentDraftService.getFormValue(
    'slice',
    'vim',
    initialVimRegistrationFormModel
  );
  protected readonly savedState = this.deploymentDraftService.getFormState('slice', 'vim');
  protected readonly restoreMessage =
    this.savedState === 'active'
      ? 'Active VIM registration loaded. Update it only if you want to replace it.'
      : this.savedState === 'draft'
        ? 'Saved VIM draft restored.'
        : '';
  protected submitting = false;
  protected submitMessage = '';
  protected submitError = '';

  protected readonly form = this.formBuilder.group({
    id: [this.model.id, Validators.required],
    name: [this.model.name, Validators.required],
    authUrl: [this.model.authUrl, Validators.required],
    username: [this.model.username, Validators.required],
    password: [this.model.password, Validators.required],
    adminProjectName: [this.model.adminProjectName, Validators.required],
    location: [this.model.location, Validators.required],
    type: [this.model.type, Validators.required],
    version: [this.model.version, Validators.required],
    description: [this.model.description],
    infrastructureMonitoring: [this.model.infrastructureMonitoring],
    securityGroups: [this.model.securityGroups]
  });

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.deploymentDraftService.saveFormValue(
        'slice',
        'vim',
        this.form.getRawValue() as VimRegistrationFormModel,
        'draft'
      );
    });
  }

  protected submit(): void {
    this.submitMessage = '';
    this.submitError = '';

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting = true;

    this.vimApi
      .createVim(this.form.getRawValue() as VimRegistrationFormModel)
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
              'vim',
              this.form.getRawValue() as VimRegistrationFormModel,
              'active'
            );
            this.submitMessage = `VIM registered successfully with id ${id}.`;
            this.completed.emit();
          });
        },
        error: (error: unknown) => {
          this.ngZone.run(() => {
            this.submitError = getApiErrorMessage(error, 'Unable to register VIM.');
          });
        }
      });
  }
}
