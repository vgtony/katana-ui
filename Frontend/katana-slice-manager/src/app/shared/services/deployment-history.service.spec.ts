import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { DeploymentHistoryService } from './deployment-history.service';

describe('DeploymentHistoryService', () => {
  it('recovers malformed JSON without disabling working storage', () => {
    localStorage.setItem('katana-slice-manager.deployment-history', '{');
    const service = TestBed.inject(DeploymentHistoryService);
    expect(service.getPacks()).toEqual([]);
    service.clearPacks();
    expect(service.storageUnavailable()).toBe(false);
    expect(localStorage.getItem('katana-slice-manager.deployment-history')).toBe('[]');
  });
  afterEach(() => vi.restoreAllMocks());

  it('keeps a deployment result in memory when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    const service = TestBed.inject(DeploymentHistoryService);
    const pack = service.addPack({
      name: 'test', optionId: 'k8s', optionLabel: 'Kubernetes', shortLabel: 'K8s',
      status: 'done', completedAt: new Date().toISOString(),
      finalConfigurationLabel: 'Deploy', requirements: [],
    });
    expect(service.getPackById(pack.id)).toEqual(pack);
    service.clearPacks();
    expect(service.getPacks()).toEqual([]);
  });

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [DeploymentHistoryService] });
  });

  it('ignores malformed packs without discarding valid history', () => {
    localStorage.setItem('katana-slice-manager.deployment-history', JSON.stringify([
      null, 1, {}, { id: 'bad', optionId: 'proxmox', requirements: 'invalid' },
      { id: 'good', optionId: 'proxmox', requirements: [], completedAt: '2026-07-21T08:00:00Z' },
    ]));
    expect(TestBed.inject(DeploymentHistoryService).getPacks().map((pack) => pack.id)).toEqual(['good']);
  });

  it('redacts secrets from stored packs and its in-memory history', () => {
    const service = TestBed.inject(DeploymentHistoryService);

    const created = service.addPack({
      name: 'Proxmox Pack',
      optionId: 'proxmox',
      optionLabel: 'Proxmox VM',
      shortLabel: 'Proxmox',
      status: 'done',
      osmResponse: { id: 'osm-instance', token: 'response-secret' },
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
    expect(created.osmResponse).toEqual({ id: 'osm-instance' });
    expect(localStorage.getItem('katana-slice-manager.deployment-history')).toContain('osm-instance');
    expect(localStorage.getItem('katana-slice-manager.deployment-history')).not.toContain('response-secret');
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
