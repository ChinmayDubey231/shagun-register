/** Error codes the app translates into Hindi or English messages. */
export type ErrorCode =
  | 'NOT_FOUND'
  | 'BAD_JSON'
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'ROLE_FORBIDDEN'
  | 'INVITE_EXPIRED'
  | 'INTERNAL';

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
