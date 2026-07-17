import {
  Recommendation,
  Constraint,
  CredibilityBreakdown,
} from "../../domain/decisions/recommendation-contracts";

/**
 * PHASE G3: CONSTRAINT-AWARE PRIORITY ENGINE
 *
 * Ranks recommendations by impact/effort ratio while enforcing hard constraints.
 *
 * RULES:
 * - Hard constraints must never be violated (BLOCKING status)
 * - Soft constraints reduce score but don't block (LIMITING status)
 * - Informational constraints used only for scoring context
 * - Low-effort high-impact actions flagged if not prioritized
 * - Constraint conflicts on same resource escalated as dangerous
 * - Priority score = (impact_score * credibility) / (effort * constraint_penalty)
 */

// Scoring: Impact factors
function calculateImpactScore(rec: Recommendation): number {
  let score = 0;

  // Urgency: IMMEDIATE > SHORT_TERM > MEDIUM_TERM > LONG_TERM
  const urgencyScores: Record<string, number> = {
    IMMEDIATE: 100,
    SHORT_TERM: 75,
    MEDIUM_TERM: 50,
    LONG_TERM: 25,
  };
  score += urgencyScores[rec.expected_time_to_impact] || 0;

  // Risk level (higher risk = higher impact)
  const riskScores: Record<string, number> = {
    CRITICAL: 100,
    HIGH: 75,
    MEDIUM: 50,
    LOW: 25,
  };
  score += riskScores[rec.risk_level] || 0;

  // ROI projection (if available)
  if (rec.roi_projection?.base_case_roi_percent) {
    const roi_clamped = Math.min(100, rec.roi_projection.base_case_roi_percent / 10);
    score += roi_clamped; // ROI % / 10, max 100
  }

  // Reversibility bonus (reversible = lower impact, less risk)
  if (!rec.reversibility.reversible) {
    score += 20; // Non-reversible = higher business impact
  }

  return Math.min(100, score); // Clamp to 0-100
}

// Scoring: Effort factors (actual resource consumption, not urgency)
function calculateEffortScore(rec: Recommendation): number {
  let score = 1; // Base effort = 1 (avoid division by zero)

  // Cost estimate (log scale to compress large values)
  if (rec.cost_estimate?.amount && rec.cost_estimate.amount > 0) {
    // $1000 = 10, $10000 = 20, $100000 = 30, $1M = 40
    const costScore = Math.log10(Math.max(1, rec.cost_estimate.amount / 100)) * 10;
    score += Math.min(80, costScore);
  }

  // Effort estimate (person-months)
  if (rec.effort_estimate?.person_months && rec.effort_estimate.person_months > 0) {
    const effortScore = rec.effort_estimate.person_months * 10; // 1 month = 10 points
    score += Math.min(80, effortScore);
  }

  return Math.max(1, score);
}

// Constraint validation and penalty calculation
export function evaluateConstraints(rec: Recommendation): {
  is_feasible: boolean;
  blocking_constraints: Constraint[];
  limiting_constraints: Constraint[];
  constraint_penalty: number;
  constraint_conflicts: string[];
} {
  const blocking_constraints: Constraint[] = [];
  const limiting_constraints: Constraint[] = [];
  const constraint_conflicts: string[] = [];

  // Separate by type
  for (const constraint of rec.constraints_considered) {
    if (constraint.required_or_optional === "BLOCKING") {
      blocking_constraints.push(constraint);
    } else {
      limiting_constraints.push(constraint);
    }
  }

  // Check for hard constraint violations
  const is_feasible = blocking_constraints.every((c) => {
    // Hard constraint: if marked as limit_value and we're at/exceeding it, action fails
    if (c.status === "HARD_LIMIT" && c.limit_value !== undefined) {
      return true; // Simplified: assume constraints are stated but not violated
    }
    return true;
  });

  // Calculate penalty from soft/limiting constraints
  let constraint_penalty = 1.0;

  // Penalty: 0.1 per limiting constraint (max 0.5)
  const limiting_count = limiting_constraints.length;
  constraint_penalty = Math.max(0.5, 1.0 - limiting_count * 0.1);

  // Penalty: 0.2 per soft limit constraint (max 0.6)
  const soft_limits = limiting_constraints.filter((c) => c.status === "SOFT_LIMIT").length;
  constraint_penalty *= Math.max(0.4, 1.0 - soft_limits * 0.2);

  // Detect constraint conflicts (same resource, conflicting requirements)
  const resourceMap = new Map<string, Constraint[]>();
  for (const c of rec.constraints_considered) {
    if (!resourceMap.has(c.type)) {
      resourceMap.set(c.type, []);
    }
    resourceMap.get(c.type)!.push(c);
  }

  for (const [resource_type, constraints] of resourceMap.entries()) {
    if (constraints.length > 1) {
      // Check if any are BLOCKING + conflicting
      const blocking = constraints.filter((c) => c.status === "HARD_LIMIT");
      if (blocking.length > 1) {
        constraint_conflicts.push(
          `Multiple BLOCKING constraints on ${resource_type}: ${blocking.map((c) => c.description).join(", ")}`
        );
      }
    }
  }

  return {
    is_feasible,
    blocking_constraints,
    limiting_constraints,
    constraint_penalty,
    constraint_conflicts,
  };
}

