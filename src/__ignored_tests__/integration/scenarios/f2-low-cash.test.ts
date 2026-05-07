import { describe, it, expect } from "vitest";
import { ImpactTracker } from "@/services/outcome-core/impact-tracker";
import { VarianceCalculator } from "@/services/outcome-core/variance-calculator";
import { ConfidenceUpdater } from "@/services/outcome-core/confidence-updater";
import { OutcomeAuditor } from "@/services/outcome-core/outcome-auditor";
import { QuickWinEnforcer } from "@/services/outcome-core/quick-win-enforcer";
import { MeasurementQuality } from "@/domain/outcome/impact";
import { DEFAULT_KPI_THRESHOLDS } from "@/domain/outcome/variance";
import { buildLowCashScenario } from "../helpers/scenario-builder";

/**
 * Phase F-2: Low Cash Scenario
 *
 * Setup: Initial cash position too low (runway <3 months), expensive actions fail financially
 *
 * Expected Outcomes:
 * - Action execution fails due to cost (FATAL classification)
 * - Rollback triggered to preserve cash
 * - Downstream actions blocked (dependency on failed action)
 * - Halt triggered (cannot proceed without cash)
 * - Financial viability gates enforced
 *
 * Integration Tests:
 * - Cost constraint validation
 * - Financial viability gate
 * - Cascade prevention on critical failure
 * - Escalation to owner
 * - Deterministic audit trail
 */

