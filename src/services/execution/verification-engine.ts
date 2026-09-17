/**
 * PHASE H-6: EXECUTION VERIFICATION ENGINE
 *
 * Verify claimed completion and detect fake/partial completion.
 */

export type OutcomeQuality =
  | "VERIFIED_SUCCESS"
  | "PARTIAL_SUCCESS"
  | "NO_MEASURABLE_CHANGE"
  | "NEGATIVE_OUTCOME"
  | "UNVERIFIED"
  | "INCONCLUSIVE";

export interface VerificationAssessment {
  execution_id: string;
  outcome_quality: OutcomeQuality;
  success: boolean;
  evidence_valid: boolean;
  kpi_moved: boolean;
  metric_delta: number;
  expected_metric_movement: number;
  confidence_score: number;
  fake_completion_risk: boolean;
  partial_completion_risk: boolean;
}

/**
 * Verify execution completion
 */
export function verifyCompletion(
  execution_id: string,
  claimed_complete: boolean,
  evidence_attached: boolean,
  evidence_quality: number,
  kpi_baseline: number,
  kpi_current: number,
  expected_movement: number,
  operator_notes: string,
  rollback_occurred: boolean
): VerificationAssessment {
  const metric_delta = kpi_current - kpi_baseline;
  let outcome_quality: OutcomeQuality = "UNVERIFIED";
  let success = false;
  let fake_completion_risk = false;
  let partial_completion_risk = false;
  let confidence_score = 0;

  // Check evidence
  const evidence_valid = evidence_attached && evidence_quality > 0.6;

  // Check KPI movement
  const kpi_moved = Math.abs(metric_delta) > Math.abs(expected_movement) * 0.2;

  if (!evidence_valid) {
    outcome_quality = "UNVERIFIED";
    fake_completion_risk = claimed_complete && !evidence_attached;
    confidence_score = 0.1;
  } else if (rollback_occurred) {
    outcome_quality = "NEGATIVE_OUTCOME";
    success = false;
    confidence_score = 0.8;
  } else if (metric_delta >= expected_movement * 0.9) {
    outcome_quality = "VERIFIED_SUCCESS";
    success = true;
    confidence_score = 0.95;
  } else if (metric_delta >= expected_movement * 0.5) {
    outcome_quality = "PARTIAL_SUCCESS";
    success = true;
    partial_completion_risk = true;
    confidence_score = 0.7;
  } else if (Math.abs(metric_delta) < Math.abs(expected_movement) * 0.1) {
    outcome_quality = "NO_MEASURABLE_CHANGE";
    success = false;
    confidence_score = 0.6;
  } else if (metric_delta < 0 && expected_movement > 0) {
    outcome_quality = "NEGATIVE_OUTCOME";
    success = false;
    confidence_score = 0.8;
  } else {
    outcome_quality = "INCONCLUSIVE";
    success = false;
    confidence_score = 0.4;
  }

  return {
    execution_id,
    outcome_quality,
    success,
    evidence_valid,
    kpi_moved,
    metric_delta,
    expected_metric_movement: expected_movement,
    confidence_score,
    fake_completion_risk,
    partial_completion_risk,
  };
}

/**
 * Detect fake completion patterns: a claimed completion is only "fake" when there is NEITHER
 * evidence NOR an operator note to back it up (and the KPI hasn't moved). Either one alone is
 * enough to make a completion verifiable -- this must be AND, not OR: with OR, a completion
 * with real evidence attached but no operator note was incorrectly flagged as fake on every call
 * (production bug: POST /api/owner/process-execution COMPLETE always returned 400
 * EVIDENCE_REQUIRED, because the owner cockpit's Complete form has no operator-notes field, so
 * operator_notes_empty was always true regardless of evidence_attached).
 */
export function detectFakeCompletion(
  claimed_complete: boolean,
  evidence_attached: boolean,
  kpi_moved: boolean,
  operator_notes_empty: boolean
): boolean {
  return (
    claimed_complete &&
    (!evidence_attached && operator_notes_empty) &&
    !kpi_moved
  );
}

/**
 * Get verification summary
 */
export function getVerificationSummary(assessment: VerificationAssessment): string {
  if (assessment.outcome_quality === "VERIFIED_SUCCESS") {
    return `✓ VERIFIED: ${(assessment.metric_delta).toFixed(1)} point movement (expected ${assessment.expected_metric_movement})`;
  } else if (assessment.outcome_quality === "PARTIAL_SUCCESS") {
    return `~ PARTIAL: ${(assessment.metric_delta).toFixed(1)} point movement (${(assessment.metric_delta / assessment.expected_metric_movement * 100).toFixed(0)}% of target)`;
  } else if (assessment.outcome_quality === "NEGATIVE_OUTCOME") {
    return `✗ NEGATIVE: ${(assessment.metric_delta).toFixed(1)} point movement (opposite of target)`;
  } else if (assessment.outcome_quality === "NO_MEASURABLE_CHANGE") {
    return `→ NO CHANGE: No measurable movement detected`;
  } else if (assessment.outcome_quality === "UNVERIFIED") {
    return `? UNVERIFIED: Insufficient evidence`;
  } else {
    return `? INCONCLUSIVE: Unable to verify outcome`;
  }
}
