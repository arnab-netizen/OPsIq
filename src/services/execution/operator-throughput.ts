/**
 * PHASE H-4: OPERATOR THROUGHPUT ENGINE
 *
 * Track operator metrics and detect burnout/paralysis.
 * Adapt PRIORITIZATION ONLY (not heuristics or strategy).
 */

export interface ThroughputMetrics {
  completed_today: number;
  ignored_today: number;
  delayed_today: number;
  abandoned_today: number;
  average_completion_time_minutes: number;
  overload_risk: boolean;
  paralysis_detected: boolean;
  excessive_switching: boolean;
  execution_backlog: number;
  stale_execution_count: number;
  operator_health_score: number;
}

/**
 * Calculate throughput metrics
 */
export function calculateThroughputMetrics(
  completed_count: number,
  ignored_count: number,
  delayed_count: number,
  abandoned_count: number,
  total_duration_minutes: number,
  execution_count: number,
  context_switches: number,
  backlog_size: number,
  stale_count: number,
  hours_worked: number
): ThroughputMetrics {
  const average_completion_time =
    execution_count > 0 ? total_duration_minutes / execution_count : 0;

  // Overload: high completion + high ignored/delayed
  const completion_rate = execution_count > 0 ? completed_count / execution_count : 0;
  const ignored_rate = execution_count > 0 ? ignored_count / execution_count : 0;
  const overload_risk =
    completion_rate > 0.6 && (ignored_rate > 0.2 || delayed_count > 5) && hours_worked > 8;

  // Paralysis: low completion + high backlog
  const paralysis_detected =
    completed_count < 3 && backlog_size > 15 && ignored_rate > 0.3;

  // Excessive switching: > 1 context switch per minute of work
  const excessive_switching = execution_count > 0 && context_switches > execution_count * 1.5;

  // Health score: 0-100, decreases with burnout/paralysis/backlog
  let health_score = 100;
  if (overload_risk) health_score -= 30;
  if (paralysis_detected) health_score -= 35;
  if (excessive_switching) health_score -= 25;
  if (stale_count > 5) health_score -= 20;
  if (backlog_size > 20) health_score -= 15;

  return {
    completed_today: completed_count,
    ignored_today: ignored_count,
    delayed_today: delayed_count,
    abandoned_today: abandoned_count,
    average_completion_time_minutes: average_completion_time,
    overload_risk,
    paralysis_detected,
    excessive_switching,
    execution_backlog: backlog_size,
    stale_execution_count: stale_count,
    operator_health_score: Math.max(0, health_score),
  };
}

/**
 * Detect burnout risk
 */
export function detectBurnoutRisk(
  completed_count: number,
  ignored_rate: number,
  hours_worked: number,
  backlog_size: number
): boolean {
  return (
    completed_count > 20 &&
    ignored_rate > 0.25 &&
    hours_worked > 10 &&
    backlog_size > 10
  );
}

/**
 * Detect execution paralysis
 */
export function detectExecutionParalysis(
  completed_count: number,
  backlog_size: number,
  abandoned_count: number
): boolean {
  return completed_count < 2 && backlog_size > 10 && abandoned_count > 2;
}

/**
 * Get operator health summary
 */
export function getOperatorHealthSummary(metrics: ThroughputMetrics): string {
  if (metrics.operator_health_score < 30) {
    return `CRITICAL: Operator at burnout/paralysis risk (${metrics.operator_health_score}/100)`;
  } else if (metrics.operator_health_score < 50) {
    return `WARNING: High execution stress (${metrics.operator_health_score}/100)`;
  } else if (metrics.operator_health_score < 70) {
    return `CAUTION: Elevated workload (${metrics.operator_health_score}/100)`;
  } else {
    return `OK: Operator sustainable pace (${metrics.operator_health_score}/100)`;
  }
}
