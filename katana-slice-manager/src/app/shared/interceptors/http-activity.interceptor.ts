import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs';
import { HttpActivityService } from '../services/http-activity.service';

export const httpActivityInterceptor: HttpInterceptorFn = (request, next) => {
  const httpActivityService = inject(HttpActivityService);

  httpActivityService.begin();

  return next(request).pipe(finalize(() => httpActivityService.end()));
};
