export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "CONFLICT"
  | "DUPLICATE_SUBMISSION"
  | "INVALID_STATE_TRANSITION"
  | "OPTIMISTIC_LOCK_FAILURE"
  | "POLICY_VIOLATION"
  | "RATE_LIMITED"
  | "PLAN_LIMIT_EXCEEDED"
  | "EXTERNAL_SERVICE_ERROR"
  | "STORAGE_ERROR"
  | "SCHEDULER_ERROR"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && { details: this.details }),
      },
    };
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("VALIDATION_ERROR", message, 400, details);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends AppError {
  constructor(entityType: string, entityId: string) {
    super("NOT_FOUND", `${entityType} not found: ${entityId}`, 404, {
      entityType,
      entityId,
    });
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super("UNAUTHORIZED", message, 401);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Insufficient permissions") {
    super("FORBIDDEN", message, 403);
    this.name = "ForbiddenError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("CONFLICT", message, 409, details);
    this.name = "ConflictError";
  }
}

export class DuplicateSubmissionError extends AppError {
  constructor(idempotencyKey: string) {
    super(
      "DUPLICATE_SUBMISSION",
      `Duplicate submission detected for key: ${idempotencyKey}`,
      409,
      { idempotencyKey }
    );
    this.name = "DuplicateSubmissionError";
  }
}

export class InvalidStateTransitionError extends AppError {
  constructor(entityType: string, from: string, to: string) {
    super(
      "INVALID_STATE_TRANSITION",
      `Invalid state transition for ${entityType}: ${from} → ${to}`,
      422,
      { entityType, from, to }
    );
    this.name = "InvalidStateTransitionError";
  }
}

export class OptimisticLockError extends AppError {
  constructor(entityType: string, entityId: string) {
    super(
      "OPTIMISTIC_LOCK_FAILURE",
      `Concurrent update conflict for ${entityType}: ${entityId}`,
      409,
      { entityType, entityId }
    );
    this.name = "OptimisticLockError";
  }
}

export class PolicyViolationError extends AppError {
  constructor(policy: string, message: string) {
    super("POLICY_VIOLATION", message, 403, { policy });
    this.name = "PolicyViolationError";
  }
}

export class PlanLimitError extends AppError {
  constructor(capability: string, message: string) {
    super(
      "PLAN_LIMIT_EXCEEDED",
      message,
      402,
      { capability }
    );
    this.name = "PlanLimitError";
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const message =
    error instanceof Error ? error.message : "An unexpected error occurred";
  return new AppError("INTERNAL_ERROR", message, 500);
}

export function errorToResponse(error: unknown): Response {
  const appError = toAppError(error);
  return Response.json(appError.toJSON(), { status: appError.statusCode });
}
