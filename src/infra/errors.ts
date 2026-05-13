// Layer 1: Identity Authentication
type Layer1ErrorCode =
  | "AUTH_MISSING"
  | "AUTH_MALFORMED"
  | "AUTH_INVALID"
  | "AUTH_EXPIRED"
  | "AUTH_REVOKED"
  | "AUTH_TAMPERED"
  | "AUTH_BACKEND_UNAVAILABLE";

// Layer 2: Tenant Authorization
type Layer2ErrorCode =
  | "WORKSPACE_MISSING"
  | "WORKSPACE_MALFORMED"
  | "WORKSPACE_NOT_FOUND"
  | "WORKSPACE_MEMBERSHIP_MISSING"
  | "WORKSPACE_MEMBERSHIP_INACTIVE"
  | "WORKSPACE_INACTIVE"
  | "WORKSPACE_BACKEND_UNAVAILABLE";

// Layer 3: Capability Authorization
type Layer3ErrorCode =
  | "CAPABILITY_NOT_GRANTED"
  | "CAPABILITY_REVOKED"
  | "CAPABILITY_BACKEND_UNAVAILABLE";

// Layer 4: Operational Safety
type Layer4ErrorCode =
  | "RATE_LIMITED"
  | "REPLAY_DETECTED"
  | "CIRCUIT_OPEN"
  | "REQUEST_SHED"
  | "SYSTEM_DEGRADED"
  | "PARTIAL_VERIFICATION";

// Additional errors
type OtherErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "DUPLICATE_SUBMISSION"
  | "INVALID_STATE_TRANSITION"
  | "OPTIMISTIC_LOCK_FAILURE"
  | "POLICY_VIOLATION"
  | "PLAN_LIMIT_EXCEEDED"
  | "EXTERNAL_SERVICE_ERROR"
  | "STORAGE_ERROR"
  | "SCHEDULER_ERROR"
  | "INTERNAL_ERROR"
  | "BAD_REQUEST";

export type ErrorCode =
  | Layer1ErrorCode
  | Layer2ErrorCode
  | Layer3ErrorCode
  | Layer4ErrorCode
  | OtherErrorCode;

// Telemetry classification for observability
export type TelemetryClass =
  | "AUTH_INVALID"
  | "AUTH_EXPIRED"
  | "AUTH_REVOKED"
  | "AUTH_TAMPERED"
  | "AUTH_BACKEND_UNAVAILABLE"
  | "WORKSPACE_DENIED"
  | "WORKSPACE_NOT_FOUND"
  | "WORKSPACE_UNKNOWN"
  | "CAPABILITY_DENIED"
  | "CAPABILITY_REVOKED"
  | "CAPABILITY_BACKEND_UNAVAILABLE"
  | "RATE_LIMITED"
  | "REPLAY_DETECTED"
  | "CIRCUIT_OPEN"
  | "REQUEST_SHED"
  | "SYSTEM_DEGRADED"
  | "PARTIAL_VERIFICATION"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "NOT_FOUND"
  | "INTERNAL_ERROR";

// Audit classification
export type AuditClass =
  | "AUTH_FAILED"
  | "PERMISSION_DENIED"
  | "WORKSPACE_ACCESS_DENIED"
  | "CAPABILITY_DENIED"
  | "INFRASTRUCTURE_INCIDENT"
  | "RATE_LIMIT_EXCEEDED"
  | "SECURITY_EVENT"
  | "CLIENT_ERROR"
  | "INTERNAL_ERROR";

// Telemetry metadata
export interface TelemetryMetadata {
  telemetryClass: TelemetryClass;
  auditClass: AuditClass;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  retryable: boolean;
  securityRelevant: boolean;
  infrastructureRelevant: boolean;
  abuseRelevant: boolean;
  handlerAllowed: boolean;
  mutationAllowed: boolean;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;
  readonly telemetry: TelemetryMetadata;
  readonly correlationId?: string;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number,
    telemetry: TelemetryMetadata,
    details?: Record<string, unknown>,
    correlationId?: string
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.telemetry = telemetry;
    this.correlationId = correlationId;
  }

  // Client-safe JSON: no stack trace, no internal details
  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        status: this.statusCode,
        ...(this.details && { details: this.details }),
        retryable: this.telemetry.retryable,
      },
    };
  }

  // Operator-safe JSON: includes telemetry for diagnostics
  toOperatorJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        status: this.statusCode,
        telemetry: {
          class: this.telemetry.telemetryClass,
          auditClass: this.telemetry.auditClass,
          severity: this.telemetry.severity,
          retryable: this.telemetry.retryable,
          securityRelevant: this.telemetry.securityRelevant,
          infrastructureRelevant: this.telemetry.infrastructureRelevant,
        },
        correlationId: this.correlationId,
        ...(this.details && { details: this.details }),
      },
    };
  }
}

