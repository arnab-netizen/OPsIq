/**
 * B21-S1: Controlled Learning From Every Output — Service
 *
 * Manages learning observations and enforces hard rules on production promotion.
 */

import type {
  LearningObservation,
  RuleChangeCandidate,
  PromotionStatus,
} from "@/domain/benchmark/learning-observation";
import {
  validateLearningObservation,
  canLearnFromObservation,
  scoreObservation,
  extractCommonPatterns,
  requireAdminApprovalForPromotion,
} from "@/domain/benchmark/learning-observation";

/**
 * Create sample learning observations for testing
 */

function createSuccessfulLearning(): LearningObservation {
  return {
    observation_id: "obs_success_001",
    diagnosis_id: "diag_cashflow_001",
    created_at: new Date("2026-05-15"),
    verified_at: new Date("2026-08-15"),

    business_context: {
      industry: "SaaS",
      business_size: "10-50 employees",
      revenue_range: "$500K-$1M",
      key_metrics: {
        monthly_revenue: 75000,
        churn_rate: 0.05,
        ltv_cac_ratio: 3.2,
      },
      constraints: ["Limited marketing budget", "Cannot add staff for 6 months"],
      owner_goals: ["Improve cash position", "Reduce churn"],
    },

    input_data: {
      extracted_facts_count: 12,
      data_quality_score: 78,
      evidence_sources: ["bank_statements", "accounting_ledger", "crm_export"],
      missing_data: ["detailed churn cohort analysis"],
      contradiction_count: 0,
    },

    recommendations_given: [
      {
        recommendation_id: "rec_cashflow_001",
        problem_statement: "Cash flow constrained despite profitability",
        root_causes: [
          "Accounts receivable: 45-day payment terms with top customers",
          "Inventory: 30 days of supply in warehouse",
        ],
        suggested_actions: [
          "Negotiate payment terms with top 3 customers (30 days vs 45)",
          "Implement daily cash forecasting",
          "Reduce inventory to 15 days",
        ],
        confidence_score: 0.82,
        expected_impact: "Cash position should improve $200K within 90 days",
      },
    ],

    owner_actions: {
      action_taken: "Negotiated with 2/3 customers, implemented daily forecasting, reduced inventory",
      timeline_days: 45,
      constraints_respected: true,
      owner_notes: "Customer negotiations took longer than expected but successful",
    },

    verification_metric: "Cash position improvement from $45K to target $250K+",
    outcome_verified: true,
    verification_period_days: 92,

    actual_outcome: {
      status: "full_success",
      metrics_changed: [
        { metric: "cash_balance", before: "$45K", after: "$280K" },
        { metric: "ar_days", before: "45", after: "32" },
        { metric: "inventory_days", before: "30", after: "14" },
      ],
      success_metrics: ["cash improved by 6.2x", "AR aging improved", "inventory optimized"],
      failure_metrics: [],
      owner_assessment: "Exactly as recommended, ahead of timeline",
    },

    user_feedback: "Diagnosis was spot-on. Action sequence worked perfectly.",
    user_rating: 5,

    system_assessment: {
      root_cause_accuracy: 9,
      recommendation_quality: 9,
      evidence_discipline: 8,
      constraint_handling: 10,
      overall_self_score: 90,
      what_went_well: "Root cause identification was precise, sequencing was logical",
      what_could_improve: "Could have been more aggressive on inventory reduction",
    },

    lessons_learned: [
      {
        category: "root_cause_pattern",
        description: "AR optimization is high-confidence indicator for cash problems in B2B SaaS",
        confidence: 0.92,
      },
      {
        category: "recommendation_pattern",
        description: "Negotiation + forecasting + inventory combo is reliable for cash crises",
        confidence: 0.88,
      },
    ],

    rule_change_candidates: [
      {
        rule_id: "rule_cash_crisis_diagnostic",
        current_rule:
          "Cash crisis diagnosis requires AR > 40 days AND inventory > 30 days AND cash < 10% monthly burn",
        proposed_change:
          "Add OR condition: cash flow negative in 2 of last 3 months (earlier detection)",
        rationale: "This case detected cash crisis by AR alone; should catch earlier with flow metric",
        affected_cases: ["diag_cashflow_001"],
        priority: "high",
      },
    ],

    promotion_status: "under_review",
  };
}

