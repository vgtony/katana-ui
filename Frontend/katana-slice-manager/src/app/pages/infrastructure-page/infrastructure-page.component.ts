import { DatePipe } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { NfvoSummary, VimSummary } from '../../models/interfaces/infrastructure.interface';
import { getApiErrorMessage, NfvoApiService, VimApiService } from '../../shared/services/api';

@Component({
  selector: 'app-infrastructure-page',
  imports: [DatePipe, RouterLink],
  templateUrl: './infrastructure-page.component.html',
  styleUrl: './infrastructure-page.component.scss',
})
export class InfrastructurePageComponent implements OnInit {
  private readonly nfvoApi = inject(NfvoApiService);
  private readonly vimApi = inject(VimApiService);

  protected nfvos: NfvoSummary[] = [];
  protected vims: VimSummary[] = [];
  protected loading = true;
  protected error = '';

  ngOnInit(): void {
    this.refresh();
  }

  protected refresh(): void {
    if (this.loading && (this.nfvos.length || this.vims.length)) return;
    this.loading = true;
    this.error = '';
    forkJoin({ nfvos: this.nfvoApi.getNfvos(), vims: this.vimApi.getVims() }).subscribe({
      next: ({ nfvos, vims }) => {
        this.nfvos = nfvos;
        this.vims = vims;
        this.loading = false;
      },
      error: (error) => {
        this.error = getApiErrorMessage(error, 'Unable to load infrastructure inventory.');
        this.loading = false;
      },
    });
  }
}
