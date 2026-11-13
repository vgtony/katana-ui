import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import { KubernetesApiService } from '../../shared/services/api/kubernetes-api.service';
import { AsyncPipe, DatePipe, JsonPipe } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DeploymentPack } from '../../models/interfaces/deployment-pack.interface';
import { DeploymentDraftService } from '../../shared/services/deployment-draft.service';
import { DeploymentHistoryService } from '../../shared/services/deployment-history.service';

@Component({
  selector: 'app-history-page',
  imports: [AsyncPipe, DatePipe, JsonPipe, RouterLink],
  templateUrl: './history-page.component.html',
  styleUrl: './history-page.component.scss'
})
export class HistoryPageComponent {
  protected readonly historyService = inject(DeploymentHistoryService);
  private readonly deploymentDraftService = inject(DeploymentDraftService);
  private readonly router = inject(Router);

  private readonly kubernetesApi = inject(KubernetesApiService);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly polls = new Map<string, Subscription>();
  protected statusMessages: Record<string, string> = {};

  constructor() {
    for (const pack of this.historyService.getPacks()) {
      if (pack.operationId && !['completed', 'failed'].includes(pack.operation?.phase ?? '')) this.refreshOperation(pack);
    }
  }

  protected refreshOperation(pack: DeploymentPack): void {
    const id = pack.operationId;
    if (!id) return;
    this.polls.get(id)?.unsubscribe();
    this.statusMessages[id] = 'Checking OSM status…';
    this.polls.set(id, this.kubernetesApi.pollOperation(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (operation) => {
        this.historyService.updateOperation(operation);
        this.statusMessages[id] = operation.message;
      },
      error: () => { this.statusMessages[id] = 'Status unavailable. Last observation retained; retry only this status check.'; this.changeDetectorRef.markForCheck(); },
      complete: () => { this.statusMessages[id] = 'Automatic checking stopped. Refresh status for a newer observation.'; this.changeDetectorRef.markForCheck(); },
    }));
  }

  protected readonly packs$ = this.historyService.packs$;

  protected clearHistory(): void {
    for (const poll of this.polls.values()) poll.unsubscribe();
    this.polls.clear();
    this.historyService.clearPacks();
  }

  protected openPack(pack: DeploymentPack): void {
    this.deploymentDraftService.loadPackAsDraft(pack);
    this.router.navigate(['/deployment', pack.optionId], {
      queryParams: {
        packId: pack.id
      }
    });
  }

  protected getPackStatusLabel(pack: DeploymentPack): string {
    if (pack.operation?.submission_state === 'submitting') return 'Submission in progress — acceptance unconfirmed';
    if (pack.operation?.submission_state === 'unknown' || pack.status === 'unknown') {
      return 'Outcome unknown — reconcile before retrying';
    }
    if (pack.operation?.submission_state === 'rejected' || pack.operation?.phase === 'failed') {
      if (pack.operation.osm_operation_state) return `OSM ${pack.operation.osm_operation_state}`;
      return pack.errorType ?? 'OSM rejected';
    }
    if (pack.operation?.phase === 'completed') return 'OSM instantiation completed — workload readiness unverified';
    if (pack.status === 'failed' && pack.errorType) return pack.errorType;
    if (pack.optionId === 'k8s' && !pack.operationId) return 'Historical submission — outcome unverified';
    if (pack.status === 'accepted') return 'Accepted — readiness not verified';
    return pack.status === 'failed' ? pack.errorType ?? 'Failed' : 'Operation completed';
  }
}
