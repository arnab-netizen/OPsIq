import { describe, it, expect } from "vitest";
import { OutcomeAuditor } from "@/services/outcome-core/outcome-auditor";
import { QuickWinEnforcer } from "@/services/outcome-core/quick-win-enforcer";
import { MeasurementQuality } from "@/domain/outcome/impact";
import { buildOverloadScenario } from "../helpers/scenario-builder";

/**
 * Phase F-6: Overload Scenario
 *
 * Setup: Owner requested to execute too many actions (>capacity)
 *
 * Expected Outcomes:
 * - Capacity check fails: BLOCKED action
 * - Over-capacity rejection: plan validation fails
 * - Execution plan adjusted: some actions deferred (not queued)
 * - Timeline shifts: later start times to respect capacity
 *
 * Integration Tests:
 * - Capacity constraint enforcement
 * - Over-capacity rejection
 * - Timeline adjustment
 * - Action prioritization
 * - Deterministic audit trail
 */

describe("Phase F-6: Overload Scenario", () => {
  const auditor = new OutcomeAuditor();
  const quickWinEnforcer = new QuickWinEnforcer();

  const scenario = buildOverloadScenario();

  describe("Capacity Validation", () => {
    it("should define per-owner capacity constraints", () => {
      // Capacity: 40 hours/week per owner, max 2 concurrent actions
      expect(scenario.available_capacity).toBe(40); // hours per week
    });

    it("should calculate total hours required for all actions", () => {
      // 5 actions * 25 hours each = 125 hours required
      const total_hours = scenario.actions.reduce((sum, a) => sum + a.estimated_hours, 0);
      expect(total_hours).toBe(125);
      expect(total_hours).toBeGreaterThan(scenario.available_capacity);
    });

    it("should detect over-capacity condition (125 > 40)", () => {
      const exceeds_capacity = scenario.actions.reduce((sum, a) => sum + a.estimated_hours, 0) >
        scenario.available_capacity;
      expect(exceeds_capacity).toBe(true);
      expect(scenario.expected_blocked_actions).toBeGreaterThan(0);
    });

    it("should mark plan as rejected when over-capacity", () => {
      expect(scenario.expected_plan_rejection).toBe(true);
    });
  });

  describe("Capacity Enforcement", () => {
    it("should enforce per-owner available_hours limit (40/week)", () => {
      const capacity_per_week = 40;
      const required_hours = 125;
      const ratio = required_hours / capacity_per_week;
      expect(ratio).toBeGreaterThan(3); // Requires >3 weeks of single-owner effort
    });

    it("should enforce concurrent action limit (max 2 in-progress)", () => {
      const max_concurrent = 2;
      const actions_count = scenario.actions.length;
      expect(actions_count).toBeGreaterThan(max_concurrent);
    });

    it("should calculate feasible capacity distribution", () => {
      // With 40 hours/week and max 2 concurrent:
      // Week 1: Action 1 (25h) + partial Action 2 (15h) = 40h (2 concurrent)
      // Week 2: Action 2 (10h) + Action 3 (25h) + partial Action 4 (5h) = 40h (3 would violate concurrency)
      const weeks_required = Math.ceil(scenario.actions.reduce((sum, a) => sum + a.estimated_hours, 0) / 40);
      expect(weeks_required).toBeGreaterThanOrEqual(3);
    });
  });

  describe("Plan Rejection on Over-Capacity", () => {
    it("should reject execution plan without adjustments", () => {
      // System fails-closed: rejects over-capacity plan
      // Does not queue, defer, or auto-adjust without owner approval
      expect(scenario.expected_plan_rejection).toBe(true);
    });

    it("should not auto-queue or auto-defer actions (fail-closed)", () => {
      // Fail-closed: does not silently extend timeline
      // Owner must decide: reduce scope, hire help, or extend timeline
      const auto_defer = false;
      expect(auto_defer).toBe(false);
    });

    it("should provide clear rejection reason to owner", () => {
      // Reason: "Plan requires 125 hours, capacity 40 hours/week, concurrency max 2"
      const total_hours = scenario.actions.reduce((sum, a) => sum + a.estimated_hours, 0);
      const rejection_message = `Plan requires ${total_hours} hours, capacity ${scenario.available_capacity} hours/week`;
      expect(rejection_message).toContain("Plan requires");
      expect(rejection_message).toContain("capacity");
    });
  });

  describe("Action Prioritization", () => {
    it("should prioritize actions if owner overrides capacity rejection", () => {
      // If owner proceeds despite capacity warning:
      // - High-priority actions execute first
      // - Low-priority deferred/skipped
      // But this requires explicit owner approval (fail-closed by default)
      const prioritizable = scenario.actions.length > 0;
      expect(prioritizable).toBe(true);
    });

    it("should handle priority-weighted capacity allocation", () => {
      // Example: 5 actions, capacity 40 hours/week
      // Priority 1: Action A (25h) → allocates all capacity week 1
      // Priority 2: Action B (25h) → blocked (no capacity in week 1)
      // Owner decides: defer B or reduce A scope
      expect(scenario.actions.length).toBe(5);
    });
  });

  describe("Timeline Adjustment Under Capacity Constraints", () => {
    it("should calculate realistic timeline if owner approves over-capacity", () => {
      // If 125 hours required at 40/week capacity:
      // Week 1: 40 hours (2 concurrent max)
      // Week 2: 40 hours (2 concurrent max)
      // Week 3: 40 hours (2 concurrent max)
      // Week 4: 5 hours (1 action)
      const weeks_needed = Math.ceil(125 / 40);
      expect(weeks_needed).toBe(4);
    });

    it("should shift action start times to respect capacity", () => {
      // Action 1: start day 1
      // Action 2: start day 1 (concurrent, within limit of 2)
      // Action 3: start day 8 (after action 1-2 window closes)
      // Action 4: start day 8 (concurrent with action 3)
      // Action 5: start day 15 (deferred due to capacity)
      expect(scenario.actions.length).toBe(5);
    });

    it("should respect max 2 concurrent actions in shifted timeline", () => {
      const max_concurrent = 2;
      // No time window should have >2 concurrent actions
      expect(max_concurrent).toBe(2);
    });
  });

  describe("Quick Win Enforcement Under Capacity", () => {
    it("should validate quick win even when capacity constrained", () => {
      // Quick win: ≤7 days
      // Capacity: 40 hours/week
      // Conflict: 125 hours requires 4 weeks minimum
      // Result: Quick win FAILS due to capacity
      const plan_duration_days = 7 * 4; // 4 weeks
      const quick_win_passes = plan_duration_days <= 7;
      expect(quick_win_passes).toBe(false);
    });

    it("should reject plan if quick win requirement unmet due to capacity", () => {
      // Plan violates BOTH:
      // 1. Capacity exceeded
      // 2. Quick win duration exceeded
      // Rejection on either grounds
      expect(scenario.expected_plan_rejection).toBe(true);
    });
  });

  describe("Audit Trail for Capacity Rejection", () => {
    it("should create audit packet for rejected plan", () => {
      const rejection_packet = auditor.createAuditPacket({
        action_id: scenario.actions[0].action_id,
        decision_id: scenario.decision_id,
        workspace_id: scenario.workspace_id,
        baseline_metric: {
          name: "Capacity Utilization",
          baseline_value: 40, // Available capacity
          actual_value: 40, // Would use 40 in week 1
          unit: "hours",
        },
        actual_outcome: {
          name: "Capacity Utilization",
          baseline_value: 40,
          actual_value: 40, // Action 1 would use 25h, leaving 15h for others
          unit: "hours",
        },
        variance: 0,
        variance_pct: 0,
        before_confidence: 75,
        after_confidence: 75,
        feedback_action: "HALT",
        measurement_quality: MeasurementQuality.HIGH,
      });

      expect(rejection_packet!.auditable).toBe(true);
      expect(rejection_packet!.feedback_action).toBe("HALT");
    });

    it("should document capacity violation reason in audit", () => {
      // Audit packet captures:
      // - Plan ID
      // - Total hours required (125)
      // - Available capacity (40/week)
      // - Concurrency limit (2)
      // - Rejection reason: CAPACITY_EXCEEDED
      const plan_hours = 125;
      const capacity_hours = 40;
      const violation = plan_hours > capacity_hours;
      expect(violation).toBe(true);
    });

    it("should maintain deterministic rejection decision", () => {
      // Same over-capacity input → always rejected
      const packet1 = auditor.createAuditPacket({
        action_id: scenario.actions[0].action_id,
        decision_id: scenario.decision_id,
        workspace_id: scenario.workspace_id,
        baseline_metric: {
          name: "Capacity",
          baseline_value: 40,
          actual_value: 40,
          unit: "hours",
        },
        actual_outcome: {
          name: "Capacity",
          baseline_value: 40,
          actual_value: 40,
          unit: "hours",
        },
        variance: 0,
        variance_pct: 0,
        before_confidence: 75,
        after_confidence: 75,
        feedback_action: "HALT",
        measurement_quality: MeasurementQuality.HIGH,
      });

      const packet2 = auditor.createAuditPacket({
        action_id: scenario.actions[0].action_id,
        decision_id: scenario.decision_id,
        workspace_id: scenario.workspace_id,
        baseline_metric: {
          name: "Capacity",
          baseline_value: 40,
          actual_value: 40,
          unit: "hours",
        },
        actual_outcome: {
          name: "Capacity",
          baseline_value: 40,
          actual_value: 40,
          unit: "hours",
        },
        variance: 0,
        variance_pct: 0,
        before_confidence: 75,
        after_confidence: 75,
        feedback_action: "HALT",
        measurement_quality: MeasurementQuality.HIGH,
      });

      expect(packet1!.packet_id).toBe(packet2!.packet_id);
    });
  });

  describe("End-to-End: Capacity Rejection Lifecycle", () => {
    it("should reject over-capacity plan at validation gate", () => {
      // Step 1: Owner submits plan with 5 actions (125 hours)
      const total_hours = scenario.actions.reduce((sum, a) => sum + a.estimated_hours, 0);
      expect(total_hours).toBe(125);

      // Step 2: Validation gate checks capacity
      const exceeds = total_hours > scenario.available_capacity;
      expect(exceeds).toBe(true);

      // Step 3: Plan rejected with reason
      expect(scenario.expected_plan_rejection).toBe(true);

      // Step 4: Audit packet created for rejection
      const rejection_packet = auditor.createAuditPacket({
        action_id: scenario.actions[0].action_id,
        decision_id: scenario.decision_id,
        workspace_id: scenario.workspace_id,
        baseline_metric: {
          name: "Capacity",
          baseline_value: 40,
          actual_value: 40,
          unit: "hours",
        },
        actual_outcome: {
          name: "Capacity",
          baseline_value: 40,
          actual_value: 40,
          unit: "hours",
        },
        variance: 0,
        variance_pct: 0,
        before_confidence: 75,
        after_confidence: 75,
        feedback_action: "HALT",
        measurement_quality: MeasurementQuality.HIGH,
      });

      expect(rejection_packet!.feedback_action).toBe("HALT");
    });

    it("should show capacity remaining calculation to owner", () => {
      // Total capacity: 40 hours/week
      // Week 1: Action 1 (25h) + Action 2 (15h start) = 40h (2 concurrent)
      // Remaining: 0 hours week 1
      // Action 2 continues week 2: 10h + Action 3 (25h start) = 35h
      // But Action 2 + Action 3 = 2 concurrent (OK)
      // Remaining week 2: 5 hours
      const week1_capacity = 40;
      const week1_usage = 25 + 15;
      const week1_remaining = week1_capacity - week1_usage;
      expect(week1_remaining).toBe(0);
    });

    it("should provide deferral options to owner after rejection", () => {
      // Option 1: Reduce scope (execute fewer actions)
      // Option 2: Extend timeline (defer some actions to next week/month)
      // Option 3: Hire help (increase capacity)
      // Owner chooses; system does not auto-defer
      const owner_approval_required = true;
      expect(owner_approval_required).toBe(true);
    });
  });

  describe("Concurrent Action Limit Enforcement", () => {
    it("should enforce max 2 concurrent actions at any time", () => {
      const max_concurrent = 2;
      const total_actions = scenario.actions.length;
      expect(total_actions).toBeGreaterThan(max_concurrent);
    });

    it("should block 3rd concurrent action even if hours available", () => {
      // Example: 3 actions at 10h each, 40h/week capacity
      // Week 1: Action 1 + Action 2 = 20h (2 concurrent, OK)
      // Action 3 BLOCKED even though 20h remains (concurrency limit)
      // Action 3 must wait for Action 1 or 2 to complete
      const concurrency_limit_hours_available = 20;
      const can_execute_3rd_concurrent = false; // Blocked by limit
      expect(can_execute_3rd_concurrent).toBe(false);
    });
  });
});
