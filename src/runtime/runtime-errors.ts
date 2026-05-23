/**
 * PHASE I-1: CENTRALIZED RUNTIME ERROR BACKBONE
 *
 * Normalized runtime errors with classification, correlation, and operator-safe messaging.
 * NO silent failures. All runtime errors tracked, logged, and recoverable.
 */

import { classifyOperatorError } from "@/lib/operator-error-governance";

function getSafeErrorMessage(error: unknown): string {
  const classified = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
  return classified.operatorMessage;
}

export type RuntimeErrorClassification =
  | "VALIDATION"
  | "AUTH"
  | "PERMISSION"
  | "RATE_LIMIT"
  | "ENTITLEMENT"
  | "DB"
  | "QUEUE"
  | "EXTERNAL_SERVICE"
  | "EXECUTION_BLOCKED"
  | "STALE_DATA"
  | "CONFLICT"
  | "INFRASTRUCTURE"
  | "UNKNOWN";

export type ErrorSeverity = "INFO" | "WARNING" | "ERROR" | "CRITICAL";

export type RetryabilityClass = "RETRYABLE" | "NOT_RETRYABLE" | "RETRYABLE_WITH_BACKOFF";

export interface RuntimeErrorContext {
  correlation_id: string;
  request_id: string;
  workspace_id?: string;
  execution_id?: string;
  operator_id?: string;
  user_agent?: string;
  endpoint?: string;
  timestamp: Date;
}

export interface RuntimeErrorMetadata {
  classification: RuntimeErrorClassification;
  severity: ErrorSeverity;
  retryable: RetryabilityClass;
  operator_safe_message: string;
  internal_diagnostic: Record<string, unknown>;
  context: RuntimeErrorContext;
  error_code: string;
  http_status: number;
  is_transient: boolean;
  requires_escalation: boolean;
  recovery_suggestion?: string;
  timestamp: Date;
}

export class RuntimeError extends Error {
  readonly metadata: RuntimeErrorMetadata;

  constructor(
    message: string,
    metadataInput: Omit<RuntimeErrorMetadata, "timestamp">,
  ) {
    const safeMsg = classifyOperatorError(new Error(message), { context: "load" }).operatorMessage;
    super(safeMsg);
    this.name = "RuntimeError";
    this.metadata = {
      ...(metadataInput as any),
      timestamp: new Date(),
    };
  }

  toOperatorSafeJSON() {
    return {
      error_code: this.metadata.error_code,
      message: this.metadata.operator_safe_message,
      classification: this.metadata.classification,
      http_status: this.metadata.http_status,
      correlation_id: this.metadata.context.correlation_id,
      request_id: this.metadata.context.request_id,
      recovery_suggestion: this.metadata.recovery_suggestion,
    };
  }

  toInternalDiagnostic() {
    return {
      error_code: this.metadata.error_code,
      classification: this.metadata.classification,
      severity: this.metadata.severity,
      retryable: this.metadata.retryable,
      is_transient: this.metadata.is_transient,
      requires_escalation: this.metadata.requires_escalation,
      context: this.metadata.context,
      internal_diagnostic: this.metadata.internal_diagnostic,
      stack_trace: this.stack,
      timestamp: this.metadata.timestamp.toISOString(),
    };
  }
}

export function createValidationError(
  message: string,
  context: RuntimeErrorContext,
  internal_diagnostic: Record<string, unknown> = {},
): RuntimeError {
  // Governance: RuntimeError constructor classifies message via classifyOperatorError
  return new RuntimeError(classifyOperatorError(new Error(message), { context: "load" }).operatorMessage, {
    classification: "VALIDATION",
    severity: "WARNING",
    retryable: "NOT_RETRYABLE",
    operator_safe_message: message,
    internal_diagnostic,
    context,
    error_code: "ERR_VALIDATION_001",
    http_status: 400,
    is_transient: false,
    requires_escalation: false,
  });
}

export function createAuthError(
  message: string,
  context: RuntimeErrorContext,
): RuntimeError {
  const safeMessage = getSafeErrorMessage(message);
  return new RuntimeError(classifyOperatorError(new Error(safeMessage || ""), { context: "load" }).operatorMessage, {
    classification: "AUTH",
    severity: "WARNING",
    retryable: "NOT_RETRYABLE",
    operator_safe_message: "Authentication failed",
    internal_diagnostic: { original_message: safeMessage },
    context,
    error_code: "ERR_AUTH_001",
    http_status: 401,
    is_transient: false,
    requires_escalation: false,
  });
}

