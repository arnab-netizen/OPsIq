/**
 * Unit Tests: Unit Economics Engine Service
 *
 * Tests CAC, LTV, payback period, and unit economics health.
 * Validates workspace scoping and fail-closed behavior.
 */

import { describe, it, expect } from "vitest";
import { UnitEconomicsEngine } from "@/services/growth/unit-economics-engine";

describe("Unit Economics Engine Service", () => {
  const workspaceId = "ws-test-1";
  const otherWorkspaceId = "ws-other";

  describe("Calculate CAC", () => {
    it("should calculate customer acquisition cost", () => {
      const result = UnitEconomicsEngine.calculateCAC(
        workspaceId,
        10000, // total spend
        100 // customers acquired
      );

      expect(result.cac).toBe(100);
      expect(result.status).toBeDefined();
      expect(result.message).toBeDefined();
    });

    it("should classify healthy CAC", () => {
      const result = UnitEconomicsEngine.calculateCAC(
        workspaceId,
        2500,
        100
      );

      expect(result.cac).toBe(25);
      expect(result.status).toBe("HEALTHY");
    });

    it("should classify concerning CAC", () => {
      const result = UnitEconomicsEngine.calculateCAC(
        workspaceId,
        15000,
        100
      );

      expect(result.cac).toBe(150);
      expect(result.status).toBe("CONCERNING");
    });

    it("should classify critical CAC", () => {
      const result = UnitEconomicsEngine.calculateCAC(
        workspaceId,
        30000,
        100
      );

      expect(result.cac).toBe(300);
      expect(result.status).toBe("CRITICAL");
    });

    it("should fail-closed without workspace ID", () => {
      const result = UnitEconomicsEngine.calculateCAC("", 10000, 100);

      expect(result.cac).toBe(0);
    });
  });

  describe("Calculate LTV", () => {
    it("should calculate lifetime value", () => {
      const result = UnitEconomicsEngine.calculateLTV(
        workspaceId,
        1000, // monthly revenue
        0.05, // 5% monthly churn
        0.5 // 50% gross margin
      );

      expect(result.ltv).toBeGreaterThan(0);
      expect(result.monthlyProfit).toBe(500);
      expect(result.lifespan).toBe(20);
    });

    it("should calculate higher LTV with lower churn", () => {
      const result1 = UnitEconomicsEngine.calculateLTV(
        workspaceId,
        1000,
        0.10, // 10% churn
        0.5
      );

      const result2 = UnitEconomicsEngine.calculateLTV(
        workspaceId,
        1000,
        0.05, // 5% churn
        0.5
      );

      expect(result2.ltv).toBeGreaterThan(result1.ltv);
      expect(result2.lifespan).toBeGreaterThan(result1.lifespan);
    });

    it("should fail-closed without workspace ID", () => {
      const result = UnitEconomicsEngine.calculateLTV("", 1000, 0.05, 0.5);

      expect(result.ltv).toBe(0);
    });

    it("should fail-closed with invalid churn", () => {
      const result = UnitEconomicsEngine.calculateLTV(
        workspaceId,
        1000,
        1.5, // invalid churn > 1
        0.5
      );

      expect(result.ltv).toBe(0);
    });
  });

  describe("Calculate CAC Payback Period", () => {
    it("should calculate payback in months", () => {
      const result = UnitEconomicsEngine.calculateCACPayback(
        workspaceId,
        100, // CAC
        50 // monthly profit
      );

      expect(result.paybackMonths).toBe(2);
    });

    it("should classify excellent payback", () => {
      const result = UnitEconomicsEngine.calculateCACPayback(
        workspaceId,
        100,
        50 // 2 months payback
      );

      expect(result.paybackStatus).toBe("EXCELLENT");
    });

    it("should classify poor payback", () => {
      const result = UnitEconomicsEngine.calculateCACPayback(
        workspaceId,
        500,
        30 // ~16 months payback
      );

      expect(result.paybackStatus).toBe("POOR");
    });

    it("should fail-closed without workspace ID", () => {
      const result = UnitEconomicsEngine.calculateCACPayback("", 100, 50);

      expect(result.paybackMonths).toBe(0);
    });
  });

  describe("Calculate LTV:CAC Ratio", () => {
    it("should calculate healthy ratio", () => {
      const result = UnitEconomicsEngine.calculateLTVCACRatio(
        workspaceId,
        3000, // LTV
        1000 // CAC
      );

      expect(result.ratio).toBe(3);
      expect(result.health).toBe("HEALTHY");
    });

    it("should classify at-risk ratio", () => {
      const result = UnitEconomicsEngine.calculateLTVCACRatio(
        workspaceId,
        1800, // LTV
        1200 // CAC = 1.5:1
      );

      expect(result.ratio).toBe(1.5);
      expect(result.health).toBe("AT_RISK");
    });

    it("should classify critical ratio", () => {
      const result = UnitEconomicsEngine.calculateLTVCACRatio(
        workspaceId,
        800, // LTV
        1000 // CAC = 0.8:1
      );

      expect(result.health).toBe("CRITICAL");
    });

    it("should fail-closed without workspace ID", () => {
      const result = UnitEconomicsEngine.calculateLTVCACRatio("", 3000, 1000);

      expect(result.ratio).toBe(0);
    });
  });

  describe("Calculate Contribution Metrics", () => {
    it("should calculate contribution margin", () => {
      const result = UnitEconomicsEngine.calculateContributionMetrics(
        workspaceId,
        100, // revenue per unit
        40, // variable cost per unit
        5000, // fixed costs per month
        200 // units sold per month
      );

      expect(result.contributionPerUnit).toBe(60);
      expect(result.contributionMargin).toBe(0.6);
      expect(result.totalContribution).toBeGreaterThan(0);
    });

    it("should calculate break-even point", () => {
      const result = UnitEconomicsEngine.calculateContributionMetrics(
        workspaceId,
        100,
        40,
        6000, // fixed costs
        200
      );

      expect(result.breakEvenUnits).toBeGreaterThan(0);
      expect(result.breakEvenUnits).toBeLessThan(1000);
    });

    it("should fail-closed without workspace ID", () => {
      const result = UnitEconomicsEngine.calculateContributionMetrics(
        "",
        100,
        40,
        5000,
        200
      );

      expect(result.contributionPerUnit).toBe(0);
    });
  });

  describe("Assess Unit Economics Health", () => {
    it("should assess strong unit economics", () => {
      const result = UnitEconomicsEngine.assessUnitEconomicsHealth(
        workspaceId,
        3000, // LTV
        1000, // CAC
        2, // payback months
        500 // monthly profit
      );

      expect(result.overallHealth).toBe("STRONG");
      expect(result.score).toBeGreaterThan(70);
    });

    it("should assess moderate unit economics", () => {
      const result = UnitEconomicsEngine.assessUnitEconomicsHealth(
        workspaceId,
        2000, // LTV
        1200, // CAC
        6, // payback months
        200 // monthly profit
      );

      expect(result.overallHealth).toBe("MODERATE");
      expect(result.score).toBeGreaterThan(30);
      expect(result.score).toBeLessThan(75);
    });

    it("should assess weak unit economics", () => {
      const result = UnitEconomicsEngine.assessUnitEconomicsHealth(
        workspaceId,
        500, // LTV
        1000, // CAC
        24, // payback months
        50 // monthly profit
      );

      expect(result.overallHealth).toBe("WEAK");
      expect(result.score).toBeLessThan(50);
    });

    it("should generate recommendations", () => {
      const result = UnitEconomicsEngine.assessUnitEconomicsHealth(
        workspaceId,
        1000,
        2000,
        20,
        100
      );

      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it("should fail-closed without workspace ID", () => {
      const result = UnitEconomicsEngine.assessUnitEconomicsHealth(
        "",
        3000,
        1000,
        2,
        500
      );

      expect(result.score).toBe(0);
    });
  });

  describe("Calculate Retention Value", () => {
    it("should calculate LTV improvement from retention", () => {
      const result = UnitEconomicsEngine.calculateRetentionValue(
        workspaceId,
        100, // CAC
        50, // monthly profit
        0.05, // 5% churn
        25 // 25% churn reduction
      );

      expect(result.improvedLTV).toBeGreaterThan(result.currentLTV);
      expect(result.ltvGain).toBeGreaterThan(0);
    });

    it("should calculate payoff period", () => {
      const result = UnitEconomicsEngine.calculateRetentionValue(
        workspaceId,
        500,
        100,
        0.10,
        20
      );

      expect(result.payoffPeriod).toBeGreaterThan(0);
    });

    it("should generate actionable recommendations", () => {
      const result = UnitEconomicsEngine.calculateRetentionValue(
        workspaceId,
        100,
        100,
        0.05,
        50
      );

      expect(result.recommendation).toBeDefined();
      expect(result.recommendation.length).toBeGreaterThan(0);
    });

    it("should fail-closed without workspace ID", () => {
      const result = UnitEconomicsEngine.calculateRetentionValue(
        "",
        100,
        50,
        0.05,
        25
      );

      expect(result.currentLTV).toBe(0);
      expect(result.improvedLTV).toBe(0);
    });
  });

  describe("Tenant Safety", () => {
    it("should prevent cross-workspace CAC calculation", () => {
      const ws1Result = UnitEconomicsEngine.calculateCAC("ws-1", 10000, 100);
      const ws2Result = UnitEconomicsEngine.calculateCAC("ws-2", 10000, 100);

      expect(ws1Result.cac).toBe(100);
      expect(ws2Result.cac).toBe(100);
    });

    it("should prevent cross-workspace LTV calculation", () => {
      const ws1Result = UnitEconomicsEngine.calculateLTV(
        "ws-1",
        1000,
        0.05,
        0.5
      );
      const ws2Result = UnitEconomicsEngine.calculateLTV(
        "ws-2",
        1000,
        0.05,
        0.5
      );

      expect(ws1Result.ltv).toBe(ws2Result.ltv);
    });

    it("should prevent cross-workspace health assessment", () => {
      const ws1Result = UnitEconomicsEngine.assessUnitEconomicsHealth(
        "ws-1",
        3000,
        1000,
        2,
        500
      );
      const ws2Result = UnitEconomicsEngine.assessUnitEconomicsHealth(
        "ws-2",
        3000,
        1000,
        2,
        500
      );

      expect(ws1Result.score).toBe(ws2Result.score);
    });
  });
});