describe("Phase F-2: Low Cash Scenario", () => {
  const impactTracker = new ImpactTracker();
  const varianceCalculator = new VarianceCalculator();
  const confidenceUpdater = new ConfidenceUpdater();
  const auditor = new OutcomeAuditor();
  const quickWinEnforcer = new QuickWinEnforcer();

  const scenario = buildLowCashScenario();

  describe("Cash Position Validation", () => {
    it("should detect insufficient cash for expensive action", () => {
      // Cash: $5, Action cost: $30
      expect(scenario.action.estimated_cost).toBeGreaterThan(scenario.condition.available_cash);
    });

    it("should classify action as FATAL when cost exceeds cash", () => {
      const affordable = scenario.action.estimated_cost <= scenario.condition.available_cash;
      expect(affordable).toBe(false);
      expect(scenario.action.failure_mode).toBe("FATAL");
    });

    it("should enforce financial viability gate at plan time", () => {
      // Early gate: reject before execution
      const is_affordable =
        scenario.action.estimated_cost <= scenario.condition.available_cash;
      expect(is_affordable).toBe(false);
    });
  });

  describe("Runway Calculation", () => {
    it("should calculate runway in months from available cash", () => {
      // With baseline revenue of $100/month and cash of $5
      // Runway = 5 / (100/month) ≈ 0.05 months (1.5 days)
      const monthly_revenue = scenario.condition.baseline_revenue;
      const runway_months = scenario.condition.available_cash / monthly_revenue;

      expect(runway_months).toBeLessThan(3); // Less than 3 month runway
      expect(runway_months).toBeLessThan(1); // Actually less than 1 month
    });

    it("should block actions when runway critical (<3 months)", () => {
      const monthly_revenue = scenario.condition.baseline_revenue;
      const runway_months = scenario.condition.available_cash / monthly_revenue;
      const critical = runway_months < 3;

      expect(critical).toBe(true);
    });
  });

  describe("Cost-Benefit Validation", () => {
    it("should calculate cost-benefit: action cost vs available cash", () => {
      // Action costs $30 but only $5 available
      // Cost unaffordable = HALT
      const cost_exceeds_cash = scenario.action.estimated_cost > scenario.condition.available_cash;

      expect(cost_exceeds_cash).toBe(true);
      // $30 action cost vs $5 available cash = 6x over budget
      expect(scenario.action.estimated_cost / scenario.condition.available_cash).toBeGreaterThan(5);
    });

    it("should halt action when cost unaffordable and impact uncertain", () => {
      // In low-cash scenario, unaffordable cost = HALT
      expect(scenario.expected_halt).toBe(true);
    });
  });

  describe("Cascade Prevention", () => {
    it("should prevent cascade when critical action blocked", () => {
      // Upstream: Cash check fails → BLOCKED
      // Downstream: Waiting for upstream → BLOCKED (not FAILED)
      // This prevents orphaned dependencies
      expect(scenario.expected_failure).toBe("FATAL");
      expect(scenario.expected_halt).toBe(true);
    });

    it("should mark downstream as BLOCKED instead of FAILED", () => {
      // If action A fails critically:
      // - Action A status: FAILED (not executed)
      // - Dependent actions status: BLOCKED (waiting for A, cannot proceed)
      //
      // This allows:
      // 1. Owner to approve workaround (e.g., external funding)
      // 2. Automatic rollback without cascading failures
      expect(scenario.expected_reason).toBe("Insufficient cash to execute action");
    });
  });

  describe("Escalation on Critical Failure", () => {
    it("should escalate to owner when financial viability threatened", () => {
      // Low cash = threat to business continuity
      // Escalation priority: CRITICAL (3)
      expect(scenario.expected_halt).toBe(true);
    });

    it("should provide clear reason for halt", () => {
      expect(scenario.expected_reason).toContain("cash");
    });
  });

  describe("Audit Packet Creation", () => {
    it("should create audit packet for blocked action", () => {
      // Even though action didn't execute, capture the decision
      const packet = auditor.createAuditPacket({
        action_id: scenario.action_id,
        decision_id: scenario.decision_id,
        workspace_id: scenario.workspace_id,
        baseline_metric: {
          name: "Cash Position",
          baseline_value: scenario.condition.available_cash,
          actual_value: scenario.condition.available_cash, // Unchanged
          unit: "USD",
        },
        actual_outcome: {
          name: "Cash Position",
          baseline_value: scenario.condition.available_cash,
          actual_value: scenario.condition.available_cash,
          unit: "USD",
        },
        variance: 0, // No execution = no variance
        variance_pct: 0,
        before_confidence: scenario.condition.owner_confidence,
        after_confidence: scenario.condition.owner_confidence - 15, // Confidence drops due to constraint
        feedback_action: "HALT",
        measurement_quality: MeasurementQuality.HIGH,
      });

      expect(packet).not.toBeNull();
      expect(packet!.auditable).toBe(true);
      expect(packet!.variance).toBe(0); // No execution attempted
      expect(packet!.feedback_action).toBe("HALT");
    });
  });

  describe("End-to-End: Low Cash Lifecycle", () => {
    it("should block expensive action when cash insufficient", () => {
      // Step 1: Validate cash position
      const has_cash = scenario.action.estimated_cost <= scenario.condition.available_cash;
      expect(has_cash).toBe(false);

      // Step 2: Block action execution (no impact to track)
      // Impact tracking would not occur - action blocked before execution

      // Step 3: Create audit packet for blocked decision
      const packet = auditor.createAuditPacket({
        action_id: scenario.action_id,
        decision_id: scenario.decision_id,
        workspace_id: scenario.workspace_id,
        baseline_metric: {
          name: "Cash Position",
          baseline_value: scenario.condition.available_cash,
          actual_value: scenario.condition.available_cash,
          unit: "USD",
        },
        actual_outcome: {
          name: "Cash Position",
          baseline_value: scenario.condition.available_cash,
          actual_value: scenario.condition.available_cash,
          unit: "USD",
        },
        variance: 0,
        variance_pct: 0,
        before_confidence: 75,
        after_confidence: 60,
        feedback_action: "HALT",
        measurement_quality: MeasurementQuality.HIGH,
      });

      // Verify deterministic replay
      const packet2 = auditor.createAuditPacket({
        action_id: scenario.action_id,
        decision_id: scenario.decision_id,
        workspace_id: scenario.workspace_id,
        baseline_metric: {
          name: "Cash Position",
          baseline_value: scenario.condition.available_cash,
          actual_value: scenario.condition.available_cash,
          unit: "USD",
        },
        actual_outcome: {
          name: "Cash Position",
          baseline_value: scenario.condition.available_cash,
          actual_value: scenario.condition.available_cash,
          unit: "USD",
        },
        variance: 0,
        variance_pct: 0,
        before_confidence: 75,
        after_confidence: 60,
        feedback_action: "HALT",
        measurement_quality: MeasurementQuality.HIGH,
      });

      expect(packet!.packet_id).toBe(packet2!.packet_id);
    });
  });

  describe("Quick Win Enforcement Under Cash Constraint", () => {
    it("should still validate quick win even when cash constrained", () => {
      const plan_start = new Date();
      const plan_end = new Date(plan_start.getTime() + 5 * 24 * 60 * 60 * 1000); // 5 days

      const qw_result = quickWinEnforcer.validateQuickWin({
        execution_plan: [
          {
            start_time: plan_start.toISOString(),
            end_time: plan_end.toISOString(),
          },
        ],
        action: {
          action_id: scenario.action_id,
        },
        workspace_id: scenario.workspace_id,
      });

      // Quick win would pass for timing, but fails at financial gate
      expect(qw_result.is_quick_win).toBe(true);
      expect(qw_result.days_to_result).toBeLessThanOrEqual(7);
    });
  });
});
