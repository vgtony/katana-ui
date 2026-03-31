import { Component, NgZone, inject, output } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { initialVimRegistrationFormModel } from '../../../models/vim-registration-form.model';
import { VimRegistrationFormModel } from '../../../models/interfaces/vim-registration-form.interface';
import { VimApiService, getApiErrorMessage } from '../../../shared/services/api';

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
  readonly completed = output<void>();
  protected readonly model: VimRegistrationFormModel = initialVimRegistrationFormModel;
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
