import { HttpErrorResponse } from '@angular/common/http';

function asMessage(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }

  return null;
}

export function getApiErrorType(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }

  return (
    asMessage(error.error?.error_type) ??
    asMessage(error.error?.errorType) ??
    asMessage(error.error?.type) ??
    asMessage(error.error?.code) ??
    (error.statusText && error.statusText !== 'Unknown Error' ? error.statusText : null) ??
    (error.status ? `HTTP ${error.status}` : null)
  );
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    const directMessage =
      asMessage(error.error?.message) ??
      asMessage(error.error?.detail) ??
      asMessage(error.error) ??
      asMessage(error.message);

    if (directMessage) {
      return directMessage;
    }

    return `${fallback} (${error.status || 'request failed'})`;
  }

  return fallback;
}
