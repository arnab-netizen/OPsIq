import {
  EvidenceRef,
  CredibilityBreakdown,
  ConfidenceState,
  Recommendation,
  EVIDENCE_CREDIBILITY_WEIGHT,
} from "../../domain/decisions/recommendation-contracts";

/**
 * PHASE G2: DECISION CREDIBILITY ENGINE
 *
 * Implements evidence-weighted credibility scoring:
 * - Evidence quality weighting (fresh > old, measured > heuristic)
 * - Freshness decay (30+ days = stale penalty)
 * - Contradiction detection
 * - Assumption penalties
 * - Missing data penalties
 * - Historical accuracy weighting
 * - Reversibility bonus
 *
 * Outputs:
 * - Credibility score (0-100)
 * - Confidence state (HIGH/MEDIUM/LOW/NEED_MORE_DATA/CANNOT_DETERMINE/DANGER)
 * - Detailed breakdown of scoring
 */

// ============================================================================
// FRESHNESS DECAY
// ============================================================================

/**
 * Evidence older than ~30 days becomes stale for operational decisions
 * Emergency decisions need fresher evidence (< 1 day)
 */
function calculateFreshnessPenalty(
  evidence_age_days: number,
  decision_type: "EMERGENCY" | "OPERATIONAL" | "STRATEGIC" | "OPTIMIZATION"
): number {
  const max_fresh_days = decision_type === "EMERGENCY" ? 1 : decision_type === "STRATEGIC" ? 90 : 30;

  if (evidence_age_days <= max_fresh_days) {
    return 0; // No penalty for fresh evidence
  }

  // Linear decay: 0 penalty at max_fresh_days, 1.0 penalty at 2x max_fresh_days
  const decay_range = max_fresh_days; // Additional days after max_fresh
  const overage = evidence_age_days - max_fresh_days;

  if (overage >= decay_range) {
    return 1.0; // Fully stale
  }

  return overage / decay_range; // 0 to 1
}

// ============================================================================
// EVIDENCE AGGREGATION
// ============================================================================

function scoreEvidenceQuality(evidence_refs: EvidenceRef[]): {
  weighted_score: number;
  freshness_penalty: number;
  individual_scores: Array<{
    type: string;
    base_credibility: number;
    freshness_penalty: number;
    adjusted_score: number;
  }>;
} {
  if (evidence_refs.length === 0) {
    return {
      weighted_score: 0,
      freshness_penalty: 0,
      individual_scores: [],
    };
  }

  const individual_scores = evidence_refs.map((ev) => {
    const base_credibility = ev.confidence_weight ?? EVIDENCE_CREDIBILITY_WEIGHT[ev.type];
    const freshness_penalty = calculateFreshnessPenalty(ev.freshness_days, "OPERATIONAL");

    // Freshness penalty reduces the credibility: score * (1 - penalty)
    const adjusted_score = base_credibility * (1 - freshness_penalty);

    return {
      type: ev.type,
      base_credibility,
      freshness_penalty,
      adjusted_score,
    };
  });

  // Weighted average
  const weighted_score =
    individual_scores.reduce((sum, s) => sum + s.adjusted_score, 0) / individual_scores.length;

  // Average freshness penalty
  const avg_freshness_penalty =
    individual_scores.reduce((sum, s) => sum + s.freshness_penalty, 0) / individual_scores.length;

  return {
    weighted_score: weighted_score * 100, // 0-100 scale
    freshness_penalty: avg_freshness_penalty,
    individual_scores,
  };
}

// ============================================================================
// ASSUMPTION & DATA QUALITY
// ============================================================================

function scoreAssumptionQuality(rec: Recommendation): {
  assumption_penalty: number;
  unverified_critical: string[];
} {
  const critical_unverified = rec.assumptions
    .filter((a) => !a.verified && a.failure_impact === "BREAKS_RECOMMENDATION")
    .map((a) => a.assumption);

  // Penalty: 0.1 per critical unverified assumption (max 0.5)
  const assumption_penalty = Math.min(critical_unverified.length * 0.1, 0.5);

  return {
    assumption_penalty,
    unverified_critical: critical_unverified,
  };
}

function scoreMissingData(rec: Recommendation): {
  missing_data_penalty: number;
  count: number;
} {
  // Each piece of missing information reduces confidence
  // 0-5: minimal penalty (0.05 each)
  // 5+: severe penalty (0.15 each after 5)
  const critical_missing = rec.missing_information
    .filter((m) => m.toLowerCase().includes("critical") || m.toLowerCase().includes("must"))
    .map((m) => m);

  const standard_missing = rec.missing_information.filter(
    (m) => !m.toLowerCase().includes("critical") && !m.toLowerCase().includes("must")
  );

  const penalty_critical = Math.min(critical_missing.length * 0.15, 0.3);
  const penalty_standard = Math.min(standard_missing.length * 0.05, 0.2);

  return {
    missing_data_penalty: penalty_critical + penalty_standard,
    count: rec.missing_information.length,
  };
}

// ============================================================================
// CONTRADICTION DETECTION
// ============================================================================

