import type { ServiceResult, ServiceError } from "@/contracts";
import { ServiceErrorType } from "@/contracts";
import { logger } from "@/infra/logger";
import {
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  PolicyViolationError,
  PlanLimitError,
  InvalidStateTransitionError,
  OptimisticLockError,
  type AppError,
} from "@/infra/errors";

export function createServiceResult<T>(data: T, metadata?: {
  executedAt?: Date;
  idempotencyKey?: string;
  actorId?: string;
  workspaceId?: string;
}): ServiceResult<T> {
  return {
    ok: true,
    data,
    auditMetadata: {
      executedAt: metadata?.executedAt ?? new Date(),
      idempotencyKey: metadata?.idempotencyKey,
      actorId: metadata?.actorId,
      workspaceId: metadata?.workspaceId,
    },
  };
}

export function createServiceError(
  type: ServiceErrorType,
  message: string,
  options?: {
    code?: string;
    retryable?: boolean;
    context?: Record<string, unknown>;
  }
): ServiceError {
  return {
    type: type as ServiceErrorType,
    message,
    code: options?.code,
    retryable: options?.retryable ?? false,
    context: options?.context,
  };
}

export function createErrorResult<T>(error: ServiceError): ServiceResult<T> {
  return {
    ok: false,
    error,
  };
}

export function mapErrorToServiceError(err: unknown): ServiceError {
  if (err instanceof ValidationError) {
    return createServiceError(
      ServiceErrorType.VALIDATION_ERROR,
      err.message,
      { retryable: false }
    );
  }

  if (err instanceof NotFoundError) {
    return createServiceError(
      ServiceErrorType.PERSISTENCE_ERROR,
      err.message,
      { code: "NOT_FOUND", retryable: false }
    );
  }

  if (err instanceof UnauthorizedError) {
    return createServiceError(
      ServiceErrorType.AUTH_ERROR,
      err.message,
      { retryable: false }
    );
  }

  if (err instanceof ForbiddenError) {
    return createServiceError(
      ServiceErrorType.POLICY_ERROR,
      err.message,
      { retryable: false }
    );
  }

  if (err instanceof PolicyViolationError) {
    return createServiceError(
      ServiceErrorType.POLICY_ERROR,
      err.message,
      { retryable: false }
    );
  }

  if (err instanceof PlanLimitError) {
    return createServiceError(
      ServiceErrorType.POLICY_ERROR,
      err.message,
      { code: "PLAN_LIMIT_EXCEEDED", retryable: false }
    );
  }

  if (err instanceof ConflictError) {
    return createServiceError(
      ServiceErrorType.PERSISTENCE_ERROR,
      err.message,
      { code: "CONFLICT", retryable: false }
    );
  }

  if (err instanceof OptimisticLockError) {
    return createServiceError(
      ServiceErrorType.PERSISTENCE_ERROR,
      err.message,
      { code: "OPTIMISTIC_LOCK_FAILURE", retryable: true }
    );
  }

  if (err instanceof InvalidStateTransitionError) {
    return createServiceError(
      ServiceErrorType.VALIDATION_ERROR,
      err.message,
      { code: "INVALID_STATE_TRANSITION", retryable: false }
    );
  }

  if (err instanceof Error) {
    return createServiceError(
      ServiceErrorType.UNKNOWN_ERROR,
      err.message,
      { retryable: false }
    );
  }

  return createServiceError(
    ServiceErrorType.UNKNOWN_ERROR,
    String(err),
    { retryable: false }
  );
}

export async function wrapServiceCall<T>(
  fn: () => Promise<T>,
  metadata?: {
    executedAt?: Date;
    idempotencyKey?: string;
    actorId?: string;
    workspaceId?: string;
  }
): Promise<ServiceResult<T>> {
  try {
    const result = await fn();
    return createServiceResult(result, metadata);
  } catch (err) {
    const error = mapErrorToServiceError(err);
    logger.error("Service call failed", {
      errorType: error.type,
      message: error.message,
      code: error.code,
    });
    return createErrorResult(error);
  }
}
