import { HttpContextToken, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs';
import { HttpActivityService } from '../services/http-activity.service';

export const SKIP_HTTP_ACTIVITY = new HttpContextToken<boolean>(() => false);

export const httpActivityInterceptor: HttpInterceptorFn = (request, next) => {
  const httpActivityService = inject(HttpActivityService);

  if (request.context.get(SKIP_HTTP_ACTIVITY)) {
    return next(request);
  }

  httpActivityService.begin();

  return next(request).pipe(finalize(() => httpActivityService.end()));
};