export function createPermissionError(
  message: string,
  context: RuntimeErrorContext,
): RuntimeError {
  const safeMessage = getSafeErrorMessage(message);
  return new RuntimeError(classifyOperatorError(new Error(safeMessage || ""), { context: "load" }).operatorMessage, {
    classification: "PERMISSION",
    severity: "WARNING",
    retryable: "NOT_RETRYABLE",
    operator_safe_message: "Permission denied",
    internal_diagnostic: { original_message: safeMessage },
    context,
    error_code: "ERR_PERMISSION_001",
    http_status: 403,
    is_transient: false,
    requires_escalation: false,
  });
}

export function createRateLimitError(
  message: string,
  context: RuntimeErrorContext,
  reset_after_seconds: number,
): RuntimeError {
  const safeMessage = getSafeErrorMessage(message);
  return new RuntimeError(classifyOperatorError(new Error(safeMessage || ""), { context: "load" }).operatorMessage, {
    classification: "RATE_LIMIT",
    severity: "WARNING",
    retryable: "RETRYABLE_WITH_BACKOFF",
    operator_safe_message: `Rate limit exceeded. Retry after ${reset_after_seconds}s`,
    internal_diagnostic: { reset_after_seconds, original_message: safeMessage },
    context,
    error_code: "ERR_RATE_LIMIT_001",
    http_status: 429,
    is_transient: true,
    requires_escalation: false,
    recovery_suggestion: `Wait ${reset_after_seconds} seconds before retrying`,
  });
}

export function createEntitlementError(
  message: string,
  context: RuntimeErrorContext,
  missing_capability: string,
): RuntimeError {
  const safeMessage = getSafeErrorMessage(message);
  return new RuntimeError(classifyOperatorError(new Error(safeMessage || ""), { context: "load" }).operatorMessage, {
    classification: "ENTITLEMENT",
    severity: "WARNING",
    retryable: "NOT_RETRYABLE",
    operator_safe_message: `Capability ${missing_capability} not available in your plan`,
    internal_diagnostic: { missing_capability, original_message: safeMessage },
    context,
    error_code: "ERR_ENTITLEMENT_001",
    http_status: 403,
    is_transient: false,
    requires_escalation: false,
  });
}

export function createDBError(
  message: string,
  context: RuntimeErrorContext,
  is_transient: boolean,
): RuntimeError {
  const safeMessage = getSafeErrorMessage(message);
  return new RuntimeError(classifyOperatorError(new Error(safeMessage || ""), { context: "load" }).operatorMessage, {
    classification: "DB",
    severity: "ERROR",
    retryable: is_transient ? "RETRYABLE_WITH_BACKOFF" : "NOT_RETRYABLE",
    operator_safe_message: "Database operation failed",
    internal_diagnostic: { original_message: safeMessage },
    context,
    error_code: is_transient ? "ERR_DB_TRANSIENT_001" : "ERR_DB_PERMANENT_001",
    http_status: 500,
    is_transient,
    requires_escalation: !is_transient,
    recovery_suggestion: is_transient ? "Automatic retry will occur" : "Contact support",
  });
}

export function createQueueError(
  message: string,
  context: RuntimeErrorContext,
  is_transient: boolean,
): RuntimeError {
  const safeMessage = getSafeErrorMessage(message);
  return new RuntimeError(classifyOperatorError(new Error(safeMessage || ""), { context: "load" }).operatorMessage, {
    classification: "QUEUE",
    severity: "ERROR",
    retryable: is_transient ? "RETRYABLE" : "NOT_RETRYABLE",
    operator_safe_message: "Job processing failed",
    internal_diagnostic: { original_message: safeMessage },
    context,
    error_code: is_transient ? "ERR_QUEUE_TRANSIENT_001" : "ERR_QUEUE_PERMANENT_001",
    http_status: 500,
    is_transient,
    requires_escalation: !is_transient,
  });
}

