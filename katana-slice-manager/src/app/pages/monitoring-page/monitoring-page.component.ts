import { Component, DestroyRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  SliceApiService,
  SliceMonitoringSummary,
  SliceObservabilityCard
} from '../../shared/services/api/slice-api.service';

type MetricValue = string | number | boolean | null | undefined;

interface MonitoringRow {
  [key: string]: MetricValue;
}

interface MetricCard {
  label: string;
  value: MetricValue;
  details?: string;
}

interface ChartPoint {
  timestamp: number;
  value: number;
}

interface ChartSeries {
  label: string;
  points: ChartPoint[];
  svgPoints: string;
}

@Component({
  selector: 'app-monitoring-page',
  imports: [FormsModule, RouterLink],
  templateUrl: './monitoring-page.component.html',
  styleUrl: './monitoring-page.component.scss'
})
export class MonitoringPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly sliceApi = inject(SliceApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly chartWidth = 720;
  private readonly chartHeight = 220;
  private readonly chartPadding = 18;

  protected loadingOverview = true;
  protected loadingDetail = false;
  protected loadingChart = false;
  protected loadingLogs = false;
  protected overviewError = '';
  protected detailError = '';
  protected chartError = '';
  protected logsError = '';
  protected searchTerm = '';
  protected cards: SliceObservabilityCard[] = [];
  protected selectedSliceId = '';
  protected selectedCard: SliceObservabilityCard | null = null;
  protected monitoringMetadata: unknown = null;
  protected summary: SliceMonitoringSummary | null = null;
  protected metricKeys: string[] = [];
  protected selectedMetric = '';
  protected selectedRangeHours = 1;
  protected chartSeries: ChartSeries[] = [];
  protected chartMin: number | null = null;
  protected chartMax: number | null = null;
  protected logsText = '';

  protected readonly rangeOptions = [
    { label: '1h', value: 1 },
    { label: '6h', value: 6 },
    { label: '24h', value: 24 }
  ];

  constructor() {
    this.loadOverview();

    this.route.paramMap
      .pipe(
        switchMap((paramMap) => {
          const sliceId = paramMap.get('sliceId') ?? '';
          this.selectedSliceId = sliceId;
          this.resetDetail();

          if (!sliceId) {
            return of(null);
          }

          this.loadingDetail = true;
          return forkJoin({
            bundle: this.sliceApi
              .getSliceObservability(sliceId)
              .pipe(
                catchError(() =>
                  this.sliceApi
                    .getSlice(sliceId)
                    .pipe(
                      map((slice) => this.toObservabilityCard(slice, sliceId)),
                      catchError((error) => of({ error }))
                    )
                )
              ),
            summary: this.sliceApi
              .getSliceMonitoringSummary(sliceId)
              .pipe(catchError((error) => of({ error }))),
            metadata: this.sliceApi
              .getSliceMonitoringMetadata(sliceId)
              .pipe(catchError((error) => of({ error })))
          });
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((result) => {
        if (!result) {
          return;
        }

        this.loadingDetail = false;

        if (this.isErrorResult(result.bundle) || this.isErrorResult(result.summary)) {
          this.detailError = 'Unable to load monitoring data for this slice.';
          return;
        }

        const bundle = result.bundle as SliceObservabilityCard;
        const summary = result.summary as SliceMonitoringSummary;

        this.selectedCard = bundle;
        this.summary = summary;
        this.monitoringMetadata = this.isErrorResult(result.metadata) ? null : result.metadata;
        this.metricKeys = this.getQueryKeys(summary, bundle);
        this.selectedMetric = this.pickMetric(this.selectedMetric, this.metricKeys);

        if (this.isMonitoringConfigured() && this.selectedMetric) {
          this.loadChart();
        }
      });
  }

  protected get filteredCards(): SliceObservabilityCard[] {
    const query = this.searchTerm.trim().toLowerCase();

    if (!query) {
      return this.cards;
    }

    return this.cards.filter((card) =>
      [this.getSliceId(card), card.name, card.status, card.created_at]
        .some((value) => String(value ?? '').toLowerCase().includes(query))
    );
  }

  protected get statusLabel(): string {
    return this.summary?.metrics?.slice_status?.label ?? this.selectedCard?.status ?? 'Unknown';
  }

  protected get networkServiceRows(): MonitoringRow[] {
    return this.toRows(this.summary?.metrics?.network_services);
  }

  protected get networkServiceColumns(): string[] {
    return this.getColumns(this.networkServiceRows);
  }

  protected get wimFlowCards(): MetricCard[] {
    return this.toMetricCards(this.summary?.metrics?.wim_flows_per_second);
  }

  protected get infrastructureCards(): MetricCard[] {
    return this.toMetricCards(this.summary?.metrics?.infrastructure);
  }

  protected get unavailableQueries(): string[] {
    const unavailable = this.summary?.monitoring?.prometheus?.unavailable;

    if (Array.isArray(unavailable)) {
      return unavailable.map((item) => String(item));
    }

    if (unavailable && typeof unavailable === 'object') {
      return Object.entries(unavailable).map(([key, value]) => `${key}: ${this.formatValue(value)}`);
    }

    return [];
  }

  protected get hasChartData(): boolean {
    return this.chartSeries.some((series) => series.points.length > 0);
  }

  protected get diagnosticsText(): string {
    return this.formatJson(this.monitoringMetadata ?? this.selectedCard?.monitoring?.details ?? null);
  }

  protected get logsAvailable(): boolean {
    return !!this.selectedSliceId;
  }

  protected getSliceId(card: SliceObservabilityCard): string {
    return card._id ?? card.id ?? '';
  }

  protected getMonitoringLabel(card: SliceObservabilityCard): string {
    return card.monitoring?.configured ? 'Configured' : 'Not configured';
  }

  protected getQueryCount(card: SliceObservabilityCard): number {
    return Object.keys(card.monitoring?.prometheus?.queries ?? {}).length;
  }

  protected getCreatedDate(card: SliceObservabilityCard): string {
    return card.created_at ? new Date(card.created_at).toLocaleString() : 'Unknown';
  }

  protected trackBySlice(_: number, card: SliceObservabilityCard): string {
    return this.getSliceId(card) || card.name || String(_);
  }

  protected trackByKey(_: number, key: string): string {
    return key;
  }

  protected trackByRow(index: number): number {
    return index;
  }

  protected trackByCard(_: number, card: MetricCard): string {
    return card.label;
  }

  protected formatColumnLabel(column: string): string {
    return column
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_-]/g, ' ')
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  protected formatValue(value: unknown): string {
    if (value === null || value === undefined || value === '') {
      return '-';
    }

    if (typeof value === 'number') {
      return Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 3 }) : '-';
    }

    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    return String(value);
  }

  protected updateMetric(): void {
    this.loadChart();
  }

  protected updateRange(): void {
    this.loadChart();
  }

  protected loadLogs(): void {
    if (!this.selectedSliceId || this.loadingLogs) {
      return;
    }

    this.loadingLogs = true;
    this.logsError = '';

    this.sliceApi
      .getSliceLogs(this.selectedSliceId, this.selectedCard?.links?.['logs'])
      .pipe(
        catchError(() => {
          this.logsError = 'Unable to load logs for this slice.';
          return of('');
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((logs) => {
        this.logsText = logs;
        this.loadingLogs = false;
      });
  }

  private loadOverview(): void {
    this.sliceApi
      .getSliceObservabilityCards()
      .pipe(
        catchError(() =>
          this.sliceApi.getSlices().pipe(
            map((slices) =>
              slices.map((slice, index) => this.toObservabilityCard(slice, String(index + 1)))
            ),
            catchError(() => {
              this.overviewError = 'Unable to load slice observability cards.';
              return of([]);
            })
          )
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((cards) => {
        this.cards = cards;
        this.loadingOverview = false;
      });
  }

  private loadChart(): void {
    if (!this.selectedSliceId || !this.selectedMetric) {
      this.chartSeries = [];
      return;
    }

    const end = Math.floor(Date.now() / 1000);
    const start = end - this.selectedRangeHours * 60 * 60;

    this.loadingChart = true;
    this.chartError = '';

    this.sliceApi
      .getSliceMonitoringRange(this.selectedSliceId, this.selectedMetric, start, end)
      .pipe(
        catchError(() => {
          this.chartError = 'Unable to load time-series data for this metric.';
          return of(null);
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((response) => {
        this.chartSeries = this.buildChartSeries(response);
        this.loadingChart = false;
      });
  }

  private resetDetail(): void {
    this.loadingDetail = false;
    this.detailError = '';
    this.chartError = '';
    this.logsError = '';
    this.logsText = '';
    this.selectedCard = null;
    this.summary = null;
    this.monitoringMetadata = null;
    this.metricKeys = [];
    this.selectedMetric = '';
    this.chartSeries = [];
    this.chartMin = null;
    this.chartMax = null;
  }

  private isMonitoringConfigured(): boolean {
    return !!(this.summary?.monitoring?.configured ?? this.selectedCard?.monitoring?.configured);
  }

  private getQueryKeys(
    summary: SliceMonitoringSummary,
    bundle: SliceObservabilityCard
  ): string[] {
    return Object.keys(
      summary.monitoring?.prometheus?.queries ?? bundle.monitoring?.prometheus?.queries ?? {}
    );
  }

  private toObservabilityCard(value: unknown, fallbackId: string): SliceObservabilityCard {
    if (!value || typeof value !== 'object') {
      return { _id: fallbackId, name: fallbackId, monitoring: { configured: false } };
    }

    const record = value as Record<string, unknown>;
    const id = this.getFirstString(record, ['_id', 'id', 'uuid', 'slice_id', 'nsi_id']) ?? fallbackId;
    const name =
      this.getFirstString(record, ['name', 'ns_name', 'slice_name', 'sliceName']) ?? id;
    const status = this.getFirstString(record, ['status', 'state']);
    const createdAt = this.getFirstString(record, ['created_at', 'createdAt', 'creation_time']);
    const monitoring =
      record['monitoring'] && typeof record['monitoring'] === 'object'
        ? (record['monitoring'] as SliceObservabilityCard['monitoring'])
        : { configured: false };
    const links =
      record['links'] && typeof record['links'] === 'object'
        ? (record['links'] as Record<string, string>)
        : undefined;

    return {
      _id: id,
      name,
      status,
      created_at: createdAt,
      monitoring,
      links
    };
  }

  private getFirstString(record: Record<string, unknown>, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = record[key];

      if (value !== null && value !== undefined && value !== '') {
        return String(value);
      }
    }

    return undefined;
  }

  private pickMetric(currentMetric: string, metricKeys: string[]): string {
    if (currentMetric && metricKeys.includes(currentMetric)) {
      return currentMetric;
    }

    return (
      [
        'slice_status',
        'network_services',
        'wim_flows_per_second',
        'openstack_vm_cpu_overall_cpu_usage',
        'openstack_vm_memory_usage'
      ].find((metric) => metricKeys.includes(metric)) ?? metricKeys[0] ?? ''
    );
  }

  private toRows(value: unknown): MonitoringRow[] {
    if (Array.isArray(value)) {
      return value.map((item, index) => this.toRow(item, String(index + 1)));
    }

    if (value && typeof value === 'object') {
      return Object.entries(value).map(([key, item]) => this.toRow(item, key));
    }

    if (value === null || value === undefined) {
      return [];
    }

    return [{ metric: 'value', value: this.toMetricValue(value) }];
  }

  private toRow(value: unknown, fallbackName: string): MonitoringRow {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.entries(value).reduce<MonitoringRow>(
        (row, [key, item]) => ({
          ...row,
          [key]: this.toMetricValue(item)
        }),
        { name: fallbackName }
      );
    }

    return { name: fallbackName, value: this.toMetricValue(value) };
  }

  private getColumns(rows: MonitoringRow[]): string[] {
    return Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  }

  private toMetricCards(value: unknown): MetricCard[] {
    if (Array.isArray(value)) {
      return value.map((item, index) => this.toMetricCard(String(index + 1), item));
    }

    if (value && typeof value === 'object') {
      return Object.entries(value).map(([key, item]) => this.toMetricCard(key, item));
    }

    if (value === null || value === undefined) {
      return [];
    }

    return [{ label: 'Value', value: this.toMetricValue(value) }];
  }

  private toMetricCard(label: string, value: unknown): MetricCard {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      const primaryValue = record['value'] ?? record['current'] ?? record['label'] ?? record['status'];
      const unit = record['unit'] ? ` ${record['unit']}` : '';

      return {
        label,
        value:
          primaryValue === undefined
            ? this.formatValue(record)
            : `${this.formatValue(primaryValue)}${unit}`,
        details: this.formatJson(record)
      };
    }

    return { label, value: this.toMetricValue(value) };
  }

  private toMetricValue(value: unknown): MetricValue {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null ||
      value === undefined
    ) {
      return value;
    }

    return this.formatValue(value);
  }

  private buildChartSeries(response: unknown): ChartSeries[] {
    const series = this.extractSeries(response);
    const values = series.flatMap((item) => item.points.map((point) => point.value));
    this.chartMin = values.length ? Math.min(...values) : null;
    this.chartMax = values.length ? Math.max(...values) : null;

    return series.map((item) => ({
      ...item,
      svgPoints: this.buildPolyline(item.points)
    }));
  }

  private extractSeries(response: unknown): Array<Omit<ChartSeries, 'svgPoints'>> {
    const result = this.getPrometheusResult(response);

    if (!Array.isArray(result)) {
      return [];
    }

    return result.map((series, index) => {
      const record = series as Record<string, unknown>;
      const metric = record['metric'];
      const values = Array.isArray(record['values']) ? record['values'] : [];

      return {
        label: this.getSeriesLabel(metric, index),
        points: values
          .map((point) => this.toChartPoint(point))
          .filter((point): point is ChartPoint => point !== null)
      };
    });
  }

  private getPrometheusResult(response: unknown): unknown {
    if (!response || typeof response !== 'object') {
      return null;
    }

    const record = response as Record<string, unknown>;
    const data = record['data'];

    if (data && typeof data === 'object') {
      return (data as Record<string, unknown>)['result'];
    }

    return record['result'];
  }

  private toChartPoint(point: unknown): ChartPoint | null {
    if (!Array.isArray(point) || point.length < 2) {
      return null;
    }

    const timestamp = Number(point[0]);
    const value = Number(point[1]);

    if (!Number.isFinite(timestamp) || !Number.isFinite(value)) {
      return null;
    }

    return { timestamp, value };
  }

  private buildPolyline(points: ChartPoint[]): string {
    if (!points.length || this.chartMin === null || this.chartMax === null) {
      return '';
    }

    const minTime = Math.min(...points.map((point) => point.timestamp));
    const maxTime = Math.max(...points.map((point) => point.timestamp));
    const timeRange = Math.max(1, maxTime - minTime);
    const valueRange = Math.max(1, this.chartMax - this.chartMin);
    const innerWidth = this.chartWidth - this.chartPadding * 2;
    const innerHeight = this.chartHeight - this.chartPadding * 2;

    return points
      .map((point) => {
        const x = this.chartPadding + ((point.timestamp - minTime) / timeRange) * innerWidth;
        const y =
          this.chartHeight -
          this.chartPadding -
          ((point.value - this.chartMin!) / valueRange) * innerHeight;

        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }

  private getSeriesLabel(metric: unknown, index: number): string {
    if (metric && typeof metric === 'object') {
      const record = metric as Record<string, unknown>;
      const preferred = record['instance'] ?? record['job'] ?? record['name'] ?? record['slice'];

      if (preferred) {
        return String(preferred);
      }
    }

    return `Series ${index + 1}`;
  }

  private formatJson(value: unknown): string {
    if (value === null || value === undefined || value === '') {
      return '';
    }

    return JSON.stringify(value, null, 2);
  }

  private isErrorResult(value: unknown): value is { error: unknown } {
    return !!value && typeof value === 'object' && 'error' in value;
  }
}
