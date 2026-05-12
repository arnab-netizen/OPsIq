import { z } from "zod";

/**
 * PHASE G: DECISION CREDIBILITY ENGINE
 *
 * G1: RECOMMENDATION CONTRACT ENFORCEMENT
 *
 * Every recommendation must include complete evidence, constraints, and measurability.
 * Fail closed on vague language, unsupported claims, or insufficient evidence.
 *
 * Schema enforces:
 * - Why this action, now
 * - Evidence references with credibility weighting
 * - Constraints considered (cash, staffing, capacity, maturity)
 * - Measurable expected impact
 * - Reversibility and rollback cost
 * - Confidence with evidence basis
 * - Success and failure metrics
 * - Assumed vs verified data
 * - Risk level assessment
 */

// ============================================================================
// EVIDENCE SYSTEM
// ============================================================================

export const EvidenceTypeSchema = z.enum([
  "METRIC_MEASUREMENT", // P&L, KPI, operational metric
  "DIRECT_OBSERVATION", // Observed system behavior
  "HISTORICAL_OUTCOME", // Previous similar action result
  "EXPERT_DOMAIN_KNOWLEDGE", // Domain expert input
  "CUSTOMER_FEEDBACK", // Direct customer input
  "MARKET_DATA", // Market research, pricing
  "FINANCIAL_STATEMENT", // Audited financial data
  "COMPLIANCE_REQUIREMENT", // Regulatory/contractual
  "PEER_BENCHMARK", // Industry/peer comparison
  "SIMULATION_RESULT", // Modeled/simulated outcome
  "HEURISTIC_RULE", // Rule of thumb, unvalidated
]);

export type EvidenceType = z.infer<typeof EvidenceTypeSchema>;

// Credibility weights: higher = more trustworthy evidence
export const EVIDENCE_CREDIBILITY_WEIGHT: Record<EvidenceType, number> = {
  METRIC_MEASUREMENT: 1.0, // Measured reality
  FINANCIAL_STATEMENT: 1.0, // Audited facts
  DIRECT_OBSERVATION: 0.95, // Directly observed
  COMPLIANCE_REQUIREMENT: 0.95, // Binding requirement
  HISTORICAL_OUTCOME: 0.9, // Proven before
  CUSTOMER_FEEDBACK: 0.8, // Direct but subjective
  EXPERT_DOMAIN_KNOWLEDGE: 0.75, // Expert but not proven
  MARKET_DATA: 0.7, // Third-party, may be stale
  PEER_BENCHMARK: 0.65, // Similar but not exact
  SIMULATION_RESULT: 0.6, // Modeled, not real
  HEURISTIC_RULE: 0.3, // Rule of thumb, unvalidated
};

export const EvidenceRefSchema = z.object({
  type: EvidenceTypeSchema,
  source: z.string().min(1, "Source must not be empty"),
  timestamp: z.date(),
  reference_id: z.string().optional(), // Link to metric/event/document
  quote_or_measurement: z.string().min(1, "Evidence details required"),
  freshness_days: z.number().int().min(0), // Days since measurement
  confidence_weight: z.number().min(0).max(1), // Override default credibility
});

export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;

// ============================================================================
// CONSTRAINT SYSTEM
// ============================================================================

export const ConstraintTypeSchema = z.enum([
  "CASH", // Budget available
  "STAFFING", // Team capacity
  "CALENDAR", // Timeline constraints
  "CAPACITY", // System/infrastructure limits
  "OPERATIONAL_MATURITY", // Team skill/process readiness
  "EXECUTION_COMPLEXITY", // Technical difficulty
  "REGULATORY", // Legal/compliance bounds
  "MARKET_TIMING", // Market/customer readiness
  "DEPENDENCY", // Blocked on another action
]);

export type ConstraintType = z.infer<typeof ConstraintTypeSchema>;

export const ConstraintSchema = z.object({
  type: ConstraintTypeSchema,
  description: z.string().min(1),
  limit_value: z.union([z.number(), z.string()]).optional(), // e.g., "$50k" or "3 engineers"
  status: z.enum(["HARD_LIMIT", "SOFT_LIMIT", "MONITORED"]),
  required_or_optional: z.enum(["BLOCKING", "LIMITING", "INFORMATIONAL"]),
  evidence_ref: z.string().optional(), // Link to constraint source
});

export type Constraint = z.infer<typeof ConstraintSchema>;

// ============================================================================
// CONFIDENCE & CREDIBILITY SYSTEM
// ============================================================================

