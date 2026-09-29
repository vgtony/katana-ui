import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HelmChartsPageComponent } from './helm-charts-page.component';

const endpoint = '/api/helm/charts';
const version = {
  version: '1.3.1',
  appVersion: 'latest',
  description: '<img src=x onerror=alert(1)>',
  digest: 'a'.repeat(64),
  created: '',
  url: 'http://repository/free5gc-1.3.1.tgz',
};
const catalogue = { charts: [{ name: 'free5gc', versions: [version] }], max_bytes: 104857600 };
const uploaded = {
  name: 'free5gc',
  version: '1.3.2',
  filename: 'free5gc-1.3.2.tgz',
  size: 3,
  sha256: 'b'.repeat(64),
  url: 'http://repository/free5gc-1.3.2.tgz',
  request_id: 'upload-request',
};

describe('Helm chart upload', () => {
  let fixture: ComponentFixture<HelmChartsPageComponent>;
  let http: HttpTestingController;
  let component: any;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HelmChartsPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(HelmChartsPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  function signIn(): void {
    component.username = 'operator';
    component.password = 'operator-password';
    component.signIn();
    const request = http.expectOne(endpoint);
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Authorization')).toBe(
      `Basic ${btoa('operator:operator-password')}`,
    );
    request.flush(catalogue);
    fixture.detectChanges();
  }

  function selectFile(file = new File(['abc'], 'chart.tgz')): HTMLInputElement {
    const input: HTMLInputElement = fixture.nativeElement.querySelector('#helm-file');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    return input;
  }

  it('requires sign-in, clears the password field, and escapes catalogue descriptions', async () => {
    expect(fixture.nativeElement.textContent).toContain('Chart administrator sign in');
    expect(fixture.nativeElement.querySelector('#helm-file')).toBeNull();
    http.expectNone(endpoint);
    signIn();
    await fixture.whenStable();
    expect(component.password).toBe('');
    expect(fixture.nativeElement.textContent).toContain(version.description);
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.querySelector('#helm-version').value).toBe('1.3.1');
    expect(JSON.stringify(localStorage) + JSON.stringify(sessionStorage)).not.toContain(
      'operator-password',
    );
  });

  it('uploads one multipart file, prevents duplicate submissions, shows metadata and refreshes versions', async () => {
    signIn();
    const input = selectFile();
    expect(fixture.nativeElement.textContent).toContain('chart.tgz');
    component.upload(input);
    component.upload(input);
    fixture.detectChanges();
    expect(input.disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('progress')).not.toBeNull();
    const request = http.expectOne(endpoint);
    expect(request.request.method).toBe('POST');
    expect(request.request.body instanceof FormData).toBe(true);
    expect(Array.from(request.request.body.keys())).toEqual(['chart']);
    expect(request.request.body.get('chart').name).toBe('chart.tgz');
    expect(request.request.headers.has('Content-Type')).toBe(false);
    expect(request.request.headers.get('Authorization')).toMatch(/^Basic /);
    request.flush(uploaded, { status: 201, statusText: 'Created' });
    http.expectOne(endpoint).flush({
      ...catalogue,
      charts: [{ name: 'free5gc', versions: [{ ...version, version: '1.3.2' }, version] }],
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Uploaded free5gc 1.3.2');
    expect(fixture.nativeElement.textContent).toContain(uploaded.sha256);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('#helm-version').value).toBe('1.3.2');
    expect(component.selectedFile()).toBeNull();
    expect(component.uploading()).toBe(false);
  });

  it('rejects missing, empty, oversized and non-chart files without a request', () => {
    signIn();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('#helm-file');
    component.upload(input);
    const oversized = new File(['x'], 'large.tgz');
    Object.defineProperty(oversized, 'size', { value: 104857601 });
    for (const file of [new File([], 'empty.tgz'), new File(['x'], 'wrong.zip'), oversized]) {
      selectFile(file);
      component.upload(input);
      expect(component.fileError()).not.toBe('');
    }
    http.expectNone(endpoint);
  });

  it.each([409, 413, 422, 503])(
    'preserves the selected file after HTTP %s and does not retry',
    (status) => {
      signIn();
      const input = selectFile();
      const file = component.selectedFile();
      component.upload(input);
      http
        .expectOne(endpoint)
        .flush(
          { error: 'Repository rejected this chart', request_id: 'trace-123' },
          { status, statusText: 'Upload failed' },
        );
      fixture.detectChanges();
      expect(component.selectedFile()).toBe(file);
      expect(component.uploading()).toBe(false);
      expect(component.uploaded()).toBeNull();
      expect(fixture.nativeElement.textContent).toContain(
        status === 413 ? 'exceeds the upload limit' : 'Repository rejected this chart',
      );
      expect(fixture.nativeElement.textContent).toContain('trace-123');
      http.expectNone(endpoint);
    },
  );

  it('keeps upload success visible when catalogue refresh fails', () => {
    signIn();
    component.upload(selectFile());
    http.expectOne(endpoint).flush(uploaded, { status: 201, statusText: 'Created' });
    http
      .expectOne(endpoint)
      .flush({ error: 'Catalogue unavailable' }, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Uploaded free5gc 1.3.2');
    expect(fixture.nativeElement.textContent).toContain('Catalogue unavailable');
  });

  it('returns to sign-in after credentials are revoked and clears memory on sign-out', () => {
    signIn();
    component.refresh();
    http
      .expectOne(endpoint)
      .flush({ error: 'Sign in again' }, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();
    expect(component.signedIn()).toBe(false);
    expect(component.authorization).toBe('');
    signIn();
    selectFile();
    component.signOut();
    expect(component.authorization).toBe('');
    expect(component.selectedFile()).toBeNull();
    expect(component.signedIn()).toBe(false);
  });
});
