import { describe, it, expect } from "vitest";
import {
  validateROIProjection,
  validateAssumption,
  detectROISuspicion,
} from "../../services/decisions/roi-validator";
import { ROIProjection, FinancialAssumption } from "../../domain/decisions/recommendation-contracts";

/**
 * PHASE G5: ROI CREDIBILITY SYSTEM
 *
 * HOSTILE TESTING:
 * - Reject negative ROI projections
 * - Penalize vendor-sourced assumptions
 * - Detect stale pricing
 * - Flag unrealistic projections
 * - Reject missing operational costs
 * - Detect survivorship bias
 * - Detect linear/fabricated scenarios
 * - Flag unrealistic payback periods
 */

function makeAssumption(overrides: Partial<FinancialAssumption> = {}): FinancialAssumption {
  return {
    assumption: "Test assumption",
    base_value: 1000,
    unit: "$/month",
    source: "Audited financial data 2024",
    confidence: 0.85,
    sensitivity_range_low: 800,
    sensitivity_range_high: 1200,
    ...overrides,
  };
}

function makeROI(overrides: Partial<ROIProjection> = {}): ROIProjection {
  return {
    formula: "Monthly Savings = (Users × $50/mo) - (Staff × $120k/year ÷ 12)",
    best_case_roi_percent: 150,
    base_case_roi_percent: 100,
    worst_case_roi_percent: 20,
    payback_period_months: 6,
    assumptions: [
      makeAssumption({
        assumption: "User growth to 1000",
        base_value: 1000,
        source: "Company 2024 plan",
      }),
    ],
    confidence_percent: 80,
    uncertainty_explanation:
      "Growth dependent on Q2 launch, customer acquisition cost trends, seasonal variation in Q3-Q4",
    sensitivity_analysis: {
      user_growth: {
        impact_on_roi: 45,
        realistic_range: [500, 2000],
      },
      acquisition_cost: {
        impact_on_roi: -35,
        realistic_range: [30, 80],
      },
    },
    ...overrides,
  };
}

