/**
 * B21-S1: Controlled Learning From Every Output — Domain Model
 *
 * Records diagnosis outputs with actual outcomes to enable controlled learning.
 * Hard rule: no automatic production rule changes, no learning from unverified outcomes,
 * admin approval required for any production promotion.
 */

export interface BusinessContextSnapshot {
  industry: string;
  business_size: string;
  revenue_range: string;
  key_metrics: Record<string, number | string>;
  constraints: string[];
  owner_goals: string[];
}

export interface InputDataSnapshot {
  extracted_facts_count: number;
  data_quality_score: number; // 0-100
  evidence_sources: string[];
  missing_data: string[];
  contradiction_count: number;
}

export interface RecommendationSnapshot {
  recommendation_id: string;
  problem_statement: string;
  root_causes: string[];
  suggested_actions: string[];
  confidence_score: number; // 0.0-1.0
  expected_impact: string;
}

export interface OwnerActionRecord {
  action_taken: string;
  timeline_days: number;
  constraints_respected: boolean;
  owner_notes: string;
}

export type OutcomeStatus = "pending" | "partial_success" | "full_success" | "failed" | "unknown";

export interface ActualOutcome {
  status: OutcomeStatus;
  metrics_changed: Array<{
    metric: string;
    before: string | number;
    after: string | number;
  }>;
  success_metrics: string[];
  failure_metrics: string[];
  owner_assessment: string;
}

export interface SystemSelfAssessment {
  root_cause_accuracy: number; // 0-10
  recommendation_quality: number; // 0-10
  evidence_discipline: number; // 0-10
  constraint_handling: number; // 0-10
  overall_self_score: number; // 0-100
  what_went_well: string;
  what_could_improve: string;
}

export interface LessonLearned {
  category: "root_cause_pattern" | "recommendation_pattern" | "data_quality_pattern" | "constraint_pattern";
  description: string;
  confidence: number; // 0.0-1.0 based on evidence
}

export interface RuleChangeCandidate {
  rule_id: string;
  current_rule: string;
  proposed_change: string;
  rationale: string;
  affected_cases: string[]; // diagnosis IDs that would be affected
  priority: "critical" | "high" | "medium" | "low";
}

export type PromotionStatus = "new_candidate" | "under_review" | "approved" | "rejected" | "implemented" | "rolled_back";

export interface LearningObservation {
  observation_id: string;
  diagnosis_id: string;
  created_at: Date;
  verified_at?: Date;

  // Input snapshot
  business_context: BusinessContextSnapshot;
  input_data: InputDataSnapshot;

  // Recommendation given
  recommendations_given: RecommendationSnapshot[];

  // Owner actions taken
  owner_actions: OwnerActionRecord;
  verification_metric: string;

  // Actual outcome (after verification period)
  actual_outcome?: ActualOutcome;
  outcome_verified: boolean;
  verification_period_days: number;

  // User feedback
  user_feedback?: string;
  user_rating?: number; // 1-5 stars

  // System reflection
  system_assessment: SystemSelfAssessment;

  // Learning extraction
  lessons_learned: LessonLearned[];
  rule_change_candidates: RuleChangeCandidate[];

  // Promotion tracking
  promotion_status: PromotionStatus;
  admin_notes?: string;
  admin_approved_by?: string;
  admin_approved_at?: Date;
}

/**
 * Validate learning observation is well-formed
 */
