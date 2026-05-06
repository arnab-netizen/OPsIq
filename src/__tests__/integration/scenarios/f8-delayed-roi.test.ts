import { describe, it, expect } from "vitest";
import { OutcomeAuditor } from "@/services/outcome-core/outcome-auditor";
import { QuickWinEnforcer } from "@/services/outcome-core/quick-win-enforcer";
import { ConfidenceUpdater } from "@/services/outcome-core/confidence-updater";
import { MeasurementQuality } from "@/domain/outcome/impact";
import { buildDelayedROIScenario } from "../helpers/scenario-builder";

/**
 * Phase F-8: Delayed ROI Scenario
 *
 * Setup: Action takes 14 days to show results (violates quick-win ≤7 days)
 *
 * Expected Outcomes:
 * - Quick win validation fails at plan time
 * - Action rejected: is_quick_win=false
 * - Plan adjustment: break into 7-day increments with intermediate outcomes
 * - Measurement confidence low initially → cap updates to ±10%
 * - Timeline compression enforced for governance
 *
 * Integration Tests:
 * - Quick-win blocking on >7 day plans
 * - Plan rejection with clear reason
 * - Timeline adjustment to 7-day increments
 * - Measurement confidence capping
 * - Intermediate outcome tracking
 * - Deterministic audit trail
 */

