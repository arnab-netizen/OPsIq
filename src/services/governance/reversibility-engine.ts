/**
 * PHASE G-11: ACTION REVERSIBILITY ENGINE
 *
 * Score reversibility and manage high-risk irreversible actions.
 * High irreversibility with low confidence = block or escalate.
 */

export interface ReversibilityAssessment {
  recommendation_id: string;
  rollback_cost_percentage: number;
  rollback_time_days: number;
  blast_radius_percentage: number;
  reversibility_score: number;
  measurement_difficulty: "EASY" | "MODERATE" | "HARD" | "VERY_HARD";
  operator_recovery_complexity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  low_regret: boolean;
  risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  confidence_adjustment: number;
  blocking: boolean;
  requires_escalation: boolean;
}

/**
 * Assess recommendation reversibility
 */
export function assessReversibility(
  recommendation_id: string,
  rollback_cost_percentage: number,
  rollback_time_days: number,
  blast_radius_percentage: number,
  measurement_difficulty_score: number,
  operator_recovery_complexity_score: number
): ReversibilityAssessment {
  // Calculate reversibility score (inverse of irreversibility)
  // Lower rollback cost/time and smaller blast radius = higher reversibility
  const reversibility_score = Math.max(
    0,
    1 -
      (rollback_cost_percentage / 100) * 0.3 -
      Math.min(1, rollback_time_days / 30) * 0.3 -
      (blast_radius_percentage / 100) * 0.4
  );

  // Classify measurement difficulty
  let measurement_difficulty: "EASY" | "MODERATE" | "HARD" | "VERY_HARD";
  if (measurement_difficulty_score < 0.25) {
    measurement_difficulty = "EASY";
  } else if (measurement_difficulty_score < 0.5) {
    measurement_difficulty = "MODERATE";
  } else if (measurement_difficulty_score < 0.75) {
    measurement_difficulty = "HARD";
  } else {
    measurement_difficulty = "VERY_HARD";
  }

  // Classify operator recovery complexity
  let operator_recovery_complexity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  if (operator_recovery_complexity_score < 0.25) {
    operator_recovery_complexity = "LOW";
  } else if (operator_recovery_complexity_score < 0.5) {
    operator_recovery_complexity = "MEDIUM";
  } else if (operator_recovery_complexity_score < 0.75) {
    operator_recovery_complexity = "HIGH";
  } else {
    operator_recovery_complexity = "CRITICAL";
  }

  // Determine low-regret status
  const low_regret =
    reversibility_score > 0.7 &&
    rollback_time_days < 7 &&
    blast_radius_percentage < 20 &&
    measurement_difficulty !== "VERY_HARD";

  // Determine risk level
  let risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  if (reversibility_score > 0.8 && blast_radius_percentage < 10) {
    risk_level = "LOW";
  } else if (reversibility_score > 0.5 && blast_radius_percentage < 30) {
    risk_level = "MEDIUM";
  } else if (
    reversibility_score < 0.3 ||
    blast_radius_percentage > 50 ||
    rollback_cost_percentage > 70 ||
    rollback_time_days > 20
  ) {
    risk_level = "CRITICAL";
  } else {
    risk_level = "HIGH";
  }

  // Calculate confidence adjustment
  let confidence_adjustment = 0;

  if (low_regret) {
    confidence_adjustment += 15; // Low-regret actions get priority boost
  }

  if (risk_level === "CRITICAL") {
    confidence_adjustment -= 50; // High irreversibility with uncertain outcome = major penalty
  } else if (risk_level === "HIGH") {
    confidence_adjustment -= 30;
  } else if (risk_level === "MEDIUM") {
    confidence_adjustment -= 10;
  }

  // Measurement difficulty penalty
  if (measurement_difficulty === "VERY_HARD") {
    confidence_adjustment -= 25; // Can't measure outcome = can't verify success
  } else if (measurement_difficulty === "HARD") {
    confidence_adjustment -= 15;
  }

  // Blocking conditions
  const blocking =
    risk_level === "CRITICAL" ||
    (risk_level === "HIGH" &&
      (measurement_difficulty === "VERY_HARD" ||
        operator_recovery_complexity === "CRITICAL"));

  const requires_escalation = risk_level === "CRITICAL" || blocking;

  return {
    recommendation_id,
    rollback_cost_percentage,
    rollback_time_days,
    blast_radius_percentage,
    reversibility_score,
    measurement_difficulty,
    operator_recovery_complexity,
    low_regret,
    risk_level,
    confidence_adjustment: Math.max(-100, confidence_adjustment),
    blocking,
    requires_escalation,
  };
}

/**
 * Check if action is safe to execute
 */
export function isSafeToExecute(assessment: ReversibilityAssessment): boolean {
  return !assessment.blocking;
}

/**
 * Get reversibility summary
 */
export function getReversibilitySummary(assessment: ReversibilityAssessment): string {
  if (assessment.low_regret) {
    return `Low-regret action: ${assessment.reversibility_score.toFixed(2)} reversibility, ${assessment.rollback_time_days}d to rollback`;
  } else if (assessment.risk_level === "CRITICAL") {
    return `CRITICAL RISK: Irreversible action (${assessment.reversibility_score.toFixed(2)} reversibility) with high blast radius (${assessment.blast_radius_percentage}%) - requires escalation`;
  } else if (assessment.risk_level === "HIGH") {
    return `HIGH RISK: ${assessment.reversibility_score.toFixed(2)} reversibility, ${assessment.rollback_time_days}d rollback, ${assessment.blast_radius_percentage}% blast radius`;
  } else {
    return `MEDIUM/LOW RISK: ${assessment.reversibility_score.toFixed(2)} reversibility`;
  }
}