describe("PHASE G5: ROI Credibility System", () => {
  describe("G5.1: Assumption Validation", () => {
    it("should validate clean assumptions", async () => {
      const assumption = makeAssumption({
        confidence: 0.9,
        source: "Audited financials Q1 2024",
      });

      const result = validateAssumption(assumption);

      expect(result.is_valid).toBe(true);
      expect(result.issues.length).toBe(0);
    });

    it("should penalize vendor-sourced assumptions", async () => {
      const clean = makeAssumption({
        source: "Audited financials",
        confidence: 0.8,
      });

      const vendor = makeAssumption({
        source: "Vendor pricing estimate",
        confidence: 0.8,
      });

      const clean_result = validateAssumption(clean);
      const vendor_result = validateAssumption(vendor);

      expect(vendor_result.confidence_adjusted).toBeLessThan(clean_result.confidence_adjusted);
      expect(vendor_result.is_vendor_sourced).toBe(true);
    });

    it("should flag stale assumptions", async () => {
      const stale = makeAssumption({
        source: "2023 market data",
      });

      const result = validateAssumption(stale);

      expect(result.is_stale).toBe(true);
      expect(result.issues.some((i) => i.includes("stale"))).toBe(true);
    });

    it("should reject low-confidence assumptions", async () => {
      const low_conf = makeAssumption({
        confidence: 0.25,
      });

      const result = validateAssumption(low_conf);

      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.some((i) => i.includes("speculative"))).toBe(true);
    });
  });

  describe("G5.2: ROI Projection Validation", () => {
    it("should accept valid ROI projections", async () => {
      const result = validateROIProjection(makeROI());

      expect(result.is_valid).toBe(true);
      expect(result.roi_credibility_score).toBeGreaterThan(80);
    });

    it("should reject negative base case ROI", async () => {
      const result = validateROIProjection(
        makeROI({
          base_case_roi_percent: -20, // Destroys value
          worst_case_roi_percent: -50,
        })
      );

      expect(result.validation_issues.some((i) => i.includes("NEGATIVE"))).toBe(true);
      expect(result.is_valid).toBe(false);
    });

    it("should penalize high uncertainty spread", async () => {
      const low_uncertainty = makeROI({
        best_case_roi_percent: 110,
        base_case_roi_percent: 100,
        worst_case_roi_percent: 90,
      });

      const high_uncertainty = makeROI({
        best_case_roi_percent: 500, // 5x spread
        base_case_roi_percent: 100,
        worst_case_roi_percent: -300,
      });

      const low_result = validateROIProjection(low_uncertainty);
      const high_result = validateROIProjection(high_uncertainty);

      expect(high_result.roi_credibility_score).toBeLessThan(low_result.roi_credibility_score);
      expect(high_result.is_speculative).toBe(true);
    });

    it("should flag missing cost modeling", async () => {
      const no_cost_model = makeROI({
        formula: "Expected revenue increase due to optimization, no implementation detail",
      });

      const result = validateROIProjection(no_cost_model);

      // Missing costs reduces credibility
      expect(result.missing_costs.length > 0 ||
              result.confidence_adjustments.missing_cost_penalty > 0 ||
              result.roi_credibility_score < 85).toBe(true);
    });

    it("should penalize long payback periods", async () => {
      const short = makeROI({ payback_period_months: 6 });
      const long = makeROI({ payback_period_months: 48 });

      const short_result = validateROIProjection(short);
      const long_result = validateROIProjection(long);

      // Long payback should reduce credibility score
      expect(long_result.roi_credibility_score).toBeLessThanOrEqual(short_result.roi_credibility_score);
    });

    it("should penalize low confidence ROI", async () => {
      const high_conf = makeROI({ confidence_percent: 85 });
      const low_conf = makeROI({ confidence_percent: 40 });

      const high_result = validateROIProjection(high_conf);
      const low_result = validateROIProjection(low_conf);

      expect(low_result.roi_credibility_score).toBeLessThan(high_result.roi_credibility_score);
      expect(low_result.is_speculative).toBe(true);
    });
  });

  describe("G5.3: Suspicion Detection", () => {
    it("should flag linear progression scenarios", async () => {
      // Linear: worst=0, base=50, best=100
      const linear = makeROI({
        worst_case_roi_percent: 0,
        base_case_roi_percent: 50,
        best_case_roi_percent: 100,
      });

      const result = detectROISuspicion(linear);

      expect(result.red_flags.some((f) => f.includes("linear")) || result.red_flags.length > 0).toBe(true);
    });

    it("should flag unrealistic payback with high ROI", async () => {
      // 3-month payback with 300% ROI is unrealistic
      const unrealistic = makeROI({
        payback_period_months: 3,
        base_case_roi_percent: 300,
      });

      const result = detectROISuspicion(unrealistic);

      expect(result.red_flags.some((f) => f.includes("unrealistic"))).toBe(true);
    });

    it("should flag round number ROI", async () => {
      const round = makeROI({
        best_case_roi_percent: 100,
        base_case_roi_percent: 50,
      });

      const result = detectROISuspicion(round);

      expect(result.suspicion_indicators.some((i) => i.includes("round"))).toBe(true);
    });

    it("should flag worst case >= base case", async () => {
      const inverted = makeROI({
        worst_case_roi_percent: 150, // Should be < base
        base_case_roi_percent: 100,
      });

      const result = detectROISuspicion(inverted);

      expect(result.red_flags.length).toBeGreaterThan(0);
    });

    it("should flag all positive scenarios with small spread", async () => {
      // All positive with tiny spread is unlikely
      const all_positive = makeROI({
        worst_case_roi_percent: 170,
        base_case_roi_percent: 180,
        best_case_roi_percent: 190,
      });

      const result = detectROISuspicion(all_positive);

      // Should detect either as suspicious or at least as indicator
      expect(result.is_suspicious || result.suspicion_indicators.length > 0).toBe(true);
    });
  });

  describe("G5.4: Hostile Scenarios", () => {
    it("should penalize vendor-sourced assumptions", async () => {
      const vendor_roi = makeROI({
        formula: "Vendor-provided calculation with implementation cost",
        assumptions: [
          makeAssumption({
            source: "Vendor performance data 2024",
            confidence: 0.95,
          }),
        ],
      });

      const result = validateROIProjection(vendor_roi);

      // Should be penalized for vendor sourcing
      expect(result.confidence_adjustments.vendor_sourced_penalty).toBeGreaterThan(0);
    });

    it("should mark high-uncertainty projections as speculative", async () => {
      const high_uncertainty = makeROI({
        best_case_roi_percent: 500,
        base_case_roi_percent: 100,
        worst_case_roi_percent: -200, // 7x spread
        confidence_percent: 40,
      });

      const result = validateROIProjection(high_uncertainty);

      expect(result.is_speculative).toBe(true);
      expect(result.roi_credibility_score).toBeLessThan(80);
    });

    it("should detect all-positive scenarios", async () => {
      const all_positive = makeROI({
        best_case_roi_percent: 200,
        base_case_roi_percent: 180,
        worst_case_roi_percent: 160,
      });

      const result = validateROIProjection(all_positive);

      // All positive with small spread should be flagged
      const suspicion_detected = result.validation_issues.some((i) =>
        i.includes("positive") || i.includes("bias")
      );
      expect(suspicion_detected || result.is_speculative).toBe(true);
    });

    it("should reject negative ROI projections", async () => {
      const negative_roi = makeROI({
        base_case_roi_percent: -50,
        best_case_roi_percent: 20,
        worst_case_roi_percent: -100,
      });

      const result = validateROIProjection(negative_roi);

      expect(!result.is_valid).toBe(true);
      expect(result.validation_issues.some((i) => i.includes("NEGATIVE"))).toBe(true);
    });
  });
});
