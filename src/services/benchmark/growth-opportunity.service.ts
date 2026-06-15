/**
 * B22-S1: Online Growth Intelligence — Service
 *
 * Provides sample growth opportunities with source validation
 */

import type { GrowthOpportunity } from "@/domain/benchmark/growth-opportunity";
import {
  validateGrowthOpportunity,
  canBePrimaryRecommendation,
  scoreOpportunity,
  filterByConstraints,
  rankOpportunitiesByScore,
} from "@/domain/benchmark/growth-opportunity";

/**
 * Create sample growth opportunities
 */

function createPrimaryOpportunity(): GrowthOpportunity {
  return {
    opportunity_id: "opp_saas_channel_001",
    category: "partnership",
    opportunity: "Partner with complementary SaaS for co-marketing",
    description:
      "Collaborate with HR/Payroll SaaS to bundle our analytics into their platform, expanding market reach",

    source: {
      source_type: "market_research",
      source_name: "SaaS Market Report 2026",
      url: "https://example.com/saas-market-report",
      retrieved_date: new Date("2026-04-15"),
      publication_date: new Date("2026-04-01"),
      author: "Industry Analyst Corp",
    },

    citations: [
      {
        claim: "90% of SaaS companies use channel partnerships for growth",
        evidence: "Reported in 2026 SaaS Market Report",
        source_cited: true,
      },
      {
        claim: "Co-marketing partnerships show 3x higher ROI than direct marketing",
        evidence: "Case studies from industry report",
        source_cited: true,
      },
    ],

    why_relevant:
      "Our analytics tool is complementary to HR/Payroll SaaS, and their customer base has high need for our capabilities",
    target_customer: "Mid-market HR/Payroll SaaS companies (Series B-C stage)",
    business_fit: 0.85,

    suggested_pitch:
      "Bundle our real-time analytics dashboard with your HR reporting, expand your platform value without engineering investment",
    first_action: "Identify top 10 complementary HR SaaS companies by market share",
    timeline_weeks: 8,

    estimated_effort: "medium",
    estimated_cost: 25000,
    cost_currency: "USD",

    expected_revenue_impact: 400000, // Annual recurring from partnership
    expected_profit_improvement: 350000,
    upside_range: {
      low_case: "$200K annual recurring (1-2 small partners)",
      mid_case: "$400K annual recurring (3-4 mid-market partners)",
      high_case: "$1M+ annual recurring (major vendor partnership)",
    },

    risks: [
      "Channel partner may compete with us later",
      "Integration complexity with different platforms",
      "Sales cycles slower than direct sales",
    ],
    compliance_concerns: ["Partner NDA and data sharing agreements"],

    relevance_score: 85,
    confidence_score: 0.8,
    implementation_confidence: 0.75,

    verification_metric: "Number of partnership LOIs signed and first integrated customer",
    validation_period_days: 90,

    sourced: true,
  };
}

function createSecondaryOpportunity(): GrowthOpportunity {
  return {
    opportunity_id: "opp_content_marketing_001",
    category: "marketing_strategy",
    opportunity: "Vertical-specific content marketing campaign",
    description: "Create industry-specific content (hospitality, retail, manufacturing) to improve SEO ranking",

    source: {
      source_type: "news_article",
      source_name: "Content Marketing Institute",
      url: "https://example.com/industry-content",
      retrieved_date: new Date("2026-03-20"),
      publication_date: new Date("2026-03-15"),
    },

    citations: [
      {
        claim: "Vertical-specific content generates 5x higher conversion rates",
        evidence: "CMI 2026 Content Marketing Study",
        source_cited: true,
      },
    ],

    why_relevant:
      "We have domain expertise in operations and can create high-quality industry-specific content for lead generation",
    target_customer: "Hospitality and retail businesses searching for operational analytics",
    business_fit: 0.65,

    suggested_pitch:
      "Create 50+ blog posts targeting hospitality/retail operational pain points, rank #1 for industry keywords",
    first_action: "Conduct keyword research for hospitality+analytics, create content calendar",
    timeline_weeks: 12,

    estimated_effort: "high",
    estimated_cost: 45000,
    cost_currency: "USD",

    expected_revenue_impact: 200000, // Estimated from lead generation
    expected_profit_improvement: 180000,
    upside_range: {
      low_case: "$100K (if 2 qualified leads/month)",
      mid_case: "$200K (if 5 qualified leads/month)",
      high_case: "$400K (if 10 qualified leads/month + brand value)",
    },

    risks: [
      "Content ROI difficult to measure",
      "Long timeline to results (6+ months)",
      "SEO algorithm changes may reduce visibility",
    ],

    relevance_score: 65,
    confidence_score: 0.65,
    implementation_confidence: 0.72,

    verification_metric: "Organic traffic to blog, leads sourced from content",
    validation_period_days: 180,

    sourced: true,
  };
}

