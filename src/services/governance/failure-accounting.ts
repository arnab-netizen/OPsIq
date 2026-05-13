import {
  FailureAccounting,
  ReliabilityScore,
  OutcomeType,
  FailureAccountingSchema,
} from "../../domain/governance/failure-accounting-contracts";

/**
 * Failure Accounting: Track recommendation outcomes for measurement + accounting.
 * NO automatic learning. Only accounting + measurement.
 */

/**
 * Record recommendation outcome
 */
export function recordOutcome(
  recommendation_id: string,
  outcome_type: OutcomeType,
  accepted: boolean,
  executed: boolean,
  predicted_outcome: string,
  actual_outcome: string,
  operator_override_reason: string | undefined,
  attribution_confidence:
    | "STRONGLY_ATTRIBUTABLE"
    | "PARTIALLY_ATTRIBUTABLE"
    | "WEAKLY_ATTRIBUTABLE"
    | "NON_ATTRIBUTABLE"
    | "CONTRADICTORY_ATTRIBUTION",
  measurement_quality: number
): FailureAccounting {
  // Calculate outcome variance (-100 to 100 scale)
  const harmful_outcome = outcome_type === "HARMFUL";
  const unexpected_outcome =
    outcome_type === "UNEXPECTED" || outcome_type === "HARMFUL";

  let outcome_variance = 0;
  if (outcome_type === "SUCCESSFUL") {
    outcome_variance = 100;
  } else if (outcome_type === "PARTIALLY_SUCCESSFUL") {
    outcome_variance = 50;
  } else if (outcome_type === "UNSUCCESSFUL") {
    outcome_variance = -50;
  } else if (outcome_type === "HARMFUL") {
    outcome_variance = -100;
  } else if (outcome_type === "ABANDONED") {
    outcome_variance = 0;
  }

  // Calculate reliability delta (only from STRONGLY_ATTRIBUTABLE outcomes)
  let recommendation_reliability_delta = 0;
  if (attribution_confidence === "STRONGLY_ATTRIBUTABLE") {
    if (outcome_type === "SUCCESSFUL") {
      recommendation_reliability_delta = 20;
    } else if (outcome_type === "PARTIALLY_SUCCESSFUL") {
      recommendation_reliability_delta = 10;
    } else if (outcome_type === "UNSUCCESSFUL") {
      recommendation_reliability_delta = -20;
    } else if (outcome_type === "HARMFUL") {
      recommendation_reliability_delta = -50;
    }
  } else if (attribution_confidence === "PARTIALLY_ATTRIBUTABLE") {
    if (outcome_type === "HARMFUL") {
      recommendation_reliability_delta = -20;
    }
  } else if (
    attribution_confidence === "CONTRADICTORY_ATTRIBUTION" ||
    attribution_confidence === "NON_ATTRIBUTABLE"
  ) {
    recommendation_reliability_delta = 0; // NO learning from uncertain attribution
  }

  const accounting: FailureAccounting = {
    recommendation_id,
    outcome_type,
    accepted,
    executed,
    predicted_outcome,
    actual_outcome,
    outcome_variance,
    operator_override_reason,
    harmful_outcome,
    unexpected_outcome,
    attribution_confidence,
    recommendation_reliability_delta,
    recorded_at: new Date(),
    measurement_quality,
  };

  FailureAccountingSchema.parse(accounting);
  return accounting;
}

/**
 * Calculate recommendation reliability score
 */
export function calculateReliabilityScore(
  recommendation_id: string,
  outcomes: FailureAccounting[]
): ReliabilityScore {
  const total_outcomes_tracked = outcomes.length;

  const successful_count = outcomes.filter((o) => o.outcome_type === "SUCCESSFUL").length;
  const unsuccessful_count = outcomes.filter(
    (o) => o.outcome_type === "UNSUCCESSFUL"
  ).length;
  const harmful_count = outcomes.filter((o) => o.outcome_type === "HARMFUL").length;
  const abandoned_count = outcomes.filter((o) => o.outcome_type === "ABANDONED").length;

  const success_rate = total_outcomes_tracked > 0 ? successful_count / total_outcomes_tracked : 0;
  const harm_rate = total_outcomes_tracked > 0 ? harmful_count / total_outcomes_tracked : 0;
  const abandonment_rate = total_outcomes_tracked > 0 ? abandoned_count / total_outcomes_tracked : 0;

  // Reliability score calculation:
  // Base: success_rate - harm_rate * 2 - abandonment_rate * 0.5
  // Adjusted by attribution confidence average
  const attribution_weights: number[] = outcomes.map((o) => {
    switch (o.attribution_confidence) {
      case "STRONGLY_ATTRIBUTABLE":
        return 1.0;
      case "PARTIALLY_ATTRIBUTABLE":
        return 0.7;
      case "WEAKLY_ATTRIBUTABLE":
        return 0.3;
      case "NON_ATTRIBUTABLE":
        return 0;
      case "CONTRADICTORY_ATTRIBUTION":
        return -0.5;
      default:
        return 0;
    }
  });

  const attribution_confidence_avg =
    attribution_weights.length > 0
      ? attribution_weights.reduce((a: number, b: number) => a + b, 0) / attribution_weights.length
      : 0;

  const base_reliability = success_rate - harmful_count * 0.15 - abandonment_rate * 0.1;
  const reliability_score = Math.max(-1, Math.min(1, base_reliability * attribution_confidence_avg));

  return {
    recommendation_id,
    total_outcomes_tracked,
    successful_count,
    unsuccessful_count,
    harmful_count,
    success_rate,
    abandonment_rate,
    harm_rate,
    reliability_score,
    attribution_confidence_avg,
    last_updated: new Date(),
  };
}

/**
 * Get recommendations below reliability threshold
 */
export function getUnreliableRecommendations(
  scores: ReliabilityScore[],
  threshold: number = 0.3
): ReliabilityScore[] {
  return scores.filter((s) => s.reliability_score < threshold);
}

/**
 * Get harm history for recommendation
 */
export function getHarmHistory(outcomes: FailureAccounting[]): {
  harmful_count: number;
  harmful_pct: number;
  recent_harmful: FailureAccounting[];
} {
  const harmful_outcomes = outcomes.filter((o) => o.harmful_outcome);
  const recent_harmful = harmful_outcomes.slice(-3);

  return {
    harmful_count: harmful_outcomes.length,
    harmful_pct: outcomes.length > 0 ? harmful_outcomes.length / outcomes.length : 0,
    recent_harmful,
  };
}
