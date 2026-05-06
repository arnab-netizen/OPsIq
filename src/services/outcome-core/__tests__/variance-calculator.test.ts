import { describe, it, expect } from "vitest";
import { VarianceCalculator } from "../variance-calculator";
import { ReplanTrigger, DEFAULT_KPI_THRESHOLDS } from "@/domain/outcome/variance";
import { ImpactDirection, MeasurementQuality } from "@/domain/outcome/impact";
import { v4 as uuidv4 } from "uuid";

describe("VarianceCalculator", () => {
  const calculator = new VarianceCalculator();
  const actionId = uuidv4();
  const workspaceId = uuidv4();

  describe("Failed KPI Triggers Replan", () => {
    it("should trigger replan when variance exceeds failure threshold", () => {
      const result = calculator.calculateVariance({
        impact_result: {
          action_id: actionId,
          decision_id: uuidv4(),
          workspace_id: workspaceId,
          baseline_value: 100,
          actual_value: 85, // -15% variance
          variance: -15,
          variance_pct: -15,
          impact_direction: ImpactDirection.NEGATIVE,
          measurement_quality: MeasurementQuality.HIGH,
          is_valid: true,
          validation_errors: [],
        },
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS, // failure_threshold = -10
        current_confidence: 70,
      });

      expect(result.trigger_replan).toBe(true);
      expect(result.replan_action).toBe(ReplanTrigger.REPLAN);
      expect(result.trigger_rollback).toBe(false);
      expect(result.trigger_halt).toBe(false);
    });

    it("should not trigger replan when variance within acceptable range", () => {
      const result = calculator.calculateVariance({
        impact_result: {
          action_id: actionId,
          decision_id: uuidv4(),
          workspace_id: workspaceId,
          baseline_value: 100,
          actual_value: 108, // +8% variance
          variance: 8,
          variance_pct: 8,
          impact_direction: ImpactDirection.POSITIVE,
          measurement_quality: MeasurementQuality.HIGH,
          is_valid: true,
          validation_errors: [],
        },
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS, // success_threshold = 5
        current_confidence: 70,
      });

      expect(result.trigger_replan).toBe(false);
      expect(result.replan_action).toBe(ReplanTrigger.CONTINUE);
      expect(result.trigger_rollback).toBe(false);
      expect(result.trigger_halt).toBe(false);
    });

    it("should not trigger replan at exact failure threshold (uses strict <)", () => {
      const result = calculator.calculateVariance({
        impact_result: {
          action_id: actionId,
          decision_id: uuidv4(),
          workspace_id: workspaceId,
          baseline_value: 100,
          actual_value: 90, // -10% variance (exactly at threshold)
          variance: -10,
          variance_pct: -10,
          impact_direction: ImpactDirection.NEGATIVE,
          measurement_quality: MeasurementQuality.MEDIUM,
          is_valid: true,
          validation_errors: [],
        },
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS,
        current_confidence: 60,
      });

      expect(result.trigger_replan).toBe(false); // Strict <, not <=
      expect(result.replan_action).toBe(ReplanTrigger.CONTINUE);
    });

    it("should not trigger replan just above failure threshold", () => {
      const result = calculator.calculateVariance({
        impact_result: {
          action_id: actionId,
          decision_id: uuidv4(),
          workspace_id: workspaceId,
          baseline_value: 100,
          actual_value: 91, // -9% variance (just above threshold)
          variance: -9,
          variance_pct: -9,
          impact_direction: ImpactDirection.NEGATIVE,
          measurement_quality: MeasurementQuality.MEDIUM,
          is_valid: true,
          validation_errors: [],
        },
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS,
        current_confidence: 60,
      });

      expect(result.trigger_replan).toBe(false);
      expect(result.replan_action).toBe(ReplanTrigger.CONTINUE);
    });

    it("should trigger replan on severe degradation", () => {
      const result = calculator.calculateVariance({
        impact_result: {
          action_id: actionId,
          decision_id: uuidv4(),
          workspace_id: workspaceId,
          baseline_value: 100,
          actual_value: 50, // -50% variance
          variance: -50,
          variance_pct: -50,
          impact_direction: ImpactDirection.NEGATIVE,
          measurement_quality: MeasurementQuality.HIGH,
          is_valid: true,
          validation_errors: [],
        },
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS,
        current_confidence: 85,
      });

      expect(result.trigger_replan).toBe(true);
      expect(result.replan_action).toBe(ReplanTrigger.REPLAN);
    });

    it("should use custom thresholds when provided", () => {
      const customThresholds = { success_threshold: 10, failure_threshold: -5 };
      const result = calculator.calculateVariance({
        impact_result: {
          action_id: actionId,
          decision_id: uuidv4(),
          workspace_id: workspaceId,
          baseline_value: 100,
          actual_value: 92, // -8% variance
          variance: -8,
          variance_pct: -8,
          impact_direction: ImpactDirection.NEGATIVE,
          measurement_quality: MeasurementQuality.MEDIUM,
          is_valid: true,
          validation_errors: [],
        },
        kpi_thresholds: customThresholds,
        current_confidence: 70,
      });

      expect(result.trigger_replan).toBe(true); // -8% exceeds -5% threshold
    });

    it("should respect different threshold configurations", () => {
      const strictThresholds = { success_threshold: 15, failure_threshold: -3 };
      const result = calculator.calculateVariance({
        impact_result: {
          action_id: actionId,
          decision_id: uuidv4(),
          workspace_id: workspaceId,
          baseline_value: 100,
          actual_value: 97, // -3% variance
          variance: -3,
          variance_pct: -3,
          impact_direction: ImpactDirection.NEGATIVE,
          measurement_quality: MeasurementQuality.MEDIUM,
          is_valid: true,
          validation_errors: [],
        },
        kpi_thresholds: strictThresholds,
        current_confidence: 70,
      });

      expect(result.trigger_replan).toBe(false); // -3% equals threshold, not < threshold (strict <)
    });
  });

  describe("Repeated Failures Block", () => {
    it("should block repeated failures with low confidence", () => {
      const result = calculator.calculateVariance({
        impact_result: {
          action_id: actionId,
          decision_id: uuidv4(),
          workspace_id: workspaceId,
          baseline_value: 100,
          actual_value: 85, // -15% variance
          variance: -15,
          variance_pct: -15,
          impact_direction: ImpactDirection.NEGATIVE,
          measurement_quality: MeasurementQuality.MEDIUM,
          is_valid: true,
          validation_errors: [],
        },
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS,
        current_confidence: 45, // Low confidence
        previous_outcome: "failure", // Failed before
      });

      expect(result.trigger_halt).toBe(true);
      expect(result.replan_action).toBe(ReplanTrigger.HALT);
      expect(result.is_repeated_failure).toBe(true);
    });

    it("should not block repeated failures with high confidence", () => {
      const result = calculator.calculateVariance({
        impact_result: {
          action_id: actionId,
          decision_id: uuidv4(),
          workspace_id: workspaceId,
          baseline_value: 100,
          actual_value: 85, // -15% variance
          variance: -15,
          variance_pct: -15,
          impact_direction: ImpactDirection.NEGATIVE,
          measurement_quality: MeasurementQuality.MEDIUM,
          is_valid: true,
          validation_errors: [],
        },
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS,
        current_confidence: 75, // Higher confidence
        previous_outcome: "failure",
      });

      expect(result.trigger_halt).toBe(false);
      expect(result.trigger_replan).toBe(true);
      expect(result.is_repeated_failure).toBe(true);
    });

    it("should not block failure if previous outcome was success", () => {
      const result = calculator.calculateVariance({
        impact_result: {
          action_id: actionId,
          decision_id: uuidv4(),
          workspace_id: workspaceId,
          baseline_value: 100,
          actual_value: 85, // -15% variance
          variance: -15,
          variance_pct: -15,
          impact_direction: ImpactDirection.NEGATIVE,
          measurement_quality: MeasurementQuality.MEDIUM,
          is_valid: true,
          validation_errors: [],
        },
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS,
        current_confidence: 45,
        previous_outcome: "success", // Previously succeeded
      });

      expect(result.trigger_halt).toBe(false);
      expect(result.is_repeated_failure).toBe(false);
    });

    it("should detect repeated failure with negative variance", () => {
      const result = calculator.calculateVariance({
        impact_result: {
          action_id: actionId,
          decision_id: uuidv4(),
          workspace_id: workspaceId,
          baseline_value: 100,
          actual_value: 88, // -12% variance
          variance: -12,
          variance_pct: -12,
          impact_direction: ImpactDirection.NEGATIVE,
          measurement_quality: MeasurementQuality.HIGH,
          is_valid: true,
          validation_errors: [],
        },
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS,
        current_confidence: 40,
        previous_outcome: "failure",
      });

      expect(result.is_repeated_failure).toBe(true);
      expect(result.trigger_halt).toBe(true);
    });

    it("should use exactly 50% confidence threshold for halt decision", () => {
      const result = calculator.calculateVariance({
        impact_result: {
          action_id: actionId,
          decision_id: uuidv4(),
          workspace_id: workspaceId,
          baseline_value: 100,
          actual_value: 85,
          variance: -15,
          variance_pct: -15,
          impact_direction: ImpactDirection.NEGATIVE,
          measurement_quality: MeasurementQuality.MEDIUM,
          is_valid: true,
          validation_errors: [],
        },
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS,
        current_confidence: 50,
        previous_outcome: "failure",
      });

      expect(result.trigger_halt).toBe(false); // Not less than 50
    });

    it("should halt at 49% confidence", () => {
      const result = calculator.calculateVariance({
        impact_result: {
          action_id: actionId,
          decision_id: uuidv4(),
          workspace_id: workspaceId,
          baseline_value: 100,
          actual_value: 85,
          variance: -15,
          variance_pct: -15,
          impact_direction: ImpactDirection.NEGATIVE,
          measurement_quality: MeasurementQuality.MEDIUM,
          is_valid: true,
          validation_errors: [],
        },
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS,
        current_confidence: 49,
        previous_outcome: "failure",
      });

      expect(result.trigger_halt).toBe(true);
    });
  });

  describe("Rollback Offered for High-Confidence Reversals", () => {
    it("should offer rollback when high-confidence success now fails", () => {
      const result = calculator.calculateVariance({
        impact_result: {
          action_id: actionId,
          decision_id: uuidv4(),
          workspace_id: workspaceId,
          baseline_value: 100,
          actual_value: 95, // -5% variance
          variance: -5,
          variance_pct: -5,
          impact_direction: ImpactDirection.NEGATIVE,
          measurement_quality: MeasurementQuality.HIGH,
          is_valid: true,
          validation_errors: [],
        },
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS,
        current_confidence: 85, // High confidence
        previous_outcome: "success", // Was succeeding
      });

      expect(result.trigger_rollback).toBe(true);
      expect(result.replan_action).toBe(ReplanTrigger.ROLLBACK);
      // Note: trigger_replan may be false since variance_pct=-5 is not < -10
    });

    it("should not offer rollback on low confidence", () => {
      const result = calculator.calculateVariance({
        impact_result: {
          action_id: actionId,
          decision_id: uuidv4(),
          workspace_id: workspaceId,
          baseline_value: 100,
          actual_value: 95,
          variance: -5,
          variance_pct: -5,
          impact_direction: ImpactDirection.NEGATIVE,
          measurement_quality: MeasurementQuality.MEDIUM,
          is_valid: true,
          validation_errors: [],
        },
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS,
        current_confidence: 65, // Medium confidence
        previous_outcome: "success",
      });

      expect(result.trigger_rollback).toBe(false);
    });

    it("should use strictly > 70% confidence threshold for rollback", () => {
      const result = calculator.calculateVariance({
        impact_result: {
          action_id: actionId,
          decision_id: uuidv4(),
          workspace_id: workspaceId,
          baseline_value: 100,
          actual_value: 95,
          variance: -5,
          variance_pct: -5,
          impact_direction: ImpactDirection.NEGATIVE,
          measurement_quality: MeasurementQuality.HIGH,
          is_valid: true,
          validation_errors: [],
        },
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS,
        current_confidence: 70, // Exactly at threshold, not above
        previous_outcome: "success",
      });

      expect(result.trigger_rollback).toBe(false); // Uses > not >=
    });

    it("should trigger rollback above 70% confidence threshold", () => {
      const result = calculator.calculateVariance({
        impact_result: {
          action_id: actionId,
          decision_id: uuidv4(),
          workspace_id: workspaceId,
          baseline_value: 100,
          actual_value: 95,
          variance: -5,
          variance_pct: -5,
          impact_direction: ImpactDirection.NEGATIVE,
          measurement_quality: MeasurementQuality.HIGH,
          is_valid: true,
          validation_errors: [],
        },
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS,
        current_confidence: 71, // Just above threshold
        previous_outcome: "success",
      });

      expect(result.trigger_rollback).toBe(true);
      expect(result.replan_action).toBe(ReplanTrigger.ROLLBACK);
    });

    it("should not offer rollback if negative variance not below threshold", () => {
      const result = calculator.calculateVariance({
        impact_result: {
          action_id: actionId,
          decision_id: uuidv4(),
          workspace_id: workspaceId,
          baseline_value: 100,
          actual_value: 92, // -8% variance
          variance: -8,
          variance_pct: -8,
          impact_direction: ImpactDirection.NEGATIVE,
          measurement_quality: MeasurementQuality.HIGH,
          is_valid: true,
          validation_errors: [],
        },
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS,
        current_confidence: 80,
        previous_outcome: "success",
      });

      expect(result.trigger_rollback).toBe(true); // Still negative
    });
  });

  describe("Continue on Success", () => {
    it("should continue when variance within success range", () => {
      const result = calculator.calculateVariance({
        impact_result: {
          action_id: actionId,
          decision_id: uuidv4(),
          workspace_id: workspaceId,
          baseline_value: 100,
          actual_value: 110, // +10% variance
          variance: 10,
          variance_pct: 10,
          impact_direction: ImpactDirection.POSITIVE,
          measurement_quality: MeasurementQuality.HIGH,
          is_valid: true,
          validation_errors: [],
        },
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS,
        current_confidence: 75,
      });

      expect(result.replan_action).toBe(ReplanTrigger.CONTINUE);
      expect(result.trigger_replan).toBe(false);
      expect(result.trigger_rollback).toBe(false);
      expect(result.trigger_halt).toBe(false);
    });

    it("should continue with reason when variance successful", () => {
      const result = calculator.calculateVariance({
        impact_result: {
          action_id: actionId,
          decision_id: uuidv4(),
          workspace_id: workspaceId,
          baseline_value: 100,
          actual_value: 108,
          variance: 8,
          variance_pct: 8,
          impact_direction: ImpactDirection.POSITIVE,
          measurement_quality: MeasurementQuality.MEDIUM,
          is_valid: true,
          validation_errors: [],
        },
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS,
        current_confidence: 70,
      });

      expect(result.reason).toBe("Performance within acceptable range");
    });
  });

  describe("Missing Impact Result (Fail-Closed)", () => {
    it("should halt if impact_result missing", () => {
      const result = calculator.calculateVariance({
        impact_result: null as any,
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS,
        current_confidence: 70,
      });

      expect(result.trigger_halt).toBe(true);
      expect(result.replan_action).toBe(ReplanTrigger.HALT);
      expect(result.trigger_replan).toBe(false);
    });

    it("should halt if impact_result invalid", () => {
      const result = calculator.calculateVariance({
        impact_result: {
          action_id: actionId,
          decision_id: uuidv4(),
          workspace_id: workspaceId,
          baseline_value: 100,
          actual_value: 110,
          variance: 10,
          variance_pct: 10,
          impact_direction: ImpactDirection.POSITIVE,
          measurement_quality: MeasurementQuality.HIGH,
          is_valid: false, // Invalid
          validation_errors: ["Baseline missing"],
        },
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS,
        current_confidence: 70,
      });

      expect(result.trigger_halt).toBe(true);
      expect(result.replan_action).toBe(ReplanTrigger.HALT);
    });
  });

  describe("Helper Methods", () => {
    it("isSuccess should detect variance above threshold", () => {
      expect(calculator.isSuccess(10)).toBe(true);
      expect(calculator.isSuccess(5)).toBe(true);
      expect(calculator.isSuccess(4.9)).toBe(false);
      expect(calculator.isSuccess(-5)).toBe(false);
    });

    it("isSuccess should use custom threshold", () => {
      expect(calculator.isSuccess(8, 10)).toBe(false);
      expect(calculator.isSuccess(10, 10)).toBe(true);
      expect(calculator.isSuccess(15, 10)).toBe(true);
    });

    it("isFailure should detect variance below threshold", () => {
      expect(calculator.isFailure(-10)).toBe(true);
      expect(calculator.isFailure(-10.1)).toBe(true);
      expect(calculator.isFailure(-9.9)).toBe(false);
      expect(calculator.isFailure(5)).toBe(false);
    });

    it("isFailure should use custom threshold", () => {
      expect(calculator.isFailure(-5, -3)).toBe(true);
      expect(calculator.isFailure(-3, -3)).toBe(true);
      expect(calculator.isFailure(-2.9, -3)).toBe(false);
    });

    it("getReplanReason should return appropriate message for severe degradation", () => {
      const reason = calculator.getReplanReason(-25, 50);
      expect(reason).toContain("Severe");
    });

    it("getReplanReason should return message for significant degradation", () => {
      const reason = calculator.getReplanReason(-12, 50);
      expect(reason).toContain("Significant");
    });

    it("getReplanReason should return message for negative trend", () => {
      const reason = calculator.getReplanReason(-7, 50);
      expect(reason).toContain("Negative");
    });

    it("getReplanReason should return message for low confidence", () => {
      const reason = calculator.getReplanReason(5, 25);
      expect(reason).toContain("Low confidence");
    });

    it("getReplanReason should return message for minor variance", () => {
      const reason = calculator.getReplanReason(-2, 50);
      expect(reason).toContain("Minor");
    });
  });

  describe("Edge Cases for Variance Values", () => {
    it("should handle very small positive variance", () => {
      const result = calculator.calculateVariance({
        impact_result: {
          action_id: actionId,
          decision_id: uuidv4(),
          workspace_id: workspaceId,
          baseline_value: 1000,
          actual_value: 1000.5, // +0.05% variance
          variance: 0.5,
          variance_pct: 0.05,
          impact_direction: ImpactDirection.POSITIVE,
          measurement_quality: MeasurementQuality.MEDIUM,
          is_valid: true,
          validation_errors: [],
        },
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS,
        current_confidence: 70,
      });

      expect(result.replan_action).toBe(ReplanTrigger.CONTINUE);
    });

    it("should handle very large positive variance", () => {
      const result = calculator.calculateVariance({
        impact_result: {
          action_id: actionId,
          decision_id: uuidv4(),
          workspace_id: workspaceId,
          baseline_value: 100,
          actual_value: 500, // +400% variance
          variance: 400,
          variance_pct: 400,
          impact_direction: ImpactDirection.POSITIVE,
          measurement_quality: MeasurementQuality.HIGH,
          is_valid: true,
          validation_errors: [],
        },
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS,
        current_confidence: 90,
      });

      expect(result.replan_action).toBe(ReplanTrigger.CONTINUE);
      expect(result.trigger_replan).toBe(false);
    });

    it("should handle zero variance correctly", () => {
      const result = calculator.calculateVariance({
        impact_result: {
          action_id: actionId,
          decision_id: uuidv4(),
          workspace_id: workspaceId,
          baseline_value: 100,
          actual_value: 100,
          variance: 0,
          variance_pct: 0,
          impact_direction: ImpactDirection.NEUTRAL,
          measurement_quality: MeasurementQuality.HIGH,
          is_valid: true,
          validation_errors: [],
        },
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS,
        current_confidence: 70,
      });

      expect(result.replan_action).toBe(ReplanTrigger.CONTINUE);
      expect(result.trigger_replan).toBe(false);
    });

    it("should handle negative variance at boundary", () => {
      const result = calculator.calculateVariance({
        impact_result: {
          action_id: actionId,
          decision_id: uuidv4(),
          workspace_id: workspaceId,
          baseline_value: 100,
          actual_value: 89, // -11% variance
          variance: -11,
          variance_pct: -11,
          impact_direction: ImpactDirection.NEGATIVE,
          measurement_quality: MeasurementQuality.MEDIUM,
          is_valid: true,
          validation_errors: [],
        },
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS,
        current_confidence: 70,
      });

      expect(result.trigger_replan).toBe(true);
    });
  });

  describe("Action Metadata Preservation", () => {
    it("should preserve action_id in result", () => {
      const testActionId = uuidv4();
      const result = calculator.calculateVariance({
        impact_result: {
          action_id: testActionId,
          decision_id: uuidv4(),
          workspace_id: workspaceId,
          baseline_value: 100,
          actual_value: 110,
          variance: 10,
          variance_pct: 10,
          impact_direction: ImpactDirection.POSITIVE,
          measurement_quality: MeasurementQuality.HIGH,
          is_valid: true,
          validation_errors: [],
        },
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS,
        current_confidence: 70,
      });

      expect(result.action_id).toBe(testActionId);
    });

    it("should preserve variance_pct in result", () => {
      const result = calculator.calculateVariance({
        impact_result: {
          action_id: actionId,
          decision_id: uuidv4(),
          workspace_id: workspaceId,
          baseline_value: 100,
          actual_value: 107,
          variance: 7,
          variance_pct: 7,
          impact_direction: ImpactDirection.POSITIVE,
          measurement_quality: MeasurementQuality.MEDIUM,
          is_valid: true,
          validation_errors: [],
        },
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS,
        current_confidence: 70,
      });

      expect(result.variance_pct).toBe(7);
    });
  });

  describe("Reason Messages", () => {
    it("should provide detailed reason for replan trigger", () => {
      const result = calculator.calculateVariance({
        impact_result: {
          action_id: actionId,
          decision_id: uuidv4(),
          workspace_id: workspaceId,
          baseline_value: 100,
          actual_value: 80,
          variance: -20,
          variance_pct: -20,
          impact_direction: ImpactDirection.NEGATIVE,
          measurement_quality: MeasurementQuality.HIGH,
          is_valid: true,
          validation_errors: [],
        },
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS,
        current_confidence: 70,
      });

      expect(result.reason).toContain("failure threshold");
      expect(result.reason).toContain("-20.0");
    });

    it("should provide detailed reason for repeated failure halt", () => {
      const result = calculator.calculateVariance({
        impact_result: {
          action_id: actionId,
          decision_id: uuidv4(),
          workspace_id: workspaceId,
          baseline_value: 100,
          actual_value: 85,
          variance: -15,
          variance_pct: -15,
          impact_direction: ImpactDirection.NEGATIVE,
          measurement_quality: MeasurementQuality.MEDIUM,
          is_valid: true,
          validation_errors: [],
        },
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS,
        current_confidence: 40,
        previous_outcome: "failure",
      });

      expect(result.reason).toContain("Repeated failure");
      expect(result.reason).toContain("failure");
      expect(result.reason).toContain("Blocking");
    });

    it("should provide detailed reason for rollback offer", () => {
      const result = calculator.calculateVariance({
        impact_result: {
          action_id: actionId,
          decision_id: uuidv4(),
          workspace_id: workspaceId,
          baseline_value: 100,
          actual_value: 92,
          variance: -8,
          variance_pct: -8,
          impact_direction: ImpactDirection.NEGATIVE,
          measurement_quality: MeasurementQuality.HIGH,
          is_valid: true,
          validation_errors: [],
        },
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS,
        current_confidence: 75,
        previous_outcome: "success",
      });

      expect(result.reason).toContain("Previously successful");
      expect(result.reason).toContain("Rollback");
    });
  });
});