function createOutdatedOpportunity(): GrowthOpportunity {
  return {
    opportunity_id: "opp_outdated_event_001",
    category: "sales_angle",
    opportunity: "Sponsor analytics-focused industry conference",
    description: "Sponsor a major tech conference to generate enterprise leads and build brand",

    source: {
      source_type: "industry_event",
      source_name: "TechConf 2025",
      url: "https://example.com/techconf",
      retrieved_date: new Date("2025-06-15"), // Over 12 months old
      publication_date: new Date("2025-06-01"),
    },

    citations: [
      {
        claim: "Conference sponsors get exclusive networking access",
        evidence: "Conference prospectus 2025",
        source_cited: true,
      },
    ],

    why_relevant: "Conference attendees are target customers for our analytics platform",
    target_customer: "Enterprise operations leaders and CTOs",
    business_fit: 0.7,

    suggested_pitch: "Sponsor booth at major conference to showcase analytics platform and generate leads",
    first_action: "Contact conference organizers for sponsorship packages",
    timeline_weeks: 24,

    estimated_effort: "medium",
    estimated_cost: 50000,
    cost_currency: "USD",

    expected_revenue_impact: 300000,
    upside_range: {
      low_case: "$150K from generated leads",
      mid_case: "$300K from generated leads + partnerships",
      high_case: "$500K+ including strategic partnerships",
    },

    risks: [
      "Conference dates may change",
      "Sponsorship ROI hard to track",
      "Budget may be cut due to business conditions",
    ],

    relevance_score: 70,
    confidence_score: 0.7,
    implementation_confidence: 0.65,

    verification_metric: "Qualified leads generated, MQL-to-SQL conversion",
    validation_period_days: 180,

    sourced: true,
    is_outdated: true, // Will be marked during validation
  };
}

function createConstraintViolatingOpportunity(): GrowthOpportunity {
  return {
    opportunity_id: "opp_hire_sales_001",
    category: "lead",
    opportunity: "Hire 5-person enterprise sales team",
    description: "Add dedicated enterprise sales team to pursue large accounts (>$1M ARR)",

    source: {
      source_type: "industry_report",
      source_name: "SaaS Sales Best Practices Report",
      url: "https://example.com/saas-sales",
      retrieved_date: new Date("2026-05-10"),
    },

    citations: [
      {
        claim: "Enterprise sales teams generate 40% of revenue for SaaS companies",
        evidence: "SaaS Sales Report 2026",
        source_cited: true,
      },
    ],

    why_relevant: "We have significant enterprise demand but no dedicated team to close deals",
    target_customer: "Our own business (internal hiring)",
    business_fit: 0.8,

    suggested_pitch: "Build dedicated enterprise sales team to capture $2M+ deals in pipeline",
    first_action: "Define sales team structure, compensation, hiring timeline",
    timeline_weeks: 12,

    estimated_effort: "high",
    estimated_cost: 800000, // Salary + benefits for 5 people per year
    cost_currency: "USD",

    expected_revenue_impact: 3000000,
    upside_range: {
      low_case: "$1.5M from closing 3-5 enterprise deals",
      mid_case: "$3M from closing 8-12 deals",
      high_case: "$5M+ from enterprise market dominance",
    },

    risks: [
      "Requires significant upfront investment",
      "Team ramp time 6+ months",
      "Market conditions may reduce deal flow",
    ],

    constraint_violations: ["Current budget constraint does not allow $800K headcount addition"],
    relevance_score: 80,
    confidence_score: 0.85,
    implementation_confidence: 0.7,

    verification_metric: "Enterprise deals closed, ARR from enterprise segment",
    validation_period_days: 180,

    sourced: true,
  };
}

