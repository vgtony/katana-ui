import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { NsdSummary, VimSummary } from '../../models/interfaces/infrastructure.interface';
import {
  NestRecord,
  NestSummary,
  firstString,
  isNestRecord,
  parseStructuredFile,
  summarizeNest,
} from '../../shared/nest-file.utils';
import {
  CatalogApiService,
  SliceApiService,
  VimApiService,
  getApiErrorMessage,
} from '../../shared/services/api';

interface ServiceRowValue {
  nsdId: string;
  nsName: string;
  nfvoId: string;
  placement: string;
  target: string;
  optional: boolean;
}

@Component({
  selector: 'app-create-slice-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './create-slice-page.component.html',
  styleUrl: './create-slice-page.component.scss',
})
export class CreateSlicePageComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly sliceApi = inject(SliceApiService);
  private readonly catalogApi = inject(CatalogApiService);
  private readonly vimApi = inject(VimApiService);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly vimOptions = new WeakMap<FormGroup, VimSummary[]>();
  private readonly targetLoading = new WeakSet<FormGroup>();
  private readonly serverRowErrors = new WeakMap<FormGroup, string>();

  protected nestFileName = '';
  protected nestDocument: NestRecord | null = null;
  protected summary: NestSummary | null = null;
  protected nestError = '';
  protected catalogError = '';
  protected nsds: NsdSummary[] = [];
  protected loadingCatalog = true;
  protected submitting = false;
  protected submitError = '';

  protected readonly serviceForm = this.formBuilder.group({
    rows: this.formBuilder.array<FormGroup>([]),
  });

  protected get rows(): FormArray<FormGroup> {
    return this.serviceForm.controls.rows;
  }

  protected get canDeploy(): boolean {
    return (
      !!this.nestDocument &&
      !this.submitting &&
      this.rows.length > 0 &&
      this.serviceForm.valid &&
      this.rows.controls.every((row) => {
        const target = String(row.get('target')?.value ?? '');
        return !!target && this.targetsFor(row).some((vim) => vim.vim_id === target);
      })
    );
  }

  ngOnInit(): void {
    this.loadCatalog();
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

  protected addService(): void {
    this.rows.push(this.createServiceGroup());
  }

  protected removeService(index: number): void {
    this.rows.removeAt(index);
  }

  protected nsdChanged(row: FormGroup): void {
    const nsd = this.selectedNsd(row);
    row.patchValue({ nfvoId: this.nsdOwner(nsd), placement: '', target: '' });
    this.serverRowErrors.delete(row);
    this.loadVims(row);
  }

  protected placementChanged(row: FormGroup): void {
    const selectedTarget = String(row.get('target')?.value ?? '');
    if (!this.targetsFor(row).some((vim) => vim.vim_id === selectedTarget)) {
      row.get('target')?.setValue('');
    }
    this.serverRowErrors.delete(row);
  }

  protected catalogNsdId(nsd: NsdSummary): string {
    return String(nsd['nsd-id'] ?? nsd['nsd_id'] ?? '');
  }

  protected nsdLabel(nsd: NsdSummary): string {
    const name = String(nsd['nsd-name'] ?? nsd['nsd_name'] ?? this.catalogNsdId(nsd));
    return `${name} · ${this.nsdOwner(nsd) || 'No owner'} · ${this.nsdRuntime(nsd) || 'unknown'}`;
  }

  protected placementOptions(row: FormGroup): string[] {
    const runtime = this.nsdRuntime(this.selectedNsd(row));
    return [
      ...new Set(
        (this.vimOptions.get(row) ?? [])
          .filter((vim) => vim.type.toLowerCase() === runtime)
          .map((vim) => vim.location)
          .filter(Boolean),
      ),
    ].sort();
  }

  protected targetsFor(row: FormGroup): VimSummary[] {
    const runtime = this.nsdRuntime(this.selectedNsd(row));
    const placement = String(row.get('placement')?.value ?? '').toLowerCase();
    return (this.vimOptions.get(row) ?? []).filter(
      (vim) => vim.type.toLowerCase() === runtime && vim.location.toLowerCase() === placement,
    );
  }

  protected isLoadingTargets(row: FormGroup): boolean {
    return this.targetLoading.has(row);
  }

  protected rowError(row: FormGroup): string {
    const serverError = this.serverRowErrors.get(row);
    if (serverError) return serverError;
    const nsd = this.selectedNsd(row);
    const runtime = this.nsdRuntime(nsd);
    if (nsd && runtime !== 'openstack') {
      return `NSD runtime ${runtime || 'unknown'} is not supported by the OpenStack VIM inventory.`;
    }
    if (
      row.get('nfvoId')?.value &&
      !this.isLoadingTargets(row) &&
      !this.placementOptions(row).length
    ) {
      return 'No linked OpenStack VIM is available for this NSD and NFVO.';
    }
    if (row.touched && row.invalid)
      return 'Select an NSD, enter an NS name, choose a placement, and explicitly select a target.';
    return '';
  }

  protected deploy(): void {
    this.submitError = '';
    for (const row of this.rows.controls) this.serverRowErrors.delete(row);
    if (!this.canDeploy || !this.nestDocument) {
      this.serviceForm.markAllAsTouched();
      return;
    }

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
        error: (error: unknown) => this.handleCreateError(error),
      });
  }

  private loadCatalog(): void {
    this.loadingCatalog = true;
    this.catalogError = '';
    this.catalogApi.getNsList().subscribe({
      next: (nsds) => {
        this.nsds = nsds;
        this.loadingCatalog = false;
        for (const row of this.rows.controls) this.syncRowWithCatalog(row);
      },
      error: (error) => {
        this.catalogError = getApiErrorMessage(error, 'Unable to load the NSD catalog.');
        this.loadingCatalog = false;
      },
    });
  }

  private async loadNest(file: File | null): Promise<void> {
    if (!file) return;
    this.resetUpload();
    try {
      const nest = parseStructuredFile(await file.text());
      this.nestDocument = nest;
      this.nestFileName = file.name;
      this.summary = summarizeNest(nest);
      const serviceDescriptor = isNestRecord(nest['service_descriptor'])
        ? nest['service_descriptor']
        : null;
      const services = Array.isArray(serviceDescriptor?.['ns_list'])
        ? serviceDescriptor['ns_list']
        : [];
      for (const service of services) {
        const value = isNestRecord(service) ? service : {};
        this.rows.push(
          this.createServiceGroup({
            nsdId: firstString(value, ['nsd-id', 'nsd_id', 'nsdId']),
            nsName: firstString(value, ['ns-name', 'ns_name', 'nsName']),
            nfvoId: firstString(value, ['nfvo-id', 'nfvo_id', 'nfvoId']),
            placement: firstString(value, ['placement']),
            target: firstString(value, ['target']),
            optional: Boolean(value['optional']),
          }),
        );
      }
      if (!this.rows.length) this.addService();
      for (const row of this.rows.controls) this.syncRowWithCatalog(row);
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
    this.submitError = '';
    this.rows.clear();
  }

  private createServiceGroup(value?: Partial<ServiceRowValue>): FormGroup {
    return this.formBuilder.group({
      nsdId: [value?.nsdId ?? '', Validators.required],
      nsName: [value?.nsName ?? '', Validators.required],
      nfvoId: [value?.nfvoId ?? '', Validators.required],
      placement: [value?.placement ?? '', Validators.required],
      target: [value?.target ?? '', Validators.required],
      optional: [value?.optional ?? false],
    });
  }

  private syncRowWithCatalog(row: FormGroup): void {
    const nsd = this.selectedNsd(row);
    if (!nsd) return;
    row.get('nfvoId')?.setValue(this.nsdOwner(nsd));
    this.loadVims(row);
  }

  private loadVims(row: FormGroup): void {
    const nfvoId = String(row.get('nfvoId')?.value ?? '').trim();
    this.vimOptions.set(row, []);
    if (!nfvoId) return;
    this.targetLoading.add(row);
    this.vimApi.getVims(nfvoId).subscribe({
      next: (vims) => {
        this.vimOptions.set(row, vims);
        this.targetLoading.delete(row);
        const selectedTarget = String(row.get('target')?.value ?? '');
        if (selectedTarget && !this.targetsFor(row).some((vim) => vim.vim_id === selectedTarget)) {
          row.get('target')?.setValue('');
        }
        this.changeDetectorRef.markForCheck();
      },
      error: (error) => {
        this.targetLoading.delete(row);
        this.serverRowErrors.set(row, getApiErrorMessage(error, 'Unable to load linked VIMs.'));
        this.changeDetectorRef.markForCheck();
      },
    });
  }

  private selectedNsd(row: FormGroup): NsdSummary | null {
    const id = String(row.get('nsdId')?.value ?? '');
    return this.nsds.find((nsd) => this.catalogNsdId(nsd) === id) ?? null;
  }

  private nsdOwner(nsd: NsdSummary | null): string {
    return String(nsd?.nfvo_id ?? '');
  }

  private nsdRuntime(nsd: NsdSummary | null): string {
    return String(nsd?.deployment_runtime ?? '').toLowerCase();
  }

  private buildPayload(): NestRecord {
    const payload = JSON.parse(JSON.stringify(this.nestDocument)) as NestRecord;
    delete payload['infrastructure'];
    delete payload['credentials_file'];
    delete payload['credentialsFile'];
    const existingDescriptor = isNestRecord(payload['service_descriptor'])
      ? payload['service_descriptor']
      : {};
    const existingRows = Array.isArray(existingDescriptor['ns_list'])
      ? existingDescriptor['ns_list']
      : [];
    existingDescriptor['ns_list'] = this.rows.getRawValue().map((raw, index) => {
      const value = raw as ServiceRowValue;
      const existing = isNestRecord(existingRows[index]) ? { ...existingRows[index] } : {};
      for (const key of [
        'nsd-id',
        'nsd_id',
        'nsdId',
        'ns-name',
        'ns_name',
        'nsName',
        'nfvo-id',
        'nfvo_id',
        'nfvoId',
        'target',
        'placement',
        'osm-vim-account-id',
        'osm_vim_account_id',
        'vim-id',
        'vim_id',
        'credentials_file',
        'credentials',
      ])
        delete existing[key];
      return {
        ...existing,
        'nsd-id': value.nsdId.trim(),
        'ns-name': value.nsName.trim(),
        'nfvo-id': value.nfvoId.trim(),
        target: value.target.trim(),
        placement: value.placement.trim(),
        optional: value.optional,
      };
    });
    payload['service_descriptor'] = existingDescriptor;
    return payload;
  }

  private extractSliceUuid(response: string): string {
    const value = response.trim();
    if (!value) return '';
    try {
      const parsed = JSON.parse(value) as unknown;
      if (typeof parsed === 'string') return parsed.trim();
      if (isNestRecord(parsed)) return firstString(parsed, ['uuid', 'id', 'slice_id', '_id']);
    } catch {
      return value;
    }
    return '';
  }

  private handleCreateError(error: unknown): void {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    const fallbacks: Record<number, string> = {
      400: 'The slice contains an invalid or incompatible network-service selection.',
      409: 'The slice conflicts with an existing resource.',
      502: 'Katana could not validate the selected remote infrastructure.',
      500: 'Katana could not store the slice because of an internal error.',
    };
    const message = getApiErrorMessage(error, fallbacks[status] ?? 'Unable to create the slice.');
    const row = this.rows.controls.find((candidate) => {
      const value = candidate.getRawValue() as ServiceRowValue;
      return [value.nsdId, value.nfvoId, value.target].some((id) => id && message.includes(id));
    });
    if (status === 400 && row) this.serverRowErrors.set(row, message);
    else this.submitError = message;
  }
}
