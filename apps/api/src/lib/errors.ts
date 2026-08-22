/**
 * Application error. Carries an HTTP status and a stable machine-readable
 * `code` that clients can branch on; mapped to the shared ApiErrorResponse
 * shape by the global error handler.
 */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function badRequest(message: string, code?: string): AppError {
  return new AppError(400, message, code);
}

export function unauthorized(message = "Authentication required", code = "UNAUTHORIZED"): AppError {
  return new AppError(401, message, code);
}

export function forbidden(message = "Forbidden", code?: string): AppError {
  return new AppError(403, message, code);
}

export function notFound(message = "Resource not found"): AppError {
  return new AppError(404, message);
}

export function conflict(message: string, code?: string): AppError {
  return new AppError(409, message, code);
}
