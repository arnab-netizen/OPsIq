import { logger } from "@/infra/logger";
import {
  ExecutionSchedule,
  ExecutionScheduleStep,
  SequencerInput,
  calculateFrictionDelay,
} from "@/domain/execution/sequencer";

export class ExecutionSequencer {
  /**
   * Build execution schedule from topologically sorted actions
   */
  buildSchedule(input: SequencerInput): ExecutionSchedule | null {
    if (input.execution_order.length === 0) {
      logger.warn("Empty execution order provided");
      return null;
    }

    const steps: ExecutionScheduleStep[] = [];
    let current_date = new Date(input.start_date);
    let action_end_times: Record<string, Date> = {};

    // Process each action in topological order
    for (let i = 0; i < input.execution_order.length; i++) {
      const action_id = input.execution_order[i];
      const details = input.action_details[action_id];

      if (!details) {
        logger.warn("Missing action details", { action_id });
        return null;
      }

      // Calculate friction delay
      const friction_delay_days = calculateFrictionDelay(details.dependency_count);

      // Set start time: after all dependencies complete
      const start_time = this.calculateStartTime(
        action_id,
        input.execution_order,
        action_end_times,
        current_date,
        friction_delay_days
      );

      // Calculate end time based on effort hours
      const end_time = new Date(start_time);
      end_time.setHours(
        end_time.getHours() + Math.ceil(details.effort_hours)
      );

      // Align to next day if spans multiple days
      if (end_time.getHours() > 8 || end_time.getHours() === 0) {
        end_time.setDate(end_time.getDate() + 1);
        end_time.setHours(8, 0, 0, 0);
      }

      action_end_times[action_id] = end_time;
      current_date = new Date(Math.max(current_date.getTime(), end_time.getTime()));

      const step: ExecutionScheduleStep = {
        action_id,
        execution_order: i + 1,
        start_time: start_time.toISOString(),
        end_time: end_time.toISOString(),
        effort_hours: details.effort_hours,
        friction_delay_days,
        capacity_hours_allocated: details.effort_hours,
        owner: details.owner,
        parallelizable: false, // Conservative: mark as non-parallelizable
      };

      steps.push(step);
    }

    // Check for capacity conflicts
    const conflicts = this.detectConflicts(steps, input.owner_available_hours_per_day);

    const total_duration_days = Math.ceil(
      (current_date.getTime() - new Date(input.start_date).getTime()) / (1000 * 60 * 60 * 24)
    );
    const total_effort_hours = steps.reduce((sum, s) => sum + s.effort_hours, 0);

    logger.info("Execution schedule built", {
      decision_id: input.decision_id,
      steps_count: steps.length,
      total_duration_days,
      total_effort_hours,
      conflicts_found: conflicts.length,
    });

    return {
      decision_id: input.decision_id,
      workspace_id: input.workspace_id,
      steps,
      total_duration_days,
      total_effort_hours,
      is_valid: conflicts.length === 0,
      conflict_detected: conflicts.length > 0,
      conflicts,
    };
  }

  /**
   * Calculate start time based on dependencies
   */
  private calculateStartTime(
    action_id: string,
    execution_order: string[],
    action_end_times: Record<string, Date>,
    current_date: Date,
    friction_delay_days: number
  ): Date {
    let start_time = new Date(current_date);

    // Add friction delay (in calendar days)
    start_time.setDate(start_time.getDate() + friction_delay_days);

    return start_time;
  }

  /**
   * Detect capacity and timeline conflicts
   */
  private detectConflicts(
    steps: ExecutionScheduleStep[],
    owner_available_hours_per_day: Record<string, number>
  ): Array<{ action_id_1: string; action_id_2: string; reason: string }> {
    const conflicts: Array<{
      action_id_1: string;
      action_id_2: string;
      reason: string;
    }> = [];

    // Group steps by owner
    const steps_by_owner: Record<string, ExecutionScheduleStep[]> = {};
    for (const step of steps) {
      if (!steps_by_owner[step.owner]) {
        steps_by_owner[step.owner] = [];
      }
      steps_by_owner[step.owner].push(step);
    }

    // Check for timeline overlaps per owner
    for (const owner in steps_by_owner) {
      const owner_steps = steps_by_owner[owner];
      for (let i = 0; i < owner_steps.length; i++) {
        for (let j = i + 1; j < owner_steps.length; j++) {
          const step1 = owner_steps[i];
          const step2 = owner_steps[j];

          const start1 = new Date(step1.start_time);
          const end1 = new Date(step1.end_time);
          const start2 = new Date(step2.start_time);
          const end2 = new Date(step2.end_time);

          // Check overlap
          if (start1 < end2 && start2 < end1) {
            conflicts.push({
              action_id_1: step1.action_id,
              action_id_2: step2.action_id,
              reason: `Timeline overlap: ${step1.action_id} (${step1.start_time} to ${step1.end_time}) conflicts with ${step2.action_id} (${step2.start_time} to ${step2.end_time})`,
            });
          }
        }
      }

      // Check capacity per owner
      const total_effort = owner_steps.reduce((sum, s) => sum + s.effort_hours, 0);

      // Estimate working days needed (assume 8-hour workday if not specified)
      const workdays_needed = Math.ceil(total_effort / 8);
      const owner_available_days = owner_steps.length; // rough estimate

      if (workdays_needed > owner_available_days) {
        logger.warn("Potential capacity issue", {
          owner,
          workdays_needed,
          owner_available_days,
          total_effort,
        });
      }
    }

    return conflicts;
  }

  /**
   * Validate schedule consistency
   */
  validateSchedule(schedule: ExecutionSchedule): boolean {
    if (!schedule.is_valid) {
      logger.warn("Schedule has conflicts", {
        conflicts_count: schedule.conflicts.length,
      });
      return false;
    }

    // Verify execution_order is consecutive
    for (let i = 0; i < schedule.steps.length; i++) {
      if (schedule.steps[i].execution_order !== i + 1) {
        logger.warn("Non-consecutive execution order", {
          expected: i + 1,
          actual: schedule.steps[i].execution_order,
        });
        return false;
      }
    }

    // Verify start_time <= end_time for each step
    for (const step of schedule.steps) {
      const start = new Date(step.start_time);
      const end = new Date(step.end_time);
      if (start >= end) {
        logger.warn("Invalid step timeline", {
          action_id: step.action_id,
          start_time: step.start_time,
          end_time: step.end_time,
        });
        return false;
      }
    }

    return true;
  }

  /**
   * Get step by action_id
   */
  getStep(schedule: ExecutionSchedule, action_id: string): ExecutionScheduleStep | null {
    return schedule.steps.find((s) => s.action_id === action_id) || null;
  }

  /**
   * Calculate total duration in days
   */
  calculateTotalDuration(schedule: ExecutionSchedule): number {
    if (schedule.steps.length === 0) {
      return 0;
    }

    const first_start = new Date(schedule.steps[0].start_time);
    const last_end = new Date(schedule.steps[schedule.steps.length - 1].end_time);

    return Math.ceil(
      (last_end.getTime() - first_start.getTime()) / (1000 * 60 * 60 * 24)
    );
  }
}

export const executionSequencer = new ExecutionSequencer();
