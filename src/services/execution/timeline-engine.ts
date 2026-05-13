/**
 * PHASE H-8: EXECUTION TIMELINE ENGINE
 *
 * Sequence actions and detect impossible schedules.
 * No impossible schedules.
 */

export interface TimelineAssessment {
  is_feasible: boolean;
  critical_path_days: number;
  total_estimated_days: number;
  available_days: number;
  slack_days: number;
  impossible_timeline: boolean;
  bottleneck_stages: string[];
  delay_amplification_risk: boolean;
  recommended_adjustments: string[];
}

/**
 * Assess execution timeline feasibility
 */
export function assessTimeline(
  execution_ids: string[],
  estimated_duration_per_execution: number[],
  dependencies: Map<string, string[]>,
  available_days: number,
  parallel_capability: number
): TimelineAssessment {
  // Calculate critical path (longest sequence of dependent tasks)
  let critical_path_days = 0;
  let total_estimated_days = 0;

  // Sequential estimate (worst case)
  const total_sequential = estimated_duration_per_execution.reduce((a, b) => a + b, 0) / 60 / 8; // Convert minutes to days

  // Parallel estimate (best case if no dependencies)
  const parallel_days = (estimated_duration_per_execution.reduce((a, b) => a + b, 0) / 60 / 8) / Math.min(parallel_capability, execution_ids.length);

  // Critical path estimate (longest dependency chain)
  for (const exec_id of execution_ids) {
    const deps = dependencies.get(exec_id) || [];
    if (deps.length === 0) {
      const idx = execution_ids.indexOf(exec_id);
      critical_path_days = Math.max(critical_path_days, estimated_duration_per_execution[idx] / 60 / 8);
    } else {
      // Rough estimate: sequential through dependencies
      const idx = execution_ids.indexOf(exec_id);
      const dep_estimate = deps.length * 1 + estimated_duration_per_execution[idx] / 60 / 8;
      critical_path_days = Math.max(critical_path_days, dep_estimate);
    }
  }

  total_estimated_days = Math.max(critical_path_days, parallel_days);

  const slack_days = available_days - total_estimated_days;
  const impossible_timeline = slack_days < 0;

  // Identify bottlenecks
  const bottleneck_stages: string[] = [];
  if (dependencies.size > 0) {
    for (const [exec_id, deps] of dependencies) {
      if (deps.length > 1) {
        bottleneck_stages.push(`${exec_id} has ${deps.length} dependencies`);
      }
    }
  } else {
    // If no dependencies provided, consider execution chains
    bottleneck_stages.push(`Sequential chain of ${execution_ids.length} tasks`);
  }

  // Detect delay amplification (each delay cascades)
  const delay_amplification_risk = bottleneck_stages.length > 0 && (dependencies.size > 0 || execution_ids.length > 2);

  // Recommendations
  const recommended_adjustments: string[] = [];
  if (impossible_timeline) {
    recommended_adjustments.push(`Timeline impossible: need ${Math.ceil(-slack_days)} more days`);
    recommended_adjustments.push("Option 1: Reduce scope");
    recommended_adjustments.push("Option 2: Add parallel execution resources");
    recommended_adjustments.push("Option 3: Resolve bottleneck dependencies");
  }

  if (delay_amplification_risk) {
    recommended_adjustments.push("Simplify dependency graph to reduce delay amplification");
  }

  return {
    is_feasible: !impossible_timeline,
    critical_path_days,
    total_estimated_days,
    available_days,
    slack_days,
    impossible_timeline,
    bottleneck_stages,
    delay_amplification_risk,
    recommended_adjustments,
  };
}

/**
 * Detect impossible timeline
 */
export function isTimelineImpossible(
  critical_path_days: number,
  available_days: number,
  parallel_capacity: number
): boolean {
  return critical_path_days > available_days;
}

/**
 * Get timeline summary
 */
export function getTimelineSummary(assessment: TimelineAssessment): string {
  if (assessment.impossible_timeline) {
    return `IMPOSSIBLE TIMELINE: Need ${assessment.total_estimated_days.toFixed(1)}d, have ${assessment.available_days}d (${Math.ceil(-assessment.slack_days)}d short)`;
  } else if (assessment.delay_amplification_risk) {
    return `FEASIBLE but HIGH RISK: ${assessment.slack_days.toFixed(1)}d slack with ${assessment.bottleneck_stages.length} bottlenecks`;
  } else if (assessment.slack_days < 2) {
    return `TIGHT: ${assessment.slack_days.toFixed(1)}d slack (critical path: ${assessment.critical_path_days.toFixed(1)}d)`;
  } else {
    return `FEASIBLE: ${assessment.slack_days.toFixed(1)}d slack available`;
  }
}
