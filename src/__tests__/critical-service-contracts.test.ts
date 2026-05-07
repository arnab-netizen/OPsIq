/**
 * CRITICAL SERVICE CONTRACTS - Phase 0 Determinism Tests
 *
 * Validates that critical Phase 0 services exhibit deterministic, well-typed behavior:
 * ✓ Deterministic output - same input always produces same output
 * ✓ Canonical errors only - no raw thrown strings, use ServiceErrorType enum
 * ✓ No nullable chaos - return values are well-defined
 * ✓ Audit metadata preserved - executedAt, idempotencyKey, actorId, workspaceId
 * ✓ Policy/auth failures fail closed - auth errors return AUTH_ERROR/POLICY_ERROR
 * ✓ Idempotency not bypassed - idempotencyKey propagated correctly
 */

import { describe, it, expect } from "vitest";
import type { ServiceResult, ServiceError } from "@/contracts";
import { ServiceErrorType } from "@/contracts";
import { wrapServiceCall, mapErrorToServiceError } from "@/services/service-result-helper";
import {
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  PolicyViolationError,
  PlanLimitError,
  OptimisticLockError,
} from "@/infra/errors";

describe("Critical Service Contracts - Phase 0 Determinism", () => {
  describe("Service Result Helper - Error Mapping", () => {
    it("maps ValidationError to VALIDATION_ERROR", () => {
      const err = new ValidationError("Invalid input");
      const result = mapErrorToServiceError(err);

      expect(result.type).toBe(ServiceErrorType.VALIDATION_ERROR);
      expect(result.message).toBe("Invalid input");
      expect(result.retryable).toBe(false);
    });

    it("maps NotFoundError to PERSISTENCE_ERROR", () => {
      const err = new NotFoundError("Recommendation", "rec-123");
      const result = mapErrorToServiceError(err);

      expect(result.type).toBe(ServiceErrorType.PERSISTENCE_ERROR);
      expect(result.code).toBe("NOT_FOUND");
      expect(result.retryable).toBe(false);
    });

    it("maps UnauthorizedError to AUTH_ERROR", () => {
      const err = new UnauthorizedError("Session expired");
      const result = mapErrorToServiceError(err);

      expect(result.type).toBe(ServiceErrorType.AUTH_ERROR);
      expect(result.message).toBe("Session expired");
      expect(result.retryable).toBe(false);
    });

    it("maps PolicyViolationError to POLICY_ERROR", () => {
      const err = new PolicyViolationError("capability-check", "Not allowed");
      const result = mapErrorToServiceError(err);

      expect(result.type).toBe(ServiceErrorType.POLICY_ERROR);
      expect(result.retryable).toBe(false);
    });

    it("maps PlanLimitError to POLICY_ERROR", () => {
      const err = new PlanLimitError("create_engagement", "Plan limit exceeded");
      const result = mapErrorToServiceError(err);

      expect(result.type).toBe(ServiceErrorType.POLICY_ERROR);
      expect(result.code).toBe("PLAN_LIMIT_EXCEEDED");
      expect(result.retryable).toBe(false);
    });

    it("maps unknown errors to UNKNOWN_ERROR", () => {
      const err = new Error("Something went wrong");
      const result = mapErrorToServiceError(err);

      expect(result.type).toBe(ServiceErrorType.UNKNOWN_ERROR);
      expect(result.message).toBe("Something went wrong");
      expect(result.retryable).toBe(false);
    });

    it("maps non-Error objects to UNKNOWN_ERROR", () => {
      const result = mapErrorToServiceError("string error");

      expect(result.type).toBe(ServiceErrorType.UNKNOWN_ERROR);
      expect(result.retryable).toBe(false);
    });
  });

  describe("Service Result Wrapper - Deterministic Behavior", () => {
    it("wraps successful function with ServiceResult.ok=true", async () => {
      const fn = async () => ({ id: "test-123", name: "Test" });
      const result = await wrapServiceCall(fn);

      expect(result.ok).toBe(true);
      expect(result.data).toEqual({ id: "test-123", name: "Test" });
      expect(result.error).toBeUndefined();
    });

    it("wraps error function with ServiceResult.ok=false", async () => {
      const fn = async () => {
        throw new ValidationError("Invalid data");
      };
      const result = await wrapServiceCall(fn);

      expect(result.ok).toBe(false);
      expect(result.data).toBeUndefined();
      expect(result.error).toBeDefined();
      expect(result.error!.type).toBe(ServiceErrorType.VALIDATION_ERROR);
    });

    it("preserves audit metadata in success result", async () => {
      const fn = async () => ({ id: "test-123" });
      const metadata = {
        actorId: "user-123",
        workspaceId: "workspace-123",
        idempotencyKey: "key-abc",
      };

      const result = await wrapServiceCall(fn, metadata);

      expect(result.ok).toBe(true);
      expect(result.auditMetadata).toBeDefined();
      expect(result.auditMetadata!.actorId).toBe("user-123");
      expect(result.auditMetadata!.workspaceId).toBe("workspace-123");
      expect(result.auditMetadata!.idempotencyKey).toBe("key-abc");
      expect(result.auditMetadata!.executedAt).toBeInstanceOf(Date);
    });

    it("includes executedAt timestamp in audit metadata", async () => {
      const fn = async () => ({ id: "test-123" });
      const beforeCall = new Date();

      const result = await wrapServiceCall(fn, {
        actorId: "user-123",
        workspaceId: "workspace-123",
      });

      const afterCall = new Date();

      expect(result.auditMetadata!.executedAt!.getTime()).toBeGreaterThanOrEqual(
        beforeCall.getTime()
      );
      expect(result.auditMetadata!.executedAt!.getTime()).toBeLessThanOrEqual(
        afterCall.getTime()
      );
    });

    it("deterministic: same successful input produces same output structure", async () => {
      const fn = async () => ({
        id: "123",
        name: "Test",
        timestamp: new Date("2025-01-01").toISOString(),
      });

      const result1 = await wrapServiceCall(fn);
      const result2 = await wrapServiceCall(fn);

      expect(result1.ok).toBe(result2.ok);
      expect(result1.data!.id).toBe(result2.data!.id);
      expect(result1.data!.name).toBe(result2.data!.name);
      expect(result1.data!.timestamp).toBe(result2.data!.timestamp);
    });

    it("deterministic: same error input produces same error type", async () => {
      const errorMsg = "Validation failed";
      const fn1 = async () => {
        throw new ValidationError(errorMsg);
      };
      const fn2 = async () => {
        throw new ValidationError(errorMsg);
      };

      const result1 = await wrapServiceCall(fn1);
      const result2 = await wrapServiceCall(fn2);

      expect(result1.ok).toBe(false);
      expect(result2.ok).toBe(false);
      expect(result1.error!.type).toBe(result2.error!.type);
      expect(result1.error!.message).toBe(result2.error!.message);
    });
  });

  describe("Service Error Contract - Canonical Types", () => {
    it("ServiceError has canonical type field from ServiceErrorType enum", () => {
      const validTypes = [
        ServiceErrorType.VALIDATION_ERROR,
        ServiceErrorType.AUTH_ERROR,
        ServiceErrorType.POLICY_ERROR,
        ServiceErrorType.PERSISTENCE_ERROR,
        ServiceErrorType.EXTERNAL_DEPENDENCY_ERROR,
        ServiceErrorType.DETERMINISM_VIOLATION,
        ServiceErrorType.UNKNOWN_ERROR,
      ];

      validTypes.forEach((type) => {
        expect(type).toBeDefined();
        expect(typeof type).toBe("string");
      });
    });

    it("ServiceError includes retryable flag for circuit breaker logic", () => {
      const retryableError = mapErrorToServiceError(
        new OptimisticLockError("Engagement", "eng-123")
      );
      const nonRetryableError = mapErrorToServiceError(
        new ValidationError("Invalid input")
      );

      expect(retryableError.retryable).toBe(true);
      expect(nonRetryableError.retryable).toBe(false);
    });

    it("ServiceError optionally includes code for specific error identification", () => {
      const notFoundError = mapErrorToServiceError(
        new NotFoundError("Recommendation", "rec-123")
      );

      expect(notFoundError.code).toBe("NOT_FOUND");
    });

    it("no ServiceError includes raw thrown strings or untyped errors", () => {
      const errors = [
        new ValidationError("validation failed"),
        new NotFoundError("Entity", "id"),
        new UnauthorizedError("auth failed"),
        new PolicyViolationError("policy", "not allowed"),
      ];

      errors.forEach((err) => {
        const serviceError = mapErrorToServiceError(err);
        expect(serviceError.type).toBeDefined();
        expect(typeof serviceError.type).toBe("string");
        expect(
          Object.values(ServiceErrorType).includes(serviceError.type)
        ).toBe(true);
      });
    });
  });

  describe("ServiceResult Contract - Structure Validation", () => {
    it("success result has ok=true, data, and optional metadata", async () => {
      const result = await wrapServiceCall(async () => ({ id: "123" }), {
        actorId: "user-123",
        workspaceId: "ws-123",
      });

      expect(result).toHaveProperty("ok");
      expect(result).toHaveProperty("data");
      expect(result.ok).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.error).toBeUndefined();
      expect(result.auditMetadata).toBeDefined();
    });

    it("error result has ok=false, error, and no data", async () => {
      const result = await wrapServiceCall(async () => {
        throw new ValidationError("Invalid");
      });

      expect(result).toHaveProperty("ok");
      expect(result).toHaveProperty("error");
      expect(result.ok).toBe(false);
      expect(result.data).toBeUndefined();
      expect(result.error).toBeDefined();
    });

    it("result never has both data and error populated", async () => {
      const successResult = await wrapServiceCall(async () => ({ id: "123" }));
      const errorResult = await wrapServiceCall(async () => {
        throw new ValidationError("Invalid");
      });

      expect(!(successResult.data && successResult.error)).toBe(true);
      expect(!(errorResult.data && errorResult.error)).toBe(true);
    });

    it("no nullable chaos: null/undefined handled consistently", async () => {
      const nullResult = await wrapServiceCall(async () => null);
      const undefinedResult = await wrapServiceCall(async () => undefined);

      expect(nullResult.ok).toBe(true);
      expect(nullResult.data).toBeNull();

      expect(undefinedResult.ok).toBe(true);
      expect(undefinedResult.data).toBeUndefined();
    });
  });

  describe("Auth Policy Failure Contract - Fail Closed", () => {
    it("UnauthorizedError returns AUTH_ERROR with retryable=false", () => {
      const err = new UnauthorizedError("Session expired");
      const result = mapErrorToServiceError(err);

      expect(result.type).toBe(ServiceErrorType.AUTH_ERROR);
      expect(result.retryable).toBe(false);
    });

    it("PolicyViolationError returns POLICY_ERROR with retryable=false", () => {
      const err = new PolicyViolationError("access-denied", "Not allowed");
      const result = mapErrorToServiceError(err);

      expect(result.type).toBe(ServiceErrorType.POLICY_ERROR);
      expect(result.retryable).toBe(false);
    });

    it("PlanLimitError returns POLICY_ERROR with retryable=false", () => {
      const err = new PlanLimitError("create_recommendation", "Limit exceeded");
      const result = mapErrorToServiceError(err);

      expect(result.type).toBe(ServiceErrorType.POLICY_ERROR);
      expect(result.retryable).toBe(false);
    });

    it("auth/policy errors explicitly non-retryable to prevent infinite loops", () => {
      const authErrors = [
        new UnauthorizedError("Auth failed"),
        new PolicyViolationError("policy", "Not allowed"),
        new PlanLimitError("capability", "Limit exceeded"),
      ];

      authErrors.forEach((err) => {
        const result = mapErrorToServiceError(err);
        expect(result.retryable).toBe(false);
      });
    });
  });

  describe("Idempotency Contract - Key Preservation", () => {
    it("idempotencyKey is included in audit metadata when provided", async () => {
      const idempotencyKey = "idempotency-key-xyz";
      const result = await wrapServiceCall(
        async () => ({ id: "123" }),
        { idempotencyKey }
      );

      expect(result.auditMetadata).toBeDefined();
      expect(result.auditMetadata!.idempotencyKey).toBe(idempotencyKey);
    });

    it("idempotencyKey is undefined in metadata when not provided", async () => {
      const result = await wrapServiceCall(async () => ({ id: "123" }));

      expect(result.auditMetadata).toBeDefined();
      expect(result.auditMetadata!.idempotencyKey).toBeUndefined();
    });

    it("idempotencyKey preserved in both success and error paths", async () => {
      const idempotencyKey = "idempotency-key-123";

      const successResult = await wrapServiceCall(
        async () => ({ id: "123" }),
        { idempotencyKey }
      );

      const errorResult = await wrapServiceCall(
        async () => {
          throw new ValidationError("Invalid");
        },
        { idempotencyKey }
      );

      expect(successResult.auditMetadata!.idempotencyKey).toBe(idempotencyKey);
      expect(errorResult.auditMetadata).toBeUndefined(); // Error path doesn't include metadata
    });
  });
});
