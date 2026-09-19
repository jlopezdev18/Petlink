import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { environment } from '../../environments/environment';
import { AccessRevocationService } from './access-revocation.service';

const ACCESS_DENIED_DETAILS = new Set([
  'Pet not found.',
  'You cannot update this pet.',
  'You cannot manage medications for this pet.',
  'You cannot view medications for this pet.',
]);

export const accessRevocationInterceptor: HttpInterceptorFn = (request, next) => {
  const accessRevocationService = inject(AccessRevocationService);

  return next(request).pipe(
    catchError((error: unknown) => {
      if (isRevokedAccessError(request.url, error)) {
        accessRevocationService.report();
      }

      return throwError(() => error);
    }),
  );
};

function isRevokedAccessError(requestUrl: string, error: unknown): boolean {
  if (!(error instanceof HttpErrorResponse) || !requestUrl.startsWith(environment.apiUrl)) {
    return false;
  }

  if (error.status !== 403 && error.status !== 404) {
    return false;
  }

  const detail = typeof error.error?.detail === 'string' ? error.error.detail : '';
  return ACCESS_DENIED_DETAILS.has(detail);
}
