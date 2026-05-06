import { describe, it, expect } from "vitest";
import { ConfidenceUpdater } from "../confidence-updater";
import { CONFIDENCE_RULES } from "@/domain/outcome/confidence";

describe("ConfidenceUpdater", () => {
  const updater = new ConfidenceUpdater();

  describe("Positive Outcome Increases Confidence", () => {
    it("should increase confidence on positive variance", () => {
      const result = updater.updateConfidence({
        current_confidence: 60,
        variance_pct: 10, // +10% variance
        measurement_confidence: 85,
      });

      expect(result.new_confidence).toBeGreaterThan(60);
      expect(result.confidence_change).toBeGreaterThan(0);
    });

    it("should cap increase at 20%", () => {
      const result = updater.updateConfidence({
        current_confidence: 50,
        variance_pct: 100, // Very large positive variance
        measurement_confidence: 90,
      });

      expect(result.confidence_change).toBeLessThanOrEqual(CONFIDENCE_RULES.positive_variance_max);
    });

    it("should scale increase with variance magnitude", () => {
      const result10 = updater.updateConfidence({
        current_confidence: 60,
        variance_pct: 10,
        measurement_confidence: 90,
      });

      const result20 = updater.updateConfidence({
        current_confidence: 60,
        variance_pct: 20,
        measurement_confidence: 90,
      });

      expect(result20.confidence_change).toBeGreaterThan(result10.confidence_change);
    });

    it("should handle small positive variances", () => {
      const result = updater.updateConfidence({
        current_confidence: 60,
        variance_pct: 1,
        measurement_confidence: 90,
      });

      expect(result.new_confidence).toBeGreaterThan(60);
      expect(result.confidence_change).toBeGreaterThan(0);
      expect(result.confidence_change).toBeLessThan(5);
    });

    it("should clamp result to 100% maximum", () => {
      const result = updater.updateConfidence({
        current_confidence: 90,
        variance_pct: 50,
        measurement_confidence: 95,
      });

      expect(result.new_confidence).toBeLessThanOrEqual(100);
    });
  });

  describe("Negative Outcome Decreases Confidence", () => {
    it("should decrease confidence on negative variance", () => {
      const result = updater.updateConfidence({
        current_confidence: 70,
        variance_pct: -10, // -10% variance
        measurement_confidence: 85,
      });

      expect(result.new_confidence).toBeLessThan(70);
      expect(result.confidence_change).toBeLessThan(0);
    });

    it("should cap decrease at 30%", () => {
      const result = updater.updateConfidence({
        current_confidence: 80,
        variance_pct: -100, // Very large negative variance
        measurement_confidence: 90,
      });

      expect(Math.abs(result.confidence_change)).toBeLessThanOrEqual(
        CONFIDENCE_RULES.negative_variance_max
      );
    });

    it("should scale decrease with variance magnitude", () => {
      const result10 = updater.updateConfidence({
        current_confidence: 70,
        variance_pct: -10,
        measurement_confidence: 90,
      });

      const result20 = updater.updateConfidence({
        current_confidence: 70,
        variance_pct: -20,
        measurement_confidence: 90,
      });

      expect(Math.abs(result20.confidence_change)).toBeGreaterThan(
        Math.abs(result10.confidence_change)
      );
    });

    it("should handle small negative variances", () => {
      const result = updater.updateConfidence({
        current_confidence: 70,
        variance_pct: -1,
        measurement_confidence: 90,
      });

      expect(result.new_confidence).toBeLessThan(70);
      expect(result.confidence_change).toBeLessThan(0);
      expect(Math.abs(result.confidence_change)).toBeLessThan(5);
    });

    it("should clamp result to 0% minimum", () => {
      const result = updater.updateConfidence({
        current_confidence: 10,
        variance_pct: -50,
        measurement_confidence: 95,
      });

      expect(result.new_confidence).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Repeated Failure Penalty", () => {
    it("should apply additional penalty for repeated failure", () => {
      const singleFailure = updater.updateConfidence({
        current_confidence: 60,
        variance_pct: -10,
        measurement_confidence: 85,
        previous_outcome: "unknown",
      });

      const repeatedFailure = updater.updateConfidence({
        current_confidence: 60,
        variance_pct: -10,
        measurement_confidence: 85,
        previous_outcome: "failure",
      });

      expect(repeatedFailure.confidence_change).toBeLessThan(singleFailure.confidence_change);
      expect(repeatedFailure.repeated_failure_penalty).toBe(true);
    });

    it("should apply 15% additional penalty for repeated failure with negative variance", () => {
      const result = updater.updateConfidence({
        current_confidence: 60,
        variance_pct: -5, // Small negative variance
        measurement_confidence: 85,
        previous_outcome: "failure",
      });

      // Negative variance + failure penalty should total more than just negative variance alone
      expect(result.confidence_change).toBeLessThan(-CONFIDENCE_RULES.repeated_failure_penalty);
    });

    it("should not apply penalty if previous outcome was success", () => {
      const result = updater.updateConfidence({
        current_confidence: 60,
        variance_pct: -10,
        measurement_confidence: 85,
        previous_outcome: "success",
      });

      expect(result.repeated_failure_penalty).toBe(false);
    });

    it("should not apply penalty on positive variance even with failure history", () => {
      const result = updater.updateConfidence({
        current_confidence: 60,
        variance_pct: 10,
        measurement_confidence: 85,
        previous_outcome: "failure",
      });

      expect(result.repeated_failure_penalty).toBe(false);
    });
  });

  describe("Low Measurement Confidence Capping", () => {
    it("should cap update to ±10% when measurement confidence is low", () => {
      const result = updater.updateConfidence({
        current_confidence: 60,
        variance_pct: 50, // Large positive variance
        measurement_confidence: 30, // Low measurement confidence
      });

      expect(Math.abs(result.confidence_change)).toBeLessThanOrEqual(
        CONFIDENCE_RULES.low_measurement_confidence_cap
      );
      expect(result.capped_due_to_measurement).toBe(true);
    });

    it("should cap large negative variance to ±10% with low measurement confidence", () => {
      const result = updater.updateConfidence({
        current_confidence: 70,
        variance_pct: -50,
        measurement_confidence: 40,
      });

      expect(Math.abs(result.confidence_change)).toBeLessThanOrEqual(
        CONFIDENCE_RULES.low_measurement_confidence_cap
      );
      expect(result.capped_due_to_measurement).toBe(true);
    });

    it("should not cap when measurement confidence is at threshold (60%)", () => {
      const result = updater.updateConfidence({
        current_confidence: 60,
        variance_pct: 50,
        measurement_confidence: 60,
      });

      expect(result.capped_due_to_measurement).toBe(false);
    });

    it("should not cap when measurement confidence is above threshold", () => {
      const result = updater.updateConfidence({
        current_confidence: 60,
        variance_pct: 50,
        measurement_confidence: 75,
      });

      expect(result.capped_due_to_measurement).toBe(false);
    });

    it("should cap at 59% measurement confidence (below threshold)", () => {
      const result = updater.updateConfidence({
        current_confidence: 60,
        variance_pct: 50,
        measurement_confidence: 59,
      });

      expect(result.capped_due_to_measurement).toBe(true);
      expect(Math.abs(result.confidence_change)).toBeLessThanOrEqual(
        CONFIDENCE_RULES.low_measurement_confidence_cap
      );
    });
  });

  describe("Zero Variance", () => {
    it("should have no change on zero variance without failure history", () => {
      const result = updater.updateConfidence({
        current_confidence: 60,
        variance_pct: 0,
        measurement_confidence: 85,
        previous_outcome: "unknown",
      });

      expect(result.confidence_change).toBe(0);
      expect(result.new_confidence).toBe(60);
    });

    it("should not apply penalty on zero variance even with failure history (needs negative variance)", () => {
      const result = updater.updateConfidence({
        current_confidence: 60,
        variance_pct: 0,
        measurement_confidence: 85,
        previous_outcome: "failure",
      });

      // Zero variance = no change, even with failure history (penalty only applies with negative variance)
      expect(result.confidence_change).toBe(0);
      expect(result.repeated_failure_penalty).toBe(false);
    });
  });

  describe("Boundary Cases", () => {
    it("should not exceed 100% confidence", () => {
      const result = updater.updateConfidence({
        current_confidence: 95,
        variance_pct: 50,
        measurement_confidence: 95,
      });

      expect(result.new_confidence).toBeLessThanOrEqual(100);
    });

    it("should not go below 0% confidence", () => {
      const result = updater.updateConfidence({
        current_confidence: 5,
        variance_pct: -50,
        measurement_confidence: 95,
      });

      expect(result.new_confidence).toBeGreaterThanOrEqual(0);
    });

    it("should handle starting at 0% confidence", () => {
      const result = updater.updateConfidence({
        current_confidence: 0,
        variance_pct: 10,
        measurement_confidence: 85,
      });

      expect(result.new_confidence).toBeGreaterThan(0);
      expect(result.new_confidence).toBeLessThanOrEqual(100);
    });

    it("should handle starting at 100% confidence", () => {
      const result = updater.updateConfidence({
        current_confidence: 100,
        variance_pct: -10,
        measurement_confidence: 85,
      });

      expect(result.new_confidence).toBeLessThan(100);
      expect(result.new_confidence).toBeGreaterThanOrEqual(0);
    });

    it("should clamp change when hitting boundaries", () => {
      const result = updater.updateConfidence({
        current_confidence: 95,
        variance_pct: 100,
        measurement_confidence: 95,
      });

      const actual_change = result.new_confidence - 95;
      expect(actual_change).toBe(5); // Clamped to reach 100
    });
  });

  describe("Input Validation", () => {
    it("should reject confidence above 100%", () => {
      const result = updater.updateConfidence({
        current_confidence: 105,
        variance_pct: 10,
        measurement_confidence: 85,
      });

      expect(result.confidence_change).toBe(0);
      expect(result.new_confidence).toBe(105);
      expect(result.update_reason).toContain("Invalid input");
    });

    it("should reject confidence below 0%", () => {
      const result = updater.updateConfidence({
        current_confidence: -5,
        variance_pct: 10,
        measurement_confidence: 85,
      });

      expect(result.confidence_change).toBe(0);
      expect(result.update_reason).toContain("Invalid input");
    });

    it("should reject measurement confidence above 100%", () => {
      const result = updater.updateConfidence({
        current_confidence: 60,
        variance_pct: 10,
        measurement_confidence: 105,
      });

      expect(result.confidence_change).toBe(0);
      expect(result.update_reason).toContain("Invalid input");
    });

    it("should reject measurement confidence below 0%", () => {
      const result = updater.updateConfidence({
        current_confidence: 60,
        variance_pct: 10,
        measurement_confidence: -5,
      });

      expect(result.confidence_change).toBe(0);
      expect(result.update_reason).toContain("Invalid input");
    });
  });

  describe("Helper Methods", () => {
    it("isSufficientConfidence should return true for >50%", () => {
      expect(updater.isSufficientConfidence(51)).toBe(true);
      expect(updater.isSufficientConfidence(75)).toBe(true);
      expect(updater.isSufficientConfidence(100)).toBe(true);
    });

    it("isSufficientConfidence should return false for <=50%", () => {
      expect(updater.isSufficientConfidence(50)).toBe(false);
      expect(updater.isSufficientConfidence(30)).toBe(false);
      expect(updater.isSufficientConfidence(0)).toBe(false);
    });

    it("isHighConfidence should return true for >70%", () => {
      expect(updater.isHighConfidence(71)).toBe(true);
      expect(updater.isHighConfidence(85)).toBe(true);
      expect(updater.isHighConfidence(100)).toBe(true);
    });

    it("isHighConfidence should return false for <=70%", () => {
      expect(updater.isHighConfidence(70)).toBe(false);
      expect(updater.isHighConfidence(50)).toBe(false);
      expect(updater.isHighConfidence(0)).toBe(false);
    });

    it("isLowConfidence should return true for <50%", () => {
      expect(updater.isLowConfidence(49)).toBe(true);
      expect(updater.isLowConfidence(25)).toBe(true);
      expect(updater.isLowConfidence(0)).toBe(true);
    });

    it("isLowConfidence should return false for >=50%", () => {
      expect(updater.isLowConfidence(50)).toBe(false);
      expect(updater.isLowConfidence(75)).toBe(false);
      expect(updater.isLowConfidence(100)).toBe(false);
    });

    it("getConfidenceTrend should return improving for increase >5%", () => {
      const trend = updater.getConfidenceTrend(50, 56);
      expect(trend).toBe("improving");
    });

    it("getConfidenceTrend should return declining for decrease >5%", () => {
      const trend = updater.getConfidenceTrend(70, 64);
      expect(trend).toBe("declining");
    });

    it("getConfidenceTrend should return stable for change <=5%", () => {
      expect(updater.getConfidenceTrend(60, 60)).toBe("stable");
      expect(updater.getConfidenceTrend(60, 63)).toBe("stable");
      expect(updater.getConfidenceTrend(60, 57)).toBe("stable");
    });
  });

  describe("Reason Messages", () => {
    it("should include variance magnitude in reason", () => {
      const result = updater.updateConfidence({
        current_confidence: 60,
        variance_pct: 15,
        measurement_confidence: 85,
      });

      expect(result.update_reason).toContain("Positive");
    });

    it("should indicate capping in reason", () => {
      const result = updater.updateConfidence({
        current_confidence: 60,
        variance_pct: 50,
        measurement_confidence: 30,
      });

      expect(result.update_reason).toContain("capped");
    });

    it("should indicate repeated failure penalty in reason", () => {
      const result = updater.updateConfidence({
        current_confidence: 60,
        variance_pct: -10,
        measurement_confidence: 85,
        previous_outcome: "failure",
      });

      expect(result.update_reason).toContain("Repeated failure");
    });
  });

  describe("Combined Effects", () => {
    it("should apply negative variance + repeated failure + low measurement confidence", () => {
      const result = updater.updateConfidence({
        current_confidence: 70,
        variance_pct: -50, // Would cause -30% decrease
        measurement_confidence: 40, // Capped to ±10%
        previous_outcome: "failure", // Would add -15%
      });

      // With capping to ±10%, the large negative variance gets capped
      expect(result.new_confidence).toBeLessThan(70);
      expect(result.capped_due_to_measurement).toBe(true);
      expect(result.repeated_failure_penalty).toBe(true);
    });

    it("should handle positive variance with high measurement confidence", () => {
      const result = updater.updateConfidence({
        current_confidence: 50,
        variance_pct: 30,
        measurement_confidence: 95,
        previous_outcome: "success",
      });

      // Should get full positive update without capping
      expect(result.new_confidence).toBeGreaterThan(50);
      expect(result.capped_due_to_measurement).toBe(false);
      expect(result.repeated_failure_penalty).toBe(false);
    });
  });
});
