import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ProxmoxClusterRegistrationFormComponent } from './proxmox-cluster-registration-form.component';
import { ProxmoxApiService } from '../../../shared/services/api';
import { DeploymentDraftService } from '../../../shared/services/deployment-draft.service';

describe('ProxmoxClusterRegistrationFormComponent interaction', () => {
  let fixture: ComponentFixture<ProxmoxClusterRegistrationFormComponent>;
  let component: ProxmoxClusterRegistrationFormComponent;
  let draftService: DeploymentDraftService;
  let createClusterMock: ReturnType<typeof vi.fn>;

  const activeCluster = {
    name: 'lab-cluster',
    url: 'https://proxmox.example:8006',
    username: 'root@pam',
    password: 'secret',
    node: 'pve-01'
  };

  beforeEach(async () => {
    localStorage.clear();
    createClusterMock = vi.fn(() =>
      of({
        message: 'Cluster created successfully',
        cluster_id: 'cluster-1'
      })
    );

    await TestBed.configureTestingModule({
      imports: [ProxmoxClusterRegistrationFormComponent],
      providers: [
        DeploymentDraftService,
        {
          provide: ProxmoxApiService,
          useValue: {
            createCluster: createClusterMock
          }
        }
      ]
    }).compileComponents();

    draftService = TestBed.inject(DeploymentDraftService);
  });

  function createComponent(): void {
    fixture = TestBed.createComponent(ProxmoxClusterRegistrationFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('reuses an unchanged active cluster instead of posting a duplicate registration', () => {
    draftService.saveFormValue('proxmox', 'proxmox-cluster', activeCluster, 'active');
    createComponent();

    const completedSpy = vi.spyOn(component.completed, 'emit');
    const submitButton = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;

    expect(submitButton.textContent?.replace(/\s+/g, ' ').trim()).toBe('Use Active Proxmox Cluster');

    submitButton.click();
    fixture.detectChanges();

    expect(createClusterMock).not.toHaveBeenCalled();
    expect(draftService.getFormState('proxmox', 'proxmox-cluster')).toBe('active');
    expect(component['submitMessage']).toContain('Using the existing active Proxmox cluster registration.');
    expect(completedSpy).toHaveBeenCalled();
  });

  it('shows a conflict-specific message for backend 409 responses', () => {
    createClusterMock.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 409, error: { message: 'Conflict' } }))
    );
    createComponent();
    const completedSpy = vi.spyOn(component.completed, 'emit');
    const failedSpy = vi.spyOn(component.failed, 'emit');

    component['form'].setValue(activeCluster);
    fixture.detectChanges();

    const submitButton = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
    submitButton.click();
    fixture.detectChanges();

    expect(createClusterMock).toHaveBeenCalledTimes(1);
    expect(draftService.getFormState('proxmox', 'proxmox-cluster')).toBe('active');
    expect(component['submitError']).toBe('');
    expect(component['submitMessage']).toBe(
      'A Proxmox cluster with these details is already active. Using the existing registration.'
    );
    expect(completedSpy).toHaveBeenCalled();
    expect(failedSpy).not.toHaveBeenCalled();
  });
});
