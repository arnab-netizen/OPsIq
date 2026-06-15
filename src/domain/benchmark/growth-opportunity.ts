/**
 * B22-S1: Online Growth Intelligence — Domain Model
 *
 * Identifies and evaluates market opportunities with strict source citation,
 * compliance controls, and constraint validation.
 *
 * Hard rule: Every opportunity must be sourced; invented leads are forbidden.
 */

export type OpportunityCategory =
  | "lead"
  | "market_opportunity"
  | "competitor_offer"
  | "marketing_strategy"
  | "sales_angle"
  | "partnership";

export type SourceType =
  | "industry_report"
  | "news_article"
  | "social_media"
  | "industry_event"
  | "government_data"
  | "market_research"
  | "competitor_website"
  | "trade_publication";

export interface Source {
  source_type: SourceType;
  source_name: string; // e.g., "TechCrunch", "LinkedIn", "G2.com"
  url?: string;
  retrieved_date: Date; // ISO string of when source was accessed
  publication_date?: Date; // When source was published
  author?: string;
}

export interface OpportunityClaim {
  claim: string;
  evidence: string;
  source_cited: boolean;
}

export interface GrowthOpportunity {
  opportunity_id: string;
  category: OpportunityCategory;
  opportunity: string;
  description: string;

  // Source: MANDATORY
  source: Source;
  citations: OpportunityClaim[]; // All major claims must be sourced

  // Context: Why is this relevant to the business?
  why_relevant: string;
  target_customer: string;
  business_fit: number; // 0.0-1.0: how well does this fit the business model?

  // Pitch and action
  suggested_pitch: string;
  first_action: string;
  timeline_weeks: number;

  // Effort and cost
  estimated_effort: "low" | "medium" | "high"; // Hours/weeks required
  estimated_cost: number; // Dollar cost to pursue
  cost_currency: "USD" | "INR" | "EUR" | "GBP";

  // Expected upside
  expected_revenue_impact?: number; // Annual revenue if successful
  expected_profit_improvement?: number; // Profit improvement range
  upside_range: {
    low_case: string;
    mid_case: string;
    high_case: string;
  };

  // Risk and compliance
  risks: string[];
  compliance_concerns?: string[];
  constraint_violations?: string[]; // Actions that violate stated constraints

  // Evaluation
  relevance_score: number; // 0-100: how relevant to current business
  confidence_score: number; // 0.0-1.0: confidence in opportunity reality
  implementation_confidence: number; // 0.0-1.0: confidence system can execute

  // Verification
  verification_metric: string; // How to measure success
  validation_period_days: number; // Days until we can validate

  // Sourcing certification
  sourced: boolean; // MUST be true; invented leads forbidden
  has_guaranteed_roi_claim?: boolean; // If true, this fails validation
  is_outdated?: boolean; // Marked if source date > 12 months
}

/**
 * Validate growth opportunity is well-formed and properly sourced
 */
