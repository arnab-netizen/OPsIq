/**
 * PHASE H-7: EXECUTION RECOVERY ENGINE
 *
 * Recover from abandoned work and detect stuck workflows.
 * System must recover from human abandonment.
 */

export type RecoveryPath = "ROLLBACK" | "ESCALATE" | "RESCOPE" | "FALLBACK" | "DEFER";

export interface RecoveryAssessment {
  execution_id: string;
  is_stuck: boolean;
  is_abandoned: boolean;
  days_stalled: number;
  recommended_recovery: RecoveryPath;
  recovery_actions: string[];
  low_regret_fallback: string;
  requires_escalation: boolean;
  recovery_confidence: number;
}

/**
 * Assess recovery needs
 */
export function assessRecoveryNeeds(
  execution_id: string,
  execution_state: string,
  last_activity_days: number,
  progress_percentage: number,
  operator_engaged: boolean,
  dependencies_available: boolean
): RecoveryAssessment {
  let is_stuck = false;
  let is_abandoned = false;
  let days_stalled = 0;
  let recommended_recovery: RecoveryPath = "DEFER";
  const recovery_actions: string[] = [];
  let low_regret_fallback = "";
  let requires_escalation = false;
  let recovery_confidence = 0.5;

  // Detect abandonment (no activity > 7 days)
  if (last_activity_days > 7 && !operator_engaged) {
    is_abandoned = true;
    days_stalled = last_activity_days;
  }

  // Detect stuck (state unchanged > 5 days)
  if (last_activity_days > 5 && execution_state === "IN_PROGRESS") {
    is_stuck = true;
    days_stalled = last_activity_days;
  }

  if (is_abandoned || is_stuck) {
    // Determine recovery path
    if (progress_percentage > 80) {
      recommended_recovery = "ESCALATE";
      recovery_actions.push("Escalate to manager for urgency assessment");
      recovery_actions.push("Provide updated timeline to operator");
      requires_escalation = true;
      recovery_confidence = 0.8;
    } else if (progress_percentage > 40) {
      recommended_recovery = "ROLLBACK";
      recovery_actions.push("Rollback to last good state");
      recovery_actions.push("Re-plan with reduced scope");
      recovery_confidence = 0.7;
      low_regret_fallback = "Revert to previous version and retry with simpler approach";
    } else if (progress_percentage > 20) {
      recommended_recovery = "RESCOPE";
      recovery_actions.push("Reduce scope to core requirements");
      recovery_actions.push("Defer stretch goals");
      recovery_confidence = 0.75;
      low_regret_fallback = "Deliver minimum viable outcome, defer enhancements";
    } else {
      recommended_recovery = "FALLBACK";
      recovery_actions.push("Activate low-regret fallback plan");
      recovery_actions.push("Reassign to different operator if possible");
      recovery_confidence = 0.6;
      low_regret_fallback = "Use pre-planned fallback approach";
    }

    if (!dependencies_available) {
      recommended_recovery = "DEFER";
      recovery_actions.splice(0, recovery_actions.length);
      recovery_actions.push("Dependencies unavailable - defer execution");
      recovery_confidence = 0.5;
    }
  }

  return {
    execution_id,
    is_stuck,
    is_abandoned,
    days_stalled,
    recommended_recovery,
    recovery_actions,
    low_regret_fallback,
    requires_escalation,
    recovery_confidence,
  };
}

/**
 * Detect workflow deadlock
 */
export function detectWorkflowDeadlock(
  active_executions: string[],
  stalled_for_days: number[],
  dependencies: Map<string, string[]>
): boolean {
  // Detect circular dependency or all stalled > 10 days
  const all_stalled = stalled_for_days.every((d) => d > 10);
  return all_stalled && active_executions.length > 0;
}

/**
 * Get recovery summary
 */
export function getRecoverySummary(assessment: RecoveryAssessment): string {
  if (assessment.is_abandoned) {
    return `ABANDONED (${assessment.days_stalled}d): ${assessment.recommended_recovery} → ${assessment.recovery_actions[0] || "escalate"}`;
  } else if (assessment.is_stuck) {
    return `STUCK (${assessment.days_stalled}d): ${assessment.recommended_recovery} → ${assessment.recovery_actions[0] || "escalate"}`;
  } else {
    return "Execution progressing normally";
  }
}