/**
 * Get all sample opportunities
 */
export function getAllSampleOpportunities(): GrowthOpportunity[] {
  return [
    createPrimaryOpportunity(),
    createSecondaryOpportunity(),
    createOutdatedOpportunity(),
    createConstraintViolatingOpportunity(),
  ];
}

/**
 * Get opportunity by ID
 */
export function getSampleOpportunity(opportunityId: string): GrowthOpportunity | null {
  const all = getAllSampleOpportunities();
  return all.find((o) => o.opportunity_id === opportunityId) || null;
}

/**
 * Validate opportunity
 */
export function validateOpportunity(opp: GrowthOpportunity): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  return validateGrowthOpportunity(opp);
}

/**
 * Evaluate opportunity for recommendation tier
 */
export function evaluateOpportunitity(opp: GrowthOpportunity): {
  recommendation_tier: "primary" | "secondary" | "exploratory";
  viability_score: number;
  reason: string;
} {
  const tier = canBePrimaryRecommendation(opp);
  const score = scoreOpportunity(opp);

  return {
    recommendation_tier: tier.recommendation_tier,
    viability_score: score.risk_adjusted_score,
    reason: tier.reason,
  };
}

/**
 * Score opportunity
 */
export function scoreOpportunityById(opportunityId: string): {
  viability_score: number;
  effort_cost_ratio: number;
  risk_adjusted_score: number;
  recommendation_strength: "strong" | "moderate" | "weak";
} | null {
  const opp = getSampleOpportunity(opportunityId);
  if (!opp) return null;
  return scoreOpportunity(opp);
}

/**
 * Rank opportunities
 */
export function rankAllSampleOpportunities(): Array<{
  opportunity_id: string;
  viability_score: number;
  recommendation_tier: "primary" | "secondary" | "exploratory";
  rank: number;
}> {
  const opportunities = getAllSampleOpportunities();
  return rankOpportunitiesByScore(opportunities);
}

/**
 * Filter by constraints
 */
export function filterOpportunitiesByConstraints(constraints: string[]): {
  compliant: GrowthOpportunity[];
  violating: GrowthOpportunity[];
} {
  const opportunities = getAllSampleOpportunities();
  return filterByConstraints(opportunities, constraints);
}

/**
 * Get recommendation summary
 */
export function getOpportunitySummary(): {
  total_opportunities: number;
  primary_candidates: number;
  secondary_candidates: number;
  exploratory_only: number;
  constraint_violations: number;
  top_opportunity: {
    id: string;
    tier: "primary" | "secondary" | "exploratory";
    score: number;
  } | null;
} {
  const opportunities = getAllSampleOpportunities();
  const ranked = rankOpportunitiesByScore(opportunities);

  let primary = 0;
  let secondary = 0;
  let exploratory = 0;

  for (const item of ranked) {
    if (item.recommendation_tier === "primary") primary++;
    else if (item.recommendation_tier === "secondary") secondary++;
    else exploratory++;
  }

  const violating = opportunities.filter(
    (o) => o.constraint_violations && o.constraint_violations.length > 0
  ).length;

  const top = ranked.length > 0 ? {
    id: ranked[0].opportunity_id,
    tier: ranked[0].recommendation_tier,
    score: ranked[0].viability_score,
  } : null;

  return {
    total_opportunities: opportunities.length,
    primary_candidates: primary,
    secondary_candidates: secondary,
    exploratory_only: exploratory,
    constraint_violations: violating,
    top_opportunity: top,
  };
}
