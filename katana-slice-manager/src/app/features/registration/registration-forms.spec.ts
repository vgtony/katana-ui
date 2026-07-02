import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Type } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Validators } from '@angular/forms';
import { vi } from 'vitest';
import { FunctionRegistrationFormComponent } from './function-registration-form/function-registration-form.component';
import { K8sClusterRegistrationFormComponent } from './k8s-cluster-registration-form/k8s-cluster-registration-form.component';
import { K8sCredentialsUploadFormComponent } from './k8s-credentials-upload-form/k8s-credentials-upload-form.component';
import { K8sDeployServiceFormComponent } from './k8s-deploy-service-form/k8s-deploy-service-form.component';
import { K8sMigrationFormComponent } from './k8s-migration-form/k8s-migration-form.component';
import { KubernetesRegistrationFormComponent } from './kubernetes-registration-form/kubernetes-registration-form.component';
import { LocationRegistrationFormComponent } from './location-registration-form/location-registration-form.component';
import { NfvoRegistrationFormComponent } from './nfvo-registration-form/nfvo-registration-form.component';
import { PqcSliceDeploymentFormComponent } from './pqc-slice-deployment-form/pqc-slice-deployment-form.component';
import { ProxmoxClusterRegistrationFormComponent } from './proxmox-cluster-registration-form/proxmox-cluster-registration-form.component';
import { ProxmoxRegistrationFormComponent } from './proxmox-registration-form/proxmox-registration-form.component';
import { ProxmoxStandaloneRegistrationFormComponent } from './proxmox-standalone-registration-form/proxmox-standalone-registration-form.component';
import { ProxmoxVmCreationFormComponent } from './proxmox-vm-creation-form/proxmox-vm-creation-form.component';
import { SliceRegistrationFormComponent } from './slice-registration-form/slice-registration-form.component';
import { VimRegistrationFormComponent } from './vim-registration-form/vim-registration-form.component';

type RegistrationFormComponent = Type<unknown>;

interface FormDefinition {
  component: RegistrationFormComponent;
  name: string;
  requiredControls: string[];
  optionalControls: string[];
}

const formDefinitions: FormDefinition[] = [
  {
    component: FunctionRegistrationFormComponent,
    name: 'FunctionRegistrationFormComponent',
    requiredControls: ['id', 'name', 'gen', 'func', 'type', 'location', 'nsdId', 'nsName', 'placement'],
    optionalControls: ['sharedAvailability', 'optional']
  },
  {
    component: K8sClusterRegistrationFormComponent,
    name: 'K8sClusterRegistrationFormComponent',
    requiredControls: [
      'schemaVersion',
      'credentials',
      'schemaType',
      'name',
      'description',
      'vimAccount',
      'nfvoIp',
      'nfvoUsername',
      'nfvoPassword',
      'k8sVersion',
      'namespace'
    ],
    optionalControls: ['k8sNet1', 'jujuBundle', 'helmChartV3']
  },
  {
    component: K8sCredentialsUploadFormComponent,
    name: 'K8sCredentialsUploadFormComponent',
    requiredControls: ['credentialsFile'],
    optionalControls: []
  },
  {
    component: K8sDeployServiceFormComponent,
    name: 'K8sDeployServiceFormComponent',
    requiredControls: ['nfvoId', 'nsdId', 'nsName', 'nsDescription', 'vimAccountId'],
    optionalControls: []
  },
  {
    component: K8sMigrationFormComponent,
    name: 'K8sMigrationFormComponent',
    requiredControls: ['podPrefix', 'targetNode', 'namespace', 'deployment', 'config'],
    optionalControls: []
  },
  {
    component: KubernetesRegistrationFormComponent,
    name: 'KubernetesRegistrationFormComponent',
    requiredControls: ['clusterName', 'apiServer', 'namespace', 'serviceAccount', 'kubeconfigSecret'],
    optionalControls: []
  },
  {
    component: LocationRegistrationFormComponent,
    name: 'LocationRegistrationFormComponent',
    requiredControls: ['id', 'description'],
    optionalControls: []
  },
  {
    component: NfvoRegistrationFormComponent,
    name: 'NfvoRegistrationFormComponent',
    requiredControls: [
      'id',
      'name',
      'nfvoip',
      'nfvousername',
      'nfvopassword',
      'tenantname',
      'type',
      'configId',
      'configNfvoUsername',
      'configNfvoPassword',
      'configNfvoIp',
      'configTenantName'
    ],
    optionalControls: ['version', 'description']
  },
  {
    component: PqcSliceDeploymentFormComponent,
    name: 'PqcSliceDeploymentFormComponent',
    requiredControls: ['sliceFile', 'proxmoxFile', 'ansibleControllerIp'],
    optionalControls: ['enablePqc', 'enableProxmox']
  },
  {
    component: ProxmoxClusterRegistrationFormComponent,
    name: 'ProxmoxClusterRegistrationFormComponent',
    requiredControls: ['url', 'username', 'password'],
    optionalControls: []
  },
  {
    component: ProxmoxStandaloneRegistrationFormComponent,
    name: 'ProxmoxStandaloneRegistrationFormComponent',
    requiredControls: ['url', 'username', 'password'],
    optionalControls: ['verifySsl', 'authMethod', 'apiTokenId', 'apiTokenSecret']
  },
  {
    component: ProxmoxRegistrationFormComponent,
    name: 'ProxmoxRegistrationFormComponent',
    requiredControls: ['clusterName', 'nodeEndpoint', 'tokenId', 'secret', 'resourcePool'],
    optionalControls: []
  },
  {
    component: ProxmoxVmCreationFormComponent,
    name: 'ProxmoxVmCreationFormComponent',
    requiredControls: [
      'clusterName',
      'vmName',
      'cpu',
      'ram',
      'storageType',
      'diskSize',
      'managementBridgeName',
      'managementBridgeType'
    ],
    optionalControls: [
      'template',
      'isoImage',
      'start',
      'vmTargets',
      'customBridgeName',
      'customBridgeType',
      'customIp',
      'customNetmask',
      'customGateway'
    ]
  },
  {
    component: SliceRegistrationFormComponent,
    name: 'SliceRegistrationFormComponent',
    requiredControls: [
      'baseSliceDesId',
      'coverage',
      'networkDlGuaranteed',
      'ueDlGuaranteed',
      'networkUlGuaranteed',
      'ueUlGuaranteed',
      'mtu',
      'nsdId',
      'nsName',
      'placement'
    ],
    optionalControls: ['delayTolerance', 'optional']
  },
  {
    component: VimRegistrationFormComponent,
    name: 'VimRegistrationFormComponent',
    requiredControls: [
      'id',
      'name',
      'authUrl',
      'username',
      'password',
      'adminProjectName',
      'location',
      'type',
      'version'
    ],
    optionalControls: ['description', 'infrastructureMonitoring', 'securityGroups']
  }
];

