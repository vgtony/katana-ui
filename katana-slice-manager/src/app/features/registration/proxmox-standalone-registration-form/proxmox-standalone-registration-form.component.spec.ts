import { HttpErrorResponse } from '@angular/common/http';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ProxmoxApiService } from '../../../shared/services/api';
import { DeploymentDraftService } from '../../../shared/services/deployment-draft.service';
import { ProxmoxStandaloneRegistrationFormComponent } from './proxmox-standalone-registration-form.component';

describe('ProxmoxStandaloneRegistrationFormComponent interaction', () => {
  let fixture: ComponentFixture<ProxmoxStandaloneRegistrationFormComponent>;
  let component: ProxmoxStandaloneRegistrationFormComponent;
  let draftService: DeploymentDraftService;
  let createClusterMock: ReturnType<typeof vi.fn>;
  let getNodesMock: ReturnType<typeof vi.fn>;
  let getClustersMock: ReturnType<typeof vi.fn>;
  let getServersMock: ReturnType<typeof vi.fn>;
  let getRemainingResourcesMock: ReturnType<typeof vi.fn>;

  const activeSnapshot = {
    name: 'lab-cluster',
    url: 'https://proxmox.example:8006',
    node: 'pve-01',
    verifySsl: false,
    authMethod: 'password' as const,
    username: 'root@pam',
    password: 'secret',
    apiTokenId: '',
    apiTokenSecret: '',
    connectedNodes: ['pve-01'],
    clusters: [{ name: 'lab-cluster', status: 'online', node_count: 1 }],
    servers: [],
    remainingResources: {
      remaining_resources: {
        cluster: {
          cpu: { free_cores_estimate: 12.5, free_percent: 78.13 },
          memory: { free_human: '48.00 GB', total_human: '64.00 GB', free: 48, total: 64 },
          disk: { free_human: '1.20 TB', total_human: '2.00 TB', free: 12, total: 20 },
          storage_options: [
            {
              node: 'pve-01',
              storage: 'backup',
              type: 'nfs',
              remaining_human: '800.00 GB',
              used_human: '200.00 GB',
              maximum_load_human: '1.00 TB'
            },
            {
              node: 'pve-01',
              storage: 'datastorage',
              type: 'nfs',
              remaining_human: '640.00 GB',
              used_human: '360.00 GB',
              maximum_load_human: '1.00 TB'
            },
            {
              node: 'pve-01',
              storage: 'fast',
              type: 'ssd',
              remaining_human: '120.00 GB',
              used_human: '380.00 GB',
              maximum_load_human: '500.00 GB'
            }
          ]
        },
        servers: [
          {
            name: 'pve-01',
            cpu: { free_cores_estimate: 6.25, free_percent: 78.13 },
            memory: { free_human: '24.00 GB', total_human: '32.00 GB', free: 24, total: 32 },
            disk: { free_human: '600.00 GB', total_human: '1.00 TB', free: 6, total: 10 }
          }
        ]
      }
    },
    loadedAt: '2026-04-27T08:00:00.000Z'
  };

  beforeEach(async () => {
    localStorage.clear();
    createClusterMock = vi.fn();
    getNodesMock = vi.fn();
    getClustersMock = vi.fn();
    getServersMock = vi.fn();
    getRemainingResourcesMock = vi.fn();

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
            getNodes: getNodesMock,
            getStandaloneClusters: getClustersMock,
            getStandaloneServers: getServersMock,
            getStandaloneRemainingResources: getRemainingResourcesMock
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
    expect(getClustersMock).not.toHaveBeenCalled();
    expect(draftService.getFormState('proxmox-standalone', 'proxmox-standalone')).toBe('active');
    expect(component['submitMessage']).toContain(
      'Using the existing active standalone Proxmox registration.'
    );
    expect(completedSpy).toHaveBeenCalled();
  });

  it('shows a loading spinner, saves the active snapshot, and renders compact results after a successful registration', () => {
    const createCluster$ = new Subject<unknown>();
    const nodes$ = new Subject<unknown>();
    const clusters$ = new Subject<unknown>();
    const servers$ = new Subject<unknown>();
    const remainingResources$ = new Subject<unknown>();
    createClusterMock.mockReturnValue(createCluster$);
    getNodesMock.mockReturnValue(nodes$);
    getClustersMock.mockReturnValue(clusters$);
    getServersMock.mockReturnValue(servers$);
    getRemainingResourcesMock.mockReturnValue(remainingResources$);
    createComponent();

    component['form'].setValue({
      name: 'lab-cluster',
      url: 'https://proxmox.example:8006',
      node: 'pve-01',
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
      'Registering the cluster and loading nodes, servers, and remaining resources'
    );

    createCluster$.next({ message: 'Proxmox cluster registered successfully', cluster_id: 'c-1' });
    createCluster$.complete();
    nodes$.next({ nodes: ['pve-01', 'pve-02'] });
    nodes$.complete();
    clusters$.next([{ name: 'cluster-a', status: 'online', node_count: 2 }]);
    clusters$.complete();
    servers$.next([{ name: 'server-wrapper-should-not-render' }]);
    servers$.complete();
    remainingResources$.next(activeSnapshot.remainingResources);
    remainingResources$.complete();
    fixture.detectChanges();

    expect(createClusterMock).toHaveBeenCalledTimes(1);
    expect(getNodesMock).toHaveBeenCalledTimes(1);
    expect(getClustersMock).toHaveBeenCalledTimes(1);
    expect(getServersMock).toHaveBeenCalledTimes(1);
    expect(getRemainingResourcesMock).toHaveBeenCalledTimes(1);
    expect(component['submitting']).toBe(false);
    expect(component['submitMessage']).toBe(
      'Registered Proxmox cluster and loaded 2 nodes and 1 servers.'
    );
    expect(draftService.getFormState('proxmox-standalone', 'proxmox-standalone')).toBe('active');
    expect(
      draftService.getSavedFormSnapshot<{ name: string }>(
        'proxmox-standalone',
        'proxmox-standalone'
      )?.name
    ).toBe('lab-cluster');
    expect(fixture.nativeElement.textContent).toContain('Capacity board');
    expect(fixture.nativeElement.textContent).toContain('Clusters');
    expect(fixture.nativeElement.textContent).toContain('pve-01');
    expect(fixture.nativeElement.textContent).toContain('backup');
    expect(fixture.nativeElement.textContent).toContain('datastorage');
    expect(fixture.nativeElement.textContent).toContain('fast');
    expect(fixture.nativeElement.textContent).toContain('800.00 GB');
    expect(
      fixture.nativeElement.querySelectorAll('.registration-form__server-table-row--summary').length
    ).toBe(1);
    expect(
      fixture.nativeElement.querySelectorAll('.registration-form__server-table-row--storage').length
    ).toBe(3);
    expect(completedSpy).toHaveBeenCalled();
  });

  it('allows selecting a discovered server in compact mode to start VM configuration', () => {
    draftService.saveFormValue(
      'proxmox-standalone',
      'proxmox-standalone',
      activeSnapshot,
      'active'
    );
    createComponent();
    fixture.componentRef.setInput('compactOnly', true);
    fixture.detectChanges();

    const serverCard = fixture.nativeElement.querySelector(
      '.registration-form__server-table--interactive'
    ) as HTMLElement;
    serverCard.click();
    fixture.detectChanges();

    expect(component['selectedVmTargets']).toEqual([
      {
        node: 'pve-01',
        storageOptions: ['backup', 'datastorage', 'fast']
      }
    ]);
    expect(
      fixture.nativeElement.querySelector('.registration-form__server-table--interactive')
    ).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Selected server');
    expect(fixture.nativeElement.textContent).toContain('Change server');
    expect(fixture.nativeElement.textContent).toContain('Deploy Selected VMs');
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
      name: 'lab-cluster',
      url: 'https://proxmox.example:8006',
      node: 'pve-01',
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
