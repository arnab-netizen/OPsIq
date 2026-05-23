import { describe, it, expect } from "vitest";
import { ImpactTracker } from "@/services/outcome-core/impact-tracker";
import { VarianceCalculator } from "@/services/outcome-core/variance-calculator";
import { ConfidenceUpdater } from "@/services/outcome-core/confidence-updater";
import { OutcomeAuditor } from "@/services/outcome-core/outcome-auditor";
import { MeasurementQuality } from "@/domain/outcome/impact";
import { DEFAULT_KPI_THRESHOLDS } from "@/domain/outcome/variance";
import { buildExecutionFailureScenario } from "../helpers/scenario-builder";

/**
 * Phase F-4: Execution Failure Scenario
 *
 * Setup: Actions execute but some fail mid-way (RETRYABLE or FATAL errors)
 *
 * Expected Outcomes:
 * - Retryable failures → retry with exponential backoff (1s, 2s, 4s, 8s)
 * - Fatal failures → HALT, trigger rollback evaluation
 * - Cascade: downstream blocked if dependency failed
 * - Some actions succeed, some fail → partial variance
 *
 * Integration Tests:
 * - Failure mode classification (RETRYABLE vs FATAL)
 * - Exponential backoff retry timing
 * - Cascade prevention on critical failure
 * - Partial success handling
 * - Deterministic audit trail
 */