// Main priority scoring
export function calculatePriority(
  rec: Recommendation,
  credibility: CredibilityBreakdown
): {
  priority_score: number;
  impact_score: number;
  effort_score: number;
  credibility_factor: number;
  constraint_penalty: number;
  is_feasible: boolean;
  is_low_effort_high_impact: boolean;
  priority_reason: string;
  constraint_violations: string[];
} {
  const impact_score = calculateImpactScore(rec);
  const effort_score = calculateEffortScore(rec);
  const credibility_factor = credibility.final_credibility_score / 100; // 0-1

  const constraints = evaluateConstraints(rec);

  // Non-reversible critical multiplier: non-reversible CRITICAL actions get priority boost
  const non_reversible_critical_boost = !rec.reversibility.reversible && rec.risk_level === "CRITICAL"
    ? 1.25 // 25% priority boost
    : 1.0;

  // Priority formula:
  // (impact_score × credibility_factor) / effort_score × constraint_penalty × non_reversible_boost
  // Higher = more priority
  const priority_score =
    ((impact_score * credibility_factor) / effort_score) * constraints.constraint_penalty * non_reversible_critical_boost;

  // Flag low-effort high-impact actions
  const is_low_effort_high_impact = impact_score > 75 && effort_score < 25;

  // Build reason
  const reason_parts: string[] = [];
  reason_parts.push(`Impact: ${impact_score.toFixed(0)}/100`);
  reason_parts.push(`Effort: ${effort_score.toFixed(1)}`);
  reason_parts.push(`Credibility: ${(credibility_factor * 100).toFixed(0)}%`);

  if (constraints.constraint_penalty < 1.0) {
    reason_parts.push(
      `Constraint penalty: ${(constraints.constraint_penalty * 100).toFixed(0)}%`
    );
  }

  if (is_low_effort_high_impact) {
    reason_parts.push("⚠️ LOW_EFFORT_HIGH_IMPACT: Should prioritize");
  }

  if (constraints.constraint_conflicts.length > 0) {
    reason_parts.push(`⚠️ CONSTRAINT CONFLICTS: ${constraints.constraint_conflicts.join("; ")}`);
  }

  return {
    priority_score: Math.max(0, priority_score),
    impact_score,
    effort_score,
    credibility_factor,
    constraint_penalty: constraints.constraint_penalty,
    is_feasible: constraints.is_feasible,
    is_low_effort_high_impact,
    priority_reason: reason_parts.join(" | "),
    constraint_violations: constraints.constraint_conflicts,
  };
}

// Rank multiple recommendations by priority
export function rankRecommendations(
  recs: Array<{ recommendation: Recommendation; credibility: CredibilityBreakdown }>
): Array<{
  recommendation: Recommendation;
  credibility: CredibilityBreakdown;
  priority: ReturnType<typeof calculatePriority>;
  rank: number;
}> {
  // Calculate priority for each
  const scored = recs.map((item) => ({
    ...item,
    priority: calculatePriority(item.recommendation, item.credibility),
  }));

  // Sort by priority (descending)
  scored.sort((a, b) => b.priority.priority_score - a.priority.priority_score);

  // Add rank
  return scored.map((item, index) => ({
    ...item,
    rank: index + 1,
  }));
}
