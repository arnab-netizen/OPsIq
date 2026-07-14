/**
 * Unit Tests: Acquisition Engine Service (non-DB paths)
 *
 * Tests validation errors, conversion analysis, ROI calculation, channel ranking,
 * and forecasting. Validates workspace scoping and fail-closed behavior.
 *
 * DB-backed paths (recordMetrics success, listMetrics) are covered in the DB test file.
 * Validation-only paths for recordMetrics (errors thrown before DB touch) are tested here.
 */

import { describe, it, expect } from "vitest";
import { AcquisitionEngine } from "@/services/growth/acquisition-engine";
import { AcquisitionChannel } from "@/domain/growth/growth-engines";
import { ValidationError } from "@/infra/errors";

describe("Acquisition Engine Service", () => {
  const workspaceId = "ws-test-1";
  const otherWorkspaceId = "ws-other";

  describe("recordMetrics — validation paths (no DB required)", () => {
    it("rejects empty workspaceId with ValidationError", async () => {
      await expect(
        AcquisitionEngine.recordMetrics("", "actor-1", {
          channel: AcquisitionChannel.ORGANIC,
          month: "2026-05",
          leads: 100,
          conversions: 5,
          costPerLead: 0,
          costPerAcquisition: 0,
          targetCPA: 0,
        })
      ).rejects.toThrow(ValidationError);
    });

    it("rejects invalid month format with ValidationError", async () => {
      await expect(
        AcquisitionEngine.recordMetrics(workspaceId, "actor-1", {
          channel: AcquisitionChannel.ORGANIC,
          month: "May 2026",
          leads: 100,
          conversions: 5,
          costPerLead: 0,
          costPerAcquisition: 0,
          targetCPA: 0,
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("analyzeConversion", () => {
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

    it("calculates conversion rates correctly", () => {
      const result = AcquisitionEngine.analyzeConversion(workspaceId, metrics);

      expect(result.leadToQualifiedRate).toBe(0.3);
      expect(result.qualifiedToConversionRate).toBe(0.2);
      expect(result.leadToConversionRate).toBe(0.06);
    });

    it("classifies HIGH efficiency for >15% lead-to-conversion", () => {
      const result = AcquisitionEngine.analyzeConversion(workspaceId, { ...metrics, conversions: 20 });
      expect(result.efficiency).toBe("HIGH");
    });

    it("classifies LOW efficiency for <5% lead-to-conversion", () => {
      const result = AcquisitionEngine.analyzeConversion(workspaceId, { ...metrics, conversions: 2 });
      expect(result.efficiency).toBe("LOW");
    });

    it("returns fail-closed zeros for missing workspaceId", () => {
      const result = AcquisitionEngine.analyzeConversion("", metrics);
      expect(result.leadToQualifiedRate).toBe(0);
      expect(result.efficiency).toBe("LOW");
    });

    it("returns fail-closed zeros when metrics.workspaceId mismatches caller (cross-workspace block)", () => {
      const metricsWithWs = { ...metrics, workspaceId };
      const result = AcquisitionEngine.analyzeConversion(otherWorkspaceId, metricsWithWs);
      expect(result.leadToQualifiedRate).toBe(0);
      expect(result.efficiency).toBe("LOW");
    });
  });

  describe("calculateROI", () => {
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

    it("calculates profitable ROI for high LTV", () => {
      const result = AcquisitionEngine.calculateROI(workspaceId, metrics, 5000);
      // Revenue = 10 × 5000 = 50000, Cost = 10 × 100 = 1000 → ROI = 4900%
      expect(result.roi).toBeGreaterThan(100);
      expect(result.status).toBe("PROFITABLE");
      expect(result.roi_ratio).toBeGreaterThan(1);
    });

    it("calculates unprofitable ROI for low LTV", () => {
      const result = AcquisitionEngine.calculateROI(workspaceId, metrics, 100);
      // Revenue = Cost = 1000 → ROI = 0%
      expect(result.roi).toBeLessThanOrEqual(0);
      expect(result.status).toBe("UNPROFITABLE");
    });

    it("returns a positive payback period in days", () => {
      const result = AcquisitionEngine.calculateROI(workspaceId, metrics, 1000);
      expect(result.paybackDays).toBeGreaterThan(0);
      expect(result.paybackDays).toBeLessThan(999);
    });

    it("returns fail-closed zeros for missing workspaceId", () => {
      const result = AcquisitionEngine.calculateROI("", metrics, 5000);
      expect(result.roi).toBe(0);
      expect(result.status).toBe("UNPROFITABLE");
    });

    it("returns fail-closed zeros when metrics.workspaceId mismatches caller (cross-workspace block)", () => {
      const metricsWithWs = { ...metrics, workspaceId };
      const result = AcquisitionEngine.calculateROI(otherWorkspaceId, metricsWithWs, 5000);
      expect(result.roi_ratio).toBe(0);
    });
  });

  describe("rankChannels", () => {
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

    it("returns all channels ranked with sequential ranks", () => {
      const result = AcquisitionEngine.rankChannels(workspaceId, channelMetrics);
      expect(result.length).toBe(3);
      expect(result[0].rank).toBe(1);
      expect(result[1].rank).toBe(2);
      expect(result[2].rank).toBe(3);
    });

    it("ranks ORGANIC first (zero cost per qualified lead)", () => {
      const result = AcquisitionEngine.rankChannels(workspaceId, channelMetrics);
      expect(result[0].channel).toBe(AcquisitionChannel.ORGANIC);
    });

    it("returns empty array for missing workspaceId", () => {
      expect(AcquisitionEngine.rankChannels("", channelMetrics)).toEqual([]);
    });

    it("filters out metrics with explicitly mismatched workspaceId (cross-workspace block)", () => {
      const metricsWithOtherWs = new Map([
        [AcquisitionChannel.PAID_SEARCH, {
          workspaceId, // belongs to workspaceId
          channel: AcquisitionChannel.PAID_SEARCH,
          month: "2026-05",
          leads: 100,
          qualifiedLeads: 30,
          conversions: 10,
          costPerLead: 10,
          costPerAcquisition: 100,
          targetCPA: 150,
        }],
      ]);
      const wrongWs = AcquisitionEngine.rankChannels(otherWorkspaceId, metricsWithOtherWs);
      expect(wrongWs.length).toBe(0);
    });
  });

  describe("optimizeBudgetAllocation", () => {
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

    it("allocates 50% of budget to the top-ranked channel (ORGANIC)", () => {
      const result = AcquisitionEngine.optimizeBudgetAllocation(workspaceId, channelMetrics, 10000, 50);
      expect(result.size).toBe(2);
      expect(result.get(AcquisitionChannel.ORGANIC)).toBe(5000);
    });

    it("returns empty map for missing workspaceId", () => {
      expect(AcquisitionEngine.optimizeBudgetAllocation("", channelMetrics, 10000, 50).size).toBe(0);
    });

    it("returns empty map for zero budget", () => {
      expect(AcquisitionEngine.optimizeBudgetAllocation(workspaceId, channelMetrics, 0, 50).size).toBe(0);
    });
  });

  describe("forecastAcquisition", () => {
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

    it("forecasts leads and conversions above historical average with 10% growth", () => {
      const result = AcquisitionEngine.forecastAcquisition(workspaceId, historicalMetrics, 0.1);
      expect(result.projectedLeads).toBeGreaterThan(105);
      expect(result.projectedConversions).toBeGreaterThan(10);
      expect(result.projectedCost).toBeGreaterThan(0);
    });

    it("calculates confidence based on historical data volume", () => {
      const result = AcquisitionEngine.forecastAcquisition(workspaceId, historicalMetrics, 0.1);
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.confidence).toBeLessThanOrEqual(0.9);
    });

    it("returns fail-closed zeros for missing workspaceId", () => {
      const result = AcquisitionEngine.forecastAcquisition("", historicalMetrics, 0.1);
      expect(result.projectedLeads).toBe(0);
      expect(result.confidence).toBe(0);
    });

    it("returns fail-closed zeros for empty historical data", () => {
      const result = AcquisitionEngine.forecastAcquisition(workspaceId, [], 0.1);
      expect(result.projectedLeads).toBe(0);
      expect(result.confidence).toBe(0);
    });

    it("returns fail-closed zeros when any metric has a mismatched workspaceId", () => {
      const metricsWithWrongWs = historicalMetrics.map((m) => ({
        ...m,
        workspaceId: otherWorkspaceId,
      }));
      const result = AcquisitionEngine.forecastAcquisition(workspaceId, metricsWithWrongWs, 0.1);
      expect(result.projectedLeads).toBe(0);
      expect(result.confidence).toBe(0);
    });
  });
});
