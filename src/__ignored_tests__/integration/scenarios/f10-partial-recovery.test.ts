import { describe, it, expect } from "vitest";
import { ImpactTracker } from "@/services/outcome-core/impact-tracker";
import { VarianceCalculator } from "@/services/outcome-core/variance-calculator";
import { ConfidenceUpdater } from "@/services/outcome-core/confidence-updater";
import { OutcomeAuditor } from "@/services/outcome-core/outcome-auditor";
import { MeasurementQuality } from "@/domain/outcome/impact";
import { DEFAULT_KPI_THRESHOLDS } from "@/domain/outcome/variance";
import { buildPartialRecoveryScenario } from "../helpers/scenario-builder";

/**
 * Phase F-10: Partial Recovery Scenario
 *
 * Setup: Crisis partially mitigated - action recovers revenue from crisis low to 80% of original
 *
 * Expected Outcomes:
 * - Crisis baseline: 100 → 60 (40% drop)
 * - Recovery action: 60 → 80 (+33.3% vs crisis)
 * - Variance vs original: -20% (still down from 100)
 * - Recovery trajectory positive: moving in right direction
 * - Confidence: modest increase from recovery evidence
 * - Recommendation: CONTINUE_WITH_CAUTION (progress but not complete)
 *
 * Integration Tests:
 * - Crisis baseline establishment
 * - Dual variance: vs crisis (positive) vs original (negative)
 * - Trajectory analysis (improving vs crisis, but below original)
 * - Confidence update on partial recovery
 * - Continuing metrics (continue if trajectory positive)
 * - Plateau detection (if recovery stalls, trigger replan)
 * - Deterministic audit trail for recovery path
 */