// Layer 1: Identity Authentication Errors

export class UnauthorizedError extends AppError {
  constructor(
    reasonOrMessage: Layer1ErrorCode | string = "AUTH_INVALID",
    messageOrUndefined?: string | undefined,
    correlationId?: string
  ) {
    // Support both old style: new UnauthorizedError("message")
    // and new style: new UnauthorizedError("AUTH_INVALID", "message")
    let reason: Layer1ErrorCode = "AUTH_INVALID";
    let message: string = "Authentication required";

    if (
      reasonOrMessage === "AUTH_MISSING" ||
      reasonOrMessage === "AUTH_MALFORMED" ||
      reasonOrMessage === "AUTH_INVALID" ||
      reasonOrMessage === "AUTH_EXPIRED" ||
      reasonOrMessage === "AUTH_REVOKED" ||
      reasonOrMessage === "AUTH_TAMPERED" ||
      reasonOrMessage === "AUTH_BACKEND_UNAVAILABLE"
    ) {
      reason = reasonOrMessage;
      message = messageOrUndefined || "Authentication required";
    } else {
      // Old style: first parameter is message
      message = reasonOrMessage;
      correlationId = messageOrUndefined as string | undefined;
    }

    const telemetryMap: Record<Layer1ErrorCode, TelemetryMetadata> = {
      AUTH_MISSING: {
        telemetryClass: "AUTH_INVALID",
        auditClass: "AUTH_FAILED",
        severity: "LOW",
        retryable: false,
        securityRelevant: false,
        infrastructureRelevant: false,
        abuseRelevant: false,
        handlerAllowed: false,
        mutationAllowed: false,
      },
      AUTH_MALFORMED: {
        telemetryClass: "AUTH_INVALID",
        auditClass: "CLIENT_ERROR",
        severity: "LOW",
        retryable: false,
        securityRelevant: false,
        infrastructureRelevant: false,
        abuseRelevant: false,
        handlerAllowed: false,
        mutationAllowed: false,
      },
      AUTH_INVALID: {
        telemetryClass: "AUTH_INVALID",
        auditClass: "AUTH_FAILED",
        severity: "MEDIUM",
        retryable: false,
        securityRelevant: true,
        infrastructureRelevant: false,
        abuseRelevant: true,
        handlerAllowed: false,
        mutationAllowed: false,
      },
      AUTH_EXPIRED: {
        telemetryClass: "AUTH_EXPIRED",
        auditClass: "AUTH_FAILED",
        severity: "LOW",
        retryable: true,
        securityRelevant: false,
        infrastructureRelevant: false,
        abuseRelevant: false,
        handlerAllowed: false,
        mutationAllowed: false,
      },
      AUTH_REVOKED: {
        telemetryClass: "AUTH_REVOKED",
        auditClass: "SECURITY_EVENT",
        severity: "HIGH",
        retryable: false,
        securityRelevant: true,
        infrastructureRelevant: false,
        abuseRelevant: false,
        handlerAllowed: false,
        mutationAllowed: false,
      },
      AUTH_TAMPERED: {
        telemetryClass: "AUTH_TAMPERED",
        auditClass: "SECURITY_EVENT",
        severity: "CRITICAL",
        retryable: false,
        securityRelevant: true,
        infrastructureRelevant: false,
        abuseRelevant: true,
        handlerAllowed: false,
        mutationAllowed: false,
      },
      AUTH_BACKEND_UNAVAILABLE: {
        telemetryClass: "AUTH_BACKEND_UNAVAILABLE",
        auditClass: "INFRASTRUCTURE_INCIDENT",
        severity: "CRITICAL",
        retryable: true,
        securityRelevant: false,
        infrastructureRelevant: true,
        abuseRelevant: false,
        handlerAllowed: false,
        mutationAllowed: false,
      },
    };
    super(
      reason,
      message || "Authentication required",
      401,
      telemetryMap[reason],
      undefined,
      correlationId
    );
    this.name = "UnauthorizedError";
  }
}

