import { ImpactResult } from "./impact";

export interface KPIThresholds {
  success_threshold: number; // Minimum variance_pct to consider success
  failure_threshold: number; // Maximum variance_pct before triggering replan (negative)
}

export interface VarianceInput {
  impact_result: ImpactResult;
  kpi_thresholds: KPIThresholds;
  current_confidence: number; // 0-100%
  previous_outcome?: "success" | "failure" | "unknown";
}

export enum ReplanTrigger {
  CONTINUE = "CONTINUE",
  REPLAN = "REPLAN",
  ROLLBACK = "ROLLBACK",
  HALT = "HALT",
}

export interface VarianceResult {
  action_id: string;
  variance_pct: number;
  trigger_replan: boolean;
  trigger_rollback: boolean;
  trigger_halt: boolean;
  replan_action: ReplanTrigger;
  reason: string;
  is_repeated_failure: boolean;
}

export const DEFAULT_KPI_THRESHOLDS: KPIThresholds = {
  success_threshold: 5, // ≥5% improvement = success
  failure_threshold: -10, // ≤-10% degradation = failure
};
