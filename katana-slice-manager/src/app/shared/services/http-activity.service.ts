import { Injectable, computed, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class HttpActivityService {
  private readonly pendingRequestCount = signal(0);

  readonly isLoading = computed(() => this.pendingRequestCount() > 0);

  begin(): void {
    this.pendingRequestCount.update((count) => count + 1);
  }

  end(): void {
    this.pendingRequestCount.update((count) => Math.max(0, count - 1));
  }
}
