export interface ExecutionScheduleStep {
  action_id: string;
  execution_order: number; // 1-indexed
  start_time: string; // ISO
  end_time: string; // ISO
  effort_hours: number;
  friction_delay_days: number;
  capacity_hours_allocated: number;
  owner: string;
  parallelizable: boolean; // can run simultaneously with other actions
}

export interface ExecutionSchedule {
  decision_id: string;
  workspace_id: string;
  steps: ExecutionScheduleStep[];
  total_duration_days: number;
  total_effort_hours: number;
  is_valid: boolean;
  conflict_detected: boolean;
  conflicts: Array<{
    action_id_1: string;
    action_id_2: string;
    reason: string;
  }>;
}

export interface SequencerInput {
  decision_id: string;
  workspace_id: string;
  execution_order: string[]; // from dependency graph
  action_details: Record<
    string,
    {
      effort_hours: number;
      dependency_count: number;
      owner: string;
    }
  >;
  start_date: string; // ISO date
  owner_available_hours_per_day: Record<string, number>; // owner -> hours/day
}

export const FRICTION_DELAY_DAYS_BY_DEPENDENCY_COUNT = {
  0: 0,
  1: 5,
  2: 5,
  3: 10,
  4: 10,
  5: 10,
  6: 20,
};

export function calculateFrictionDelay(dependency_count: number): number {
  if (dependency_count <= 0) return 0;
  if (dependency_count <= 2) return 5;
  if (dependency_count <= 5) return 10;
  return 20;
}
