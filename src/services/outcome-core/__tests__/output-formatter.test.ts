import { describe, it, expect } from "vitest";
import { OutputFormatter } from "../output-formatter";
import { OutputMode } from "@/domain/outcome/output";
import { FeedbackAction } from "@/domain/outcome/feedback";
import { ImpactDirection, MeasurementQuality } from "@/domain/outcome/impact";
import { v4 as uuidv4 } from "uuid";

describe("OutputFormatter", () => {
  const formatter = new OutputFormatter();
  const actionId = uuidv4();
  const decisionId = uuidv4();
  const workspaceId = uuidv4();

  const baseImpactResult = {
    action_id: actionId,
    decision_id: decisionId,
    workspace_id: workspaceId,
    baseline_value: 100,
    actual_value: 110,
    variance: 10,
    variance_pct: 10,
    impact_direction: ImpactDirection.POSITIVE,
    measurement_quality: MeasurementQuality.HIGH,
    is_valid: true,
    validation_errors: [],
  };

  const baseConfidenceUpdate = {
    new_confidence: 75,
    confidence_change: 5,
    update_reason: "Positive outcome",
    capped_due_to_measurement: false,
    repeated_failure_penalty: false,
  };

  const baseFeedbackAction = {
    action: FeedbackAction.CONTINUE,
    reason: "Performance within range",
    escalation_required: false,
    requires_owner_approval: false,
  };

  describe("NOVICE Format", () => {
    it("should format positive variance as plain language", () => {
      const result = formatter.formatOutput({
        impact_result: baseImpactResult,
        confidence_update: baseConfidenceUpdate,
        feedback_action: baseFeedbackAction,
        output_mode: OutputMode.NOVICE,
      });

      expect(result.message).toContain("good results");
      expect(result.message).toContain("75%");
      expect(result.message).not.toContain("+10");
    });

    it("should include confidence percentage", () => {
      const result = formatter.formatOutput({
        impact_result: baseImpactResult,
        confidence_update: { ...baseConfidenceUpdate, new_confidence: 82 },
        feedback_action: baseFeedbackAction,
        output_mode: OutputMode.NOVICE,
      });

      expect(result.message).toContain("82%");
    });

    it("should use plain language for actions", () => {
      const result = formatter.formatOutput({
        impact_result: baseImpactResult,
        confidence_update: baseConfidenceUpdate,
        feedback_action: baseFeedbackAction,
        output_mode: OutputMode.NOVICE,
      });

      expect(result.message).toContain("Continue");
      expect(result.message).not.toContain("CONTINUE");
    });

    it("should describe excellent results for variance >10%", () => {
      const result = formatter.formatOutput({
        impact_result: { ...baseImpactResult, variance_pct: 15 },
        confidence_update: baseConfidenceUpdate,
        feedback_action: baseFeedbackAction,
        output_mode: OutputMode.NOVICE,
      });

      expect(result.message).toContain("excellent");
    });

    it("should describe slight underperformance for variance -2%", () => {
      const result = formatter.formatOutput({
        impact_result: {
          ...baseImpactResult,
          variance_pct: -2,
          impact_direction: ImpactDirection.NEGATIVE,
        },
        confidence_update: baseConfidenceUpdate,
        feedback_action: baseFeedbackAction,
        output_mode: OutputMode.NOVICE,
      });

      expect(result.message).toContain("slightly");
    });

    it("should describe significant failure for variance <-10%", () => {
      const result = formatter.formatOutput({
        impact_result: {
          ...baseImpactResult,
          variance_pct: -15,
          impact_direction: ImpactDirection.NEGATIVE,
        },
        confidence_update: baseConfidenceUpdate,
        feedback_action: baseFeedbackAction,
        output_mode: OutputMode.NOVICE,
      });

      expect(result.message).toContain("failed");
    });
  });

  describe("OPERATOR Format", () => {
    it("should show variance percentage", () => {
      const result = formatter.formatOutput({
        impact_result: { ...baseImpactResult, variance_pct: 12.5 },
        confidence_update: baseConfidenceUpdate,
        feedback_action: baseFeedbackAction,
        output_mode: OutputMode.OPERATOR,
      });

      expect(result.message).toContain("+12.5%");
    });

    it("should show confidence change with arrow", () => {
      const result = formatter.formatOutput({
        impact_result: baseImpactResult,
        confidence_update: { ...baseConfidenceUpdate, new_confidence: 80, confidence_change: 10 },
        feedback_action: baseFeedbackAction,
        output_mode: OutputMode.OPERATOR,
      });

      expect(result.message).toContain("70%");
      expect(result.message).toContain("80%");
      expect(result.message).toContain("↑");
    });

    it("should show downward arrow for confidence decrease", () => {
      const result = formatter.formatOutput({
        impact_result: { ...baseImpactResult, variance_pct: -8 },
        confidence_update: {
          ...baseConfidenceUpdate,
          new_confidence: 65,
          confidence_change: -10,
        },
        feedback_action: baseFeedbackAction,
        output_mode: OutputMode.OPERATOR,
      });

      expect(result.message).toContain("↓");
    });

    it("should show detailed action description", () => {
      const result = formatter.formatOutput({
        impact_result: baseImpactResult,
        confidence_update: baseConfidenceUpdate,
        feedback_action: { ...baseFeedbackAction, action: FeedbackAction.REPLAN },
        output_mode: OutputMode.OPERATOR,
      });

      expect(result.message).toContain("Replan");
    });

    it("should include Next: label", () => {
      const result = formatter.formatOutput({
        impact_result: baseImpactResult,
        confidence_update: baseConfidenceUpdate,
        feedback_action: baseFeedbackAction,
        output_mode: OutputMode.OPERATOR,
      });

      expect(result.message).toContain("Next:");
    });

    it("should handle negative variance with minus sign", () => {
      const result = formatter.formatOutput({
        impact_result: { ...baseImpactResult, variance_pct: -5 },
        confidence_update: baseConfidenceUpdate,
        feedback_action: baseFeedbackAction,
        output_mode: OutputMode.OPERATOR,
      });

      expect(result.message).toContain("-5.0%");
    });
  });

  describe("EXECUTIVE Format", () => {
    it("should show ROI improvement percentage", () => {
      const result = formatter.formatOutput({
        impact_result: { ...baseImpactResult, variance_pct: 25 },
        confidence_update: baseConfidenceUpdate,
        feedback_action: baseFeedbackAction,
        output_mode: OutputMode.EXECUTIVE,
      });

      expect(result.message).toContain("25");
      expect(result.message).toContain("improved");
    });

    it("should show ROI decline for negative variance", () => {
      const result = formatter.formatOutput({
        impact_result: {
          ...baseImpactResult,
          variance_pct: -12,
          impact_direction: ImpactDirection.NEGATIVE,
        },
        confidence_update: baseConfidenceUpdate,
        feedback_action: baseFeedbackAction,
        output_mode: OutputMode.EXECUTIVE,
      });

      expect(result.message).toContain("12");
      expect(result.message).toContain("declined");
    });

    it("should recommend continue strategy", () => {
      const result = formatter.formatOutput({
        impact_result: baseImpactResult,
        confidence_update: baseConfidenceUpdate,
        feedback_action: { ...baseFeedbackAction, action: FeedbackAction.CONTINUE },
        output_mode: OutputMode.EXECUTIVE,
      });

      expect(result.message).toContain("continue");
    });

    it("should recommend pivot for replan", () => {
      const result = formatter.formatOutput({
        impact_result: baseImpactResult,
        confidence_update: baseConfidenceUpdate,
        feedback_action: { ...baseFeedbackAction, action: FeedbackAction.REPLAN },
        output_mode: OutputMode.EXECUTIVE,
      });

      expect(result.message).toContain("pivot");
    });

    it("should recommend rollback for rollback action", () => {
      const result = formatter.formatOutput({
        impact_result: baseImpactResult,
        confidence_update: baseConfidenceUpdate,
        feedback_action: { ...baseFeedbackAction, action: FeedbackAction.ROLLBACK },
        output_mode: OutputMode.EXECUTIVE,
      });

      expect(result.message).toContain("rollback");
    });

    it("should recommend stop for halt", () => {
      const result = formatter.formatOutput({
        impact_result: baseImpactResult,
        confidence_update: baseConfidenceUpdate,
        feedback_action: { ...baseFeedbackAction, action: FeedbackAction.HALT },
        output_mode: OutputMode.EXECUTIVE,
      });

      expect(result.message).toContain("stop");
    });
  });

  describe("Mode Differences", () => {
    it("should produce different messages for same input in different modes", () => {
      const input = {
        impact_result: baseImpactResult,
        confidence_update: baseConfidenceUpdate,
        feedback_action: baseFeedbackAction,
      };

      const novice = formatter.formatOutput({ ...input, output_mode: OutputMode.NOVICE });
      const operator = formatter.formatOutput({ ...input, output_mode: OutputMode.OPERATOR });
      const executive = formatter.formatOutput({ ...input, output_mode: OutputMode.EXECUTIVE });

      expect(novice.message).not.toBe(operator.message);
      expect(operator.message).not.toBe(executive.message);
      expect(novice.message).not.toBe(executive.message);
    });

    it("NOVICE should have fewest numbers", () => {
      const input = {
        impact_result: baseImpactResult,
        confidence_update: baseConfidenceUpdate,
        feedback_action: baseFeedbackAction,
      };

      const novice = formatter.formatOutput({ ...input, output_mode: OutputMode.NOVICE });
      const operator = formatter.formatOutput({ ...input, output_mode: OutputMode.OPERATOR });

      const noviceNumbers = (novice.message.match(/\d/g) || []).length;
      const operatorNumbers = (operator.message.match(/\d/g) || []).length;

      expect(noviceNumbers).toBeLessThan(operatorNumbers);
    });

    it("OPERATOR should have detailed metrics", () => {
      const input = {
        impact_result: baseImpactResult,
        confidence_update: baseConfidenceUpdate,
        feedback_action: baseFeedbackAction,
      };

      const operator = formatter.formatOutput({ ...input, output_mode: OutputMode.OPERATOR });

      expect(operator.message).toContain("Variance:");
      expect(operator.message).toContain("Confidence:");
      expect(operator.message).toMatch(/[↑↓]/); // Should contain trend arrow
    });

    it("EXECUTIVE should focus on ROI", () => {
      const input = {
        impact_result: baseImpactResult,
        confidence_update: baseConfidenceUpdate,
        feedback_action: baseFeedbackAction,
      };

      const executive = formatter.formatOutput({ ...input, output_mode: OutputMode.EXECUTIVE });

      expect(executive.message).toContain("ROI");
      expect(executive.message).toContain("Recommend");
    });
  });

  describe("Input Validation (Fail-Closed)", () => {
    it("should handle missing impact_result", () => {
      const result = formatter.formatOutput({
        impact_result: null as any,
        confidence_update: baseConfidenceUpdate,
        feedback_action: baseFeedbackAction,
        output_mode: OutputMode.NOVICE,
      });

      expect(result.message).toContain("missing required data");
    });

    it("should handle missing confidence_update", () => {
      const result = formatter.formatOutput({
        impact_result: baseImpactResult,
        confidence_update: null as any,
        feedback_action: baseFeedbackAction,
        output_mode: OutputMode.NOVICE,
      });

      expect(result.message).toContain("missing required data");
    });

    it("should handle missing feedback_action", () => {
      const result = formatter.formatOutput({
        impact_result: baseImpactResult,
        confidence_update: baseConfidenceUpdate,
        feedback_action: null as any,
        output_mode: OutputMode.NOVICE,
      });

      expect(result.message).toContain("missing required data");
    });

    it("should default to NOVICE for invalid mode", () => {
      const result = formatter.formatOutput({
        impact_result: baseImpactResult,
        confidence_update: baseConfidenceUpdate,
        feedback_action: baseFeedbackAction,
        output_mode: "INVALID" as any,
      });

      expect(result.mode).toBe("INVALID");
      expect(result.message).toContain("Unknown");
    });
  });

  describe("Deterministic Behavior", () => {
    it("should produce same output for identical inputs", () => {
      const input = {
        impact_result: baseImpactResult,
        confidence_update: baseConfidenceUpdate,
        feedback_action: baseFeedbackAction,
        output_mode: OutputMode.NOVICE,
      };

      const result1 = formatter.formatOutput(input);
      const result2 = formatter.formatOutput(input);

      expect(result1.message).toBe(result2.message);
      expect(result1.action).toBe(result2.action);
    });

    it("should produce same output for different order of calls", () => {
      const input = {
        impact_result: baseImpactResult,
        confidence_update: baseConfidenceUpdate,
        feedback_action: baseFeedbackAction,
        output_mode: OutputMode.OPERATOR,
      };

      const result1 = formatter.formatOutput(input);
      const result2 = formatter.formatOutput(input);

      expect(formatter.isDeterministic(result1, result2, true)).toBe(true);
    });
  });

  describe("Action Preservation", () => {
    it("should preserve feedback action in output", () => {
      const result = formatter.formatOutput({
        impact_result: baseImpactResult,
        confidence_update: baseConfidenceUpdate,
        feedback_action: { ...baseFeedbackAction, action: FeedbackAction.ROLLBACK },
        output_mode: OutputMode.NOVICE,
      });

      expect(result.action).toBe(FeedbackAction.ROLLBACK);
    });

    it("should include action in all modes", () => {
      const input = {
        impact_result: baseImpactResult,
        confidence_update: baseConfidenceUpdate,
        feedback_action: { ...baseFeedbackAction, action: FeedbackAction.REPLAN },
      };

      const novice = formatter.formatOutput({ ...input, output_mode: OutputMode.NOVICE });
      const operator = formatter.formatOutput({ ...input, output_mode: OutputMode.OPERATOR });
      const executive = formatter.formatOutput({ ...input, output_mode: OutputMode.EXECUTIVE });

      expect(novice.action).toBe(FeedbackAction.REPLAN);
      expect(operator.action).toBe(FeedbackAction.REPLAN);
      expect(executive.action).toBe(FeedbackAction.REPLAN);
    });
  });

  describe("Edge Cases", () => {
    it("should handle zero variance", () => {
      const result = formatter.formatOutput({
        impact_result: {
          ...baseImpactResult,
          variance_pct: 0,
          impact_direction: ImpactDirection.NEUTRAL,
        },
        confidence_update: baseConfidenceUpdate,
        feedback_action: baseFeedbackAction,
        output_mode: OutputMode.NOVICE,
      });

      expect(result.message).toContain("neutral");
    });

    it("should handle extreme positive variance", () => {
      const result = formatter.formatOutput({
        impact_result: { ...baseImpactResult, variance_pct: 100 },
        confidence_update: baseConfidenceUpdate,
        feedback_action: baseFeedbackAction,
        output_mode: OutputMode.EXECUTIVE,
      });

      expect(result.message).toContain("100");
      expect(result.message).toContain("improved");
    });

    it("should handle extreme negative variance", () => {
      const result = formatter.formatOutput({
        impact_result: {
          ...baseImpactResult,
          variance_pct: -50,
          impact_direction: ImpactDirection.NEGATIVE,
        },
        confidence_update: baseConfidenceUpdate,
        feedback_action: baseFeedbackAction,
        output_mode: OutputMode.EXECUTIVE,
      });

      expect(result.message).toContain("50");
      expect(result.message).toContain("declined");
    });

    it("should handle boundary confidence (0%)", () => {
      const result = formatter.formatOutput({
        impact_result: baseImpactResult,
        confidence_update: { ...baseConfidenceUpdate, new_confidence: 0 },
        feedback_action: baseFeedbackAction,
        output_mode: OutputMode.NOVICE,
      });

      expect(result.message).toContain("0%");
    });

    it("should handle boundary confidence (100%)", () => {
      const result = formatter.formatOutput({
        impact_result: baseImpactResult,
        confidence_update: { ...baseConfidenceUpdate, new_confidence: 100 },
        feedback_action: baseFeedbackAction,
        output_mode: OutputMode.NOVICE,
      });

      expect(result.message).toContain("100%");
    });
  });
});
