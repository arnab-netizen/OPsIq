import { describe, it, expect } from "vitest";
import { ImpactTracker } from "../impact-tracker";
import { ImpactDirection, MeasurementQuality } from "@/domain/outcome/impact";
import { v4 as uuidv4 } from "uuid";

describe("ImpactTracker", () => {
  const tracker = new ImpactTracker();
  const actionId = uuidv4();
  const decisionId = uuidv4();
  const workspaceId = uuidv4();

  describe("trackImpact", () => {
    it("should track positive impact", () => {
      const result = tracker.trackImpact({
        action_id: actionId,
        decision_id: decisionId,
        workspace_id: workspaceId,
        baseline_metric: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 100,
          unit: "USD",
        },
        actual_outcome: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 120,
          unit: "USD",
        },
        measurement_date: new Date(),
        measurement_confidence: 85,
      });

      expect(result.is_valid).toBe(true);
      expect(result.variance).toBe(20);
      expect(result.variance_pct).toBe(20);
      expect(result.impact_direction).toBe(ImpactDirection.POSITIVE);
    });

    it("should track negative impact", () => {
      const result = tracker.trackImpact({
        action_id: actionId,
        decision_id: decisionId,
        workspace_id: workspaceId,
        baseline_metric: {
          name: "Churn",
          baseline_value: 10,
          actual_value: 10,
          unit: "percent",
        },
        actual_outcome: {
          name: "Churn",
          baseline_value: 10,
          actual_value: 8,
          unit: "percent",
        },
        measurement_date: new Date(),
        measurement_confidence: 75,
      });

      expect(result.is_valid).toBe(true);
      expect(result.variance).toBe(-2);
      expect(result.variance_pct).toBe(-20);
      expect(result.impact_direction).toBe(ImpactDirection.NEGATIVE);
    });

    it("should track zero variance (neutral)", () => {
      const result = tracker.trackImpact({
        action_id: actionId,
        decision_id: decisionId,
        workspace_id: workspaceId,
        baseline_metric: {
          name: "Metric",
          baseline_value: 50,
          actual_value: 50,
          unit: "units",
        },
        actual_outcome: {
          name: "Metric",
          baseline_value: 50,
          actual_value: 50,
          unit: "units",
        },
        measurement_date: new Date(),
        measurement_confidence: 90,
      });

      expect(result.is_valid).toBe(true);
      expect(result.variance).toBe(0);
      expect(result.variance_pct).toBe(0);
      expect(result.impact_direction).toBe(ImpactDirection.NEUTRAL);
    });

    it("should reject missing baseline (fail-closed)", () => {
      const result = tracker.trackImpact({
        action_id: actionId,
        decision_id: decisionId,
        workspace_id: workspaceId,
        baseline_metric: null,
        actual_outcome: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 120,
          unit: "USD",
        },
        measurement_date: new Date(),
        measurement_confidence: 85,
      });

      expect(result.is_valid).toBe(false);
      expect(result.validation_errors.length).toBeGreaterThan(0);
      expect(result.validation_errors[0]).toContain("Baseline");
    });

    it("should reject missing actual (fail-closed)", () => {
      const result = tracker.trackImpact({
        action_id: actionId,
        decision_id: decisionId,
        workspace_id: workspaceId,
        baseline_metric: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 100,
          unit: "USD",
        },
        actual_outcome: null,
        measurement_date: new Date(),
        measurement_confidence: 85,
      });

      expect(result.is_valid).toBe(false);
      expect(result.validation_errors.length).toBeGreaterThan(0);
      expect(result.validation_errors[0]).toContain("Actual");
    });

    it("should reject undefined baseline", () => {
      const result = tracker.trackImpact({
        action_id: actionId,
        decision_id: decisionId,
        workspace_id: workspaceId,
        baseline_metric: undefined,
        actual_outcome: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 120,
          unit: "USD",
        },
        measurement_date: new Date(),
        measurement_confidence: 85,
      });

      expect(result.is_valid).toBe(false);
    });

    it("should reject undefined actual", () => {
      const result = tracker.trackImpact({
        action_id: actionId,
        decision_id: decisionId,
        workspace_id: workspaceId,
        baseline_metric: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 100,
          unit: "USD",
        },
        actual_outcome: undefined,
        measurement_date: new Date(),
        measurement_confidence: 85,
      });

      expect(result.is_valid).toBe(false);
    });
  });

  describe("variance calculation", () => {
    it("should calculate variance_pct correctly", () => {
      const result = tracker.trackImpact({
        action_id: actionId,
        decision_id: decisionId,
        workspace_id: workspaceId,
        baseline_metric: {
          name: "Value",
          baseline_value: 200,
          actual_value: 200,
          unit: "units",
        },
        actual_outcome: {
          name: "Value",
          baseline_value: 200,
          actual_value: 250,
          unit: "units",
        },
        measurement_date: new Date(),
        measurement_confidence: 80,
      });

      expect(result.variance).toBe(50);
      expect(result.variance_pct).toBe(25);
    });

    it("should handle zero baseline gracefully", () => {
      const result = tracker.trackImpact({
        action_id: actionId,
        decision_id: decisionId,
        workspace_id: workspaceId,
        baseline_metric: {
          name: "Value",
          baseline_value: 0,
          actual_value: 0,
          unit: "units",
        },
        actual_outcome: {
          name: "Value",
          baseline_value: 0,
          actual_value: 10,
          unit: "units",
        },
        measurement_date: new Date(),
        measurement_confidence: 80,
      });

      expect(result.variance).toBe(10);
      expect(result.variance_pct).toBe(0); // Cannot calculate percentage with zero baseline
    });

    it("should handle negative baseline", () => {
      const result = tracker.trackImpact({
        action_id: actionId,
        decision_id: decisionId,
        workspace_id: workspaceId,
        baseline_metric: {
          name: "Value",
          baseline_value: -100,
          actual_value: -100,
          unit: "units",
        },
        actual_outcome: {
          name: "Value",
          baseline_value: -100,
          actual_value: -50,
          unit: "units",
        },
        measurement_date: new Date(),
        measurement_confidence: 80,
      });

      expect(result.variance).toBe(50);
      expect(result.variance_pct).toBe(-50);
    });
  });

  describe("measurement quality", () => {
    it("should rate high confidence as HIGH quality", () => {
      const result = tracker.trackImpact({
        action_id: actionId,
        decision_id: decisionId,
        workspace_id: workspaceId,
        baseline_metric: {
          name: "Value",
          baseline_value: 100,
          actual_value: 100,
          unit: "units",
        },
        actual_outcome: {
          name: "Value",
          baseline_value: 100,
          actual_value: 110,
          unit: "units",
        },
        measurement_date: new Date(),
        measurement_confidence: 90,
      });

      expect(result.measurement_quality).toBe(MeasurementQuality.HIGH);
    });

    it("should rate medium confidence as MEDIUM quality", () => {
      const result = tracker.trackImpact({
        action_id: actionId,
        decision_id: decisionId,
        workspace_id: workspaceId,
        baseline_metric: {
          name: "Value",
          baseline_value: 100,
          actual_value: 100,
          unit: "units",
        },
        actual_outcome: {
          name: "Value",
          baseline_value: 100,
          actual_value: 110,
          unit: "units",
        },
        measurement_date: new Date(),
        measurement_confidence: 70,
      });

      expect(result.measurement_quality).toBe(MeasurementQuality.MEDIUM);
    });

    it("should rate low confidence as LOW quality", () => {
      const result = tracker.trackImpact({
        action_id: actionId,
        decision_id: decisionId,
        workspace_id: workspaceId,
        baseline_metric: {
          name: "Value",
          baseline_value: 100,
          actual_value: 100,
          unit: "units",
        },
        actual_outcome: {
          name: "Value",
          baseline_value: 100,
          actual_value: 110,
          unit: "units",
        },
        measurement_date: new Date(),
        measurement_confidence: 40,
      });

      expect(result.measurement_quality).toBe(MeasurementQuality.LOW);
    });
  });

  describe("isSufficientEvidence", () => {
    it("should accept confidence at threshold (50%)", () => {
      expect(tracker.isSufficientEvidence(50)).toBe(true);
    });

    it("should accept confidence above threshold", () => {
      expect(tracker.isSufficientEvidence(75)).toBe(true);
    });

    it("should reject confidence below threshold", () => {
      expect(tracker.isSufficientEvidence(49)).toBe(false);
    });

    it("should accept 100% confidence", () => {
      expect(tracker.isSufficientEvidence(100)).toBe(true);
    });
  });

  describe("getImpactMagnitude", () => {
    it("should return absolute value of variance", () => {
      const result = tracker.trackImpact({
        action_id: actionId,
        decision_id: decisionId,
        workspace_id: workspaceId,
        baseline_metric: {
          name: "Value",
          baseline_value: 100,
          actual_value: 100,
          unit: "units",
        },
        actual_outcome: {
          name: "Value",
          baseline_value: 100,
          actual_value: 70,
          unit: "units",
        },
        measurement_date: new Date(),
        measurement_confidence: 80,
      });

      expect(tracker.getImpactMagnitude(result)).toBe(30);
    });

    it("should return positive magnitude for positive variance", () => {
      const result = tracker.trackImpact({
        action_id: actionId,
        decision_id: decisionId,
        workspace_id: workspaceId,
        baseline_metric: {
          name: "Value",
          baseline_value: 100,
          actual_value: 100,
          unit: "units",
        },
        actual_outcome: {
          name: "Value",
          baseline_value: 100,
          actual_value: 150,
          unit: "units",
        },
        measurement_date: new Date(),
        measurement_confidence: 80,
      });

      expect(tracker.getImpactMagnitude(result)).toBe(50);
    });
  });

  describe("getImpactMagnitudePct", () => {
    it("should return absolute value of variance_pct", () => {
      const result = tracker.trackImpact({
        action_id: actionId,
        decision_id: decisionId,
        workspace_id: workspaceId,
        baseline_metric: {
          name: "Value",
          baseline_value: 100,
          actual_value: 100,
          unit: "units",
        },
        actual_outcome: {
          name: "Value",
          baseline_value: 100,
          actual_value: 80,
          unit: "units",
        },
        measurement_date: new Date(),
        measurement_confidence: 80,
      });

      expect(tracker.getImpactMagnitudePct(result)).toBe(20);
    });
  });

  describe("validateMetricCompatibility", () => {
    it("should accept compatible units", () => {
      const baseline = {
        name: "Revenue",
        baseline_value: 100,
        actual_value: 100,
        unit: "USD",
      };
      const actual = {
        name: "Revenue",
        baseline_value: 100,
        actual_value: 120,
        unit: "USD",
      };

      expect(tracker.validateMetricCompatibility(baseline, actual)).toBe(true);
    });

    it("should reject incompatible units", () => {
      const baseline = {
        name: "Revenue",
        baseline_value: 100,
        actual_value: 100,
        unit: "USD",
      };
      const actual = {
        name: "Revenue",
        baseline_value: 100,
        actual_value: 120,
        unit: "EUR",
      };

      expect(tracker.validateMetricCompatibility(baseline, actual)).toBe(false);
    });

    it("should reject null baseline", () => {
      const actual = {
        name: "Revenue",
        baseline_value: 100,
        actual_value: 120,
        unit: "USD",
      };

      expect(tracker.validateMetricCompatibility(null, actual)).toBe(false);
    });

    it("should reject null actual", () => {
      const baseline = {
        name: "Revenue",
        baseline_value: 100,
        actual_value: 100,
        unit: "USD",
      };

      expect(tracker.validateMetricCompatibility(baseline, null)).toBe(false);
    });
  });

  describe("workspace isolation", () => {
    it("should include workspace_id in result", () => {
      const result = tracker.trackImpact({
        action_id: actionId,
        decision_id: decisionId,
        workspace_id: workspaceId,
        baseline_metric: {
          name: "Value",
          baseline_value: 100,
          actual_value: 100,
          unit: "units",
        },
        actual_outcome: {
          name: "Value",
          baseline_value: 100,
          actual_value: 120,
          unit: "units",
        },
        measurement_date: new Date(),
        measurement_confidence: 80,
      });

      expect(result.workspace_id).toBe(workspaceId);
    });
  });

  describe("edge cases", () => {
    it("should handle very small variances", () => {
      const result = tracker.trackImpact({
        action_id: actionId,
        decision_id: decisionId,
        workspace_id: workspaceId,
        baseline_metric: {
          name: "Value",
          baseline_value: 1000,
          actual_value: 1000,
          unit: "units",
        },
        actual_outcome: {
          name: "Value",
          baseline_value: 1000,
          actual_value: 1001,
          unit: "units",
        },
        measurement_date: new Date(),
        measurement_confidence: 80,
      });

      expect(result.variance).toBe(1);
      expect(result.variance_pct).toBeCloseTo(0.1);
    });

    it("should handle large variances", () => {
      const result = tracker.trackImpact({
        action_id: actionId,
        decision_id: decisionId,
        workspace_id: workspaceId,
        baseline_metric: {
          name: "Value",
          baseline_value: 100,
          actual_value: 100,
          unit: "units",
        },
        actual_outcome: {
          name: "Value",
          baseline_value: 100,
          actual_value: 500,
          unit: "units",
        },
        measurement_date: new Date(),
        measurement_confidence: 80,
      });

      expect(result.variance).toBe(400);
      expect(result.variance_pct).toBe(400);
    });
  });
});
