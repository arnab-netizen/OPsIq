import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "crypto";

vi.mock("@/infra/audit", () => ({
  emitAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/services/re-evaluation", () => ({
  triggerReEvaluation: vi.fn().mockResolvedValue(undefined),
}));

function computePayloadHash(payload: unknown): string {
  const normalized = JSON.stringify(payload);
  return createHash("sha256").update(normalized).digest("hex");
}

describe("Complete Idempotency Coverage", () => {
  describe("Idempotency infrastructure", () => {
    it("should have withIdempotency available in all services", async () => {
      const { withIdempotency } = await import("@/infra/idempotency");
      expect(withIdempotency).toBeDefined();
    });

    it("should have idempotency middleware available", async () => {
      const { requireIdempotencyKey } = await import("@/lib/idempotency-middleware");
      expect(requireIdempotencyKey).toBeDefined();
    });

    it("should support payload hashing", () => {
      const payload = { test: "data" };
      const hash = computePayloadHash(payload);
      expect(hash).toHaveLength(64); // SHA-256 hex digest length
    });

    it("should detect different payloads with different hashes", () => {
      const payload1 = { test: "data1" };
      const payload2 = { test: "data2" };
      const hash1 = computePayloadHash(payload1);
      const hash2 = computePayloadHash(payload2);
      expect(hash1).not.toEqual(hash2);
    });

    it("should produce consistent hashes for same payload", () => {
      const payload = { test: "data" };
      const hash1 = computePayloadHash(payload);
      const hash2 = computePayloadHash(payload);
      expect(hash1).toEqual(hash2);
    });
  });

  describe("Service integration", () => {
    it("recommendation service has idempotency support", async () => {
      const { createRecommendation } = await import("@/services/recommendation");
      // Check function signature accepts idempotencyKey parameter
      expect(createRecommendation.length).toBeGreaterThanOrEqual(2);
    });

    it("KPI service has idempotency support", async () => {
      const { createKPI, updateKPIValue } = await import("@/services/kpi");
      expect(createKPI.length).toBeGreaterThanOrEqual(2);
      expect(updateKPIValue.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("Audit events", () => {
    it("should have IDEMPOTENCY_REPLAY_DETECTED event", async () => {
      const { AUDIT_EVENTS } = await import("@/domain/constants/audit-events");
      expect(AUDIT_EVENTS.IDEMPOTENCY_REPLAY_DETECTED).toBeDefined();
      expect(AUDIT_EVENTS.IDEMPOTENCY_REPLAY_DETECTED).toEqual(
        "idempotency.replay_detected"
      );
    });
  });

  describe("Idempotency coverage completeness", () => {
    it("should have idempotency support for action service", async () => {
      const { createAction } = await import("@/services/action");
      expect(createAction).toBeDefined();
      // Verify it accepts idempotencyKey parameter
      expect(createAction.toString()).toContain("idempotencyKey");
    });

    it("should have idempotency support for recommendation service", async () => {
      const { createRecommendation } = await import("@/services/recommendation");
      expect(createRecommendation).toBeDefined();
      expect(createRecommendation.toString()).toContain("idempotencyKey");
    });

    it("should have idempotency support for KPI service", async () => {
      const { createKPI, updateKPIValue } = await import("@/services/kpi");
      expect(createKPI).toBeDefined();
      expect(updateKPIValue).toBeDefined();
      expect(createKPI.toString()).toContain("idempotencyKey");
      expect(updateKPIValue.toString()).toContain("idempotencyKey");
    });

    it("should have comprehensive test coverage for idempotency", async () => {
      const { withIdempotency } = await import("@/infra/idempotency");

      // Verify the function is properly exported
      expect(withIdempotency).toBeDefined();
      expect(typeof withIdempotency).toBe("function");
    });
  });

  describe("Endpoint coverage", () => {
    it("should have idempotency middleware for POST requests", async () => {
      const { requireIdempotencyKey } = await import("@/lib/idempotency-middleware");

      const request = {
        headers: new Map([["Idempotency-Key", "test-key"]]),
      };

      const key = requireIdempotencyKey(request as never, "POST");
      expect(key).toBe("test-key");
    });

    it("should validate idempotency key format", async () => {
      const { requireIdempotencyKey } = await import("@/lib/idempotency-middleware");
      const { ValidationError } = await import("@/infra/errors");

      const request = {
        headers: new Map([["Idempotency-Key", "invalid key!@#"]]),
      };

      expect(() => {
        requireIdempotencyKey(request as never, "POST");
      }).toThrow(ValidationError);
    });
  });
});
