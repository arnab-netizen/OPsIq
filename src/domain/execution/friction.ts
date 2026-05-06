export interface FrictionCalculation {
  dependency_count: number;
  friction_delay_days: number;
  adjustment_factor: number;
}

export interface FrictionAdjustment {
  action_id: string;
  base_effort_hours: number;
  friction_delay_days: number;
  adjusted_duration: number; // effort_hours + friction_delay_days
  adjustment_reason: string;
}

export interface FrictionImpactAnalysis {
  action_id: string;
  base_timeline_days: number;
  friction_timeline_days: number;
  timeline_increase_percent: number;
  downstream_delay_impact: number; // cascading delay for dependent actions
}

export const FRICTION_DELAYS: Record<number, number> = {
  0: 0,
  1: 5,
  2: 5,
  3: 10,
  4: 10,
  5: 10,
  6: 20,
  7: 20,
  8: 20,
  9: 20,
  10: 20,
};

export function getFrictionDelay(dependency_count: number): number {
  if (dependency_count in FRICTION_DELAYS) {
    return FRICTION_DELAYS[dependency_count];
  }
  return dependency_count >= 6 ? 20 : 0;
}

export function getFrictionCategory(
  dependency_count: number
): "low" | "medium" | "high" | "critical" {
  if (dependency_count === 0) return "low";
  if (dependency_count <= 2) return "low";
  if (dependency_count <= 5) return "medium";
  if (dependency_count <= 8) return "high";
  return "critical";
}
