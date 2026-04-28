export type AppErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_FAILED"
  | "NEEDS_INPUT"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  public readonly code: AppErrorCode;
  public readonly status: number;
  public readonly details?: Record<string, unknown>;

  constructor(code: AppErrorCode, message: string, status: number, details?: Record<string, unknown>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;
  if (error instanceof Error) return new AppError("INTERNAL_ERROR", error.message, 500);
  return new AppError("INTERNAL_ERROR", "Unexpected internal error", 500);
}

export const appErrors = {
  badRequest: (message: string, details?: Record<string, unknown>) => new AppError("BAD_REQUEST", message, 400, details),
  unauthorized: (message = "Authentication required") => new AppError("UNAUTHORIZED", message, 401),
  forbidden: (message = "Permission denied") => new AppError("FORBIDDEN", message, 403),
  notFound: (message: string, details?: Record<string, unknown>) => new AppError("NOT_FOUND", message, 404, details),
  conflict: (message: string, details?: Record<string, unknown>) => new AppError("CONFLICT", message, 409, details),
  validationFailed: (message: string, details?: Record<string, unknown>) => new AppError("VALIDATION_FAILED", message, 422, details),
  needsInput: (message: string, details?: Record<string, unknown>) => new AppError("NEEDS_INPUT", message, 409, details),
};
