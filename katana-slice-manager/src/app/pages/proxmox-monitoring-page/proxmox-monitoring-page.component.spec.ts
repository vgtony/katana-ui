import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ProxmoxApiService } from '../../shared/services/api';
import { ProxmoxMonitoringPageComponent } from './proxmox-monitoring-page.component';

describe('ProxmoxMonitoringPageComponent', () => {
  it('selects the first cluster without changing bindings during the initial check', async () => {
    await TestBed.configureTestingModule({
      imports: [ProxmoxMonitoringPageComponent],
      providers: [
        {
          provide: ProxmoxApiService,
          useValue: {
            getClusters: () =>
              of([{ _id: 'cluster-1', name: 'Edge Proxmox', url: '', status: 'online' }]),
            getOverview: () => of({ clusters: [], servers: [], vms: [] }),
            getTasks: () => of({ tasks: [] }),
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ProxmoxMonitoringPageComponent);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 10));
    fixture.detectChanges();

    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    expect(select.value).toContain('cluster-1');
    expect(fixture.nativeElement.textContent).toContain('Edge Proxmox');
  });
});
