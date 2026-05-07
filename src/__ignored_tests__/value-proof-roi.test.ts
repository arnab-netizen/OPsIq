/**
 * Value Proof ROI Test Suite
 *
 * Tests ROI calculations with human factors adjustments.
 * Validates that intervention returns account for execution risk and delay.
 */

import {
  calculateROI,
  calculateEngagementROI,
  compareROI,
  recommendROIThreshold,
  ROIInput,
} from "@/services/value-proof/roi-calculator";
import { HumanRealityImpact } from "@/services/reality-awareness/human-factors-engine";

describe("Value Proof - ROI Calculation", () => {
  const baseROIInput: ROIInput = {
    valueRecoveredINR: 500000, // ₹5 lakhs
    interventionCostINR: 100000, // ₹1 lakh
    timeToValueMonths: 2,
    baseSuccessProbability: 0.85,
  };

  describe("ROI Calculation", () => {
    it("should calculate basic ROI", () => {
      const result = calculateROI(baseROIInput);

      expect(result.grossValueINR).toBe(500000);
      expect(result.interventionCostINR).toBeGreaterThan(0);
      expect(result.baseROI).toBeGreaterThan(0);
    });

    it("should calculate ROI as (Value - Cost) / Cost * 100", () => {
      const result = calculateROI(baseROIInput);

      // (500000 - 100000) / 100000 * 100 = 400%
      // Account for time and success probability adjustments
      expect(result.baseROI).toBeGreaterThan(300); // After adjustments
    });

    it("should apply time discount factor for delays", () => {
      const shortTimeline: ROIInput = {
        ...baseROIInput,
        timeToValueMonths: 1, // Quick value realization
      };
      const longTimeline: ROIInput = {
        ...baseROIInput,
        timeToValueMonths: 6, // Slow value realization
      };

      const shortResult = calculateROI(shortTimeline);
      const longResult = calculateROI(longTimeline);

      // Longer timeline should have lower ROI due to time discount
      expect(shortResult.timeDiscountFactor).toBeGreaterThan(longResult.timeDiscountFactor);
    });

    it("should incorporate human factors in adjusted ROI", () => {
      const humanImpact: HumanRealityImpact = {
        delayDays: 10,
        riskFactor: 1.5, // 50% cost increase
        successProbabilityAdjustment: -0.15, // -15% success probability
        requiredInterventions: [],
      };

      const resultWithoutHuman = calculateROI(baseROIInput);
      const resultWithHuman = calculateROI({
        ...baseROIInput,
        humanRealityImpact: humanImpact,
      });

      // Human factors should reduce ROI
      expect(resultWithHuman.adjustedROI).toBeLessThan(resultWithoutHuman.adjustedROI);
      expect(resultWithHuman.successProbability).toBeLessThan(baseROIInput.baseSuccessProbability);
    });

    it("should calculate payback period", () => {
      const result = calculateROI(baseROIInput);

      // Payback period should be positive and reasonable
      expect(result.paybackMonths).toBeGreaterThan(0);
      expect(result.paybackMonths).toBeLessThan(12); // Within a year
    });

    it("should calculate NPV (Net Present Value)", () => {
      const result = calculateROI(baseROIInput);

      // NPV should be positive for profitable investment
      expect(result.npv).toBeGreaterThan(0);
    });

    it("should calculate profitability index", () => {
      const result = calculateROI(baseROIInput);

      // PI > 1 means profitable
      expect(result.profitabilityIndex).toBeGreaterThan(1);
    });

    it("should cap minimum success probability at 10%", () => {
      const riskyInput: ROIInput = {
        ...baseROIInput,
        baseSuccessProbability: 0.05,
        humanRealityImpact: {
          delayDays: 30,
          riskFactor: 3.0,
          successProbabilityAdjustment: -0.2, // Another -20%
          requiredInterventions: [],
        },
      };

      const result = calculateROI(riskyInput);

      expect(result.successProbability).toBeGreaterThanOrEqual(0.1);
    });

    it("should handle negative expected values (loss scenario)", () => {
      const lossInput: ROIInput = {
        valueRecoveredINR: 50000, // Very small recovery
        interventionCostINR: 200000, // High cost
        timeToValueMonths: 12,
        baseSuccessProbability: 0.3, // Low success chance
      };

      const result = calculateROI(lossInput);

      expect(result.adjustedROI).toBeLessThan(0);
    });

    it("should generate assessment text", () => {
      const result = calculateROI(baseROIInput);

      expect(result.assessment).toBeDefined();
      expect(result.assessment.length).toBeGreaterThan(0);
      // Assessment text should contain ROI status or profitability info
      expect(result.assessment).toBeTruthy();
    });
  });

  describe("Human Reality Impact Adjustment", () => {
    it("should reduce success probability with human factors", () => {
      const humanImpact: HumanRealityImpact = {
        delayDays: 14,
        riskFactor: 1.3,
        successProbabilityAdjustment: -0.2,
        requiredInterventions: ["owner_bottleneck", "follow_through_risk"],
      };

      const base = calculateROI(baseROIInput);
      const withHuman = calculateROI({
        ...baseROIInput,
        humanRealityImpact: humanImpact,
      });

      // Success probability should be reduced
      expect(withHuman.successProbability).toBeLessThan(base.successProbability);
    });

    it("should increase effective intervention cost with risk multiplier", () => {
      const lowRisk: HumanRealityImpact = {
        delayDays: 0,
        riskFactor: 1.0,
        successProbabilityAdjustment: 0,
        requiredInterventions: [],
      };
      const highRisk: HumanRealityImpact = {
        delayDays: 0,
        riskFactor: 2.5, // 150% cost increase
        successProbabilityAdjustment: 0,
        requiredInterventions: [],
      };

      const lowRiskResult = calculateROI({
        ...baseROIInput,
        humanRealityImpact: lowRisk,
      });
      const highRiskResult = calculateROI({
        ...baseROIInput,
        humanRealityImpact: highRisk,
      });

      expect(highRiskResult.interventionCostINR).toBeGreaterThan(lowRiskResult.interventionCostINR);
    });

    it("should account for execution delays extending timeline", () => {
      const noDelay: HumanRealityImpact = {
        delayDays: 0,
        riskFactor: 1.0,
        successProbabilityAdjustment: 0,
        requiredInterventions: [],
      };
      const withDelay: HumanRealityImpact = {
        delayDays: 30, // 1 month delay
        riskFactor: 1.0,
        successProbabilityAdjustment: 0,
        requiredInterventions: [],
      };

      const noDelayResult = calculateROI({
        ...baseROIInput,
        humanRealityImpact: noDelay,
      });
      const withDelayResult = calculateROI({
        ...baseROIInput,
        humanRealityImpact: withDelay,
      });

      // Delay should reduce ROI (time value of money)
      expect(withDelayResult.adjustedROI).toBeLessThan(noDelayResult.adjustedROI);
    });
  });

  describe("Engagement ROI Aggregation", () => {
    it("should aggregate ROI across multiple decisions", () => {
      const decisions = [
        {
          valueRecoveredINR: 500000,
          interventionCostINR: 100000,
          accuracyScore: 85,
        },
        {
          valueRecoveredINR: 300000,
          interventionCostINR: 80000,
          accuracyScore: 78,
        },
        {
          valueRecoveredINR: 400000,
          interventionCostINR: 90000,
          accuracyScore: 82,
        },
      ];

      const result = calculateEngagementROI("eng-123", decisions);

      expect(result.engagementId).toBe("eng-123");
      expect(result.totalValueRecoveredINR).toBe(1200000);
      expect(result.totalInterventionCostINR).toBe(270000);
      expect(result.decisionCount).toBe(3);
    });

    it("should calculate average accuracy", () => {
      const decisions = [
        {
          valueRecoveredINR: 500000,
          interventionCostINR: 100000,
          accuracyScore: 90,
        },
        {
          valueRecoveredINR: 300000,
          interventionCostINR: 80000,
          accuracyScore: 80,
        },
      ];

      const result = calculateEngagementROI("eng-456", decisions);

      // Average of 90 and 80
      expect(result.averageAccuracy).toBe(85);
    });

    it("should apply accuracy multiplier to ROI", () => {
      const highAccuracyDecisions = [
        {
          valueRecoveredINR: 500000,
          interventionCostINR: 100000,
          accuracyScore: 95, // High accuracy
        },
      ];
      const lowAccuracyDecisions = [
        {
          valueRecoveredINR: 500000,
          interventionCostINR: 100000,
          accuracyScore: 60, // Low accuracy
        },
      ];

      const highResult = calculateEngagementROI("eng-high", highAccuracyDecisions);
      const lowResult = calculateEngagementROI("eng-low", lowAccuracyDecisions);

      // High accuracy should have higher adjusted ROI
      expect(highResult.adjustedROI).toBeGreaterThan(lowResult.adjustedROI);
    });

    it("should calculate total profit", () => {
      const decisions = [
        {
          valueRecoveredINR: 500000,
          interventionCostINR: 100000,
          accuracyScore: 85,
        },
        {
          valueRecoveredINR: 300000,
          interventionCostINR: 80000,
          accuracyScore: 78,
        },
      ];

      const result = calculateEngagementROI("eng-789", decisions);

      expect(result.totalProfitINR).toBe(620000); // (500k + 300k) - (100k + 80k)
    });

    it("should handle empty decisions list", () => {
      const result = calculateEngagementROI("eng-empty", []);

      expect(result.engagementId).toBe("eng-empty");
      expect(result.totalValueRecoveredINR).toBe(0);
      expect(result.totalInterventionCostINR).toBe(0);
      expect(result.decisionCount).toBe(0);
    });
  });

  describe("ROI Comparison", () => {
    it("should compare ROI before and after improvements", () => {
      const baseResult = calculateROI(baseROIInput);
      const improvedInput: ROIInput = {
        ...baseROIInput,
        baseSuccessProbability: 0.95, // Increased confidence
      };
      const improvedResult = calculateROI(improvedInput);

      const comparison = compareROI(baseResult, improvedResult);

      expect(comparison.roiImprovement).toBeGreaterThan(0);
      expect(comparison.assessment).toBeDefined();
    });

    it("should show ROI degradation when conditions worsen", () => {
      const baseResult = calculateROI(baseROIInput);
      const worsened: ROIInput = {
        ...baseROIInput,
        baseSuccessProbability: 0.5, // Decreased confidence
      };
      const worsenedResult = calculateROI(worsened);

      const comparison = compareROI(baseResult, worsenedResult);

      expect(comparison.roiImprovement).toBeLessThan(0);
    });

    it("should track success probability changes", () => {
      const baseResult = calculateROI(baseROIInput);
      const withHuman: ROIInput = {
        ...baseROIInput,
        humanRealityImpact: {
          delayDays: 10,
          riskFactor: 1.2,
          successProbabilityAdjustment: -0.1,
          requiredInterventions: [],
        },
      };
      const withHumanResult = calculateROI(withHuman);

      const comparison = compareROI(baseResult, withHumanResult);

      expect(comparison.successProbabilityChange).toBeLessThan(0);
    });
  });

  describe("ROI Thresholds", () => {
    it("should recommend thresholds based on accuracy", () => {
      const highAccuracy = 0.95; // 95% accuracy
      const mediumAccuracy = 0.75; // 75% accuracy
      const lowAccuracy = 0.55; // 55% accuracy

      const highThresholds = recommendROIThreshold(highAccuracy);
      const mediumThresholds = recommendROIThreshold(mediumAccuracy);
      const lowThresholds = recommendROIThreshold(lowAccuracy);

      // Higher accuracy should have higher or equal thresholds
      expect(highThresholds.targetROI).toBeGreaterThanOrEqual(mediumThresholds.targetROI);
      expect(mediumThresholds.targetROI).toBeGreaterThanOrEqual(lowThresholds.targetROI);
    });

    it("should set minimum ROI at break-even", () => {
      const thresholds = recommendROIThreshold(0.8);

      expect(thresholds.minimumROI).toBeLessThanOrEqual(0);
    });
  });

  describe("Determinism", () => {
    it("should produce deterministic ROI calculations", () => {
      const result1 = calculateROI(baseROIInput);
      const result2 = calculateROI(baseROIInput);

      expect(result1.adjustedROI).toBe(result2.adjustedROI);
      expect(result1.npv).toBe(result2.npv);
      expect(result1.profitabilityIndex).toBe(result2.profitabilityIndex);
    });

    it("should produce deterministic aggregate results", () => {
      const decisions = [
        {
          valueRecoveredINR: 500000,
          interventionCostINR: 100000,
          accuracyScore: 85,
        },
      ];

      const result1 = calculateEngagementROI("eng-det", decisions);
      const result2 = calculateEngagementROI("eng-det", decisions);

      expect(result1.averageROI).toBe(result2.averageROI);
      expect(result1.adjustedROI).toBe(result2.adjustedROI);
    });
  });

  describe("Edge Cases", () => {
    it("should handle zero intervention cost (safety check)", () => {
      const zeroCostInput: ROIInput = {
        ...baseROIInput,
        interventionCostINR: 0,
      };

      const result = calculateROI(zeroCostInput);

      // Should use minimum of 1 to avoid division by zero
      expect(result.interventionCostINR).toBeGreaterThan(0);
      expect(isFinite(result.adjustedROI)).toBe(true);
    });

    it("should handle negative value recovered", () => {
      const negativeValue: ROIInput = {
        ...baseROIInput,
        valueRecoveredINR: -100000, // Loss scenario
      };

      const result = calculateROI(negativeValue);

      // Should floor at 0
      expect(result.grossValueINR).toBe(0);
    });

    it("should handle very high risk multiplier", () => {
      const extremeRisk: HumanRealityImpact = {
        delayDays: 90,
        riskFactor: 5.0, // 5x cost increase
        successProbabilityAdjustment: -0.3,
        requiredInterventions: [],
      };

      const result = calculateROI({
        ...baseROIInput,
        humanRealityImpact: extremeRisk,
      });

      // Should still calculate without errors
      expect(isFinite(result.adjustedROI)).toBe(true);
      expect(result.successProbability).toBeGreaterThanOrEqual(0.1);
    });

    it("should handle very long timelines", () => {
      const longTimeline: ROIInput = {
        ...baseROIInput,
        timeToValueMonths: 60, // 5 years
      };

      const result = calculateROI(longTimeline);

      // Long timeline should impact ROI (discount factor floors at 0.5)
      expect(result.timeDiscountFactor).toBeLessThanOrEqual(0.5);
    });
  });

  describe("Financial Determinism", () => {
    it("should use only deterministic operations", () => {
      const result = calculateROI(baseROIInput);

      // All fields should be numbers
      expect(typeof result.baseROI).toBe("number");
      expect(typeof result.adjustedROI).toBe("number");
      expect(typeof result.npv).toBe("number");
      expect(typeof result.paybackMonths).toBe("number");
      expect(typeof result.successProbability).toBe("number");

      // No NaN or Infinity
      expect(isFinite(result.baseROI)).toBe(true);
      expect(isFinite(result.adjustedROI)).toBe(true);
      expect(isFinite(result.npv)).toBe(true);
      expect(isFinite(result.paybackMonths)).toBe(true);
    });
  });
});
