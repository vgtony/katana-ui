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

  it('fills NSD, owning NFVO, and cluster VIM account from inventory', async () => {
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
    fixture.detectChanges();

    expect((fixture.componentInstance as any).form.value).toMatchObject({
      nsdId: 'nsd-k8s',
      nfvoId: 'nfvo-lab',
      vimAccountId: 'osm-vim-account',
    });
  });
});
