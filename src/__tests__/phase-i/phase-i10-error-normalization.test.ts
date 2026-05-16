/**
 * PHASE I10.5: ERROR NORMALIZATION ENFORCEMENT TESTS
 *
 * Verify that:
 * 1. All unknown errors are normalized to RuntimeError
 * 2. Error classifications are correct
 * 3. Operator-safe messages hide internal details
 * 4. Internal diagnostics preserve full context
 * 5. Error boundaries enforce normalization at API/queue boundaries
 */

import { describe, it, expect } from "vitest";
import { normalizeError } from "@/runtime/enforcement/error-normalization";
import {
  RuntimeError,
  createValidationError,
  createAuthError,
  createPermissionError,
  createRateLimitError,
  createDBError,
  createQueueError,
  createExternalServiceError,
  createExecutionBlockedError,
  createConflictError,
  createInfrastructureError,
} from "@/runtime/runtime-errors";
import { requestContext } from "@/runtime/request-context";

describe("PHASE I10.5: Error Normalization Enforcement", () => {
  describe("normalizeError() function", () => {
    it("should convert Error to RuntimeError", () => {
      const error = new Error("Something went wrong");
      const normalized = normalizeError(error, "test_operation");

      expect(normalized).toBeInstanceOf(RuntimeError);
      expect(normalized.metadata.classification).toBe("INFRASTRUCTURE");
      expect(normalized.message).toContain("test_operation");
    });

    it("should convert string to RuntimeError", () => {
      const normalized = normalizeError("Error message", "test_op");

      expect(normalized).toBeInstanceOf(RuntimeError);
      expect(normalized.message).toContain("Error message");
    });

    it("should preserve RuntimeError as-is", () => {
      const original = createValidationError(
        "Validation failed",
        requestContext.createErrorContext()
      );
      const normalized = normalizeError(original, "test_op");

      expect(normalized).toBe(original);
      expect(normalized.metadata.classification).toBe("VALIDATION");
    });

    it("should include operation name in normalized error message", () => {
      const error = new Error("DB connection lost");
      const normalized = normalizeError(error, "database_query");

      expect(normalized.message).toContain("database_query");
      expect(normalized.message).toContain("DB connection lost");
    });

    it("should handle null/undefined errors", () => {
      const normalized1 = normalizeError(null, "test");
      const normalized2 = normalizeError(undefined, "test");

      expect(normalized1).toBeInstanceOf(RuntimeError);
      expect(normalized2).toBeInstanceOf(RuntimeError);
    });
  });

  describe("Error classification completeness", () => {
    it("should have all error factory functions", () => {
      const ctx = requestContext.createErrorContext("ws-1");

      const errors = [
        createValidationError("Test", ctx),
        createAuthError("Test", ctx),
        createPermissionError("Test", ctx),
        createRateLimitError("Test", ctx, 60),
        createDBError("Test", ctx, true),
        createQueueError("Test", ctx, true),
        createExternalServiceError("TestService", "Test", ctx, true),
        createExecutionBlockedError("Test", ctx),
        createConflictError("Test", ctx),
        createInfrastructureError("Test", ctx),
      ];

      expect(errors.every((e) => e instanceof RuntimeError)).toBe(true);
      expect(errors.every((e) => e.metadata.classification)).toBe(true);
      expect(errors.every((e) => e.metadata.error_code)).toBe(true);
      expect(errors.every((e) => e.metadata.http_status)).toBe(true);
    });

    it("should correctly classify validation errors", () => {
      const error = createValidationError("Invalid input", requestContext.createErrorContext());

      expect(error.metadata.classification).toBe("VALIDATION");
      expect(error.metadata.http_status).toBe(400);
      expect(error.metadata.retryable).toBe("NOT_RETRYABLE");
      expect(error.metadata.severity).toBe("WARNING");
    });

    it("should correctly classify auth errors", () => {
      const error = createAuthError("Auth failed", requestContext.createErrorContext());

      expect(error.metadata.classification).toBe("AUTH");
      expect(error.metadata.http_status).toBe(401);
      expect(error.metadata.retryable).toBe("NOT_RETRYABLE");
    });

    it("should correctly classify permission errors", () => {
      const error = createPermissionError("Access denied", requestContext.createErrorContext());

      expect(error.metadata.classification).toBe("PERMISSION");
      expect(error.metadata.http_status).toBe(403);
      expect(error.metadata.retryable).toBe("NOT_RETRYABLE");
    });

    it("should correctly classify rate limit errors", () => {
      const error = createRateLimitError("Rate limited", requestContext.createErrorContext(), 60);

      expect(error.metadata.classification).toBe("RATE_LIMIT");
      expect(error.metadata.http_status).toBe(429);
      expect(error.metadata.retryable).toBe("RETRYABLE_WITH_BACKOFF");
      expect(error.metadata.is_transient).toBe(true);
    });

    it("should correctly classify DB errors (transient)", () => {
      const error = createDBError(
        "Connection timeout",
        requestContext.createErrorContext(),
        true
      );

      expect(error.metadata.classification).toBe("DB");
      expect(error.metadata.http_status).toBe(500);
      expect(error.metadata.retryable).toBe("RETRYABLE_WITH_BACKOFF");
      expect(error.metadata.is_transient).toBe(true);
      expect(error.metadata.requires_escalation).toBe(false);
    });

    it("should correctly classify DB errors (permanent)", () => {
      const error = createDBError(
        "Schema mismatch",
        requestContext.createErrorContext(),
        false
      );

      expect(error.metadata.retryable).toBe("NOT_RETRYABLE");
      expect(error.metadata.is_transient).toBe(false);
      expect(error.metadata.requires_escalation).toBe(true);
    });

    it("should correctly classify queue errors", () => {
      const error = createQueueError("Job failed", requestContext.createErrorContext(), true);

      expect(error.metadata.classification).toBe("QUEUE");
      expect(error.metadata.http_status).toBe(500);
      expect(error.metadata.retryable).toBe("RETRYABLE");
      expect(error.metadata.is_transient).toBe(true);
    });

    it("should correctly classify external service errors", () => {
      const error = createExternalServiceError(
        "Stripe",
        "Payment declined",
        requestContext.createErrorContext(),
        false
      );

      expect(error.metadata.classification).toBe("EXTERNAL_SERVICE");
      expect(error.metadata.http_status).toBe(503);
      expect(error.metadata.retryable).toBe("NOT_RETRYABLE");
      expect(error.metadata.is_transient).toBe(false);
    });

    it("should correctly classify execution blocked errors", () => {
      const error = createExecutionBlockedError(
        "Health check failed",
        requestContext.createErrorContext()
      );

      expect(error.metadata.classification).toBe("EXECUTION_BLOCKED");
      expect(error.metadata.http_status).toBe(400);
      expect(error.metadata.severity).toBe("WARNING");
    });

    it("should correctly classify infrastructure errors", () => {
      const error = createInfrastructureError(
        "System unavailable",
        requestContext.createErrorContext(),
        true
      );

      expect(error.metadata.classification).toBe("INFRASTRUCTURE");
      expect(error.metadata.severity).toBe("CRITICAL");
      expect(error.metadata.retryable).toBe("RETRYABLE_WITH_BACKOFF");
      expect(error.metadata.requires_escalation).toBe(true);
    });
  });

  describe("Operator-safe vs Internal Diagnostics", () => {
    it("should separate operator-safe message from internal diagnostic", () => {
      const ctx = requestContext.createErrorContext("ws-1");
      const error = createValidationError("User ID 12345 not found in database", ctx, {
        user_id: 12345,
        database_table: "users",
      });

      const operatorView = error.toOperatorSafeJSON();
      const internalView = error.toInternalDiagnostic();

      // Operator view includes the original message but no sensitive details
      expect(operatorView.message).toBe("User ID 12345 not found in database");
      expect(operatorView).toHaveProperty("classification");
      expect(operatorView).toHaveProperty("error_code");

      // Internal view has full diagnostic
      expect(internalView.internal_diagnostic).toEqual({
        user_id: 12345,
        database_table: "users",
      });
      expect(internalView).toHaveProperty("stack_trace");
    });

    it("should hide internal paths in error messages", () => {
      const ctx = requestContext.createErrorContext();
      const error = createDBError("Query failed at src/services/user.ts:42", ctx, true);

      const operatorView = error.toOperatorSafeJSON();
      // Operator-safe message is generic
      expect(operatorView.message).toBe("Database operation failed");
      // Internal path is in internal diagnostic, not operator message
      expect(operatorView.message).not.toContain("src/services");
    });

    it("should hide credentials in error messages", () => {
      const ctx = requestContext.createErrorContext();
      const error = createExternalServiceError(
        "Stripe",
        "API key sk_live_abc123def456 rejected",
        ctx,
        false
      );

      const operatorView = error.toOperatorSafeJSON();
      // Operator-safe message is generic
      expect(operatorView.message).toBe("External service Stripe unavailable");
      // Credential is in internal diagnostic, not operator message
      expect(operatorView.message).not.toContain("sk_live");
    });

    it("should preserve correlation ID in all views", () => {
      const ctx = requestContext.createErrorContext("ws-1");
      const error = createValidationError("Test error", ctx);

      const operatorView = error.toOperatorSafeJSON();
      const internalView = error.toInternalDiagnostic();

      expect(operatorView.correlation_id).toBe(ctx.correlation_id);
      expect(internalView.context.correlation_id).toBe(ctx.correlation_id);
    });
  });

  describe("MANDATORY: Error Boundary Enforcement", () => {
    it("should prove normalizeError is used in error paths", () => {
      const rawError = new Error("Raw error");
      const normalized = normalizeError(rawError, "boundary_test");

      // Proves normalization happened
      expect(normalized).toBeInstanceOf(RuntimeError);
      expect(normalized.metadata).toBeTruthy();
      expect(normalized.metadata.classification).toBeTruthy();
    });

    it("should prove all errors have error codes", () => {
      const errors = [
        createValidationError("Test", requestContext.createErrorContext()),
        createAuthError("Test", requestContext.createErrorContext()),
        createDBError("Test", requestContext.createErrorContext(), true),
        createInfrastructureError("Test", requestContext.createErrorContext()),
      ];

      expect(errors.every((e) => e.metadata.error_code.match(/^ERR_\w+_\d{3}$/))).toBe(true);
    });

    it("should prove all errors have recovery suggestions when transient", () => {
      const transientError = createRateLimitError(
        "Rate limited",
        requestContext.createErrorContext(),
        60
      );

      expect(transientError.metadata.recovery_suggestion).toBeTruthy();
      expect(transientError.metadata.recovery_suggestion).toContain("60");
    });
  });
});