export function createExternalServiceError(
  service_name: string,
  message: string,
  context: RuntimeErrorContext,
  is_transient: boolean,
): RuntimeError {
  const safeMessage = getSafeErrorMessage(message);
  return new RuntimeError(classifyOperatorError(new Error(safeMessage || ""), { context: "load" }).operatorMessage, {
    classification: "EXTERNAL_SERVICE",
    severity: "ERROR",
    retryable: is_transient ? "RETRYABLE_WITH_BACKOFF" : "NOT_RETRYABLE",
    operator_safe_message: `External service ${service_name} unavailable`,
    internal_diagnostic: { service_name, original_message: safeMessage },
    context,
    error_code: is_transient ? "ERR_EXT_TRANSIENT_001" : "ERR_EXT_PERMANENT_001",
    http_status: 503,
    is_transient,
    requires_escalation: !is_transient,
    recovery_suggestion: is_transient ? "Service recovering, will retry" : "Service unavailable",
  });
}

export function createExecutionBlockedError(
  reason: string,
  context: RuntimeErrorContext,
): RuntimeError {
  const safeMessage = getSafeErrorMessage(reason);
  return new RuntimeError(classifyOperatorError(new Error(safeMessage || ""), { context: "load" }).operatorMessage, {
    classification: "EXECUTION_BLOCKED",
    severity: "WARNING",
    retryable: "NOT_RETRYABLE",
    operator_safe_message: safeMessage,
    internal_diagnostic: {},
    context,
    error_code: "ERR_EXECUTION_BLOCKED_001",
    http_status: 400,
    is_transient: false,
    requires_escalation: false,
  });
}

export function createStaleDataError(
  message: string,
  context: RuntimeErrorContext,
): RuntimeError {
  const safeMessage = getSafeErrorMessage(message);
  return new RuntimeError(classifyOperatorError(new Error(safeMessage || ""), { context: "load" }).operatorMessage, {
    classification: "STALE_DATA",
    severity: "WARNING",
    retryable: "NOT_RETRYABLE",
    operator_safe_message: "Data has been modified. Please refresh and retry.",
    internal_diagnostic: { original_message: safeMessage },
    context,
    error_code: "ERR_STALE_DATA_001",
    http_status: 409,
    is_transient: false,
    requires_escalation: false,
  });
}

export function createConflictError(
  message: string,
  context: RuntimeErrorContext,
): RuntimeError {
  const safeMessage = getSafeErrorMessage(message);
  return new RuntimeError(classifyOperatorError(new Error(safeMessage || ""), { context: "load" }).operatorMessage, {
    classification: "CONFLICT",
    severity: "WARNING",
    retryable: "NOT_RETRYABLE",
    operator_safe_message: safeMessage,
    internal_diagnostic: {},
    context,
    error_code: "ERR_CONFLICT_001",
    http_status: 409,
    is_transient: false,
    requires_escalation: false,
  });
}

export function createInfrastructureError(
  message: string,
  context: RuntimeErrorContext,
  requires_escalation: boolean = true,
): RuntimeError {
  const safeMessage = getSafeErrorMessage(message);
  return new RuntimeError(message, {
    classification: "INFRASTRUCTURE",
    severity: "CRITICAL",
    retryable: "RETRYABLE_WITH_BACKOFF",
    operator_safe_message: "Infrastructure error. Operations team notified.",
    internal_diagnostic: { original_message: safeMessage },
    context,
    error_code: "ERR_INFRASTRUCTURE_001",
    http_status: 500,
    is_transient: true,
    requires_escalation,
  });
}

export function createUnknownError(
  message: string,
  context: RuntimeErrorContext,
  error: unknown,
): RuntimeError {
  return new RuntimeError(classifyOperatorError(new Error(message), { context: "load" }).operatorMessage, {
    classification: "UNKNOWN",
    severity: "ERROR",
    retryable: "NOT_RETRYABLE",
    operator_safe_message: "An unexpected error occurred",
    internal_diagnostic: {
      original_message: message,
      error_type: error instanceof Error ? error.constructor.name : typeof error,
      error_details: getSafeErrorMessage(error),
    },
    context,
    error_code: "ERR_UNKNOWN_001",
    http_status: 500,
    is_transient: false,
    requires_escalation: true,
  });
}
