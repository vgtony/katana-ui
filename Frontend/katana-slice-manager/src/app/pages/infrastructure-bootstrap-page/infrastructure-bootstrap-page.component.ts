import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize, forkJoin } from 'rxjs';
import { BootstrapManifest } from '../../models/interfaces/infrastructure.interface';
import {
  BootstrapApiService,
  CatalogApiService,
  getApiErrorMessage,
  NfvoApiService,
  VimApiService,
} from '../../shared/services/api';
import { InfrastructureStatusService } from '../../shared/services/infrastructure-status.service';

interface LinkDraft {
  id: string;
  accountName: string;
  config: string;
}
interface NfvoDraft {
  id: string;
  name: string;
  endpoint: string;
  project: string;
  username: string;
  password: string;
  tlsVerify: boolean;
}
interface VimDraft {
  id: string;
  name: string;
  location: string;
  authUrl: string;
  project: string;
  username: string;
  password: string;
  verify: boolean;
  links: LinkDraft[];
}

function jsonObjectValidator(control: AbstractControl): ValidationErrors | null {
  if (!control.value) return null;

  try {
    const parsedValue = JSON.parse(String(control.value)) as unknown;
    return parsedValue && typeof parsedValue === 'object' && !Array.isArray(parsedValue)
      ? null
      : { jsonObject: true };
  } catch {
    return { jsonObject: true };
  }
}