export function validateLearningObservation(obs: LearningObservation): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!obs.observation_id) {
    errors.push("Observation ID is required");
  }

  if (!obs.diagnosis_id) {
    errors.push("Diagnosis ID is required");
  }

  if (!obs.business_context || !obs.business_context.industry) {
    errors.push("Business context is required");
  }

  if (!obs.input_data) {
    errors.push("Input data snapshot is required");
  }

  if (!obs.recommendations_given || obs.recommendations_given.length === 0) {
    errors.push("At least one recommendation is required");
  }

  if (!obs.owner_actions || !obs.owner_actions.action_taken) {
    errors.push("Owner action record is required");
  }

  if (!obs.verification_metric) {
    errors.push("Verification metric is required");
  }

  if (obs.outcome_verified && !obs.actual_outcome) {
    errors.push("If outcome_verified is true, actual_outcome must be provided");
  }

  if (!obs.system_assessment) {
    errors.push("System assessment is required");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if learning can update production rules (hard rule: only verified outcomes)
 */
export function canLearnFromObservation(obs: LearningObservation): {
  can_learn: boolean;
  reason: string;
  signal_strength: "strong" | "weak" | "none";
} {
  if (!obs.outcome_verified) {
    return {
      can_learn: false,
      reason: "Outcome not yet verified; can only use as weak signal",
      signal_strength: "weak",
    };
  }

  if (!obs.actual_outcome || obs.actual_outcome.status === "unknown") {
    return {
      can_learn: false,
      reason: "Outcome status unknown; cannot learn",
      signal_strength: "none",
    };
  }

  if (obs.actual_outcome.status === "failed") {
    return {
      can_learn: true,
      reason: "Failed outcome provides strong negative learning signal",
      signal_strength: "strong",
    };
  }

  if (obs.actual_outcome.status === "full_success") {
    return {
      can_learn: true,
      reason: "Successful outcome provides strong positive learning signal",
      signal_strength: "strong",
    };
  }

  // Partial success
  return {
    can_learn: true,
    reason: "Partial outcome provides moderate learning signal",
    signal_strength: "weak", // Partial success is ambiguous
  };
}

/**
 * Score an observation based on recommendation accuracy and outcome
 */
export function scoreObservation(obs: LearningObservation): {
  accuracy_score: number; // 0-100: how accurate was recommendation?
  outcome_alignment: number; // 0-100: did outcome match expectation?
  learning_value: number; // 0-100: how much can we learn?
} {
  let accuracy_score = obs.system_assessment.overall_self_score;

  let outcome_alignment = 0;
  if (obs.actual_outcome) {
    switch (obs.actual_outcome.status) {
      case "full_success":
        outcome_alignment = 100;
        break;
      case "partial_success":
        outcome_alignment = 60;
        break;
      case "failed":
        outcome_alignment = 20;
        break;
      case "unknown":
        outcome_alignment = 50;
        break;
      case "pending":
        outcome_alignment = 0;
        break;
    }
  }

  let learning_value = 0;
  if (!obs.outcome_verified) {
    learning_value = 20; // Unverified observations have low learning value
  } else {
    // Learning value increases with confidence and alignment difference
    const confidence_avg =
      obs.recommendations_given.reduce((sum, r) => sum + r.confidence_score, 0) /
      obs.recommendations_given.length;
    const alignment_diff = Math.abs(accuracy_score - outcome_alignment);

    // High learning value when there's a gap between expected and actual
    learning_value = Math.min(100, (alignment_diff * confidence_avg) * 100);
  }

  return {
    accuracy_score,
    outcome_alignment,
    learning_value,
  };
}

/**
 * Extract lessons from multiple observations (batch learning)
 */
export function extractCommonPatterns(
  observations: LearningObservation[]
): {
  success_patterns: string[];
  failure_patterns: string[];
  data_quality_impact: string;
  constraint_violations: string[];
} {
  const success_cases = observations.filter(
    (o) => o.actual_outcome?.status === "full_success"
  );
  const failure_cases = observations.filter(
    (o) => o.actual_outcome?.status === "failed"
  );
  const constraint_violations = observations
    .filter((o) => !o.owner_actions.constraints_respected)
    .map((o) => `Diagnosis ${o.diagnosis_id}: constraint violation`);

  const success_patterns = success_cases
    .flatMap((o) => o.lessons_learned.map((l) => l.description))
    .slice(0, 5); // Top 5 patterns

  const failure_patterns = failure_cases
    .flatMap((o) => o.lessons_learned.map((l) => l.description))
    .slice(0, 5);

  const avg_data_quality =
    observations.reduce((sum, o) => sum + o.input_data.data_quality_score, 0) /
    Math.max(1, observations.length);

  return {
    success_patterns: [...new Set(success_patterns)],
    failure_patterns: [...new Set(failure_patterns)],
    data_quality_impact:
      avg_data_quality < 50
        ? "Low data quality correlates with poor outcomes"
        : "Data quality sufficient for reliable diagnosis",
    constraint_violations,
  };
}

/**
 * Hard rule: require admin approval for any production rule change
 */
export function requireAdminApprovalForPromotion(
  candidate: RuleChangeCandidate
): {
  requires_approval: boolean;
  risk_level: "critical" | "high" | "medium" | "low";
  approval_path: string;
} {
  return {
    requires_approval: true, // ALWAYS require approval
    risk_level: candidate.priority,
    approval_path: `Admin review required: ${candidate.rule_id} → proposed: ${candidate.proposed_change}`,
  };
}
