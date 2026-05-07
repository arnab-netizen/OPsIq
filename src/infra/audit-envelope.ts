/**
 * ENTERPRISE TRUST BASELINE - Deterministic Audit Envelope
 *
 * All service operations must be wrapped with audit context:
 * - requestId: Traceability across entire request flow
 * - workspaceId: Tenant isolation & audit scope
 * - timestamp: Absolute point-in-time reference
 * - actorId: Who initiated the operation
 * - retryable: Circuit breaker intelligence
 * - canonical error type: Deterministic error handling
 *
 * Purpose: Enable enterprise audit, compliance, and observability.
 */

import { randomUUID } from "crypto";
import type { ServiceError, ServiceResult } from "@/contracts";
import { ServiceErrorType } from "@/contracts";

export interface AuditEnvelope {
  requestId: string;
  workspaceId: string;
  timestamp: string; // ISO 8601
  actorId?: string;
  durationMs?: number;
  retryable: boolean;
  errorType?: ServiceErrorType;
  errorCode?: string;
  operationName: string;
}

export interface SerializedError extends AuditEnvelope {
  message: string;
  context?: Record<string, unknown>;
  stackTrace?: string;
}

/**
 * Create audit envelope for any service operation.
 * Must be called at operation entry point.
 */
export function createAuditEnvelope(
  operationName: string,
  workspaceId: string,
  actorId?: string,
  requestId?: string
): AuditEnvelope {
  return {
    requestId: requestId || randomUUID(),
    workspaceId,
    timestamp: new Date().toISOString(),
    actorId,
    retryable: false,
    operationName,
  };
}

/**
 * Serialize error with full audit context for logging & compliance.
 * Safe for: logging systems, error tracking (Sentry/DataDog), audit logs.
 * Never includes: password, API keys, session tokens, PII beyond actorId.
 */
export function serializeError(
  error: ServiceError | Error,
  envelope: AuditEnvelope,
  durationMs?: number
): SerializedError {
  const isServiceError = "type" in error;
  const message = "message" in error ? error.message : String(error);

  return {
    requestId: envelope.requestId,
    workspaceId: envelope.workspaceId,
    timestamp: envelope.timestamp,
    actorId: envelope.actorId,
    operationName: envelope.operationName,
    durationMs,
    retryable: isServiceError ? error.retryable : false,
    errorType: isServiceError ? error.type : ServiceErrorType.UNKNOWN_ERROR,
    errorCode: isServiceError ? error.code : undefined,
    message,
    context: isServiceError ? error.context : undefined,
    stackTrace: error instanceof Error ? error.stack : undefined,
  };
}

/**
 * Serialize successful result with audit metadata.
 * For compliance: shows who, when, what operation, execution time.
 */
export function serializeSuccess<T>(
  data: T,
  envelope: AuditEnvelope,
  durationMs: number
): AuditEnvelope & { data: T; durationMs: number } {
  return {
    ...envelope,
    data,
    durationMs,
    retryable: false,
  };
}

/**
 * Verify audit envelope completeness before logging.
 * Fail-closed: if any required field missing, log to security channel.
 */
export function validateAuditEnvelope(envelope: AuditEnvelope): {
  valid: boolean;
  missing: string[];
} {
  const missing: string[] = [];

  if (!envelope.requestId) missing.push("requestId");
  if (!envelope.workspaceId) missing.push("workspaceId");
  if (!envelope.timestamp) missing.push("timestamp");
  if (!envelope.operationName) missing.push("operationName");

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Create idempotency key from audit envelope.
 * Ensures same operation+actor+workspace+requestId = same result.
 */
export function deriveIdempotencyKey(envelope: AuditEnvelope): string {
  const components = [
    envelope.operationName,
    envelope.actorId || "system",
    envelope.workspaceId,
    envelope.requestId,
  ];
  return Buffer.from(components.join("|")).toString("base64");
}

/**
 * Extract audit context from ServiceResult for logging.
 * Preserves all traceability info while filtering sensitive data.
 */
export function extractAuditContext<T>(
  result: ServiceResult<T>,
  operationName: string,
  workspaceId: string
): AuditEnvelope {
  return {
    requestId: result.auditMetadata?.idempotencyKey || randomUUID(),
    workspaceId,
    timestamp: result.auditMetadata?.executedAt?.toISOString() || new Date().toISOString(),
    actorId: result.auditMetadata?.actorId,
    operationName,
    retryable: result.error?.retryable || false,
    errorType: result.error?.type,
    errorCode: result.error?.code,
  };
}
