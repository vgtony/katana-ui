import { TestBed } from '@angular/core/testing';
import { DeploymentDraftService } from './deployment-draft.service';
import { DeploymentPack } from '../../models/interfaces/deployment-pack.interface';

describe('DeploymentDraftService', () => {
  let service: DeploymentDraftService;

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [DeploymentDraftService]
    });

    service = TestBed.inject(DeploymentDraftService);
  });

  it('returns saved values and leaves missing fields empty after loading a history pack', () => {
    const pack: DeploymentPack = {
      id: 'pack-1',
      name: 'Slice / OpenStack Pack',
      optionId: 'slice',
      optionLabel: 'Slice / OpenStack',
      shortLabel: 'Slice',
      status: 'done',
      errorType: undefined,
      completedAt: '2026-04-01T08:00:00.000Z',
      finalConfigurationLabel: 'Slice configuration',
      requirements: [{ id: 'nfvo', label: 'NFVO', status: 'done' }],
      formSnapshots: {
        nfvo: {
          id: 'nfvo-1',
          name: 'NFVO Alpha'
        }
      }
    };

    service.loadPackAsDraft(pack);

    expect(
      service.getFormValue('slice', 'nfvo', {
        id: '',
        name: '',
        nfvoip: 'should-not-remain'
      })
    ).toEqual({
      id: 'nfvo-1',
      name: 'NFVO Alpha',
      nfvoip: ''
    });
  });

  it('returns fallback defaults for a new form when only sibling drafts exist', () => {
    service.saveFormValue('proxmox', 'proxmox-cluster', {
      name: 'cluster-a',
      url: 'https://cluster-a.example:8006'
    });

    expect(
      service.getFormValue('proxmox', 'proxmox-vm', {
        clusterName: '',
        vmName: 'katana-vm-1',
        template: '',
        cpu: 4
      })
    ).toEqual({
      clusterName: '',
      vmName: 'katana-vm-1',
      template: '',
      cpu: 4
    });
  });

  it('overwrites stale option drafts when a history pack is opened', () => {
    service.saveFormValue('proxmox', 'proxmox-cluster', {
      name: 'old-cluster',
      url: 'https://old.example:8006'
    });

    const pack: DeploymentPack = {
      id: 'pack-2',
      name: 'Proxmox VM Pack',
      optionId: 'proxmox',
      optionLabel: 'Proxmox VM',
      shortLabel: 'Proxmox',
      status: 'done',
      errorType: undefined,
      completedAt: '2026-04-01T08:30:00.000Z',
      finalConfigurationLabel: 'Proxmox VM configuration',
      requirements: [{ id: 'proxmox-cluster', label: 'Proxmox Cluster', status: 'done' }],
      formSnapshots: {
        'proxmox-vm': {
          clusterName: 'prod-cluster-01',
          vmName: 'web-server-01'
        }
      }
    };

    service.loadPackAsDraft(pack);

    expect(
      service.getFormValue('proxmox', 'proxmox-cluster', {
        name: 'fallback',
        url: 'https://fallback.example:8006'
      })
    ).toEqual({
      name: '',
      url: ''
    });
  });

  it('clears history-only behavior after saving a form again', () => {
    const pack: DeploymentPack = {
      id: 'pack-3',
      name: 'Proxmox VM Pack',
      optionId: 'proxmox',
      optionLabel: 'Proxmox VM',
      shortLabel: 'Proxmox',
      status: 'done',
      errorType: undefined,
      completedAt: '2026-04-01T09:00:00.000Z',
      finalConfigurationLabel: 'Proxmox VM configuration',
      requirements: [{ id: 'proxmox-cluster', label: 'Proxmox Cluster', status: 'done' }],
      formSnapshots: {
        'proxmox-vm': {
          clusterName: 'prod-cluster-01',
          vmName: 'web-server-01'
        }
      }
    };

    service.loadPackAsDraft(pack);
    service.saveFormValue('proxmox', 'proxmox-cluster', {
      name: 'cluster-a',
      url: 'https://cluster-a.example:8006'
    });

    expect(
      service.getFormValue('proxmox', 'proxmox-cluster', {
        name: 'fallback',
        url: 'https://fallback.example:8006'
      })
    ).toEqual({
      name: 'cluster-a',
      url: 'https://cluster-a.example:8006'
    });
  });

  it('tracks whether a saved form is still a draft or already active', () => {
    service.saveFormValue(
      'slice',
      'nfvo',
      {
        id: 'nfvo-1',
        name: 'NFVO Alpha'
      },
      'draft'
    );

    expect(service.getFormState('slice', 'nfvo')).toBe('draft');

    service.saveFormValue(
      'slice',
      'nfvo',
      {
        id: 'nfvo-1',
        name: 'NFVO Alpha'
      },
      'active'
    );

    expect(service.getFormState('slice', 'nfvo')).toBe('active');
  });

  it('treats legacy stored snapshots as active and unwraps snapshots for history packs', () => {
    localStorage.setItem(
      'katana-slice-manager.deployment-drafts',
      JSON.stringify({
        proxmox: {
          'proxmox-cluster': {
            name: 'legacy-cluster',
            node: 'pve-node-01'
          }
        }
      })
    );

    expect(service.getFormState('proxmox', 'proxmox-cluster')).toBe('active');
    expect(service.getSnapshotsForOption('proxmox')).toEqual({
      'proxmox-cluster': {
        name: 'legacy-cluster',
        node: 'pve-node-01'
      }
    });
  });

  it('deactivates an active form without clearing its saved values', () => {
    service.saveFormValue(
      'proxmox',
      'proxmox-cluster',
      {
        name: 'lab-cluster',
        node: 'pve-node-01'
      },
      'active'
    );

    service.deactivateForm('proxmox', 'proxmox-cluster');

    expect(service.getFormState('proxmox', 'proxmox-cluster')).toBe('draft');
    expect(
      service.getSavedFormSnapshot<{ name: string; node: string }>('proxmox', 'proxmox-cluster')
    ).toEqual({
      name: 'lab-cluster',
      node: 'pve-node-01'
    });
  });
});
