/**
 * PHASE H-10: EXECUTION REALITY AUDIT
 *
 * Measure operational reality, not theoretical recommendation quality.
 */

export interface RealityAuditMetrics {
  recommendation_usefulness_rate: number;
  execution_completion_rate: number;
  operator_burden_score: number;
  blocker_frequency: number;
  reversibility_success_rate: number;
  verification_reliability: number;
  stale_execution_accumulation: number;
  escalation_frequency: number;
  abandonment_pattern: number;
  operational_health_score: number;
}

/**
 * Conduct execution reality audit
 */
export function conductRealityAudit(
  total_recommendations: number,
  recommendations_acted_on: number,
  recommendations_ignored: number,
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
  escalations: number,
  abandonment_count: number
): RealityAuditMetrics {
  // Recommendation usefulness: acted on / total
  const recommendation_usefulness_rate =
    total_recommendations > 0
      ? recommendations_acted_on / total_recommendations
      : 0;

  // Execution completion rate
  const execution_completion_rate =
    total_executions > 0
      ? executions_completed / total_executions
      : 0;

  // Operator burden: % at capacity + abandonment rate
  const abandonment_rate =
    total_executions > 0
      ? abandonment_count / total_executions
      : 0;

  const operator_burden_score = Math.min(
    1,
    (operators_at_capacity / 100) * 0.5 + abandonment_rate * 0.5
  );

  // Blocker frequency: blockers / executions
  const blocker_frequency =
    total_executions > 0
      ? blockers_encountered / total_executions
      : 0;

  // Reversibility success rate: successful rollbacks / attempted
  const total_rollbacks = rollbacks_successful + rollbacks_failed;
  const reversibility_success_rate =
    total_rollbacks > 0
      ? rollbacks_successful / total_rollbacks
      : 1;

  // Verification reliability: verified outcomes / total
  const total_outcomes = outcomes_verified + outcomes_unverified;
  const verification_reliability =
    total_outcomes > 0
      ? outcomes_verified / total_outcomes
      : 0;

  // Stale execution accumulation: % of total
  const stale_execution_accumulation =
    total_executions > 0
      ? stale_executions / total_executions
      : 0;

  // Escalation frequency: escalations / executions
  const escalation_frequency =
    total_executions > 0
      ? escalations / total_executions
      : 0;

  // Abandonment pattern: abandonment trend
  const abandonment_pattern = abandonment_count;

  // Operational health: 0-100 score
  let operational_health_score = 100;
  operational_health_score -= Math.min(25, (1 - recommendation_usefulness_rate) * 25);
  operational_health_score -= Math.min(25, (1 - execution_completion_rate) * 25);
  operational_health_score -= Math.min(20, operator_burden_score * 20);
  operational_health_score -= Math.min(15, blocker_frequency * 15);
  operational_health_score -= Math.min(10, stale_execution_accumulation * 10);

  return {
    recommendation_usefulness_rate,
    execution_completion_rate,
    operator_burden_score,
    blocker_frequency,
    reversibility_success_rate,
    verification_reliability,
    stale_execution_accumulation,
    escalation_frequency,
    abandonment_pattern,
    operational_health_score: Math.max(0, operational_health_score),
  };
}

/**
 * Identify operational bottlenecks
 */
export function identifyBottlenecks(metrics: RealityAuditMetrics): string[] {
  const bottlenecks: string[] = [];

  if (metrics.recommendation_usefulness_rate < 0.5) {
    bottlenecks.push("Recommendations too irrelevant (< 50% acted on)");
  }

  if (metrics.execution_completion_rate < 0.6) {
    bottlenecks.push("Execution completion poor (< 60%)");
  }

  if (metrics.operator_burden_score >= 0.5) {
    bottlenecks.push("Operator overload critical (> 50% burden)");
  }

  if (metrics.blocker_frequency > 0.3) {
    bottlenecks.push("High blocker rate (> 30% of executions)");
  }

  if (metrics.stale_execution_accumulation > 0.2) {
    bottlenecks.push("Stale work piling up (> 20% of backlog)");
  }

  if (metrics.escalation_frequency > 0.15) {
    bottlenecks.push("Excessive escalations (> 15% of executions)");
  }

  if (metrics.abandonment_pattern > 5) {
    bottlenecks.push(`Abandonment trend: ${metrics.abandonment_pattern} executions abandoned`);
  }

  return bottlenecks;
}

/**
 * Get operational health summary
 */
export function getOperationalHealthSummary(metrics: RealityAuditMetrics): string {
  const bottlenecks = identifyBottlenecks(metrics);

  if (metrics.operational_health_score < 30) {
    return `CRITICAL (${metrics.operational_health_score.toFixed(0)}/100): ${bottlenecks.slice(0, 3).join("; ")}`;
  } else if (metrics.operational_health_score < 50) {
    return `WARNING (${metrics.operational_health_score.toFixed(0)}/100): ${bottlenecks[0] || "multiple issues"}`;
  } else if (metrics.operational_health_score < 70) {
    return `CAUTION (${metrics.operational_health_score.toFixed(0)}/100): Some bottlenecks detected`;
  } else {
    return `HEALTHY (${metrics.operational_health_score.toFixed(0)}/100): Operational reality sustainable`;
  }
}
