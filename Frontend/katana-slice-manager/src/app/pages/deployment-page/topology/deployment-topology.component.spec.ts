import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import {
  DeploymentTopologyComponent,
  TopologySource,
  topologyBranches,
} from './deployment-topology.component';

const sources: TopologySource[] = [
  {
    key: 'slice',
    title: 'Slices',
    loading: false,
    error: null,
    items: [
      { _id: 'slice-a', name: 'Edge video' },
      { _id: 'slice-b', name: 'Core services' },
    ],
  },
];

describe('Deployment topology', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      imports: [DeploymentTopologyComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }),
  );

  function create(input = sources) {
    const fixture = TestBed.createComponent(DeploymentTopologyComponent);
    fixture.componentRef.setInput('sources', input);
    fixture.detectChanges();
    return fixture;
  }

  it('uses explicit service placement, preserves each location, and ignores malformed records', () => {
    const branches = topologyBranches('slice', {
      ns_inst_info: {
        service: {
          west: { 'ns-name': 'Video', vim: 'cluster-west', 'nfvo-id': 'osm-1' },
          east: { 'ns-name': 'Video' },
          invalid: null,
        },
        invalid: [],
      },
    });
    expect(branches).toHaveLength(2);
    expect(branches[0].target?.name).toBe('cluster-west');
    expect(branches[1].target?.name).toBe('Not reported');
    expect(branches[1].details).toContainEqual({ label: 'Status', value: 'Not reported' });
    expect(topologyBranches('slice', { location: 'west', ns_inst_info: [] })).toEqual([]);
  });

  it('reads cluster registration and Amari targets without exposing endpoint credentials', () => {
    expect(
      topologyBranches('k8s', { vim_account: 'account-1', nfvo_id: 'osm-1' })[0],
    ).toMatchObject({ name: 'account-1', target: { name: 'osm-1' } });
    const branches = topologyBranches('amari', {
      targets: {
        ran: { ems_id: 'ran-1', url: 'https://user:secret@ran.example:9000/api?token=secret' },
        core: { url: 'https://core.example' },
      },
    });
    expect(branches).toHaveLength(2);
    expect(branches[0].details).toEqual([{ label: 'Endpoint', value: 'ran.example:9000' }]);
    expect(JSON.stringify(branches)).not.toContain('secret');
    expect(topologyBranches('amari', { targets: { ran: null, core: {} } })).toEqual([]);
  });

  it('cancels obsolete detail requests and links to the selected slice', () => {
    const fixture = create();
    const http = TestBed.inject(HttpTestingController);
    const first = http.expectOne((request) => request.url.endsWith('/slice/slice-a'));
    expect(fixture.nativeElement.textContent).toContain('Loading topology for Edge video');
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    select.value = select.options[1].value;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(first.cancelled).toBe(true);
    http
      .expectOne((request) => request.url.endsWith('/slice/slice-b'))
      .flush({
        status: 'running',
        ns_inst_info: { ns: { edge: { 'ns-name': 'Core', vim: 'cluster-b' } } },
      });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('cluster-b');
    expect(fixture.nativeElement.querySelector('a').getAttribute('href')).toBe('/slices/slice-b');
    http.verify();
  });

  it('shows an error, retries, and distinguishes missing relationships from a failed load', () => {
    const fixture = create();
    const http = TestBed.inject(HttpTestingController);
    http
      .expectOne((request) => request.url.endsWith('/slice/slice-a'))
      .flush('Unavailable', { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    const retry = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    ) as HTMLButtonElement[];
    retry.find((button) => button.textContent?.trim() === 'Retry details')!.click();
    http
      .expectOne((request) => request.url.endsWith('/slice/slice-a'))
      .flush({ status: 'Placement' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('No relationships have been reported');
    http.verify();
  });

  it('cancels detail requests when the topology tab is destroyed', () => {
    const fixture = create();
    const http = TestBed.inject(HttpTestingController);
    const request = http.expectOne((request) => request.url.endsWith('/slice/slice-a'));
    fixture.destroy();
    expect(request.cancelled).toBe(true);
    http.verify();
  });

  it('handles loading, empty and partial inventory without inventing identifiers', () => {
    const fixture = create([{ ...sources[0], items: [], loading: true }]);
    expect(fixture.nativeElement.textContent).toContain('Loading deployment inventory');
    fixture.componentRef.setInput('sources', [
      { ...sources[0], items: [null, { name: 'No identifier' }] },
    ]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No topology available');
    fixture.componentRef.setInput('sources', [
      { ...sources[0], items: [], error: 'Inventory offline' },
      {
        key: 'k8s',
        title: 'K8s Clusters',
        items: [{ id: 'cluster', name: 'Lab', vim_account: 'account' }],
        loading: false,
        error: null,
      },
    ]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Inventory offline');
    expect(fixture.nativeElement.textContent).toContain('account');
    expect(fixture.nativeElement.querySelectorAll('.topology-branch')).toHaveLength(1);
    TestBed.inject(HttpTestingController)
      .expectOne((request) => request.url.endsWith('/k8s/cluster/topology'))
      .flush({ error: 'Cluster credentials unavailable' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Cluster credentials unavailable');
    TestBed.inject(HttpTestingController).verify();
  });
});
