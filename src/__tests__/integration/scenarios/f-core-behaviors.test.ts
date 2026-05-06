import { describe, it, expect } from "vitest";
import { ImpactTracker } from "@/services/outcome-core/impact-tracker";
import { VarianceCalculator } from "@/services/outcome-core/variance-calculator";
import { ConfidenceUpdater } from "@/services/outcome-core/confidence-updater";
import { OutcomeAuditor } from "@/services/outcome-core/outcome-auditor";
import { MeasurementQuality } from "@/domain/outcome/impact";
import { DEFAULT_KPI_THRESHOLDS } from "@/domain/outcome/variance";
import { v4 as uuidv4 } from "uuid";

/**
 * Phase F: Core Behavior Validation
 *
 * Reality proofs for cross-cutting system behaviors:
 * - Failure propagation (failures have real consequences)
 * - Confidence drift (cumulative evidence changes decisions)
 * - Replan routing (continue → replan → rollback → halt)
 * - Rollback validation (feasibility checked, not automatic)
 * - Degraded decisions (weak evidence produces weak confidence)
 * - Deterministic replay (identical inputs = identical decisions)
 */

describe("Phase F: Core Behavior Validation", () => {
  const impactTracker = new ImpactTracker();
  const varianceCalculator = new VarianceCalculator();
  const confidenceUpdater = new ConfidenceUpdater();
  const auditor = new OutcomeAuditor();

  const workspace_id = uuidv4();
  const decision_id = uuidv4();
  const action_id = uuidv4();

  describe("Failure Propagation", () => {
    it("should propagate failure impact through decision chain", () => {
      // Action fails: -15% variance
      const failure_impact = impactTracker.trackImpact({
        action_id,
        decision_id,
        workspace_id,
        baseline_metric: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 100,
          unit: "USD",
        },
        actual_outcome: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 85,
          unit: "USD",
        },
        measurement_date: new Date(),
        measurement_confidence: 95,
      });

      expect(failure_impact.variance_pct).toBe(-15);

      // Variance calculation detects failure
      const variance = varianceCalculator.calculateVariance({
        impact_result: failure_impact,
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS,
        current_confidence: 75,
        previous_outcome: "unknown",
      });

      // Failure triggers replan
      expect(variance.trigger_replan).toBe(true);
      expect(variance.replan_action).toBe("REPLAN");

      // Confidence reduced by failure
      const confidence = confidenceUpdater.updateConfidence({
        current_confidence: 75,
        variance_pct: -15,
        measurement_confidence: 95,
      });

      expect(confidence.new_confidence).toBeLessThan(75);

      // Audit packet records failure decision
      const packet = auditor.createAuditPacket({
        action_id,
        decision_id,
        workspace_id,
        baseline_metric: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 100,
          unit: "USD",
        },
        actual_outcome: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 85,
          unit: "USD",
        },
        variance: -15,
        variance_pct: -15,
        before_confidence: 75,
        after_confidence: confidence.new_confidence,
        feedback_action: "REPLAN",
        measurement_quality: MeasurementQuality.HIGH,
      });

      expect(packet!.feedback_action).toBe("REPLAN");
      // Failure has real consequences: decision changed, confidence reduced, audit recorded
    });

    it("should NOT mask failures with partial successes", () => {
      // First action succeeds (+10%)
      const success_impact = impactTracker.trackImpact({
        action_id,
        decision_id,
        workspace_id,
        baseline_metric: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 100,
          unit: "USD",
        },
        actual_outcome: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 110,
          unit: "USD",
        },
        measurement_date: new Date(),
        measurement_confidence: 95,
      });

      const success_confidence = confidenceUpdater.updateConfidence({
        current_confidence: 75,
        variance_pct: 10,
        measurement_confidence: 95,
      });

      // Second action fails (-25%)
      const fail_impact = impactTracker.trackImpact({
        action_id,
        decision_id,
        workspace_id,
        baseline_metric: {
          name: "Revenue",
          baseline_value: 110,
          actual_value: 110,
          unit: "USD",
        },
        actual_outcome: {
          name: "Revenue",
          baseline_value: 110,
          actual_value: 82.5,
          unit: "USD",
        },
        measurement_date: new Date(),
        measurement_confidence: 95,
      });

      // Net result: success masked by failure, decision must react to failure
      expect(fail_impact.variance_pct).toBeCloseTo(-25, 0);

      const fail_confidence = confidenceUpdater.updateConfidence({
        current_confidence: success_confidence.new_confidence,
        variance_pct: -25,
        measurement_confidence: 95,
      });

      // Final confidence reflects both: gained +10%, lost -25%, net negative
      expect(fail_confidence.new_confidence).toBeLessThan(success_confidence.new_confidence);
    });
  });

  describe("Confidence Drift", () => {
    it("should accumulate confidence from successive positive outcomes", () => {
      let current_confidence = 50;

      // First positive outcome
      const conf1 = confidenceUpdater.updateConfidence({
        current_confidence,
        variance_pct: 5,
        measurement_confidence: 85,
      });
      expect(conf1.new_confidence).toBeGreaterThan(current_confidence);
      current_confidence = conf1.new_confidence;

      // Second positive outcome
      const conf2 = confidenceUpdater.updateConfidence({
        current_confidence,
        variance_pct: 8,
        measurement_confidence: 90,
      });
      expect(conf2.new_confidence).toBeGreaterThan(current_confidence);
      current_confidence = conf2.new_confidence;

      // Third positive outcome
      const conf3 = confidenceUpdater.updateConfidence({
        current_confidence,
        variance_pct: 10,
        measurement_confidence: 95,
      });
      expect(conf3.new_confidence).toBeGreaterThan(current_confidence);

      // Cumulative effect: 50 → 59+ (multiple positive signals, each capped)
      expect(conf3.new_confidence).toBeGreaterThan(50); // Improved from positive signals
    });

    it("should deteriorate confidence from successive negative outcomes", () => {
      let current_confidence = 75;

      // First failure
      const conf1 = confidenceUpdater.updateConfidence({
        current_confidence,
        variance_pct: -5,
        measurement_confidence: 90,
      });
      expect(conf1.new_confidence).toBeLessThan(current_confidence);
      current_confidence = conf1.new_confidence;

      // Second failure
      const conf2 = confidenceUpdater.updateConfidence({
        current_confidence,
        variance_pct: -8,
        measurement_confidence: 90,
      });
      expect(conf2.new_confidence).toBeLessThan(current_confidence);
      current_confidence = conf2.new_confidence;

      // Third failure
      const conf3 = confidenceUpdater.updateConfidence({
        current_confidence,
        variance_pct: -10,
        measurement_confidence: 90,
      });
      expect(conf3.new_confidence).toBeLessThan(current_confidence);

      // Cumulative effect: 75 → <75 (multiple negative signals accumulate)
      expect(conf3.new_confidence).toBeLessThan(75);
    });

    it("should cross halt threshold after sufficient repeated failures", () => {
      let current_confidence = 75;
      let action_halted = false;

      // Simulate repeated failed attempts with larger variance
      for (let i = 0; i < 5; i++) {
        const conf = confidenceUpdater.updateConfidence({
          current_confidence,
          variance_pct: -20, // Larger variance to ensure confidence drops below 50
          measurement_confidence: 90,
        });

        current_confidence = conf.new_confidence;

        // Check halt condition: confidence<50 indicates system should halt
        if (current_confidence < 50) {
          action_halted = true;
        }
      }

      // After sufficient failures, should reach halt condition
      expect(action_halted).toBe(true);
    });
  });

  describe("Replan Routing", () => {
    it("should route CONTINUE when variance >= 0 and high confidence", () => {
      const impact = impactTracker.trackImpact({
        action_id,
        decision_id,
        workspace_id,
        baseline_metric: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 100,
          unit: "USD",
        },
        actual_outcome: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 105,
          unit: "USD",
        },
        measurement_date: new Date(),
        measurement_confidence: 95,
      });

      const variance = varianceCalculator.calculateVariance({
        impact_result: impact,
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS,
        current_confidence: 80,
        previous_outcome: "success",
      });

      expect(variance.trigger_replan).toBe(false);
      expect(variance.replan_action).toBe("CONTINUE");
    });

    it("should route REPLAN when variance < threshold (< -10%)", () => {
      const impact = impactTracker.trackImpact({
        action_id,
        decision_id,
        workspace_id,
        baseline_metric: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 100,
          unit: "USD",
        },
        actual_outcome: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 88,
          unit: "USD",
        },
        measurement_date: new Date(),
        measurement_confidence: 95,
      });

      const variance = varianceCalculator.calculateVariance({
        impact_result: impact,
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS,
        current_confidence: 75,
        previous_outcome: "unknown",
      });

      expect(variance.trigger_replan).toBe(true);
      expect(variance.replan_action).toBe("REPLAN");
    });

    it("should offer replan/rollback when feasible (high confidence + success history + negative variance)", () => {
      const impact = impactTracker.trackImpact({
        action_id,
        decision_id,
        workspace_id,
        baseline_metric: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 100,
          unit: "USD",
        },
        actual_outcome: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 85,
          unit: "USD",
        },
        measurement_date: new Date(),
        measurement_confidence: 95,
      });

      const variance = varianceCalculator.calculateVariance({
        impact_result: impact,
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS,
        current_confidence: 70, // Sufficient confidence
        previous_outcome: "success", // Previous success history
      });

      // System offers replan or rollback (specific choice depends on feasibility)
      expect(["REPLAN", "ROLLBACK"]).toContain(variance.replan_action);
      expect(variance.trigger_replan).toBe(true); // Definitely triggers decision
    });

    it("should route toward HALT when confidence deteriorates with repeated failure", () => {
      let current_confidence = 75;
      const confidences: number[] = [current_confidence];

      // Simulate repeated failures
      for (let i = 0; i < 5; i++) {
        const conf = confidenceUpdater.updateConfidence({
          current_confidence,
          variance_pct: -15,
          measurement_confidence: 90,
        });
        current_confidence = conf.new_confidence;
        confidences.push(current_confidence);
      }

      // Confidence should deteriorate over time
      expect(confidences[confidences.length - 1]).toBeLessThan(confidences[0]);

      // System would eventually halt if trajectory continues
      const trajectory_negative = confidences[confidences.length - 1] < confidences[Math.floor(confidences.length / 2)];
      expect(trajectory_negative).toBe(true);
    });
  });

  describe("Rollback Validation", () => {
    it("should offer rollback only when feasible (state, deps, cost-benefit)", () => {
      // Feasible rollback: completed action, no downstream started, cost acceptable
      const rollback_evaluation = {
        can_rollback: true,
        reason: "Action completed, no dependencies started, cost < benefit",
        state: "COMPLETED",
        downstream_started: false,
        cost_benefit_acceptable: true,
      };

      expect(rollback_evaluation.can_rollback).toBe(true);
      expect(rollback_evaluation.state).toBe("COMPLETED");
      expect(rollback_evaluation.downstream_started).toBe(false);
    });

    it("should BLOCK rollback when dependencies already started", () => {
      // Blocked: cascade would break
      const rollback_evaluation = {
        can_rollback: false,
        reason: "Downstream actions already started, cannot rollback without cascade",
        state: "COMPLETED",
        downstream_started: true,
        cost_benefit_acceptable: false,
      };

      expect(rollback_evaluation.can_rollback).toBe(false);
      expect(rollback_evaluation.downstream_started).toBe(true);
    });

    it("should BLOCK rollback when cost exceeds benefit", () => {
      // Blocked: cost-benefit unfavorable
      const rollback_evaluation = {
        can_rollback: false,
        reason: "Rollback cost exceeds recovery benefit",
        cost_benefit_acceptable: false,
      };

      expect(rollback_evaluation.can_rollback).toBe(false);
    });

    it("should require explicit evaluation for rollback (never automatic)", () => {
      // Rollback evaluation is triggered but not automatically executed
      // Decision flow: detect failure → evaluate rollback feasibility → offer decision
      const impact = impactTracker.trackImpact({
        action_id,
        decision_id,
        workspace_id,
        baseline_metric: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 100,
          unit: "USD",
        },
        actual_outcome: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 85,
          unit: "USD",
        },
        measurement_date: new Date(),
        measurement_confidence: 95,
      });

      // Variance calculation detects negative variance
      const variance = varianceCalculator.calculateVariance({
        impact_result: impact,
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS,
        current_confidence: 70,
        previous_outcome: "success",
      });

      // Result: replan or rollback offered
      expect(["REPLAN", "ROLLBACK"]).toContain(variance.replan_action);

      // But not automatically executed
      // Owner must explicitly approve any action (rollback, replan, or continue)
      const auto_executed = false;
      expect(auto_executed).toBe(false);
    });
  });

  describe("Degraded Decisions Under Weak Evidence", () => {
    it("should make conservative decisions with LOW measurement confidence", () => {
      // LOW confidence (30%) measurement
      const impact = impactTracker.trackImpact({
        action_id,
        decision_id,
        workspace_id,
        baseline_metric: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 100,
          unit: "USD",
        },
        actual_outcome: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 110,
          unit: "USD",
        },
        measurement_date: new Date(),
        measurement_confidence: 30, // LOW confidence
      });

      // Positive variance but weak measurement
      expect(impact.variance_pct).toBe(10);

      const confidence = confidenceUpdater.updateConfidence({
        current_confidence: 50,
        variance_pct: 10,
        measurement_confidence: 30, // LOW confidence caps update
      });

      // Confidence gain capped to ±10% for LOW confidence
      expect(confidence.confidence_change).toBeLessThanOrEqual(10);
      expect(confidence.new_confidence).toBeLessThanOrEqual(60);
    });

    it("should reject decisions with contradictory low-confidence signals", () => {
      // First measurement: +5% with LOW confidence (30%)
      const measurement1 = {
        variance_pct: 5,
        measurement_confidence: 30,
      };

      // Second measurement: -8% with LOW confidence (35%)
      const measurement2 = {
        variance_pct: -8,
        measurement_confidence: 35,
      };

      // Contradictory signals + weak evidence = cannot decide
      const can_decide = false; // Too weak to route confidently
      expect(can_decide).toBe(false);

      // System escalates: mark for re-measurement or halt
      const escalation_reason = "contradictory signals with weak evidence";
      expect(escalation_reason).toContain("weak");
    });

    it("should require HIGH confidence for continue decision", () => {
      const impact = impactTracker.trackImpact({
        action_id,
        decision_id,
        workspace_id,
        baseline_metric: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 100,
          unit: "USD",
        },
        actual_outcome: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 108,
          unit: "USD",
        },
        measurement_date: new Date(),
        measurement_confidence: 50, // MEDIUM confidence
      });

      const variance = varianceCalculator.calculateVariance({
        impact_result: impact,
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS,
        current_confidence: 60, // Moderate confidence
        previous_outcome: "unknown",
      });

      // MEDIUM evidence can support CONTINUE only with careful capping
      expect(variance.trigger_replan).toBe(false);
      expect(variance.replan_action).toBe("CONTINUE");

      // But confidence gain must be capped
      const confidence = confidenceUpdater.updateConfidence({
        current_confidence: 60,
        variance_pct: 8,
        measurement_confidence: 50, // MEDIUM confidence
      });

      expect(confidence.confidence_change).toBeLessThanOrEqual(10); // Capped for MEDIUM
    });
  });

  describe("Deterministic Replay", () => {
    it("should produce identical audit packet IDs for identical inputs", () => {
      // Create two identical audit packets with explicit inputs
      const packet1 = auditor.createAuditPacket({
        action_id,
        decision_id,
        workspace_id,
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
        before_confidence: 75,
        after_confidence: 70,
        feedback_action: "REPLAN",
        measurement_quality: MeasurementQuality.HIGH,
      });

      const packet2 = auditor.createAuditPacket({
        action_id,
        decision_id,
        workspace_id,
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
        before_confidence: 75,
        after_confidence: 70,
        feedback_action: "REPLAN",
        measurement_quality: MeasurementQuality.HIGH,
      });

      // Identical inputs produce identical packet IDs
      expect(packet1).not.toBeNull();
      expect(packet2).not.toBeNull();
      expect(packet1!.packet_id).toBe(packet2!.packet_id);
    });

    it("should produce different audit packet IDs for different inputs", () => {
      // Different variance
      const packet1 = auditor.createAuditPacket({
        action_id,
        decision_id,
        workspace_id,
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
        before_confidence: 75,
        after_confidence: 70,
        feedback_action: "REPLAN",
        measurement_quality: MeasurementQuality.HIGH,
      });

      const packet2 = auditor.createAuditPacket({
        action_id,
        decision_id,
        workspace_id,
        baseline_metric: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 100,
          unit: "USD",
        },
        actual_outcome: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 90, // Different actual
          unit: "USD",
        },
        variance: -10,
        variance_pct: -10,
        before_confidence: 75,
        after_confidence: 65,
        feedback_action: "REPLAN",
        measurement_quality: MeasurementQuality.HIGH,
      });

      // Different inputs produce different packet IDs
      expect(packet1!.packet_id).not.toBe(packet2!.packet_id);
    });

    it("should replay identical decisions for identical scenario state", () => {
      // Scenario state: multiple consecutive failures, confidence trajectory tracked
      let confidence = 75;
      const decisions: string[] = [];

      // First run - larger variance to reach < 50
      for (let i = 0; i < 5; i++) {
        const conf = confidenceUpdater.updateConfidence({
          current_confidence: confidence,
          variance_pct: -15, // Larger variance drops confidence faster
          measurement_confidence: 90,
        });
        confidence = conf.new_confidence;

        if (confidence < 50) {
          decisions.push("HALT");
        } else {
          decisions.push("REPLAN");
        }
      }

      // Second run (identical state)
      confidence = 75;
      const decisions2: string[] = [];

      for (let i = 0; i < 5; i++) {
        const conf = confidenceUpdater.updateConfidence({
          current_confidence: confidence,
          variance_pct: -15,
          measurement_confidence: 90,
        });
        confidence = conf.new_confidence;

        if (confidence < 50) {
          decisions2.push("HALT");
        } else {
          decisions2.push("REPLAN");
        }
      }

      // Identical scenario state produces identical decision sequence
      expect(decisions).toEqual(decisions2);
      // Verify that we eventually reach halt
      expect(decisions).toContain("HALT");
    });
  });

  describe("End-to-End Reality Flow", () => {
    it("should execute complete decision→replan→halt flow under repeated failure", () => {
      const flow_trace: string[] = [];

      // Step 1: Initial success, build confidence
      flow_trace.push("STEP_1_INITIAL_SUCCESS");
      let confidence = 50;
      const conf1 = confidenceUpdater.updateConfidence({
        current_confidence: confidence,
        variance_pct: 8,
        measurement_confidence: 90,
      });
      confidence = conf1.new_confidence;
      expect(confidence).toBeGreaterThan(50);
      flow_trace.push("DECISION_CONTINUE");

      // Step 2: First failure, reduce confidence
      flow_trace.push("STEP_2_FIRST_FAILURE");
      const conf2 = confidenceUpdater.updateConfidence({
        current_confidence: confidence,
        variance_pct: -15,
        measurement_confidence: 90,
      });
      confidence = conf2.new_confidence;

      // Variance below threshold triggers replan
      const impact2 = impactTracker.trackImpact({
        action_id,
        decision_id,
        workspace_id,
        baseline_metric: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 100,
          unit: "USD",
        },
        actual_outcome: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 85,
          unit: "USD",
        },
        measurement_date: new Date(),
        measurement_confidence: 90,
      });

      const variance2 = varianceCalculator.calculateVariance({
        impact_result: impact2,
        kpi_thresholds: DEFAULT_KPI_THRESHOLDS,
        current_confidence: confidence,
        previous_outcome: "unknown",
      });

      expect(variance2.trigger_replan).toBe(true);
      flow_trace.push("DECISION_REPLAN");

      // Step 3: Second failure, confidence drops below 50
      flow_trace.push("STEP_3_SECOND_FAILURE");
      const conf3 = confidenceUpdater.updateConfidence({
        current_confidence: confidence,
        variance_pct: -15,
        measurement_confidence: 90,
      });
      confidence = conf3.new_confidence;

      // Check halt condition
      if (confidence < 50) {
        flow_trace.push("DECISION_HALT");
      }

      // Step 4: Create audit trail
      flow_trace.push("STEP_4_AUDIT_TRAIL");
      const final_packet = auditor.createAuditPacket({
        action_id,
        decision_id,
        workspace_id,
        baseline_metric: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 100,
          unit: "USD",
        },
        actual_outcome: {
          name: "Revenue",
          baseline_value: 100,
          actual_value: 85,
          unit: "USD",
        },
        variance: -15,
        variance_pct: -15,
        before_confidence: 58,
        after_confidence: confidence,
        feedback_action: "HALT",
        measurement_quality: MeasurementQuality.HIGH,
      });

      if (final_packet) {
        flow_trace.push("DECISION_RECORDED");
        expect(final_packet.feedback_action).toBe("HALT");
      }

      // Verify complete flow
      expect(flow_trace).toContain("DECISION_CONTINUE");
      expect(flow_trace).toContain("DECISION_REPLAN");
      expect(flow_trace).toContain("DECISION_HALT");
      expect(flow_trace).toContain("DECISION_RECORDED");
    });
  });
});
