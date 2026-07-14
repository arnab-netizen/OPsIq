/**
 * Unit Tests: Retention Engine Service (non-DB paths)
 *
 * Tests retention metrics validation, churn analysis, LTV modeling, and forecasting.
 * Validates workspace scoping and fail-closed behavior on pure functions.
 *
 * DB-backed paths (recordMetrics success, listCohorts) are covered in the DB test file.
 * Validation-only paths for recordMetrics (errors thrown before DB touch) are tested here.
 */

import { describe, it, expect } from "vitest";
import { RetentionEngine } from "@/services/growth/retention-engine";
import { ChurnReason } from "@/domain/growth/growth-engines";
import { ValidationError } from "@/infra/errors";

describe("Retention Engine Service", () => {
  const workspaceId = "ws-test-1";

  describe("recordMetrics — validation paths (no DB required)", () => {
    it("rejects empty workspaceId with ValidationError", async () => {
      await expect(
        RetentionEngine.recordMetrics("", "actor-1", {
          cohortMonth: "2025-01",
          monthlyRetention: { 1: 0.95 },
          avgMonthlyChurn: 0.05,
        })
      ).rejects.toThrow(ValidationError);
    });

    it("rejects invalid avgMonthlyChurn (>1) with ValidationError", async () => {
      await expect(
        RetentionEngine.recordMetrics(workspaceId, "actor-1", {
          cohortMonth: "2025-01",
          monthlyRetention: { 1: 0.95 },
          avgMonthlyChurn: 1.5,
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("calculateRetentionCurve", () => {
    const monthlyRetention = { 1: 0.95, 2: 0.92, 3: 0.88, 4: 0.84, 5: 0.81 };

    it("calculates retention curve correctly", () => {
      const result = RetentionEngine.calculateRetentionCurve(workspaceId, monthlyRetention);

      expect(result.curve).toHaveLength(5);
      expect(result.curve[0].month).toBe(1);
      expect(result.curve[0].retained).toBe(95);
    });

    it("identifies the cliff month (largest single-month drop)", () => {
      const steeperRetention = { 1: 0.95, 2: 0.90, 3: 0.75, 4: 0.72 };

      const result = RetentionEngine.calculateRetentionCurve(workspaceId, steeperRetention);

      expect(result.cliff).toBe(3);
    });

    it("returns empty curve for missing workspaceId (fail-closed)", () => {
      const result = RetentionEngine.calculateRetentionCurve("", monthlyRetention);

      expect(result.curve).toEqual([]);
    });
  });

  describe("assessChurnRisk", () => {
    it("assesses LOW risk for healthy retention", () => {
      const metrics = {
        cohortMonth: "2025-01",
        monthlyRetention: { 1: 0.95, 2: 0.92, 3: 0.88 },
        avgMonthlyChurn: 0.03,
      };

      const result = RetentionEngine.assessChurnRisk(workspaceId, metrics);

      expect(result.riskLevel).toBe("LOW");
      expect(result.interventionUrgency).toBe("MONITOR");
    });

    it("assesses HIGH risk for elevated churn (10–15%)", () => {
      const metrics = {
        cohortMonth: "2025-01",
        monthlyRetention: { 1: 0.90, 2: 0.80 },
        avgMonthlyChurn: 0.12,
      };

      const result = RetentionEngine.assessChurnRisk(workspaceId, metrics);

      expect(result.riskLevel).toBe("HIGH");
      expect(result.interventionUrgency).toBe("URGENT");
    });

    it("assesses CRITICAL risk for severe churn (≥15%)", () => {
      const metrics = {
        cohortMonth: "2025-01",
        monthlyRetention: { 1: 0.85, 2: 0.65 },
        avgMonthlyChurn: 0.18,
      };

      const result = RetentionEngine.assessChurnRisk(workspaceId, metrics);

      expect(result.riskLevel).toBe("CRITICAL");
      expect(result.interventionUrgency).toBe("IMMEDIATE");
    });

    it("returns safe defaults for empty workspaceId (fail-closed)", () => {
      const metrics = {
        cohortMonth: "2025-01",
        monthlyRetention: { 1: 0.95 },
        avgMonthlyChurn: 0.05,
      };

      const result = RetentionEngine.assessChurnRisk("", metrics);

      expect(result.riskLevel).toBe("LOW");
      expect(result.churnScore).toBe(0);
    });

    it("returns safe defaults when metrics.workspaceId doesn't match caller (cross-workspace block)", () => {
      const metrics = {
        workspaceId: "ws-different",
        cohortMonth: "2025-01",
        monthlyRetention: { 1: 0.95 },
        avgMonthlyChurn: 0.18,
      };

      const result = RetentionEngine.assessChurnRisk(workspaceId, metrics);

      expect(result.riskLevel).toBe("LOW");
      expect(result.churnScore).toBe(0);
    });
  });

  describe("analyzeChurnPattern", () => {
    const monthlyRetention = { 1: 0.95, 2: 0.90, 3: 0.85 };
    const reasons: Partial<Record<ChurnReason, number>> = {
      [ChurnReason.PRICE_SENSITIVITY]: 0.4,
      [ChurnReason.FEATURE_LACK]: 0.3,
      [ChurnReason.SUPPORT_ISSUE]: 0.2,
    };

    it("identifies top churn reasons ranked by weight", () => {
      const result = RetentionEngine.analyzeChurnPattern(workspaceId, monthlyRetention, reasons);

      expect(result.topReasons.length).toBeGreaterThan(0);
      expect(result.topReasons[0].reason).toBe(ChurnReason.PRICE_SENSITIVITY);
    });

    it("identifies at-risk segments", () => {
      const result = RetentionEngine.analyzeChurnPattern(workspaceId, monthlyRetention, reasons);

      expect(result.riskSegments.length).toBeGreaterThan(0);
    });

    it("recommends interventions based on top reason", () => {
      const result = RetentionEngine.analyzeChurnPattern(workspaceId, monthlyRetention, reasons);

      expect(result.interventions.length).toBeGreaterThan(0);
      expect(result.interventions[0]).toContain("Pricing");
    });

    it("returns empty analysis for missing workspaceId (fail-closed)", () => {
      const result = RetentionEngine.analyzeChurnPattern("", monthlyRetention, reasons);

      expect(result.predictedChurnRate).toBe(0);
      expect(result.topReasons).toEqual([]);
    });
  });

  describe("calculateLTVImpact", () => {
    it("calculates the impact of churn on LTV", () => {
      const monthlyRetention = { 1: 0.95, 2: 0.90, 3: 0.85, 4: 0.80, 5: 0.75 };
      const result = RetentionEngine.calculateLTVImpact(workspaceId, 100, monthlyRetention, 100);

      expect(result.totalLTV).toBeGreaterThan(0);
      expect(result.actualLTV).toBeGreaterThan(0);
      expect(result.actualLTV).toBeLessThan(result.totalLTV);
      expect(result.ltvRecoveryPotential).toBeGreaterThan(0);
    });

    it("returns zero ltvRecoveryPotential for perfect retention", () => {
      const perfectRetention = { 1: 1.0, 2: 1.0, 3: 1.0 };
      const result = RetentionEngine.calculateLTVImpact(workspaceId, 100, perfectRetention, 100);

      expect(result.actualLTV).toBe(result.totalLTV);
      expect(result.ltvRecoveryPotential).toBe(0);
    });

    it("returns zeros for missing workspaceId (fail-closed)", () => {
      const result = RetentionEngine.calculateLTVImpact("", 100, { 1: 0.95 }, 100);

      expect(result.totalLTV).toBe(0);
      expect(result.actualLTV).toBe(0);
    });

    it("returns zeros for zero cohortSize (fail-closed)", () => {
      const result = RetentionEngine.calculateLTVImpact(workspaceId, 0, { 1: 0.95 }, 100);

      expect(result.totalLTV).toBe(0);
    });
  });

  describe("forecastChurn", () => {
    it("forecasts next-month churn within valid bounds", () => {
      const monthlyRetention = { 1: 0.95, 2: 0.92, 3: 0.88, 4: 0.85 };
      const result = RetentionEngine.forecastChurn(workspaceId, monthlyRetention);

      expect(result.projectedChurnRate).toBeGreaterThanOrEqual(0);
      expect(result.projectedChurnRate).toBeLessThanOrEqual(1);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it("identifies improving trend", () => {
      const improvingRetention = { 1: 0.80, 2: 0.82, 3: 0.85, 4: 0.88 };
      const result = RetentionEngine.forecastChurn(workspaceId, improvingRetention);

      expect(result.trend).toBe("IMPROVING");
    });

    it("identifies declining trend", () => {
      const decliningRetention = { 1: 0.95, 2: 0.92, 3: 0.88, 4: 0.84 };
      const result = RetentionEngine.forecastChurn(workspaceId, decliningRetention);

      expect(result.trend).toBe("DECLINING");
    });

    it("returns zeros for missing workspaceId (fail-closed)", () => {
      const result = RetentionEngine.forecastChurn("", { 1: 0.95 }, 90);

      expect(result.projectedChurnRate).toBe(0);
      expect(result.confidence).toBe(0);
    });
  });
});