// Layer 2: Tenant Authorization Errors

export class ForbiddenError extends AppError {
  constructor(
    reasonOrMessage: Layer2ErrorCode | Layer3ErrorCode | string = "WORKSPACE_DENIED",
    messageOrUndefined?: string,
    correlationId?: string
  ) {
    // Support both old style: new ForbiddenError("message")
    // and new style: new ForbiddenError("WORKSPACE_DENIED", "message")
    let reason: Layer2ErrorCode | Layer3ErrorCode = "WORKSPACE_MEMBERSHIP_MISSING";
    let message: string = "Insufficient permissions";

    const validReasons = new Set<string>([
      "WORKSPACE_MISSING",
      "WORKSPACE_MALFORMED",
      "WORKSPACE_NOT_FOUND",
      "WORKSPACE_MEMBERSHIP_MISSING",
      "WORKSPACE_MEMBERSHIP_INACTIVE",
      "WORKSPACE_INACTIVE",
      "WORKSPACE_BACKEND_UNAVAILABLE",
      "CAPABILITY_NOT_GRANTED",
      "CAPABILITY_REVOKED",
      "CAPABILITY_BACKEND_UNAVAILABLE",
    ]);

    if (validReasons.has(reasonOrMessage)) {
      reason = reasonOrMessage as Layer2ErrorCode | Layer3ErrorCode;
      message = messageOrUndefined || "Insufficient permissions";
    } else {
      // Old style: first parameter is message
      message = reasonOrMessage;
      correlationId = messageOrUndefined as string | undefined;
    }

    const telemetryMap: Record<Layer2ErrorCode | Layer3ErrorCode, TelemetryMetadata> = {
      WORKSPACE_MISSING: {
        telemetryClass: "WORKSPACE_DENIED",
        auditClass: "CLIENT_ERROR",
        severity: "LOW",
        retryable: false,
        securityRelevant: false,
        infrastructureRelevant: false,
        abuseRelevant: false,
        handlerAllowed: false,
        mutationAllowed: false,
      },
      WORKSPACE_MALFORMED: {
        telemetryClass: "WORKSPACE_DENIED",
        auditClass: "CLIENT_ERROR",
        severity: "LOW",
        retryable: false,
        securityRelevant: false,
        infrastructureRelevant: false,
        abuseRelevant: false,
        handlerAllowed: false,
        mutationAllowed: false,
      },
      WORKSPACE_NOT_FOUND: {
        telemetryClass: "WORKSPACE_NOT_FOUND",
        auditClass: "WORKSPACE_ACCESS_DENIED",
        severity: "LOW",
        retryable: false,
        securityRelevant: false,
        infrastructureRelevant: false,
        abuseRelevant: true,
        handlerAllowed: false,
        mutationAllowed: false,
      },
      WORKSPACE_MEMBERSHIP_MISSING: {
        telemetryClass: "WORKSPACE_DENIED",
        auditClass: "WORKSPACE_ACCESS_DENIED",
        severity: "LOW",
        retryable: false,
        securityRelevant: false,
        infrastructureRelevant: false,
        abuseRelevant: false,
        handlerAllowed: false,
        mutationAllowed: false,
      },
      WORKSPACE_MEMBERSHIP_INACTIVE: {
        telemetryClass: "WORKSPACE_DENIED",
        auditClass: "WORKSPACE_ACCESS_DENIED",
        severity: "MEDIUM",
        retryable: false,
        securityRelevant: false,
        infrastructureRelevant: false,
        abuseRelevant: false,
        handlerAllowed: false,
        mutationAllowed: false,
      },
      WORKSPACE_INACTIVE: {
        telemetryClass: "WORKSPACE_DENIED",
        auditClass: "WORKSPACE_ACCESS_DENIED",
        severity: "LOW",
        retryable: false,
        securityRelevant: false,
        infrastructureRelevant: false,
        abuseRelevant: false,
        handlerAllowed: false,
        mutationAllowed: false,
      },
      WORKSPACE_BACKEND_UNAVAILABLE: {
        telemetryClass: "AUTH_BACKEND_UNAVAILABLE",
        auditClass: "INFRASTRUCTURE_INCIDENT",
        severity: "CRITICAL",
        retryable: true,
        securityRelevant: false,
        infrastructureRelevant: true,
        abuseRelevant: false,
        handlerAllowed: false,
        mutationAllowed: false,
      },
      CAPABILITY_NOT_GRANTED: {
        telemetryClass: "CAPABILITY_DENIED",
        auditClass: "CAPABILITY_DENIED",
        severity: "LOW",
        retryable: false,
        securityRelevant: false,
        infrastructureRelevant: false,
        abuseRelevant: false,
        handlerAllowed: false,
        mutationAllowed: false,
      },
      CAPABILITY_REVOKED: {
        telemetryClass: "CAPABILITY_REVOKED",
        auditClass: "CAPABILITY_DENIED",
        severity: "MEDIUM",
        retryable: false,
        securityRelevant: false,
        infrastructureRelevant: false,
        abuseRelevant: false,
        handlerAllowed: false,
        mutationAllowed: false,
      },
      CAPABILITY_BACKEND_UNAVAILABLE: {
        telemetryClass: "CAPABILITY_BACKEND_UNAVAILABLE",
        auditClass: "INFRASTRUCTURE_INCIDENT",
        severity: "CRITICAL",
        retryable: true,
        securityRelevant: false,
        infrastructureRelevant: true,
        abuseRelevant: false,
        handlerAllowed: false,
        mutationAllowed: false,
      },
    };
    super(
      reason,
      message || "Insufficient permissions",
      403,
      telemetryMap[reason],
      undefined,
      correlationId
    );
    this.name = "ForbiddenError";
  }
}

