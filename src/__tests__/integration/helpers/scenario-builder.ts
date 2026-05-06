import { v4 as uuidv4 } from "uuid";
import { FeedbackAction } from "@/domain/outcome/feedback";
import { MeasurementQuality } from "@/domain/outcome/impact";

/**
 * Test helpers for building realistic business scenarios
 * Simulates hostile conditions: failures, degradation, capacity constraints
 */

export interface TestBusinessCondition {
  baseline_revenue: number;
  baseline_profit_margin: number;
  available_cash: number;
  available_hours_per_week: number;
  owner_confidence: number;
}

export interface TestAction {
  action_id: string;
  estimated_hours: number;
  estimated_cost: number;
  dependencies: string[];
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  failure_mode?: "NONE" | "TIMEOUT" | "FATAL" | "RETRYABLE";
}

export interface TestOutcomeData {
  baseline_value: number;
  actual_value: number;
  measurement_quality: MeasurementQuality;
  outcome_evidence_type: "MEASURED" | "PROJECTED" | "PARTIAL";
}

/**
 * Build a business condition with defaults
 */
export function buildBusinessCondition(
  overrides?: Partial<TestBusinessCondition>
): TestBusinessCondition {
  const defaults: TestBusinessCondition = {
    baseline_revenue: 100,
    baseline_profit_margin: 20,
    available_cash: 50,
    available_hours_per_week: 40,
    owner_confidence: 75,
  };
  return { ...defaults, ...overrides };
}

/**
 * Build an action with defaults
 */
export function buildAction(
  overrides?: Partial<TestAction>
): TestAction {
  const defaults: TestAction = {
    action_id: uuidv4(),
    estimated_hours: 20,
    estimated_cost: 10,
    dependencies: [],
    status: "PENDING",
    failure_mode: "NONE",
  };
  return { ...defaults, ...overrides };
}

/**
 * Build outcome data with defaults
 */
export function buildOutcomeData(
  overrides?: Partial<TestOutcomeData>
): TestOutcomeData {
  const defaults: TestOutcomeData = {
    baseline_value: 100,
    actual_value: 100,
    measurement_quality: MeasurementQuality.HIGH,
    outcome_evidence_type: "MEASURED",
  };
  return { ...defaults, ...overrides };
}

/**
 * Scenario 1: Revenue Collapse (40% drop)
 */
export function buildRevenueCollapseScenario() {
  const workspace_id = uuidv4();
  const action_id = uuidv4();
  const decision_id = uuidv4();

  const condition = buildBusinessCondition({
    baseline_revenue: 100,
    baseline_profit_margin: 20,
    available_cash: 50,
  });

  const action = buildAction({
    action_id,
    estimated_hours: 30,
    estimated_cost: 15,
  });

  const outcome = buildOutcomeData({
    baseline_value: condition.baseline_revenue,
    actual_value: 60, // 40% drop
    measurement_quality: MeasurementQuality.HIGH,
  });

  return {
    workspace_id,
    decision_id,
    action_id,
    condition,
    action,
    outcome,
    expected_variance: -40,
    expected_variance_pct: -40,
    expected_replan: true,
    expected_rollback_offered: true,
  };
}

/**
 * Scenario 2: Low Cash (runway <3 months)
 */
export function buildLowCashScenario() {
  const workspace_id = uuidv4();
  const action_id = uuidv4();
  const decision_id = uuidv4();

  const condition = buildBusinessCondition({
    baseline_revenue: 100,
    available_cash: 5, // Only $5 available
    available_hours_per_week: 40,
  });

  const action = buildAction({
    action_id,
    estimated_hours: 20,
    estimated_cost: 30, // Cost exceeds available cash
    failure_mode: "FATAL",
  });

  return {
    workspace_id,
    decision_id,
    action_id,
    condition,
    action,
    expected_failure: "FATAL",
    expected_reason: "Insufficient cash to execute action",
    expected_halt: true,
  };
}

/**
 * Scenario 3: Wrong Initial Diagnosis
 */
