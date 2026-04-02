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
});