// Service Unavailable Errors (503)
// For infrastructure failures and operational safety violations

export type InfrastructureErrorCode =
  | "AUTH_BACKEND_UNAVAILABLE"
  | "WORKSPACE_BACKEND_UNAVAILABLE"
  | "CAPABILITY_BACKEND_UNAVAILABLE"
  | "PARTIAL_VERIFICATION"
  | "CIRCUIT_OPEN"
  | "REQUEST_SHED"
  | "SYSTEM_DEGRADED";

export class ServiceUnavailableError extends AppError {
  constructor(
    reason: InfrastructureErrorCode,
    message?: string,
    correlationId?: string
  ) {
    const telemetryMap: Record<InfrastructureErrorCode, TelemetryMetadata> = {
      AUTH_BACKEND_UNAVAILABLE: {
        telemetryClass: "AUTH_BACKEND_UNAVAILABLE",
        auditClass: "INFRASTRUCTURE_INCIDENT",
        severity: "CRITICAL",
        retryable: true,
        securityRelevant: false,
        infrastructureRelevant: true,
        abuseRelevant: false,
        handlerAllowed: false,
        mutationAllowed: false,
      },
      WORKSPACE_BACKEND_UNAVAILABLE: {
        telemetryClass: "AUTH_BACKEND_UNAVAILABLE",
        auditClass: "INFRASTRUCTURE_INCIDENT",
        severity: "CRITICAL",
        retryable: true,
        securityRelevant: false,
        infrastructureRelevant: true,
        abuseRelevant: false,
        handlerAllowed: false,
        mutationAllowed: false,
      },
      CAPABILITY_BACKEND_UNAVAILABLE: {
        telemetryClass: "CAPABILITY_BACKEND_UNAVAILABLE",
        auditClass: "INFRASTRUCTURE_INCIDENT",
        severity: "CRITICAL",
        retryable: true,
        securityRelevant: false,
        infrastructureRelevant: true,
        abuseRelevant: false,
        handlerAllowed: false,
        mutationAllowed: false,
      },
      CIRCUIT_OPEN: {
        telemetryClass: "CIRCUIT_OPEN",
        auditClass: "INFRASTRUCTURE_INCIDENT",
        severity: "CRITICAL",
        retryable: true,
        securityRelevant: false,
        infrastructureRelevant: true,
        abuseRelevant: false,
        handlerAllowed: false,
        mutationAllowed: false,
      },
      REQUEST_SHED: {
        telemetryClass: "REQUEST_SHED",
        auditClass: "INFRASTRUCTURE_INCIDENT",
        severity: "CRITICAL",
        retryable: true,
        securityRelevant: false,
        infrastructureRelevant: true,
        abuseRelevant: false,
        handlerAllowed: false,
        mutationAllowed: false,
      },
      SYSTEM_DEGRADED: {
        telemetryClass: "SYSTEM_DEGRADED",
        auditClass: "INFRASTRUCTURE_INCIDENT",
        severity: "CRITICAL",
        retryable: true,
        securityRelevant: false,
        infrastructureRelevant: true,
        abuseRelevant: false,
        handlerAllowed: false,
        mutationAllowed: false,
      },
      PARTIAL_VERIFICATION: {
        telemetryClass: "PARTIAL_VERIFICATION",
        auditClass: "INFRASTRUCTURE_INCIDENT",
        severity: "HIGH",
        retryable: true,
        securityRelevant: false,
        infrastructureRelevant: true,
        abuseRelevant: false,
        handlerAllowed: false,
        mutationAllowed: false,
      },
    };
    super(
      reason as ErrorCode,
      message || "Service temporarily unavailable",
      503,
      telemetryMap[reason],
      undefined,
      correlationId
    );
    this.name = "ServiceUnavailableError";
  }
}

