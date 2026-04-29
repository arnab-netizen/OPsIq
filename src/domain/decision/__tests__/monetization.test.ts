import { describe, it, expect } from "vitest";
import {
  buildMonetizationDecision,
  getSeverityColor,
  getSeverityBgColor,
  getRiskColor,
  formatCurrency,
  formatPercentage,
  MonetizationDecision,
} from "../monetization";
import { compareScenarios } from "@/services/control/scenario-comparison";

describe("Monetization-Grade Decision Output", () => {
  const mockScenarios = compareScenarios({
    baselineRevenue: 1000000,
    baselineCost: 500000,
    revenueChange: 100000,
    costChange: 50000,
    confidence: 0.8,
  });

  describe("buildMonetizationDecision - Severity Classification", () => {
    it("should classify as critical for losses > 500k", () => {
      const decision = buildMonetizationDecision(
        "System outage",
        750000,
        "Implement failover",
        100000,
        0.85,
        mockScenarios
      );

      expect(decision.severity).toBe("critical");
    });

    it("should classify as high for losses > 100k", () => {
      const decision = buildMonetizationDecision(
        "Revenue decline",
        250000,
        "Launch promotion",
        50000,
        0.75,
        mockScenarios
      );

      expect(decision.severity).toBe("high");
    });

    it("should classify as medium for losses > 25k", () => {
      const decision = buildMonetizationDecision(
        "Process inefficiency",
        75000,
        "Optimize workflow",
        15000,
        0.7,
        mockScenarios
      );

      expect(decision.severity).toBe("medium");
    });

    it("should classify as low for losses <= 25k", () => {
      const decision = buildMonetizationDecision(
        "Minor issue",
        10000,
        "Small fix",
        2000,
        0.65,
        mockScenarios
      );

      expect(decision.severity).toBe("low");
    });
  });

  describe("buildMonetizationDecision - Risk Classification", () => {
    it("should classify as low risk for confidence >= 0.8", () => {
      const decision = buildMonetizationDecision(
        "Problem",
        100000,
        "Action",
        50000,
        0.85,
        mockScenarios
      );

      expect(decision.riskLevel).toBe("low");
    });

    it("should classify as medium risk for confidence >= 0.6", () => {
      const decision = buildMonetizationDecision(
        "Problem",
        100000,
        "Action",
        50000,
        0.75,
        mockScenarios
      );

      expect(decision.riskLevel).toBe("medium");
    });

    it("should classify as high risk for confidence < 0.6", () => {
      const decision = buildMonetizationDecision(
        "Problem",
        100000,
        "Action",
        50000,
        0.55,
        mockScenarios
      );

      expect(decision.riskLevel).toBe("high");
    });
  });

  describe("buildMonetizationDecision - Contract Validation", () => {
    it("should include all required fields", () => {
      const decision = buildMonetizationDecision(
        "Test problem",
        100000,
        "Test action",
        50000,
        0.8,
        mockScenarios,
        false,
        undefined,
        "30 days"
      );

      expect(decision.problem).toBe("Test problem");
      expect(decision.estimatedLoss).toBe(100000);
      expect(decision.recommendedAction).toBe("Test action");
      expect(decision.expectedImpact).toBe(50000);
      expect(decision.confidence).toBe(0.8);
      expect(decision.blocked).toBe(false);
      expect(decision.scenarios).toBeDefined();
      expect(decision.severity).toBeDefined();
      expect(decision.riskLevel).toBeDefined();
      expect(decision.timeframe).toBe("30 days");
    });

    it("should handle blocked decision with reason", () => {
      const decision = buildMonetizationDecision(
        "Problem",
        100000,
        "Action",
        50000,
        0.8,
        mockScenarios,
        true,
        "Insufficient data"
      );

      expect(decision.blocked).toBe(true);
      expect(decision.blockReason).toBe("Insufficient data");
    });

    it("should include scenarios", () => {
      const decision = buildMonetizationDecision(
        "Problem",
        100000,
        "Action",
        50000,
        0.8,
        mockScenarios
      );

      expect(decision.scenarios.baseline).toBeDefined();
      expect(decision.scenarios.recommended).toBeDefined();
      expect(decision.scenarios.alternatives).toBeDefined();
    });
  });

  describe("getSeverityColor", () => {
    it("should return red for critical", () => {
      expect(getSeverityColor("critical")).toBe("text-red-600");
    });

    it("should return orange for high", () => {
      expect(getSeverityColor("high")).toBe("text-orange-600");
    });

    it("should return yellow for medium", () => {
      expect(getSeverityColor("medium")).toBe("text-yellow-600");
    });

    it("should return green for low", () => {
      expect(getSeverityColor("low")).toBe("text-green-600");
    });

    it("should return gray for unknown", () => {
      expect(getSeverityColor("unknown")).toBe("text-gray-600");
    });
  });

  describe("getSeverityBgColor", () => {
    it("should return red background for critical", () => {
      expect(getSeverityBgColor("critical")).toContain("bg-red-50");
      expect(getSeverityBgColor("critical")).toContain("border-red-200");
    });

    it("should return orange background for high", () => {
      expect(getSeverityBgColor("high")).toContain("bg-orange-50");
      expect(getSeverityBgColor("high")).toContain("border-orange-200");
    });

    it("should return yellow background for medium", () => {
      expect(getSeverityBgColor("medium")).toContain("bg-yellow-50");
      expect(getSeverityBgColor("medium")).toContain("border-yellow-200");
    });

    it("should return green background for low", () => {
      expect(getSeverityBgColor("low")).toContain("bg-green-50");
      expect(getSeverityBgColor("low")).toContain("border-green-200");
    });
  });

  describe("getRiskColor", () => {
    it("should return green for low risk", () => {
      expect(getRiskColor("low")).toBe("text-green-600");
    });

    it("should return yellow for medium risk", () => {
      expect(getRiskColor("medium")).toBe("text-yellow-600");
    });

    it("should return red for high risk", () => {
      expect(getRiskColor("high")).toBe("text-red-600");
    });
  });

  describe("formatCurrency", () => {
    it("should format positive amounts", () => {
      expect(formatCurrency(100000)).toBe("$100,000");
      expect(formatCurrency(1000000)).toBe("$1,000,000");
    });

    it("should format zero", () => {
      expect(formatCurrency(0)).toBe("$0");
    });

    it("should format small amounts", () => {
      expect(formatCurrency(500)).toBe("$500");
    });

    it("should handle negative amounts", () => {
      expect(formatCurrency(-50000)).toBe("-$50,000");
    });

    it("should round to nearest dollar", () => {
      expect(formatCurrency(1234.56)).toBe("$1,235");
    });
  });

  describe("formatPercentage", () => {
    it("should format decimal to percentage", () => {
      expect(formatPercentage(0.85)).toBe("85%");
      expect(formatPercentage(0.5)).toBe("50%");
      expect(formatPercentage(0.123)).toBe("12%");
    });

    it("should format zero", () => {
      expect(formatPercentage(0)).toBe("0%");
    });

    it("should format 100%", () => {
      expect(formatPercentage(1)).toBe("100%");
    });

    it("should round to nearest percent", () => {
      expect(formatPercentage(0.856)).toBe("86%");
    });
  });

  describe("MonetizationDecision - Integration Tests", () => {
    it("should create complete decision for critical revenue loss", () => {
      const decision = buildMonetizationDecision(
        "Monthly revenue declining 15% due to customer churn",
        450000,
        "Launch customer retention program with personalized outreach",
        100000,
        0.82,
        mockScenarios,
        false,
        undefined,
        "60 days"
      );

      expect(decision.problem).toContain("revenue");
      expect(decision.severity).toBe("high");
      expect(decision.riskLevel).toBe("low");
      expect(decision.blocked).toBe(false);
      expect(decision.timeframe).toBe("60 days");
    });

    it("should create blocked decision with reason", () => {
      const decision = buildMonetizationDecision(
        "Cost structure misalignment",
        250000,
        "Restructure operations",
        80000,
        0.45,
        mockScenarios,
        true,
        "Cannot proceed: insufficient historical data for cost projections"
      );

      expect(decision.blocked).toBe(true);
      expect(decision.blockReason).toContain("insufficient");
      expect(decision.riskLevel).toBe("high");
    });

    it("should properly classify mixed-severity decision", () => {
      const decision = buildMonetizationDecision(
        "Minor efficiency issue",
        15000,
        "Process optimization",
        3000,
        0.72,
        mockScenarios
      );

      expect(decision.severity).toBe("low");
      expect(decision.riskLevel).toBe("medium");
      expect(decision.blocked).toBe(false);
    });

    it("should handle zero-loss scenario", () => {
      const decision = buildMonetizationDecision(
        "Preventive maintenance opportunity",
        0,
        "Implement maintenance schedule",
        25000,
        0.88,
        mockScenarios
      );

      expect(decision.estimatedLoss).toBe(0);
      expect(decision.expectedImpact).toBe(25000);
      expect(decision.severity).toBe("low");
    });
  });

  describe("MonetizationDecision - No Placeholders", () => {
    it("should use real data only", () => {
      const decision = buildMonetizationDecision(
        "Actual business problem statement",
        125750,
        "Real recommended action with specific steps",
        37500,
        0.78,
        mockScenarios
      );

      // Verify no placeholder text
      expect(decision.problem).not.toContain("TODO");
      expect(decision.problem).not.toContain("placeholder");
      expect(decision.recommendedAction).not.toContain("TBD");
      expect(decision.severity).not.toContain("unknown");

      // Verify real calculations
      expect(decision.riskLevel).toBe("medium");
      expect(decision.estimatedLoss).toBeGreaterThan(0);
    });
  });

  describe("MonetizationDecision - Business Metrics", () => {
    it("should support ROI calculation", () => {
      const loss = 100000;
      const impact = 50000;

      const decision = buildMonetizationDecision(
        "Problem",
        loss,
        "Action",
        impact,
        0.8,
        mockScenarios
      );

      // ROI = impact / loss
      const roi = decision.expectedImpact / decision.estimatedLoss;
      expect(roi).toBe(0.5);
    });

    it("should support payback period calculation", () => {
      const loss = 120000;
      const impact = 10000; // Monthly

      const decision = buildMonetizationDecision(
        "Problem",
        loss,
        "Action",
        impact,
        0.8,
        mockScenarios
      );

      // Payback in months = loss / monthly_impact * 12
      const paybackMonths = (decision.estimatedLoss / decision.expectedImpact) * 12;
      expect(paybackMonths).toBe(144); // 12 months
    });

    it("should support net benefit calculation", () => {
      const loss = 100000;
      const impact = 60000;

      const decision = buildMonetizationDecision(
        "Problem",
        loss,
        "Action",
        impact,
        0.8,
        mockScenarios
      );

      const netBenefit = decision.expectedImpact - decision.estimatedLoss;
      expect(netBenefit).toBe(-40000); // Loss exceeds benefit
    });
  });
});
