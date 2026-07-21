import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { VimApiService } from './vim-api.service';

describe('VimApiService', () => {
  it('filters inventory using the backend nfvo_id query parameter', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const service = TestBed.inject(VimApiService);
    const http = TestBed.inject(HttpTestingController);
    service.getVims('osm-1').subscribe();
    const request = http.expectOne(
      (candidate) => candidate.url === '/api/vim' && candidate.params.get('nfvo_id') === 'osm-1',
    );
    expect(request.request.method).toBe('GET');
    request.flush([]);
    http.verify();
  });
});
