import { Component, NgZone, inject, output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators
} from '@angular/forms';
import { finalize } from 'rxjs';
import { initialAmarisoftSliceDeploymentFormModel } from '../../../models/amarisoft-slice-deployment-form.model';
import { AmarisoftSliceDeploymentFormModel } from '../../../models/interfaces/amarisoft-slice-deployment-form.interface';
import {
  AmarisoftSliceApiService,
  AmarisoftSliceRequest,
  getApiErrorMessage,
  getApiErrorType
} from '../../../shared/services/api';
import { DeploymentDraftService } from '../../../shared/services/deployment-draft.service';
import { DeploymentAttemptEvent } from '../proxmox-vm-creation-form/proxmox-vm-creation-form.component';

type AmariWizardStep = 1 | 2 | 3 | 4 | 5;

interface AmariWizardStepMeta {
  id: AmariWizardStep;
  label: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function targetValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value as Partial<AmarisoftSliceDeploymentFormModel> | null;
    const ranTarget = Boolean(value?.ranEmsId?.trim() || value?.ranUrl?.trim());
    const coreTarget = Boolean(value?.coreEmsId?.trim() || value?.coreUrl?.trim());

    return ranTarget && coreTarget ? null : { targets: true };
  };
}

@Component({
  selector: 'app-amarisoft-slice-deployment-form',
  imports: [ReactiveFormsModule],
  templateUrl: './amarisoft-slice-deployment-form.component.html',
  styleUrl: './amarisoft-slice-deployment-form.component.scss'
})
export class AmarisoftSliceDeploymentFormComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly ngZone = inject(NgZone);
  private readonly amarisoftSliceApi = inject(AmarisoftSliceApiService);
  private readonly deploymentDraftService = inject(DeploymentDraftService);

  readonly changed = output<void>();
  readonly deployed = output<DeploymentAttemptEvent>();

  protected readonly steps: AmariWizardStepMeta[] = [
    { id: 1, label: 'Identity' },
    { id: 2, label: 'Slice' },
    { id: 3, label: 'QoS' },
    { id: 4, label: 'Targets' },
    { id: 5, label: 'Review' }
  ];
  protected currentStep: AmariWizardStep = 1;
  protected previewPayload: unknown = null;
  protected plannedSliceId = '';
  protected submittingPreview = false;
  protected submittingPlan = false;
  protected submittingApply = false;
  protected submitMessage = '';
  protected submitError = '';

  protected readonly model: AmarisoftSliceDeploymentFormModel =
    this.deploymentDraftService.getFormValue(
      'amari',
      'amari-slice',
      initialAmarisoftSliceDeploymentFormModel
    );
  protected readonly savedState = this.deploymentDraftService.getFormState(
    'amari',
    'amari-slice'
  );
  protected readonly restoreMessage =
    this.savedState === 'active'
      ? 'Active Amari slice plan loaded.'
      : this.savedState === 'draft'
        ? 'Saved Amari slice draft restored.'
        : '';

  protected readonly form = this.formBuilder.group(
    {
      name: [this.model.name, Validators.required],
      description: [this.model.description],
      sst: [this.model.sst, [Validators.required, Validators.min(0), Validators.max(255)]],
      sd: [
        this.model.sd,
        [Validators.required, Validators.pattern(/^[0-9a-fA-F]{6}$/)]
      ],
      mcc: [this.model.mcc, [Validators.required, Validators.pattern(/^\d{3}$/)]],
      mnc: [this.model.mnc, [Validators.required, Validators.pattern(/^\d{2,3}$/)]],
      dnn: [this.model.dnn, Validators.required],
      fiveQi: [this.model.fiveQi, [Validators.required, Validators.min(1), Validators.max(255)]],
      sessionAmbrUl: [this.model.sessionAmbrUl, Validators.required],
      sessionAmbrDl: [this.model.sessionAmbrDl, Validators.required],
      subscribersText: [this.model.subscribersText],
      isolationMode: [this.model.isolationMode, Validators.required],
      ranEmsId: [this.model.ranEmsId],
      ranUrl: [this.model.ranUrl, Validators.pattern(/^https?:\/\/\S+$/)],
      coreEmsId: [this.model.coreEmsId],
      coreUrl: [this.model.coreUrl, Validators.pattern(/^https?:\/\/\S+$/)]
    },
    { validators: targetValidator() }
  );

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.previewPayload = null;
      this.plannedSliceId = '';
      this.submitMessage = '';
      this.submitError = '';
      this.deploymentDraftService.saveFormValue(
        'amari',
        'amari-slice',
        this.form.getRawValue(),
        'draft'
      );
    });
  }

  protected selectStep(step: AmariWizardStep): void {
    if (!this.canAccessStep(step)) {
      return;
    }

    this.currentStep = step;

    if (step === 5 && !this.previewPayload && !this.submittingPreview) {
      this.preview();
    }
  }

  protected next(): void {
    if (!this.isCurrentStepValid()) {
      this.markStepTouched(this.currentStep);
      return;
    }

    const nextStep = Math.min(this.currentStep + 1, 5) as AmariWizardStep;
    this.selectStep(nextStep);
  }

  protected back(): void {
    this.currentStep = Math.max(this.currentStep - 1, 1) as AmariWizardStep;
  }

  protected canAccessStep(step: AmariWizardStep): boolean {
    for (let current = 1 as AmariWizardStep; current < step; current = (current + 1) as AmariWizardStep) {
      if (!this.isStepValid(current)) {
        return false;
      }
    }

    return true;
  }

  protected isStepActive(step: AmariWizardStep): boolean {
    return this.currentStep === step;
  }

  protected isStepComplete(step: AmariWizardStep): boolean {
    return step < this.currentStep && this.isStepValid(step);
  }

  protected isCurrentStepValid(): boolean {
    return this.isStepValid(this.currentStep);
  }

  protected isRanTargetMissing(): boolean {
    const value = this.form.getRawValue();
    return !value.ranEmsId?.trim() && !value.ranUrl?.trim();
  }

  protected isCoreTargetMissing(): boolean {
    const value = this.form.getRawValue();
    return !value.coreEmsId?.trim() && !value.coreUrl?.trim();
  }

  protected preview(): void {
    this.submitMessage = '';
    this.submitError = '';

    if (!this.form.valid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submittingPreview = true;

    this.amarisoftSliceApi
      .previewSlice(this.buildPayload(true))
      .pipe(
        finalize(() =>
          this.ngZone.run(() => {
            this.submittingPreview = false;
          })
        )
      )
      .subscribe({
        next: (response) => {
          this.ngZone.run(() => {
            this.previewPayload = response;
          });
        },
        error: (error: unknown) => {
          this.ngZone.run(() => {
            this.previewPayload = null;
            this.submitError = getApiErrorMessage(error, 'Unable to preview Amari slice.');
          });
        }
      });
  }

  protected savePlan(): void {
    this.submitMessage = '';
    this.submitError = '';

    if (!this.form.valid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submittingPlan = true;

    this.amarisoftSliceApi
      .createSlice(this.buildPayload(true))
      .pipe(
        finalize(() =>
          this.ngZone.run(() => {
            this.submittingPlan = false;
          })
        )
      )
      .subscribe({
        next: (response) => {
          this.ngZone.run(() => {
            const sliceId = this.getSliceId(response);
            this.deploymentDraftService.saveFormValue(
              'amari',
              'amari-slice',
              this.form.getRawValue(),
              'active'
            );
            this.plannedSliceId = sliceId;
            this.submitMessage = sliceId
              ? `Planned Amari slice saved with id ${sliceId}.`
              : 'Planned Amari slice saved.';
            this.changed.emit();
          });
        },
        error: (error: unknown) => {
          this.ngZone.run(() => {
            this.submitError = getApiErrorMessage(error, 'Unable to save Amari slice plan.');
          });
        }
      });
  }

  protected applyPlan(): void {
    this.submitMessage = '';
    this.submitError = '';

    if (!this.plannedSliceId) {
      this.submitError = 'Save the planned slice before applying it.';
      return;
    }

    this.submittingApply = true;

    this.amarisoftSliceApi
      .applySlice(this.plannedSliceId)
      .pipe(
        finalize(() =>
          this.ngZone.run(() => {
            this.submittingApply = false;
          })
        )
      )
      .subscribe({
        next: () => {
          this.ngZone.run(() => {
            this.submitMessage = `Amari slice ${this.plannedSliceId} apply request sent.`;
            this.changed.emit();
            this.deployed.emit({ status: 'done' });
          });
        },
        error: (error: unknown) => {
          this.ngZone.run(() => {
            this.submitError = getApiErrorMessage(error, 'Unable to apply Amari slice.');
            this.deployed.emit({
              status: 'failed',
              errorType: getApiErrorType(error) ?? 'Failed'
            });
          });
        }
      });
  }

  protected formatPreviewPayload(): string {
    return this.previewPayload ? JSON.stringify(this.previewPayload, null, 2) : '';
  }

  private isStepValid(step: AmariWizardStep): boolean {
    const controlsByStep: Record<AmariWizardStep, string[]> = {
      1: ['name'],
      2: ['sst', 'sd', 'mcc', 'mnc', 'dnn'],
      3: ['fiveQi', 'sessionAmbrUl', 'sessionAmbrDl', 'isolationMode'],
      4: ['ranEmsId', 'ranUrl', 'coreEmsId', 'coreUrl'],
      5: []
    };

    const controlsValid = controlsByStep[step].every((controlName) => {
      const control = this.form.get(controlName);
      return control ? control.valid : true;
    });

    if (step === 4) {
      return controlsValid && !this.isRanTargetMissing() && !this.isCoreTargetMissing();
    }

    if (step === 5) {
      return this.form.valid;
    }

    return controlsValid;
  }

  private markStepTouched(step: AmariWizardStep): void {
    const controlsByStep: Record<AmariWizardStep, string[]> = {
      1: ['name', 'description'],
      2: ['sst', 'sd', 'mcc', 'mnc', 'dnn'],
      3: ['fiveQi', 'sessionAmbrUl', 'sessionAmbrDl', 'subscribersText', 'isolationMode'],
      4: ['ranEmsId', 'ranUrl', 'coreEmsId', 'coreUrl'],
      5: []
    };

    controlsByStep[step].forEach((controlName) => this.form.get(controlName)?.markAsTouched());
  }

  private buildPayload(dryRun: boolean): AmarisoftSliceRequest {
    const value = this.form.getRawValue();
    const description = this.trimValue(value.description);

    return {
      name: this.trimValue(value.name),
      ...(description ? { description } : {}),
      s_nssai: {
        sst: Number(value.sst),
        sd: this.trimValue(value.sd)
      },
      plmn: {
        mcc: this.trimValue(value.mcc),
        mnc: this.trimValue(value.mnc)
      },
      dnn: this.trimValue(value.dnn),
      qos: {
        five_qi: Number(value.fiveQi),
        session_ambr_ul: this.trimValue(value.sessionAmbrUl),
        session_ambr_dl: this.trimValue(value.sessionAmbrDl)
      },
      subscribers: this.parseSubscribers(value.subscribersText),
      isolation_mode: this.trimValue(value.isolationMode),
      targets: {
        ran: this.buildTarget(value.ranEmsId, value.ranUrl),
        core: this.buildTarget(value.coreEmsId, value.coreUrl)
      },
      dry_run: dryRun
    };
  }

  private trimValue(value: string | null | undefined): string {
    return value?.trim() ?? '';
  }

  private buildTarget(emsId: string | null | undefined, url: string | null | undefined) {
    const trimmedEmsId = emsId?.trim();
    const trimmedUrl = url?.trim();

    return trimmedEmsId ? { ems_id: trimmedEmsId } : { url: trimmedUrl ?? '' };
  }

  private parseSubscribers(value: string | null | undefined): string[] {
    return (value ?? '')
      .split(/[\n,]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  private getSliceId(response: unknown): string {
    if (typeof response === 'string') {
      return response.trim();
    }

    if (!isRecord(response)) {
      return '';
    }

    const directId =
      response['slice_id'] ??
      response['id'] ??
      response['_id'] ??
      response['uuid'] ??
      response['name'];

    if (typeof directId === 'string' || typeof directId === 'number') {
      return String(directId);
    }

    const nestedSlice = response['slice'];

    if (isRecord(nestedSlice)) {
      const nestedId = nestedSlice['slice_id'] ?? nestedSlice['id'] ?? nestedSlice['_id'];
      return typeof nestedId === 'string' || typeof nestedId === 'number' ? String(nestedId) : '';
    }

    return '';
  }
}
