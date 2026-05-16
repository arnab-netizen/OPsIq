/**
 * PHASE I10.5: ERROR NORMALIZATION ENFORCEMENT
 *
 * Mandatory: All runtime errors are normalized with:
 * - Classification (VALIDATION, AUTH, PERMISSION, DB, etc.)
 * - Severity (INFO, WARNING, ERROR, CRITICAL)
 * - Retryability (RETRYABLE, NOT_RETRYABLE, RETRYABLE_WITH_BACKOFF)
 * - Operator-safe messages (sensitive data removed)
 * - Internal diagnostics (for ops team only)
 *
 * Error boundaries:
 * 1. API request handlers: requestEnforcer catches all errors
 * 2. Queue job processors: withEnforcedQueueWorker catches all errors
 * 3. Internal operations: wrap in try-catch with appropriate error factory
 *
 * Raw Error throws are only acceptable for:
 * - Programming assertions (e.g., unreachable code)
 * - Internal invariant violations (should never happen in production)
 * - Use: throw new Error("Unreachable: ...") with comment explaining why
 */

import { RuntimeError, createInfrastructureError } from "../runtime-errors";
import { requestContext } from "../request-context";

/**
 * MANDATORY: Normalize any unknown error to RuntimeError
 *
 * Use in try-catch blocks to ensure all errors are classified.
 *
 * Example:
 * ```
 * try {
 *   await riskyOperation();
 * } catch (error) {
 *   throw normalizeError(error, "Operation failed");
 * }
 * ```
 */
export function normalizeError(error: unknown, operation: string): RuntimeError {
  // If already a RuntimeError, return as-is
  if (error instanceof RuntimeError) {
    return error;
  }

  // Extract message from Error
  let message = "Unknown error";
  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === "string") {
    message = error;
  }

  // Normalize to infrastructure error (safest classification for unknown)
  return createInfrastructureError(
    `${operation}: ${message}`,
    requestContext.createErrorContext()
  );
}

/**
 * Error normalization audit checklist:
 *
 * ✓ All API route handlers use enforceRequest() which catches/normalizes all errors
 * ✓ All queue job processors use withEnforcedQueueWorker() which catches/normalizes
 * ✓ All service layer methods wrap external API calls with appropriate error factory
 * ✓ All database operations wrap errors with createDBError(is_transient)
 * ✓ All queue operations wrap errors with createQueueError(is_transient)
 * ✓ All external service calls wrap errors with createExternalServiceError()
 * ✓ All input validation wraps errors with createValidationError()
 * ✓ All authentication failures wrap with createAuthError()
 * ✓ All permission denials wrap with createPermissionError()
 * ✓ All rate limit violations wrap with createRateLimitError()
 *
 * Internal programming errors (should never reach user):
 * - Use throw new Error() only for: assertion failures, unreachable code
 * - These are caught by enforceRequest/withEnforcedQueueWorker and normalized
 * - Normalized as INFRASTRUCTURE error with CRITICAL severity
 */

// Error boundary enforcement checklist:
// 1. src/app/api/**/route.ts - all route handlers (enforceRequest wrapper)
// 2. src/lib/enforced-queue-worker.ts - all queue processors (withEnforcedQueueWorker)
// 3. src/services/** - public service methods (return RuntimeError or throw)
//
// All public API responses MUST include:
// - error_code: ERR_CLASSIFICATION_NNN format
// - classification: RuntimeErrorClassification
// - http_status: appropriate HTTP status
// - correlation_id: for end-to-end tracing
// - message: operator-safe (no stack traces, credentials, or internal paths)
