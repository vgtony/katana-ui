import { HttpEventType, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { K8sCredentialsUploadFormComponent } from './k8s-credentials-upload-form.component';

it('validates credentials files and supports progress, cancel and retry', () => {
  localStorage.clear();
  TestBed.configureTestingModule({
    imports: [K8sCredentialsUploadFormComponent],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const fixture = TestBed.createComponent(K8sCredentialsUploadFormComponent);
  const http = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  const root: HTMLElement = fixture.nativeElement;
  const input = root.querySelector('input')!;
  const form = root.querySelector('form')!;
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  fixture.detectChanges();
  expect(root.querySelector('.ui-error-summary')?.textContent).toContain('Choose credentials file.');
  expect(input.getAttribute('aria-invalid')).toBe('true');
  function select(file: File): void {
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }
  select(new File(['x'], 'bad.zip'));
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  http.expectNone('/api/k8s');
  expect(root.textContent).toContain('Choose a YAML or JSON credentials file.');
  select(new File(['apiVersion: v1'], 'creds.yaml'));
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  const upload = http.expectOne('/api/k8s');
  expect(upload.request.reportProgress).toBe(true);
  upload.event({ type: HttpEventType.UploadProgress, loaded: 5, total: 10 });
  fixture.detectChanges();
  expect(root.querySelector('progress')?.value).toBe(50);
  fixture.componentInstance['cancelUpload']();
  expect(upload.cancelled).toBe(true);
  expect(fixture.componentInstance['form'].controls.credentialsFile.value?.name).toBe('creds.yaml');
  fixture.componentInstance['submit']();
  http.expectOne('/api/k8s').flush({ message: 'Credentials saved' });
  fixture.detectChanges();
  expect(root.textContent).toContain('Credentials saved');
  expect(fixture.componentInstance['submitting']).toBe(false);
  http.verify();
  fixture.destroy();
  localStorage.clear();
});
