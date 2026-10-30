import type { ApiErrorCode } from '@shagun/shared';

export type ErrorCode = ApiErrorCode;

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorBody(code: ErrorCode, message: string) {
  return { error: { code, message } };
}

export const notFound = (what = 'Not found') => new AppError(404, 'NOT_FOUND', what);
export const forbidden = (message: string) => new AppError(403, 'ROLE_FORBIDDEN', message);
export const unauthenticated = (message = 'Sign in again') => new AppError(401, 'UNAUTHENTICATED', message);