export const ConfidenceStateSchema = z.enum([
  "HIGH_CONFIDENCE", // > 80% confidence, sufficient evidence
  "MEDIUM_CONFIDENCE", // 50-80% confidence, some evidence gaps
  "LOW_CONFIDENCE", // 20-50% confidence, significant gaps
  "NEED_MORE_DATA", // < 20% confidence, actionable but risky
  "CANNOT_DETERMINE", // Insufficient data to recommend
  "DANGER_DO_NOT_ACT", // Evidence suggests action is harmful
]);

export type ConfidenceState = z.infer<typeof ConfidenceStateSchema>;

export const CredibilityBreakdownSchema = z.object({
  confidence_state: ConfidenceStateSchema,
  evidence_quality_score: z.number().min(0).max(100), // Weighted average of evidence credibility
  freshness_penalty: z.number().min(0).max(1), // Decay for old evidence (0=fresh, 1=very stale)
  contradiction_penalty: z.number().min(0).max(1), // Penalty for conflicting evidence
  assumption_penalty: z.number().min(0).max(1), // Penalty for unverified assumptions
  missing_data_penalty: z.number().min(0).max(1), // Penalty for gaps
  historical_accuracy_weight: z.number().min(0).max(1), // Weight of past recommendation accuracy
  reversibility_boost: z.number().min(0).max(1), // Confidence bonus for reversible actions
  final_credibility_score: z.number().min(0).max(100),
  credibility_reason: z.string().min(1),
  missing_information: z.array(z.string()),
  contradictions_found: z.array(z.string()).optional(),
});

export type CredibilityBreakdown = z.infer<typeof CredibilityBreakdownSchema>;

// ============================================================================
// ROI & FINANCIAL SCHEMA
// ============================================================================

export const FinancialAssumptionSchema = z.object({
  assumption: z.string().min(1),
  base_value: z.number(),
  unit: z.string(), // "$/month", "units/year", etc.
  source: z.string(),
  confidence: z.number().min(0).max(1),
  sensitivity_range_low: z.number(),
  sensitivity_range_high: z.number(),
});

export type FinancialAssumption = z.infer<typeof FinancialAssumptionSchema>;

export const ROIProjectionSchema = z.object({
  formula: z.string().min(1), // Clear math: e.g., "Monthly Savings = (Users × $50/mo) - (Staff × $120k/year ÷ 12)"
  best_case_roi_percent: z.number(),
  base_case_roi_percent: z.number(),
  worst_case_roi_percent: z.number(),
  payback_period_months: z.number(),
  assumptions: z.array(FinancialAssumptionSchema),
  confidence_percent: z.number().min(0).max(100),
  uncertainty_explanation: z.string().min(1),
  sensitivity_analysis: z.record(z.string(), z.object({
    impact_on_roi: z.number(),
    realistic_range: z.tuple([z.number(), z.number()]),
  })),
});

export type ROIProjection = z.infer<typeof ROIProjectionSchema>;

// ============================================================================
// REVERSIBILITY & ROLLBACK SCHEMA
// ============================================================================

export const RollbackPlanSchema = z.object({
  reversible: z.boolean(),
  rollback_steps: z.array(z.string()).optional(),
  rollback_time_minutes: z.number().min(0).optional(),
  rollback_cost_estimate: z.string().optional(),
  rollback_data_loss_risk: z.enum(["NONE", "MINIMAL", "MODERATE", "SEVERE"]).optional(),
  cannot_reverse_reason: z.string().optional(), // If not reversible, why
  catastrophic_failure_modes: z.array(z.string()),
});

export type RollbackPlan = z.infer<typeof RollbackPlanSchema>;

// ============================================================================
// METRIC SCHEMAS
// ============================================================================

export const MetricSchema = z.object({
  name: z.string().min(1),
  unit: z.string(),
  baseline: z.number(),
  expected_change_percent: z.number(),
  expected_change_direction: z.enum(["UP", "DOWN", "STABLE"]),
  measurement_method: z.string().min(1),
  measurement_frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY"]),
});

export type Metric = z.infer<typeof MetricSchema>;

// ============================================================================
// COMPLETE RECOMMENDATION CONTRACT
// ============================================================================

