/**
 * PHASE H RUNTIME COORDINATOR
 *
 * Wires all execution reality systems (H1-H10) into active runtime flows.
 * This prevents Phase H from remaining code-only.
 */

import { ExecutionUnit } from "../../domain/execution/execution-unit-contracts";
import { assessReadiness } from "./readiness-engine";
import { analyzeCompressionNeeds } from "./compression-engine";
import { calculateThroughputMetrics, detectBurnoutRisk } from "./operator-throughput";
import { detectBlocker } from "./blocker-engine";
import { verifyCompletion } from "./verification-engine";
import { assessRecoveryNeeds } from "./recovery-engine";
import { assessTimeline } from "./timeline-engine";
import { assessPriorityStability, shouldBlockReordering } from "./priority-stabilizer";
import { conductRealityAudit } from "./reality-audit";

export interface ExecutionCoordinationResult {
  execution_id: string;
  can_proceed: boolean;
  must_compress: boolean;
  blocker_detected: boolean;
  operator_health_critical: boolean;
  priority_stable: boolean;
  timeline_feasible: boolean;
  blocking_reasons: string[];
  recommendations: string[];
  operational_alerts: string[];
}

/**
 * Coordinate all execution reality checks for a single execution.
 * This is the RUNTIME ENTRY POINT - called by API handlers.
 */
export function coordinateExecution(
  execution: ExecutionUnit,
  prerequisites_met: boolean,
  operator_capacity_available: boolean,
  dependencies_available: boolean,
  evidence_fresh: boolean,
  scope_valid: boolean,
  recommendation_fresh: boolean,
  no_conflicting_executions: boolean,
  rollback_exists: boolean,
  days_blocked: number,
  cash_available: boolean,
  execution_blockers: number,
  operator_active_executions: number,
  operator_capacity_used: number,
  operator_completion_today: number,
  operator_abandoned_today: number,
  operator_hours_worked: number,
  priority_changes_24h: number,
  timeline_days_available: number,
  timeline_critical_path_days: number
): ExecutionCoordinationResult {
  const blocking_reasons: string[] = [];
  const recommendations: string[] = [];
  const operational_alerts: string[] = [];

  let can_proceed = true;
  let must_compress = false;
  let blocker_detected = false;
  let operator_health_critical = false;
  let priority_stable = true;
  let timeline_feasible = true;

  // H2: Check execution readiness
  const readiness = assessReadiness(
    execution,
    prerequisites_met,
    operator_capacity_available,
    dependencies_available,
    evidence_fresh,
    scope_valid,
    recommendation_fresh,
    no_conflicting_executions,
    rollback_exists
  );

  if (!readiness.is_ready) {
    can_proceed = false;
    blocking_reasons.push(`Readiness: ${readiness.blocking_issues[0] || "not ready"}`);
  }

  if (readiness.is_unsafe) {
    can_proceed = false;
    blocking_reasons.push(`Unsafe: ${readiness.safety_issues[0] || "unsafe to execute"}`);
    operational_alerts.push("SAFETY ALERT: Unsafe execution blocked");
  }

  // H3: Check compression needs
  const compression = analyzeCompressionNeeds(
    Array(operator_active_executions).fill("exec"),
    2,
    operator_capacity_used,
    0
  );

  if (compression.compression_ratio > 0.2) {
    must_compress = true;
    recommendations.push(`Compress ${compression.actions_consolidated} actions to reduce load`);
  }

  // H4: Check operator health
  const throughput = calculateThroughputMetrics(
    operator_completion_today,
    0,
    0,
    operator_abandoned_today,
    120, // dummy duration
    Math.max(1, operator_completion_today + operator_abandoned_today),
    3, // dummy switches
    operator_active_executions,
    0,
    operator_hours_worked
  );

  if (detectBurnoutRisk(
    operator_completion_today,
    operator_abandoned_today / Math.max(1, operator_completion_today + operator_abandoned_today),
    operator_hours_worked,
    operator_active_executions
  )) {
    operator_health_critical = true;
    operational_alerts.push(`OPERATOR ALERT: Burnout risk detected (${throughput.operator_health_score}/100)`);
    can_proceed = false;
    blocking_reasons.push("Operator burnout risk - defer execution");
  }

  // H5: Check for blockers
  if (days_blocked > 0 && !cash_available) {
    const blocker = detectBlocker(
      execution.execution_id,
      days_blocked,
      cash_available,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      false
    );

    if (blocker) {
      blocker_detected = true;
      if (blocker.requires_escalation) {
        operational_alerts.push(`BLOCKER ESCALATION: ${blocker.blocker_description}`);
        can_proceed = false;
      }
      blocking_reasons.push(`Blocker: ${blocker.unblock_path}`);
    }
  }

  // H9: Check priority stability
  const priority = assessPriorityStability(
    execution.execution_id,
    priority_changes_24h,
    0.3,
    false,
    false,
    false,
    5
  );

  if (!priority.priority_stable) {
    priority_stable = false;
    recommendations.push("Stabilize priorities - execution plan changing too frequently");
  }

  if (shouldBlockReordering(priority, false)) {
    operational_alerts.push("PRIORITY ALERT: Reordering thrashing detected - locked for stability");
  }

  // H8: Check timeline feasibility
  const timeline = assessTimeline(
    [execution.execution_id],
    [execution.estimated_duration_minutes],
    new Map(),
    timeline_days_available,
    1
  );

  if (!timeline.is_feasible) {
    timeline_feasible = false;
    can_proceed = false;
    blocking_reasons.push(`Timeline impossible: need ${timeline.total_estimated_days.toFixed(1)}d, have ${timeline.available_days}d`);
  }

  return {
    execution_id: execution.execution_id,
    can_proceed,
    must_compress,
    blocker_detected,
    operator_health_critical,
    priority_stable,
    timeline_feasible,
    blocking_reasons,
    recommendations,
    operational_alerts,
  };
}