// Additional Error Types

export class BadRequestError extends AppError {
  constructor(message: string, details?: Record<string, unknown>, correlationId?: string) {
    super(
      "BAD_REQUEST",
      message,
      400,
      {
        telemetryClass: "VALIDATION_ERROR",
        auditClass: "CLIENT_ERROR",
        severity: "LOW",
        retryable: false,
        securityRelevant: false,
        infrastructureRelevant: false,
        abuseRelevant: false,
        handlerAllowed: false,
        mutationAllowed: false,
      },
      details,
      correlationId
    );
    this.name = "BadRequestError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>, correlationId?: string) {
    super(
      "VALIDATION_ERROR",
      message,
      400,
      {
        telemetryClass: "VALIDATION_ERROR",
        auditClass: "CLIENT_ERROR",
        severity: "LOW",
        retryable: false,
        securityRelevant: false,
        infrastructureRelevant: false,
        abuseRelevant: false,
        handlerAllowed: false,
        mutationAllowed: false,
      },
      details,
      correlationId
    );
    this.name = "ValidationError";
  }
}

export class NotFoundError extends AppError {
  constructor(entityType: string, entityId: string, correlationId?: string) {
    super(
      "NOT_FOUND",
      `${entityType} not found: ${entityId}`,
      404,
      {
        telemetryClass: "NOT_FOUND",
        auditClass: "CLIENT_ERROR",
        severity: "LOW",
        retryable: false,
        securityRelevant: false,
        infrastructureRelevant: false,
        abuseRelevant: false,
        handlerAllowed: false,
        mutationAllowed: false,
      },
      { entityType, entityId },
      correlationId
    );
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>, correlationId?: string) {
    super(
      "CONFLICT",
      message,
      409,
      {
        telemetryClass: "CONFLICT",
        auditClass: "CLIENT_ERROR",
        severity: "LOW",
        retryable: false,
        securityRelevant: false,
        infrastructureRelevant: false,
        abuseRelevant: false,
        handlerAllowed: false,
        mutationAllowed: false,
      },
      details,
      correlationId
    );
    this.name = "ConflictError";
  }
}

export class DuplicateSubmissionError extends AppError {
  constructor(idempotencyKey: string, correlationId?: string) {
    super(
      "DUPLICATE_SUBMISSION",
      `Duplicate submission detected for key: ${idempotencyKey}`,
      409,
      {
        telemetryClass: "REPLAY_DETECTED",
        auditClass: "INTERNAL_ERROR",
        severity: "MEDIUM",
        retryable: true,
        securityRelevant: true,
        infrastructureRelevant: false,
        abuseRelevant: true,
        handlerAllowed: false,
        mutationAllowed: false,
      },
      { idempotencyKey },
      correlationId
    );
    this.name = "DuplicateSubmissionError";
  }
}

export class InvalidStateTransitionError extends AppError {
  constructor(entityType: string, from: string, to: string, correlationId?: string) {
    super(
      "INVALID_STATE_TRANSITION",
      `Invalid state transition for ${entityType}: ${from} → ${to}`,
      422,
      {
        telemetryClass: "VALIDATION_ERROR",
        auditClass: "CLIENT_ERROR",
        severity: "LOW",
        retryable: false,
        securityRelevant: false,
        infrastructureRelevant: false,
        abuseRelevant: false,
        handlerAllowed: false,
        mutationAllowed: false,
      },
      { entityType, from, to },
      correlationId
    );
    this.name = "InvalidStateTransitionError";
  }
}

