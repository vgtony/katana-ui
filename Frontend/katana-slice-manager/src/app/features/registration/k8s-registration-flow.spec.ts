import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { K8sClusterRegistrationFormComponent } from './k8s-cluster-registration-form/k8s-cluster-registration-form.component';
import { K8sDeployServiceFormComponent } from './k8s-deploy-service-form/k8s-deploy-service-form.component';
import { DeploymentDraftService } from '../../shared/services/deployment-draft.service';
import { DeploymentHistoryService } from '../../shared/services/deployment-history.service';

describe('K8s registration flow defaults', () => {
  let httpTestingController: HttpTestingController;

  afterEach(() => {
    httpTestingController.verify();
    localStorage.clear();
  });

  it('copies the uploaded kubeconfig filename into cluster registration', async () => {
    localStorage.setItem(
      'katana-slice-manager.deployment-drafts',
      JSON.stringify({
        k8s: {
          'k8s-credentials': {
            state: 'active',
            value: { fileName: 'uploaded-kubeconfig.yaml' },
          },
        },
      }),
    );
    await TestBed.configureTestingModule({
      imports: [K8sClusterRegistrationFormComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    const fixture: ComponentFixture<K8sClusterRegistrationFormComponent> = TestBed.createComponent(
      K8sClusterRegistrationFormComponent,
    );
    httpTestingController = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpTestingController.expectOne((req) => req.url.endsWith('/location')).flush([{ id: 'edge' }]);

    expect((fixture.componentInstance as any).form.value.credentials).toBe(
      'uploaded-kubeconfig.yaml',
    );
    httpTestingController.expectOne((req) => req.url.includes('/nfvo')).flush([]);
  });

  it('lists enabled OSM VIMs, including accounts created after Time-0, for cluster registration', async () => {
    await TestBed.configureTestingModule({
      imports: [K8sClusterRegistrationFormComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    const fixture: ComponentFixture<K8sClusterRegistrationFormComponent> = TestBed.createComponent(
      K8sClusterRegistrationFormComponent,
    );
    httpTestingController = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpTestingController.expectOne((req) => req.url.endsWith('/location')).flush([{ id: 'edge' }]);
    httpTestingController
      .expectOne((req) => req.url.includes('/nfvo'))
      .flush([
        {
          _id: 'nfvo-db',
          nfvo_id: 'nfvo-lab',
          type: 'OSM',
          created_at: 1,
        },
      ]);
    httpTestingController
      .expectOne((req) => req.url.endsWith('/k8s/vim-accounts/nfvo-lab'))
      .flush([
        {
          id: '90eb8a68-ae7d-4741-8118-160940be9f3e',
          name: 'MrKrabsVIM2',
          type: 'dummy',
          k8s_cluster_count: 0,
        },
      ]);
    fixture.detectChanges();

    const vimSelect = fixture.nativeElement.querySelector(
      'select[formControlName="vimAccount"]',
    ) as HTMLSelectElement;
    expect(Array.from(vimSelect.options).map((option) => option.value)).toContain(
      '90eb8a68-ae7d-4741-8118-160940be9f3e',
    );
    expect((fixture.componentInstance as any).form.value.vimAccount).toBe(
      '90eb8a68-ae7d-4741-8118-160940be9f3e',
    );
    const component = fixture.componentInstance as any;
    component.form.patchValue({ name: 'cluster', description: 'test', credentials: 'config.yaml' });
    expect(component.form.value.location).toBe('edge');
    component.submit();
    const registration = httpTestingController.expectOne(
      (req) => req.method === 'POST' && req.url.endsWith('/k8s'),
    );
    expect(registration.request.body.location).toBe('edge');
    registration.flush({ message: 'Registered', id: 'cluster' });
  });

  it('loads OSM inventory and passes parsed NEST values through the existing deployment endpoint', async () => {
    await TestBed.configureTestingModule({
      imports: [K8sDeployServiceFormComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    const fixture: ComponentFixture<K8sDeployServiceFormComponent> = TestBed.createComponent(
      K8sDeployServiceFormComponent,
    );
    httpTestingController = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpTestingController.expectOne((req) => req.url.endsWith('/location')).flush([{ id: 'edge' }]);
    httpTestingController
      .expectOne((req) => req.url.includes('/nslist'))
      .flush([
        {
          _id: 'nsd-db',
          'nsd-id': 'nsd-k8s',
          'nsd-name': 'Kubernetes service',
          nfvo_id: 'nfvo-lab',
          deployment_runtime: 'kubernetes',
        },
      ]);
    httpTestingController
      .expectOne((req) => req.url.endsWith('/k8s'))
      .flush([
        {
          _id: 'cluster-db',
          id: 'cluster-id',
          name: 'lab-cluster',
          nfvo_id: 'nfvo-lab',
          vim_account: 'osm-vim-account',
          k8s_version: 'v1.30.7',
          namespace: 'default',
          created_at: 1,
        },
      ]);
    httpTestingController
      .expectOne((req) => req.url.endsWith('/k8s/vim-accounts/nfvo-lab'))
      .flush([
        {
          id: 'osm-vim-account',
          name: 'Cluster VIM',
          type: 'dummy',
          k8s_cluster_count: 1,
        },
        {
          id: 'post-time-0-osm-vim-id',
          name: 'MrKrabsVIM',
          type: 'dummy',
          k8s_cluster_count: 8,
        },
        {
          id: 'empty-vim-id',
          name: 'MrKrabsVIM2',
          type: 'dummy',
          k8s_cluster_count: 0,
        },
      ]);
    fixture.detectChanges();

    expect((fixture.componentInstance as any).form.value).toMatchObject({
      nsdId: 'nsd-k8s',
      nfvoId: 'nfvo-lab',
      vimAccountId: 'osm-vim-account',
    });
    const vimSelect = fixture.nativeElement.querySelector(
      'select[formControlName="vimAccountId"]',
    ) as HTMLSelectElement;
    const options = Array.from(vimSelect.options);
    expect(options.map((option) => option.value)).toContain('post-time-0-osm-vim-id');
    expect(options.find((option) => option.value === 'empty-vim-id')?.disabled).toBe(true);

    vimSelect.value = 'post-time-0-osm-vim-id';
    vimSelect.dispatchEvent(new Event('change'));
    expect((fixture.componentInstance as any).form.value.vimAccountId).toBe(
      'post-time-0-osm-vim-id',
    );
    (fixture.componentInstance as any).syncSelection();
    expect((fixture.componentInstance as any).form.value.vimAccountId).toBe(
      'post-time-0-osm-vim-id',
    );
    const component = fixture.componentInstance as any;
    await component.onNestSelected({
      target: {
        value: '',
        files: [
          {
            name: 'nest.yaml',
            text: async () => `name: free5gc-sd-000002
service_descriptor:
  ns_list:
    - ns-name: free5gc-sd-000002
      helm_configuration:
        profile: free5gc-sd-v1
        member_vnf_index: free5gc
        kdu_name: free5gc
        sd: "000002"
`,
          },
        ],
      },
    });
    httpTestingController
      .expectOne((req) => req.url.endsWith('/k8s/vim-accounts/nfvo-lab'))
      .flush([{ id: 'post-time-0-osm-vim-id', name: 'OSM VIM', k8s_cluster_count: 8 }]);
    expect(component.form.value.nsName).toBe('free5gc-sd-000002');
    expect(component.form.value.nfvoId).toBe('nfvo-lab');
    expect(component.locationLabel()).toBe('edge');
    expect(component.helmValues()).toContain('000002');
    const emitted: unknown[] = [];
    component.deployed.subscribe((value: unknown) => emitted.push(value));
    component.submit();
    const deploy = httpTestingController.expectOne((req) => req.url.endsWith('/k8s/deploy'));
    expect(deploy.request.body.nest.service_descriptor.ns_list[0].helm_configuration.sd).toBe(
      '000002',
    );
    expect(deploy.request.body.nsdId).toBe('nsd-k8s');
    expect(deploy.request.body.vimAccountId).toBe('post-time-0-osm-vim-id');
    deploy.flush({ message: 'Accepted', osm_response: { id: 'instance' } });
    expect(emitted).toHaveLength(2);
    expect(emitted[0]).toMatchObject({
      status: 'unknown', operationId: deploy.request.body.request_id,
      operation: { submission_state: 'submitting', phase: 'pending' },
    });
    expect(emitted[1]).toEqual(expect.objectContaining({
      status: 'accepted', osmResponse: { id: 'instance' }, operationId: deploy.request.body.request_id,
      operation: expect.objectContaining({ phase: 'pending', submission_state: 'accepted' }),
    }));
    expect(deploy.request.body.request_id).toMatch(/^[0-9a-f-]{36}$/);
    component.clearNest();
    expect(localStorage.getItem('katana-slice-manager.deployment-drafts')).toContain(deploy.request.body.request_id);
    expect(component.nestFileName).toBe('nest.yaml');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input[type="file"]').disabled).toBe(true);
    // Acceptance locks the same attempt. Clicking again cannot create another service.
    component.submit();
    httpTestingController.expectNone((req) => req.method === 'POST');
    expect(localStorage.getItem('katana-slice-manager.deployment-drafts')).toContain(deploy.request.body.request_id);
  });
  it('recovers the saved attempt after reload using only a status read', async () => {
    const id = 'cd35cb3f-35b6-46f8-84f9-d311b00e45f0';
    localStorage.setItem('katana-slice-manager.deployment-drafts', JSON.stringify({
      k8s: { 'k8s-deploy': { state: 'draft', value: { requestId: id } } },
    }));
    await TestBed.configureTestingModule({
      imports: [K8sDeployServiceFormComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(K8sDeployServiceFormComponent);
    httpTestingController = TestBed.inject(HttpTestingController);
    const component = fixture.componentInstance as any;
    const emitted: unknown[] = [];
    component.deployed.subscribe((event: unknown) => emitted.push(event));
    fixture.detectChanges();
    expect(component.form.disabled).toBe(true);
    const operation = { operation_id: id, nfvo_id: 'b', submission_state: 'accepted',
      phase: 'completed', message: 'OSM accepted the request. Workload readiness is not verified.' };
    httpTestingController.expectOne('/api/k8s/operations/' + id).flush(operation);
    httpTestingController.expectOne((req) => req.url.includes('/nslist')).flush([]);
    httpTestingController.expectOne((req) => req.url.endsWith('/k8s')).flush([]);
    httpTestingController.expectOne((req) => req.url.endsWith('/location')).flush([]);
    component.submit();
    httpTestingController.expectNone((req) => req.method === 'POST');
    expect(emitted).toEqual([{ status: 'done', operationId: id, operation }]);
    component.checkOperation();
    const lateStatus = httpTestingController.expectOne('/api/k8s/operations/' + id);
    component.startNewOperation();
    expect(lateStatus.cancelled).toBe(true);
    expect(component.operation).toBeNull();
    expect(component.operationLocked).toBe(false);
    expect(component.requestId).toBe('');
    expect(component.form.enabled).toBe(true);
    expect(localStorage.getItem('katana-slice-manager.deployment-drafts')).not.toContain(id);
  });

  it('shows failed and unknown 202 outcomes accurately and keeps manual recovery feedback neutral', async () => {
    await TestBed.configureTestingModule({
      imports: [K8sDeployServiceFormComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(K8sDeployServiceFormComponent);
    httpTestingController = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpTestingController.expectOne((req) => req.url.endsWith('/location')).flush([{ id: 'edge' }]);
    httpTestingController.expectOne((req) => req.url.includes('/nslist')).flush([{
      _id: 'nsd-db', 'nsd-id': 'nsd-k8s', nfvo_id: 'nfvo-lab', deployment_runtime: 'kubernetes',
    }]);
    httpTestingController.expectOne((req) => req.url.endsWith('/k8s')).flush([{
      _id: 'cluster-db', id: 'cluster-id', name: 'lab-cluster', nfvo_id: 'nfvo-lab',
      vim_account: 'osm-vim-account', k8s_version: 'v1.30.7', namespace: 'default', created_at: 1,
    }]);
    httpTestingController.expectOne((req) => req.url.endsWith('/k8s/vim-accounts/nfvo-lab')).flush([{
      id: 'osm-vim-account', name: 'Cluster VIM', type: 'dummy', k8s_cluster_count: 1,
    }]);
    const component = fixture.componentInstance as any;
    const history = TestBed.inject(DeploymentHistoryService);
    component.deployed.subscribe((attempt: any) => {
      if (!attempt.operationId) return;
      history.addPack({
        name: 'K8s Pack', optionId: 'k8s', optionLabel: 'Kubernetes', shortLabel: 'K8s',
        status: attempt.status, operationId: attempt.operationId, operation: attempt.operation,
        completedAt: new Date().toISOString(), finalConfigurationLabel: 'K8s deployment', requirements: [],
      });
    });
    component.form.patchValue({ nsName: 'test-service', nsDescription: 'test deployment' });
    const emitted: any[] = [];
    component.deployed.subscribe((event: unknown) => emitted.push(event));

    component.submit();
    const failedPost = httpTestingController.expectOne((req) => req.url.endsWith('/k8s/deploy'));
    const failedId = failedPost.request.body.request_id;
    const pendingHistory = history.getPacks().find((pack) => pack.operationId === failedId);
    failedPost.flush({ operation_id: failedId, nfvo_id: 'nfvo-lab', submission_state: 'rejected',
      phase: 'failed', message: 'Submission rejected.' }, { status: 202, statusText: 'Accepted' });
    fixture.detectChanges();
    expect(component.operation.phase).toBe('failed');
    expect(emitted.at(-1).status).toBe('failed');
    expect(fixture.nativeElement.querySelector('.registration-form__status--error')?.textContent)
      .toContain('Submission rejected.');
    expect(fixture.nativeElement.querySelector('.registration-form__status--success')).toBeNull();
    expect(history.getPacks().find((pack) => pack.operationId === failedId)).toMatchObject({
      id: pendingHistory?.id, status: 'failed',
      operation: { submission_state: 'rejected', phase: 'failed' },
    });

    component.startNewOperation();
    fixture.detectChanges();
    component.submit();
    const unknownPost = httpTestingController.expectOne((req) => req.url.endsWith('/k8s/deploy'));
    const unknownId = unknownPost.request.body.request_id;
    unknownPost.flush({ operation_id: unknownId, nfvo_id: 'nfvo-lab', submission_state: 'unknown',
      phase: 'unknown', message: 'Submission outcome is unknown.' }, { status: 202, statusText: 'Accepted' });
    fixture.detectChanges();
    expect(component.operation.phase).toBe('unknown');
    expect(emitted.at(-1).status).toBe('unknown');
    expect(history.getPacks().find((pack) => pack.operationId === unknownId)?.status).toBe('unknown');
    expect(fixture.nativeElement.querySelector('.registration-form__status--success')).toBeNull();
    expect(fixture.nativeElement.querySelector('.registration-form__status--error')).toBeNull();

    component.checkOperation();
    httpTestingController.expectOne('/api/k8s/operations/' + unknownId).flush({
      operation_id: unknownId, nfvo_id: 'nfvo-lab', submission_state: 'unknown', phase: 'unknown',
      message: 'Recovered unknown operation status.',
    });
    fixture.detectChanges();
    expect(component.submitMessage).toBe('Recovered unknown operation status.');
    expect(component.submitSucceeded).toBe(false);
    expect(component.submitFailed).toBe(false);
    expect(fixture.nativeElement.querySelector('.registration-form__status--success')).toBeNull();
    expect(fixture.nativeElement.querySelector('.registration-form__status--error')).toBeNull();

    component.checkOperation();
    httpTestingController.expectOne('/api/k8s/operations/' + unknownId).flush({
      operation_id: unknownId, nfvo_id: 'nfvo-lab', submission_state: 'submitting', phase: 'pending',
      message: 'Submission is still in progress.',
    });
    fixture.detectChanges();
    expect(component.operation.submission_state).toBe('submitting');
    expect(component.operation.phase).toBe('pending');
    expect(emitted.at(-1).status).toBe('unknown');
  });

  it('keeps a mismatched operation response unknown and attached to the current request identity', async () => {
    await TestBed.configureTestingModule({
      imports: [K8sDeployServiceFormComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(K8sDeployServiceFormComponent);
    httpTestingController = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpTestingController.expectOne((req) => req.url.endsWith('/location')).flush([{ id: 'edge' }]);
    httpTestingController.expectOne((req) => req.url.includes('/nslist')).flush([{
      _id: 'nsd-db', 'nsd-id': 'nsd-k8s', nfvo_id: 'nfvo-lab', deployment_runtime: 'kubernetes',
    }]);
    httpTestingController.expectOne((req) => req.url.endsWith('/k8s')).flush([{
      _id: 'cluster-db', id: 'cluster-id', name: 'lab-cluster', nfvo_id: 'nfvo-lab',
      vim_account: 'osm-vim-account', k8s_version: 'v1.30.7', namespace: 'default', created_at: 1,
    }]);
    httpTestingController.expectOne((req) => req.url.endsWith('/k8s/vim-accounts/nfvo-lab')).flush([{
      id: 'osm-vim-account', name: 'Cluster VIM', type: 'dummy', k8s_cluster_count: 1,
    }]);
    const component = fixture.componentInstance as any;
    component.form.patchValue({ nsName: 'test-service', nsDescription: 'test deployment' });
    const emitted: any[] = [];
    component.deployed.subscribe((event: unknown) => emitted.push(event));

    component.submit();
    const post = httpTestingController.expectOne((req) => req.url.endsWith('/k8s/deploy'));
    const requestId = post.request.body.request_id;
    for (const malformed of [null, [], {}, { unexpected: true }]) {
      const normalized = component.normalizeOperation(malformed);
      expect(normalized).toMatchObject({
        operation_id: requestId, submission_state: 'unknown', phase: 'unknown',
      });
    }
    expect(component.normalizeOperation({ operation_id: requestId, submission_state: 'rejected',
      phase: 'completed' })).toMatchObject({
      operation_id: requestId, submission_state: 'unknown', phase: 'unknown',
    });
    expect(component.normalizeOperation({ operation_id: requestId, submission_state: 'submitting',
      phase: 'failed' })).toMatchObject({
      operation_id: requestId, submission_state: 'unknown', phase: 'unknown',
    });
    post.flush({ operation_id: 'a-different-request', nfvo_id: 'other-nfvo', submission_state: 'invalid',
      phase: 'completed', osm_instance_id: 'wrong-instance', message: 'Wrong operation completed.' },
    { status: 202, statusText: 'Accepted' });
    fixture.detectChanges();

    expect(component.requestId).toBe(requestId);
    expect(component.operation.operation_id).toBe(requestId);
    expect(component.operation.phase).toBe('unknown');
    expect(component.operation.submission_state).toBe('unknown');
    expect(component.operation.osm_instance_id).toBeUndefined();
    expect(emitted.at(-1).status).toBe('unknown');
    expect(component.submitSucceeded).toBe(false);
    expect(fixture.nativeElement.querySelector('.registration-form__status--success')).toBeNull();
  });

  it('upserts local request rejection under the same operation identity', async () => {
    await TestBed.configureTestingModule({
      imports: [K8sDeployServiceFormComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(K8sDeployServiceFormComponent);
    httpTestingController = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpTestingController.expectOne((req) => req.url.endsWith('/location')).flush([{ id: 'edge' }]);
    httpTestingController.expectOne((req) => req.url.includes('/nslist')).flush([{
      _id: 'nsd-db', 'nsd-id': 'nsd-k8s', nfvo_id: 'nfvo-lab', deployment_runtime: 'kubernetes',
    }]);
    httpTestingController.expectOne((req) => req.url.endsWith('/k8s')).flush([{
      _id: 'cluster-db', id: 'cluster-id', name: 'lab-cluster', nfvo_id: 'nfvo-lab',
      vim_account: 'osm-vim-account', k8s_version: 'v1.30.7', namespace: 'default', created_at: 1,
    }]);
    httpTestingController.expectOne((req) => req.url.endsWith('/k8s/vim-accounts/nfvo-lab')).flush([{
      id: 'osm-vim-account', name: 'Cluster VIM', type: 'dummy', k8s_cluster_count: 1,
    }]);
    const component = fixture.componentInstance as any;
    component.form.patchValue({ nsName: 'test-service', nsDescription: 'test deployment' });
    const emitted: any[] = [];
    component.deployed.subscribe((attempt: unknown) => emitted.push(attempt));

    component.submit();
    const post = httpTestingController.expectOne((req) => req.url.endsWith('/k8s/deploy'));
    const requestId = post.request.body.request_id;
    post.flush({ error: 'invalid deployment input' }, { status: 400, statusText: 'Bad Request' });

    expect(emitted[0]).toMatchObject({ operationId: requestId, status: 'unknown' });
    expect(emitted.at(-1)).toMatchObject({
      operationId: requestId, status: 'failed',
      operation: { operation_id: requestId, submission_state: 'rejected', phase: 'failed' },
    });
    expect(component.operationLocked).toBe(false);
    expect(component.form.enabled).toBe(true);
  });

  it('cancels a pending manual status read before retrying an unlocked saved request', async () => {
    const id = 'c461a357-a95b-471b-a26b-5869dc22015d';
    localStorage.setItem('katana-slice-manager.deployment-drafts', JSON.stringify({
      k8s: { 'k8s-deploy': { state: 'draft', value: { requestId: id } } },
    }));
    await TestBed.configureTestingModule({
      imports: [K8sDeployServiceFormComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(K8sDeployServiceFormComponent);
    httpTestingController = TestBed.inject(HttpTestingController);
    const component = fixture.componentInstance as any;
    const history = TestBed.inject(DeploymentHistoryService);
    const drafts = TestBed.inject(DeploymentDraftService);
    component.deployed.subscribe((attempt: any) => {
      if (!attempt.operationId) return;
      history.addPack({
        name: 'K8s Pack', optionId: 'k8s', optionLabel: 'Kubernetes', shortLabel: 'K8s',
        status: attempt.status, operationId: attempt.operationId, operation: attempt.operation,
        completedAt: new Date().toISOString(), finalConfigurationLabel: 'K8s deployment', requirements: [],
        formSnapshots: drafts.getSnapshotsForOption('k8s'),
      });
    });
    fixture.detectChanges();
    httpTestingController.expectOne('/api/k8s/operations/' + id).flush(
      { error: 'not found' }, { status: 404, statusText: 'Not Found' },
    );
    httpTestingController.expectOne((req) => req.url.endsWith('/location')).flush([{ id: 'edge' }]);
    httpTestingController.expectOne((req) => req.url.includes('/nslist')).flush([{
      _id: 'nsd-db', 'nsd-id': 'nsd-k8s', nfvo_id: 'nfvo-lab', deployment_runtime: 'kubernetes',
    }]);
    httpTestingController.expectOne((req) => req.url.endsWith('/k8s')).flush([{
      _id: 'cluster-db', id: 'cluster-id', name: 'lab-cluster', nfvo_id: 'nfvo-lab',
      vim_account: 'osm-vim-account', k8s_version: 'v1.30.7', namespace: 'default', created_at: 1,
    }]);
    httpTestingController.expectOne((req) => req.url.endsWith('/k8s/vim-accounts/nfvo-lab')).flush([{
      id: 'osm-vim-account', name: 'Cluster VIM', type: 'dummy', k8s_cluster_count: 1,
    }]);
    component.form.patchValue({ nsdId: 'nsd-k8s', nfvoId: 'nfvo-lab', vimAccountId: 'osm-vim-account',
      nsName: 'test-service', nsDescription: 'test deployment' });

    component.checkOperation();
    const staleRead = httpTestingController.expectOne('/api/k8s/operations/' + id);
    component.submit();
    expect(staleRead.cancelled).toBe(true);
    const post = httpTestingController.expectOne((req) => req.url.endsWith('/k8s/deploy'));
    expect(post.request.body.request_id).toBe(id);
    expect(history.getPacks()[0]).toMatchObject({
      operationId: id, status: 'unknown',
      operation: { operation_id: id, submission_state: 'submitting', phase: 'pending' },
    });

    const olderPack = history.addPack({
      name: 'Older K8s Pack', optionId: 'k8s', optionLabel: 'Kubernetes', shortLabel: 'K8s',
      status: 'done', operationId: 'older-request', completedAt: new Date().toISOString(),
      finalConfigurationLabel: 'K8s deployment', requirements: [],
      formSnapshots: { 'k8s-deploy': { requestId: 'older-request' } },
    });
    fixture.destroy();
    expect(post.cancelled).toBe(true);
    drafts.loadPackAsDraft(olderPack);
    expect(JSON.parse(localStorage.getItem('katana-slice-manager.deployment-drafts') || '{}')
      .k8s['k8s-deploy'].value.requestId).toBe('older-request');
    expect(history.getPacks().find((pack) => pack.operationId === id)).toMatchObject({
      status: 'unknown', operation: { phase: 'pending', submission_state: 'submitting' },
    });
  });

});