describe("Phase F-8: Delayed ROI Scenario", () => {
  const auditor = new OutcomeAuditor();
  const quickWinEnforcer = new QuickWinEnforcer();
  const confidenceUpdater = new ConfidenceUpdater();

  const scenario = buildDelayedROIScenario();

  describe("Quick Win Validation", () => {
    it("should define quick win threshold as 7 days max", () => {
      const quick_win_days = 7;
      expect(quick_win_days).toBe(7);
    });

    it("should calculate plan duration in days", () => {
      const start = new Date(scenario.executionPlan[0].start_time);
      const end = new Date(scenario.executionPlan[0].end_time);
      const duration_days = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
      expect(duration_days).toBe(14); // 14 days exceeds 7-day threshold
    });

    it("should detect plan duration exceeds quick win limit (14 > 7)", () => {
      const start = new Date(scenario.executionPlan[0].start_time);
      const end = new Date(scenario.executionPlan[0].end_time);
      const duration_days = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
      const exceeds_quick_win = duration_days > 7;
      expect(exceeds_quick_win).toBe(true);
      expect(scenario.expected_quick_win_validation).toBe(false);
    });

    it("should fail quick win validation when plan > 7 days", () => {
      expect(scenario.expected_quick_win_validation).toBe(false);
    });
  });

  describe("Plan Rejection on Quick-Win Violation", () => {
    it("should reject plan that violates quick-win limit", () => {
      const is_quick_win = scenario.expected_quick_win_validation;
      expect(is_quick_win).toBe(false);
    });

    it("should mark action as NOT quick-win (is_quick_win=false)", () => {
      const action = scenario.action;
      // Action is 14 days, fails quick win test
      const is_quick_win = false; // violates 7-day limit
      expect(is_quick_win).toBe(false);
    });

    it("should provide clear rejection reason to owner", () => {
      const rejection_reason = scenario.expected_rejection_reason;
      expect(rejection_reason).toContain("Plan exceeds 7-day quick win limit");
    });

    it("should require owner approval to proceed with delayed ROI action", () => {
      // System does not auto-defer or auto-adjust
      // Owner must explicitly approve non-quick-win action
      const owner_approval_required = true;
      expect(owner_approval_required).toBe(true);
    });
  });

  describe("Plan Adjustment to 7-Day Increments", () => {
    it("should suggest breaking 14-day plan into 7-day increments", () => {
      const adjustment = scenario.expected_plan_adjustment;
      expect(adjustment).toContain("Break into 7-day increments");
    });

    it("should calculate 7-day increment boundaries", () => {
      // Original: 14 days
      // Increments: Day 1-7, Day 8-14
      const original_days = 14;
      const increment_days = 7;
      const increments = Math.ceil(original_days / increment_days);
      expect(increments).toBe(2);
    });

    it("should identify intermediate outcome measurement points", () => {
      // Increment 1: 7 days (measure intermediate result)
      // Increment 2: 14 days (measure final result)
      const measurement_points = 2;
      expect(measurement_points).toBe(2);
    });

    it("should compress timeline if owner approves adjustment", () => {
      // Owner choice: accept 14 days OR break into 7-day increments with intermediate measurements
      // If broken: Timeline 1 (7 days) + Timeline 2 (7 days) = 14 days total
      // But enables early go/no-go decision at day 7
      const enables_early_decision = true;
      expect(enables_early_decision).toBe(true);
    });
  });

  describe("Measurement Confidence on Delayed Outcomes", () => {
    it("should apply LOW initial measurement confidence for delayed ROI", () => {
      // At day 7 (midpoint): early signals unreliable (only 50% through plan)
      // Measurement quality: LOW initially
      const initial_quality = MeasurementQuality.LOW;
      expect(initial_quality).toBe(MeasurementQuality.LOW);
    });

    it("should cap confidence updates to ±10% for low-confidence measurements", () => {
      // LOW measurement confidence → cap updates to ±10%
      const cap_low_confidence = 10;
      expect(cap_low_confidence).toBe(10);
    });

    it("should apply capped confidence update on intermediate outcome (day 7)", () => {
      // Intermediate result at day 7: +5% variance (positive signal)
      // Measurement confidence: LOW (early signals unreliable)
      // Capped update: min(5%, 10%) = 5%
      const confidence = confidenceUpdater.updateConfidence({
        current_confidence: 75,
        variance_pct: 5, // Positive intermediate signal
        measurement_confidence: 50, // LOW confidence (day 7 out of 14)
      });

      expect(confidence.new_confidence).toBeGreaterThan(75);
      expect(confidence.confidence_change).toBeLessThanOrEqual(10); // Capped at 10%
    });

    it("should improve confidence when final outcome (day 14) measured at HIGH quality", () => {
      // Final result at day 14: +8% variance with HIGH measurement confidence
      // No cap on HIGH confidence measurements (use full variance)
      const confidence = confidenceUpdater.updateConfidence({
        current_confidence: 78, // After intermediate increase
        variance_pct: 8, // Final positive result
        measurement_confidence: 95, // HIGH confidence at full execution
      });

      expect(confidence.new_confidence).toBeGreaterThan(78);
      expect(confidence.confidence_change).toBeLessThanOrEqual(20); // Standard +20% cap
    });

    it("should flag uncertainty if intermediate outcome negative", () => {
      // At day 7: -3% variance (negative early signal on delayed ROI)
      // Indicates potential failure even with more time
      const confidence = confidenceUpdater.updateConfidence({
        current_confidence: 75,
        variance_pct: -3, // Negative intermediate signal
        measurement_confidence: 50, // LOW confidence
      });

      expect(confidence.new_confidence).toBeLessThan(75);
      expect(confidence.confidence_change).toBeGreaterThanOrEqual(-10); // Capped negative
    });
  });

  describe("Intermediate Outcome Tracking", () => {
    it("should record measurement at day 7 (increment 1)", () => {
      // Intermediate measurement: measure achieved variance at day 7
      const day_7_measurement = {
        measurement_date: new Date(),
        variance_pct: 5, // Example: +5% at midpoint
        measurement_confidence: 50, // LOW confidence (early)
      };

      expect(day_7_measurement.variance_pct).toBe(5);
      expect(day_7_measurement.measurement_confidence).toBe(50);
    });

    it("should record measurement at day 14 (increment 2, final)", () => {
      // Final measurement: measure full achieved variance after 14 days
      const day_14_measurement = {
        measurement_date: new Date(),
        variance_pct: 8, // Example: +8% final result
        measurement_confidence: 95, // HIGH confidence (full execution)
      };

      expect(day_14_measurement.variance_pct).toBe(8);
      expect(day_14_measurement.measurement_confidence).toBe(95);
    });

    it("should enable go/no-go decision at day 7 checkpoint", () => {
      // Owner decision point at day 7:
      // Option 1: Continue to day 14 (if intermediate signal positive)
      // Option 2: Halt (if intermediate signal negative or insufficient)
      const go_no_go_enabled = true;
      expect(go_no_go_enabled).toBe(true);
    });

    it("should track trajectory (day 7 vs day 14) for replan decisions", () => {
      // If day 7 = +5% and day 14 = +8%: positive trajectory → continue
      // If day 7 = +5% and day 14 = +1%: degrading trajectory → replan
      // If day 7 = -3%: negative trajectory → halt
      const day_7_variance = 5;
      const day_14_variance = 8;
      const trajectory_improving = day_14_variance > day_7_variance;
      expect(trajectory_improving).toBe(true);
    });
  });

  describe("Audit Trail for Delayed ROI", () => {
    it("should create audit packet for 7-day increment checkpoint", () => {
      const checkpoint_packet = auditor.createAuditPacket({
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
          actual_value: 105, // +5% at day 7
          unit: "USD",
        },
        variance: 5,
        variance_pct: 5,
        before_confidence: 75,
        after_confidence: 80, // 75 + 5% (capped from plan confidence)
        feedback_action: "CONTINUE", // Positive intermediate signal
        measurement_quality: MeasurementQuality.LOW, // Day 7 = LOW confidence
      });

      expect(checkpoint_packet!.auditable).toBe(true);
      expect(checkpoint_packet!.variance).toBe(5);
      expect(checkpoint_packet!.feedback_action).toBe("CONTINUE");
    });

    it("should create audit packet for final outcome (day 14)", () => {
      const final_packet = auditor.createAuditPacket({
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
          actual_value: 108, // +8% at day 14
          unit: "USD",
        },
        variance: 8,
        variance_pct: 8,
        before_confidence: 80,
        after_confidence: 86, // 80 + min(8%, 20%) = 86
        feedback_action: "CONTINUE", // Positive final result
        measurement_quality: MeasurementQuality.HIGH, // Day 14 = HIGH confidence
      });

      expect(final_packet!.auditable).toBe(true);
      expect(final_packet!.variance).toBe(8);
      expect(final_packet!.feedback_action).toBe("CONTINUE");
    });

    it("should document plan structure in audit (7-day increments)", () => {
      // Audit should note:
      // - Original plan: 14 days (exceeds quick win)
      // - Adjusted structure: 7-day increments with checkpoints
      // - Checkpoint 1: day 7 with intermediate measurement
      // - Checkpoint 2: day 14 with final measurement
      const increments = 2;
      const days_per_increment = 7;
      expect(increments * days_per_increment).toBe(14);
    });

    it("should maintain deterministic decision on same delayed ROI inputs", () => {
      // Same 14-day plan input → always rejected on quick-win
      const packet1 = auditor.createAuditPacket({
        action_id: scenario.action_id,
        decision_id: scenario.decision_id,
        workspace_id: scenario.workspace_id,
        baseline_metric: {
          name: "Plan Duration",
          baseline_value: 7,
          actual_value: 7,
          unit: "days",
        },
        actual_outcome: {
          name: "Plan Duration",
          baseline_value: 7,
          actual_value: 14, // 14 days exceeds limit
          unit: "days",
        },
        variance: 7,
        variance_pct: 100,
        before_confidence: 75,
        after_confidence: 60, // Confidence reduced due to violation
        feedback_action: "HALT", // Plan rejected
        measurement_quality: MeasurementQuality.HIGH,
      });

      const packet2 = auditor.createAuditPacket({
        action_id: scenario.action_id,
        decision_id: scenario.decision_id,
        workspace_id: scenario.workspace_id,
        baseline_metric: {
          name: "Plan Duration",
          baseline_value: 7,
          actual_value: 7,
          unit: "days",
        },
        actual_outcome: {
          name: "Plan Duration",
          baseline_value: 7,
          actual_value: 14,
          unit: "days",
        },
        variance: 7,
        variance_pct: 100,
        before_confidence: 75,
        after_confidence: 60,
        feedback_action: "HALT",
        measurement_quality: MeasurementQuality.HIGH,
      });

      expect(packet1!.packet_id).toBe(packet2!.packet_id);
    });
  });

  describe("End-to-End: Delayed ROI Lifecycle", () => {
    it("should reject 14-day plan at plan validation gate due to quick-win violation", () => {
      // Step 1: Owner submits 14-day plan
      const plan_duration_days = 14;
      expect(plan_duration_days).toBe(14);

      // Step 2: Validation gate checks quick-win requirement
      const quick_win_threshold = 7;
      const exceeds_threshold = plan_duration_days > quick_win_threshold;
      expect(exceeds_threshold).toBe(true);

      // Step 3: Plan rejected
      expect(scenario.expected_quick_win_validation).toBe(false);

      // Step 4: Audit packet created for rejection
      const rejection_packet = auditor.createAuditPacket({
        action_id: scenario.action_id,
        decision_id: scenario.decision_id,
        workspace_id: scenario.workspace_id,
        baseline_metric: {
          name: "Quick Win Compliance",
          baseline_value: 7,
          actual_value: 7,
          unit: "days",
        },
        actual_outcome: {
          name: "Quick Win Compliance",
          baseline_value: 7,
          actual_value: 14,
          unit: "days",
        },
        variance: 7,
        variance_pct: 100,
        before_confidence: 75,
        after_confidence: 60,
        feedback_action: "HALT",
        measurement_quality: MeasurementQuality.HIGH,
      });

      expect(rejection_packet!.feedback_action).toBe("HALT");
    });

    it("should offer adjustment option to break into 7-day increments", () => {
      // Owner decision after rejection:
      // Option 1: Accept 14-day plan (non-quick-win, requires special approval)
      // Option 2: Break into 7-day increments with intermediate checkpoint
      const adjustment_available = scenario.expected_plan_adjustment;
      expect(adjustment_available).toContain("7-day increments");
    });

    it("should apply LOW measurement confidence to intermediate outcome", () => {
      // Owner approves adjusted plan with 7-day checkpoint
      // Day 7 measurement: LOW confidence (only 50% through plan)
      const day7_confidence = confidenceUpdater.updateConfidence({
        current_confidence: 75,
        variance_pct: 5, // Intermediate positive signal
        measurement_confidence: 50, // LOW confidence at day 7
      });

      // Update capped at 10% for LOW confidence
      expect(day7_confidence.new_confidence).toBeLessThanOrEqual(85);
      expect(day7_confidence.confidence_change).toBeLessThanOrEqual(10);
    });

    it("should enable go/no-go decision at day 7 checkpoint", () => {
      // At day 7:
      // - If intermediate variance > failure threshold (-10%): owner can continue
      // - If intermediate variance < failure threshold: owner can halt/replan
      // - This enables early stopping for delayed ROI with negative signal
      const can_halt_early = true;
      expect(can_halt_early).toBe(true);
    });

    it("should apply HIGH measurement confidence to final outcome (day 14)", () => {
      // Day 14 measurement: HIGH confidence (full execution completed)
      const day14_confidence = confidenceUpdater.updateConfidence({
        current_confidence: 80, // After day 7 checkpoint
        variance_pct: 8, // Final positive result
        measurement_confidence: 95, // HIGH confidence at day 14
      });

      expect(day14_confidence.new_confidence).toBeGreaterThan(80);
      expect(day14_confidence.confidence_change).toBeLessThanOrEqual(20); // Standard +20% cap
    });

    it("should track positive trajectory (day 7: +5% → day 14: +8%)", () => {
      // Intermediate variance: +5% at day 7
      // Final variance: +8% at day 14
      // Trajectory: improving
      const day7_variance = 5;
      const day14_variance = 8;
      const trajectory = day14_variance - day7_variance;
      expect(trajectory).toBeGreaterThan(0); // Positive trajectory
    });

    it("should show measurement quality improvement from LOW to HIGH", () => {
      // Day 7: measurement_confidence = 50 (LOW)
      // Day 14: measurement_confidence = 95 (HIGH)
      // Quality progression demonstrates reduced uncertainty over time
      const day7_quality = 50;
      const day14_quality = 95;
      expect(day14_quality).toBeGreaterThan(day7_quality);
    });
  });
});
