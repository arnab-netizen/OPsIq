export interface Action {
  action_id: string;
  estimated_effort_hours: number;
  title: string;
}

export interface ExecutionPlanStep {
  action_id: string;
  start_time: string; // ISO date
  end_time: string; // ISO date
  friction_delay_days: number;
  capacity_hours_allocated: number;
}

export interface QuickWinValidationInput {
  execution_plan: ExecutionPlanStep[];
  action: Action;
  workspace_id: string;
}

export interface QuickWinValidationResult {
  is_quick_win: boolean;
  days_to_result: number;
  reason_if_blocked: string;
  max_days_allowed: number;
}

export const QUICK_WIN_MAX_DAYS = 7;
