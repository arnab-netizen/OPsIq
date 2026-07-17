import { ExecutionSchedule } from "./sequencer";
import { CapacityCheckResult } from "./capacity";
import { ExecutionJob } from "./job";

export interface ExecutionPlanValidation {
  is_valid: boolean;
  deterministic: boolean;
  capacity_ok: boolean;
  idempotency_ok: boolean;
  failures_contained: boolean;
  rollback_validated: boolean;
  audit_trail_ok: boolean;
  friction_delays_ok: boolean;
  no_cycles: boolean;
  required_fields_ok: boolean;
  retry_policy_ok: boolean;
  validation_errors: string[];
  validation_warnings: string[];
}

export interface OrchestrationInput {
  decision_id: string;
  workspace_id: string;
  actions: Array<{
    action_id: string;
    owner_id: string;
    effort_hours: number;
    depends_on: string[];
    success_metric: string;
    failure_condition: string;
    rollback_plan: string;
  }>;
  owner_capacities: Record<string, number>; // owner_id -> available_hours
}

export interface ExecutionPlan {
  plan_id: string;
  decision_id: string;
  workspace_id: string;
  is_valid: boolean;
  validation: ExecutionPlanValidation;
  execution_order: string[];
  total_duration_days: number;
  total_effort_hours: number;
  capacity_check: CapacityCheckResult;
  schedule: ExecutionSchedule;
  created_at: Date;
}

export interface ExecutionContext {
  decision_id: string;
  workspace_id: string;
  execution_plan: ExecutionPlan;
  current_action_index: number;
  executed_jobs: Map<string, ExecutionJob>;
  failed_actions: string[];
}
