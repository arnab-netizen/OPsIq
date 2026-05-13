/**
 * PHASE H-9: EXECUTION PRIORITY STABILIZER
 *
 * Prevent recommendation thrashing.
 * Operators must not wake up to a completely different system every day.
 */

export interface PriorityStabilityAssessment {
  execution_id: string;
  priority_stable: boolean;
  priority_changes_last_day: number;
  priority_oscillation: boolean;
  noisy_reordering_detected: boolean;
  execution_continuity_score: number;
  allow_reordering: boolean;
  override_justification: string | null;
}

/**
 * Assess priority stability
 */
export function assessPriorityStability(
  execution_id: string,
  priority_changes_in_last_24h: number,
  priority_variance: number,
  survival_risk: boolean,
  compliance_risk: boolean,
  cashflow_catastrophe: boolean,
  avg_position_change: number
): PriorityStabilityAssessment {
  // Oscillation: priority changed > 3 times in 24h
  const priority_oscillation = priority_changes_in_last_24h > 3;

  // Noisy reordering: high variance + high frequency changes
  const noisy_reordering_detected =
    priority_changes_in_last_24h > 2 && priority_variance > 0.3 && avg_position_change > 5;

  // Stability score: 0-100, decreases with changes
  let execution_continuity_score = 100;
  execution_continuity_score -= Math.min(50, priority_changes_in_last_24h * 15);
  execution_continuity_score -= Math.min(30, priority_variance * 100);

  // Allow reordering only for emergencies
  const allow_reordering =
    (survival_risk || compliance_risk || cashflow_catastrophe) &&
    !priority_oscillation;

  // Emergency override justification
  let override_justification: string | null = null;
  if (allow_reordering) {
    if (survival_risk) {
      override_justification = "EMERGENCY: Survival risk override";
    } else if (compliance_risk) {
      override_justification = "EMERGENCY: Compliance risk override";
    } else if (cashflow_catastrophe) {
      override_justification = "EMERGENCY: Catastrophic cashflow override";
    }
  }

  const priority_stable =
    !priority_oscillation &&
    !noisy_reordering_detected &&
    execution_continuity_score > 60;

  return {
    execution_id,
    priority_stable,
    priority_changes_last_day: priority_changes_in_last_24h,
    priority_oscillation,
    noisy_reordering_detected,
    execution_continuity_score: Math.max(0, execution_continuity_score),
    allow_reordering,
    override_justification,
  };
}

/**
 * Dampen priority fluctuations
 */
export function dampenPriorityFluctuation(
  current_priority: number,
  new_priority: number,
  damping_factor: number = 0.3
): number {
  // Smooth priority changes to reduce thrashing
  return current_priority + damping_factor * (new_priority - current_priority);
}

/**
 * Prevent daily reordering chaos
 */
export function shouldBlockReordering(
  assessment: PriorityStabilityAssessment,
  is_emergency: boolean
): boolean {
  // Block reordering unless emergency override
  if (assessment.priority_oscillation || assessment.noisy_reordering_detected) {
    return !is_emergency;
  }

  return assessment.execution_continuity_score < 40;
}

/**
 * Get stability summary
 */
export function getStabilitySummary(assessment: PriorityStabilityAssessment): string {
  if (assessment.priority_oscillation) {
    return `THRASHING: ${assessment.priority_changes_last_day} priority changes in 24h (lock reordering)`;
  } else if (assessment.noisy_reordering_detected) {
    return `NOISY: High reordering frequency (${assessment.execution_continuity_score.toFixed(0)}/100 continuity)`;
  } else if (assessment.priority_stable) {
    return `STABLE: Execution continuity at ${assessment.execution_continuity_score.toFixed(0)}/100`;
  } else {
    return `CAUTION: ${assessment.priority_changes_last_day} changes detected`;
  }
}
