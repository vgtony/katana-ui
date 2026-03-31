import { AsyncPipe, DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DeploymentHistoryService } from '../../shared/services/deployment-history.service';

@Component({
  selector: 'app-history-page',
  imports: [AsyncPipe, DatePipe, RouterLink],
  templateUrl: './history-page.component.html',
  styleUrl: './history-page.component.scss'
})
export class HistoryPageComponent {
  private readonly historyService = inject(DeploymentHistoryService);

  protected readonly packs$ = this.historyService.packs$;

  protected clearHistory(): void {
    this.historyService.clearPacks();
  }
}
