import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { DashboardDataService } from './dashboard-data.service';

describe('Dashboard inventory boundaries', () => {
  it('retains healthy sections on an API failure and excludes nested secrets from rows', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);
    const result = firstValueFrom(TestBed.inject(DashboardDataService).loadSections());
    const requests = http.match(() => true);
    expect(requests.length).toBe(15);
    requests.forEach((request, index) => {
      if (index === 0) request.flush('unavailable', { status: 503, statusText: 'Unavailable' });
      else if (index === 1) request.flush([{ name: 'healthy', config: { password: 'must-not-display', location: 'lab' } }]);
      else request.flush([]);
    });
    const sections = await result;
    expect(sections[0].error).toBeTruthy();
    expect(sections[1].rows[0]['name']).toBe('healthy');
    expect(sections.slice(2).every((section) => !section.error && section.rows.length === 0)).toBe(true);
    expect(JSON.stringify(sections)).not.toContain('must-not-display');
    expect(JSON.stringify(sections)).toContain('lab');
    http.verify();
  });
});
