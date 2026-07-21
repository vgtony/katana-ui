import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, catchError, exhaustMap, finalize, map, of, takeUntil, timer } from 'rxjs';
import { isNestRecord } from '../../shared/nest-file.utils';
import { NsdSummary, VimSummary } from '../../models/interfaces/infrastructure.interface';
import {
  CatalogApiService,
  SliceApiService,
  VimApiService,
  getApiErrorMessage,
} from '../../shared/services/api';

interface PollSuccess {
  kind: 'success';
  value: unknown;
}
interface PollFailure {
  kind: 'failure';
  error: unknown;
}
type PollResult = PollSuccess | PollFailure;

interface NetworkServiceInstance {
  nsId: string;
  location: string;
  nfvoId: string;
  nsName: string;
  currentTarget: string;
}

@Component({
  selector: 'app-slice-status-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './slice-status-page.component.html',
  styleUrl: './slice-status-page.component.scss',
})
export class SliceStatusPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sliceApi = inject(SliceApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly formBuilder = inject(FormBuilder);
  private readonly catalogApi = inject(CatalogApiService);
  private readonly vimApi = inject(VimApiService);
  private readonly pollingStopped = new Subject<void>();
  private readonly pollingStartedAt = Date.now();
  private consecutiveFailures = 0;
  private supportingDataLoaded = false;

  protected readonly sliceId = this.route.snapshot.paramMap.get('sliceId') ?? '';
  protected readonly stages = ['Accepted', 'Placement', 'Provisioning', 'Activation', 'Running'];
  protected slice: unknown = null;
  protected status = 'Accepted';
  protected polling = true;
  protected pollMessage = 'Waiting for Katana to process the accepted slice…';
  protected pollError = '';
  protected deploymentTime: unknown = null;
  protected runtimeErrors: unknown = null;
  protected logs = '';
  protected loadingErrors = false;
  protected loadingLogs = false;
  protected diagnosticsError = '';
  protected deleteConfirmation = false;
  protected deleting = false;
  protected deleteError = '';
  protected nsds: NsdSummary[] = [];
  protected addVims: VimSummary[] = [];
  protected restartVims: VimSummary[] = [];
  protected modifying = false;
  protected modifyMessage = '';
  protected addError = '';
  protected restartError = '';

  protected readonly addNsForm = this.formBuilder.group({
    nsdId: ['', Validators.required],
    nsName: ['', Validators.required],
    nfvoId: ['', Validators.required],
    location: ['', Validators.required],
    target: ['', Validators.required],
  });

  protected readonly restartNsForm = this.formBuilder.group({
    instanceKey: ['', Validators.required],
    nsId: ['', Validators.required],
    location: ['', Validators.required],
    nfvoId: ['', Validators.required],
    currentTarget: [''],
    changeVim: [false],
    target: [''],
  });

  protected get currentStageIndex(): number {
    const status = this.status.toLowerCase();

    if (status.includes('running')) return 4;
    if (status.includes('activation') || status === 'active') return 3;
    if (status.includes('provision') || status.includes('deploy')) return 2;
    if (status.includes('placement') || status.includes('placing')) return 1;
    return 0;
  }

  protected get failed(): boolean {
    return this.status.toLowerCase().startsWith('failed');
  }

  protected get networkServiceInstances(): NetworkServiceInstance[] {
    if (!isNestRecord(this.slice) || !isNestRecord(this.slice['ns_inst_info'])) return [];
    const instances: NetworkServiceInstance[] = [];
    for (const [nsId, locations] of Object.entries(this.slice['ns_inst_info'])) {
      if (!isNestRecord(locations)) continue;
      for (const [location, raw] of Object.entries(locations)) {
        if (!isNestRecord(raw)) continue;
        instances.push({
          nsId,
          location,
          nfvoId: String(raw['nfvo-id'] ?? ''),
          nsName: String(raw['ns-name'] ?? nsId),
          currentTarget: String(raw['vim'] ?? ''),
        });
      }
    }
    return instances;
  }

  protected get addLocations(): string[] {
    return [
      ...new Set(
        this.addVims
          .filter((vim) => vim.type.toLowerCase() === 'openstack')
          .map((vim) => vim.location),
      ),
    ].sort();
  }

  protected get addTargets(): VimSummary[] {
    const location = this.addNsForm.controls.location.value?.toLowerCase() ?? '';
    return this.addVims.filter(
      (vim) => vim.type.toLowerCase() === 'openstack' && vim.location.toLowerCase() === location,
    );
  }

  protected get restartTargets(): VimSummary[] {
    const location = this.restartNsForm.controls.location.value?.toLowerCase() ?? '';
    return this.restartVims.filter((vim) => vim.location.toLowerCase() === location);
  }

  protected get sliceDetails(): string {
    return this.formatJson(this.slice);
  }

  protected get deploymentTimeText(): string {
    return this.formatJson(this.deploymentTime);
  }

  protected get runtimeErrorsText(): string {
    return this.formatJson(this.runtimeErrors);
  }

  constructor() {
    if (!this.sliceId) {
      this.polling = false;
      this.pollError = 'No slice UUID was provided.';
      return;
    }

    timer(0, 2000)
      .pipe(
        exhaustMap(() =>
          this.sliceApi.pollSlice(this.sliceId).pipe(
            map((value): PollResult => ({ kind: 'success', value })),
            catchError((error) => of({ kind: 'failure', error } as PollResult)),
          ),
        ),
        takeUntil(this.pollingStopped),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => this.handlePollResult(result));

    this.catalogApi
      .getNsList()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (nsds) => (this.nsds = nsds),
        error: (error) =>
          (this.addError = getApiErrorMessage(error, 'Unable to load the NSD catalog.')),
      });
  }

  protected nsdId(nsd: NsdSummary): string {
    return String(nsd['nsd-id'] ?? nsd['nsd_id'] ?? '');
  }

  protected nsdLabel(nsd: NsdSummary): string {
    return `${String(nsd['nsd-name'] ?? nsd['nsd_name'] ?? this.nsdId(nsd))} · ${String(nsd.nfvo_id ?? 'No owner')}`;
  }

  protected addNsdChanged(): void {
    const selected = this.nsds.find(
      (nsd) => this.nsdId(nsd) === this.addNsForm.controls.nsdId.value,
    );
    const runtime = String(selected?.deployment_runtime ?? '').toLowerCase();
    const nfvoId = String(selected?.nfvo_id ?? '');
    this.addNsForm.patchValue({ nfvoId, location: '', target: '' });
    this.addVims = [];
    this.addError =
      runtime && runtime !== 'openstack'
        ? `NSD runtime ${runtime} is not supported by the OpenStack VIM inventory.`
        : '';
    if (!nfvoId || this.addError) return;
    this.vimApi
      .getVims(nfvoId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (vims) => {
          this.addVims = vims;
          if (!vims.length) this.addError = 'No VIMs are linked to the selected NSD owner.';
        },
        error: (error) =>
          (this.addError = getApiErrorMessage(error, 'Unable to load linked VIMs.')),
      });
  }

  protected addLocationChanged(): void {
    if (!this.addTargets.some((vim) => vim.vim_id === this.addNsForm.controls.target.value)) {
      this.addNsForm.controls.target.setValue('');
    }
  }

  protected restartInstanceChanged(): void {
    const selected = this.networkServiceInstances.find(
      (instance) =>
        `${instance.nsId}:${instance.location}` === this.restartNsForm.controls.instanceKey.value,
    );
    this.restartVims = [];
    this.restartError = '';
    this.restartNsForm.patchValue({
      nsId: selected?.nsId ?? '',
      location: selected?.location ?? '',
      nfvoId: selected?.nfvoId ?? '',
      currentTarget: selected?.currentTarget ?? '',
      target: '',
    });
    if (!selected) return;
    this.vimApi
      .getVims(selected.nfvoId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (vims) =>
          (this.restartVims = vims.filter(
            (vim) => vim.location.toLowerCase() === selected.location.toLowerCase(),
          )),
        error: (error) =>
          (this.restartError = getApiErrorMessage(error, 'Unable to load restart targets.')),
      });
  }

  protected changeVimChanged(): void {
    if (!this.restartNsForm.controls.changeVim.value)
      this.restartNsForm.controls.target.setValue('');
  }

  protected addNetworkService(): void {
    this.modifyMessage = '';
    this.addError = '';
    if (
      this.modifying ||
      this.addNsForm.invalid ||
      !this.addTargets.some((vim) => vim.vim_id === this.addNsForm.controls.target.value)
    ) {
      this.addNsForm.markAllAsTouched();
      this.addError = 'Complete every AddNS field and select a linked target.';
      return;
    }
    const value = this.addNsForm.getRawValue();
    this.modifying = true;
    this.sliceApi
      .modifySlice(this.sliceId, {
        domain: 'NFV',
        action: 'AddNS',
        details: {
          nsd_id: value.nsdId,
          ns_name: value.nsName,
          location: value.location,
          nfvo_id: value.nfvoId,
          target: value.target,
        },
      })
      .pipe(
        finalize(() => (this.modifying = false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.modifyMessage = 'Network service added successfully.';
          this.addNsForm.reset({ nsdId: '', nsName: '', nfvoId: '', location: '', target: '' });
          this.addVims = [];
          this.refreshSlice();
        },
        error: (error) =>
          (this.addError = getApiErrorMessage(error, 'Unable to add the network service.')),
      });
  }

  protected restartNetworkService(): void {
    this.modifyMessage = '';
    this.restartError = '';
    const value = this.restartNsForm.getRawValue();
    const selected = this.networkServiceInstances.find(
      (instance) => `${instance.nsId}:${instance.location}` === value.instanceKey,
    );
    const targetValid =
      !value.changeVim ||
      (!!selected &&
        !!value.target &&
        this.restartVims.some(
          (vim) =>
            vim.vim_id === value.target &&
            vim.location.toLowerCase() === selected.location.toLowerCase(),
        ));
    if (this.modifying || !selected || !targetValid) {
      this.restartNsForm.markAllAsTouched();
      this.restartError = value.changeVim
        ? 'Select a VIM linked to this NS NFVO in the same location.'
        : 'Select a network service instance.';
      return;
    }
    this.modifying = true;
    this.sliceApi
      .modifySlice(this.sliceId, {
        domain: 'NFV',
        action: 'RestartNS',
        details: {
          ns_id: selected.nsId,
          location: selected.location,
          change_vim: value.changeVim,
          ...(value.changeVim ? { target: value.target } : {}),
        },
      })
      .pipe(
        finalize(() => (this.modifying = false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.modifyMessage = 'Network service restart requested successfully.';
          this.refreshSlice();
        },
        error: (error) =>
          (this.restartError = getApiErrorMessage(error, 'Unable to restart the network service.')),
      });
  }

  protected stageClass(index: number): string {
    if (this.failed && index === this.currentStageIndex) return 'slice-progress__step--failed';
    if (index < this.currentStageIndex || (index === 4 && this.currentStageIndex === 4)) {
      return 'slice-progress__step--complete';
    }
    if (index === this.currentStageIndex) return 'slice-progress__step--current';
    return '';
  }

  protected loadErrors(): void {
    if (this.loadingErrors) return;
    this.loadingErrors = true;
    this.diagnosticsError = '';
    this.sliceApi
      .getSliceErrors(this.sliceId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (value) => {
          this.runtimeErrors = value;
          this.loadingErrors = false;
        },
        error: (error) => {
          this.diagnosticsError = getApiErrorMessage(error, 'Unable to load runtime errors.');
          this.loadingErrors = false;
        },
      });
  }

  protected loadLogs(): void {
    if (this.loadingLogs) return;
    this.loadingLogs = true;
    this.diagnosticsError = '';
    this.sliceApi
      .getSliceLogs(this.sliceId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (value) => {
          this.logs = value;
          this.loadingLogs = false;
        },
        error: (error) => {
          this.diagnosticsError = getApiErrorMessage(error, 'Unable to load slice logs.');
          this.loadingLogs = false;
        },
      });
  }

  protected deleteSlice(): void {
    if (this.deleting) return;
    this.deleting = true;
    this.deleteError = '';
    this.sliceApi
      .deleteSlice(this.sliceId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => void this.router.navigate(['/monitoring']),
        error: (error) => {
          this.deleteError = getApiErrorMessage(error, 'Unable to delete this slice.');
          this.deleting = false;
        },
      });
  }

  private handlePollResult(result: PollResult): void {
    if (result.kind === 'failure') {
      this.handlePollFailure(result.error);
      this.changeDetectorRef.markForCheck();
      return;
    }

    this.consecutiveFailures = 0;
    this.slice = result.value;
    this.status = this.readStatus(result.value);
    this.pollMessage = this.status;

    if (!this.supportingDataLoaded) {
      this.supportingDataLoaded = true;
      this.loadDeploymentTime();
    }

    if (this.status.toLowerCase() === 'running' || this.failed) {
      this.stopPolling();
      if (this.failed) this.loadErrors();
    }

    this.changeDetectorRef.markForCheck();
  }

  private refreshSlice(): void {
    this.sliceApi
      .getSlice(this.sliceId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (slice) => {
          this.slice = slice;
          this.status = this.readStatus(slice);
          this.changeDetectorRef.markForCheck();
        },
        error: (error) =>
          (this.diagnosticsError = getApiErrorMessage(error, 'Unable to refresh slice details.')),
      });
  }

  private handlePollFailure(error: unknown): void {
    const isTransient404 =
      error instanceof HttpErrorResponse &&
      error.status === 404 &&
      Date.now() - this.pollingStartedAt <= 10_000;

    if (isTransient404) {
      this.pollMessage = 'Accepted — waiting for the slice record to become available…';
      return;
    }

    this.consecutiveFailures += 1;
    this.pollMessage = `Status request failed (${this.consecutiveFailures}/3). Retrying…`;

    if (this.consecutiveFailures >= 3) {
      this.pollError = getApiErrorMessage(
        error,
        'Slice status could not be loaded after three attempts.',
      );
      this.stopPolling();
    }
  }

  private stopPolling(): void {
    this.polling = false;
    this.pollingStopped.next();
    this.pollingStopped.complete();
  }

  private loadDeploymentTime(): void {
    this.sliceApi
      .getSliceDeploymentTime(this.sliceId)
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((value) => (this.deploymentTime = value));
  }

  private readStatus(value: unknown): string {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (!isNestRecord(value)) return 'Accepted';
    const status = value['status'] ?? value['state'];
    return status === null || status === undefined || status === ''
      ? 'Accepted'
      : String(status).trim();
  }

  private formatJson(value: unknown): string {
    if (value === null || value === undefined || value === '') return '';
    return typeof value === 'string'
      ? value
      : JSON.stringify(this.sanitizeForDisplay(value), null, 2);
  }

  private sanitizeForDisplay(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeForDisplay(item));
    }

    if (!isNestRecord(value)) {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        /(credentials?|password|secret|token|kubeconfig)/i.test(key)
          ? '[redacted]'
          : this.sanitizeForDisplay(item),
      ]),
    );
  }
}
