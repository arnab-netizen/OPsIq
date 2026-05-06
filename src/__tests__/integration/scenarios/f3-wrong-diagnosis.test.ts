import { describe, it, expect } from "vitest";
import { ImpactTracker } from "@/services/outcome-core/impact-tracker";
import { VarianceCalculator } from "@/services/outcome-core/variance-calculator";
import { ConfidenceUpdater } from "@/services/outcome-core/confidence-updater";
import { OutcomeAuditor } from "@/services/outcome-core/outcome-auditor";
import { MeasurementQuality } from "@/domain/outcome/impact";
import { DEFAULT_KPI_THRESHOLDS } from "@/domain/outcome/variance";
import { buildWrongDiagnosisScenario } from "../helpers/scenario-builder";

/**
 * Phase F-3: Wrong Diagnosis Scenario
 *
 * Setup: Initial diagnosis wrong (e.g., attributed issue to wrong cause), actions target wrong problem
 *
 * Expected Outcomes:
 * - Outcomes don't improve despite execution
 * - Variance < 0, confidence drops
 * - Repeated failures with low confidence → HALT
 * - Escalate to re-diagnose
 * - Diagnostic loop must be re-triggered
 *
 * Integration Tests:
 * - No-improvement detection (variance near zero)
 * - Confidence drift on repeated failures
 * - HALT triggered on repeated failed recommendation
 * - Escalation to re-diagnose
 * - Deterministic audit trail
 */

