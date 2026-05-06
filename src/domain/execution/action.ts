export enum ActionState {
  DRAFT = "DRAFT",
  READY = "READY",
  IN_PROGRESS = "IN_PROGRESS",
  DONE = "DONE",
  BLOCKED = "BLOCKED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

export interface RollbackPlan {
  steps: string[];
  estimated_cost: number;
  estimated_time_days: number;
}

export interface Action {
  action_id: string;
  decision_id: string;
  workspace_id: string;
  owner: string;
  title: string;
  due_date?: string;
  success_metric?: string;
  failure_condition?: string;
  rollback_plan?: RollbackPlan;
  start_time?: string;
  end_time?: string;
  job_id?: string;
  result?: Record<string, unknown>;
  failure_reason?: string;
  failure_classification?: string;
  blocked_reason?: string;
  blocking_dependency_id?: string;
  state: ActionState;
  state_history: ActionStateChange[];
  created_at: string;
  updated_at: string;
}

export interface ActionStateChange {
  from_state: ActionState;
  to_state: ActionState;
  state_reason: string;
  timestamp: string;
  actor: string;
}

export interface ActionTransition {
  from_state: ActionState;
  to_state: ActionState;
  is_valid: boolean;
  required_fields: string[];
  reason?: string;
}

export const VALID_TRANSITIONS: Record<ActionState, ActionState[]> = {
  [ActionState.DRAFT]: [ActionState.READY, ActionState.CANCELLED],
  [ActionState.READY]: [ActionState.IN_PROGRESS, ActionState.BLOCKED, ActionState.CANCELLED],
  [ActionState.IN_PROGRESS]: [ActionState.DONE, ActionState.FAILED],
  [ActionState.DONE]: [],
  [ActionState.BLOCKED]: [ActionState.READY, ActionState.CANCELLED],
  [ActionState.FAILED]: [ActionState.BLOCKED],
  [ActionState.CANCELLED]: [],
};

export const REQUIRED_FIELDS_BY_STATE: Record<ActionState, string[]> = {
  [ActionState.DRAFT]: ["action_id", "owner", "title"],
  [ActionState.READY]: ["action_id", "owner", "title", "due_date", "success_metric", "failure_condition", "rollback_plan"],
  [ActionState.IN_PROGRESS]: ["action_id", "owner", "title", "due_date", "success_metric", "failure_condition", "rollback_plan", "start_time", "job_id"],
  [ActionState.DONE]: ["action_id", "owner", "title", "due_date", "success_metric", "failure_condition", "rollback_plan", "start_time", "job_id", "end_time", "result"],
  [ActionState.BLOCKED]: ["action_id", "owner", "title", "blocked_reason", "blocking_dependency_id"],
  [ActionState.FAILED]: ["action_id", "owner", "title", "failure_reason", "failure_classification"],
  [ActionState.CANCELLED]: ["action_id", "owner", "title"],
};