/**
 * Full operational reality audit - called periodically to detect systemic issues
 */
export function performOperationalAudit(
  total_recommendations: number,
  recommendations_acted_on: number,
  executions_completed: number,
  executions_abandoned: number,
  total_executions: number,
  operators_at_capacity: number,
  blockers_encountered: number,
  rollbacks_successful: number,
  rollbacks_failed: number,
  outcomes_verified: number,
  outcomes_unverified: number,
  stale_executions: number,
  escalations: number
): { health_score: number; critical_alerts: string[]; requires_intervention: boolean } {
  const metrics = conductRealityAudit(
    total_recommendations,
    recommendations_acted_on,
    total_recommendations - recommendations_acted_on,
    executions_completed,
    executions_abandoned,
    total_executions,
    operators_at_capacity,
    blockers_encountered,
    rollbacks_successful,
    rollbacks_failed,
    outcomes_verified,
    outcomes_unverified,
    stale_executions,
    escalations,
    executions_abandoned
  );

  const critical_alerts: string[] = [];
  let requires_intervention = false;

  if (metrics.recommendation_usefulness_rate < 0.5) {
    critical_alerts.push("CRITICAL: Only 50% of recommendations acted on - review relevance");
    requires_intervention = true;
  }

  if (metrics.operator_burden_score > 0.8) {
    critical_alerts.push("CRITICAL: Operator burden exceeding safe limits");
    requires_intervention = true;
  }

  if (metrics.execution_completion_rate < 0.5) {
    critical_alerts.push("CRITICAL: Execution completion rate below 50%");
    requires_intervention = true;
  }

  if (metrics.blocker_frequency > 0.4) {
    critical_alerts.push("CRITICAL: Blockers affecting 40% of executions");
    requires_intervention = true;
  }

  return {
    health_score: metrics.operational_health_score,
    critical_alerts,
    requires_intervention,
  };
}
