import {
  AttributionAnalysis,
  AttributionConfidence,
  AttributionScoreFactors,
  AttributionAnalysisSchema,
} from "../../domain/governance/attribution-contracts";

/**
 * Attribution Engine: Score recommendation attribution to prevent false causality.
 * Fail-closed: NO automatic learning from uncertain attribution.
 */

/**
 * Analyze attribution of outcome to recommendation
 * Returns WEAKLY_ATTRIBUTABLE or worse unless multiple factors align
 */
export function analyzeAttribution(
  recommendation_id: string,
  outcome_id: string,
  intervention_window_days: number,
  concurrent_changes_count: number,
  environmental_changes_count: number,
  operator_overrides_count: number,
  competing_recommendations_count: number,
  execution_completeness: number,
  temporal_proximity_score: number,
  measurement_quality_score: number
): AttributionAnalysis {
  // Calculate attribution score factors
  const factors = calculateAttributionFactors(
    intervention_window_days,
    concurrent_changes_count,
    environmental_changes_count,
    operator_overrides_count,
    competing_recommendations_count,
    execution_completeness,
    temporal_proximity_score,
    measurement_quality_score
  );

  // Combined attribution score (all factors weighted)
  const attribution_score =
    (factors.temporal_factor +
      factors.execution_factor +
      factors.isolation_factor +
      factors.measurement_factor) /
    4;

  // Determine attribution confidence
  let attribution_confidence: AttributionConfidence;
  let blocking = false;
  let require_manual_review = false;

  if (attribution_score >= 0.8 && !hasCompetingFactors(concurrent_changes_count, environmental_changes_count, operator_overrides_count, competing_recommendations_count)) {
    attribution_confidence = "STRONGLY_ATTRIBUTABLE";
  } else if (
    attribution_score >= 0.6 &&
    concurrent_changes_count <= 1 &&
    environmental_changes_count <= 1
  ) {
    attribution_confidence = "PARTIALLY_ATTRIBUTABLE";
  } else if (
    attribution_score >= 0.4 &&
    competing_recommendations_count === 0
  ) {
    attribution_confidence = "WEAKLY_ATTRIBUTABLE";
    require_manual_review = true;
  } else if (
    concurrent_changes_count > 2 ||
    environmental_changes_count > 2 ||
    operator_overrides_count > 1 ||
    competing_recommendations_count > 1
  ) {
    attribution_confidence = "CONTRADICTORY_ATTRIBUTION";
    blocking = true;
    require_manual_review = true;
  } else {
    attribution_confidence = "NON_ATTRIBUTABLE";
    blocking = true;
  }

  // Survivorship bias risk: if outcome is positive, higher risk of false positive
  const survivorship_bias_risk = concurrent_changes_count > 0 || environmental_changes_count > 0;

  // False reinforcement risk: incomplete execution + good outcome
  const false_reinforcement_risk =
    execution_completeness < 0.8 &&
    attribution_confidence !== "STRONGLY_ATTRIBUTABLE";

  // Recommendation reliability delta: only STRONGLY_ATTRIBUTABLE adds confidence
  let recommendation_reliability_delta = 0;
  if (attribution_confidence === "STRONGLY_ATTRIBUTABLE") {
    recommendation_reliability_delta = 15;
  } else if (
    attribution_confidence === "PARTIALLY_ATTRIBUTABLE"
  ) {
    recommendation_reliability_delta = 5;
  } else if (attribution_confidence === "CONTRADICTORY_ATTRIBUTION") {
    recommendation_reliability_delta = -30;
  } else {
    recommendation_reliability_delta = 0; // NO learning
  }

  const analysis: AttributionAnalysis = {
    recommendation_id,
    outcome_id,
    attribution_confidence,
    attribution_score,
    intervention_window_days,
    concurrent_changes: Array(concurrent_changes_count).fill("change"),
    environmental_changes: Array(environmental_changes_count).fill("change"),
    operator_overrides: Array(operator_overrides_count).fill("override"),
    competing_recommendations: Array(competing_recommendations_count).fill("competing"),
    execution_completeness,
    temporal_proximity_score,
    measurement_quality_score,
    survivorship_bias_risk,
    false_reinforcement_risk,
    recommendation_reliability_delta,
    blocking,
    require_manual_review,
    analysis_date: new Date(),
  };

  AttributionAnalysisSchema.parse(analysis);
  return analysis;
}

/**
 * Calculate attribution score factors
 */
function calculateAttributionFactors(
  intervention_window_days: number,
  concurrent_changes_count: number,
  environmental_changes_count: number,
  operator_overrides_count: number,
  competing_recommendations_count: number,
  execution_completeness: number,
  temporal_proximity_score: number,
  measurement_quality_score: number
): AttributionScoreFactors {
  // Temporal factor: closer intervention to outcome is better
  const temporal_factor =
    temporal_proximity_score * (1 - Math.min(1, intervention_window_days / 30));

  // Execution factor: higher completeness = better attribution
  const execution_factor = execution_completeness;

  // Isolation factor: fewer competing changes = better attribution
  const isolation_factor = 1 - Math.min(1, (concurrent_changes_count + environmental_changes_count + operator_overrides_count + competing_recommendations_count) / 5);

  // Measurement factor: higher measurement quality = better attribution
  const measurement_factor = measurement_quality_score;

  return {
    temporal_factor,
    execution_factor,
    isolation_factor,
    measurement_factor,
    competing_factor: Math.min(1, competing_recommendations_count / 3),
  };
}

/**
 * Check if analysis has competing factors that weaken attribution
 */
function hasCompetingFactors(
  concurrent_changes_count: number,
  environmental_changes_count: number,
  operator_overrides_count: number,
  competing_recommendations_count: number
): boolean {
  return (
    concurrent_changes_count > 0 ||
    environmental_changes_count > 0 ||
    operator_overrides_count > 0 ||
    competing_recommendations_count > 0
  );
}

/**
 * Should block learning from this attribution
 */
export function shouldBlockLearning(analysis: AttributionAnalysis): boolean {
  return (
    analysis.blocking ||
    analysis.attribution_confidence === "NON_ATTRIBUTABLE" ||
    analysis.attribution_confidence === "WEAKLY_ATTRIBUTABLE" ||
    analysis.attribution_confidence === "CONTRADICTORY_ATTRIBUTION" ||
    analysis.survivorship_bias_risk ||
    analysis.false_reinforcement_risk
  );
}

/**
 * Get attribution summary
 */
export function getAttributionSummary(analysis: AttributionAnalysis): string {
  if (analysis.attribution_confidence === "STRONGLY_ATTRIBUTABLE") {
    return "Outcome strongly attributable to recommendation (reliable signal)";
  } else if (
    analysis.attribution_confidence === "PARTIALLY_ATTRIBUTABLE"
  ) {
    return "Outcome partially attributable (moderate signal, manual review recommended)";
  } else if (analysis.attribution_confidence === "CONTRADICTORY_ATTRIBUTION") {
    return "Attribution contradicted by competing factors (learning blocked)";
  } else {
    return "Attribution insufficient (no learning from this outcome)";
  }
}