function detectContradictions(rec: Recommendation): {
  contradictions: string[];
  contradiction_penalty: number;
} {
  const contradictions: string[] = [];

  // Check ROI vs Risk
  if (rec.roi_projection && rec.roi_projection.base_case_roi_percent < 0 && rec.risk_level === "LOW") {
    contradictions.push("ROI is negative but risk marked LOW");
  }

  // Check evidence conflicts
  const evidence_conclusions: Map<string, string[]> = new Map();
  rec.evidence_refs.forEach((ev) => {
    const conclusion = ev.quote_or_measurement.split("\n")[0]; // First line is conclusion
    if (!evidence_conclusions.has(conclusion)) {
      evidence_conclusions.set(conclusion, []);
    }
    evidence_conclusions.get(conclusion)!.push(ev.type);
  });

  // If conclusions vary significantly
  if (evidence_conclusions.size > 2) {
    contradictions.push("Multiple contradictory conclusions in evidence");
  }

  // Reversibility vs urgency
  if (rec.expected_time_to_impact === "IMMEDIATE" && !rec.reversibility.reversible) {
    contradictions.push("Immediate action that is non-reversible - high risk");
  }

  const contradiction_penalty = Math.min(contradictions.length * 0.15, 0.5);

  return {
    contradictions,
    contradiction_penalty,
  };
}

// ============================================================================
// CONFIDENCE STATE MAPPING
// ============================================================================

function credibilityScoreToConfidenceState(score: number, rec: Recommendation): ConfidenceState {
  // Check for danger signals first
  const breakers = detectContradictions(rec);
  if (breakers.contradictions.length > 2) {
    return "DANGER_DO_NOT_ACT";
  }

  const assumptions = scoreAssumptionQuality(rec);
  if (assumptions.unverified_critical.length > 2) {
    return "DANGER_DO_NOT_ACT";
  }

  // Score-based mapping
  if (score >= 80) {
    return "HIGH_CONFIDENCE";
  } else if (score >= 50) {
    return "MEDIUM_CONFIDENCE";
  } else if (score >= 20) {
    return "LOW_CONFIDENCE";
  } else if (score > 0) {
    return "NEED_MORE_DATA";
  } else {
    return "CANNOT_DETERMINE";
  }
}

// ============================================================================
// MAIN CREDIBILITY ENGINE
// ============================================================================

export function calculateCredibility(
  rec: Recommendation
): CredibilityBreakdown {
  // Step 1: Score evidence quality
  const evidence_quality = scoreEvidenceQuality(rec.evidence_refs);

  // Step 2: Score assumptions
  const assumptions = scoreAssumptionQuality(rec);

  // Step 3: Score missing data
  const missing_data = scoreMissingData(rec);

  // Step 4: Detect contradictions
  const contradictions = detectContradictions(rec);

  // Step 5: Apply reversibility bonus
  const reversibility_boost = rec.reversibility.reversible ? 0.05 : 0; // +5% for reversible

  // Step 6: Calculate final score
  // Base: evidence quality (40%), minus penalties
  let final_score = evidence_quality.weighted_score * 0.4;
  final_score -= assumptions.assumption_penalty * 100;
  final_score -= missing_data.missing_data_penalty * 100;
  final_score -= contradictions.contradiction_penalty * 100;
  final_score += reversibility_boost * 100;

  // Clamp to 0-100
  final_score = Math.max(0, Math.min(100, final_score));

  // Determine confidence state
  const confidence_state = credibilityScoreToConfidenceState(final_score, rec);

  // Build reason string
  const reason_parts: string[] = [];

  reason_parts.push(`Evidence quality: ${evidence_quality.weighted_score.toFixed(0)}/100`);

  if (evidence_quality.freshness_penalty > 0.2) {
    reason_parts.push(`Freshness penalty: -${(evidence_quality.freshness_penalty * 100).toFixed(0)}%`);
  }

  if (assumptions.assumption_penalty > 0) {
    reason_parts.push(
      `Unverified critical assumptions: ${assumptions.unverified_critical.length} (-${(assumptions.assumption_penalty * 100).toFixed(0)}%)`
    );
  }

  if (missing_data.missing_data_penalty > 0) {
    reason_parts.push(
      `Missing data items: ${missing_data.count} (-${(missing_data.missing_data_penalty * 100).toFixed(0)}%)`
    );
  }

  if (contradictions.contradictions.length > 0) {
    reason_parts.push(
      `Contradictions: ${contradictions.contradictions.length} (-${(contradictions.contradiction_penalty * 100).toFixed(0)}%)`
    );
  }

  if (reversibility_boost > 0) {
    reason_parts.push(`Reversible action: +${(reversibility_boost * 100).toFixed(0)}%`);
  }

  return {
    confidence_state,
    evidence_quality_score: evidence_quality.weighted_score,
    freshness_penalty: evidence_quality.freshness_penalty,
    contradiction_penalty: contradictions.contradiction_penalty,
    assumption_penalty: assumptions.assumption_penalty,
    missing_data_penalty: missing_data.missing_data_penalty,
    historical_accuracy_weight: 1.0, // TODO: Populated from recommendation history
    reversibility_boost,
    final_credibility_score: final_score,
    credibility_reason: reason_parts.join("; "),
    missing_information: rec.missing_information,
    contradictions_found: contradictions.contradictions,
  };
}

/**
 * Quick credibility check for real-time decisions
 */
export function isCredibilityAcceptable(credibility: CredibilityBreakdown, risk_level: string): boolean {
  // High-risk actions need high confidence
  if (risk_level === "CRITICAL") {
    return (
      credibility.confidence_state === "HIGH_CONFIDENCE" &&
      credibility.final_credibility_score >= 85
    );
  }

  if (risk_level === "HIGH") {
    return (
      (credibility.confidence_state === "HIGH_CONFIDENCE" ||
        credibility.confidence_state === "MEDIUM_CONFIDENCE") &&
      credibility.final_credibility_score >= 70
    );
  }

  // Low-risk actions can proceed with medium confidence
  if (risk_level === "LOW") {
    return credibility.final_credibility_score >= 50;
  }

  return false;
}
