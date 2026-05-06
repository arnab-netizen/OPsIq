import { logger } from "@/infra/logger";
import {
  VarianceInput,
  VarianceResult,
  ReplanTrigger,
  DEFAULT_KPI_THRESHOLDS,
} from "@/domain/outcome/variance";

export class VarianceCalculator {
  /**
   * Calculate variance and determine if replan should trigger
   * Fail-closed: missing impact result blocks analysis
   */
  calculateVariance(input: VarianceInput): VarianceResult {
    // Validate input
    if (!input.impact_result) {
      logger.warn("Variance calculation blocked: no impact result");
      return this.createErrorResult("No impact result provided", input);
    }

    if (!input.impact_result.is_valid) {
      logger.warn("Variance calculation blocked: invalid impact result");
      return this.createErrorResult("Invalid impact result", input);
    }

    const variance_pct = input.impact_result.variance_pct;
    const kpi = input.kpi_thresholds || DEFAULT_KPI_THRESHOLDS;

    // Determine if this is a repeated failure
    const is_repeated_failure =
      input.previous_outcome === "failure" && variance_pct < 0;

    // Determine replan trigger
    let trigger_replan = false;
    let trigger_rollback = false;
    let trigger_halt = false;
    let replan_action = ReplanTrigger.CONTINUE;
    let reason = "Performance within acceptable range";

    // Check for failure threshold
    if (variance_pct < kpi.failure_threshold) {
      trigger_replan = true;
      replan_action = ReplanTrigger.REPLAN;
      reason = `Variance ${variance_pct.toFixed(1)}% exceeds failure threshold ${kpi.failure_threshold}%`;
    }

    // Check for repeated failures (block same recommendation)
    if (is_repeated_failure && input.current_confidence < 50) {
      trigger_halt = true;
      replan_action = ReplanTrigger.HALT;
      reason = `Repeated failure detected (was ${input.previous_outcome}, still failing). Blocking same recommendation.`;
    }

    // If high confidence outcome went negative, offer rollback
    if (
      variance_pct < 0 &&
      input.current_confidence > 70 &&
      input.previous_outcome === "success"
    ) {
      trigger_rollback = true;
      replan_action = ReplanTrigger.ROLLBACK;
      reason = `Previously successful strategy now failing (variance ${variance_pct.toFixed(1)}%). Rollback available.`;
    }

    const result: VarianceResult = {
      action_id: input.impact_result.action_id,
      variance_pct,
      trigger_replan,
      trigger_rollback,
      trigger_halt,
      replan_action,
      reason,
      is_repeated_failure,
    };

    logger.info("Variance calculated", {
      action_id: input.impact_result.action_id,
      variance_pct,
      replan_action,
      is_repeated_failure,
    });

    return result;
  }

  /**
   * Check if variance meets success threshold
   */
  isSuccess(variance_pct: number, success_threshold: number = DEFAULT_KPI_THRESHOLDS.success_threshold): boolean {
    return variance_pct >= success_threshold;
  }

  /**
   * Check if variance triggers failure
   */
  isFailure(variance_pct: number, failure_threshold: number = DEFAULT_KPI_THRESHOLDS.failure_threshold): boolean {
    return variance_pct <= failure_threshold;
  }

  /**
   * Get replan reason based on variance
   */
  getReplanReason(variance_pct: number, confidence: number): string {
    if (variance_pct < -20) {
      return "Severe degradation detected";
    }
    if (variance_pct < -10) {
      return "Significant degradation requires replan";
    }
    if (variance_pct < -5) {
      return "Negative trend detected";
    }
    if (confidence < 30) {
      return "Low confidence in current strategy";
    }
    return "Minor variance detected";
  }

  /**
   * Create error result for blocked analysis
   */
  private createErrorResult(reason: string, input: VarianceInput): VarianceResult {
    return {
      action_id: input.impact_result?.action_id || "unknown",
      variance_pct: 0,
      trigger_replan: false,
      trigger_rollback: false,
      trigger_halt: true, // Fail-closed: block on validation failure
      replan_action: ReplanTrigger.HALT,
      reason: `Analysis blocked: ${reason}`,
      is_repeated_failure: false,
    };
  }
}

export const varianceCalculator = new VarianceCalculator();
