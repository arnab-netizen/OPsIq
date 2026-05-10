/**
 * Unit Tests: Acquisition Engine Service
 *
 * Tests acquisition metrics, ROI, channel ranking, and forecasting.
 * Validates workspace scoping and fail-closed behavior.
 */

import { describe, it, expect } from "vitest";
import { AcquisitionEngine } from "@/services/growth/acquisition-engine";
import { AcquisitionChannel } from "@/domain/growth/growth-engines";

describe("Acquisition Engine Service", () => {
  const workspaceId = "ws-test-1";
  const otherWorkspaceId = "ws-other";

  describe("Record Metrics", () => {
    it("should record valid acquisition metrics with workspace scoping", () => {
      const data = {
        channel: AcquisitionChannel.PAID_SEARCH,
        month: "2026-05",
        leads: 150,
        qualifiedLeads: 45,
        conversions: 10,
        costPerLead: 10,
        costPerAcquisition: 150,
        targetCPA: 200,
      };

      const result = AcquisitionEngine.recordMetrics(workspaceId, data);

      expect(result.error).toBeNull();
      expect(result.metrics).toBeDefined();
      expect(result.metrics?.channel).toBe(AcquisitionChannel.PAID_SEARCH);
      expect(result.metrics?.leads).toBe(150);
    });

    it("should fail without workspace ID", () => {
      const data = {
        channel: AcquisitionChannel.ORGANIC,
        month: "2026-05",
        leads: 100,
        costPerAcquisition: 0,
      };

      const result = AcquisitionEngine.recordMetrics("", data);

      expect(result.error).toBeDefined();
      expect(result.metrics).toBeNull();
      expect(result.error).toContain("Workspace ID");
    });

    it("should fail with invalid metrics data", () => {
      const data = {
        channel: AcquisitionChannel.ORGANIC,
        month: "May 2026", // Invalid format
        leads: -100, // Invalid: negative
        costPerAcquisition: 50,
      };

      const result = AcquisitionEngine.recordMetrics(workspaceId, data);

      expect(result.error).toBeDefined();
      expect(result.metrics).toBeNull();
    });
  });

  describe("Analyze Conversion", () => {
    const metrics = {
      channel: AcquisitionChannel.PAID_SEARCH,
      month: "2026-05",
      leads: 100,
      qualifiedLeads: 30,
      conversions: 6,
      costPerLead: 20,
      costPerAcquisition: 100,
      targetCPA: 150,
    };

    it("should calculate conversion rates", () => {
      const result = AcquisitionEngine.analyzeConversion(workspaceId, metrics);

      expect(result.leadToQualifiedRate).toBe(0.3); // 30/100
      expect(result.qualifiedToConversionRate).toBe(0.2); // 6/30
      expect(result.leadToConversionRate).toBe(0.06); // 6/100
    });

    it("should classify efficiency", () => {
      // High efficiency: >15% conversion
      const highMetrics = { ...metrics, conversions: 20 };
      const highResult = AcquisitionEngine.analyzeConversion(workspaceId, highMetrics);
      expect(highResult.efficiency).toBe("HIGH");

      // Low efficiency: <5% conversion
      const lowMetrics = { ...metrics, conversions: 2 };
      const lowResult = AcquisitionEngine.analyzeConversion(workspaceId, lowMetrics);
      expect(lowResult.efficiency).toBe("LOW");
    });

    it("should fail-closed without workspace ID", () => {
      const result = AcquisitionEngine.analyzeConversion("", metrics);

      expect(result.leadToQualifiedRate).toBe(0);
      expect(result.efficiency).toBe("LOW");
    });
  });

  describe("Calculate ROI", () => {
    const metrics = {
      channel: AcquisitionChannel.PAID_SEARCH,
      month: "2026-05",
      leads: 100,
      qualifiedLeads: 30,
      conversions: 10,
      costPerLead: 20,
      costPerAcquisition: 100,
      targetCPA: 150,
    };

    it("should calculate profitable ROI", () => {
      const ltv = 5000; // High lifetime value
      const result = AcquisitionEngine.calculateROI(workspaceId, metrics, ltv);

      // Revenue = 10 × 5000 = 50000, Cost = 10 × 100 = 1000
      // ROI = (50000 - 1000) / 1000 = 4900%
      expect(result.roi).toBeGreaterThan(100);
      expect(result.status).toBe("PROFITABLE");
      expect(result.roi_ratio).toBeGreaterThan(1);
    });

    it("should calculate unprofitable ROI", () => {
      const ltv = 100; // Low lifetime value
      const result = AcquisitionEngine.calculateROI(workspaceId, metrics, ltv);

      // Revenue = 10 × 100 = 1000, Cost = 10 × 100 = 1000
      // ROI = 0%
      expect(result.roi).toBeLessThanOrEqual(0);
      expect(result.status).toBe("UNPROFITABLE");
    });

    it("should calculate payback period in days", () => {
      const ltv = 1000;
      const result = AcquisitionEngine.calculateROI(workspaceId, metrics, ltv);

      expect(result.paybackDays).toBeGreaterThan(0);
      expect(result.paybackDays).toBeLessThan(999);
    });

    it("should fail-closed without workspace ID", () => {
      const result = AcquisitionEngine.calculateROI("", metrics, 5000);

      expect(result.roi).toBe(0);
      expect(result.status).toBe("UNPROFITABLE");
    });
  });

  describe("Rank Channels", () => {
    const channelMetrics = new Map([
      [
        AcquisitionChannel.PAID_SEARCH,
        {
          channel: AcquisitionChannel.PAID_SEARCH,
          month: "2026-05",
          leads: 100,
          qualifiedLeads: 30,
          conversions: 10,
          costPerLead: 10,
          costPerAcquisition: 100,
          targetCPA: 150,
        },
      ],
      [
        AcquisitionChannel.ORGANIC,
        {
          channel: AcquisitionChannel.ORGANIC,
          month: "2026-05",
          leads: 50,
          qualifiedLeads: 25,
          conversions: 5,
          costPerLead: 0,
          costPerAcquisition: 0,
          targetCPA: 0,
        },
      ],
      [
        AcquisitionChannel.PARTNER,
        {
          channel: AcquisitionChannel.PARTNER,
          month: "2026-05",
          leads: 20,
          qualifiedLeads: 15,
          conversions: 3,
          costPerLead: 50,
          costPerAcquisition: 200,
          targetCPA: 250,
        },
      ],
    ]);

    it("should rank channels by efficiency", () => {
      const result = AcquisitionEngine.rankChannels(workspaceId, channelMetrics);

      expect(result.length).toBe(3);
      expect(result[0].rank).toBe(1);
      expect(result[1].rank).toBe(2);
      expect(result[2].rank).toBe(3);
    });

    it("should prefer lower cost per lead", () => {
      const result = AcquisitionEngine.rankChannels(workspaceId, channelMetrics);

      // Organic should rank first (zero cost)
      expect(result[0].channel).toBe(AcquisitionChannel.ORGANIC);
    });

    it("should fail-closed without workspace ID", () => {
      const result = AcquisitionEngine.rankChannels("", channelMetrics);

      expect(result).toEqual([]);
    });
  });

  describe("Optimize Budget Allocation", () => {
    const channelMetrics = new Map([
      [
        AcquisitionChannel.PAID_SEARCH,
        {
          channel: AcquisitionChannel.PAID_SEARCH,
          month: "2026-05",
          leads: 100,
          qualifiedLeads: 30,
          conversions: 10,
          costPerLead: 10,
          costPerAcquisition: 100,
          targetCPA: 150,
        },
      ],
      [
        AcquisitionChannel.ORGANIC,
        {
          channel: AcquisitionChannel.ORGANIC,
          month: "2026-05",
          leads: 50,
          qualifiedLeads: 25,
          conversions: 5,
          costPerLead: 0,
          costPerAcquisition: 0,
          targetCPA: 0,
        },
      ],
    ]);

    it("should allocate budget based on efficiency", () => {
      const totalBudget = 10000;
      const result = AcquisitionEngine.optimizeBudgetAllocation(
        workspaceId,
        channelMetrics,
        totalBudget,
        50
      );

      expect(result.size).toBe(2);

      // Top channel should get 50%
      const topAllocation = result.get(AcquisitionChannel.ORGANIC);
      expect(topAllocation).toBe(5000); // 50% of 10000
    });

    it("should fail-closed without workspace ID", () => {
      const result = AcquisitionEngine.optimizeBudgetAllocation("", channelMetrics, 10000, 50);

      expect(result.size).toBe(0);
    });

    it("should fail-closed with zero budget", () => {
      const result = AcquisitionEngine.optimizeBudgetAllocation(workspaceId, channelMetrics, 0, 50);

      expect(result.size).toBe(0);
    });
  });

  describe("Forecast Acquisition", () => {
    const historicalMetrics = [
      {
        channel: AcquisitionChannel.PAID_SEARCH,
        month: "2026-03",
        leads: 100,
        qualifiedLeads: 30,
        conversions: 10,
        costPerLead: 10,
        costPerAcquisition: 100,
        targetCPA: 150,
      },
      {
        channel: AcquisitionChannel.PAID_SEARCH,
        month: "2026-04",
        leads: 110,
        qualifiedLeads: 33,
        conversions: 11,
        costPerLead: 10,
        costPerAcquisition: 100,
        targetCPA: 150,
      },
    ];

    it("should forecast acquisition with growth rate", () => {
      const result = AcquisitionEngine.forecastAcquisition(workspaceId, historicalMetrics, 0.1);

      expect(result.projectedLeads).toBeGreaterThan(105);
      expect(result.projectedConversions).toBeGreaterThan(10);
      expect(result.projectedCost).toBeGreaterThan(0);
    });

    it("should calculate confidence based on historical data", () => {
      const result = AcquisitionEngine.forecastAcquisition(workspaceId, historicalMetrics, 0.1);

      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.confidence).toBeLessThanOrEqual(0.9);
    });

    it("should fail-closed without workspace ID", () => {
      const result = AcquisitionEngine.forecastAcquisition("", historicalMetrics, 0.1);

      expect(result.projectedLeads).toBe(0);
      expect(result.confidence).toBe(0);
    });

    it("should fail-closed with empty historical data", () => {
      const result = AcquisitionEngine.forecastAcquisition(workspaceId, [], 0.1);

      expect(result.projectedLeads).toBe(0);
      expect(result.confidence).toBe(0);
    });
  });

  describe("Tenant Safety", () => {
    const metrics = {
      channel: AcquisitionChannel.PAID_SEARCH,
      month: "2026-05",
      leads: 100,
      qualifiedLeads: 30,
      conversions: 10,
      costPerLead: 10,
      costPerAcquisition: 100,
      targetCPA: 150,
    };

    it("should prevent cross-workspace metric analysis", () => {
      const correctWs = AcquisitionEngine.analyzeConversion(workspaceId, metrics);
      const wrongWs = AcquisitionEngine.analyzeConversion(otherWorkspaceId, metrics);

      expect(correctWs.leadToQualifiedRate).toBeGreaterThan(0);
      expect(wrongWs.leadToQualifiedRate).toBe(0);
    });

    it("should enforce workspace in ROI calculation", () => {
      const correctWs = AcquisitionEngine.calculateROI(workspaceId, metrics, 5000);
      const wrongWs = AcquisitionEngine.calculateROI(otherWorkspaceId, metrics, 5000);

      expect(correctWs.roi_ratio).toBeGreaterThan(0);
      expect(wrongWs.roi_ratio).toBe(0);
    });

    it("should enforce workspace in channel ranking", () => {
      const channelMetrics = new Map([
        [AcquisitionChannel.PAID_SEARCH, metrics],
      ]);

      const correctWs = AcquisitionEngine.rankChannels(workspaceId, channelMetrics);
      const wrongWs = AcquisitionEngine.rankChannels(otherWorkspaceId, channelMetrics);

      expect(correctWs.length).toBeGreaterThan(0);
      expect(wrongWs.length).toBe(0);
    });
  });
});
