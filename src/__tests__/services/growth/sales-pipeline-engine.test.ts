/**
 * Unit Tests: Sales Pipeline Engine Service
 *
 * Tests sales deal tracking, pipeline metrics, and revenue forecasting.
 * Validates workspace scoping and fail-closed behavior.
 */

import { describe, it, expect } from "vitest";
import { SalesPipelineEngine } from "@/services/growth/sales-pipeline-engine";
import { DealStage } from "@/domain/growth/growth-engines";

describe("Sales Pipeline Engine Service", () => {
  const workspaceId = "ws-test-1";
  const otherWorkspaceId = "ws-other";

  describe("Record Deal", () => {
    it("should record valid sales deal with workspace scoping", () => {
      const data = {
        companyName: "Acme Corp",
        stage: DealStage.QUALIFIED,
        value: 100000,
        currency: "USD",
        probability: 0.5,
        expectedCloseDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      };

      const result = SalesPipelineEngine.recordDeal(workspaceId, data);

      expect(result.error).toBeNull();
      expect(result.deal).toBeDefined();
      expect(result.deal?.companyName).toBe("Acme Corp");
      expect(result.deal?.workspaceId).toBe(workspaceId);
    });

    it("should fail without workspace ID", () => {
      const data = {
        companyName: "Acme Corp",
        stage: DealStage.PROPOSAL,
        value: 50000,
        currency: "USD",
      };

      const result = SalesPipelineEngine.recordDeal("", data);

      expect(result.error).toBeDefined();
      expect(result.deal).toBeNull();
      expect(result.error).toContain("Workspace ID");
    });

    it("should fail with invalid deal data", () => {
      const data = {
        companyName: "",
        stage: "INVALID" as unknown,
        value: -1000,
        currency: "USD",
      };

      const result = SalesPipelineEngine.recordDeal(workspaceId, data);

      expect(result.error).toBeDefined();
    });

    it("should apply default values for optional fields", () => {
      const data = {
        companyName: "Tech Startup",
        value: 75000,
        currency: "EUR",
      };

      const result = SalesPipelineEngine.recordDeal(workspaceId, data);

      expect(result.deal?.stage).toBe(DealStage.PROSPECT);
      expect(result.deal?.probability).toBe(0);
    });
  });

  describe("Progress Deal", () => {
    it("should progress deal to new stage", () => {
      const result = SalesPipelineEngine.progressDeal(
        workspaceId,
        "deal-123",
        DealStage.PROPOSAL
      );

      expect(result.error).toBeNull();
      expect(result.deal).toBeDefined();
      expect(result.deal?.stage).toBe(DealStage.PROPOSAL);
      expect(result.progressionNote).toBeDefined();
    });

    it("should update win probability on progression", () => {
      const result = SalesPipelineEngine.progressDeal(
        workspaceId,
        "deal-456",
        DealStage.NEGOTIATION
      );

      expect(result.deal?.probability).toBeGreaterThan(0.5);
    });

    it("should fail-closed without workspace ID", () => {
      const result = SalesPipelineEngine.progressDeal(
        "",
        "deal-789",
        DealStage.QUALIFIED
      );

      expect(result.error).toBeDefined();
      expect(result.deal).toBeNull();
    });

    it("should require deal ID and new stage", () => {
      const result = SalesPipelineEngine.progressDeal(
        workspaceId,
        "",
        DealStage.PROPOSAL
      );

      expect(result.error).toBeDefined();
    });
  });

  describe("Calculate Pipeline Metrics", () => {
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

    it("should calculate pipeline metrics correctly", () => {
      const result = SalesPipelineEngine.calculatePipelineMetrics(
        workspaceId,
        deals
      );

      expect(result.workspaceId).toBe(workspaceId);
      expect(result.totalPipeline).toBeGreaterThan(0);
      expect(result.avgDealSize).toBeGreaterThan(0);
      expect(result.winRate).toBeDefined();
    });

    it("should group deals by stage", () => {
      const result = SalesPipelineEngine.calculatePipelineMetrics(
        workspaceId,
        deals
      );

      expect(result.dealsByStage[DealStage.PROPOSAL]).toBeDefined();
      expect(result.dealsByStage[DealStage.QUALIFIED]).toBeDefined();
      expect(result.dealsByStage[DealStage.CLOSED_WON]).toBeDefined();
    });

    it("should calculate win rate from closed deals", () => {
      const result = SalesPipelineEngine.calculatePipelineMetrics(
        workspaceId,
        deals
      );

      expect(result.winRate).toBeGreaterThan(0);
      expect(result.winRate).toBeLessThanOrEqual(1);
    });

    it("should fail-closed without workspace ID", () => {
      const result = SalesPipelineEngine.calculatePipelineMetrics("", deals);

      expect(result.totalPipeline).toBe(0);
      expect(result.avgDealSize).toBe(0);
    });
  });

  describe("Forecast Pipeline Revenue", () => {
    const deals = [
      {
        id: "deal-1",
        workspaceId,
        companyName: "Company A",
        stage: DealStage.PROPOSAL,
        value: 100000,
        currency: "USD",
        probability: 0.8,
        expectedCloseDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days
      },
      {
        id: "deal-2",
        workspaceId,
        companyName: "Company B",
        stage: DealStage.NEGOTIATION,
        value: 50000,
        currency: "USD",
        probability: 0.6,
        expectedCloseDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000), // 45 days
      },
    ];

    it("should forecast revenue for multiple months", () => {
      const result = SalesPipelineEngine.forecastPipelineRevenue(
        workspaceId,
        deals,
        3
      );

      expect(result.totalForecast).toBeGreaterThan(0);
      expect(result.forecastByMonth[1]).toBeDefined();
      expect(result.forecastByMonth[2]).toBeDefined();
      expect(result.forecastByMonth[3]).toBeDefined();
    });

    it("should include only deals within forecast window", () => {
      const result = SalesPipelineEngine.forecastPipelineRevenue(
        workspaceId,
        deals,
        2
      );

      // Deal closing in 15 days should be in month 1
      expect(result.forecastByMonth[1]).toBeGreaterThan(0);
    });

    it("should reduce confidence with longer forecast horizon", () => {
      const result1 = SalesPipelineEngine.forecastPipelineRevenue(
        workspaceId,
        deals,
        1
      );
      const result2 = SalesPipelineEngine.forecastPipelineRevenue(
        workspaceId,
        deals,
        6
      );

      expect(result1.confidence).toBeGreaterThan(result2.confidence);
    });

    it("should fail-closed without workspace ID", () => {
      const result = SalesPipelineEngine.forecastPipelineRevenue("", deals, 3);

      expect(result.totalForecast).toBe(0);
      expect(result.confidence).toBe(0);
    });

    it("should fail-closed with empty deals", () => {
      const result = SalesPipelineEngine.forecastPipelineRevenue(
        workspaceId,
        [],
        3
      );

      expect(result.totalForecast).toBe(0);
    });
  });

  describe("Analyze Pipeline Health", () => {
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

    it("should calculate health score", () => {
      const result = SalesPipelineEngine.analyzePipelineHealth(
        workspaceId,
        healthyPipeline
      );

      expect(result.healthScore).toBeGreaterThan(0);
      expect(result.healthScore).toBeLessThanOrEqual(100);
    });

    it("should identify bottleneck stage", () => {
      const result = SalesPipelineEngine.analyzePipelineHealth(
        workspaceId,
        healthyPipeline
      );

      expect(result.bottleneckStage).toBeDefined();
    });

    it("should assess pipeline efficiency", () => {
      const result = SalesPipelineEngine.analyzePipelineHealth(
        workspaceId,
        healthyPipeline
      );

      expect(result.metrics.pipelineEfficiency).toBeGreaterThan(0);
    });

    it("should recommend improvements based on health", () => {
      const unhealthyPipeline = {
        ...healthyPipeline,
        healthScore: 30,
        winRate: 0.15,
      };

      const result = SalesPipelineEngine.analyzePipelineHealth(
        workspaceId,
        unhealthyPipeline
      );

      expect(result.recommendation).toBeDefined();
      expect(result.recommendation.toLowerCase()).toContain("improve");
    });

    it("should fail-closed without workspace ID", () => {
      const result = SalesPipelineEngine.analyzePipelineHealth(
        "",
        healthyPipeline
      );

      expect(result.healthScore).toBe(0);
    });

    it("should assess velocity from sales cycle", () => {
      const fastPipeline = { ...healthyPipeline, salesCycle: 15 };
      const slowPipeline = { ...healthyPipeline, salesCycle: 60 };

      const fastResult = SalesPipelineEngine.analyzePipelineHealth(
        workspaceId,
        fastPipeline
      );
      const slowResult = SalesPipelineEngine.analyzePipelineHealth(
        workspaceId,
        slowPipeline
      );

      expect(fastResult.metrics.dealVelocity).toBe("FAST");
      expect(slowResult.metrics.dealVelocity).toBe("SLOW");
    });
  });

  describe("Identify Opportunities", () => {
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

    it("should identify high-value early-stage deals", () => {
      const result = SalesPipelineEngine.identifyOpportunities(
        workspaceId,
        deals
      );

      expect(result.highValueEarlyStageDeals.length).toBeGreaterThan(0);
    });

    it("should identify deals at risk of churn", () => {
      const result = SalesPipelineEngine.identifyOpportunities(
        workspaceId,
        deals
      );

      expect(result.atRiskDeals.length).toBeGreaterThan(0);
    });

    it("should identify deals closing soon", () => {
      const result = SalesPipelineEngine.identifyOpportunities(
        workspaceId,
        deals
      );

      expect(result.closingDeals.length).toBeGreaterThan(0);
    });

    it("should fail-closed without workspace ID", () => {
      const result = SalesPipelineEngine.identifyOpportunities("", deals);

      expect(result.highValueEarlyStageDeals).toEqual([]);
      expect(result.atRiskDeals).toEqual([]);
    });
  });

  describe("Tenant Safety", () => {
    const deal = {
      companyName: "Test Co",
      stage: DealStage.QUALIFIED,
      value: 100000,
      currency: "USD",
      probability: 0.5,
      expectedCloseDate: new Date(),
    };

    it("should prevent cross-workspace deal recording", () => {
      const ws1Result = SalesPipelineEngine.recordDeal(workspaceId, deal);
      const ws2Result = SalesPipelineEngine.recordDeal(otherWorkspaceId, deal);

      expect(ws1Result.deal?.workspaceId).toBe(workspaceId);
      expect(ws2Result.deal?.workspaceId).toBe(otherWorkspaceId);
    });

    it("should prevent cross-workspace metrics calculation", () => {
      const deals = [
        {
          id: "deal-1",
          workspaceId: workspaceId,
          companyName: "Company A",
          stage: DealStage.QUALIFIED,
          value: 100000,
          currency: "USD",
          probability: 0.5,
          expectedCloseDate: new Date(),
        },
      ];

      const ws1Result = SalesPipelineEngine.calculatePipelineMetrics(
        workspaceId,
        deals
      );
      const ws2Result = SalesPipelineEngine.calculatePipelineMetrics(
        otherWorkspaceId,
        deals
      );

      expect(ws1Result.workspaceId).toBe(workspaceId);
      expect(ws2Result.workspaceId).toBe(otherWorkspaceId);
    });
  });
});
