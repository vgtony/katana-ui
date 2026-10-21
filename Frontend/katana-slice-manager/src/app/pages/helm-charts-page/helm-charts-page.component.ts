import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Subscription, finalize } from 'rxjs';
import {
  CatalogApiService,
  HelmCatalogue,
  HelmUploadResult,
  getApiErrorMessage,
} from '../../shared/services/api';

@Component({
  selector: 'app-helm-charts-page',
  imports: [FormsModule, DecimalPipe],
  templateUrl: './helm-charts-page.component.html',
  styleUrl: './helm-charts-page.component.scss',
})
export class HelmChartsPageComponent {
  private readonly api = inject(CatalogApiService);
  private readonly destroyRef = inject(DestroyRef);
  // Dedicated operator credentials live only in this page's memory, never browser storage.
  private authorization = '';
  private uploadRequest?: Subscription;
  protected readonly uploadProgress = signal<number | null>(null);
  protected readonly uploadCancelled = signal(false);
  protected readonly needsReconciliation = signal(false);
  protected signInAttempted = false;
  protected username = '';
  protected password = '';
  protected readonly signedIn = signal(false);
  protected readonly loading = signal(false);
  protected readonly uploading = signal(false);
  protected readonly catalogue = signal<HelmCatalogue>({ charts: [], max_bytes: 104857600 });
  protected readonly catalogueError = signal('');
  protected readonly uploadError = signal('');
  protected readonly selectedFile = signal<File | null>(null);
  protected readonly uploaded = signal<HelmUploadResult | null>(null);
  protected readonly chartName = signal('');
  protected readonly chartVersion = signal('');
  protected readonly currentChart = computed(() =>
    this.catalogue().charts.find((chart) => chart.name === this.chartName()),
  );
  protected readonly currentVersion = computed(() =>
    this.currentChart()?.versions.find((version) => version.version === this.chartVersion()),
  );
  protected readonly fileError = computed(() => {
    const file = this.selectedFile();
    if (!file) return '';
    if (!file.name.endsWith('.tgz')) return 'Choose a packaged Helm chart (.tgz).';
    if (!file.size) return 'The selected file is empty.';
    if (file.size > this.catalogue().max_bytes)
      return 'The selected file exceeds the upload limit.';
    return '';
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.authorization = '';
      this.password = '';
    });
  }

  protected signIn(): void {
    this.signInAttempted = true;
    if (this.loading() || !this.username.trim() || !this.password) return;
    const bytes = new TextEncoder().encode(`${this.username.trim()}:${this.password}`);
    this.authorization = `Basic ${btoa(String.fromCharCode(...bytes))}`;
    this.password = '';
    this.refresh();
  }

  protected signOut(): void {
    if (this.uploading() || this.loading()) return;
    this.authorization = '';
    this.password = '';
    this.signedIn.set(false);
    this.uploadCancelled.set(false);
    this.needsReconciliation.set(false);
    this.uploadProgress.set(null);
    this.catalogue.set({ charts: [], max_bytes: 104857600 });
    this.selectedFile.set(null);
    this.uploaded.set(null);
    this.uploadError.set('');
    this.catalogueError.set('');
  }

  protected refresh(): void {
    if (this.loading() || !this.authorization) return;
    this.loading.set(true);
    this.catalogueError.set('');
    this.api
      .getHelmCharts(this.authorization)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (catalogue) => {
          this.signedIn.set(true);
          this.catalogue.set(catalogue);
          this.needsReconciliation.set(false);
          const name = catalogue.charts.some((chart) => chart.name === this.chartName())
            ? this.chartName()
            : (catalogue.charts[0]?.name ?? '');
          const previousVersion = this.chartVersion();
          this.selectChart(name);
          if (this.currentChart()?.versions.some((item) => item.version === previousVersion)) {
            this.chartVersion.set(previousVersion);
          }
        },
        error: (error: unknown) => {
          this.catalogueError.set(getApiErrorMessage(error, 'Unable to load the chart catalogue.'));
          this.handleUnauthorized(error);
          if (!this.signedIn()) this.authorization = '';
        },
      });
  }

  protected selectChart(name: string): void {
    this.chartName.set(name);
    this.chartVersion.set(this.currentChart()?.versions[0]?.version ?? '');
  }

  protected selectFile(event: Event): void {
    this.uploadCancelled.set(false);
    this.uploadProgress.set(null);
    this.selectedFile.set((event.target as HTMLInputElement).files?.[0] ?? null);
    this.uploadError.set('');
    this.uploaded.set(null);
  }

  protected upload(input: HTMLInputElement): void {
    const file = this.selectedFile();
    if (
      !this.signedIn() ||
      !file ||
      this.fileError() ||
      this.uploading() ||
      this.needsReconciliation()
    )
      return;
    this.uploadError.set('');
    this.uploaded.set(null);
    this.uploading.set(true);
    this.uploadProgress.set(null);
    this.uploadCancelled.set(false);
    this.uploadRequest = this.api
      .uploadHelmChart(file, this.authorization)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.uploading.set(false)),
      )
      .subscribe({
        next: (event) => {
          if (event.type === HttpEventType.UploadProgress) {
            this.uploadProgress.set(
              event.total ? Math.min(100, Math.round((event.loaded / event.total) * 100)) : null,
            );
            return;
          }
          if (event.type !== HttpEventType.Response || !event.body) return;
          const result = event.body;
          this.uploaded.set(result);
          this.selectedFile.set(null);
          input.value = '';
          this.chartName.set(result.name);
          this.chartVersion.set(result.version);
          this.refresh();
        },
        error: (error: unknown) => {
          let message = getApiErrorMessage(error, 'Unable to upload the chart.');
          if (error instanceof HttpErrorResponse) {
            if (error.status === 413)
              message =
                'The chart exceeds the upload limit configured on Katana or the repository.';
            if (error.status === 0) {
              this.needsReconciliation.set(true);
              message =
                'Connection lost. Refresh the catalogue before retrying; the chart may already have uploaded.';
            }
            if (error.error?.request_id) message += ` Request ID: ${error.error.request_id}`;
          }
          this.uploadError.set(message);
          this.handleUnauthorized(error);
        },
      });
  }

  protected cancelUpload(): void {
    if (!this.uploading()) return;
    this.uploadRequest?.unsubscribe();
    this.uploadCancelled.set(true);
    this.needsReconciliation.set(true);
  }

  private handleUnauthorized(error: unknown): void {
    if (error instanceof HttpErrorResponse && error.status === 401) {
      this.authorization = '';
      this.signedIn.set(false);
    }
  }
}
