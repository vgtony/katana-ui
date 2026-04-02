import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Type } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Validators } from '@angular/forms';
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
    requiredControls: ['name', 'url', 'username', 'password', 'node'],
    optionalControls: []
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
      'template',
      'cpu',
      'ram',
      'storageType',
      'diskSize',
      'managementBridgeName',
      'managementBridgeType'
    ],
    optionalControls: [
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
        name: 'prod-cluster-01',
        url: 'https://10.0.0.10:8006',
        username: 'root@pam',
        password: 'securepassword123',
        node: 'pve1'
      });

      fixture.detectChanges();

      const submitButton = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
      submitButton.click();
      fixture.detectChanges();

      const request = httpTestingController.expectOne((req) => req.url.includes('/proxmox/cluster'));
      expect(request.request.method).toBe('POST');
      request.flush({
        message: 'Proxmox cluster registered successfully',
        cluster_id: '550e8400-e29b-41d4-a716-446655440000'
      });
      fixture.detectChanges();

      expect(submitButton.textContent?.trim()).toBe('Registered');
      expect(fixture.nativeElement.textContent).toContain('Proxmox cluster registered successfully');
    });
  });

  describe('ProxmoxVmCreationFormComponent submission state', () => {
    let fixture: ComponentFixture<ProxmoxVmCreationFormComponent>;
    let httpTestingController: HttpTestingController;

    beforeEach(async () => {
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
    });

    it('shows Deployment Started after a successful Proxmox VM response', () => {
      const component = fixture.componentInstance as any;
      component.form.setValue({
        clusterName: 'prod-cluster-01',
        vmName: 'web-server-01',
        template: 'ubuntu-2204-cloudinit',
        cpu: 4,
        ram: 4096,
        storageType: 'local-lvm',
        diskSize: 50,
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

      const request = httpTestingController.expectOne((req) => req.url.includes('/proxmox/vm'));
      expect(request.request.method).toBe('POST');
      expect(request.request.body.cluster_name).toBe('prod-cluster-01');
      expect(request.request.body.vms[0].bridges).toHaveLength(2);
      request.flush({
        message: 'Proxmox VM deployment initiated successfully',
        deployment_status: 'in_progress',
        estimated_time: '2-3 minutes',
        vms: []
      });
      fixture.detectChanges();

      expect(submitButton.textContent?.trim()).toBe('Deployment Started');
      expect(fixture.nativeElement.textContent).toContain('Proxmox VM deployment initiated successfully');
    });

    it('allows deploying without custom bridge values', () => {
      const component = fixture.componentInstance as any;
      component.form.setValue({
        clusterName: 'prod-cluster-01',
        vmName: 'web-server-01',
        template: 'ubuntu-2204-cloudinit',
        cpu: 4,
        ram: 4096,
        storageType: 'local-lvm',
        diskSize: 50,
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

      const request = httpTestingController.expectOne((req) => req.url.includes('/proxmox/vm'));
      expect(request.request.method).toBe('POST');
      expect(request.request.body.vms[0].bridges).toHaveLength(1);
      expect(request.request.body.vms[0].bridges[0]).toEqual({
        name: 'vmbr0',
        type: 'management'
      });
      request.flush({
        message: 'Proxmox VM deployment initiated successfully',
        deployment_status: 'in_progress',
        estimated_time: '2-3 minutes',
        vms: []
      });
      fixture.detectChanges();

      expect(submitButton.textContent?.trim()).toBe('Deployment Started');
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
        cpu: 4,
        ram: 4096,
        storageType: 'local-lvm',
        diskSize: 50,
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

      const request = httpTestingController.expectOne((req) => req.url.includes('/proxmox/vm'));
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
  });
});