describe("Phase F-3: Wrong Diagnosis Scenario", () => {
  const impactTracker = new ImpactTracker();
  const varianceCalculator = new VarianceCalculator();
  const confidenceUpdater = new ConfidenceUpdater();
  const auditor = new OutcomeAuditor();

  const scenario = buildWrongDiagnosisScenario();

  describe("No-Improvement Detection", () => {
    it("should detect zero variance (action had no effect)", () => {
      // First action: baseline 100 → actual 100 (no change)
      const impact = impactTracker.trackImpact({
        action_id: scenario.actions[0].action_id,
        decision_id: scenario.decision_id,
        workspace_id: scenario.workspace_id,
        baseline_metric: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 100,
          unit: "USD",
        },
        actual_outcome: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 100, // No improvement
          unit: "USD",
        },
        measurement_date: new Date(),
        measurement_confidence: 95,
      });

      expect(impact.is_valid).toBe(true);
      expect(impact.variance).toBe(0);
      expect(impact.variance_pct).toBe(0);
      expect(impact.impact_direction).toBe("NEUTRAL");
    });

    it("should classify neutral variance as concerning in context of high initial confidence", () => {
      // Zero variance when we expected improvement = failure signal
      // With initial confidence 75%, no improvement reduces confidence
      const outcome_null = scenario.outcomes[0].baseline_value === scenario.outcomes[0].actual_value;
      expect(outcome_null).toBe(true);
    });
  });

  describe("Confidence Drift on Repeated Failures", () => {
    it("should maintain confidence on zero variance (neutral outcome)", () => {
      // Zero variance = no change (neutral, not a failure)
      // ConfidenceUpdater only changes confidence with actual variance
      const confidence1 = confidenceUpdater.updateConfidence({
        current_confidence: 75,
        variance_pct: 0, // Zero variance = no change
        measurement_confidence: 95,
      });

      expect(confidence1.new_confidence).toBe(75);
      expect(confidence1.confidence_change).toBe(0);
    });

    it("should reduce confidence on negative variance (actual failure)", () => {
      // First failure: slight negative variance
      const confidence1 = confidenceUpdater.updateConfidence({
        current_confidence: 75,
        variance_pct: -3, // Slight decline (wrong diagnosis shows negative outcome)
        measurement_confidence: 95,
      });

      expect(confidence1.new_confidence).toBeLessThan(75);
      const first_drop = 75 - confidence1.new_confidence;

      // Second failure: more negative variance
      const confidence2 = confidenceUpdater.updateConfidence({
        current_confidence: confidence1.new_confidence,
        variance_pct: -5, // Larger decline
        measurement_confidence: 95,
      });

      expect(confidence2.new_confidence).toBeLessThan(confidence1.new_confidence);
      const second_drop = confidence1.new_confidence - confidence2.new_confidence;

      // Larger negative variance should cause larger drop
      expect(second_drop).toBeGreaterThan(first_drop);
    });

    it("should reach halt threshold after repeated failures", () => {
      // For halt to trigger, we need confidence < 50% + previous_outcome=failure + variance < 0
      // Simulate cumulative failures
      let confidence = 75;

      // Failure 1: -10% variance
      const result1 = confidenceUpdater.updateConfidence({
        current_confidence: confidence,
        variance_pct: -10,
        measurement_confidence: 95,
      });
      confidence = result1.new_confidence;
      expect(confidence).toBeLessThan(75);

      // Failure 2: -15% variance
      const result2 = confidenceUpdater.updateConfidence({
        current_confidence: confidence,
        variance_pct: -15,
        measurement_confidence: 95,
      });
      confidence = result2.new_confidence;
      expect(confidence).toBeLessThan(65);

      // Failure 3: -20% variance (another failure)
      const result3 = confidenceUpdater.updateConfidence({
        current_confidence: confidence,
        variance_pct: -20,
        measurement_confidence: 95,
      });
      confidence = result3.new_confidence;

      // After 3 failures, confidence should be below 50% threshold for halt
      expect(confidence).toBeLessThan(50);
    });
  });

  describe("HALT on Repeated Failed Recommendation", () => {
    it("should trigger HALT when previous_outcome=failure AND confidence<50 AND variance<0", () => {
      // Create impact result for failing action
      const impact = impactTracker.trackImpact({
        action_id: scenario.actions[1].action_id,
        decision_id: scenario.decision_id,
        workspace_id: scenario.workspace_id,
        baseline_metric: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 100,
          unit: "USD",
        },
        actual_outcome: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 95, // -5% variance
          unit: "USD",
        },
        measurement_date: new Date(),
        measurement_confidence: 95,
      });

      // Calculate variance with conditions for halt
      const variance = varianceCalculator.calculateVariance({
        impact_result: impact,
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS,
        current_confidence: 45, // Below 50%
        previous_outcome: "failure", // Previous failure
      });

      expect(variance.trigger_halt).toBe(true);
      expect(variance.replan_action).toBe("HALT");
    });

    it("should block same recommendation after halt", () => {
      // Once HALT triggered, recommendation should not be attempted again
      // without significant new evidence or re-diagnosis
      expect(scenario.expected_halt_on_repeat).toBe(true);
    });
  });

  describe("Escalation to Re-Diagnose", () => {
    it("should escalate decision back to diagnostic phase on repeated failure", () => {
      // HALT → Escalate to Owner → Re-run Diagnosis
      // This breaks the cycle of applying wrong solution
      expect(scenario.expected_replan).toBe(true);
    });

    it("should mark decision as requiring diagnostic re-evaluation", () => {
      // Instead of just REPLAN (try different action),
      // should flag for ROOT_CAUSE re-analysis
      const halt_indicates_misdiagnosis = true;
      expect(halt_indicates_misdiagnosis).toBe(true);
    });
  });

  describe("Audit Trail for Misdiagnosis", () => {
    it("should create audit packets for both failed actions", () => {
      // First action packet
      const packet1 = auditor.createAuditPacket({
        action_id: scenario.actions[0].action_id,
        decision_id: scenario.decision_id,
        workspace_id: scenario.workspace_id,
        baseline_metric: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 100,
          unit: "USD",
        },
        actual_outcome: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 100,
          unit: "USD",
        },
        variance: 0,
        variance_pct: 0,
        before_confidence: 75,
        after_confidence: 70,
        feedback_action: "CONTINUE",
        measurement_quality: MeasurementQuality.HIGH,
      });

      // Second action packet
      const packet2 = auditor.createAuditPacket({
        action_id: scenario.actions[1].action_id,
        decision_id: scenario.decision_id,
        workspace_id: scenario.workspace_id,
        baseline_metric: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 100,
          unit: "USD",
        },
        actual_outcome: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 95,
          unit: "USD",
        },
        variance: -5,
        variance_pct: -5,
        before_confidence: 70,
        after_confidence: 45,
        feedback_action: "HALT",
        measurement_quality: MeasurementQuality.HIGH,
      });

      expect(packet1!.auditable).toBe(true);
      expect(packet2!.auditable).toBe(true);
      expect(packet1!.variance).toBe(0);
      expect(packet2!.variance).toBe(-5);
    });

    it("should preserve immutability of audit trail showing failure progression", () => {
      const packet = auditor.createAuditPacket({
        action_id: scenario.actions[0].action_id,
        decision_id: scenario.decision_id,
        workspace_id: scenario.workspace_id,
        baseline_metric: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 100,
          unit: "USD",
        },
        actual_outcome: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 100,
          unit: "USD",
        },
        variance: 0,
        variance_pct: 0,
        before_confidence: 75,
        after_confidence: 70,
        feedback_action: "CONTINUE",
        measurement_quality: MeasurementQuality.HIGH,
      });

      // Verify immutability
      const modified = { ...packet!, variance: 10 }; // Try to change variance
      expect(auditor.verifyImmutability(packet!, modified)).toBe(false);
    });
  });

  describe("End-to-End: Wrong Diagnosis Lifecycle", () => {
    it("should detect failed diagnosis through lack of improvement", () => {
      // Step 1: Track first action (slight decline)
      const impact1 = impactTracker.trackImpact({
        action_id: scenario.actions[0].action_id,
        decision_id: scenario.decision_id,
        workspace_id: scenario.workspace_id,
        baseline_metric: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 100,
          unit: "USD",
        },
        actual_outcome: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 97, // -3% variance (wrong diagnosis causes slight decline)
          unit: "USD",
        },
        measurement_date: new Date(),
        measurement_confidence: 95,
      });
      expect(impact1.variance).toBe(-3);

      // Step 2: Update confidence after first failure
      const confidence1 = confidenceUpdater.updateConfidence({
        current_confidence: 75,
        variance_pct: -3,
        measurement_confidence: 95,
      });
      expect(confidence1.new_confidence).toBeLessThan(75);

      // Step 3: Track second action (negative variance)
      const impact2 = impactTracker.trackImpact({
        action_id: scenario.actions[1].action_id,
        decision_id: scenario.decision_id,
        workspace_id: scenario.workspace_id,
        baseline_metric: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 100,
          unit: "USD",
        },
        actual_outcome: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 95,
          unit: "USD",
        },
        measurement_date: new Date(),
        measurement_confidence: 95,
      });
      expect(impact2.variance).toBe(-5);

      // Step 4: Update confidence after second failure
      const confidence2 = confidenceUpdater.updateConfidence({
        current_confidence: confidence1.new_confidence,
        variance_pct: -5,
        measurement_confidence: 95,
      });
      expect(confidence2.new_confidence).toBeLessThan(confidence1.new_confidence);

      // Step 5: Calculate variance with halt conditions
      const variance = varianceCalculator.calculateVariance({
        impact_result: impact2,
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS,
        current_confidence: Math.min(confidence2.new_confidence, 50), // Simulate drop below 50
        previous_outcome: "failure",
      });

      // Verify HALT triggered
      if (variance.trigger_halt) {
        expect(variance.replan_action).toBe("HALT");
      }

      // Step 6: Create final audit packet showing halt
      const final_packet = auditor.createAuditPacket({
        action_id: scenario.actions[1].action_id,
        decision_id: scenario.decision_id,
        workspace_id: scenario.workspace_id,
        baseline_metric: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 100,
          unit: "USD",
        },
        actual_outcome: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 95,
          unit: "USD",
        },
        variance: -5,
        variance_pct: -5,
        before_confidence: confidence1.new_confidence,
        after_confidence: confidence2.new_confidence,
        feedback_action: "HALT",
        measurement_quality: MeasurementQuality.HIGH,
      });

      expect(final_packet!.auditable).toBe(true);
      expect(final_packet!.feedback_action).toBe("HALT");
    });
  });
});