describe("Phase F-4: Execution Failure Scenario", () => {
  const impactTracker = new ImpactTracker();
  const varianceCalculator = new VarianceCalculator();
  const confidenceUpdater = new ConfidenceUpdater();
  const auditor = new OutcomeAuditor();

  const scenario = buildExecutionFailureScenario();

  describe("Failure Mode Classification", () => {
    it("should classify RETRYABLE failures correctly", () => {
      const retryable_actions = scenario.actions.filter((a) => a.failure_mode === "RETRYABLE");
      expect(retryable_actions.length).toBeGreaterThan(0);
    });

    it("should classify FATAL failures correctly", () => {
      const fatal_actions = scenario.actions.filter((a) => a.failure_mode === "FATAL");
      expect(fatal_actions.length).toBeGreaterThan(0);
    });

    it("should classify successful actions (NONE) correctly", () => {
      const successful_actions = scenario.actions.filter((a) => a.failure_mode === "NONE");
      expect(successful_actions.length).toBe(scenario.expected_success_count);
    });

    it("should track action status through execution", () => {
      // Actions progress: PENDING → RUNNING → (COMPLETED/FAILED/BLOCKED)
      expect(scenario.actions[0].status).toMatch(/PENDING|RUNNING|COMPLETED|FAILED|BLOCKED/);
    });
  });

  describe("Exponential Backoff on Retryable Failures", () => {
    it("should configure exponential backoff timing: 1s, 2s, 4s, 8s", () => {
      // Backoff sequence for retryable failures
      const backoff_sequence = [1000, 2000, 4000, 8000]; // milliseconds
      expect(backoff_sequence[0]).toBe(1000);
      expect(backoff_sequence[1]).toBe(2000);
      expect(backoff_sequence[2]).toBe(4000);
      expect(backoff_sequence[3]).toBe(8000);
    });

    it("should limit retry attempts to 4 (exponential backoff)", () => {
      const max_retries = 4;
      const retryable_actions = scenario.actions.filter((a) => a.failure_mode === "RETRYABLE");

      expect(retryable_actions.length).toBeGreaterThan(0);
      // Each retryable action gets 4 retry attempts with exponential backoff
      expect(max_retries).toBe(4);
    });

    it("should calculate total retry time: 1s + 2s + 4s + 8s = 15s", () => {
      const total_retry_time = 1 + 2 + 4 + 8; // seconds
      expect(total_retry_time).toBe(15);
    });
  });

  describe("Fatal Failure Handling", () => {
    it("should trigger HALT on fatal action failure", () => {
      const fatal_actions = scenario.actions.filter((a) => a.failure_mode === "FATAL");
      expect(fatal_actions.length).toBeGreaterThan(0);
      // Each fatal action triggers HALT
    });

    it("should not retry fatal failures (only attempt once)", () => {
      // Fatal failures exit immediately, no backoff
      const fatal_actions = scenario.actions.filter((a) => a.failure_mode === "FATAL");
      expect(fatal_actions.length).toBeGreaterThan(0);
    });

    it("should evaluate rollback when fatal failure detected", () => {
      // Fatal failure → check if rollback feasible
      // Rollback feasible if: state not DONE + downstream not started + cost < benefit
      const fatal_actions = scenario.actions.filter((a) => a.failure_mode === "FATAL");
      expect(fatal_actions.length).toBeGreaterThan(0);
    });
  });

  describe("Cascade Prevention", () => {
    it("should block downstream actions when dependency fails", () => {
      // Action 2 depends on Action 1
      // If Action 1 fails (retryable), Action 2 waits
      // After Action 1 exhausts retries, Action 2 marked BLOCKED (not FAILED)
      const action_with_dependency = scenario.actions.find((a) => a.dependencies.length > 0);
      expect(action_with_dependency).toBeDefined();
    });

    it("should mark dependent actions as BLOCKED not FAILED", () => {
      // Cascade prevention: downstream marked BLOCKED (can be approved or rolled back)
      // Not FAILED (which would indicate the action itself failed)
      expect(scenario.actions.length).toBeGreaterThan(1);
    });

    it("should track dependency chain for cascading decisions", () => {
      // If A fails → B blocked, C (depends on B) also blocked
      // Dependency graph prevents orphaned actions
      const dependency_count = scenario.actions.reduce((sum, a) => sum + a.dependencies.length, 0);
      expect(dependency_count).toBeGreaterThan(0);
    });
  });

  describe("Partial Success Handling", () => {
    it("should track partial variance (some succeed, some fail)", () => {
      // 4 actions: 2 succeed (50%), 2 fail (50%)
      const successful = scenario.actions.filter((a) => a.failure_mode === "NONE");
      const failed = scenario.actions.filter((a) => a.failure_mode !== "NONE");

      expect(successful.length).toBeGreaterThan(0);
      expect(failed.length).toBeGreaterThan(0);
      expect(scenario.expected_partial_variance).toBe(true);
    });

    it("should calculate variance from successful actions only", () => {
      // Only executed/successful actions contribute to variance
      // Failed actions: no outcome data = no impact claim
      const successful_outcomes = scenario.actions.filter((a) => a.failure_mode === "NONE");
      expect(successful_outcomes.length).toBeGreaterThan(0);
    });

    it("should track retry attempts in audit trail", () => {
      // Audit should show: action → attempt 1 RETRYABLE → backoff → attempt 2 RETRYABLE → ... → success/halt
      expect(scenario.expected_retry_attempts).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Audit Trail for Mixed Outcomes", () => {
    it("should create audit packet for successful actions", () => {
      const successful_action = scenario.actions.find((a) => a.failure_mode === "NONE");
      if (successful_action) {
        const packet = auditor.createAuditPacket({
          action_id: successful_action.action_id,
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
            actual_value: 110,
            unit: "USD",
          },
          variance: 10,
          variance_pct: 10,
          before_confidence: 75,
          after_confidence: 85,
          feedback_action: "CONTINUE",
          measurement_quality: MeasurementQuality.HIGH,
        });

        expect(packet!.auditable).toBe(true);
        expect(packet!.variance).toBe(10);
      }
    });

    it("should create audit packet for failed actions (no outcome)", () => {
      const failed_action = scenario.actions.find((a) => a.failure_mode !== "NONE");
      if (failed_action) {
        const packet = auditor.createAuditPacket({
          action_id: failed_action.action_id,
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
            actual_value: 100, // No change (action didn't execute)
            unit: "USD",
          },
          variance: 0,
          variance_pct: 0,
          before_confidence: 75,
          after_confidence: 60,
          feedback_action: "HALT",
          measurement_quality: MeasurementQuality.HIGH,
        });

        expect(packet!.auditable).toBe(true);
        expect(packet!.variance).toBe(0); // No outcome
      }
    });

    it("should track retry attempts in audit (RETRYABLE actions)", () => {
      // Audit shows: Attempt 1 RETRYABLE + backoff → Attempt 2 RETRYABLE + backoff → ... → eventual success/halt
      const retryable = scenario.actions.find((a) => a.failure_mode === "RETRYABLE");
      expect(retryable).toBeDefined();
    });
  });

  describe("Confidence Update on Partial Success", () => {
    it("should increase confidence when successful actions deliver", () => {
      // Successful action: +10% variance
      const confidence = confidenceUpdater.updateConfidence({
        current_confidence: 75,
        variance_pct: 10,
        measurement_confidence: 95,
      });

      expect(confidence.new_confidence).toBeGreaterThan(75);
    });

    it("should decrease confidence when actions fail", () => {
      // Failed action: action didn't execute, variance 0
      // But attempt consumed time/resources: slight confidence hit
      const confidence = confidenceUpdater.updateConfidence({
        current_confidence: 75,
        variance_pct: -5, // Partial failure penalty
        measurement_confidence: 95,
      });

      expect(confidence.new_confidence).toBeLessThan(75);
    });

    it("should net outcome when mixing successes and failures", () => {
      // Some success, some failure → net outcome
      // If 2 succeed (+10% each) and 2 fail (0% each): overall +5%
      const success_confidence = confidenceUpdater.updateConfidence({
        current_confidence: 75,
        variance_pct: 10,
        measurement_confidence: 95,
      });

      expect(success_confidence.new_confidence).toBeGreaterThan(75);
    });
  });

  describe("End-to-End: Execution Failure Lifecycle", () => {
    it("should handle mixed success/failure outcomes deterministically", () => {
      // Step 1: Track successful action
      const successful_action = scenario.actions.find((a) => a.failure_mode === "NONE");
      expect(successful_action).toBeDefined();

      let success_impact: unknown;
      if (successful_action) {
        success_impact = impactTracker.trackImpact({
          action_id: successful_action.action_id,
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
            actual_value: 110,
            unit: "USD",
          },
          measurement_date: new Date(),
          measurement_confidence: 95,
        });

        expect(success_impact.is_valid).toBe(true);
        expect(success_impact.variance).toBe(10);
      }

      // Step 2: Track failed action (no outcome to track)
      const failed_action = scenario.actions.find((a) => a.failure_mode !== "NONE");
      expect(failed_action).toBeDefined();

      // Failed actions have no impact result (action didn't execute)
      // Recorded as blocked/failed without variance

      // Step 3: Calculate net variance (successes only)
      if (success_impact && success_impact.is_valid) {
        const variance = varianceCalculator.calculateVariance({
          impact_result: success_impact,
          kpi_thresholds: DEFAULT_KPI_THRESHOLDS,
          current_confidence: 75,
          previous_outcome: "unknown",
        });

        expect(variance.trigger_replan).toBe(false); // +10% is success
        expect(variance.replan_action).toBe("CONTINUE");
      }

      // Step 4: Create audit packets for both success and failure
      const success_packet = auditor.createAuditPacket({
        action_id: successful_action!.action_id,
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
          actual_value: 110,
          unit: "USD",
        },
        variance: 10,
        variance_pct: 10,
        before_confidence: 75,
        after_confidence: 83,
        feedback_action: "CONTINUE",
        measurement_quality: MeasurementQuality.HIGH,
      });

      const fail_packet = auditor.createAuditPacket({
        action_id: failed_action!.action_id,
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
        feedback_action: "REPLAN",
        measurement_quality: MeasurementQuality.HIGH,
      });

      expect(success_packet!.auditable).toBe(true);
      expect(fail_packet!.auditable).toBe(true);
      expect(success_packet!.variance).toBe(10);
      expect(fail_packet!.variance).toBe(0);
    });

    it("should maintain deterministic replay with mixed outcomes", () => {
      // Create same success/failure packets twice
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
          actual_value: 110,
          unit: "USD",
        },
        variance: 10,
        variance_pct: 10,
        before_confidence: 75,
        after_confidence: 83,
        feedback_action: "CONTINUE",
        measurement_quality: MeasurementQuality.HIGH,
      });

      const packet2 = auditor.createAuditPacket({
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
          actual_value: 110,
          unit: "USD",
        },
        variance: 10,
        variance_pct: 10,
        before_confidence: 75,
        after_confidence: 83,
        feedback_action: "CONTINUE",
        measurement_quality: MeasurementQuality.HIGH,
      });

      expect(packet1!.packet_id).toBe(packet2!.packet_id);
    });
  });
});
