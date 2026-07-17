import { logger } from "@/infra/logger";
import {
  CapacityCheckResult,
  CapacityCheckInput,
  ConcurrencyCheckResult,
  OwnerCapacity,
  CapacityAllocation,
  DEFAULT_HOURS_PER_WEEK,
  DEFAULT_MAX_CONCURRENT_ACTIONS,
} from "@/domain/execution/capacity";

export class CapacityController {
  /**
   * Check if action can execute based on owner's available capacity
   */
  checkCapacity(input: CapacityCheckInput): CapacityCheckResult {
    const available_hours_per_week =
      input.available_hours_per_week || DEFAULT_HOURS_PER_WEEK;
    // Calculate currently allocated hours
    const current_allocations = input.current_allocations || [];
    const allocated_hours = current_allocations
      .filter((a) => a.owner === input.owner)
      .reduce((sum, a) => sum + a.effort_hours, 0);

    const available_hours = available_hours_per_week - allocated_hours;
    const remaining_hours = available_hours - input.effort_hours;

    const can_execute = input.effort_hours <= available_hours;

    const result: CapacityCheckResult = {
      owner: input.owner,
      available_hours,
      allocated_hours,
      remaining_hours: Math.max(0, remaining_hours),
      can_execute,
    };

    if (!can_execute) {
      result.reason_if_blocked = `Insufficient capacity: ${input.effort_hours}h required, ${available_hours}h available (${allocated_hours}h already allocated of ${available_hours_per_week}h per week)`;
      logger.warn("Capacity check failed", {
        owner: input.owner,
        effort_hours: input.effort_hours,
        available_hours,
        allocated_hours,
      });
    }

    return result;
  }

  /**
   * Check if owner can start another action based on concurrency limits
   */
  checkConcurrency(
    owner: string,
    current_in_progress: number,
    max_concurrent: number = DEFAULT_MAX_CONCURRENT_ACTIONS
  ): ConcurrencyCheckResult {
    const can_start = current_in_progress < max_concurrent;

    const result: ConcurrencyCheckResult = {
      owner,
      max_concurrent,
      current_in_progress,
      can_start,
    };

    if (!can_start) {
      result.reason_if_blocked = `Concurrency limit reached: ${current_in_progress} actions already in progress (max ${max_concurrent})`;
      logger.warn("Concurrency check failed", {
        owner,
        current_in_progress,
        max_concurrent,
      });
    }

    return result;
  }

  /**
   * Get capacity summary for owner
   */
  getOwnerCapacitySummary(
    owner: string,
    allocations: CapacityAllocation[],
    available_hours_per_week: number = DEFAULT_HOURS_PER_WEEK
  ): OwnerCapacity {
    const owner_allocations = allocations.filter((a) => a.owner === owner);
    return {
      owner,
      available_hours_per_week,
      available_hours_per_day: available_hours_per_week / 5, // 5-day workweek
      current_allocations: owner_allocations,
    };
  }

  /**
   * Allocate capacity for an action
   */
  allocateCapacity(
    owner: string,
    action_id: string,
    effort_hours: number,
    allocations: CapacityAllocation[]
  ): CapacityAllocation[] {
    const allocation: CapacityAllocation = {
      owner,
      action_id,
      effort_hours,
    };

    logger.info("Capacity allocated", {
      owner,
      action_id,
      effort_hours,
    });

    return [...allocations, allocation];
  }

  /**
   * Deallocate capacity (e.g., when action completes or is cancelled)
   */
  deallocateCapacity(
    action_id: string,
    allocations: CapacityAllocation[]
  ): CapacityAllocation[] {
    const filtered = allocations.filter((a) => a.action_id !== action_id);

    logger.info("Capacity deallocated", {
      action_id,
      removed_count: allocations.length - filtered.length,
    });

    return filtered;
  }

  /**
   * Check if all actions in plan fit within capacity constraints
   */
  validateExecutionPlan(
    actions: Array<{
      action_id: string;
      owner: string;
      effort_hours: number;
    }>,
    owner_available_hours: Record<string, number> = {}
  ): {
    is_valid: boolean;
    violations: Array<{ action_id: string; owner: string; reason: string }>;
  } {
    const violations: Array<{ action_id: string; owner: string; reason: string }> = [];
    const owner_allocations: Record<string, number> = {};

    for (const action of actions) {
      const available =
        owner_available_hours[action.owner] || DEFAULT_HOURS_PER_WEEK;
      const current_allocated = owner_allocations[action.owner] || 0;
      const new_total = current_allocated + action.effort_hours;

      if (new_total > available) {
        violations.push({
          action_id: action.action_id,
          owner: action.owner,
          reason: `Capacity exceeded: ${action.effort_hours}h required, only ${available - current_allocated}h available (${current_allocated}h already allocated of ${available}h per week)`,
        });
      }

      owner_allocations[action.owner] = new_total;
    }

    const is_valid = violations.length === 0;

    if (!is_valid) {
      logger.warn("Execution plan capacity validation failed", {
        violations_count: violations.length,
      });
    }

    return {
      is_valid,
      violations,
    };
  }

  /**
   * Calculate utilization percentage for owner
   */
  calculateUtilization(
    owner: string,
    allocations: CapacityAllocation[],
    available_hours_per_week: number = DEFAULT_HOURS_PER_WEEK
  ): number {
    const allocated = allocations
      .filter((a) => a.owner === owner)
      .reduce((sum, a) => sum + a.effort_hours, 0);

    if (available_hours_per_week === 0) return 0;

    const utilization = (allocated / available_hours_per_week) * 100;
    return Math.min(100, utilization); // Cap at 100%
  }
}

export const capacityController = new CapacityController();
