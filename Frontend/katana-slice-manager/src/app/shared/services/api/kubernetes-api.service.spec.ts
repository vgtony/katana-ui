import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { KubernetesApiService } from './kubernetes-api.service';

describe('Kubernetes operation recovery', () => {
  let api: KubernetesApiService;
  let http: HttpTestingController;
  const pending = { operation_id: 'request', nfvo_id: 'b', submission_state: 'accepted', phase: 'pending', message: 'Accepted' };
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(KubernetesApiService);
    http = TestBed.inject(HttpTestingController);
    vi.useFakeTimers();
  });
  afterEach(() => { http.verify(); vi.useRealTimers(); });

  it('polls only reads and stops on OSM completion', () => {
    const phases: string[] = [];
    let complete = false;
    api.pollOperation('request').subscribe({ next: (value) => phases.push(value.phase), complete: () => complete = true });
    vi.advanceTimersByTime(0);
    http.expectOne('/api/k8s/operations/request').flush(pending);
    vi.advanceTimersByTime(5000);
    http.expectOne('/api/k8s/operations/request').flush({ ...pending, phase: 'completed' });
    vi.advanceTimersByTime(60_000);
    http.expectNone((req) => req.method === 'POST' || req.method === 'GET');
    expect(phases).toEqual(['pending', 'completed']);
    expect(complete).toBe(true);
  });

  it('does not overlap slow reads and stops when unsubscribed', () => {
    const subscription = api.pollOperation('request').subscribe();
    vi.advanceTimersByTime(0);
    const request = http.expectOne('/api/k8s/operations/request');
    vi.advanceTimersByTime(10_000);
    http.expectNone('/api/k8s/operations/request');
    subscription.unsubscribe();
    expect(request.cancelled).toBe(true);
    vi.advanceTimersByTime(60_000);
    http.expectNone('/api/k8s/operations/request');
  });

  it('bounds failed reads without ever resubmitting', () => {
    let error = false;
    api.pollOperation('request').subscribe({ error: () => error = true });
    vi.advanceTimersByTime(0);
    for (let index = 0; index < 3; index++) {
      http.expectOne('/api/k8s/operations/request').flush({}, { status: 502, statusText: 'Unavailable' });
      vi.advanceTimersByTime(2000);
    }
    expect(error).toBe(true);
    vi.advanceTimersByTime(60_000);
    http.expectNone((req) => true);
  });

  it('rejects mismatched identities and stops on uncertain outcomes', () => {
    let error = false;
    api.getOperation('request').subscribe({ error: () => error = true });
    http.expectOne('/api/k8s/operations/request').flush({ ...pending, operation_id: 'other' });
    expect(error).toBe(true);
    let complete = false;
    api.pollOperation('request').subscribe({ complete: () => complete = true });
    vi.advanceTimersByTime(0);
    http.expectOne('/api/k8s/operations/request').flush({ ...pending, submission_state: 'unknown', phase: 'unknown' });
    vi.advanceTimersByTime(60_000);
    expect(complete).toBe(true);
    http.expectNone((req) => true);
  });
});