function createPartialLearning(): LearningObservation {
  return {
    observation_id: "obs_partial_001",
    diagnosis_id: "diag_churn_001",
    created_at: new Date("2026-04-01"),
    verified_at: new Date("2026-07-01"),

    business_context: {
      industry: "E-commerce",
      business_size: "5-20 employees",
      revenue_range: "$200K-$500K",
      key_metrics: {
        monthly_revenue: 35000,
        churn_rate: 0.12,
        customer_ltv: 1200,
      },
      constraints: ["Limited CS capacity", "No budget for tools"],
      owner_goals: ["Reduce churn"],
    },

    input_data: {
      extracted_facts_count: 8,
      data_quality_score: 62,
      evidence_sources: ["crm_export", "spreadsheet"],
      missing_data: ["detailed cohort data", "product usage metrics"],
      contradiction_count: 1,
    },

    recommendations_given: [
      {
        recommendation_id: "rec_churn_001",
        problem_statement: "High churn rate (12% monthly)",
        root_causes: [
          "Weak onboarding: customers not achieving value in first 14 days",
          "No proactive success outreach",
        ],
        suggested_actions: [
          "Implement structured onboarding sequence",
          "Weekly check-ins with new customers for first month",
          "Product usage monitoring",
        ],
        confidence_score: 0.68,
        expected_impact: "Churn should decline to 8% within 3 months",
      },
    ],

    owner_actions: {
      action_taken: "Implemented onboarding sequence, did 2 weeks of check-ins, then stopped due to bandwidth",
      timeline_days: 60,
      constraints_respected: false,
      owner_notes: "Could not sustain weekly check-ins due to CS capacity constraints",
    },

    verification_metric: "Churn rate improvement to 8%+",
    outcome_verified: true,
    verification_period_days: 90,

    actual_outcome: {
      status: "partial_success",
      metrics_changed: [
        { metric: "churn_rate", before: "12%", after: "10%" },
        { metric: "onboarding_completion", before: "45%", after: "72%" },
      ],
      success_metrics: ["onboarding improved", "churn declined 2 percentage points"],
      failure_metrics: ["target of 8% not reached", "check-in program unsustainable"],
      owner_assessment: "Onboarding helped but insufficient without continuous engagement",
    },

    user_feedback: "Diagnosis was correct but incomplete; need sustainable solution",
    user_rating: 3,

    system_assessment: {
      root_cause_accuracy: 7,
      recommendation_quality: 6,
      evidence_discipline: 5,
      constraint_handling: 4,
      overall_self_score: 60,
      what_went_well: "Root cause identification was correct",
      what_could_improve: "Did not account for CS bandwidth constraint; should recommend phased approach",
    },

    lessons_learned: [
      {
        category: "constraint_pattern",
        description: "High-touch recommendations fail without sustainable resource commitment",
        confidence: 0.85,
      },
      {
        category: "recommendation_pattern",
        description: "Phased approach (onboarding → check-in → automation) is more sustainable than manual check-ins",
        confidence: 0.72,
      },
    ],

    rule_change_candidates: [
      {
        rule_id: "rule_churn_recommendations",
        current_rule: "Weekly manual check-ins for all new customers",
        proposed_change: "Phased approach: onboarding → automated check-in at day 7 → manual for high-risk only",
        rationale: "Manual approach unsustainable for bandwidth-constrained teams",
        affected_cases: ["diag_churn_001"],
        priority: "high",
      },
    ],

    promotion_status: "new_candidate",
  };
}

function createUnverifiedLearning(): LearningObservation {
  return {
    observation_id: "obs_unverified_001",
    diagnosis_id: "diag_margin_001",
    created_at: new Date("2026-06-01"),

    business_context: {
      industry: "Manufacturing",
      business_size: "20-50 employees",
      revenue_range: "$1M-$3M",
      key_metrics: { gross_margin: 0.35, production_costs: 500000 },
      constraints: ["Cannot change suppliers"],
      owner_goals: ["Improve margin"],
    },

    input_data: {
      extracted_facts_count: 6,
      data_quality_score: 45,
      evidence_sources: ["accounting_estimate"],
      missing_data: [
        "detailed cost breakdown",
        "product mix analysis",
        "production efficiency metrics",
      ],
      contradiction_count: 2,
    },

    recommendations_given: [
      {
        recommendation_id: "rec_margin_001",
        problem_statement: "Margin declined to 35%",
        root_causes: ["Production inefficiency (suspected)"],
        suggested_actions: ["Implement lean manufacturing process"],
        confidence_score: 0.35,
        expected_impact: "Margin recovery to 45%",
      },
    ],

    owner_actions: {
      action_taken: "Investigating production efficiency; has not yet implemented changes",
      timeline_days: 30,
      constraints_respected: true,
      owner_notes: "Still in analysis phase",
    },

    verification_metric: "Gross margin improvement to 45%+",
    outcome_verified: false,
    verification_period_days: 0,

    system_assessment: {
      root_cause_accuracy: 3,
      recommendation_quality: 3,
      evidence_discipline: 2,
      constraint_handling: 7,
      overall_self_score: 35,
      what_went_well: "Constraints respected",
      what_could_improve: "Low-quality data led to weak diagnosis; need production metrics",
    },

    lessons_learned: [
      {
        category: "data_quality_pattern",
        description: "Manufacturing margins require detailed cost breakdown; estimates insufficient",
        confidence: 0.45,
      },
    ],

    rule_change_candidates: [],

    promotion_status: "new_candidate",
  };
}

