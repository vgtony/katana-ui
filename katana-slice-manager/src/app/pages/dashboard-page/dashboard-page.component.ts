import { ChangeDetectorRef, Component, NgZone, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DashboardCategory, DashboardSection } from '../../models/interfaces/dashboard.interface';
import { DashboardDataService } from '../../shared/services/dashboard-data.service';

type DashboardFilter = 'all' | DashboardCategory;

interface DashboardSectionView extends DashboardSection {
  currentPage: number;
  filteredCount: number;
  paginatedRows: DashboardSection['rows'];
  totalPages: number;
}

@Component({
  selector: 'app-dashboard-page',
  imports: [FormsModule],
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.scss'
})
export class DashboardPageComponent {
  private readonly dashboardDataService = inject(DashboardDataService);
  private readonly ngZone = inject(NgZone);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);

  protected loading = true;
  protected searchTerm = '';
  protected selectedFilter: DashboardFilter = 'all';
  protected pageSize = 8;
  protected sections: DashboardSection[] = [];
  protected readonly filterOptions: Array<{ label: string; value: DashboardFilter }> = [
    { label: 'All datasets', value: 'all' },
    { label: 'Deployments', value: 'deployment' },
    { label: 'Infrastructure', value: 'infrastructure' },
    { label: 'Catalog', value: 'catalog' },
    { label: 'Operations', value: 'operations' }
  ];
  protected readonly expandedSections: Record<string, boolean> = {};
  private readonly pageByKey: Record<string, number> = {};

  constructor() {
    this.dashboardDataService
      .loadSections()
      .pipe(takeUntilDestroyed())
      .subscribe((sections) => {
        this.ngZone.run(() => {
          this.sections = sections;
          this.loading = false;
          this.resetExpandedSections();
          this.resetPagination();
          this.changeDetectorRef.markForCheck();
        });
      });
  }

  protected get visibleSections(): DashboardSectionView[] {
    return this.sections
      .filter((section) => this.selectedFilter === 'all' || section.category === this.selectedFilter)
      .map((section) => this.buildSectionView(section))
      .filter((section) => section.filteredCount > 0 || !!section.error || !this.searchTerm.trim());
  }

  protected updateSearchTerm(): void {
    this.resetPagination();
  }

  protected updateFilter(): void {
    this.resetPagination();
  }

  protected updatePageSize(): void {
    this.resetPagination();
  }

  protected goToPreviousPage(sectionKey: string): void {
    this.pageByKey[sectionKey] = Math.max(1, (this.pageByKey[sectionKey] ?? 1) - 1);
  }

  protected goToNextPage(sectionKey: string, totalPages: number): void {
    this.pageByKey[sectionKey] = Math.min(totalPages, (this.pageByKey[sectionKey] ?? 1) + 1);
  }

  protected formatColumnLabel(column: string): string {
    return column
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_-]/g, ' ')
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  protected trackBySection(_: number, section: DashboardSectionView): string {
    return section.key;
  }

  protected trackByRow(index: number): number {
    return index;
  }

  protected toggleSection(sectionKey: string): void {
    this.expandedSections[sectionKey] = !this.isSectionExpanded(sectionKey);
  }

  protected isSectionExpanded(sectionKey: string): boolean {
    return this.expandedSections[sectionKey] ?? true;
  }

  private buildSectionView(section: DashboardSection): DashboardSectionView {
    const filteredRows = this.filterRows(section.rows);
    const totalPages = Math.max(1, Math.ceil(filteredRows.length / this.pageSize));
    const currentPage = Math.min(this.pageByKey[section.key] ?? 1, totalPages);
    const start = (currentPage - 1) * this.pageSize;

    this.pageByKey[section.key] = currentPage;

    return {
      ...section,
      currentPage,
      filteredCount: filteredRows.length,
      paginatedRows: filteredRows.slice(start, start + this.pageSize),
      totalPages
    };
  }

  private filterRows(rows: DashboardSection['rows']): DashboardSection['rows'] {
    const query = this.searchTerm.trim().toLowerCase();

    if (!query) {
      return rows;
    }

    return rows.filter((row) =>
      Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(query))
    );
  }

  private resetPagination(): void {
    this.sections.forEach((section) => {
      this.pageByKey[section.key] = 1;
    });
  }

  private resetExpandedSections(): void {
    this.sections.forEach((section) => {
      this.expandedSections[section.key] ??= false;
    });
  }
}
