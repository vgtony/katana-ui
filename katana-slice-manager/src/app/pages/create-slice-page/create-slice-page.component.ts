import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import {
  NestRecord,
  NestSummary,
  firstString,
  getCredentialReference,
  isNestRecord,
  parseStructuredFile,
  summarizeNest
} from '../../shared/nest-file.utils';
import { SliceApiService, getApiErrorMessage } from '../../shared/services/api';

type InfrastructureType = 'kubernetes' | 'openstack';

@Component({
  selector: 'app-create-slice-page',
  imports: [ReactiveFormsModule],
  templateUrl: './create-slice-page.component.html',
  styleUrl: './create-slice-page.component.scss'
})
export class CreateSlicePageComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly sliceApi = inject(SliceApiService);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);

  protected nestFileName = '';
  protected nestDocument: NestRecord | null = null;
  protected summary: NestSummary | null = null;
  protected nestError = '';
  protected credentialReference = '';
  protected credentialFileName = '';
  protected credentialData: NestRecord | null = null;
  protected credentialError = '';
  protected cloudNames: string[] = [];
  protected showInfrastructure = false;
  protected manualInfrastructure = false;
  protected submitting = false;
  protected submitError = '';

  protected readonly infrastructureForm = this.formBuilder.nonNullable.group({
    id: ['', Validators.required],
    type: ['kubernetes' as InfrastructureType, Validators.required],
    location: ['', Validators.required],
    nfvoId: ['', Validators.required],
    k8sVersion: [''],
    namespace: ['default'],
    cloud: ['']
  });

  protected get infrastructureType(): InfrastructureType {
    return this.infrastructureForm.controls.type.value;
  }

  protected get needsInfrastructureRegistration(): boolean {
    return this.manualInfrastructure || !!this.credentialReference || !!this.credentialData;
  }

  protected get credentialsSelected(): boolean {
    return !!this.credentialData;
  }

  protected get canDeploy(): boolean {
    if (!this.nestDocument || this.submitting) {
      return false;
    }

    if (!this.showInfrastructure) {
      return true;
    }

    if (!this.needsInfrastructureRegistration) {
      return !!this.infrastructureForm.controls.id.value.trim();
    }

    const values = this.infrastructureForm.getRawValue();
    const typeFieldsValid =
      values.type === 'kubernetes'
        ? !!values.k8sVersion.trim() && !!values.namespace.trim()
        : !!values.cloud.trim();

    return this.infrastructureForm.valid && typeFieldsValid && this.credentialsSelected;
  }

  protected async onNestSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    await this.loadNest(input.files?.[0] ?? null);
    input.value = '';
  }

  protected onNestDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  protected async onNestDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    await this.loadNest(event.dataTransfer?.files?.[0] ?? null);
  }

  protected registerInfrastructure(): void {
    this.manualInfrastructure = true;
    this.showInfrastructure = true;
    this.credentialData = null;
    this.credentialFileName = '';
    this.cloudNames = [];
  }

  protected infrastructureTypeChanged(): void {
    this.credentialData = null;
    this.credentialFileName = '';
    this.credentialError = '';
    this.cloudNames = [];
    this.infrastructureForm.controls.cloud.setValue('');
  }

  protected async onCredentialSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    this.credentialData = null;
    this.credentialFileName = '';
    this.credentialError = '';
    this.cloudNames = [];

    if (!file) {
      return;
    }

    try {
      const credentials = parseStructuredFile(await file.text());
      this.validateCredentials(credentials);
      this.credentialData = credentials;
      this.credentialFileName = file.name;
    } catch (error) {
      this.credentialError =
        error instanceof Error ? error.message : 'Unable to parse the credential file.';
    } finally {
      this.changeDetectorRef.markForCheck();
    }
  }

  protected deploy(): void {
    if (!this.canDeploy || !this.nestDocument) {
      return;
    }

    this.submitError = '';
    const payload = this.buildPayload();
    this.submitting = true;

    this.sliceApi
      .createUnifiedSlice(payload)
      .pipe(finalize(() => (this.submitting = false)))
      .subscribe({
        next: (response) => {
          const uuid = this.extractSliceUuid(response);

          if (!uuid) {
            this.submitError = 'Katana accepted the request but did not return a slice UUID.';
            return;
          }

          void this.router.navigate(['/slices', uuid]);
        },
        error: (error: unknown) => {
          this.submitError = this.getCreateError(error);
        }
      });
  }

  private async loadNest(file: File | null): Promise<void> {
    if (!file) {
      return;
    }

    this.resetUpload();

    try {
      const nest = parseStructuredFile(await file.text());
      const summary = summarizeNest(nest);
      this.nestDocument = nest;
      this.nestFileName = file.name;
      this.summary = summary;
      this.showInfrastructure = !!summary.infrastructure;
      this.credentialReference = getCredentialReference(summary.infrastructure);
      this.patchInfrastructure(summary.infrastructure);
    } catch (error) {
      this.nestError = error instanceof Error ? error.message : 'Unable to parse the NEST file.';
    } finally {
      this.changeDetectorRef.markForCheck();
    }
  }

  private resetUpload(): void {
    this.nestFileName = '';
    this.nestDocument = null;
    this.summary = null;
    this.nestError = '';
    this.credentialReference = '';
    this.credentialFileName = '';
    this.credentialData = null;
    this.credentialError = '';
    this.cloudNames = [];
    this.showInfrastructure = false;
    this.manualInfrastructure = false;
    this.submitError = '';
    this.infrastructureForm.reset({
      id: '',
      type: 'kubernetes',
      location: '',
      nfvoId: '',
      k8sVersion: '',
      namespace: 'default',
      cloud: ''
    });
  }

  private patchInfrastructure(infrastructure: NestRecord | null): void {
    if (!infrastructure) {
      return;
    }

    const type = firstString(infrastructure, ['type']).toLowerCase();
    const credentials = infrastructure['credentials'];
    this.infrastructureForm.patchValue({
      id: firstString(infrastructure, ['id']),
      type: type === 'openstack' ? 'openstack' : 'kubernetes',
      location: firstString(infrastructure, ['location']),
      nfvoId: firstString(infrastructure, ['nfvo_id', 'nfvoId']),
      k8sVersion: firstString(infrastructure, ['k8s_version', 'k8sVersion']),
      namespace: firstString(infrastructure, ['namespace'], 'default'),
      cloud: firstString(infrastructure, ['cloud'])
    });

    if (isNestRecord(credentials)) {
      this.credentialData = credentials;
      this.populateClouds(credentials);
    }
  }

  private validateCredentials(credentials: NestRecord): void {
    if (this.infrastructureType === 'kubernetes') {
      if (
        !firstString(credentials, ['apiVersion']) ||
        !Array.isArray(credentials['clusters']) ||
        !Array.isArray(credentials['contexts']) ||
        !Array.isArray(credentials['users'])
      ) {
        throw new Error('Select a valid kubeconfig containing clusters, contexts, and users.');
      }

      return;
    }

    if (!isNestRecord(credentials['clouds'])) {
      throw new Error('Select a valid clouds.yaml containing a clouds object.');
    }

    this.populateClouds(credentials);
  }

  private populateClouds(credentials: NestRecord): void {
    const clouds = credentials['clouds'];

    if (!isNestRecord(clouds)) {
      return;
    }

    this.cloudNames = Object.keys(clouds);
    const currentCloud = this.infrastructureForm.controls.cloud.value;
    this.infrastructureForm.controls.cloud.setValue(
      this.cloudNames.includes(currentCloud) ? currentCloud : (this.cloudNames[0] ?? '')
    );
  }

  private buildPayload(): NestRecord {
    const payload: NestRecord = { ...this.nestDocument! };

    if (!this.showInfrastructure || !this.needsInfrastructureRegistration) {
      return payload;
    }

    const values = this.infrastructureForm.getRawValue();
    const infrastructure: NestRecord = {
      id: values.id.trim(),
      type: values.type,
      location: values.location.trim(),
      nfvo_id: values.nfvoId.trim(),
      credentials: this.credentialData
    };

    if (values.type === 'kubernetes') {
      infrastructure['k8s_version'] = values.k8sVersion.trim();
      infrastructure['namespace'] = values.namespace.trim() || 'default';
    } else {
      infrastructure['cloud'] = values.cloud.trim();
    }

    payload['infrastructure'] = infrastructure;
    return payload;
  }

  private extractSliceUuid(response: string): string {
    const value = response.trim();

    if (!value) {
      return '';
    }

    try {
      const parsed = JSON.parse(value) as unknown;

      if (typeof parsed === 'string') {
        return parsed.trim();
      }

      if (isNestRecord(parsed)) {
        return firstString(parsed, ['uuid', 'id', 'slice_id', '_id']);
      }
    } catch {
      return value;
    }

    return '';
  }

  private getCreateError(error: unknown): string {
    const fallbacks: Record<number, string> = {
      400: 'The NEST is invalid, incomplete, or does not match the referenced NSDs.',
      409: 'That infrastructure ID already exists with different settings.',
      502: 'Katana could not register the infrastructure or NFVO.',
      500: 'Katana could not store the slice because of an internal error.'
    };
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    const responseBody = error instanceof HttpErrorResponse ? error.error : null;
    const hasResponseMessage =
      (typeof responseBody === 'string' && !!responseBody.trim()) || isNestRecord(responseBody);

    return hasResponseMessage
      ? getApiErrorMessage(error, fallbacks[status] ?? 'Unable to create the slice.')
      : (fallbacks[status] ?? 'Unable to create the slice.');
  }
}