/**
 * Get all sample learning observations
 */
export function getAllSampleObservations(): LearningObservation[] {
  return [createSuccessfulLearning(), createPartialLearning(), createUnverifiedLearning()];
}

/**
 * Get observation by ID
 */
export function getSampleObservation(observationId: string): LearningObservation | null {
  const all = getAllSampleObservations();
  return all.find((o) => o.observation_id === observationId) || null;
}

/**
 * Create observation with validation
 */
export function createObservation(obs: LearningObservation): {
  success: boolean;
  observation?: LearningObservation;
  errors: string[];
} {
  const validation = validateLearningObservation(obs);
  if (!validation.valid) {
    return {
      success: false,
      errors: validation.errors,
    };
  }

  return {
    success: true,
    observation: obs,
    errors: [],
  };
}

/**
 * Evaluate if observation can update production rules
 */
export function evaluateForLearning(obs: LearningObservation): {
  can_learn: boolean;
  reason: string;
  signal_strength: "strong" | "weak" | "none";
  scores: {
    accuracy: number;
    alignment: number;
    learning_value: number;
  };
} {
  const learning = canLearnFromObservation(obs);
  const scores = scoreObservation(obs);

  return {
    can_learn: learning.can_learn,
    reason: learning.reason,
    signal_strength: learning.signal_strength,
    scores: {
      accuracy: scores.accuracy_score,
      alignment: scores.outcome_alignment,
      learning_value: scores.learning_value,
    },
  };
}

/**
 * Hard rule: check if rule change requires admin approval
 */
export function checkAdminApprovalRequirement(obs: LearningObservation): {
  requires_approval: boolean;
  candidates_requiring_approval: RuleChangeCandidate[];
  risk_levels: Record<string, "critical" | "high" | "medium" | "low">;
} {
  const candidates = obs.rule_change_candidates;
  const risks: Record<string, "critical" | "high" | "medium" | "low"> = {};

  for (const candidate of candidates) {
    const approval = requireAdminApprovalForPromotion(candidate);
    risks[candidate.rule_id] = approval.risk_level;
  }

  return {
    requires_approval: candidates.length > 0,
    candidates_requiring_approval: candidates,
    risk_levels: risks,
  };
}

/**
 * Batch analyze multiple observations
 */
export function analyzeBatchObservations(observations: LearningObservation[]): {
  total_observations: number;
  verified_count: number;
  unverified_count: number;
  success_count: number;
  failure_count: number;
  partial_success_count: number;
  common_patterns: ReturnType<typeof extractCommonPatterns>;
  pending_promotion_candidates: RuleChangeCandidate[];
} {
  const verified = observations.filter((o) => o.outcome_verified).length;
  const unverified = observations.length - verified;
  const success = observations.filter((o) => o.actual_outcome?.status === "full_success").length;
  const failure = observations.filter((o) => o.actual_outcome?.status === "failed").length;
  const partial = observations.filter((o) => o.actual_outcome?.status === "partial_success").length;

  const patterns = extractCommonPatterns(observations);

  const pending_candidates = observations
    .flatMap((o) => o.rule_change_candidates)
    .filter((c) => c !== undefined);

  return {
    total_observations: observations.length,
    verified_count: verified,
    unverified_count: unverified,
    success_count: success,
    failure_count: failure,
    partial_success_count: partial,
    common_patterns: patterns,
    pending_promotion_candidates: pending_candidates,
  };
}

/**
 * Hard rule: promote observation only with explicit admin status
 */
export function promoteObservationToRule(obs: LearningObservation, admin_approval: boolean, approver_id: string): {
  success: boolean;
  new_status: PromotionStatus;
  reason: string;
} {
  if (!admin_approval) {
    return {
      success: false,
      new_status: obs.promotion_status,
      reason: "Admin approval required for promotion to production rule",
    };
  }

  if (obs.rule_change_candidates.length === 0) {
    return {
      success: false,
      new_status: obs.promotion_status,
      reason: "No rule change candidates to promote",
    };
  }

  return {
    success: true,
    new_status: "approved",
    reason: `Promoted by ${approver_id}`,
  };
}
