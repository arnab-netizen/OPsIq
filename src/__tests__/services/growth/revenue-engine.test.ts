/**
 * Unit Tests: Revenue Engine Service
 *
 * Tests revenue stream creation, forecasting, and health analysis.
 * Validates workspace scoping and fail-closed behavior.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { RevenueEngine } from "@/services/growth/revenue-engine";
import { RevenueModel, BillingCycle } from "@/domain/growth/growth-engines";

describe("Revenue Engine Service", () => {
  const workspaceId = "ws-test-1";
  const otherWorkspaceId = "ws-other";

  describe("Create Revenue Stream", () => {
    it("should create a valid revenue stream with workspace scoping", () => {
      const data = {
        name: "SaaS Plan",
        model: RevenueModel.SUBSCRIPTION,
        billingCycle: BillingCycle.MONTHLY,
        basePrice: 99,
        currency: "USD",
      };

      const result = RevenueEngine.createRevenueStream(workspaceId, data);

      expect(result.error).toBeNull();
      expect(result.stream).toBeDefined();
      expect(result.stream?.workspaceId).toBe(workspaceId);
      expect(result.stream?.name).toBe("SaaS Plan");
      expect(result.stream?.basePrice).toBe(99);
    });

    it("should fail without workspace ID", () => {
      const data = {
        name: "Invalid Plan",
        model: RevenueModel.SUBSCRIPTION,
        basePrice: 99,
        currency: "USD",
      };

      const result = RevenueEngine.createRevenueStream("", data);

      expect(result.error).toBeDefined();
      expect(result.stream).toBeNull();
      expect(result.error).toContain("Workspace ID");
    });

    it("should fail with invalid stream data", () => {
      const data = {
        name: "",
        model: RevenueModel.SUBSCRIPTION,
        basePrice: -50,
        currency: "USD",
      };

      const result = RevenueEngine.createRevenueStream(workspaceId, data);

      expect(result.error).toBeDefined();
      expect(result.stream).toBeNull();
    });

    it("should set default values for optional fields", () => {
      const data = {
        name: "Default Plan",
        basePrice: 49,
      };

      const result = RevenueEngine.createRevenueStream(workspaceId, data);

      expect(result.stream?.model).toBe(RevenueModel.SUBSCRIPTION);
      expect(result.stream?.billingCycle).toBe(BillingCycle.MONTHLY);
      expect(result.stream?.currency).toBe("USD");
      expect(result.stream?.status).toBe("DRAFT");
    });
  });

  describe("Calculate Blended Metric", () => {
    const streams = [
      {
        id: "rs-1",
        workspaceId,
        name: "Plan A",
        model: RevenueModel.SUBSCRIPTION,
        billingCycle: BillingCycle.MONTHLY,
        basePrice: 99,
        currency: "USD",
        activationDate: new Date(),
        status: "ACTIVE" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "rs-2",
        workspaceId,
        name: "Plan B",
        model: RevenueModel.SUBSCRIPTION,
        billingCycle: BillingCycle.MONTHLY,
        basePrice: 199,
        currency: "USD",
        activationDate: new Date(),
        status: "ACTIVE" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "rs-3",
        workspaceId: otherWorkspaceId,
        name: "Other Workspace Plan",
        model: RevenueModel.SUBSCRIPTION,
        billingCycle: BillingCycle.MONTHLY,
        basePrice: 500,
        currency: "USD",
        activationDate: new Date(),
        status: "ACTIVE" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    it("should calculate blended base price (workspace-scoped)", () => {
      const result = RevenueEngine.calculateBlendedMetric(workspaceId, streams, "basePrice");

      expect(result.value).toBe(298); // 99 + 199 (excludes other workspace)
      expect(result.count).toBe(2);
      expect(result.average).toBe(149);
    });

    it("should exclude non-ACTIVE streams", () => {
      const mixedStreams = [
        ...streams,
        {
          id: "rs-4",
          workspaceId,
          name: "Draft Plan",
          model: RevenueModel.SUBSCRIPTION,
          billingCycle: BillingCycle.MONTHLY,
          basePrice: 299,
          currency: "USD",
          activationDate: new Date(),
          status: "DRAFT" as const,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const result = RevenueEngine.calculateBlendedMetric(workspaceId, mixedStreams, "basePrice");

      expect(result.count).toBe(2); // Draft plan excluded
      expect(result.value).toBe(298);
    });

    it("should return data only for correct workspace", () => {
      const result = RevenueEngine.calculateBlendedMetric(otherWorkspaceId, streams, "basePrice");

      expect(result.value).toBe(500); // rs-3 has 500
      expect(result.count).toBe(1);
      expect(result.average).toBe(500);
    });
  });

  describe("Forecast Revenue", () => {
    const streams = [
      {
        id: "rs-1",
        workspaceId,
        name: "Basic Plan",
        model: RevenueModel.SUBSCRIPTION,
        billingCycle: BillingCycle.MONTHLY,
        basePrice: 99,
        currency: "USD",
        volume: 10,
        activationDate: new Date(),
        status: "ACTIVE" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "rs-2",
        workspaceId,
        name: "Pro Plan",
        model: RevenueModel.SUBSCRIPTION,
        billingCycle: BillingCycle.MONTHLY,
        basePrice: 299,
        currency: "USD",
        volume: 5,
        activationDate: new Date(),
        status: "ACTIVE" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    it("should forecast revenue based on active streams", () => {
      const forecast = RevenueEngine.forecastRevenue(workspaceId, streams, "2026-05");

      // Basic: 99 * 10 = 990, Pro: 299 * 5 = 1495, Total = 2485
      expect(forecast.baselineRevenue).toBe(2485);
      expect(forecast.projectedRevenue).toBeGreaterThan(forecast.baselineRevenue);
      expect(forecast.variance).toBeGreaterThan(0);
      expect(forecast.confidence).toBeGreaterThan(0.7);
    });

    it("should break down forecast by stream", () => {
      const forecast = RevenueEngine.forecastRevenue(workspaceId, streams, "2026-05");

      expect(forecast.driversByStream["Basic Plan"]).toBe(990);
      expect(forecast.driversByStream["Pro Plan"]).toBe(1495);
    });

    it("should handle empty workspace", () => {
      const forecast = RevenueEngine.forecastRevenue(otherWorkspaceId, streams, "2026-05");

      expect(forecast.baselineRevenue).toBe(0);
      expect(forecast.projectedRevenue).toBe(0);
      expect(forecast.confidence).toBeLessThan(0.6);
    });

    it("should fail-closed without workspace ID", () => {
      const forecast = RevenueEngine.forecastRevenue("", streams, "2026-05");

      expect(forecast.baselineRevenue).toBe(0);
      expect(forecast.confidence).toBe(0);
    });
  });

  describe("Analyze Stream Health", () => {
    const healthyStream = {
      id: "rs-1",
      workspaceId,
      name: "Healthy Plan",
      model: RevenueModel.SUBSCRIPTION,
      billingCycle: BillingCycle.MONTHLY,
      basePrice: 99,
      currency: "USD",
      activationDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days old
      status: "ACTIVE" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it("should identify healthy stream", () => {
      const result = RevenueEngine.analyzeStreamHealth(workspaceId, healthyStream);

      expect(result.isHealthy).toBe(true);
      expect(result.score).toBeGreaterThan(70);
    });

    it("should reject workspace mismatch", () => {
      const result = RevenueEngine.analyzeStreamHealth(otherWorkspaceId, healthyStream);

      expect(result.isHealthy).toBe(false);
      expect(result.score).toBe(0);
      expect(result.factors).toContain("Workspace mismatch or unauthorized access");
    });

    it("should penalize draft status", () => {
      const draftStream = { ...healthyStream, status: "DRAFT" as const };

      const result = RevenueEngine.analyzeStreamHealth(workspaceId, draftStream);

      expect(result.score).toBeLessThan(80);
      expect(result.factors.some((f) => f.includes("not yet active"))).toBe(true);
    });

    it("should penalize low base price", () => {
      const lowPriceStream = { ...healthyStream, basePrice: 5 };

      const result = RevenueEngine.analyzeStreamHealth(workspaceId, lowPriceStream);

      expect(result.factors.some((f) => f.includes("very low"))).toBe(true);
    });

    it("should penalize zero/negative price", () => {
      const zeroPriceStream = { ...healthyStream, basePrice: 0 };

      const result = RevenueEngine.analyzeStreamHealth(workspaceId, zeroPriceStream);

      expect(result.score).toBeLessThan(70);
      expect(result.factors.some((f) => f.includes("zero or negative"))).toBe(true);
    });
  });

  describe("Calculate Retention Rate", () => {
    it("should calculate month-over-month retention", () => {
      const retention = RevenueEngine.calculateRetentionRate(workspaceId, 10000, 10000);

      expect(retention).toBe(100); // 100% retention
    });

    it("should detect revenue growth", () => {
      const retention = RevenueEngine.calculateRetentionRate(workspaceId, 12000, 10000);

      expect(retention).toBeGreaterThan(100);
    });

    it("should detect revenue decline", () => {
      const retention = RevenueEngine.calculateRetentionRate(workspaceId, 8000, 10000);

      expect(retention).toBeLessThan(100);
      expect(retention).toBeGreaterThan(0);
    });

    it("should fail-closed with zero previous revenue", () => {
      const retention = RevenueEngine.calculateRetentionRate(workspaceId, 5000, 0);

      expect(retention).toBe(0);
    });

    it("should fail-closed without workspace ID", () => {
      const retention = RevenueEngine.calculateRetentionRate("", 10000, 10000);

      expect(retention).toBe(0);
    });
  });

  describe("Classify Stream Performance", () => {
    it("should classify LOW performance", () => {
      const tier = RevenueEngine.classifyStreamPerformance(50, 10);

      expect(tier).toBe("LOW");
    });

    it("should classify MEDIUM performance", () => {
      const tier = RevenueEngine.classifyStreamPerformance(500, 10);

      expect(tier).toBe("MEDIUM");
    });

    it("should classify HIGH performance", () => {
      const tier = RevenueEngine.classifyStreamPerformance(1500, 10);

      expect(tier).toBe("HIGH");
    });

    it("should handle default volume", () => {
      // basePrice 100 * default 10 = 1000 = MEDIUM
      const tier = RevenueEngine.classifyStreamPerformance(100);

      expect(tier).toBe("MEDIUM");
    });
  });

  describe("Tenant Safety", () => {
    it("should prevent cross-workspace data access in metrics", () => {
      const streams = [
        {
          id: "rs-1",
          workspaceId,
          name: "Plan A",
          model: RevenueModel.SUBSCRIPTION,
          billingCycle: BillingCycle.MONTHLY,
          basePrice: 500,
          currency: "USD",
          activationDate: new Date(),
          status: "ACTIVE" as const,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const wsResult = RevenueEngine.calculateBlendedMetric(workspaceId, streams, "basePrice");
      const otherResult = RevenueEngine.calculateBlendedMetric(otherWorkspaceId, streams, "basePrice");

      expect(wsResult.value).toBe(500);
      expect(otherResult.value).toBe(0);
    });

    it("should enforce workspace in health analysis", () => {
      const stream = {
        id: "rs-1",
        workspaceId,
        name: "Plan",
        model: RevenueModel.SUBSCRIPTION,
        billingCycle: BillingCycle.MONTHLY,
        basePrice: 99,
        currency: "USD",
        activationDate: new Date(),
        status: "ACTIVE" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const correctWs = RevenueEngine.analyzeStreamHealth(workspaceId, stream);
      const wrongWs = RevenueEngine.analyzeStreamHealth(otherWorkspaceId, stream);

      expect(correctWs.isHealthy).toBe(true);
      expect(wrongWs.isHealthy).toBe(false);
    });
  });
});
