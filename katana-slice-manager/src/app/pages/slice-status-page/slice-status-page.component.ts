import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, catchError, exhaustMap, map, of, takeUntil, timer } from 'rxjs';
import { isNestRecord } from '../../shared/nest-file.utils';
import { SliceApiService, getApiErrorMessage } from '../../shared/services/api';

interface PollSuccess { kind: 'success'; value: unknown }
interface PollFailure { kind: 'failure'; error: unknown }
type PollResult = PollSuccess | PollFailure;

@Component({
  selector: 'app-slice-status-page',
  imports: [RouterLink],
  templateUrl: './slice-status-page.component.html',
  styleUrl: './slice-status-page.component.scss'
})
export class SliceStatusPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sliceApi = inject(SliceApiService);
  private readonly destroyRef = inject(DestroyRef);
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
            catchError((error) => of({ kind: 'failure', error } as PollResult))
          )
        ),
        takeUntil(this.pollingStopped),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((result) => this.handlePollResult(result));
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
        }
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
        }
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
        }
      });
  }

  private handlePollResult(result: PollResult): void {
    if (result.kind === 'failure') {
      this.handlePollFailure(result.error);
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
      this.pollError = getApiErrorMessage(error, 'Slice status could not be loaded after three attempts.');
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
      .pipe(catchError(() => of(null)), takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => (this.deploymentTime = value));
  }

  private readStatus(value: unknown): string {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (!isNestRecord(value)) return 'Accepted';
    const status = value['status'] ?? value['state'];
    return status === null || status === undefined || status === '' ? 'Accepted' : String(status);
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
          : this.sanitizeForDisplay(item)
      ])
    );
  }
}
