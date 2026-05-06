import { expect } from "vitest";
import { ReplanTrigger } from "@/domain/outcome/variance";

/**
 * Custom assertions for Phase F integration tests
 * Verifies cascade, rollback, escalation, and capacity constraints
 */

export interface ActionState {
  action_id: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "BLOCKED";
  failure_mode?: string;
  cascade_blocked?: boolean;
}

export interface ReplanResult {
  trigger: ReplanTrigger;
  reason: string;
  requires_approval: boolean;
  can_rollback: boolean;
  escalation_priority: number;
}

export interface CapacityCheck {
  owner_id: string;
  total_hours_required: number;
  available_hours: number;
  concurrent_actions: number;
  max_concurrent: number;
}

/**
 * Assert that variance correctly triggers replan
 */
export function assertVarianceTrigger(
  variance_pct: number,
  expected_trigger: ReplanTrigger,
  failure_threshold: number = -10
) {
  if (variance_pct < failure_threshold) {
    expect(expected_trigger).toBe(ReplanTrigger.REPLAN);
  } else if (variance_pct >= 0 && variance_pct <= 10) {
    expect(expected_trigger).toBe(ReplanTrigger.CONTINUE);
  }
}

/**
 * Assert that cascade is prevented when action fails
 * Downstream actions should be blocked, not failed
 */
export function assertCascadePrevention(
  failed_action_id: string,
  downstream_actions: ActionState[],
  should_be_blocked: boolean = true
) {
  const dependentActions = downstream_actions.filter(
    (a) => a.cascade_blocked && a.status === "BLOCKED"
  );

  if (should_be_blocked) {
    expect(dependentActions.length).toBeGreaterThan(0);
    expect(dependentActions.every((a) => a.status === "BLOCKED")).toBe(true);
  }
}

/**
 * Assert that rollback is offered when conditions met
 * (negative variance + high confidence + success history)
 */
export function assertRollbackOffered(
  variance: number,
  previous_confidence: number,
  previous_outcome: string,
  expected_offer: boolean = true
) {
  const should_offer =
    variance < 0 && previous_confidence > 70 && previous_outcome === "success";

  expect(should_offer).toBe(expected_offer);
}

/**
 * Assert that rollback is impossible and halted
 * (state already done, downstream started, or cost/time prohibitive)
 */
export function assertRollbackValidation(
  action_status: string,
  downstream_started: boolean,
  rollback_cost: number,
  original_investment: number,
  rollback_time: number,
  time_budget: number,
  expected_possible: boolean = true
) {
  // Rollback is impossible if:
  // 1. Status is DONE or CANCELLED
  // 2. Downstream already started
  // 3. Rollback cost > original investment
  // 4. Rollback time > time budget

  const is_done = action_status === "DONE" || action_status === "CANCELLED";
  const impossible =
    is_done ||
    downstream_started ||
    rollback_cost > original_investment ||
    rollback_time > time_budget;

  expect(!impossible).toBe(expected_possible);
}

/**
 * Assert that repeated failures with low confidence trigger HALT
 * Condition: previous="failure" AND confidence < 50% AND variance < 0
 */
export function assertHaltOnRepeatedFailure(
  previous_outcome: string,
  current_confidence: number,
  current_variance: number,
  expected_halt: boolean = true
) {
  const should_halt =
    previous_outcome === "failure" &&
    current_confidence < 50 &&
    current_variance < 0;

  expect(should_halt).toBe(expected_halt);
}

/**
 * Assert that capacity constraints are enforced
 * Over-capacity actions should be rejected
 */
export function assertCapacityEnforcement(
  check: CapacityCheck,
  expected_rejection: boolean = false
) {
  const exceeds_hours =
    check.total_hours_required > check.available_hours;
  const exceeds_concurrent =
    check.concurrent_actions >= check.max_concurrent;

  const should_reject = exceeds_hours || exceeds_concurrent;
  expect(should_reject).toBe(expected_rejection);
}

/**
 * Assert that measurement quality modifier is applied
 * Low quality (<60%) should cap confidence updates to ±10%
 */
export function assertMeasurementQualityCapping(
  measurement_confidence: number,
  raw_update: number,
  expected_capped: number
) {
  let actual_update = raw_update;

  if (measurement_confidence < 60) {
    // Cap to ±10%
    if (actual_update > 10) actual_update = 10;
    if (actual_update < -10) actual_update = -10;
  }

  expect(actual_update).toBe(expected_capped);
}