export const RecommendationSchema = z.object({
  // Identity & basic info
  recommendation_id: z.string().min(1),
  workspace_id: z.string().min(1), // Multi-tenant enforcement
  issued_date: z.date(),
  issued_by: z.string(), // System or user ID
  decision_type: z.enum([
    "OPERATIONAL", // Day-to-day operational decision
    "STRATEGIC", // Long-term business direction
    "EMERGENCY", // Immediate survival action
    "OPTIMIZATION", // Performance/efficiency improvement
  ]),

  // CORE: Action & Why Now
  action: z.string().min(1, "Action must be specific and measurable"),
  why_now: z.string().min(1, "Must explain urgency/timing"),
  expected_time_to_impact: z.enum([
    "IMMEDIATE", // < 1 day
    "SHORT_TERM", // 1 week
    "MEDIUM_TERM", // 1 month
    "LONG_TERM", // > 3 months
  ]),

  // EVIDENCE: What we know and how sure we are
  evidence_refs: z.array(EvidenceRefSchema).min(1, "At least one evidence source required"),

  // CONSTRAINTS: What limits us
  constraints_considered: z.array(ConstraintSchema),

  // FINANCIAL
  roi_projection: ROIProjectionSchema.optional(),
  cost_estimate: z.object({
    amount: z.number(),
    currency: z.string(),
    confidence_percent: z.number().min(0).max(100),
    breakdown: z.record(z.string(), z.number()).optional(),
  }).optional(),
  effort_estimate: z.object({
    person_months: z.number(),
    engineering_fraction: z.number().min(0).max(1),
    other_resources: z.array(z.string()).optional(),
  }).optional(),

  // REVERSIBILITY & RISK
  reversibility: RollbackPlanSchema,
  risk_level: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  risk_description: z.string().min(1),

  // CREDIBILITY & CONFIDENCE
  credibility_breakdown: CredibilityBreakdownSchema,
  confidence_state: ConfidenceStateSchema,
  confidence_reason: z.string().min(1),

  // MEASURABILITY
  success_metric: MetricSchema,
  failure_metric: MetricSchema,
  stop_condition: z.string().min(1, "When should we stop and reassess?"),

  // REVIEW & MONITORING
  review_date: z.date(),
  monitoring_frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),

  // MISSING INFO & ASSUMPTIONS
  assumptions: z.array(z.object({
    assumption: z.string().min(1),
    verified: z.boolean(),
    can_fail: z.boolean(),
    failure_impact: z.enum(["BREAKS_RECOMMENDATION", "REDUCES_ROI", "EXTENDS_TIMELINE"]),
  })),
  missing_information: z.array(z.string()),

  // LOCALIZATION
  localization: z.object({
    geography: z.string(),
    business_scope: z.string(),
    market_assumptions: z.array(z.string()),
    local_confidence: z.number().min(0).max(1),
    expiry_date: z.date(),
  }).optional(),

  // TRACKING & AUDIT
  implementation_record: z.object({
    implemented: z.boolean(),
    implementation_date: z.date().optional(),
    operator_notes: z.string().optional(),
  }).optional(),

  prediction_vs_actual: z.object({
    predicted_impact: z.record(z.string(), z.number()).optional(),
    actual_impact: z.record(z.string(), z.number()).optional(),
    variance_percent: z.number().optional(),
    confidence_recalibrated: z.boolean().default(false),
  }).optional(),
});

export type Recommendation = z.infer<typeof RecommendationSchema>;

// ============================================================================
// RECOMMENDATION VALIDATORS
// ============================================================================

/**
 * Reject recommendations that violate operational credibility rules
 */