export function validateGrowthOpportunity(opp: GrowthOpportunity): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // HARD RULE: Must be sourced
  if (!opp.sourced) {
    errors.push("HARD RULE VIOLATION: Opportunity must be sourced; invented leads forbidden");
  }

  if (!opp.opportunity_id) {
    errors.push("Opportunity ID is required");
  }

  if (!opp.opportunity || opp.opportunity.length === 0) {
    errors.push("Opportunity description is required");
  }

  // Source validation
  if (!opp.source) {
    errors.push("Source is required");
  }

  if (!opp.source.source_name) {
    errors.push("Source name is required");
  }

  if (opp.citations.length === 0) {
    errors.push("At least one citation is required");
  }

  // Check that major claims are cited
  const uncited = opp.citations.filter((c) => !c.source_cited);
  if (uncited.length > 0) {
    errors.push(`${uncited.length} claim(s) not cited with sources`);
  }

  // Compliance validation
  if (opp.has_guaranteed_roi_claim === true) {
    errors.push("COMPLIANCE VIOLATION: Guaranteed ROI claims are forbidden");
  }

  if (opp.constraint_violations && opp.constraint_violations.length > 0) {
    errors.push(
      `Opportunity violates ${opp.constraint_violations.length} constraint(s): ${opp.constraint_violations.join(", ")}`
    );
  }

  // Outdated source warning
  if (opp.source && opp.source.retrieved_date) {
    const age = Date.now() - opp.source.retrieved_date.getTime();
    const months = age / (1000 * 60 * 60 * 24 * 30);
    if (months > 12) {
      warnings.push(`Source is ${Math.floor(months)} months old; marked as outdated`);
      opp.is_outdated = true;
    }
  }

  // Score validation
  if (opp.relevance_score < 0 || opp.relevance_score > 100) {
    errors.push("Relevance score must be 0-100");
  }

  if (opp.confidence_score < 0 || opp.confidence_score > 1) {
    errors.push("Confidence score must be 0.0-1.0");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check if opportunity should be primary recommendation
 */
export function canBePrimaryRecommendation(opp: GrowthOpportunity): {
  can_recommend_primary: boolean;
  reason: string;
  recommendation_tier: "primary" | "secondary" | "exploratory";
} {
  // Primary recommendation requires:
  // 1. No constraint violations
  // 2. Sourced
  // 3. Not outdated
  // 4. High relevance and confidence

  if (opp.constraint_violations && opp.constraint_violations.length > 0) {
    return {
      can_recommend_primary: false,
      reason: "Violates constraints; cannot be primary recommendation",
      recommendation_tier: "exploratory",
    };
  }

  if (!opp.sourced) {
    return {
      can_recommend_primary: false,
      reason: "Not properly sourced; cannot be primary recommendation",
      recommendation_tier: "exploratory",
    };
  }

  if (opp.is_outdated) {
    return {
      can_recommend_primary: false,
      reason: "Source is outdated; recommend secondary only",
      recommendation_tier: "secondary",
    };
  }

  if (opp.relevance_score >= 70 && opp.confidence_score >= 0.7) {
    return {
      can_recommend_primary: true,
      reason: "High relevance and confidence; can be primary recommendation",
      recommendation_tier: "primary",
    };
  }

  if (opp.relevance_score >= 50 && opp.confidence_score >= 0.5) {
    return {
      can_recommend_primary: false,
      reason: "Moderate fit; recommend secondary exploration",
      recommendation_tier: "secondary",
    };
  }

  return {
    can_recommend_primary: false,
    reason: "Low relevance or confidence; recommend exploratory only",
    recommendation_tier: "exploratory",
  };
}

/**
 * Score opportunity viability (0-100)
 */
export function scoreOpportunity(opp: GrowthOpportunity): {
  viability_score: number; // 0-100
  effort_cost_ratio: number; // ROI proxy: upside / (effort + cost)
  risk_adjusted_score: number; // Score penalized for risks
  recommendation_strength: "strong" | "moderate" | "weak";
} {
  // Viability = (relevance + confidence) / 2 as percentage
  const viability_score = Math.round(
    (opp.relevance_score * 0.4 + opp.confidence_score * 100 * 0.6) / 1
  );

  // Effort/cost ratio (higher is better)
  const effort_cost = opp.estimated_cost;
  const upside = opp.expected_revenue_impact || 0;
  const effort_cost_ratio = effort_cost > 0 ? upside / effort_cost : 0;

  // Risk adjustment: 5% penalty per risk
  const risk_penalty = Math.min(50, opp.risks.length * 5);
  const risk_adjusted_score = Math.max(0, viability_score - risk_penalty);

  // Recommendation strength
  let recommendation_strength: "strong" | "moderate" | "weak" = "weak";
  if (risk_adjusted_score >= 65 && effort_cost_ratio > 3) {
    recommendation_strength = "strong";
  } else if (risk_adjusted_score >= 50 && effort_cost_ratio > 1) {
    recommendation_strength = "moderate";
  }

  return {
    viability_score,
    effort_cost_ratio: Math.round(effort_cost_ratio * 100) / 100,
    risk_adjusted_score,
    recommendation_strength,
  };
}

/**
 * Filter opportunities by constraint fit
 */
export function filterByConstraints(
  opportunities: GrowthOpportunity[],
  constraints: string[]
): {
  compliant: GrowthOpportunity[];
  violating: GrowthOpportunity[];
} {
  const compliant: GrowthOpportunity[] = [];
  const violating: GrowthOpportunity[] = [];

  for (const opp of opportunities) {
    if (opp.constraint_violations && opp.constraint_violations.length > 0) {
      violating.push(opp);
    } else {
      compliant.push(opp);
    }
  }

  return { compliant, violating };
}

/**
 * Rank opportunities by score
 */
export function rankOpportunitiesByScore(opportunities: GrowthOpportunity[]): Array<{
  opportunity_id: string;
  viability_score: number;
  recommendation_tier: "primary" | "secondary" | "exploratory";
  rank: number;
}> {
  const scored = opportunities.map((opp) => {
    const score = scoreOpportunity(opp);
    const tier = canBePrimaryRecommendation(opp);
    return {
      opportunity_id: opp.opportunity_id,
      viability_score: score.viability_score,
      recommendation_tier: tier.recommendation_tier,
      score: score,
    };
  });

  // Sort by viability score descending
  scored.sort((a, b) => b.score.risk_adjusted_score - a.score.risk_adjusted_score);

  return scored.map((item, index) => ({
    opportunity_id: item.opportunity_id,
    viability_score: item.score.viability_score,
    recommendation_tier: item.recommendation_tier,
    rank: index + 1,
  }));
}
