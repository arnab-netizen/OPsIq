export interface MeasuredMetric {
  name: string;
  baseline_value: number;
  actual_value: number;
  unit: string;
}

export enum ImpactDirection {
  POSITIVE = "POSITIVE",
  NEGATIVE = "NEGATIVE",
  NEUTRAL = "NEUTRAL",
}

export enum MeasurementQuality {
  HIGH = "HIGH",
  MEDIUM = "MEDIUM",
  LOW = "LOW",
}

export interface ImpactTrackerInput {
  action_id: string;
  decision_id: string;
  workspace_id: string;
  baseline_metric: MeasuredMetric | null | undefined;
  actual_outcome: MeasuredMetric | null | undefined;
  measurement_date: Date;
  measurement_confidence: number; // 0-100%
}

export interface ImpactResult {
  action_id: string;
  decision_id: string;
  workspace_id: string;
  baseline_value: number;
  actual_value: number;
  variance: number; // actual - baseline
  variance_pct: number; // (variance / baseline) * 100
  impact_direction: ImpactDirection;
  measurement_quality: MeasurementQuality;
  is_valid: boolean;
  validation_errors: string[];
}

export const MEASUREMENT_CONFIDENCE_THRESHOLD = 50; // Minimum 50% confidence to count as evidence