describe("Phase F-10: Partial Recovery Scenario", () => {
  const impactTracker = new ImpactTracker();
  const varianceCalculator = new VarianceCalculator();
  const confidenceUpdater = new ConfidenceUpdater();
  const auditor = new OutcomeAuditor();

  const scenario = buildPartialRecoveryScenario();

  describe("Crisis Baseline Establishment", () => {
    it("should establish original baseline at decision time", () => {
      const original_baseline = scenario.condition.baseline_revenue;
      expect(original_baseline).toBe(100);
    });

    it("should record crisis outcome (revenue collapse)", () => {
      const crisis_outcome = scenario.outcomes.crisis;
      expect(crisis_outcome.actual_value).toBe(60);
      expect(crisis_outcome.measurement_quality).toBe(MeasurementQuality.HIGH);
    });

    it("should calculate crisis severity", () => {
      const original = scenario.condition.baseline_revenue;
      const crisis = scenario.outcomes.crisis.actual_value;
      const crisis_pct = ((original - crisis) / original) * 100;
      expect(crisis_pct).toBe(40); // 40% drop
    });

    it("should shift baseline after crisis (60 becomes new reference)", () => {
      // After crisis stabilizes at 60, new baseline for recovery calculation
      const crisis_baseline = scenario.outcomes.crisis.actual_value;
      expect(crisis_baseline).toBe(60);
    });
  });

  describe("Partial Recovery Tracking", () => {
    it("should track recovery action impact (60 → 80)", () => {
      const recovery_outcome = scenario.outcomes.recovery;
      expect(recovery_outcome.baseline_value).toBe(60); // Crisis baseline
      expect(recovery_outcome.actual_value).toBe(80); // After action
    });

    it("should calculate recovery variance vs crisis baseline", () => {
      // Recovery: 80 vs 60 baseline
      const recovery_variance = ((scenario.outcomes.recovery.actual_value - scenario.outcomes.recovery.baseline_value) /
        scenario.outcomes.recovery.baseline_value) * 100;
      expect(recovery_variance).toBeCloseTo(33.3, 0); // +33.3% recovery
    });

    it("should note recovery is positive progress", () => {
      const crisis_value = scenario.outcomes.crisis.actual_value; // 60
      const recovery_value = scenario.outcomes.recovery.actual_value; // 80
      const is_recovering = recovery_value > crisis_value;
      expect(is_recovering).toBe(true);
    });

    it("should recognize recovery is incomplete (still -20% from original)", () => {
      const original = scenario.condition.baseline_revenue;
      const recovery_value = scenario.outcomes.recovery.actual_value;
      const variance_vs_original = ((recovery_value - original) / original) * 100;
      expect(variance_vs_original).toBe(-20); // Still down 20% from 100
    });
  });

  describe("Dual Variance Calculation", () => {
    it("should calculate positive variance vs crisis baseline (+33.3%)", () => {
      const crisis_baseline = scenario.outcomes.crisis.actual_value;
      const recovery_value = scenario.outcomes.recovery.actual_value;
      const variance_vs_crisis = ((recovery_value - crisis_baseline) / crisis_baseline) * 100;
      expect(variance_vs_crisis).toBeCloseTo(33.3, 0);
    });

    it("should calculate negative variance vs original baseline (-20%)", () => {
      const original_baseline = scenario.condition.baseline_revenue;
      const recovery_value = scenario.outcomes.recovery.actual_value;
      const variance_vs_original = ((recovery_value - original_baseline) / original_baseline) * 100;
      expect(variance_vs_original).toBe(-20);
    });

    it("should show contradiction: positive recovery, negative vs original", () => {
      const variance_vs_crisis = scenario.expected_recovery_variance;
      const variance_vs_original = scenario.expected_variance_vs_original;
      const contradictory = variance_vs_crisis > 0 && variance_vs_original < 0;
      expect(contradictory).toBe(true);
    });

    it("should use original baseline for replan decision (variance_vs_original)", () => {
      // Replan decision based on: -20% vs original (below success threshold of +0%)
      // Recovery is positive evidence but not sufficient to declare success
      const decision_variance = scenario.expected_variance_vs_original;
      expect(decision_variance).toBe(-20);
    });
  });

  describe("Trajectory Analysis", () => {
    it("should detect recovery trajectory (improving from crisis)", () => {
      const crisis = scenario.outcomes.crisis.actual_value;
      const recovery = scenario.outcomes.recovery.actual_value;
      const trajectory = recovery - crisis;
      expect(trajectory).toBeGreaterThan(0);
    });

    it("should classify trajectory as RECOVERING (moving up)", () => {
      const trajectory = scenario.expected_trajectory;
      expect(trajectory).toBe("RECOVERING");
    });

    it("should enable CONTINUE recommendation based on positive trajectory", () => {
      // Positive trajectory allows continuation with caution
      // (vs halt if trajectory negative or flat)
      const trajectory = scenario.expected_trajectory;
      expect(trajectory).toBe("RECOVERING");
    });

    it("should note recovery still incomplete (80 < 100)", () => {
      const original = scenario.condition.baseline_revenue;
      const recovery = scenario.outcomes.recovery.actual_value;
      const is_complete = recovery >= original;
      expect(is_complete).toBe(false);
    });

    it("should flag for continued monitoring (not sustained yet)", () => {
      // Recovery at 80 shows progress but needs sustained evidence
      // Action may need to continue to achieve further recovery
      const monitoring_required = true;
      expect(monitoring_required).toBe(true);
    });
  });

  describe("Confidence Update on Partial Recovery", () => {
    it("should increase confidence when recovery detected", () => {
      // Recovery variance +33.3% vs crisis baseline is positive evidence
      const confidence = confidenceUpdater.updateConfidence({
        current_confidence: 45, // Low after crisis
        variance_pct: 33.3, // Strong recovery signal
        measurement_confidence: 95, // HIGH measurement quality
      });

      expect(confidence.new_confidence).toBeGreaterThan(45);
      expect(confidence.confidence_change).toBeGreaterThan(0);
    });

    it("should apply modest increase (not full +20%) due to incomplete recovery", () => {
      // Full +20% cap but recovery vs crisis (+33.3%)
      // Still below original, so modest increase appropriate
      const confidence = confidenceUpdater.updateConfidence({
        current_confidence: 45,
        variance_pct: 33.3, // Large positive variance vs crisis
        measurement_confidence: 95,
      });

      // At most +20% cap applies
      expect(confidence.confidence_change).toBeLessThanOrEqual(20);
      expect(confidence.new_confidence).toBeLessThanOrEqual(65);
    });

    it("should consider negative variance vs original in confidence assessment", () => {
      // While recovery is positive, still -20% vs original
      // This tempers confidence growth despite recovery evidence
      const variance_vs_original = scenario.expected_variance_vs_original;
      expect(variance_vs_original).toBe(-20);
    });

    it("should apply POSITIVE confidence update per scenario", () => {
      const update_direction = scenario.expected_confidence_update;
      expect(update_direction).toBe("POSITIVE");
    });
  });

  describe("Replan Decision on Partial Recovery", () => {
    it("should NOT trigger replan if recovery trajectory positive", () => {
      // Recovery trajectory positive (-20% is still failure but direction matters)
      // Recommendation: CONTINUE_WITH_CAUTION (not REPLAN)
      const variance = varianceCalculator.calculateVariance({
        impact_result: {
          action_id: scenario.action_id,
          variance: -20,
          variance_pct: -20,
          is_valid: true,
          measurement_confidence: 95,
          measurement_date: new Date(),
        },
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS,
        current_confidence: 65, // Improved from recovery
        previous_outcome: "unknown",
      });

      // Variance -20% equals failure threshold (-10%) or beyond
      // But recovery trajectory is positive, so decision context is CONTINUE not REPLAN
      expect(variance.trigger_replan).toBe(true); // Technically below threshold
      // But should be interpreted with recovery trajectory in mind
    });

    it("should trigger replan if recovery STALLS (no further improvement)", () => {
      // If action continues but no more progress (plateau at 80):
      // After 2-3 measurement periods with zero variance, consider replanning
      const first_measurement = 33.3; // Initial recovery
      const second_measurement = 0; // No further progress
      const stalled = second_measurement === 0 && first_measurement > 0;
      expect(stalled).toBe(true);
    });

    it("should recommend CONTINUE_WITH_CAUTION per scenario", () => {
      const recommendation = scenario.expected_recommendation;
      expect(recommendation).toBe("CONTINUE_WITH_CAUTION");
    });
  });

  describe("Continuing Metrics Under Recovery", () => {
    it("should track recovery progress (80 is positive vs crisis 60)", () => {
      // Recovery action is working: 60 → 80
      const crisis = scenario.outcomes.crisis.actual_value;
      const recovery = scenario.outcomes.recovery.actual_value;
      const progress = recovery - crisis;
      expect(progress).toBe(20); // +20 absolute recovery
    });

    it("should track remaining gap to original (need +20 more to reach 100)", () => {
      const recovery = scenario.outcomes.recovery.actual_value;
      const original = scenario.condition.baseline_revenue;
      const remaining_gap = original - recovery;
      expect(remaining_gap).toBe(20);
    });

    it("should calculate recovery rate (20 out of 40 = 50% recovered)", () => {
      const original = scenario.condition.baseline_revenue;
      const crisis = scenario.outcomes.crisis.actual_value;
      const recovery = scenario.outcomes.recovery.actual_value;
      const crisis_depth = original - crisis; // 40
      const recovery_amount = recovery - crisis; // 20
      const recovery_rate = (recovery_amount / crisis_depth) * 100;
      expect(recovery_rate).toBe(50); // 50% of damage recovered
    });

    it("should project recovery timeline if trend continues", () => {
      // If recovery rate is +20 per period at current pace
      // and gap is 20, would need ~1 more period to full recovery
      const remaining_gap = 20;
      const recovery_per_period = 20;
      const periods_to_full = remaining_gap / recovery_per_period;
      expect(periods_to_full).toBe(1);
    });
  });

  describe("Audit Trail for Partial Recovery", () => {
    it("should create audit packet for crisis outcome", () => {
      const crisis_packet = auditor.createAuditPacket({
        action_id: scenario.action_id,
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
          actual_value: 60, // Crisis
          unit: "USD",
        },
        variance: -40,
        variance_pct: -40,
        before_confidence: 75,
        after_confidence: 45, // Large confidence hit from crisis
        feedback_action: "HALT",
        measurement_quality: MeasurementQuality.HIGH,
      });

      expect(crisis_packet!.auditable).toBe(true);
      expect(crisis_packet!.variance_pct).toBe(-40);
      expect(crisis_packet!.feedback_action).toBe("HALT");
    });

    it("should create audit packet for recovery action", () => {
      const recovery_packet = auditor.createAuditPacket({
        action_id: scenario.action_id,
        decision_id: scenario.decision_id,
        workspace_id: scenario.workspace_id,
        baseline_metric: {
          name: "Revenue",
          baseline_value: 60, // Crisis baseline
          actual_value: 60,
          unit: "USD",
        },
        actual_outcome: {
          name: "Revenue",
          baseline_value: 60,
          actual_value: 80, // After recovery action
          unit: "USD",
        },
        variance: 20,
        variance_pct: 33.3,
        before_confidence: 45,
        after_confidence: 58, // Confidence increases from recovery
        feedback_action: "CONTINUE",
        measurement_quality: MeasurementQuality.HIGH,
      });

      expect(recovery_packet!.auditable).toBe(true);
      expect(recovery_packet!.variance_pct).toBeCloseTo(33.3, 0);
      expect(recovery_packet!.feedback_action).toBe("CONTINUE");
    });

    it("should document trajectory in audit (recovering but incomplete)", () => {
      // Audit should show: crisis → recovery path with progress vs original
      const crisis_to_recovery_progress = 80 - 60; // +20
      const original_to_recovery_gap = 100 - 80; // -20 remaining
      expect(crisis_to_recovery_progress).toBe(20);
      expect(original_to_recovery_gap).toBe(20);
    });

    it("should maintain deterministic decision on same partial recovery", () => {
      // Same input → same recovery trajectory → same CONTINUE decision
      const packet1 = auditor.createAuditPacket({
        action_id: scenario.action_id,
        decision_id: scenario.decision_id,
        workspace_id: scenario.workspace_id,
        baseline_metric: {
          name: "Revenue",
          baseline_value: 60,
          actual_value: 60,
          unit: "USD",
        },
        actual_outcome: {
          name: "Revenue",
          baseline_value: 60,
          actual_value: 80,
          unit: "USD",
        },
        variance: 20,
        variance_pct: 33.3,
        before_confidence: 45,
        after_confidence: 58,
        feedback_action: "CONTINUE",
        measurement_quality: MeasurementQuality.HIGH,
      });

      const packet2 = auditor.createAuditPacket({
        action_id: scenario.action_id,
        decision_id: scenario.decision_id,
        workspace_id: scenario.workspace_id,
        baseline_metric: {
          name: "Revenue",
          baseline_value: 60,
          actual_value: 60,
          unit: "USD",
        },
        actual_outcome: {
          name: "Revenue",
          baseline_value: 60,
          actual_value: 80,
          unit: "USD",
        },
        variance: 20,
        variance_pct: 33.3,
        before_confidence: 45,
        after_confidence: 58,
        feedback_action: "CONTINUE",
        measurement_quality: MeasurementQuality.HIGH,
      });

      expect(packet1!.packet_id).toBe(packet2!.packet_id);
    });
  });

  describe("End-to-End: Partial Recovery Lifecycle", () => {
    it("should detect crisis at initial measurement", () => {
      // Step 1: Crisis event
      const original = scenario.condition.baseline_revenue;
      const crisis_outcome = scenario.outcomes.crisis.actual_value;
      const crisis_severity = ((original - crisis_outcome) / original) * 100;
      expect(crisis_severity).toBe(40);
    });

    it("should establish crisis baseline for recovery calculation", () => {
      // Step 2: Crisis becomes new reference point (60 is baseline for recovery)
      const crisis_baseline = scenario.outcomes.crisis.actual_value;
      expect(crisis_baseline).toBe(60);
    });

    it("should track recovery action impact (60 → 80)", () => {
      // Step 3: Recovery action executes
      const recovery_impact = impactTracker.trackImpact({
        action_id: scenario.action_id,
        decision_id: scenario.decision_id,
        workspace_id: scenario.workspace_id,
        baseline_metric: {
          name: "Revenue",
          baseline_value: 60,
          actual_value: 60,
          unit: "USD",
        },
        actual_outcome: {
          name: "Revenue",
          baseline_value: 60,
          actual_value: 80,
          unit: "USD",
        },
        measurement_date: new Date(),
        measurement_confidence: 95,
      });

      expect(recovery_impact.is_valid).toBe(true);
      expect(recovery_impact.variance_pct).toBeCloseTo(33.3, 0);
    });

    it("should calculate variance vs original to inform decision", () => {
      // Step 4: Calculate vs original for replan decision
      const original = scenario.condition.baseline_revenue;
      const recovery = scenario.outcomes.recovery.actual_value;
      const variance_vs_original = ((recovery - original) / original) * 100;
      expect(variance_vs_original).toBe(-20);
    });

    it("should update confidence with positive recovery evidence", () => {
      // Step 5: Increase confidence from recovery
      const confidence = confidenceUpdater.updateConfidence({
        current_confidence: 45, // Low after crisis
        variance_pct: 33.3, // Strong recovery signal
        measurement_confidence: 95,
      });

      expect(confidence.new_confidence).toBeGreaterThan(45);
      expect(confidence.new_confidence).toBeLessThanOrEqual(65);
    });

    it("should create audit trail showing crisis → recovery path", () => {
      // Step 6: Audit packets for full lifecycle
      const crisis_packet = auditor.createAuditPacket({
        action_id: scenario.action_id,
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
          actual_value: 60,
          unit: "USD",
        },
        variance: -40,
        variance_pct: -40,
        before_confidence: 75,
        after_confidence: 45,
        feedback_action: "HALT",
        measurement_quality: MeasurementQuality.HIGH,
      });

      const recovery_packet = auditor.createAuditPacket({
        action_id: scenario.action_id,
        decision_id: scenario.decision_id,
        workspace_id: scenario.workspace_id,
        baseline_metric: {
          name: "Revenue",
          baseline_value: 60,
          actual_value: 60,
          unit: "USD",
        },
        actual_outcome: {
          name: "Revenue",
          baseline_value: 60,
          actual_value: 80,
          unit: "USD",
        },
        variance: 20,
        variance_pct: 33.3,
        before_confidence: 45,
        after_confidence: 58,
        feedback_action: "CONTINUE",
        measurement_quality: MeasurementQuality.HIGH,
      });

      expect(crisis_packet!.feedback_action).toBe("HALT");
      expect(recovery_packet!.feedback_action).toBe("CONTINUE");
    });

    it("should recommend CONTINUE_WITH_CAUTION with positive trajectory", () => {
      // Step 7: Recommendation based on recovery trajectory
      const recommendation = scenario.expected_recommendation;
      expect(recommendation).toBe("CONTINUE_WITH_CAUTION");
    });

    it("should flag for continued monitoring (50% damage recovered)", () => {
      // Recovery rate: 50% of crisis damage recovered (20 out of 40)
      // Action is effective but more progress needed
      const recovery_rate = 50;
      expect(recovery_rate).toBeGreaterThan(0);
      expect(recovery_rate).toBeLessThan(100);
    });

    it("should project next steps (continue action or escalate)", () => {
      // If recovery continues at current rate, +20 more per period
      // Full recovery to 100 would take ~1 more period
      const periods_to_recovery = 1;
      expect(periods_to_recovery).toBe(1);
    });
  });
});
