import { MeasuredMetric } from "./impact";
import { FeedbackAction } from "./feedback";

export interface OutcomeAuditInput {
  action_id: string;
  decision_id: string;
  workspace_id: string;
  baseline_metric: MeasuredMetric;
  actual_outcome: MeasuredMetric;
  variance: number;
  variance_pct: number;
  before_confidence: number;
  after_confidence: number;
  feedback_action: FeedbackAction;
  measurement_quality: string;
}

export interface OutcomeAuditPacket {
  packet_id: string; // Deterministic UUID based on input hash
  action_id: string;
  decision_id: string;
  workspace_id: string;
  baseline_metric: MeasuredMetric;
  actual_outcome: MeasuredMetric;
  variance: number;
  variance_pct: number;
  confidence_before: number;
  confidence_after: number;
  feedback_action: FeedbackAction;
  measurement_quality: string;
  outcome_date: string; // ISO timestamp
  auditable: true; // Immutable marker
}

export interface AuditQueryFilter {
  workspace_id?: string;
  action_id?: string;
  decision_id?: string;
  start_date?: string; // ISO
  end_date?: string; // ISO
}