export function buildWrongDiagnosisScenario() {
  const workspace_id = uuidv4();
  const action_id_1 = uuidv4();
  const action_id_2 = uuidv4();
  const decision_id = uuidv4();

  const condition = buildBusinessCondition({
    baseline_revenue: 100,
    owner_confidence: 75, // High initial confidence
  });

  const action1 = buildAction({
    action_id: action_id_1,
    estimated_hours: 20,
    estimated_cost: 10,
    status: "COMPLETED",
  });

  const action2 = buildAction({
    action_id: action_id_2,
    estimated_hours: 30,
    estimated_cost: 15,
    dependencies: [action_id_1],
    status: "RUNNING",
  });

  // First outcome: no improvement
  const outcome1 = buildOutcomeData({
    baseline_value: 100,
    actual_value: 100, // No improvement despite execution
    measurement_quality: MeasurementQuality.HIGH,
  });

  // Second outcome: negative variance
  const outcome2 = buildOutcomeData({
    baseline_value: 100,
    actual_value: 95, // Slight decline
    measurement_quality: MeasurementQuality.HIGH,
  });

  return {
    workspace_id,
    decision_id,
    actions: [action1, action2],
    outcomes: [outcome1, outcome2],
    expected_confidence_drift: -30, // Negative outcomes reduce confidence
    expected_replan: true,
    expected_halt_on_repeat: true, // Repeated failures with low confidence
  };
}

/**
 * Scenario 4: Execution Failure (50% of actions fail)
 */
export function buildExecutionFailureScenario() {
  const workspace_id = uuidv4();
  const decision_id = uuidv4();

  const actions = [
    buildAction({ action_id: uuidv4(), failure_mode: "NONE" }), // Success
    buildAction({ action_id: uuidv4(), failure_mode: "RETRYABLE" }), // Retryable
    buildAction({ action_id: uuidv4(), failure_mode: "NONE" }), // Success
    buildAction({ action_id: uuidv4(), failure_mode: "FATAL" }), // Fatal
  ];

  // Set dependencies to test cascading
  actions[2].dependencies = [actions[1].action_id];
  actions[3].dependencies = [actions[0].action_id];

  return {
    workspace_id,
    decision_id,
    actions,
    expected_success_count: 2,
    expected_retry_attempts: 1,
    expected_cascading_failures: 1,
    expected_partial_variance: true,
  };
}

/**
 * Scenario 5: Vendor Failure (critical service unavailable)
 */
export function buildVendorFailureScenario() {
  const workspace_id = uuidv4();
  const decision_id = uuidv4();
  const action_id = uuidv4();

  const condition = buildBusinessCondition();

  const action = buildAction({
    action_id,
    estimated_hours: 20,
    estimated_cost: 10,
    failure_mode: "TIMEOUT", // Vendor timeout
  });

  return {
    workspace_id,
    decision_id,
    action_id,
    condition,
    action,
    expected_failure_type: "RECOVERABLE",
    expected_retry_count: 4, // Exponential backoff: 1s, 2s, 4s, 8s
    expected_escalation: true,
  };
}

/**
 * Scenario 6: Overload (capacity exceeded)
 */
export function buildOverloadScenario() {
  const workspace_id = uuidv4();
  const decision_id = uuidv4();
  const owner_id = uuidv4();

  // Create 5 actions, each requiring 25 hours, but only 40 available
  const actions = Array.from({ length: 5 }, () =>
    buildAction({
      action_id: uuidv4(),
      estimated_hours: 25, // 5 * 25 = 125 > 40 available
      estimated_cost: 5,
    })
  );

  return {
    workspace_id,
    decision_id,
    owner_id,
    actions,
    available_capacity: 40,
    expected_blocked_actions: 1, // Last action exceeds capacity
    expected_plan_rejection: true,
  };
}

/**
 * Scenario 7: Contradictory KPI (metric improves but profit drops)
 */
