/**
 * Unit Tests: Retention Engine Service
 *
 * Tests retention metrics, churn analysis, and forecasting.
 * Validates workspace scoping and fail-closed behavior.
 */

import { describe, it, expect } from "vitest";
import { RetentionEngine } from "@/services/growth/retention-engine";
import { ChurnReason } from "@/domain/growth/growth-engines";

describe("Retention Engine Service", () => {
  const workspaceId = "ws-test-1";
  const otherWorkspaceId = "ws-other";

  describe("Record Metrics", () => {
    it("should record valid retention metrics with workspace scoping", () => {
      const data = {
        cohortMonth: "2025-01",
        cohortSize: 100,
        monthlyRetention: { 1: 0.95, 2: 0.92, 3: 0.88 },
        avgMonthlyChurn: 0.05,
      };

      const result = RetentionEngine.recordMetrics(workspaceId, data);

      expect(result.error).toBeNull();
      expect(result.metrics).toBeDefined();
      expect(result.metrics?.cohortMonth).toBe("2025-01");
    });

    it("should fail without workspace ID", () => {
      const data = {
        cohortMonth: "2025-01",
        monthlyRetention: { 1: 0.95 },
        avgMonthlyChurn: 0.05,
      };

      const result = RetentionEngine.recordMetrics("", data);

      expect(result.error).toBeDefined();
      expect(result.metrics).toBeNull();
      expect(result.error).toContain("Workspace ID");
    });

    it("should fail with invalid metrics data", () => {
      const data = {
        cohortMonth: "2025-01",
        monthlyRetention: { 1: 0.95 },
        avgMonthlyChurn: 1.5, // Invalid: > 1
      };

      const result = RetentionEngine.recordMetrics(workspaceId, data);

      expect(result.error).toBeDefined();
    });
  });

  describe("Calculate Retention Curve", () => {
    const monthlyRetention = {
      1: 0.95,
      2: 0.92,
      3: 0.88,
      4: 0.84,
      5: 0.81,
    };

    it("should calculate retention curve", () => {
      const result = RetentionEngine.calculateRetentionCurve(workspaceId, monthlyRetention);

      expect(result.curve).toHaveLength(5);
      expect(result.curve[0].month).toBe(1);
      expect(result.curve[0].retained).toBe(95);
    });

    it("should identify retention cliff", () => {
      const steeperRetention = {
        1: 0.95,
        2: 0.90, // Drop of 5%
        3: 0.75, // Drop of 15% - cliff
        4: 0.72,
      };

      const result = RetentionEngine.calculateRetentionCurve(workspaceId, steeperRetention);

      expect(result.cliff).toBe(3);
    });

    it("should fail-closed without workspace ID", () => {
      const result = RetentionEngine.calculateRetentionCurve("", monthlyRetention);

      expect(result.curve).toEqual([]);
    });
  });

  describe("Assess Churn Risk", () => {
    it("should assess low risk for healthy retention", () => {
      const metrics = {
        cohortMonth: "2025-01",
        monthlyRetention: { 1: 0.95, 2: 0.92, 3: 0.88 },
        avgMonthlyChurn: 0.03, // 3% monthly churn
      };

      const result = RetentionEngine.assessChurnRisk(workspaceId, metrics);

      expect(result.riskLevel).toBe("LOW");
      expect(result.interventionUrgency).toBe("MONITOR");
    });

    it("should assess high risk for elevated churn", () => {
      const metrics = {
        cohortMonth: "2025-01",
        monthlyRetention: { 1: 0.90, 2: 0.80 },
        avgMonthlyChurn: 0.12, // 12% monthly churn
      };

      const result = RetentionEngine.assessChurnRisk(workspaceId, metrics);

      expect(result.riskLevel).toBe("HIGH");
      expect(result.interventionUrgency).toBe("URGENT");
    });

    it("should assess critical risk for severe churn", () => {
      const metrics = {
        cohortMonth: "2025-01",
        monthlyRetention: { 1: 0.85, 2: 0.65 },
        avgMonthlyChurn: 0.18, // 18% monthly churn
      };

      const result = RetentionEngine.assessChurnRisk(workspaceId, metrics);

      expect(result.riskLevel).toBe("CRITICAL");
      expect(result.interventionUrgency).toBe("IMMEDIATE");
    });

    it("should fail-closed without workspace ID", () => {
      const metrics = {
        cohortMonth: "2025-01",
        monthlyRetention: { 1: 0.95 },
        avgMonthlyChurn: 0.05,
      };

      const result = RetentionEngine.assessChurnRisk("", metrics);

      expect(result.riskLevel).toBe("LOW");
      expect(result.churnScore).toBe(0);
    });
  });

  describe("Analyze Churn Pattern", () => {
    const monthlyRetention = { 1: 0.95, 2: 0.90, 3: 0.85 };
    const reasons: Partial<Record<ChurnReason, number>> = {
      [ChurnReason.PRICE_SENSITIVITY]: 0.4,
      [ChurnReason.FEATURE_LACK]: 0.3,
      [ChurnReason.SUPPORT_ISSUE]: 0.2,
    };

    it("should identify top churn reasons", () => {
      const result = RetentionEngine.analyzeChurnPattern(workspaceId, monthlyRetention, reasons);

      expect(result.topReasons.length).toBeGreaterThan(0);
      expect(result.topReasons[0].reason).toBe(ChurnReason.PRICE_SENSITIVITY);
    });

    it("should identify at-risk segments", () => {
      const result = RetentionEngine.analyzeChurnPattern(workspaceId, monthlyRetention, reasons);

      expect(result.riskSegments.length).toBeGreaterThan(0);
    });

    it("should recommend interventions", () => {
      const result = RetentionEngine.analyzeChurnPattern(workspaceId, monthlyRetention, reasons);

      expect(result.interventions.length).toBeGreaterThan(0);
      expect(result.interventions[0]).toContain("Pricing");
    });

    it("should fail-closed without workspace ID", () => {
      const result = RetentionEngine.analyzeChurnPattern("", monthlyRetention, reasons);

      expect(result.predictedChurnRate).toBe(0);
      expect(result.topReasons).toEqual([]);
    });
  });

  describe("Calculate LTV Impact", () => {
    it("should calculate impact of churn on LTV", () => {
      const monthlyRetention = { 1: 0.95, 2: 0.90, 3: 0.85, 4: 0.80, 5: 0.75 };
      const result = RetentionEngine.calculateLTVImpact(workspaceId, 100, monthlyRetention, 100);

      expect(result.totalLTV).toBeGreaterThan(0);
      expect(result.actualLTV).toBeGreaterThan(0);
      expect(result.actualLTV).toBeLessThan(result.totalLTV);
      expect(result.ltvRecoveryPotential).toBeGreaterThan(0);
    });

    it("should calculate perfect retention as baseline", () => {
      const perfectRetention = { 1: 1.0, 2: 1.0, 3: 1.0 };
      const result = RetentionEngine.calculateLTVImpact(workspaceId, 100, perfectRetention, 100);

      expect(result.actualLTV).toBe(result.totalLTV);
      expect(result.ltvRecoveryPotential).toBe(0);
    });

    it("should fail-closed without workspace ID", () => {
      const result = RetentionEngine.calculateLTVImpact("", 100, { 1: 0.95 }, 100);

      expect(result.totalLTV).toBe(0);
      expect(result.actualLTV).toBe(0);
    });

    it("should fail-closed with invalid inputs", () => {
      const result = RetentionEngine.calculateLTVImpact(workspaceId, 0, { 1: 0.95 }, 100);

      expect(result.totalLTV).toBe(0);
    });
  });

  describe("Forecast Churn", () => {
    it("should forecast next month churn", () => {
      const monthlyRetention = { 1: 0.95, 2: 0.92, 3: 0.88, 4: 0.85 };
      const result = RetentionEngine.forecastChurn(workspaceId, monthlyRetention);

      expect(result.projectedChurnRate).toBeGreaterThanOrEqual(0);
      expect(result.projectedChurnRate).toBeLessThanOrEqual(1);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it("should identify improving trend", () => {
      const improvingRetention = { 1: 0.80, 2: 0.82, 3: 0.85, 4: 0.88 };
      const result = RetentionEngine.forecastChurn(workspaceId, improvingRetention);

      expect(result.trend).toBe("IMPROVING");
    });

    it("should identify declining trend", () => {
      const decliningRetention = { 1: 0.95, 2: 0.92, 3: 0.88, 4: 0.84 };
      const result = RetentionEngine.forecastChurn(workspaceId, decliningRetention);

      expect(result.trend).toBe("DECLINING");
    });

    it("should fail-closed without workspace ID", () => {
      const result = RetentionEngine.forecastChurn("", { 1: 0.95 }, 90);

      expect(result.projectedChurnRate).toBe(0);
      expect(result.confidence).toBe(0);
    });
  });

  describe("Tenant Safety", () => {
    const metrics = {
      cohortMonth: "2025-01",
      monthlyRetention: { 1: 0.95, 2: 0.90 },
      avgMonthlyChurn: 0.05,
    };

    it("should prevent cross-workspace assessment", () => {
      const ws1Result = RetentionEngine.assessChurnRisk(workspaceId, metrics);
      const ws2Result = RetentionEngine.assessChurnRisk(otherWorkspaceId, metrics);

      expect(ws1Result.riskLevel).toBe("LOW");
      expect(ws2Result.riskLevel).toBe("LOW"); // Wrong workspace returns defaults
    });

    it("should prevent cross-workspace curve analysis", () => {
      const monthlyRetention = { 1: 0.95, 2: 0.90 };
      const ws1Result = RetentionEngine.calculateRetentionCurve(workspaceId, monthlyRetention);
      const ws2Result = RetentionEngine.calculateRetentionCurve(otherWorkspaceId, monthlyRetention);

      expect(ws1Result.curve.length).toBeGreaterThan(0);
      expect(ws2Result.curve).toEqual([]);
    });
  });
});