export class OptimisticLockError extends AppError {
  constructor(entityType: string, entityId: string, correlationId?: string) {
    super(
      "OPTIMISTIC_LOCK_FAILURE",
      `Concurrent update conflict for ${entityType}: ${entityId}`,
      409,
      {
        telemetryClass: "CONFLICT",
        auditClass: "INTERNAL_ERROR",
        severity: "LOW",
        retryable: true,
        securityRelevant: false,
        infrastructureRelevant: false,
        abuseRelevant: false,
        handlerAllowed: false,
        mutationAllowed: false,
      },
      { entityType, entityId },
      correlationId
    );
    this.name = "OptimisticLockError";
  }
}

export class PolicyViolationError extends AppError {
  constructor(policy: string, message: string, correlationId?: string) {
    super(
      "POLICY_VIOLATION",
      message,
      403,
      {
        telemetryClass: "CAPABILITY_DENIED",
        auditClass: "CAPABILITY_DENIED",
        severity: "MEDIUM",
        retryable: false,
        securityRelevant: false,
        infrastructureRelevant: false,
        abuseRelevant: false,
        handlerAllowed: false,
        mutationAllowed: false,
      },
      { policy },
      correlationId
    );
    this.name = "PolicyViolationError";
  }
}

export class PlanLimitError extends AppError {
  constructor(capability: string, message: string, correlationId?: string) {
    super(
      "PLAN_LIMIT_EXCEEDED",
      message,
      402,
      {
        telemetryClass: "CAPABILITY_DENIED",
        auditClass: "CAPABILITY_DENIED",
        severity: "LOW",
        retryable: false,
        securityRelevant: false,
        infrastructureRelevant: false,
        abuseRelevant: false,
        handlerAllowed: false,
        mutationAllowed: false,
      },
      { capability },
      correlationId
    );
    this.name = "PlanLimitError";
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message: string, details?: Record<string, unknown>, correlationId?: string) {
    super(
      "RATE_LIMITED",
      message,
      429,
      {
        telemetryClass: "RATE_LIMITED",
        auditClass: "RATE_LIMIT_EXCEEDED",
        severity: "LOW",
        retryable: true,
        securityRelevant: false,
        infrastructureRelevant: true,
        abuseRelevant: true,
        handlerAllowed: false,
        mutationAllowed: false,
      },
      details,
      correlationId
    );
    this.name = "TooManyRequestsError";
  }
}

export function toAppError(error: unknown, correlationId?: string): AppError {
  if (error instanceof AppError) return error;
  const message =
    error instanceof Error ? error.message : "An unexpected error occurred";
  return new AppError(
    "INTERNAL_ERROR",
    message,
    500,
    {
      telemetryClass: "INTERNAL_ERROR",
      auditClass: "INTERNAL_ERROR",
      severity: "CRITICAL",
      retryable: false,
      securityRelevant: false,
      infrastructureRelevant: true,
      abuseRelevant: false,
      handlerAllowed: false,
      mutationAllowed: false,
    },
    undefined,
    correlationId
  );
}

export function errorToResponse(error: unknown, correlationId?: string): Response {
  const appError = toAppError(error, correlationId);
  return Response.json(appError.toJSON(), {
    status: appError.statusCode,
    headers: correlationId ? { "X-Correlation-ID": correlationId } : undefined,
  });
}

// Telemetry emission hooks
export interface TelemetryEmitter {
  emit(
    telemetryClass: TelemetryClass,
    metadata: Record<string, unknown>,
    correlationId?: string
  ): Promise<void>;
}

export interface AuditEmitter {
  emit(
    auditClass: AuditClass,
    metadata: Record<string, unknown>,
    correlationId?: string
  ): Promise<void>;
}

// Global telemetry and audit emitters (will be injected at runtime)
let globalTelemetryEmitter: TelemetryEmitter | null = null;
let globalAuditEmitter: AuditEmitter | null = null;

export function setTelemetryEmitter(emitter: TelemetryEmitter): void {
  globalTelemetryEmitter = emitter;
}

export function setAuditEmitter(emitter: AuditEmitter): void {
  globalAuditEmitter = emitter;
}

export async function emitTelemetry(
  telemetryClass: TelemetryClass,
  metadata: Record<string, unknown>,
  correlationId?: string
): Promise<void> {
  if (globalTelemetryEmitter) {
    await globalTelemetryEmitter.emit(telemetryClass, metadata, correlationId);
  }
}

export async function emitAudit(
  auditClass: AuditClass,
  metadata: Record<string, unknown>,
  correlationId?: string
): Promise<void> {
  if (globalAuditEmitter) {
    await globalAuditEmitter.emit(auditClass, metadata, correlationId);
  }
}
