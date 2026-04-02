import { AsyncPipe, DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DeploymentPack } from '../../models/interfaces/deployment-pack.interface';
import { DeploymentDraftService } from '../../shared/services/deployment-draft.service';
import { DeploymentHistoryService } from '../../shared/services/deployment-history.service';

@Component({
  selector: 'app-history-page',
  imports: [AsyncPipe, DatePipe, RouterLink],
  templateUrl: './history-page.component.html',
  styleUrl: './history-page.component.scss'
})
export class HistoryPageComponent {
  private readonly historyService = inject(DeploymentHistoryService);
  private readonly deploymentDraftService = inject(DeploymentDraftService);
  private readonly router = inject(Router);

  protected readonly packs$ = this.historyService.packs$;

  protected clearHistory(): void {
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
}
