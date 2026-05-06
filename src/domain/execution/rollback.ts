import { ActionState } from "./action";

export enum RollbackFeasibility {
  SAFE = "SAFE",
  RISKY = "RISKY",
  IMPOSSIBLE = "IMPOSSIBLE",
}

export interface RollbackStep {
  step_id: string;
  description: string;
  estimated_time_minutes?: number;
}

export interface RollbackPlan {
  action_id: string;
  steps: RollbackStep[];
  estimated_cost_dollars: number;
  estimated_time_days: number;
}

export interface RollbackValidationInput {
  action_id: string;
  action_state: ActionState;
  rollback_plan: RollbackPlan;
  original_investment_dollars: number;
  downstream_actions: Array<{ action_id: string; state: ActionState }>;
  owner_declined?: boolean;
}

export interface RollbackValidationResult {
  action_id: string;
  can_rollback: boolean;
  reasons: string[];
  rollback_feasibility: RollbackFeasibility;
  estimated_cost_dollars: number;
  estimated_time_days: number;
  recommendation: string;
  timestamp: Date;
}

export const TERMINAL_STATES = [ActionState.DONE, ActionState.CANCELLED];
export const STARTED_STATES = [ActionState.IN_PROGRESS, ActionState.DONE];
export const UNDOABLE_STATES = [
  ActionState.DRAFT,
  ActionState.READY,
  ActionState.BLOCKED,
  ActionState.FAILED,
];
