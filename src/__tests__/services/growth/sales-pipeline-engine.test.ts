/**
 * Unit Tests: Sales Pipeline Engine Service (non-DB paths)
 *
 * Tests validation errors, pipeline metrics, revenue forecasting,
 * pipeline health analysis, and opportunity identification.
 * Validates workspace scoping and fail-closed behavior.
 *
 * DB-backed paths (recordDeal success, progressDeal success, listDeals) are
 * covered in the DB test file.
 * Validation-only paths for recordDeal/progressDeal (errors thrown before DB
 * touch) are tested here.
 */

import { describe, it, expect } from "vitest";
import { SalesPipelineEngine } from "@/services/growth/sales-pipeline-engine";
import { DealStage } from "@/domain/growth/growth-engines";
import { ValidationError } from "@/infra/errors";

describe("Sales Pipeline Engine Service", () => {
  const workspaceId = "ws-test-1";
  const otherWorkspaceId = "ws-other";

  describe("recordDeal — validation paths (no DB required)", () => {
    it("rejects empty workspaceId with ValidationError", async () => {
      await expect(
        SalesPipelineEngine.recordDeal("", "actor-1", {
          companyName: "Acme Corp",
          stage: DealStage.QUALIFIED,
          value: 100000,
          currency: "USD",
          probability: 0.5,
          expectedCloseDate: new Date(),
        })
      ).rejects.toThrow(ValidationError);
    });

    it("rejects missing companyName with ValidationError", async () => {
      await expect(
        SalesPipelineEngine.recordDeal(workspaceId, "actor-1", {
          companyName: "",
          stage: DealStage.QUALIFIED,
          value: 100000,
          currency: "USD",
          probability: 0.5,
          expectedCloseDate: new Date(),
        })
      ).rejects.toThrow(ValidationError);
    });

    it("rejects negative deal value with ValidationError", async () => {
      await expect(
        SalesPipelineEngine.recordDeal(workspaceId, "actor-1", {
          companyName: "Acme Corp",
          stage: DealStage.QUALIFIED,
          value: -1000,
          currency: "USD",
          probability: 0.5,
          expectedCloseDate: new Date(),
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("progressDeal — validation paths (no DB required)", () => {
    it("rejects empty workspaceId with ValidationError", async () => {
      await expect(
        SalesPipelineEngine.progressDeal("", "actor-1", "deal-123", DealStage.PROPOSAL)
      ).rejects.toThrow(ValidationError);
    });

    it("rejects empty dealId with ValidationError", async () => {
      await expect(
        SalesPipelineEngine.progressDeal(workspaceId, "actor-1", "", DealStage.PROPOSAL)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("calculatePipelineMetrics", () => {
    const deals = [
      {
        id: "deal-1",
        workspaceId,
        companyName: "Company A",
        stage: DealStage.PROPOSAL,
        value: 100000,
        currency: "USD",
        probability: 0.65,
        expectedCloseDate: new Date(),
      },
      {
        id: "deal-2",
        workspaceId,
        companyName: "Company B",
        stage: DealStage.QUALIFIED,
        value: 50000,
        currency: "USD",
        probability: 0.15,
        expectedCloseDate: new Date(),
      },
      {
        id: "deal-3",
        workspaceId,
        companyName: "Company C",
        stage: DealStage.CLOSED_WON,
        value: 75000,
        currency: "USD",
        probability: 1.0,
        expectedCloseDate: new Date(),
      },
    ];

    it("calculates pipeline metrics correctly", () => {
      const result = SalesPipelineEngine.calculatePipelineMetrics(workspaceId, deals);

      expect(result.workspaceId).toBe(workspaceId);
      expect(result.totalPipeline).toBeGreaterThan(0);
      expect(result.avgDealSize).toBeGreaterThan(0);
      expect(result.winRate).toBeDefined();
    });

    it("groups deals by stage", () => {
      const result = SalesPipelineEngine.calculatePipelineMetrics(workspaceId, deals);

      expect(result.dealsByStage[DealStage.PROPOSAL]).toBeDefined();
      expect(result.dealsByStage[DealStage.QUALIFIED]).toBeDefined();
      expect(result.dealsByStage[DealStage.CLOSED_WON]).toBeDefined();
    });

    it("calculates win rate from closed deals", () => {
      const result = SalesPipelineEngine.calculatePipelineMetrics(workspaceId, deals);

      expect(result.winRate).toBeGreaterThan(0);
      expect(result.winRate).toBeLessThanOrEqual(1);
    });

    it("returns fail-closed zeros for missing workspaceId", () => {
      const result = SalesPipelineEngine.calculatePipelineMetrics("", deals);

      expect(result.totalPipeline).toBe(0);
      expect(result.avgDealSize).toBe(0);
    });
  });

  describe("forecastPipelineRevenue", () => {
    const deals = [
      {
        id: "deal-1",
        workspaceId,
        companyName: "Company A",
        stage: DealStage.PROPOSAL,
        value: 100000,
        currency: "USD",
        probability: 0.8,
        expectedCloseDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      },
      {
        id: "deal-2",
        workspaceId,
        companyName: "Company B",
        stage: DealStage.NEGOTIATION,
        value: 50000,
        currency: "USD",
        probability: 0.6,
        expectedCloseDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
      },
    ];

    it("forecasts revenue for multiple months", () => {
      const result = SalesPipelineEngine.forecastPipelineRevenue(workspaceId, deals, 3);

      expect(result.totalForecast).toBeGreaterThan(0);
      expect(result.forecastByMonth[1]).toBeDefined();
      expect(result.forecastByMonth[2]).toBeDefined();
      expect(result.forecastByMonth[3]).toBeDefined();
    });

    it("deal closing in 15 days appears in month 1", () => {
      const result = SalesPipelineEngine.forecastPipelineRevenue(workspaceId, deals, 2);
      expect(result.forecastByMonth[1]).toBeGreaterThan(0);
    });

    it("reduces confidence with longer forecast horizon", () => {
      const r1 = SalesPipelineEngine.forecastPipelineRevenue(workspaceId, deals, 1);
      const r2 = SalesPipelineEngine.forecastPipelineRevenue(workspaceId, deals, 6);
      expect(r1.confidence).toBeGreaterThan(r2.confidence);
    });

    it("returns fail-closed zeros for missing workspaceId", () => {
      const result = SalesPipelineEngine.forecastPipelineRevenue("", deals, 3);
      expect(result.totalForecast).toBe(0);
      expect(result.confidence).toBe(0);
    });

    it("returns fail-closed zeros for empty deals", () => {
      const result = SalesPipelineEngine.forecastPipelineRevenue(workspaceId, [], 3);
      expect(result.totalForecast).toBe(0);
    });
  });

  describe("analyzePipelineHealth", () => {
    const healthyPipeline = {
      workspaceId,
      month: "2025-01",
      totalPipeline: 500000,
      dealsByStage: {
        [DealStage.PROSPECT]: 5,
        [DealStage.QUALIFIED]: 3,
        [DealStage.PROPOSAL]: 2,
        [DealStage.NEGOTIATION]: 1,
        [DealStage.CLOSED_WON]: 2,
        [DealStage.CLOSED_LOST]: 1,
      },
      winRate: 0.67,
      avgDealSize: 75000,
      salesCycle: 30,
    };

    it("calculates health score between 0 and 100", () => {
      const result = SalesPipelineEngine.analyzePipelineHealth(workspaceId, healthyPipeline);
      expect(result.healthScore).toBeGreaterThan(0);
      expect(result.healthScore).toBeLessThanOrEqual(100);
    });

    it("identifies bottleneck stage", () => {
      const result = SalesPipelineEngine.analyzePipelineHealth(workspaceId, healthyPipeline);
      expect(result.bottleneckStage).toBeDefined();
    });

    it("returns pipeline efficiency metric", () => {
      const result = SalesPipelineEngine.analyzePipelineHealth(workspaceId, healthyPipeline);
      expect(result.metrics.pipelineEfficiency).toBeGreaterThan(0);
    });

    it("provides improvement recommendation for low win rate", () => {
      const unhealthy = { ...healthyPipeline, winRate: 0.15 };
      const result = SalesPipelineEngine.analyzePipelineHealth(workspaceId, unhealthy);
      expect(result.recommendation.toLowerCase()).toContain("improve");
    });

    it("returns fail-closed zeros for missing workspaceId", () => {
      const result = SalesPipelineEngine.analyzePipelineHealth("", healthyPipeline);
      expect(result.healthScore).toBe(0);
    });

    it("classifies FAST velocity when salesCycle < 20 days", () => {
      const fast = { ...healthyPipeline, salesCycle: 15 };
      expect(SalesPipelineEngine.analyzePipelineHealth(workspaceId, fast).metrics.dealVelocity).toBe("FAST");
    });

    it("classifies SLOW velocity when salesCycle > 45 days", () => {
      const slow = { ...healthyPipeline, salesCycle: 60 };
      expect(SalesPipelineEngine.analyzePipelineHealth(workspaceId, slow).metrics.dealVelocity).toBe("SLOW");
    });
  });

  describe("identifyOpportunities", () => {
    const deals = [
      {
        id: "deal-1",
        workspaceId,
        companyName: "Large Deal",
        stage: DealStage.PROSPECT,
        value: 200000,
        currency: "USD",
        probability: 0.1,
        expectedCloseDate: new Date(),
      },
      {
        id: "deal-2",
        workspaceId,
        companyName: "Closing Soon",
        stage: DealStage.NEGOTIATION,
        value: 75000,
        currency: "USD",
        probability: 0.85,
        expectedCloseDate: new Date(),
      },
      {
        id: "deal-3",
        workspaceId,
        companyName: "At Risk",
        stage: DealStage.PROPOSAL,
        value: 50000,
        currency: "USD",
        probability: 0.1,
        expectedCloseDate: new Date(),
      },
    ];

    it("identifies high-value early-stage deals (>$50k in PROSPECT/QUALIFIED)", () => {
      const result = SalesPipelineEngine.identifyOpportunities(workspaceId, deals);
      expect(result.highValueEarlyStageDeals.length).toBeGreaterThan(0);
    });

    it("identifies at-risk deals (probability <20%)", () => {
      const result = SalesPipelineEngine.identifyOpportunities(workspaceId, deals);
      expect(result.atRiskDeals.length).toBeGreaterThan(0);
    });

    it("identifies deals closing soon (NEGOTIATION/PROPOSAL)", () => {
      const result = SalesPipelineEngine.identifyOpportunities(workspaceId, deals);
      expect(result.closingDeals.length).toBeGreaterThan(0);
    });

    it("returns fail-closed empty arrays for missing workspaceId", () => {
      const result = SalesPipelineEngine.identifyOpportunities("", deals);
      expect(result.highValueEarlyStageDeals).toEqual([]);
      expect(result.atRiskDeals).toEqual([]);
    });
  });

  describe("calculatePipelineMetrics — cross-workspace isolation", () => {
    it("deals tagged to ws-1 are excluded from ws-2 pipeline computation", () => {
      const deals = [
        {
          id: "deal-1",
          workspaceId,
          companyName: "Company A",
          stage: DealStage.QUALIFIED,
          value: 100000,
          currency: "USD",
          probability: 0.5,
          expectedCloseDate: new Date(),
        },
      ];

      const ws1 = SalesPipelineEngine.calculatePipelineMetrics(workspaceId, deals);
      const ws2 = SalesPipelineEngine.calculatePipelineMetrics(otherWorkspaceId, deals);

      expect(ws1.workspaceId).toBe(workspaceId);
      expect(ws2.workspaceId).toBe(otherWorkspaceId);
      expect(ws1.totalPipeline).toBeGreaterThan(0);
      expect(ws2.totalPipeline).toBe(0);
    });
  });
});
