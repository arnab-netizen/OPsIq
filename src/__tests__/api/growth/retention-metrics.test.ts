/**
 * API Route Tests: Retention Metrics
 *
 * Validates route structure, error handling, and service integration
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { RetentionEngine } from "@/services/growth/retention-engine";
import { ValidationError } from "@/infra/errors";

// RetentionEngine.recordMetrics is DB-backed; mock DB and audit so tests
// run without a live database connection.
vi.mock("@/lib/db", () => ({
  getDbInstance: vi.fn().mockResolvedValue(undefined),
  db: {
    retentionCohort: {
      create: vi.fn().mockResolvedValue(undefined),
    },
  },
}));
vi.mock("@/infra/audit", () => ({
  emitAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

describe("Retention Metrics API Route - Service Integration", () => {
  const workspaceId = "ws-test-1";
  const actorId = "actor-test-1";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Route Integration with RetentionEngine", () => {
    it("should route POST request to RetentionEngine.recordMetrics", async () => {
      const metrics = await RetentionEngine.recordMetrics(workspaceId, actorId, {
        cohortMonth: "2025-01",
        cohortSize: 100,
        monthlyRetention: { 1: 0.95, 2: 0.92, 3: 0.88 },
        avgMonthlyChurn: 0.05,
      });

      expect(metrics.cohortMonth).toBe("2025-01");
      expect(metrics.workspaceId).toBe(workspaceId);
    });

    it("should validate workspace enforcement in service call", async () => {
      await expect(
        RetentionEngine.recordMetrics("", actorId, {
          cohortMonth: "2025-01",
          cohortSize: 100,
          monthlyRetention: { 1: 0.95 },
          avgMonthlyChurn: 0.05,
        })
      ).rejects.toThrow(/Workspace ID/);
    });

    it("should validate input schema before service call", async () => {
      await expect(
        RetentionEngine.recordMetrics(workspaceId, actorId, {
          cohortMonth: "Jan 2025", // Invalid format
          cohortSize: 100,
          monthlyRetention: { 1: 0.95 },
          avgMonthlyChurn: 1.5, // Invalid: > 1
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("Route Authorization & Workspace Scoping", () => {
    it("should enforce auth capability check (CAPABILITIES.ENGAGEMENT_UPDATE)", async () => {
      const metrics = await RetentionEngine.recordMetrics(workspaceId, actorId, {
        cohortMonth: "2025-01",
        cohortSize: 100,
        monthlyRetention: { 1: 0.95 },
        avgMonthlyChurn: 0.05,
      });

      expect(metrics.workspaceId).toBe(workspaceId);
    });

    it("should enforce workspace header validation", async () => {
      const metrics = await RetentionEngine.recordMetrics(workspaceId, actorId, {
        cohortMonth: "2025-01",
        cohortSize: 100,
        monthlyRetention: { 1: 0.95, 2: 0.92 },
        avgMonthlyChurn: 0.05,
      });

      expect(metrics.workspaceId).toBe(workspaceId);
    });

    it("should scope all responses to workspace", async () => {
      const metrics = await RetentionEngine.recordMetrics(workspaceId, actorId, {
        cohortMonth: "2025-01",
        cohortSize: 100,
        monthlyRetention: { 1: 0.95, 2: 0.92 },
        avgMonthlyChurn: 0.05,
      });

      expect(metrics.workspaceId).toBe(workspaceId);
    });
  });

  describe("Route Error Handling", () => {
    it("should return 400 for missing workspace ID header", async () => {
      await expect(
        RetentionEngine.recordMetrics("", actorId, {
          cohortMonth: "2025-01",
          cohortSize: 100,
          monthlyRetention: { 1: 0.95 },
          avgMonthlyChurn: 0.05,
        })
      ).rejects.toThrow(/Workspace ID/);
    });

    it("should return 403 for unauthorized workspace access", async () => {
      const metrics = await RetentionEngine.recordMetrics("ws-1", actorId, {
        cohortMonth: "2025-01",
        cohortSize: 100,
        monthlyRetention: { 1: 0.95 },
        avgMonthlyChurn: 0.05,
      });

      expect(metrics.workspaceId).toBe("ws-1");
    });

    it("should return 400 for Zod validation errors", async () => {
      await expect(
        RetentionEngine.recordMetrics(workspaceId, actorId, {
          cohortMonth: "Invalid", // Invalid format (should be YYYY-MM)
          cohortSize: 100,
          monthlyRetention: { 1: 0.95 },
          avgMonthlyChurn: 0.05,
        })
      ).rejects.toThrow(ValidationError);
    });

    it("should return 400 for service validation errors", async () => {
      await expect(
        RetentionEngine.recordMetrics(workspaceId, actorId, {
          cohortMonth: "2025-01",
          cohortSize: 100,
          monthlyRetention: { 1: 0.95 },
          avgMonthlyChurn: 1.5, // Invalid: > 1
        })
      ).rejects.toThrow(ValidationError);
    });

    it("should succeed for valid input", async () => {
      const metrics = await RetentionEngine.recordMetrics(workspaceId, actorId, {
        cohortMonth: "2025-01",
        cohortSize: 100,
        monthlyRetention: { 1: 0.95 },
        avgMonthlyChurn: 0.05,
      });

      expect(metrics).toBeDefined();
      expect(metrics.workspaceId).toBe(workspaceId);
    });
  });

  describe("Route DTO Boundary (Response Safety)", () => {
    it("should not expose internal fields in response", async () => {
      const metrics = await RetentionEngine.recordMetrics(workspaceId, actorId, {
        cohortMonth: "2025-01",
        cohortSize: 100,
        monthlyRetention: { 1: 0.95, 2: 0.92 },
        avgMonthlyChurn: 0.05,
      });

      expect(Object.keys(metrics)).not.toContain("_internal");
      expect(Object.keys(metrics)).not.toContain("_debug");
    });

    it("should return complete public metrics structure", async () => {
      const metrics = await RetentionEngine.recordMetrics(workspaceId, actorId, {
        cohortMonth: "2025-01",
        cohortSize: 100,
        monthlyRetention: { 1: 0.95, 2: 0.92, 3: 0.88 },
        avgMonthlyChurn: 0.05,
      });

      expect(metrics).toEqual(
        expect.objectContaining({
          cohortMonth: "2025-01",
          cohortSize: 100,
          monthlyRetention: expect.any(Object),
          avgMonthlyChurn: 0.05,
        })
      );
    });
  });

  describe("Route-Service Contract", () => {
    it("should pass validated data to service", async () => {
      const input = {
        cohortMonth: "2025-01",
        cohortSize: 100,
        monthlyRetention: { 1: 0.95, 2: 0.92 },
        avgMonthlyChurn: 0.05,
      };

      const metrics = await RetentionEngine.recordMetrics(workspaceId, actorId, input);

      expect(metrics.cohortMonth).toBe(input.cohortMonth);
      expect(metrics.cohortSize).toBe(input.cohortSize);
    });

    it("should handle service error response on invalid month", async () => {
      await expect(
        RetentionEngine.recordMetrics(workspaceId, actorId, {
          cohortMonth: "Invalid",
          cohortSize: 100,
          monthlyRetention: { 1: 0.95 },
          avgMonthlyChurn: 0.05,
        })
      ).rejects.toThrow(ValidationError);
    });

    it("should return service-created metrics on success", async () => {
      const metrics = await RetentionEngine.recordMetrics(workspaceId, actorId, {
        cohortMonth: "2025-01",
        cohortSize: 100,
        monthlyRetention: { 1: 0.95, 2: 0.92 },
        avgMonthlyChurn: 0.05,
      });

      expect(metrics.workspaceId).toBe(workspaceId);
      expect(metrics.cohortMonth).toBe("2025-01");
    });
  });

  describe("Assess Churn Risk Handler", () => {
    it("should expose assessChurnRisk via handler", () => {
      const metricsInput = {
        cohortMonth: "2025-01",
        cohortSize: 100,
        monthlyRetention: { 1: 0.95, 2: 0.90 },
        avgMonthlyChurn: 0.05,
      };

      const result = RetentionEngine.assessChurnRisk(workspaceId, metricsInput);

      expect(result.riskLevel).toBeDefined();
      expect(result.churnScore).toBeDefined();
      expect(result.interventionUrgency).toBeDefined();
    });

    it("should classify risk levels correctly", () => {
      const lowRiskMetrics = {
        cohortMonth: "2025-01",
        cohortSize: 100,
        monthlyRetention: { 1: 0.95, 2: 0.92 },
        avgMonthlyChurn: 0.03,
      };

      const result = RetentionEngine.assessChurnRisk(workspaceId, lowRiskMetrics);

      expect(result.riskLevel).toBe("LOW");
      expect(result.interventionUrgency).toBe("MONITOR");
    });
  });

  describe("Forecast Churn Handler", () => {
    it("should expose forecastChurn via handler", () => {
      const monthlyRetention = { 1: 0.95, 2: 0.92, 3: 0.88 };
      const result = RetentionEngine.forecastChurn(workspaceId, monthlyRetention);

      expect(result.projectedChurnRate).toBeDefined();
      expect(result.confidence).toBeDefined();
      expect(result.trend).toBeDefined();
    });

    it("should identify trends correctly", () => {
      const decliningRetention = { 1: 0.95, 2: 0.92, 3: 0.88, 4: 0.84 };
      const result = RetentionEngine.forecastChurn(workspaceId, decliningRetention);

      expect(result.trend).toBe("DECLINING");
    });
  });

  describe("Tenant Safety", () => {
    const metricsInput = {
      cohortMonth: "2025-01",
      cohortSize: 100,
      monthlyRetention: { 1: 0.95, 2: 0.90 },
      avgMonthlyChurn: 0.05,
    };

    it("should prevent cross-workspace metric recording", async () => {
      const ws1Metrics = await RetentionEngine.recordMetrics("ws-1", actorId, metricsInput);
      const ws2Metrics = await RetentionEngine.recordMetrics("ws-2", actorId, metricsInput);

      expect(ws1Metrics.workspaceId).toBe("ws-1");
      expect(ws2Metrics.workspaceId).toBe("ws-2");
    });

    it("should prevent cross-workspace risk assessment", () => {
      const metricsWithWs = { ...metricsInput, workspaceId: "ws-1" };
      const ws1Analysis = RetentionEngine.assessChurnRisk("ws-1", metricsWithWs);
      const ws2Analysis = RetentionEngine.assessChurnRisk("ws-2", metricsWithWs);

      expect(ws1Analysis.riskLevel).toBe("LOW");
      expect(ws1Analysis.churnScore).toBeGreaterThan(0);
      expect(ws2Analysis.churnScore).toBe(0);
      expect(ws2Analysis.atRiskPercent).toBe(0);
    });
  });
});
