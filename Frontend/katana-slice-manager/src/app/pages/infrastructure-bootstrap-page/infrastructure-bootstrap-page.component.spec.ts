import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import {
  BootstrapApiService,
  CatalogApiService,
  NfvoApiService,
  VimApiService,
} from '../../shared/services/api';
import { InfrastructureStatusService } from '../../shared/services/infrastructure-status.service';
import { InfrastructureBootstrapPageComponent } from './infrastructure-bootstrap-page.component';

describe('InfrastructureBootstrapPageComponent', () => {
  let bootstrap: ReturnType<typeof vi.fn>;
  let status = signal<any>({ status: 'never_run' });

  async function configure(
    postResult: unknown = of({ status: 'succeeded', started_at: 1, finished_at: 2, results: [] }),
  ): Promise<void> {
    bootstrap = vi.fn(() => postResult);
    status = signal<any>({ status: 'never_run' });
    await TestBed.configureTestingModule({
      imports: [InfrastructureBootstrapPageComponent],
      providers: [
        provideRouter([]),
        {
          provide: InfrastructureStatusService,
          useValue: {
            status,
            loading: signal(false),
            error: signal(''),
            refresh: vi.fn(),
            setStatus: (value: unknown) => status.set(value),
          },
        },
        {
          provide: BootstrapApiService,
          useValue: {
            bootstrap,
            getStatus: () =>
              of({ status: 'succeeded', started_at: 1, finished_at: 2, results: [] }),
          },
        },
        { provide: NfvoApiService, useValue: { getNfvos: () => of([]) } },
        { provide: VimApiService, useValue: { getVims: () => of([]) } },
        { provide: CatalogApiService, useValue: { getNsList: () => of([]) } },
      ],
    }).compileComponents();
  }

  function completeForm(component: any): void {
    component.nfvos.at(0).patchValue({
      id: 'osm-1',
      name: 'OSM',
      endpoint: 'https://osm.example',
      project: 'admin',
      username: 'osm-user',
      password: 'osm-pass',
      tlsVerify: true,
    });
    component.vims.at(0).patchValue({
      id: 'core-vim',
      name: 'Core',
      location: 'core',
      authUrl: 'https://keystone.example/v3',
      project: 'admin',
      username: 'os-user',
      password: 'os-pass',
      verify: true,
    });
    component.addLink(0);
    component
      .linksFor(0)
      .at(0)
      .patchValue({ accountName: 'katana-core', config: '{"security_groups":"default"}' });
  }

  it('renders never-run, succeeded, and failed status details and resource actions', async () => {
    await configure();
    const fixture = TestBed.createComponent(InfrastructureBootstrapPageComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Never run');

    status.set({
      status: 'succeeded',
      started_at: 1,
      finished_at: 2,
      results: [{ kind: 'vim', id: 'core-vim', action: 'adopted' }],
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('core-vim');
    expect(fixture.nativeElement.textContent).toContain('adopted');

    status.set({ status: 'failed', error: 'Remote validation failed', results: [] });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Remote validation failed');
  });

  it('builds many-to-many resolved credentials, clears secrets, and never persists them', async () => {
    await configure();
    const fixture = TestBed.createComponent(InfrastructureBootstrapPageComponent);
    const component = fixture.componentInstance as any;
    completeForm(component);
    component.addNfvo();
    component.nfvos.at(1).patchValue({
      id: 'osm-2',
      name: 'OSM 2',
      endpoint: 'https://osm2.example',
      project: 'admin',
      username: 'user2',
      password: 'pass2',
    });
    component.addLink(0);
    component
      .linksFor(0)
      .at(1)
      .patchValue({ id: 'osm-2', accountName: 'katana-core-2', config: '{}' });

    component.submit();

    const payload = bootstrap.mock.calls[0][0];
    expect(payload.api_version).toBe('katana/v1');
    expect(payload.vims[0].nfvos).toHaveLength(2);
    expect(payload.nfvos[0].credentials).toEqual({ username: 'osm-user', password: 'osm-pass' });
    expect(payload.vims[0].credentials.auth.password).toBe('os-pass');
    expect(JSON.stringify(payload)).not.toContain('credentials_file');
    expect(JSON.stringify(payload)).not.toContain('ca_file');
    expect(component.nfvos.at(0).get('password').value).toBe('');
    expect(component.vims.at(0).get('password').value).toBe('');
    expect(localStorage.getItem('osm-pass')).toBeNull();
    expect(JSON.stringify(localStorage)).not.toContain('osm-pass');
    expect(JSON.stringify(sessionStorage)).not.toContain('os-pass');
  });

  it('recovers from invalid JSON config and removes links with their NFVO', async () => {
    await configure();
    const component = TestBed.createComponent(InfrastructureBootstrapPageComponent)
      .componentInstance as any;
    completeForm(component);
    const config = component.linksFor(0).at(0).get('config');
    config.setValue('[]');
    component.submit();
    expect(bootstrap).not.toHaveBeenCalled();
    expect(config.hasError('jsonObject')).toBe(true);

    config.setValue('{}');
    component.submit();
    expect(config.valid).toBe(true);
    expect(bootstrap).toHaveBeenCalledOnce();

    component.removeNfvo(0);
    expect(component.linksFor(0).length).toBe(0);
  });

  it.each([
    [400, 'VIM core-vim is missing: location', 'VIM core-vim is missing'],
    [
      409,
      'Another infrastructure bootstrap is running',
      'Another infrastructure bootstrap is running',
    ],
    [502, 'Unable to authenticate with NFVO osm-1', 'Remote OSM/OpenStack validation failed'],
  ])(
    'handles HTTP %s without success state or draft loss',
    async (code, backendMessage, expected) => {
      await configure(
        throwError(() => new HttpErrorResponse({ status: code, error: { error: backendMessage } })),
      );
      const component = TestBed.createComponent(InfrastructureBootstrapPageComponent)
        .componentInstance as any;
      completeForm(component);
      component.submit();
      expect(component.submitMessage).toBe('');
      expect(component.submitError).toContain(expected);
      expect(component.nfvos.at(0).get('id').value).toBe('osm-1');
      expect(component.nfvos.at(0).get('password').value).toBe('');
    },
  );
});
