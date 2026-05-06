import { logger } from "@/infra/logger";
import {
  QuickWinValidationInput,
  QuickWinValidationResult,
  QUICK_WIN_MAX_DAYS,
} from "@/domain/outcome/quickwin";

export class QuickWinEnforcer {
  /**
   * Validate execution plan meets quick win requirement (≤7 days)
   * Fail-closed: invalid input or >7 days returns is_quick_win=false
   */
  validateQuickWin(input: QuickWinValidationInput): QuickWinValidationResult {
    // Validate input
    if (!input.execution_plan || !Array.isArray(input.execution_plan) || input.execution_plan.length === 0) {
      logger.warn("Quick win validation failed: empty execution plan", {
        workspace_id: input.workspace_id,
        action_id: input.action?.action_id,
      });

      return {
        is_quick_win: false,
        days_to_result: Number.MAX_VALUE,
        reason_if_blocked: "Execution plan is required and must not be empty",
        max_days_allowed: QUICK_WIN_MAX_DAYS,
      };
    }

    if (!input.action || !input.action.action_id) {
      logger.warn("Quick win validation failed: missing action", {
        workspace_id: input.workspace_id,
      });

      return {
        is_quick_win: false,
        days_to_result: Number.MAX_VALUE,
        reason_if_blocked: "Action with action_id is required",
        max_days_allowed: QUICK_WIN_MAX_DAYS,
      };
    }

    // Calculate days from first start to last end
    const planDays = this.calculatePlanDays(input.execution_plan);

    // Check if quick win requirement met
    const is_quick_win = planDays <= QUICK_WIN_MAX_DAYS;

    const result: QuickWinValidationResult = {
      is_quick_win,
      days_to_result: planDays,
      reason_if_blocked: is_quick_win
        ? ""
        : `Execution plan requires ${planDays} days, exceeds ${QUICK_WIN_MAX_DAYS}-day quick win limit`,
      max_days_allowed: QUICK_WIN_MAX_DAYS,
    };

    if (!is_quick_win) {
      logger.warn("Quick win validation failed: plan exceeds 7 days", {
        action_id: input.action.action_id,
        workspace_id: input.workspace_id,
        days_to_result: planDays,
      });
    } else {
      logger.info("Quick win validation passed", {
        action_id: input.action.action_id,
        workspace_id: input.workspace_id,
        days_to_result: planDays,
      });
    }

    return result;
  }

  /**
   * Calculate total days from first start to last end
   */
  private calculatePlanDays(plan: Array<{ start_time: string; end_time: string }>): number {
    if (plan.length === 0) return 0;

    try {
      // Find earliest start and latest end
      const startTimes = plan.map((step) => new Date(step.start_time).getTime());
      const endTimes = plan.map((step) => new Date(step.end_time).getTime());

      const earliestStart = Math.min(...startTimes);
      const latestEnd = Math.max(...endTimes);

      // Check for invalid dates
      if (!Number.isFinite(earliestStart) || !Number.isFinite(latestEnd)) {
        logger.warn("Quick win calculation failed: invalid date format");
        return Number.MAX_VALUE; // Fail-closed: invalid dates block quick win
      }

      // Calculate days (round up)
      const diffMs = latestEnd - earliestStart;
      const days = Math.ceil(diffMs / (24 * 60 * 60 * 1000));

      return days;
    } catch (error) {
      logger.warn("Quick win calculation failed: invalid date format", { error });
      return Number.MAX_VALUE; // Fail-closed: invalid dates block quick win
    }
  }

  /**
   * Check if plan is quick win (≤7 days)
   */
  isQuickWin(days: number): boolean {
    return days <= QUICK_WIN_MAX_DAYS;
  }

  /**
   * Get days remaining until quick win limit
   */
  getDaysRemaining(days: number): number {
    return Math.max(0, QUICK_WIN_MAX_DAYS - days);
  }

  /**
   * Get warning threshold (e.g., at 5 days out of 7, warn)
   */
  isWarningThreshold(days: number, threshold: number = 5): boolean {
    return days >= threshold;
  }
}

export const quickWinEnforcer = new QuickWinEnforcer();
