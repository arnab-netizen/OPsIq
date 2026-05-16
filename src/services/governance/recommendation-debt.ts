/**
 * PHASE G-12: RECOMMENDATION DEBT CONTROL
 *
 * Track and control operator load and recommendation overload.
 * Prevents recommendation spam and operator burnout.
 */

export interface DebtAssessment {
  active_recommendation_count: number;
  ignored_rate: number;
  stale_accumulation: number;
  operator_execution_capacity_used: number;
  unresolved_blockers: number;
  overdue_actions: number;
  debt_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  confidence_adjustment: number;
  new_recommendations_allowed: boolean;
  compression_required: boolean;
  pruning_required: boolean;
  blocking: boolean;
}

/**
 * Assess recommendation debt
 */
export function assessRecommendationDebt(
  active_recommendation_count: number,
  ignored_count: number,
  stale_count: number,
  operator_execution_capacity_used: number,
  unresolved_blockers: number,
  overdue_actions: number
): DebtAssessment {
  const ignored_rate = active_recommendation_count > 0
    ? ignored_count / active_recommendation_count
    : 0;

  const stale_accumulation = stale_count;

  let debt_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW";
  let confidence_adjustment = 0;
  let compression_required = false;
  let pruning_required = false;
  let blocking = false;

  // Check overload conditions
  if (active_recommendation_count > 20 || operator_execution_capacity_used > 0.9) {
    debt_level = "CRITICAL";
    confidence_adjustment -= 50;
    compression_required = true;
    pruning_required = true;
    blocking = true;
  } else if (
    active_recommendation_count > 15 ||
    operator_execution_capacity_used > 0.75 ||
    unresolved_blockers > 3
  ) {
    debt_level = "HIGH";
    confidence_adjustment -= 30;
    compression_required = true;
  } else if (
    active_recommendation_count > 10 ||
    operator_execution_capacity_used > 0.6 ||
    stale_accumulation > 5
  ) {
    debt_level = "MEDIUM";
    confidence_adjustment -= 15;
  }

  // Check ignored rate
  if (ignored_rate > 0.3) {
    confidence_adjustment -= 20;
    debt_level =
      debt_level === "LOW"
        ? "MEDIUM"
        : debt_level === "MEDIUM"
          ? "HIGH"
          : "CRITICAL";
    if (debt_level === "HIGH" || debt_level === "CRITICAL") {
      compression_required = true;
    }
  }

  // Check stale accumulation
  if (stale_accumulation > 10) {
    pruning_required = true;
    confidence_adjustment -= 20;
    debt_level = debt_level === "LOW" ? "MEDIUM" : debt_level;
  }

  // Check overdue actions
  if (overdue_actions > 2) {
    blocking = true;
    confidence_adjustment -= 25;
    debt_level = "CRITICAL";
  }

  const new_recommendations_allowed = debt_level !== "CRITICAL" && !blocking;

  return {
    active_recommendation_count,
    ignored_rate,
    stale_accumulation,
    operator_execution_capacity_used,
    unresolved_blockers,
    overdue_actions,
    debt_level,
    confidence_adjustment: Math.max(-100, confidence_adjustment),
    new_recommendations_allowed,
    compression_required,
    pruning_required,
    blocking,
  };
}

/**
 * Can system accept new recommendations
 */
export function canAcceptNewRecommendation(assessment: DebtAssessment): boolean {
  return assessment.new_recommendations_allowed && !assessment.blocking;
}

/**
 * Get debt summary
 */
export function getDebtSummary(assessment: DebtAssessment): string {
  if (assessment.blocking) {
    return `CRITICAL DEBT: Blocked from new recommendations (${assessment.active_recommendation_count} active, ${assessment.overdue_actions} overdue, capacity ${(assessment.operator_execution_capacity_used * 100).toFixed(0)}%)`;
  } else if (assessment.debt_level === "CRITICAL") {
    return `CRITICAL DEBT: ${assessment.active_recommendation_count} active recs, capacity ${(assessment.operator_execution_capacity_used * 100).toFixed(0)}% - compression required`;
  } else if (assessment.debt_level === "HIGH") {
    return `HIGH DEBT: ${assessment.active_recommendation_count} active, ${(assessment.ignored_rate * 100).toFixed(0)}% ignored rate`;
  } else if (assessment.debt_level === "MEDIUM") {
    return `MEDIUM DEBT: ${assessment.active_recommendation_count} active, capacity ${(assessment.operator_execution_capacity_used * 100).toFixed(0)}%`;
  } else {
    return `LOW DEBT: ${assessment.active_recommendation_count} active recommendations`;
  }
}

/**
 * Get recommendations for debt reduction
 */
export function getDebtReductionActions(assessment: DebtAssessment): string[] {
  const actions: string[] = [];

  if (assessment.stale_accumulation > 0) {
    actions.push("Archive or reject stale recommendations (> 90 days old)");
  }

  if (assessment.compression_required) {
    actions.push("Consolidate related recommendations into single action");
    actions.push("Suppress lower-priority recommendations temporarily");
  }

  if (assessment.ignored_rate > 0.2) {
    actions.push(`Review ${(assessment.ignored_rate * 100).toFixed(0)}% ignored recommendations - are they irrelevant?`);
  }

  if (assessment.unresolved_blockers > 0) {
    actions.push(`Resolve ${assessment.unresolved_blockers} blocking issues before new recommendations`);
  }

  return actions;
}
