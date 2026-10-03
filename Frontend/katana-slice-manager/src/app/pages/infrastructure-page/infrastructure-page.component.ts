import { DatePipe } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { NfvoSummary, VimSummary } from '../../models/interfaces/infrastructure.interface';
import {
  getApiErrorMessage,
  K8sClusterSummary,
  KubernetesApiService,
  NfvoApiService,
  VimApiService,
} from '../../shared/services/api';

@Component({
  selector: 'app-infrastructure-page',
  imports: [DatePipe, RouterLink],
  templateUrl: './infrastructure-page.component.html',
  styleUrl: './infrastructure-page.component.scss',
})
export class InfrastructurePageComponent implements OnInit {
  private readonly nfvoApi = inject(NfvoApiService);
  private readonly vimApi = inject(VimApiService);
  private readonly kubernetesApi = inject(KubernetesApiService);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  protected clusters: K8sClusterSummary[] = [];
  protected savingLocation = false;

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
    forkJoin({
      nfvos: this.nfvoApi.getNfvos(),
      vims: this.vimApi.getVims(),
      clusters: this.kubernetesApi.getK8sClusters(),
    }).subscribe({
      next: ({ nfvos, vims, clusters }) => {
        this.nfvos = nfvos;
        this.vims = vims;
        this.clusters = clusters;
        this.loading = false;
        this.changeDetectorRef.markForCheck();
      },
      error: (error) => {
        this.error = getApiErrorMessage(error, 'Unable to load infrastructure inventory.');
        this.loading = false;
        this.changeDetectorRef.markForCheck();
      },
    });
  }
  protected saveLocation(cluster: K8sClusterSummary, location: string): void {
    if (this.savingLocation) return;
    this.error = '';
    this.savingLocation = true;
    this.kubernetesApi.setK8sLocation(cluster.id, location.trim()).subscribe({
      next: () => {
        this.savingLocation = false;
        this.refresh();
      },
      error: (error) => {
        this.savingLocation = false;
        this.error = getApiErrorMessage(error, 'Unable to save cluster location.');
        this.changeDetectorRef.markForCheck();
      },
    });
  }
}