@Component({
  selector: 'app-infrastructure-bootstrap-page',
  imports: [DatePipe, ReactiveFormsModule, RouterLink],
  templateUrl: './infrastructure-bootstrap-page.component.html',
  styleUrl: './infrastructure-bootstrap-page.component.scss',
})
export class InfrastructureBootstrapPageComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly bootstrapApi = inject(BootstrapApiService);
  private readonly nfvoApi = inject(NfvoApiService);
  private readonly vimApi = inject(VimApiService);
  private readonly catalogApi = inject(CatalogApiService);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);

  protected readonly infrastructureStatus = inject(InfrastructureStatusService);
  protected submitting = false;
  protected submitMessage = '';
  protected submitError = '';
  protected draftError = '';
  protected resourceErrors = new Map<string, string>();

  protected readonly form = this.formBuilder.group({
    nfvos: this.formBuilder.array([this.createNfvoGroup()]),
    vims: this.formBuilder.array([this.createVimGroup()]),
  });

  constructor() {
    this.infrastructureStatus.refresh();
  }

  protected get nfvos(): FormArray<FormGroup> {
    return this.form.controls.nfvos as FormArray<FormGroup>;
  }

  protected get vims(): FormArray<FormGroup> {
    return this.form.controls.vims as FormArray<FormGroup>;
  }

  protected linksFor(vimIndex: number): FormArray<FormGroup> {
    return this.vims.at(vimIndex).get('links') as FormArray<FormGroup>;
  }

  protected addNfvo(): void {
    this.nfvos.push(this.createNfvoGroup());
  }

  protected removeNfvo(index: number): void {
    const id = String(this.nfvos.at(index).get('id')?.value ?? '').trim();
    this.nfvos.removeAt(index);
    if (id) {
      for (let vimIndex = 0; vimIndex < this.vims.length; vimIndex += 1) {
        const links = this.linksFor(vimIndex);
        for (let linkIndex = links.length - 1; linkIndex >= 0; linkIndex -= 1) {
          if (String(links.at(linkIndex).get('id')?.value ?? '') === id) links.removeAt(linkIndex);
        }
      }
    }
  }

  protected addVim(): void {
    this.vims.push(this.createVimGroup());
  }

  protected removeVim(index: number): void {
    this.vims.removeAt(index);
  }

  protected addLink(vimIndex: number): void {
    const used = new Set(
      this.linksFor(vimIndex).controls.map((link) => String(link.get('id')?.value ?? '')),
    );
    const id =
      this.nfvos.controls
        .map((nfvo) => String(nfvo.get('id')?.value ?? '').trim())
        .find((candidate) => candidate && !used.has(candidate)) ?? '';
    this.linksFor(vimIndex).push(this.createLinkGroup(id));
  }

  protected removeLink(vimIndex: number, linkIndex: number): void {
    this.linksFor(vimIndex).removeAt(linkIndex);
  }

  protected resourceError(id: unknown): string {
    return this.resourceErrors.get(String(id ?? '').trim()) ?? '';
  }

  protected submit(): void {
    this.submitMessage = '';
    this.submitError = '';
    this.draftError = '';
    this.resourceErrors.clear();

    if (this.submitting || !this.validateDraft()) return;
    const payload = this.buildManifest();
    this.submitting = true;

    this.bootstrapApi
      .bootstrap(payload)
      .pipe(
        finalize(() => {
          this.clearSecrets();
          this.submitting = false;
          this.changeDetectorRef.markForCheck();
        }),
      )
      .subscribe({
        next: (status) => {
          this.infrastructureStatus.setStatus(status);
          forkJoin({
            status: this.bootstrapApi.getStatus(),
            nfvos: this.nfvoApi.getNfvos(),
            vims: this.vimApi.getVims(),
            nsds: this.catalogApi.getNsList(),
          }).subscribe({
            next: ({ status: refreshedStatus }) => {
              this.infrastructureStatus.setStatus(refreshedStatus);
              this.submitMessage = 'Infrastructure reconciliation completed successfully.';
              this.changeDetectorRef.markForCheck();
            },
            error: (error) => {
              this.submitError = getApiErrorMessage(
                error,
                'Reconciliation completed, but the refreshed inventory could not be loaded.',
              );
              this.changeDetectorRef.markForCheck();
            },
          });
        },
        error: (error: unknown) => this.handleSubmitError(error),
      });
  }

  private createNfvoGroup(): FormGroup {
    return this.formBuilder.group({
      id: ['', Validators.required],
      name: [''],
      endpoint: ['', Validators.required],
      project: ['admin', Validators.required],
      username: ['', Validators.required],
      password: ['', Validators.required],
      tlsVerify: [true],
    });
  }

  private createVimGroup(): FormGroup {
    return this.formBuilder.group({
      id: ['', Validators.required],
      name: [''],
      location: ['', Validators.required],
      authUrl: ['', Validators.required],
      project: ['admin', Validators.required],
      username: ['', Validators.required],
      password: ['', Validators.required],
      verify: [true],
      links: this.formBuilder.array<FormGroup>([]),
    });
  }

  private createLinkGroup(id = ''): FormGroup {
    return this.formBuilder.group({
      id: [id, Validators.required],
      accountName: [''],
      config: ['{}', [Validators.required, jsonObjectValidator]],
    });
  }

  private validateDraft(): boolean {
    if (!this.nfvos.length || !this.vims.length || this.form.invalid) {
      this.form.markAllAsTouched();
      this.draftError = 'Complete every required NFVO, VIM, credential, and link field.';
      return false;
    }

    const nfvoIds = this.nfvos.controls.map((group) => String(group.get('id')?.value ?? '').trim());
    if (new Set(nfvoIds).size !== nfvoIds.length) {
      this.draftError = 'NFVO IDs must be unique.';
      return false;
    }
    const nfvoIdSet = new Set(nfvoIds);

    const vimIds = this.vims.controls.map((group) => String(group.get('id')?.value ?? '').trim());
    if (new Set(vimIds).size !== vimIds.length) {
      this.draftError = 'VIM IDs must be unique.';
      return false;
    }

    const accountNames = new Set<string>();
    for (let vimIndex = 0; vimIndex < this.vims.length; vimIndex += 1) {
      const vimId = vimIds[vimIndex];
      const links = this.linksFor(vimIndex);
      if (!links.length) {
        this.resourceErrors.set(vimId, 'Link this VIM to at least one NFVO.');
        return false;
      }
      const linkedIds = links.controls.map((link) => String(link.get('id')?.value ?? '').trim());
      if (new Set(linkedIds).size !== linkedIds.length) {
        this.resourceErrors.set(vimId, 'Each NFVO can be linked to a VIM only once.');
        return false;
      }
      for (const link of links.controls) {
        const value = link.getRawValue() as LinkDraft;
        const nfvoId = value.id.trim();
        if (!nfvoIdSet.has(nfvoId)) {
          this.resourceErrors.set(vimId, `Link references unknown NFVO ${nfvoId}.`);
          return false;
        }
        const accountName = value.accountName.trim() || `katana-${nfvoId}-${vimId}`;
        const accountKey = `${nfvoId}:${accountName}`;
        if (accountNames.has(accountKey)) {
          this.resourceErrors.set(
            vimId,
            `Account name ${accountName} is duplicated for NFVO ${nfvoId}.`,
          );
          return false;
        }
        accountNames.add(accountKey);
      }
    }
    return true;
  }

  private buildManifest(): BootstrapManifest {
    const nfvos = this.nfvos.getRawValue() as NfvoDraft[];
    const vims = this.vims.getRawValue() as VimDraft[];
    return {
      api_version: 'katana/v1',
      nfvos: nfvos.map((nfvo) => ({
        id: nfvo.id.trim(),
        name: nfvo.name.trim() || undefined,
        type: 'osm',
        endpoint: nfvo.endpoint.trim(),
        project: nfvo.project.trim(),
        credentials: { username: nfvo.username.trim(), password: nfvo.password },
        tls_verify: nfvo.tlsVerify,
      })),
      vims: vims.map((vim) => ({
        id: vim.id.trim(),
        name: vim.name.trim() || undefined,
        type: 'openstack',
        location: vim.location.trim(),
        verify: vim.verify,
        credentials: {
          auth: {
            auth_url: vim.authUrl.trim(),
            username: vim.username.trim(),
            password: vim.password,
            project_name: vim.project.trim(),
          },
        },
        nfvos: vim.links.map((link) => ({
          id: link.id.trim(),
          ...(link.accountName.trim() ? { account_name: link.accountName.trim() } : {}),
          config: JSON.parse(link.config) as Record<string, unknown>,
        })),
      })),
    };
  }

  private clearSecrets(): void {
    for (const nfvo of this.nfvos.controls) nfvo.get('password')?.reset('');
    for (const vim of this.vims.controls) vim.get('password')?.reset('');
  }

  private handleSubmitError(error: unknown): void {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    const message = getApiErrorMessage(error, 'Unable to reconcile infrastructure.');
    if (status === 409) {
      this.submitError = message.toLowerCase().includes('another infrastructure bootstrap')
        ? 'Another infrastructure bootstrap is running. Wait for it to finish, then retry.'
        : `Reconciliation conflict: ${message}`;
    } else if (status === 502) {
      this.submitError = `Remote OSM/OpenStack validation failed: ${message}`;
    } else {
      this.submitError = message;
    }
    for (const group of [...this.nfvos.controls, ...this.vims.controls]) {
      const id = String(group.get('id')?.value ?? '').trim();
      if (id && message.includes(id)) this.resourceErrors.set(id, message);
    }
  }
}
