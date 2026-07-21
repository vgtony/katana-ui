import { Injectable, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { BootstrapStatus } from '../../models/interfaces/infrastructure.interface';
import { BootstrapApiService, getApiErrorMessage } from './api';

@Injectable({ providedIn: 'root' })
export class InfrastructureStatusService {
  private readonly bootstrapApi = inject(BootstrapApiService);

  readonly status = signal<BootstrapStatus | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');

  refresh(): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.bootstrapApi
      .getStatus()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (status) => this.status.set(status),
        error: (error) =>
          this.error.set(getApiErrorMessage(error, 'Unable to load infrastructure setup status.')),
      });
  }

  setStatus(status: BootstrapStatus): void {
    this.status.set(status);
    this.error.set('');
  }
}