export function validateRecommendationCredibility(
  rec: Recommendation
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];

  // R1: Evidence is required, not optional
  if (rec.evidence_refs.length === 0) {
    violations.push("No evidence provided - recommendations must be evidence-based");
  }

  // R2: Vague language detection
  const vague_patterns = [
    /^might|^may|^could|^should|^try|^consider|^perhaps|^maybe/i,
    /\baround\b|\bapproximately\b|\broughly\b/,
    /\bsignificant|substantial|noticeable/i,
  ];

  for (const pattern of vague_patterns) {
    if (pattern.test(rec.action)) {
      violations.push(`Action contains vague language: "${rec.action}"`);
      break;
    }
    if (pattern.test(rec.why_now)) {
      violations.push(`Why-now contains vague language: "${rec.why_now}"`);
      break;
    }
  }

  // R3: High-risk actions must be reversible or have strong evidence
  if (rec.risk_level === "CRITICAL" && !rec.reversibility.reversible) {
    if (rec.credibility_breakdown.final_credibility_score < 90) {
      violations.push(
        "CRITICAL risk, non-reversible action requires > 90% confidence (you have " +
          rec.credibility_breakdown.final_credibility_score.toFixed(0) +
          "%)"
      );
    }
  }

  // R4: Unsupported confidence
  if (rec.confidence_state === "HIGH_CONFIDENCE" && rec.credibility_breakdown.final_credibility_score < 80) {
    violations.push(
      `Confidence mismatch: claimed HIGH_CONFIDENCE but credibility score is ${rec.credibility_breakdown.final_credibility_score.toFixed(0)}%`
    );
  }

  if (rec.confidence_state === "MEDIUM_CONFIDENCE" && rec.credibility_breakdown.final_credibility_score < 50) {
    violations.push(
      `Confidence mismatch: claimed MEDIUM_CONFIDENCE but credibility score is ${rec.credibility_breakdown.final_credibility_score.toFixed(0)}%`
    );
  }

  // R5: ROI must have formula
  if (rec.roi_projection && !rec.roi_projection.formula) {
    violations.push("ROI projection present but formula missing - all ROI claims must show math");
  }

  // R6: Assumptions must be explicit
  if (rec.assumptions.length === 0) {
    violations.push("No assumptions listed - all recommendations must state their assumptions");
  }

  // R7: Unverified high-impact assumptions
  for (const assumption of rec.assumptions) {
    if (!assumption.verified && assumption.failure_impact === "BREAKS_RECOMMENDATION") {
      if (rec.risk_level === "CRITICAL" || rec.confidence_state === "HIGH_CONFIDENCE") {
        violations.push(
          `Critical assumption unverified: "${assumption.assumption}" - can break the recommendation`
        );
      }
    }
  }

  // R8: Reversibility plan for non-reversible critical actions
  if (!rec.reversibility.reversible && rec.risk_level === "CRITICAL") {
    violations.push(
      `Non-reversible CRITICAL action requires clear catastrophic failure modes. You have: ${rec.reversibility.catastrophic_failure_modes.length} listed`
    );
    if (rec.reversibility.catastrophic_failure_modes.length === 0) {
      violations.push("List catastrophic failure modes for non-reversible critical actions");
    }
  }

  // R9: Cost estimate required for actions > 1 month
  if (rec.expected_time_to_impact === "LONG_TERM" && !rec.cost_estimate) {
    violations.push("Long-term action without cost estimate - required for budget planning");
  }

  // R10: Success/failure metrics must be measurable
  if (!/\b(count|percent|dollar|second|day|response|throughput|rate)\b/i.test(rec.success_metric.unit)) {
    violations.push(`Success metric unit "${rec.success_metric.unit}" may not be measurable`);
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * Check for credibility-breaking issues
 */
export function checkCredibilityBreakers(rec: Recommendation): {
  should_reject: boolean;
  reason: string;
} {
  // Cannot determine = reject until more data
  if (rec.confidence_state === "CANNOT_DETERMINE") {
    return {
      should_reject: true,
      reason: "Cannot recommend with CANNOT_DETERMINE confidence state",
    };
  }

  // Danger = do not act
  if (rec.confidence_state === "DANGER_DO_NOT_ACT") {
    return {
      should_reject: true,
      reason: "Evidence suggests action is harmful (DANGER_DO_NOT_ACT)",
    };
  }

  // Critical contradictions
  if (rec.credibility_breakdown.contradictions_found?.length ?? 0 > 0) {
    return {
      should_reject: true,
      reason: `Contradictory evidence found: ${rec.credibility_breakdown.contradictions_found?.join(", ")}`,
    };
  }

  // Stale evidence on critical decisions
  const max_evidence_age_days = rec.decision_type === "EMERGENCY" ? 1 : 30;
  const has_stale = rec.evidence_refs.some((e) => e.freshness_days > max_evidence_age_days);

  if (has_stale && rec.confidence_state === "HIGH_CONFIDENCE") {
    return {
      should_reject: true,
      reason: `Evidence is stale (> ${max_evidence_age_days} days) for claimed HIGH_CONFIDENCE`,
    };
  }

  return { should_reject: false, reason: "" };
}

/**
 * Recommendation DTO for public/operator output
 */
export const RecommendationPublicDTOSchema = RecommendationSchema.omit({
  issued_by: true, // Internal only
  prediction_vs_actual: true, // Internal tracking only
}).extend({
  // Add publicly-safe explanations
  executive_summary: z.string(),
  operator_action_required: z.string(),
});

export type RecommendationPublicDTO = z.infer<typeof RecommendationPublicDTOSchema>;
