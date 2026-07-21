import { TestBed } from '@angular/core/testing';
import { DeploymentHistoryService } from './deployment-history.service';

describe('DeploymentHistoryService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [DeploymentHistoryService] });
  });

  it('redacts secrets from stored packs and its in-memory history', () => {
    const service = TestBed.inject(DeploymentHistoryService);

    const created = service.addPack({
      name: 'Proxmox Pack',
      optionId: 'proxmox',
      optionLabel: 'Proxmox VM',
      shortLabel: 'Proxmox',
      status: 'done',
      completedAt: '2026-07-21T08:00:00.000Z',
      finalConfigurationLabel: 'Proxmox configuration',
      requirements: [{ id: 'proxmox-cluster', label: 'Cluster', status: 'done' }],
      formSnapshots: {
        'proxmox-cluster': {
          name: 'lab-cluster',
          password: 'history-password',
          tokenId: 'katana@pve!manager',
          secret: 'history-secret',
        },
      },
    });

    expect(JSON.stringify(created)).not.toContain('history-password');
    expect(JSON.stringify(service.getPacks())).not.toContain('history-secret');
    expect(localStorage.getItem('katana-slice-manager.deployment-history')).not.toContain(
      'katana@pve!manager',
    );
  });

  it('removes secrets from legacy history storage during initialization', () => {
    localStorage.setItem(
      'katana-slice-manager.deployment-history',
      JSON.stringify([
        {
          id: 'legacy-pack',
          name: 'Legacy pack',
          optionId: 'slice',
          formSnapshots: { nfvo: { id: 'osm-1', password: 'legacy-password' } },
        },
      ]),
    );

    const service = TestBed.inject(DeploymentHistoryService);

    expect(JSON.stringify(service.getPacks())).not.toContain('legacy-password');
    expect(localStorage.getItem('katana-slice-manager.deployment-history')).not.toContain(
      'legacy-password',
    );
  });
});