export function buildContradictoryKPIScenario() {
  const workspace_id = uuidv4();
  const decision_id = uuidv4();
  const action_id = uuidv4();

  const condition = buildBusinessCondition({
    baseline_revenue: 100,
    baseline_profit_margin: 20,
  });

  const action = buildAction({
    action_id,
    estimated_hours: 20,
    estimated_cost: 15, // High cost
  });

  // Revenue improves by 10%
  const revenueOutcome = buildOutcomeData({
    baseline_value: 100,
    actual_value: 110,
    measurement_quality: MeasurementQuality.HIGH,
  });

  // But profit drops due to high cost
  // Profit = Revenue * Margin - Cost
  // Before: 100 * 0.2 - 0 = 20
  // After: 110 * 0.15 - 15 = 16.5 - 15 = 1.5 (net negative)
  const profitOutcome = buildOutcomeData({
    baseline_value: 20,
    actual_value: 1.5,
    measurement_quality: MeasurementQuality.MEDIUM,
  });

  return {
    workspace_id,
    decision_id,
    action_id,
    condition,
    action,
    outcomes: {
      revenue: revenueOutcome,
      profit: profitOutcome,
    },
    expected_net_variance: -92.5, // Profit dropped 92.5%
    expected_replan: true,
    expected_confidence_update: "NEUTRAL_OR_NEGATIVE",
  };
}

/**
 * Scenario 8: Delayed ROI (results slow to materialize)
 */
export function buildDelayedROIScenario() {
  const workspace_id = uuidv4();
  const decision_id = uuidv4();
  const action_id = uuidv4();

  const action = buildAction({
    action_id,
    estimated_hours: 40,
    estimated_cost: 20,
  });

  // Plan exceeds 7 days (quick win threshold)
  const executionPlan = [
    {
      start_time: new Date().toISOString(),
      end_time: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];

  return {
    workspace_id,
    decision_id,
    action_id,
    action,
    executionPlan,
    expected_quick_win_validation: false,
    expected_rejection_reason: "Plan exceeds 7-day quick win limit",
    expected_plan_adjustment: "Break into 7-day increments",
  };
}

/**
 * Scenario 9: Competitor Response (market shifts after decision)
 */
export function buildCompetitorResponseScenario() {
  const workspace_id = uuidv4();
  const decision_id = uuidv4();
  const action_id = uuidv4();

  const condition = buildBusinessCondition({
    baseline_revenue: 100,
  });

  const action = buildAction({
    action_id,
    estimated_hours: 30,
    estimated_cost: 20,
  });

  // Original baseline before competitor enters
  const originalBaseline = 100;
  // New baseline after competitor response
  const newBaseline = 85; // Market shrinks

  // Actual outcome with new baseline
  const outcome = buildOutcomeData({
    baseline_value: newBaseline,
    actual_value: 90,
    measurement_quality: MeasurementQuality.MEDIUM,
  });

  return {
    workspace_id,
    decision_id,
    action_id,
    condition,
    action,
    baseline_shift: {
      original: originalBaseline,
      after_competitor: newBaseline,
    },
    outcome,
    expected_variance_vs_original: -10,
    expected_variance_vs_new_baseline: 5.9,
    expected_confidence_drop: -20,
    expected_replan_consideration: true,
  };
}

/**
 * Scenario 10: Partial Recovery (50% of damage recovered)
 */
export function buildPartialRecoveryScenario() {
  const workspace_id = uuidv4();
  const decision_id = uuidv4();
  const action_id = uuidv4();

  const condition = buildBusinessCondition({
    baseline_revenue: 100,
  });

  const action = buildAction({
    action_id,
    estimated_hours: 40,
    estimated_cost: 30,
  });

  // Crisis: revenue collapsed to 60
  const crisisOutcome = buildOutcomeData({
    baseline_value: 100,
    actual_value: 60, // 40% drop
    measurement_quality: MeasurementQuality.HIGH,
  });

  // Recovery: action brings revenue from 60 to 80
  const recoveryOutcome = buildOutcomeData({
    baseline_value: 60, // New baseline after crisis
    actual_value: 80,
    measurement_quality: MeasurementQuality.HIGH,
  });

  return {
    workspace_id,
    decision_id,
    action_id,
    condition,
    action,
    outcomes: {
      crisis: crisisOutcome,
      recovery: recoveryOutcome,
    },
    expected_recovery_variance: 33.3, // (80-60)/60 * 100
    expected_variance_vs_original: -20, // Still down 20% from original 100
    expected_confidence_update: "POSITIVE",
    expected_trajectory: "RECOVERING",
    expected_recommendation: "CONTINUE_WITH_CAUTION",
  };
}