function createValidValue(currentValue: unknown): unknown {
  if (typeof currentValue === 'number') {
    return 1;
  }

  if (typeof currentValue === 'boolean') {
    return true;
  }

  return 'test-value';
}

describe('Registration form components', () => {
  formDefinitions.forEach((definition) => {
    describe(definition.name, () => {
      let fixture: ComponentFixture<unknown>;
      let component: Record<string, any>;

      beforeEach(async () => {
        await TestBed.configureTestingModule({
          imports: [definition.component],
          providers: [provideHttpClient(), provideHttpClientTesting()]
        }).compileComponents();

        fixture = TestBed.createComponent(definition.component);
        component = fixture.componentInstance as Record<string, any>;
        fixture.detectChanges();
      });

      it('creates the form component', () => {
        expect(component).toBeTruthy();
        expect(component['form']).toBeTruthy();
      });

      it('marks the expected controls as required and optional', () => {
        const form = component['form'];

        definition.requiredControls.forEach((controlName) => {
          expect(form.get(controlName)?.hasValidator(Validators.required)).toBe(true);
        });

        definition.optionalControls.forEach((controlName) => {
          expect(form.get(controlName)?.hasValidator(Validators.required)).toBe(false);
        });
      });

      it('rejects empty required fields and accepts valid values', () => {
        const form = component['form'];

        definition.requiredControls.forEach((controlName) => {
          const control = form.get(controlName);

          control?.setValue(null);
          control?.markAsTouched();
          control?.updateValueAndValidity();

          expect(control?.hasError('required')).toBe(true);

          control?.setValue(createValidValue(control?.value));
          control?.updateValueAndValidity();

          expect(control?.hasError('required')).toBe(false);
        });
      });
    });
  });

  describe('K8sClusterRegistrationFormComponent submission', () => {
    let fixture: ComponentFixture<K8sClusterRegistrationFormComponent>;
    let httpTestingController: HttpTestingController;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [K8sClusterRegistrationFormComponent],
        providers: [provideHttpClient(), provideHttpClientTesting()]
      }).compileComponents();

      fixture = TestBed.createComponent(K8sClusterRegistrationFormComponent);
      httpTestingController = TestBed.inject(HttpTestingController);
      fixture.detectChanges();
    });

    afterEach(() => {
      httpTestingController.verify();
    });

    it('submits a blank optional K8s network as null', () => {
      const component = fixture.componentInstance as any;
      component.form.setValue({
        schemaVersion: '1.0',
        credentials: 'creds.yaml',
        schemaType: 'k8scluster',
        name: 'microk8s-lab',
        description: 'Lab Kubernetes cluster',
        vimAccount: 'vim-lab',
        nfvoIp: 'nbi.10.0.0.1.nip.io',
        nfvoUsername: 'admin',
        nfvoPassword: 'admin',
        k8sVersion: 'v1.30.7',
        k8sNet1: '',
        namespace: 'default',
        jujuBundle: true,
        helmChartV3: true
      });

      fixture.detectChanges();

      const submitButton = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
      submitButton.click();
      fixture.detectChanges();

      const request = httpTestingController.expectOne((req) => req.url.includes('/k8s'));
      expect(request.request.method).toBe('POST');
      expect(request.request.body.nets.k8s_net1).toBeNull();
      request.flush({ message: 'Kubernetes cluster registered', id: 'k8s-1' });
    });

    it('labels the K8s network field as optional', () => {
      expect(fixture.nativeElement.textContent).toContain('K8s network (optional)');
      expect(fixture.nativeElement.textContent).not.toContain('k8s_net1 *');
    });
  });

  describe('LocationRegistrationFormComponent submission state', () => {
    let fixture: ComponentFixture<LocationRegistrationFormComponent>;
    let httpTestingController: HttpTestingController;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [LocationRegistrationFormComponent],
        providers: [provideHttpClient(), provideHttpClientTesting()]
      }).compileComponents();

      fixture = TestBed.createComponent(LocationRegistrationFormComponent);
      httpTestingController = TestBed.inject(HttpTestingController);
      fixture.detectChanges();
    });

    afterEach(() => {
      httpTestingController.verify();
    });

    it('shows Created after a successful location response', () => {
      const component = fixture.componentInstance as any;
      component.form.setValue({
        id: 'group0_edge',
        description: 'Group 0 Edge location'
      });

      fixture.detectChanges();

      const submitButton = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
      submitButton.click();
      fixture.detectChanges();

      const request = httpTestingController.expectOne((req) => req.url.includes('/location'));
      expect(request.request.method).toBe('POST');
      request.flush('c1f72df2-f5cf-447f-b53f-9a5d6ee5c9cb');
      fixture.detectChanges();

      expect(submitButton.textContent?.trim()).toBe('Created');
      expect(fixture.nativeElement.textContent).toContain('Location created successfully');
    });
  });

  describe('FunctionRegistrationFormComponent mapper defaults', () => {
    let fixture: ComponentFixture<FunctionRegistrationFormComponent>;
    let httpTestingController: HttpTestingController;

    beforeEach(async () => {
      localStorage.clear();
      localStorage.setItem(
        'katana-slice-manager.deployment-drafts',
        JSON.stringify({
          slice: {
            location: {
              state: 'active',
              value: {
                id: 'core1234',
                description: 'Coverage location'
              }
            },
            slice: {
              state: 'draft',
              value: {
                coverage: 'core1234',
                networkDlGuaranteed: 1500000,
                nsdId: 'selected-nsd-id',
                nsName: 'selected-ns-name'
              }
            }
          }
        })
      );

      await TestBed.configureTestingModule({
        imports: [FunctionRegistrationFormComponent],
        providers: [provideHttpClient(), provideHttpClientTesting()]
      }).compileComponents();

      fixture = TestBed.createComponent(FunctionRegistrationFormComponent);
      httpTestingController = TestBed.inject(HttpTestingController);
      fixture.detectChanges();
    });

    afterEach(() => {
      httpTestingController.verify();
      localStorage.clear();
    });

    it('creates the required radio function for the saved coverage location', () => {
      const component = fixture.componentInstance as any;

      expect(component.form.value).toMatchObject({
        id: 'core1234-radio-function-id',
        name: 'core1234-radio-function-id',
        gen: 5,
        func: 1,
        location: 'core1234',
        nsdId: 'selected-nsd-id',
        nsName: 'selected-ns-name',
        placement: 1
      });

      const submitButton = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
      submitButton.click();
      fixture.detectChanges();

      const request = httpTestingController.expectOne((req) => req.url.includes('/function'));
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({
        id: 'core1234-radio-function-id',
        name: 'core1234-radio-function-id',
        gen: 5,
        func: 1,
        shared: { availability: false },
        type: 0,
        location: 'core1234',
        pnf_list: [],
        ns_list: [
          {
            'nsd-id': 'selected-nsd-id',
            'ns-name': 'selected-ns-name',
            placement: 1,
            optional: false
          }
        ]
      });
      request.flush('core1234-radio-function-id');
    });
  });

  describe('SliceRegistrationFormComponent submission', () => {
    let fixture: ComponentFixture<SliceRegistrationFormComponent>;
    let httpTestingController: HttpTestingController;

    beforeEach(async () => {
      localStorage.clear();

      await TestBed.configureTestingModule({
        imports: [SliceRegistrationFormComponent],
        providers: [provideHttpClient(), provideHttpClientTesting()]
      }).compileComponents();

      fixture = TestBed.createComponent(SliceRegistrationFormComponent);
      httpTestingController = TestBed.inject(HttpTestingController);
      fixture.detectChanges();
    });

    afterEach(() => {
      httpTestingController.verify();
      localStorage.clear();
    });

    function fillEmbbSliceForm(): void {
      const component = fixture.componentInstance as any;
      component.form.setValue({
        baseSliceDesId: 'slice-1',
        coverage: 'core1234',
        delayTolerance: true,
        networkDlGuaranteed: 1500000,
        ueDlGuaranteed: 1500000,
        networkUlGuaranteed: 50000,
        ueUlGuaranteed: 60000,
        mtu: 1500,
        nsdId: 'selected-nsd-id',
        nsName: 'selected-ns-name',
        placement: 1,
        optional: false
      });
      fixture.detectChanges();
    }

    it('sends only the slice payload when creating a slice', () => {
      fillEmbbSliceForm();
      const component = fixture.componentInstance as any;

      component.submit();

      const sliceRequest = httpTestingController.expectOne((req) => req.url.includes('/slice'));
      expect(sliceRequest.request.method).toBe('POST');
      expect(sliceRequest.request.body.base_slice_descriptor).toMatchObject({
        coverage: ['core1234'],
        delay_tolerance: true,
        network_DL_throughput: { guaranteed: 1500000 }
      });
      httpTestingController.expectNone((req) => req.url.includes('/function'));
      sliceRequest.flush('slice-1');
    });
  });

  describe('ProxmoxClusterRegistrationFormComponent submission state', () => {
    let fixture: ComponentFixture<ProxmoxClusterRegistrationFormComponent>;
    let httpTestingController: HttpTestingController;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [ProxmoxClusterRegistrationFormComponent],
        providers: [provideHttpClient(), provideHttpClientTesting()]
      }).compileComponents();

      fixture = TestBed.createComponent(ProxmoxClusterRegistrationFormComponent);
      httpTestingController = TestBed.inject(HttpTestingController);
      fixture.detectChanges();
    });

    afterEach(() => {
      httpTestingController.verify();
    });

    it('shows Registered after a successful Proxmox cluster response', () => {
      const component = fixture.componentInstance as any;
      component.form.setValue({
        url: 'https://10.0.0.10:8006',
        username: 'root@pam',
        password: 'securepassword123'
      });

      fixture.detectChanges();

      const submitButton = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
      submitButton.click();
      fixture.detectChanges();

      const request = httpTestingController.expectOne((req) => req.url.includes('/proxmox/cluster'));
      expect(request.request.method).toBe('POST');
      request.flush({
        cluster_id: '550e8400-e29b-41d4-a716-446655440000',
        cluster_name: 'Antares',
        datacenters: [
          { id: 'cluster', name: 'Antares', node_count: 3 },
          { id: 'dc-2', name: 'Borealis', node_count: 2 },
          { id: 'dc-3', name: 'Cygnus', node_count: 1 }
        ],
        nodes: [],
        servers: []
      });
      fixture.detectChanges();

      expect(submitButton.textContent?.trim()).toBe('Registered');
      expect(fixture.nativeElement.textContent).toContain(
        'Registered Proxmox cluster. Found 3 datacenters.'
      );
    });
  });

  describe('ProxmoxVmCreationFormComponent submission state', () => {
    let fixture: ComponentFixture<ProxmoxVmCreationFormComponent>;
    let httpTestingController: HttpTestingController;

    beforeEach(async () => {
      localStorage.clear();
      localStorage.setItem(
        'katana-slice-manager.deployment-drafts',
        JSON.stringify({
          'proxmox-standalone': {
            'proxmox-standalone': {
              state: 'active',
              value: {
                name: 'lab-proxmox',
                url: 'https://proxmox.example:8006',
                verifySsl: false,
                authMethod: 'password',
                username: 'root@pam',
                password: 'secret',
                apiTokenId: '',
                apiTokenSecret: ''
              }
            }
          }
        })
      );

      await TestBed.configureTestingModule({
        imports: [ProxmoxVmCreationFormComponent],
        providers: [provideHttpClient(), provideHttpClientTesting()]
      }).compileComponents();

      fixture = TestBed.createComponent(ProxmoxVmCreationFormComponent);
      httpTestingController = TestBed.inject(HttpTestingController);
      fixture.detectChanges();
    });

    afterEach(() => {
      httpTestingController.verify();
      localStorage.clear();
    });

    it('polls vm-ip until Proxmox reports a ready IP', () => {
      vi.useFakeTimers();

      const component = fixture.componentInstance as any;
      component.form.setValue({
        clusterName: 'prod-cluster-01',
        vmName: 'web-server-01',
        template: 'ubuntu-2204-cloudinit',
        isoImage: '',
        start: false,
        cpu: 4,
        ram: 4096,
        storageType: 'local-lvm',
        diskSize: 50,
        vmTargets: [],
        managementBridgeName: 'vmbr0',
        managementBridgeType: 'management',
        customBridgeName: 'vmbr1',
        customBridgeType: 'service',
        customIp: '192.168.1.100',
        customNetmask: '255.255.255.0',
        customGateway: '192.168.1.1'
      });

      fixture.detectChanges();

      const submitButton = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
      submitButton.click();
      fixture.detectChanges();

      const request = httpTestingController.expectOne((req) => req.url.includes('/proxmox/provision'));
      expect(request.request.method).toBe('POST');
      expect(request.request.body.cluster_name).toBe('prod-cluster-01');
      expect(request.request.body.node).toBeUndefined();
      expect(request.request.body.vms[0].bridges).toHaveLength(2);
      request.flush({
        cluster: 'prod-cluster-01',
        node: 'pve-01',
        vm_count: 1,
        results: [
          {
            name: 'web-server-01',
            vmid: 123,
            template: null,
            source: 'ubuntu-2204-cloudinit',
            node: 'pve-01',
            status: 'running',
            started: true,
            bridges: []
          }
        ]
      });
      fixture.detectChanges();

      expect(submitButton.textContent?.trim()).toBe('Waiting for VM IP...');
      expect(fixture.nativeElement.textContent).toContain(
        'Waiting for Proxmox to report the guest IP for VM 123'
      );

      vi.advanceTimersByTime(0);
      const pendingIpRequest = httpTestingController.expectOne(
        (req) => req.url.includes('/proxmox/vm-ip')
      );
      expect(pendingIpRequest.request.method).toBe('POST');
      expect(pendingIpRequest.request.body).toEqual({
        cluster_name: 'prod-cluster-01',
        node: 'pve-01',
        vmid: 123
      });
      pendingIpRequest.flush({
        cluster: 'prod-cluster-01',
        node: 'pve-01',
        vmid: 123,
        primary_ip: null,
        ip_addresses: [],
        ip_status: 'pending',
        network_interfaces: [],
        error: null
      });
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('Current status: IP pending.');

      vi.advanceTimersByTime(4000);
      const readyIpRequest = httpTestingController.expectOne(
        (req) => req.url.includes('/proxmox/vm-ip')
      );
      readyIpRequest.flush({
        cluster: 'prod-cluster-01',
        node: 'pve-01',
        vmid: 123,
        primary_ip: '10.160.101.55',
        ip_addresses: ['10.160.101.55'],
        ip_status: 'ready',
        network_interfaces: [{ name: 'eth0', ipv4: ['10.160.101.55'] }],
        error: null
      });
      fixture.detectChanges();

      expect(submitButton.textContent?.trim()).toBe('Deployment Started');
      expect(fixture.nativeElement.textContent).toContain('VM Deployed. IP: 10.160.101.55');
      httpTestingController.expectNone((req) => req.url.includes('/proxmox/list-vms'));
      vi.useRealTimers();
    });

    it('allows deploying without custom bridge values', () => {
      const component = fixture.componentInstance as any;
      component.form.setValue({
        clusterName: 'prod-cluster-01',
        vmName: 'web-server-01',
        template: 'ubuntu-2204-cloudinit',
        isoImage: '',
        start: false,
        cpu: 4,
        ram: 4096,
        storageType: 'local-lvm',
        diskSize: 50,
        vmTargets: [],
        managementBridgeName: 'vmbr0',
        managementBridgeType: 'management',
        customBridgeName: '',
        customBridgeType: '',
        customIp: '',
        customNetmask: '',
        customGateway: ''
      });

      fixture.detectChanges();

      const submitButton = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
      submitButton.click();
      fixture.detectChanges();

      const request = httpTestingController.expectOne((req) => req.url.includes('/proxmox/provision'));
      expect(request.request.method).toBe('POST');
      expect(request.request.body.node).toBeUndefined();
      expect(request.request.body.vms[0].bridges).toHaveLength(1);
      expect(request.request.body.vms[0].bridges[0]).toEqual({
        name: 'vmbr0',
        type: 'management'
      });
      request.flush({
        cluster: 'prod-cluster-01',
        node: 'pve-01',
        vm_count: 1,
        results: []
      });
      fixture.detectChanges();

      expect(submitButton.textContent?.trim()).toBe('Deployment Started');
      httpTestingController.expectNone((req) => req.url.includes('/proxmox/list-vms'));
      httpTestingController.expectNone((req) => req.url.includes('/proxmox/vm-ip'));
    });

    it('shows an invalid-form error and marks missing required fields as invalid', () => {
      const component = fixture.componentInstance as any;
      component.form.patchValue({
        clusterName: '',
        vmName: '',
        managementBridgeName: '',
        managementBridgeType: ''
      });

      fixture.detectChanges();

      const submitButton = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
      expect(submitButton.disabled).toBe(false);

      submitButton.click();
      fixture.detectChanges();

      httpTestingController.expectNone((req) => req.url.includes('/proxmox/provision'));
      expect(component.form.get('clusterName')?.touched).toBe(true);
      expect(component.form.get('vmName')?.touched).toBe(true);
      expect(component.form.get('managementBridgeName')?.touched).toBe(true);
      expect(component.form.get('managementBridgeType')?.touched).toBe(true);
      expect(fixture.nativeElement.textContent).toContain(
        'Complete all required fields before deploying.'
      );
      expect(
        fixture.nativeElement
          .querySelector('input[formControlName="clusterName"]')
          ?.classList.contains('ng-invalid')
      ).toBe(true);
    });

    it('allows deploying from an ISO when no template is provided', () => {
      const component = fixture.componentInstance as any;
      component.form.setValue({
        clusterName: 'prod-cluster-01',
        vmName: 'web-server-01',
        template: '',
        isoImage: 'local:iso/ubuntu-22.04-live-server-amd64.iso',
        start: false,
        cpu: 4,
        ram: 4096,
        storageType: 'local-lvm',
        diskSize: 50,
        vmTargets: [],
        managementBridgeName: 'vmbr0',
        managementBridgeType: 'management',
        customBridgeName: '',
        customBridgeType: '',
        customIp: '',
        customNetmask: '',
        customGateway: ''
      });

      fixture.detectChanges();

      const submitButton = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
      submitButton.click();
      fixture.detectChanges();

      const request = httpTestingController.expectOne((req) => req.url.includes('/proxmox/provision'));
      expect(request.request.method).toBe('POST');
      expect(request.request.body.node).toBeUndefined();
      expect(request.request.body.vms[0].template).toBeUndefined();
      expect(request.request.body.vms[0].iso_image).toBe(
        'local:iso/ubuntu-22.04-live-server-amd64.iso'
      );
      request.flush({
        cluster: 'prod-cluster-01',
        node: 'pve-01',
        vm_count: 1,
        results: []
      });
      fixture.detectChanges();

      expect(submitButton.textContent?.trim()).toBe('Deployment Started');
      httpTestingController.expectNone((req) => req.url.includes('/proxmox/list-vms'));
      httpTestingController.expectNone((req) => req.url.includes('/proxmox/vm-ip'));
    });

    it('emits a failed deployment attempt with the API error type when deployment fails', () => {
      const component = fixture.componentInstance as any;
      const deploymentAttempts: Array<{ status: string; errorType?: string }> = [];
      component.deployed.subscribe((event: { status: string; errorType?: string }) => {
        deploymentAttempts.push(event);
      });

      component.form.setValue({
        clusterName: 'prod-cluster-01',
        vmName: 'web-server-01',
        template: 'ubuntu-2204-cloudinit',
        isoImage: '',
        start: false,
        cpu: 4,
        ram: 4096,
        storageType: 'local-lvm',
        diskSize: 50,
        vmTargets: [],
        managementBridgeName: 'vmbr0',
        managementBridgeType: 'management',
        customBridgeName: '',
        customBridgeType: '',
        customIp: '',
        customNetmask: '',
        customGateway: ''
      });

      fixture.detectChanges();

      const submitButton = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
      submitButton.click();
      fixture.detectChanges();

      const request = httpTestingController.expectOne((req) => req.url.includes('/proxmox/provision'));
      request.flush(
        {
          type: 'Template Missing',
          message: 'Template ubuntu-2204-cloudinit could not be found.'
        },
        {
          status: 500,
          statusText: 'Internal Server Error'
        }
      );
      fixture.detectChanges();

      expect(deploymentAttempts).toEqual([
        {
          status: 'failed',
          errorType: 'Template Missing'
        }
      ]);
      expect(fixture.nativeElement.textContent).toContain(
        'Template ubuntu-2204-cloudinit could not be found.'
      );
    });

    it('builds one VM for the selected standalone server and sends cluster_id plus the node', () => {
      fixture.componentRef.setInput('standaloneClusterId', 'saved-katana-id');
      fixture.componentRef.setInput('standaloneClusterName', 'standalone-lab');
      fixture.componentRef.setInput('serverTargets', [
        {
          node: 'cls01srv01',
          storageOptions: ['datastorage', 'fast'],
          storageIsoImages: [
            {
              storage: 'datastorage',
              isoImages: ['local:iso/ubuntu-22.04-live-server-amd64.iso']
            },
            {
              storage: 'fast',
              isoImages: ['local:iso/ubuntu-24.04-live-server-amd64.iso']
            }
          ]
        }
      ]);
      fixture.detectChanges();

      const component = fixture.componentInstance as any;
      component.form.patchValue({
        managementBridgeName: 'vmbr0',
        managementBridgeType: 'management',
        customBridgeName: '',
        customBridgeType: '',
        customIp: '',
        customNetmask: '',
        customGateway: ''
      });
      component.form.controls.vmTargets.at(0).patchValue({
        vmName: 'edge-01',
        template: 'ubuntu-2204-cloudinit',
        isoImage: '',
        start: false,
        cpu: 8,
        ram: 8192,
        storageType: 'fast',
        diskSize: 120
      });
      fixture.detectChanges();

      const submitButton = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
      submitButton.click();
      fixture.detectChanges();

      const request = httpTestingController.expectOne((req) => req.url.includes('/proxmox/provision'));
      expect(request.request.body.cluster_id).toBe('saved-katana-id');
      expect(request.request.body.cluster_name).toBeUndefined();
      expect(request.request.body.node).toBe('cls01srv01');
      expect(request.request.body.vms).toEqual([
        {
          name: 'edge-01',
          template: 'ubuntu-2204-cloudinit',
          cpu: 8,
          ram: 8192,
          storage_type: 'fast',
          disk_size: 120,
          start: false,
          bridges: [{ name: 'vmbr0', type: 'management' }]
        }
      ]);
      request.flush({
        cluster: 'standalone-lab',
        node: 'cls01srv01',
        vm_count: 1,
        results: []
      });
      httpTestingController.expectNone((req) => req.url.includes('/proxmox/list-vms'));
      httpTestingController.expectNone((req) => req.url.includes('/proxmox/vm-ip'));
    });

    it('keeps the ISO dropdown disabled until a storage is chosen and then shows that storage ISOs', () => {
      fixture.componentRef.setInput('standaloneClusterId', 'saved-katana-id');
      fixture.componentRef.setInput('standaloneClusterName', 'standalone-lab');
      fixture.componentRef.setInput('serverTargets', [
        {
          node: 'cls01srv01',
          storageOptions: ['datastorage', 'fast'],
          storageIsoImages: [
            {
              storage: 'datastorage',
              isoImages: ['local:iso/ubuntu-22.04-live-server-amd64.iso']
            },
            {
              storage: 'fast',
              isoImages: ['local:iso/ubuntu-24.04-live-server-amd64.iso']
            }
          ]
        }
      ]);
      fixture.detectChanges();

      const component = fixture.componentInstance as any;
      const storageSelect = component.form.controls.vmTargets.at(0).get('storageType');
      const isoSelect = component.form.controls.vmTargets.at(0).get('isoImage');
      const standaloneStorageSelect = fixture.nativeElement.querySelector(
        '[formarrayname="vmTargets"] select[formControlName="storageType"]'
      ) as HTMLSelectElement;
      const standaloneIsoSelect = fixture.nativeElement.querySelector(
        '[formarrayname="vmTargets"] select[formControlName="isoImage"]'
      ) as HTMLSelectElement;

      expect(storageSelect?.value).toBe('');
      expect(standaloneStorageSelect.options[0]?.textContent?.trim()).toBe('Choose a storage');
      expect(standaloneIsoSelect.disabled).toBe(true);
      expect(standaloneIsoSelect.options[0]?.textContent?.trim()).toBe('Choose a storage first');

      storageSelect?.setValue('fast');
      component.handleStorageSelectionChange(0);
      fixture.detectChanges();

      const enabledIsoSelect = fixture.nativeElement.querySelector(
        '[formarrayname="vmTargets"] select[formControlName="isoImage"]'
      ) as HTMLSelectElement;

      expect(enabledIsoSelect.disabled).toBe(false);
      expect(enabledIsoSelect.options[1]?.textContent?.trim()).toBe(
        'local:iso/ubuntu-24.04-live-server-amd64.iso'
      );

      isoSelect?.setValue('local:iso/ubuntu-24.04-live-server-amd64.iso');
      storageSelect?.setValue('datastorage');
      component.handleStorageSelectionChange(0);
      fixture.detectChanges();

      const changedIsoSelect = fixture.nativeElement.querySelector(
        '[formarrayname="vmTargets"] select[formControlName="isoImage"]'
      ) as HTMLSelectElement;

      expect(isoSelect?.value).toBe('');
      expect(changedIsoSelect.options[1]?.textContent?.trim()).toBe(
        'local:iso/ubuntu-22.04-live-server-amd64.iso'
      );
    });

    it('submits selected-server deployments even when hidden single-vm draft fields are invalid', () => {
      fixture.destroy();
      localStorage.setItem(
        'katana-slice-manager.deployment-drafts',
        JSON.stringify({
          'proxmox-standalone': {
            'proxmox-vm': {
              state: 'draft',
              value: {
                clusterName: '',
                vmName: '',
                template: '',
                isoImage: '',
                start: false,
                cpu: null,
                ram: null,
                storageType: '',
                diskSize: null,
                vmTargets: [],
                managementBridgeName: 'vmbr0',
                managementBridgeType: 'management',
                customBridgeName: '',
                customBridgeType: '',
                customIp: '',
                customNetmask: '',
                customGateway: ''
              }
            }
          }
        })
      );
      fixture = TestBed.createComponent(ProxmoxVmCreationFormComponent);
      httpTestingController = TestBed.inject(HttpTestingController);
      fixture.componentRef.setInput('standaloneClusterId', 'saved-katana-id');
      fixture.componentRef.setInput('standaloneClusterName', 'standalone-lab');
      fixture.componentRef.setInput('serverTargets', [
        {
          node: 'cls01srv01',
          storageOptions: ['fast'],
          storageIsoImages: [
            {
              storage: 'fast',
              isoImages: ['local:iso/ubuntu-22.04-live-server-amd64.iso']
            }
          ]
        }
      ]);
      fixture.detectChanges();

      const component = fixture.componentInstance as any;
      component.form.controls.vmTargets.at(0).patchValue({
        vmName: 'edge-01',
        template: '',
        isoImage: 'local:iso/ubuntu-22.04-live-server-amd64.iso',
        start: false,
        cpu: 4,
        ram: 4096,
        storageType: 'fast',
        diskSize: 80
      });
      fixture.detectChanges();

      const submitButton = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
      submitButton.click();
      fixture.detectChanges();

      const request = httpTestingController.expectOne((req) => req.url.includes('/proxmox/provision'));
      expect(request.request.body.cluster_id).toBe('saved-katana-id');
      expect(request.request.body.cluster_name).toBeUndefined();
      expect(request.request.body.node).toBe('cls01srv01');
      expect(request.request.body.vms).toEqual([
        {
          name: 'edge-01',
          iso_image: 'local:iso/ubuntu-22.04-live-server-amd64.iso',
          cpu: 4,
          ram: 4096,
          storage_type: 'fast',
          disk_size: 80,
          start: false,
          bridges: [{ name: 'vmbr0', type: 'management' }]
        }
      ]);
      request.flush({
        cluster: 'standalone-lab',
        node: 'cls01srv01',
        vm_count: 1,
        results: []
      });
      httpTestingController.expectNone((req) => req.url.includes('/proxmox/list-vms'));
      httpTestingController.expectNone((req) => req.url.includes('/proxmox/vm-ip'));
    });

    it('does not prefill optional values when restoring a saved standalone VM draft', () => {
      fixture.destroy();
      localStorage.setItem(
        'katana-slice-manager.deployment-drafts',
        JSON.stringify({
          'proxmox-standalone': {
            'proxmox-vm': {
              state: 'draft',
              value: {
                clusterName: 'prod-cluster-01',
                vmName: 'web-server-01',
                template: 'ubuntu-2204-cloudinit',
                isoImage: '',
                start: false,
                cpu: 4,
                ram: 4096,
                storageType: 'local-lvm',
                diskSize: 50,
                vmTargets: [
                  {
                    node: 'cls01srv01',
                    vmName: 'edge-01',
                    template: 'ubuntu-2204-cloudinit',
                    isoImage: '',
                    start: false,
                    cpu: 8,
                    ram: 8192,
                    storageType: 'fast',
                    diskSize: 120
                  }
                ],
                managementBridgeName: 'vmbr0',
                managementBridgeType: 'management',
                customBridgeName: 'vmbr1',
                customBridgeType: 'service',
                customIp: '192.168.1.100',
                customNetmask: '255.255.255.0',
                customGateway: '192.168.1.1'
              }
            }
          }
        })
      );

      fixture = TestBed.createComponent(ProxmoxVmCreationFormComponent);
      fixture.componentRef.setInput('standaloneClusterName', 'standalone-lab');
      fixture.componentRef.setInput('serverTargets', [
        {
          node: 'cls01srv01',
          storageOptions: ['fast', 'backup'],
          storageIsoImages: [
            {
              storage: 'fast',
              isoImages: ['local:iso/ubuntu-24.04-live-server-amd64.iso']
            },
            {
              storage: 'backup',
              isoImages: ['local:iso/ubuntu-22.04-live-server-amd64.iso']
            }
          ]
        }
      ]);
      fixture.detectChanges();

      const component = fixture.componentInstance as any;
      const target = component.form.controls.vmTargets.at(0);
      const customNetworkDetails = fixture.nativeElement.querySelector(
        '.registration-form__custom-network'
      ) as HTMLDetailsElement | null;

      expect(component.form.get('vmName')?.value).toBe('web-server-01');
      expect(component.form.get('template')?.value).toBe('');
      expect(component.form.get('customBridgeName')?.value).toBe('');
      expect(component.form.get('customBridgeType')?.value).toBe('');
      expect(component.form.get('customIp')?.value).toBe('');
      expect(component.form.get('customNetmask')?.value).toBe('');
      expect(component.form.get('customGateway')?.value).toBe('');
      expect(customNetworkDetails?.open).toBe(false);
      expect(target.get('vmName')?.value).toBe('edge-01');
      expect(target.get('template')?.value).toBe('');
      expect(target.get('storageType')?.value).toBe('fast');
      expect(target.get('cpu')?.value).toBe(8);
    });
  });
});
