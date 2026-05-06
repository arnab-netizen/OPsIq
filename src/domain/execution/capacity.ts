export interface CapacityAllocation {
  owner: string;
  action_id: string;
  effort_hours: number;
}

export interface OwnerCapacity {
  owner: string;
  available_hours_per_week: number;
  available_hours_per_day: number;
  current_allocations: CapacityAllocation[];
}

export interface CapacityCheckResult {
  owner: string;
  available_hours: number;
  allocated_hours: number;
  remaining_hours: number;
  can_execute: boolean;
  reason_if_blocked?: string;
}

export interface CapacityCheckInput {
  owner: string;
  effort_hours: number;
  available_hours_per_week?: number;
  available_hours_per_day?: number;
  current_allocations?: CapacityAllocation[];
}

export interface ConcurrencyLimit {
  owner: string;
  max_concurrent_actions: number; // typically 2-3
  current_in_progress: number;
}

export interface ConcurrencyCheckResult {
  owner: string;
  max_concurrent: number;
  current_in_progress: number;
  can_start: boolean;
  reason_if_blocked?: string;
}

export const DEFAULT_HOURS_PER_WEEK = 40;
export const DEFAULT_HOURS_PER_DAY = 8;
export const DEFAULT_MAX_CONCURRENT_ACTIONS = 2;