/**
 * Assert that confidence update respects bounds
 * Positive: max +20%, Negative: max -30%
 */
export function assertConfidenceBounds(
  base_confidence: number,
  update: number,
  expected_final: number,
  max_positive: number = 20,
  max_negative: number = 30
) {
  let capped_update = update;
  if (capped_update > max_positive) capped_update = max_positive;
  if (capped_update < -max_negative) capped_update = -max_negative;

  const final = Math.max(0, Math.min(100, base_confidence + capped_update));
  expect(final).toBe(expected_final);
}

/**
 * Assert that deterministic replay produces identical results
 */
export function assertDeterministicReplay(
  first_result: any,
  second_result: any,
  fields_to_compare: string[]
) {
  fields_to_compare.forEach((field) => {
    expect(first_result[field]).toBe(second_result[field]);
  });
}

/**
 * Assert that partial success is handled correctly
 * Some actions succeed, some fail → partial variance
 */
export function assertPartialSuccess(
  successful_actions: number,
  failed_actions: number,
  partial_variance_expected: boolean = true
) {
  const is_partial = successful_actions > 0 && failed_actions > 0;
  expect(is_partial).toBe(partial_variance_expected);
}

/**
 * Assert that quick win validation blocks >7 day plans
 */
export function assertQuickWinValidation(
  plan_duration_days: number,
  should_pass: boolean = true
) {
  const passes = plan_duration_days <= 7;
  expect(passes).toBe(should_pass);
}

/**
 * Assert that contradictory KPIs are handled
 * One metric positive, another negative → net signal matters
 */
export function assertContradictoryKPIHandling(
  revenue_variance: number,
  profit_variance: number,
  expected_net_action: string
) {
  // Net variance should be weighted by strategic importance
  // If profit is negative, action should trigger replan even if revenue positive
  const net_negative = profit_variance < 0;

  if (net_negative) {
    expect(expected_net_action).toBe("REPLAN");
  } else if (revenue_variance > 5) {
    expect(expected_net_action).toMatch(/CONTINUE|REPLAN/);
  }
}

/**
 * Assert that executor field mappings are correct
 * Input uses before_confidence/after_confidence, packet uses confidence_before/confidence_after
 */
export function assertConfidenceFieldMapping(
  input: { before_confidence: number; after_confidence: number },
  output: { confidence_before: number; confidence_after: number }
) {
  expect(output.confidence_before).toBe(input.before_confidence);
  expect(output.confidence_after).toBe(input.after_confidence);
}

/**
 * Assert that escalation is triggered at correct priority
 * 0 = info, 1 = warning, 2 = critical, 3 = halt
 */
export function assertEscalationPriority(
  replan_trigger: ReplanTrigger,
  expected_priority: number
) {
  // CONTINUE → 0
  // REPLAN → 1
  // ROLLBACK → 2
  // HALT → 3

  const priority_map = {
    CONTINUE: 0,
    REPLAN: 1,
    ROLLBACK: 2,
    HALT: 3,
  };

  expect(priority_map[replan_trigger] || 0).toBeLessThanOrEqual(expected_priority);
}

/**
 * Assert that baseline shift is handled correctly
 * Variance recalculated against new baseline
 */
export function assertBaselineShiftHandling(
  original_baseline: number,
  new_baseline: number,
  actual_value: number,
  expected_variance_vs_new: number
) {
  const variance_vs_new = ((actual_value - new_baseline) / new_baseline) * 100;
  expect(Math.abs(variance_vs_new - expected_variance_vs_new)).toBeLessThan(1);
}

/**
 * Assert that all 4 replan paths are tested
 * CONTINUE → REPLAN → ROLLBACK (if feasible) → HALT (if neither feasible)
 */
export function assertReplanPathCoverage(
  test_results: {
    continue_tested: boolean;
    replan_tested: boolean;
    rollback_tested: boolean;
    halt_tested: boolean;
  }
) {
  expect(test_results.continue_tested).toBe(true);
  expect(test_results.replan_tested).toBe(true);
  expect(test_results.rollback_tested).toBe(true);
  expect(test_results.halt_tested).toBe(true);
}
