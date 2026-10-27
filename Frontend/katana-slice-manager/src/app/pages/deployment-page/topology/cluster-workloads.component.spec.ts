import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ClusterWorkloadsComponent } from './cluster-workloads.component';
import { KubernetesTopology } from '../../../models/interfaces/kubernetes-topology.interface';

const unavailable = { cpu_millicores: null, memory_bytes: null, timestamp: null, window: null };
const sample: KubernetesTopology = {
  cluster_id: 'cluster',
  name: 'Lab',
  namespace: 'apps',
  collected_at: new Date().toISOString(),
  warnings: ['Node metrics unavailable.'],
  nodes: [
    {
      name: 'worker',
      ready: true,
      reported: true,
      usage: unavailable,
      allocatable: { cpu_millicores: 4000, memory_bytes: 8589934592 },
    },
  ],
  pods: [
    {
      uid: 'pod',
      name: 'web',
      namespace: 'apps',
      node: 'worker',
      phase: 'Running',
      ready: 0,
      container_count: 1,
      restarts: 3,
      usage: { ...unavailable, cpu_millicores: 0, memory_bytes: 1048576 },
      containers: [
        {
          name: 'web',
          kind: 'container',
          state: 'waiting',
          reason: 'CrashLoopBackOff',
          ready: false,
          restarts: 3,
          requests: { cpu_millicores: 100, memory_bytes: null },
          limits: { cpu_millicores: null, memory_bytes: null },
          usage: unavailable,
        },
      ],
    },
  ],
};

describe('Cluster workloads', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      imports: [ClusterWorkloadsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }),
  );
  function create() {
    const fixture = TestBed.createComponent(ClusterWorkloadsComponent);
    fixture.componentRef.setInput('clusterId', 'cluster');
    fixture.detectChanges();
    return fixture;
  }
  function request(id = 'cluster') {
    return TestBed.inject(HttpTestingController).expectOne((request) =>
      request.url.endsWith(`/k8s/${id}/topology`),
    );
  }

  it('renders actual readiness and zero usage separately from unavailable metrics', () => {
    const fixture = create();
    const pending = request();
    expect(pending.request.params.get('namespace')).toBe('*');
    pending.flush(sample);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('0/1 ready');
    expect(text).toContain('0 mCPU');
    expect(text).toContain('1 MiB');
    expect(text).toContain('Unavailable');
    expect(text).toContain('CrashLoopBackOff');
    expect(text).toContain('Not set');
    expect(fixture.nativeElement.querySelector('details summary')).not.toBeNull();
    expect(fixture.componentInstance['namespace']).toBe('apps');
    TestBed.inject(HttpTestingController).verify();
  });

  it('scales pod graphs to visible measurements, preserves zero, and leaves missing values blank', async () => {
    const fixture = create();
    request().flush({
      ...sample,
      pods: [
        sample.pods[0],
        {
          ...sample.pods[0],
          uid: 'busy',
          name: 'busy',
          usage: { ...unavailable, cpu_millicores: 200, memory_bytes: 4194304 },
        },
      ],
    });
    fixture.detectChanges();
    const view = fixture.componentInstance['workloadView'];
    expect(view.cpuMax).toBe(200);
    expect(view.memoryMax).toBe(4194304);
    const bars = fixture.nativeElement.querySelectorAll('.workloads-pod .usage-track > span');
    expect(bars[0].style.width).toBe('0%');
    expect(bars[1].style.width).toBe('25%');
    expect(bars[2].style.width).toBe('100%');
    expect(
      fixture.nativeElement.querySelector('.workloads-node-header .usage-missing'),
    ).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.workloads-pod').open).toBe(false);
    expect(fixture.componentInstance['barWidth'](null, 100)).toBeNull();
    expect(fixture.componentInstance['barWidth'](10, 0)).toBeNull();
    expect(fixture.componentInstance['barWidth'](0, 0)).toBe(0);
    expect(fixture.componentInstance['barWidth'](200, 100)).toBe(100);
    await fixture.whenStable();
    const search: HTMLInputElement = fixture.nativeElement.querySelector('#workload-search');
    search.value = 'busy';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.workloads-pod')).toHaveLength(1);
    expect(fixture.componentInstance['workloadView'].cpuMax).toBe(200);
    TestBed.inject(HttpTestingController).verify();
  });

  it('rejects namespace paths before sending another cluster request', async () => {
    const fixture = create();
    request().flush(sample);
    fixture.detectChanges();
    await fixture.whenStable();
    const namespace: HTMLInputElement = fixture.nativeElement.querySelector('#workload-namespace');
    namespace.value = '../bad';
    namespace.dispatchEvent(new Event('input'));
    namespace.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.workloads-controls button').disabled).toBe(true);
    expect(namespace.getAttribute('aria-invalid')).toBe('true');
    TestBed.inject(HttpTestingController).expectNone(() => true);
  });

  it('cancels obsolete cluster reads and cancels on destruction', () => {
    const fixture = create();
    const previous = request();
    fixture.componentRef.setInput('clusterId', 'next');
    fixture.detectChanges();
    expect(previous.cancelled).toBe(true);
    const next = request('next');
    fixture.destroy();
    expect(next.cancelled).toBe(true);
    TestBed.inject(HttpTestingController).verify();
  });

  it('preserves the last snapshot on refresh failure and retries the selected namespace', () => {
    const fixture = create();
    request().flush(sample);
    fixture.detectChanges();
    fixture.componentInstance['refresh']();
    const refresh = request();
    expect(refresh.request.params.get('namespace')).toBe('apps');
    refresh.flush({ error: 'Read denied' }, { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Previous snapshot');
    expect(fixture.nativeElement.textContent).toContain('Read denied');
    fixture.componentInstance['refresh']();
    request().flush({ ...sample, pods: [], nodes: [], warnings: [] });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('No nodes or pods');
    TestBed.inject(HttpTestingController).verify();
  });

  it('groups unscheduled pods and filters without making extra cluster calls', async () => {
    const fixture = create();
    request().flush({
      ...sample,
      pods: [
        ...sample.pods,
        { ...sample.pods[0], uid: 'pending', name: 'new-pod', node: null, phase: 'Pending' },
      ],
    });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Awaiting scheduling');
    const phase: HTMLSelectElement = fixture.nativeElement.querySelector('#workload-phase');
    phase.value = 'Pending';
    phase.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.workloads-pod')).toHaveLength(1);
    const search: HTMLInputElement = fixture.nativeElement.querySelector('#workload-search');
    search.value = 'missing';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No pods match');
    TestBed.inject(HttpTestingController).verify();
  });
});
