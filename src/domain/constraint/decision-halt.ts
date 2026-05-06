/**
 * Decision Halt Constraints
 * Phase C: Constraint Layer - Engine 14
 *
 * Explicit decision blocking rules with clear, actionable reasons.
 * Fail-closed: blocks by default if data insufficient.
 */

export interface DecisionHaltInput {
  decision_id: string;
  workspace_id: string;
  engagement_id: string;
  owner_id: string;

  // Financial context
  current_cash: number;
  monthly_burn: number;
  decision_capital_required: number;
  expected_impact: number;
  roi_months: number;

  // Capacity context
  owner_available_hours_per_week: number;
  decision_effort_hours: number;
  active_decisions_count: number;
  team_utilization_pct: number;

  // Compliance context
  required_approvals: string[];
  approvals_received: string[];
  policy_violations: string[];

  // Risk context
  execution_probability: number;
  dependency_count: number;
  critical_dependencies: string[];

  // Override context
  override_approved_by?: string;
  override_reason?: string;
}

export interface HaltCondition {
  financial_halt?: {
    reason: "insufficient_cash" | "negative_impact" | "roi_unachievable";
    threshold: number;
    actual: number;
    days_to_insolvency: number;
  };
  capacity_halt?: {
    reason: "owner_overloaded" | "team_exhausted";
    available_hours: number;
    required_hours: number;
    owner_utilization_pct: number;
  };
  compliance_halt?: {
    reason: "missing_approval" | "policy_violation";
    missing_approvals: string[];
    violated_policies: string[];
  };
  risk_halt?: {
    reason: "execution_probability_too_low" | "critical_dependency_risk";
    execution_probability: number;
    dependent_actions: string[];
  };
}

export interface DecisionHaltResult {
  halted: boolean;
  halt_reason?: string;
  halt_conditions: HaltCondition;
  halt_category?: "financial" | "capacity" | "compliance" | "risk";
  overridable: boolean;
  override_required_approvers: string[];
  audit_event: {
    event_type: "decision_halt_check";
    halted: boolean;
    reason_codes: string[];
    timestamp: string;
  };
}
