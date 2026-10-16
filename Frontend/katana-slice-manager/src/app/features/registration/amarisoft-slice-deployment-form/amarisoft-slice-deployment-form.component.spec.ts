import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AmarisoftSliceDeploymentFormComponent } from './amarisoft-slice-deployment-form.component';

describe('Amarisoft workflow', () => {
  it('previews, saves and applies once, retaining the plan after a partial target failure', () => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(AmarisoftSliceDeploymentFormComponent);
    const component = fixture.componentInstance as any;
    const http = TestBed.inject(HttpTestingController);
    const attempts: any[] = [];
    component.deployed.subscribe((attempt: unknown) => attempts.push(attempt));
    component.savePlan();
    http.expectNone(() => true);
    component.form.patchValue({ name: 'local-test', sd: '000001', ranUrl: 'http://ran.invalid', coreUrl: 'http://core.invalid' });
    component.preview(); component.preview(); component.savePlan();
    const preview = http.expectOne('/api/amarisoft-slices/preview');
    expect(preview.request.body.s_nssai.sd).toBe('000001');
    preview.flush({ status: 'preview' });
    expect(attempts).toEqual([]);
    component.savePlan(); component.savePlan();
    const plan = http.expectOne('/api/amarisoft-slices');
    expect(plan.request.body.dry_run).toBe(true);
    plan.flush({ _id: 'plan', status: 'planned' });
    expect(attempts).toEqual([]);
    component.applyPlan(); component.applyPlan();
    http.expectOne('/api/amarisoft-slices/plan/apply').flush(
      { status: 'error', apply_result: { ran: { ok: true }, core: { ok: false } } },
      { status: 502, statusText: 'Bad Gateway' },
    );
    expect(attempts[0].status).toBe('failed');
    expect(component.plannedSliceId).toBe('plan');
    component.applyPlan();
    http.expectOne('/api/amarisoft-slices/plan/apply').flush({ _id: 'plan', status: 'running' });
    expect(attempts[1].status).toBe('done');
    http.verify();
    fixture.destroy(); localStorage.clear();
  });
});
