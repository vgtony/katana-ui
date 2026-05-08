import { HttpErrorResponse } from '@angular/common/http';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ProxmoxApiService } from '../../../shared/services/api';
import { DeploymentDraftService } from '../../../shared/services/deployment-draft.service';
import { ProxmoxStandaloneRegistrationFormComponent } from './proxmox-standalone-registration-form.component';

describe('ProxmoxStandaloneRegistrationFormComponent interaction', () => {
  let fixture: ComponentFixture<ProxmoxStandaloneRegistrationFormComponent>;
  let component: ProxmoxStandaloneRegistrationFormComponent;
  let draftService: DeploymentDraftService;
  let createClusterMock: ReturnType<typeof vi.fn>;
  let connectMock: ReturnType<typeof vi.fn>;
  let deleteClusterMock: ReturnType<typeof vi.fn>;
  let getOverviewMock: ReturnType<typeof vi.fn>;

  const activeSnapshot = {
    url: 'https://proxmox.example:8006',
    verifySsl: false,
    authMethod: 'password' as const,
    username: 'root@pam',
    password: 'secret',
    apiTokenId: '',
    apiTokenSecret: '',
    clusterId: 'saved-katana-id',
    clusterName: 'Antares',
    datacenters: [{ id: 'cluster', name: 'Antares', node_count: 3 }],
    selectedDatacenter: { id: 'cluster', name: 'Antares' },
    nodes: [{ name: 'cls01srv01' }],
    servers: [{ name: 'cls01srv01', node: 'cls01srv01' }],
    overview: {
      cluster: {
        cpu: { free_cores_estimate: 12.5, free_percent: 78.13 },
        memory: { free_human: '48.00 GB', total_human: '64.00 GB', free: 48, total: 64 },
        disk: { free_human: '1.20 TB', total_human: '2.00 TB', free: 12, total: 20 }
      },
      servers: [
        {
          name: 'cls01srv01',
          node: 'cls01srv01',
          cpu: { free_cores_estimate: 6.25, free_percent: 78.13 },
          memory: { free_human: '24.00 GB', total_human: '32.00 GB', free: 24, total: 32 },
          disk: { free_human: '600.00 GB', total_human: '1.00 TB', free: 6, total: 10 },
          storage_options: [
            {
              node: 'cls01srv01',
              storage: 'backup',
              type: 'nfs',
              remaining_human: '800.00 GB',
              used_human: '200.00 GB',
              maximum_load_human: '1.00 TB',
              iso_images: [
                {
                  volid: 'local:iso/ubuntu-22.04-live-server-amd64.iso',
                  name: 'ubuntu-22.04-live-server-amd64.iso',
                  storage: 'backup'
                }
              ]
            },
            {
              node: 'cls01srv01',
              storage: 'fast',
              type: 'ssd',
              remaining_human: '120.00 GB',
              used_human: '380.00 GB',
              maximum_load_human: '500.00 GB',
              iso_images: [
                {
                  volid: 'local:iso/ubuntu-24.04-live-server-amd64.iso',
                  name: 'ubuntu-24.04-live-server-amd64.iso',
                  storage: 'fast'
                }
              ]
            }
          ],
          templates: [{ template_id: 9000, name: 'ubuntu-cloudinit', template: true }]
        }
      ]
    },
    loadedAt: '2026-04-27T08:00:00.000Z'
  };

  beforeEach(async () => {
    localStorage.clear();
    createClusterMock = vi.fn();
    connectMock = vi.fn();
    deleteClusterMock = vi.fn();
    getOverviewMock = vi.fn();

    await TestBed.configureTestingModule({
      imports: [ProxmoxStandaloneRegistrationFormComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        DeploymentDraftService,
        {
          provide: ProxmoxApiService,
          useValue: {
            createCluster: createClusterMock,
            connect: connectMock,
            deleteCluster: deleteClusterMock,
            getOverview: getOverviewMock
          }
        }
      ]
    }).compileComponents();

    draftService = TestBed.inject(DeploymentDraftService);
  });

  function createComponent(): void {
    fixture = TestBed.createComponent(ProxmoxStandaloneRegistrationFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('reuses an unchanged active standalone registration instead of posting duplicate requests', () => {
    draftService.saveFormValue(
      'proxmox-standalone',
      'proxmox-standalone',
      activeSnapshot,
      'active'
    );
    createComponent();

    const completedSpy = vi.spyOn(component.completed, 'emit');
    const submitButton = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;

    submitButton.click();
    fixture.detectChanges();

    expect(createClusterMock).not.toHaveBeenCalled();
    expect(connectMock).not.toHaveBeenCalled();
    expect(getOverviewMock).not.toHaveBeenCalled();
    expect(draftService.getFormState('proxmox-standalone', 'proxmox-standalone')).toBe('active');
    expect(component['submitMessage']).toContain('Using the existing Antares overview.');
    expect(completedSpy).toHaveBeenCalled();
  });

  it('refreshes a restored active registration when its saved server cards only contain placeholders', () => {
    draftService.saveFormValue(
      'proxmox-standalone',
      'proxmox-standalone',
      {
        ...activeSnapshot,
        servers: [{ name: 'cls01srv01', node: 'cls01srv01' }],
        overview: null
      },
      'active'
    );
    connectMock.mockReturnValue(
      of({
        selected_datacenter: { id: 'cluster', name: 'Antares' },
        nodes: [{ name: 'cls01srv01' }],
        servers: [{ name: 'cls01srv01', node: 'cls01srv01' }]
      })
    );
    getOverviewMock.mockReturnValue(
      of({
        remaining_resources: activeSnapshot.overview
      })
    );

    createComponent();

    expect(connectMock).toHaveBeenCalledWith({
      cluster_id: 'saved-katana-id',
      datacenter_id: 'cluster'
    });
    expect(getOverviewMock).toHaveBeenCalledWith({ cluster_id: 'saved-katana-id' });
    expect(fixture.nativeElement.textContent).toContain('6.25 free (78.13%)');
    expect(fixture.nativeElement.textContent).toContain('backup');
    expect(fixture.nativeElement.textContent).toContain('fast');
  });

  it('shows datacenters after a successful registration and saves the active snapshot', () => {
    const createCluster$ = new Subject<unknown>();
    createClusterMock.mockReturnValue(createCluster$);
    createComponent();

    component['form'].setValue({
      url: 'https://proxmox.example:8006',
      verifySsl: false,
      authMethod: 'password',
      username: 'root@pam',
      password: 'secret',
      apiTokenId: '',
      apiTokenSecret: ''
    });
    fixture.detectChanges();

    const completedSpy = vi.spyOn(component.completed, 'emit');
    const submitButton = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
    submitButton.click();
    fixture.detectChanges();

    expect(component['submitting']).toBe(true);
    expect(submitButton.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain(
      'Registering the cluster and loading datacenters'
    );

    createCluster$.next({
      cluster_id: 'saved-katana-id',
      cluster_name: 'Antares',
      datacenters: [{ id: 'cluster', name: 'Antares', node_count: 3 }],
      nodes: [],
      servers: []
    });
    createCluster$.complete();
    fixture.detectChanges();

    expect(createClusterMock).toHaveBeenCalledTimes(1);
    expect(connectMock).not.toHaveBeenCalled();
    expect(getOverviewMock).not.toHaveBeenCalled();
    expect(component['submitting']).toBe(false);
    expect(component['submitMessage']).toBe('Connected to Antares. Select a datacenter to continue.');
    expect(draftService.getFormState('proxmox-standalone', 'proxmox-standalone')).toBe('active');
    expect(
      draftService.getSavedFormSnapshot<{ clusterId: string }>(
        'proxmox-standalone',
        'proxmox-standalone'
      )?.clusterId
    ).toBe('saved-katana-id');
    expect(fixture.nativeElement.textContent).toContain('Datacenters');
    expect(fixture.nativeElement.textContent).toContain('Antares');
    expect(completedSpy).toHaveBeenCalled();
  });

  it('loads the selected datacenter overview and allows choosing a server in compact mode', () => {
    draftService.saveFormValue(
      'proxmox-standalone',
      'proxmox-standalone',
      {
        ...activeSnapshot,
        selectedDatacenter: null,
        nodes: [],
        servers: [],
        overview: null
      },
      'active'
    );
    connectMock.mockReturnValue(
      of({
        selected_datacenter: { id: 'cluster', name: 'Antares' },
        nodes: [{ name: 'cls01srv01' }],
        servers: [{ name: 'cls01srv01', node: 'cls01srv01' }]
      })
    );
    getOverviewMock.mockReturnValue(of(activeSnapshot.overview));
    createComponent();
    fixture.componentRef.setInput('compactOnly', true);
    fixture.detectChanges();

    const datacenterButton = fixture.nativeElement.querySelector(
      '.registration-form__datacenter-card'
    ) as HTMLButtonElement;
    datacenterButton.click();
    fixture.detectChanges();

    expect(connectMock).toHaveBeenCalledWith({
      cluster_id: 'saved-katana-id',
      datacenter_id: 'cluster'
    });
    expect(getOverviewMock).toHaveBeenCalledWith({ cluster_id: 'saved-katana-id' });
    expect(component['submitMessage']).toBe('Loaded Antares. Select a server to continue.');
    expect(fixture.nativeElement.textContent).toContain('Selected Datacenter');
    expect(fixture.nativeElement.textContent).toContain('Servers');
    expect(fixture.nativeElement.textContent).toContain('backup');
    expect(fixture.nativeElement.textContent).toContain('fast');

    const serverCard = fixture.nativeElement.querySelector(
      '.registration-form__server-table--interactive'
    ) as HTMLElement;
    serverCard.click();
    fixture.detectChanges();

    expect(component['selectedVmTargets']).toEqual([
      {
        node: 'cls01srv01',
        storageOptions: ['backup', 'fast'],
        storageIsoImages: [
          {
            storage: 'backup',
            isoImages: ['local:iso/ubuntu-22.04-live-server-amd64.iso']
          },
          {
            storage: 'fast',
            isoImages: ['local:iso/ubuntu-24.04-live-server-amd64.iso']
          }
        ],
        templateOptions: [{ value: '9000', label: 'ubuntu-cloudinit (9000)' }]
      }
    ]);
    expect(fixture.nativeElement.textContent).toContain('Selected server');
    expect(fixture.nativeElement.textContent).toContain('Deploy Selected VMs');
  });

  it('computes free node resources from the connect response when overview metrics are absent', () => {
    draftService.saveFormValue(
      'proxmox-standalone',
      'proxmox-standalone',
      {
        ...activeSnapshot,
        selectedDatacenter: null,
        nodes: [],
        servers: [],
        overview: null
      },
      'active'
    );
    connectMock.mockReturnValue(
      of({
        selected_datacenter: { id: 'cluster', name: 'Antares' },
        nodes: [
          {
            node: 'cls01srv01',
            cpu: 0.0486209232555889,
            disk: 58154549248,
            maxcpu: 48,
            maxdisk: 100861726720,
            maxmem: 101239291904,
            mem: 82965889024
          }
        ],
        servers: [
          {
            name: 'cls01srv01',
            node: 'cls01srv01',
            cpu: 0.0486209232555889,
            disk: 58154549248,
            maxcpu: 48,
            maxdisk: 100861726720,
            maxmem: 101239291904,
            memory: 82965889024
          }
        ]
      })
    );
    getOverviewMock.mockReturnValue(of({}));
    createComponent();
    fixture.componentRef.setInput('compactOnly', true);
    fixture.detectChanges();

    const datacenterButton = fixture.nativeElement.querySelector(
      '.registration-form__datacenter-card'
    ) as HTMLButtonElement;
    datacenterButton.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('45.67 free (95.14%)');
    expect(fixture.nativeElement.textContent).toContain('17.02 GB of 94.29 GB (18.05% free)');
    expect(fixture.nativeElement.textContent).toContain('39.77 GB of 93.93 GB (42.34% free)');
  });

  it('uses direct datacenter summary metrics from the overview response shape', () => {
    draftService.saveFormValue(
      'proxmox-standalone',
      'proxmox-standalone',
      {
        ...activeSnapshot,
        selectedDatacenter: null,
        nodes: [],
        servers: [],
        overview: null
      },
      'active'
    );
    connectMock.mockReturnValue(
      of({
        selected_datacenter: { id: 'cluster', name: 'Antares' },
        nodes: [{ name: 'cls01srv01' }],
        servers: [{ name: 'cls01srv01', node: 'cls01srv01' }]
      })
    );
    getOverviewMock.mockReturnValue(
      of({
        cpu: {
          used_cores_estimate: 28.16,
          total_cores: 352,
          used_percent: 8
        },
        memory: {
          used: 831034359562,
          total: 1275433488220,
          free: 444399128658,
          used_percent: 65.15,
          used_human: '774.29 GB',
          total_human: '1.16 TB',
          free_human: '413.87 GB'
        },
        disk: {
          used: 20451110412288,
          total: 64097348526080,
          free: 43646238113792,
          used_percent: 31.91,
          used_human: '18.60 TB',
          total_human: '58.31 TB',
          free_human: '39.71 TB'
        }
      })
    );
    createComponent();
    fixture.componentRef.setInput('compactOnly', true);
    fixture.detectChanges();

    const datacenterButton = fixture.nativeElement.querySelector(
      '.registration-form__datacenter-card'
    ) as HTMLButtonElement;
    datacenterButton.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('323.84 free (92.00%)');
    expect(fixture.nativeElement.textContent).toContain('413.87 GB (34.85% free)');
    expect(fixture.nativeElement.textContent).toContain('39.71 TB (68.09% free)');
  });

  it('reads server metrics from remaining_resources.servers when overview nests them there', () => {
    draftService.saveFormValue(
      'proxmox-standalone',
      'proxmox-standalone',
      {
        ...activeSnapshot,
        selectedDatacenter: null,
        nodes: [],
        servers: [],
        overview: null
      },
      'active'
    );
    connectMock.mockReturnValue(
      of({
        selected_datacenter: { id: 'cluster', name: 'Antares' },
        nodes: [{ name: 'cls01srv01' }],
        servers: [{ name: 'cls01srv01', node: 'cls01srv01' }]
      })
    );
    getOverviewMock.mockReturnValue(
      of({
        remaining_resources: activeSnapshot.overview
      })
    );
    createComponent();
    fixture.componentRef.setInput('compactOnly', true);
    fixture.detectChanges();

    const datacenterButton = fixture.nativeElement.querySelector(
      '.registration-form__datacenter-card'
    ) as HTMLButtonElement;
    datacenterButton.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('6.25 free (78.13%)');
    expect(fixture.nativeElement.textContent).toContain('24.00 GB of 32.00 GB (75.00% free)');
    expect(fixture.nativeElement.textContent).toContain('600.00 GB of 1.00 TB (60.00% free)');
    expect(fixture.nativeElement.textContent).toContain('backup');
    expect(fixture.nativeElement.textContent).toContain('fast');
  });

  it('deregisters the active standalone registration and clears the saved VM draft', () => {
    draftService.saveFormValue(
      'proxmox-standalone',
      'proxmox-standalone',
      activeSnapshot,
      'active'
    );
    draftService.saveFormValue(
      'proxmox-standalone',
      'proxmox-vm',
      {
        clusterName: 'Antares',
        vmName: 'katana-vm-01'
      },
      'draft'
    );
    deleteClusterMock.mockReturnValue(of({ message: 'deleted' }));
    createComponent();

    const deregisteredSpy = vi.spyOn(component.deregistered, 'emit');
    const deregisterButton = (Array.from(
      fixture.nativeElement.querySelectorAll('button')
    ) as HTMLButtonElement[]).find((button) =>
      button.textContent?.replace(/\s+/g, ' ').trim() === 'Deregister Proxmox'
    ) as HTMLButtonElement;

    deregisterButton.click();
    fixture.detectChanges();

    expect(deleteClusterMock).toHaveBeenCalledWith('saved-katana-id');
    expect(draftService.getFormState('proxmox-standalone', 'proxmox-standalone')).toBe('draft');
    expect(draftService.getFormState('proxmox-standalone', 'proxmox-vm')).toBe('missing');
    expect(component['resultsView']).toBeNull();
    expect(component['submitMessage']).toBe('Standalone Proxmox registration removed.');
    expect(fixture.nativeElement.textContent).not.toContain('Selected Datacenter');
    expect(deregisteredSpy).toHaveBeenCalled();
  });

  it('hides storage rows in compact server view and shows them again in detail view', () => {
    draftService.saveFormValue(
      'proxmox-standalone',
      'proxmox-standalone',
      {
        ...activeSnapshot,
        selectedDatacenter: null,
        nodes: [],
        servers: [],
        overview: null
      },
      'active'
    );
    connectMock.mockReturnValue(
      of({
        selected_datacenter: { id: 'cluster', name: 'Antares' },
        nodes: [{ name: 'cls01srv01' }],
        servers: [{ name: 'cls01srv01', node: 'cls01srv01' }]
      })
    );
    getOverviewMock.mockReturnValue(of(activeSnapshot.overview));
    createComponent();
    fixture.componentRef.setInput('compactOnly', true);
    fixture.componentRef.setInput('serverViewMode', 'compact');
    fixture.detectChanges();

    const datacenterButton = fixture.nativeElement.querySelector(
      '.registration-form__datacenter-card'
    ) as HTMLButtonElement;
    datacenterButton.click();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelectorAll('.registration-form__server-table-row--storage').length
    ).toBe(0);

    fixture.componentRef.setInput('serverViewMode', 'detail');
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelectorAll('.registration-form__server-table-row--storage').length
    ).toBe(2);
  });

  it('refreshes the overview after a successful VM deployment', () => {
    draftService.saveFormValue(
      'proxmox-standalone',
      'proxmox-standalone',
      activeSnapshot,
      'active'
    );
    getOverviewMock.mockReturnValue(
      of({
        ...activeSnapshot.overview,
        cluster: {
          cpu: { free_cores_estimate: 11, free_percent: 68.75 },
          memory: { free_human: '44.00 GB', total_human: '64.00 GB', free: 44, total: 64 },
          disk: { free_human: '1.10 TB', total_human: '2.00 TB', free: 11, total: 20 }
        }
      })
    );
    createComponent();

    const deployedSpy = vi.spyOn(component.deployed, 'emit');
    component['handleVmDeployed']({ status: 'done' });
    fixture.detectChanges();

    expect(deployedSpy).toHaveBeenCalledWith({ status: 'done' });
    expect(getOverviewMock).toHaveBeenCalledWith({ cluster_id: 'saved-katana-id' });
    expect(fixture.nativeElement.textContent).toContain('11.00 free (68.75%)');
  });

  it('shows the backend error when authentication fails', () => {
    createClusterMock.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 401,
            error: 'Proxmox API request failed with status 401'
          })
      )
    );
    createComponent();

    component['form'].setValue({
      url: 'https://proxmox.example:8006',
      verifySsl: false,
      authMethod: 'password',
      username: 'root@pam',
      password: 'wrong-secret',
      apiTokenId: '',
      apiTokenSecret: ''
    });
    fixture.detectChanges();

    const failedSpy = vi.spyOn(component.failed, 'emit');
    const submitButton = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
    submitButton.click();
    fixture.detectChanges();

    expect(component['submitError']).toContain('status 401');
    expect(failedSpy).toHaveBeenCalled();
    expect(
      draftService.getFormState('proxmox-standalone', 'proxmox-standalone')
    ).not.toBe('active');
  });
});
