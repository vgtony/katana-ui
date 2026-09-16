import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { K8sClusterRegistrationFormComponent } from './k8s-cluster-registration-form/k8s-cluster-registration-form.component';
import { K8sDeployServiceFormComponent } from './k8s-deploy-service-form/k8s-deploy-service-form.component';

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
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    const fixture: ComponentFixture<K8sClusterRegistrationFormComponent> = TestBed.createComponent(
      K8sClusterRegistrationFormComponent,
    );
    httpTestingController = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    expect((fixture.componentInstance as any).form.value.credentials).toBe(
      'uploaded-kubeconfig.yaml',
    );
    httpTestingController.expectOne((req) => req.url.includes('/nfvo')).flush([]);
  });

  it('lists enabled OSM VIMs, including accounts created after Time-0, for cluster registration', async () => {
    await TestBed.configureTestingModule({
      imports: [K8sClusterRegistrationFormComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    const fixture: ComponentFixture<K8sClusterRegistrationFormComponent> = TestBed.createComponent(
      K8sClusterRegistrationFormComponent,
    );
    httpTestingController = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
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
  });

  it('lists live OSM VIMs and disables those without Kubernetes clusters for deployment', async () => {
    await TestBed.configureTestingModule({
      imports: [K8sDeployServiceFormComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    const fixture: ComponentFixture<K8sDeployServiceFormComponent> = TestBed.createComponent(
      K8sDeployServiceFormComponent,
    );
    httpTestingController = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
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
  });
});
