/**
 * Business Condition Model Foundation
 *
 * Models the complete business condition across 4 dimensions:
 * 1. Financial Health (revenue, expenses, cash, runway, margins)
 * 2. Owner Constraints (availability, commitment, capability, health)
 * 3. Capacity Profile (team size, capability levels, key person dependency)
 * 4. Customer Health (retention, satisfaction, acquisition cost, market position)
 *
 * Used to assess feasibility of recommendations and interventions.
 */

import { z } from "zod";

/**
 * Financial health assessment levels
 */
export enum FinancialHealth {
  CRITICAL = "critical", // <0 months runway or negative cash
  STRESSED = "stressed", // 1-3 months runway
  STABLE = "stable", // 6-12 months runway
  HEALTHY = "healthy", // 12+ months runway
  THRIVING = "thriving", // 18+ months runway + growth
}

/**
 * Financial metrics for business
 */
export const FinancialsSchema = z.object({
  monthlyRecurringRevenue: z.number().min(0).describe("MRR in local currency"),
  monthlyExpenses: z.number().min(0).describe("Fixed + variable monthly costs"),
  cashOnHand: z.number().describe("Current bank balance (can be negative)"),
  burnRate: z.number().min(0).describe("Monthly burn if no revenue"),
  cashRunwayMonths: z.number().min(0).describe("Months until out of cash at current burn"),
  grossMargin: z.number().min(0).max(100).describe("Percentage (0-100)"),
  operatingMargin: z.number().min(-100).max(100).describe("Percentage, can be negative"),
  debtOutstanding: z.number().min(0).optional().describe("Total outstanding debt"),
  customerConcentration: z
    .number()
    .min(0)
    .max(100)
    .describe("Top customer as % of revenue (0-100)"),
  lastUpdated: z.date(),
  dataSource: z.enum(["accounting_software", "bank_api", "manual_entry", "estimate"]),
});

export type Financials = z.infer<typeof FinancialsSchema>;

/**
 * Owner availability and commitment levels
 */
export enum OwnerAvailability {
  UNAVAILABLE = "unavailable", // Not engaged
  LIMITED = "limited", // <10 hrs/week
  PART_TIME = "part_time", // 10-30 hrs/week
  FULL_TIME = "full_time", // 30+ hrs/week
}

export enum OwnerCommitment {
  UNCOMMITTED = "uncommitted", // Considering exit
  CONDITIONAL = "conditional", // Committed if conditions met
  COMMITTED = "committed", // Actively engaged
  RELENTLESS = "relentless", // Obsessed, won't give up
}

/**
 * Owner constraints and health
 */
export const OwnerSchema = z.object({
  availability: z.nativeEnum(OwnerAvailability),
  commitment: z.nativeEnum(OwnerCommitment),
  capabilityLevel: z.enum(["weak", "developing", "capable", "strong", "exceptional"]),
  isBottleneck: z.boolean().describe("Owner is critical path for key decisions"),
  burnoutRisk: z.number().min(0).max(100).describe("Subjective burnout likelihood 0-100"),
  hasSuccessor: z.boolean().describe("Is there a documented successor or co-founder"),
  recentMajorLoss: z.boolean().optional().describe("Recent departure of key person"),
  healthStatus: z.enum(["critical", "stressed", "stable", "healthy"]).optional(),
  lastAssessmentAt: z.date(),
});

export type Owner = z.infer<typeof OwnerSchema>;

/**
 * Team capability levels
 */
export enum TeamCapability {
  MINIMAL = "minimal", // Founder only, no team
  EMERGING = "emerging", // <3 people, learning together
  COMPETENT = "competent", // 3-10 people, proven skill
  STRONG = "strong", // 10+ people, specialized roles
  EXCEPTIONAL = "exceptional", // 20+ people, mature organization
}

/**
 * Capacity and team structure
 */
export const CapacitySchema = z.object({
  teamSize: z.number().int().min(0),
  capabilityLevel: z.nativeEnum(TeamCapability),
  engineeringCapability: z.enum(["minimal", "emerging", "competent", "strong"]),
  productCapability: z.enum(["minimal", "emerging", "competent", "strong"]),
  salesCapability: z.enum(["minimal", "emerging", "competent", "strong"]),
  operationsCapability: z.enum(["minimal", "emerging", "competent", "strong"]),
  keyPersonDependency: z.array(z.string()).describe("Names of critical roles"),
  turnoverRate: z
    .number()
    .min(0)
    .max(100)
    .describe("Annual turnover percentage (0-100)"),
  recentHires: z.number().int().min(0).describe("Hires in last 3 months"),
  recentDepartures: z.number().int().min(0).describe("Departures in last 3 months"),
  culturHealth: z.enum(["toxic", "poor", "neutral", "good", "excellent"]),
});

export type Capacity = z.infer<typeof CapacitySchema>;

/**
 * Customer health and market position
 */
export const CustomerSchema = z.object({
  totalCustomers: z.number().int().min(0),
  activeCustomers: z.number().int().min(0),
  monthlyChurn: z.number().min(0).max(100).describe("Percentage 0-100"),
  netRetentionRate: z
    .number()
    .min(0)
    .max(200)
    .describe("Percentage, >100 = upsell/expansion"),
  npsScore: z
    .number()
    .min(-100)
    .max(100)
    .describe("Net Promoter Score (-100 to +100)"),
  customerAcquisitionCost: z.number().min(0),
  customerLifetimeValue: z.number().min(0),
  paybackMonths: z
    .number()
    .min(0)
    .describe("Months to recover CAC from single customer"),
  marketShare: z
    .number()
    .min(0)
    .max(100)
    .describe("Estimated market share percentage"),
  marketPosition: z.enum(["lost", "weak", "viable", "strong", "dominant"]),
  competitiveAdvantage: z
    .array(z.string())
    .describe("List of distinct advantages vs competitors"),
  lastAssessmentAt: z.date(),
});

export type Customer = z.infer<typeof CustomerSchema>;

/**
 * KPI definition for tracking business progress
 */
export const KPISchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  engagementId: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  category: z.enum([
    "financial",
    "customer",
    "operational",
    "product",
    "market",
    "team",
  ]),
  unit: z.string().describe("e.g., '$', '%', 'users', 'days'"),
  targetValue: z.number(),
  currentValue: z.number(),
  trend: z.enum(["improving", "stagnant", "declining"]),
  historicalValues: z
    .array(
      z.object({
        value: z.number(),
        recordedAt: z.date(),
      })
    )
    .optional(),
  isLeading: z.boolean().describe("Leading indicator (predictive)"),
  isLagging: z.boolean().describe("Lagging indicator (historical)"),
  frequency: z.enum(["daily", "weekly", "monthly", "quarterly"]),
  owner: z.string().describe("Name or team responsible"),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type KPI = z.infer<typeof KPISchema>;

/**
 * Complete business condition profile combining all dimensions
 */
export const BusinessConditionSchema = z.object({
  workspaceId: z.string().uuid(),
  engagementId: z.string().uuid(),
  assessedAt: z.date(),
  assessedByUserId: z.string().uuid(),
  financials: FinancialsSchema,
  owner: OwnerSchema,
  capacity: CapacitySchema,
  customer: CustomerSchema,
  overallHealth: z.enum(["critical", "stressed", "stable", "healthy", "thriving"]),
  riskFactors: z.array(z.string()).describe("Key risks identified"),
  strengths: z.array(z.string()).describe("Key strengths"),
  nextReviewAt: z.date().optional(),
});

export type BusinessCondition = z.infer<typeof BusinessConditionSchema>;

/**
 * Assess overall health based on financial runway
 */
export function assessFinancialHealth(financials: Financials): FinancialHealth {
  const { cashRunwayMonths } = financials;

  if (cashRunwayMonths < 1) return FinancialHealth.CRITICAL;
  if (cashRunwayMonths < 3) return FinancialHealth.STRESSED;
  if (cashRunwayMonths < 12) return FinancialHealth.STABLE;
  if (cashRunwayMonths < 18) return FinancialHealth.HEALTHY;
  return FinancialHealth.THRIVING;
}

/**
 * Score owner health on 0-100 scale
 */
export function scoreOwnerHealth(owner: Owner): number {
  let score = 50; // base score

  // Availability impact
  if (owner.availability === OwnerAvailability.FULL_TIME) {
    score += 15;
  } else if (owner.availability === OwnerAvailability.PART_TIME) {
    score += 5;
  }

  // Commitment impact
  if (owner.commitment === OwnerCommitment.RELENTLESS) {
    score += 20;
  } else if (owner.commitment === OwnerCommitment.COMMITTED) {
    score += 10;
  } else if (owner.commitment === OwnerCommitment.UNCOMMITTED) {
    score -= 20;
  }

  // Bottleneck penalty
  if (owner.isBottleneck) {
    score -= 10;
  }

  // Burnout risk penalty
  score -= owner.burnoutRisk * 0.5;

  // No successor penalty
  if (!owner.hasSuccessor) {
    score -= 10;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Score team capability on 0-100 scale
 */
export function scoreTeamCapability(capacity: Capacity): number {
  let score = 0;

  switch (capacity.capabilityLevel) {
    case TeamCapability.EXCEPTIONAL:
      score = 95;
      break;
    case TeamCapability.STRONG:
      score = 75;
      break;
    case TeamCapability.COMPETENT:
      score = 50;
      break;
    case TeamCapability.EMERGING:
      score = 25;
      break;
    case TeamCapability.MINIMAL:
      score = 5;
      break;
  }

  // Adjust for turnover
  const turnoverPenalty = capacity.turnoverRate * 0.3;
  score = Math.max(0, score - turnoverPenalty);

  // Adjust for recent departures vs hires
  const netChange = capacity.recentHires - capacity.recentDepartures;
  if (netChange < 0) {
    score -= 5;
  }

  // Culture health multiplier
  const cultureMultiplier =
    capacity.culturHealth === "excellent"
      ? 1.1
      : capacity.culturHealth === "toxic"
        ? 0.7
        : 1.0;
  score = score * cultureMultiplier;

  return Math.round(Math.max(0, Math.min(100, score)));
}

/**
 * Score customer health on 0-100 scale
 */
export function scoreCustomerHealth(customer: Customer): number {
  let score = 50; // base score

  // NPS impact (strong indicator of health)
  if (customer.npsScore >= 50) score += 20;
  else if (customer.npsScore >= 0) score += 10;
  else if (customer.npsScore < -20) score -= 20;

  // Retention impact
  if (customer.monthlyChurn <= 2) score += 15;
  else if (customer.monthlyChurn <= 5) score += 5;
  else if (customer.monthlyChurn > 10) score -= 15;

  // Net retention impact
  if (customer.netRetentionRate > 110) score += 15;
  else if (customer.netRetentionRate < 85) score -= 10;

  // Market position impact
  switch (customer.marketPosition) {
    case "dominant":
      score += 20;
      break;
    case "strong":
      score += 10;
      break;
    case "weak":
      score -= 10;
      break;
    case "lost":
      score -= 30;
      break;
  }

  return Math.round(Math.max(0, Math.min(100, score)));
}

/**
 * Calculate overall business health (0-100)
 */
export function calculateOverallHealth(
  condition: Omit<BusinessCondition, "overallHealth">
): number {
  const financialScore = condition.financials.burnRate > 0 ? 30 : 70;
  const ownerScore = scoreOwnerHealth(condition.owner);
  const teamScore = scoreTeamCapability(condition.capacity);
  const customerScore = scoreCustomerHealth(condition.customer);

  // Weighted average (financials most critical for survival)
  const overall =
    financialScore * 0.35 + ownerScore * 0.25 + teamScore * 0.2 + customerScore * 0.2;

  return Math.round(overall);
}

/**
 * Determine overall health status from score
 */
export function healthScoreToStatus(
  score: number
): "critical" | "stressed" | "stable" | "healthy" | "thriving" {
  if (score < 20) return "critical";
  if (score < 40) return "stressed";
  if (score < 60) return "stable";
  if (score < 80) return "healthy";
  return "thriving";
}

/**
 * Identify key risk factors
 */
export function identifyRiskFactors(condition: BusinessCondition): string[] {
  const risks: string[] = [];

  // Financial risks
  if (condition.financials.cashRunwayMonths < 3) {
    risks.push("Critical cash runway (<3 months)");
  }
  if (condition.financials.burnRate > condition.financials.monthlyRecurringRevenue) {
    risks.push("Burn exceeds revenue");
  }
  if (condition.financials.customerConcentration > 50) {
    risks.push("High customer concentration (>50%)");
  }

  // Owner risks
  if (condition.owner.availability === OwnerAvailability.UNAVAILABLE) {
    risks.push("Owner unavailable");
  }
  if (condition.owner.commitment === OwnerCommitment.UNCOMMITTED) {
    risks.push("Owner uncommitted");
  }
  if (condition.owner.burnoutRisk > 75) {
    risks.push("High burnout risk");
  }
  if (condition.owner.isBottleneck && !condition.owner.hasSuccessor) {
    risks.push("Key person without successor");
  }

  // Team risks
  if (
    condition.capacity.capabilityLevel === TeamCapability.MINIMAL ||
    condition.capacity.capabilityLevel === TeamCapability.EMERGING
  ) {
    risks.push("Limited team capability");
  }
  if (condition.capacity.turnoverRate > 25) {
    risks.push("High turnover rate (>25% annually)");
  }
  if (condition.capacity.recentDepartures > 2) {
    risks.push("Recent key departures");
  }

  // Customer risks
  if (condition.customer.monthlyChurn > 10) {
    risks.push("High churn (>10% monthly)");
  }
  if (condition.customer.npsScore < -20) {
    risks.push("Poor NPS (<-20)");
  }
  if (condition.customer.marketPosition === "lost" || condition.customer.marketPosition === "weak") {
    risks.push("Weak market position");
  }

  return risks;
}

/**
 * Identify key strengths
 */
export function identifyStrengths(condition: BusinessCondition): string[] {
  const strengths: string[] = [];

  // Financial strengths
  if (condition.financials.cashRunwayMonths > 12) {
    strengths.push("Strong cash position (>12 months)");
  }
  if (condition.financials.operatingMargin > 20) {
    strengths.push("Healthy operating margin (>20%)");
  }
  if (condition.customer.netRetentionRate > 110) {
    strengths.push("Expansion revenue (NRR >110%)");
  }

  // Owner strengths
  if (
    condition.owner.commitment === OwnerCommitment.RELENTLESS ||
    condition.owner.commitment === OwnerCommitment.COMMITTED
  ) {
    strengths.push("Committed founder");
  }
  if (condition.owner.capabilityLevel === "exceptional" || condition.owner.capabilityLevel === "strong") {
    strengths.push("Experienced founder");
  }
  if (condition.owner.hasSuccessor) {
    strengths.push("Leadership succession plan");
  }

  // Team strengths
  if (
    condition.capacity.capabilityLevel === TeamCapability.STRONG ||
    condition.capacity.capabilityLevel === TeamCapability.EXCEPTIONAL
  ) {
    strengths.push("Strong team capability");
  }
  if (condition.capacity.culturHealth === "excellent") {
    strengths.push("Excellent team culture");
  }
  if (condition.capacity.turnoverRate < 10) {
    strengths.push("Low turnover (<10% annually)");
  }

  // Customer strengths
  if (condition.customer.npsScore > 50) {
    strengths.push("Strong NPS (>50)");
  }
  if (
    condition.customer.marketPosition === "dominant" ||
    condition.customer.marketPosition === "strong"
  ) {
    strengths.push("Strong market position");
  }
  if (condition.customer.competitiveAdvantage && condition.customer.competitiveAdvantage.length > 0) {
    strengths.push(`Clear competitive advantages: ${condition.customer.competitiveAdvantage.slice(0, 2).join(", ")}`);
  }

  return strengths;
}

/**
 * Recommendation hardening context derived from business condition.
 *
 * This is the service/domain-level safety contract that recommendation
 * surfaces consume: it converts an existing business-condition assessment
 * into deterministic recommendation safety pressure. Weaker conditions
 * produce stronger hardening (more caution, reduced confidence); stronger
 * conditions produce lighter hardening (the business can absorb more
 * implementation risk).
 *
 * It performs no DB writes, no route/workspace lookups, no AI calls, and has
 * no side effects. Same input always produces the same output.
 */
export type HardeningPressure = "minimal" | "low" | "normal" | "high" | "maximum";

export type RecommendationRiskAdjustment =
  | "minimal"
  | "low"
  | "neutral"
  | "medium_high"
  | "high";

export type ConfidenceAdjustment =
  | "maintain_or_increase"
  | "maintain"
  | "neutral"
  | "reduce"
  | "strongly_reduce";

export type CautionLevel =
  | "low"
  | "standard"
  | "elevated_caution"
  | "manual_review_required";

export type ConditionStatus =
  | "critical"
  | "stressed"
  | "stable"
  | "healthy"
  | "thriving";

export interface BusinessConditionHardeningContext {
  conditionStatus: ConditionStatus;
  conditionScore: number;
  hardeningPressure: HardeningPressure;
  recommendationRiskAdjustment: RecommendationRiskAdjustment;
  confidenceAdjustment: ConfidenceAdjustment;
  cautionLevel: CautionLevel;
  reasons: string[];
  strengths: string[];
}

/**
 * Explicit, deterministic mapping from condition status to hardening signals.
 * Keyed by every member of ConditionStatus so the mapping is total.
 */
const HARDENING_BY_STATUS: Record<
  ConditionStatus,
  Pick<
    BusinessConditionHardeningContext,
    | "hardeningPressure"
    | "recommendationRiskAdjustment"
    | "confidenceAdjustment"
    | "cautionLevel"
  >
> = {
  critical: {
    hardeningPressure: "maximum",
    recommendationRiskAdjustment: "high",
    confidenceAdjustment: "strongly_reduce",
    cautionLevel: "manual_review_required",
  },
  stressed: {
    hardeningPressure: "high",
    recommendationRiskAdjustment: "medium_high",
    confidenceAdjustment: "reduce",
    cautionLevel: "elevated_caution",
  },
  stable: {
    hardeningPressure: "normal",
    recommendationRiskAdjustment: "neutral",
    confidenceAdjustment: "neutral",
    cautionLevel: "standard",
  },
  healthy: {
    hardeningPressure: "low",
    recommendationRiskAdjustment: "low",
    confidenceAdjustment: "maintain",
    cautionLevel: "standard",
  },
  thriving: {
    hardeningPressure: "minimal",
    recommendationRiskAdjustment: "minimal",
    confidenceAdjustment: "maintain_or_increase",
    cautionLevel: "low",
  },
};

/**
 * Convert an existing business-condition assessment into recommendation
 * hardening context.
 *
 * Reuses the existing scoring/status/risk/strength primitives so there is a
 * single source of truth for condition severity. The status-driven mapping
 * means financial distress and owner/team weakness raise hardening indirectly
 * by lowering the overall condition score, while strong conditions lighten it.
 */
export function evaluateBusinessConditionHardeningContext(
  condition: Omit<BusinessCondition, "overallHealth">
): BusinessConditionHardeningContext {
  const conditionScore = calculateOverallHealth(condition);
  const conditionStatus = healthScoreToStatus(conditionScore);

  // identifyRiskFactors/identifyStrengths read the four dimensions only; the
  // overallHealth field is supplied for type completeness, not branched on.
  const fullCondition: BusinessCondition = {
    ...condition,
    overallHealth: conditionStatus,
  };

  const reasons = identifyRiskFactors(fullCondition);
  const strengths = identifyStrengths(fullCondition);

  const mapping = HARDENING_BY_STATUS[conditionStatus];

  return {
    conditionStatus,
    conditionScore,
    hardeningPressure: mapping.hardeningPressure,
    recommendationRiskAdjustment: mapping.recommendationRiskAdjustment,
    confidenceAdjustment: mapping.confidenceAdjustment,
    cautionLevel: mapping.cautionLevel,
    reasons,
    strengths,
  };
}

/**
 * Persisted business-condition profile, expressed structurally.
 *
 * This mirrors the categorical shape persisted by the business-condition
 * service (and the BusinessConditionProfile Prisma model) WITHOUT importing
 * Prisma/service types, so the domain layer stays infrastructure-free. All
 * fields are optional/nullable because the adapter must tolerate partial or
 * absent records. Note: the persisted profile carries engagementId but NOT a
 * workspaceId (workspace is reached via the engagement relation).
 */
export interface ConditionProfileLike {
  engagementId?: string | null;
  businessStatus?: string | null;
  severityScore?: number | null;
  urgencyLevel?: string | null;
  cashPressureLevel?: string | null;
  marginPressureLevel?: string | null;
  clientConcentrationRisk?: string | null;
  ownerDependencyRisk?: string | null;
  keyPersonDependencyRisk?: string | null;
  processMaturityLevel?: string | null;
  managementMaturityLevel?: string | null;
  executionCapacityLevel?: string | null;
  moralFragilityLevel?: string | null;
  resilienceLevel?: string | null;
  growthReadinessLevel?: string | null;
}

/**
 * Hardening context derived from a persisted profile. Superset of
 * BusinessConditionHardeningContext (so it is assignable wherever the base
 * context is consumed) plus provenance/quality metadata.
 */
export interface ProfileHardeningContext extends BusinessConditionHardeningContext {
  /**
   * Whether a usable persisted profile was supplied. When false, the context
   * is a deliberate caution-preserving default rather than a real assessment.
   */
  sufficientData: boolean;
  /** Surfaced from the persisted profile when present (no workspaceId is stored on the profile). */
  engagementId?: string | null;
}

/** Severity ordering of condition statuses, worst → best. */
const CONDITION_STATUS_SEVERITY_ORDER: ConditionStatus[] = [
  "critical",
  "stressed",
  "stable",
  "healthy",
  "thriving",
];

/**
 * Explicit mapping from the persisted businessStatus vocabulary
 * (BUSINESS_CONDITION_RATINGS: critical | distressed | challenged | stable |
 * improving | strong) onto the domain ConditionStatus
 * (critical | stressed | stable | healthy | thriving).
 */
const BUSINESS_STATUS_TO_CONDITION_STATUS: Record<string, ConditionStatus> = {
  critical: "critical",
  distressed: "stressed",
  challenged: "stressed",
  stable: "stable",
  improving: "healthy",
  strong: "thriving",
};

/**
 * Representative score for each status band, used only so the derived
 * conditionScore stays consistent with healthScoreToStatus(conditionScore).
 * This is a band midpoint, NOT a fabricated precise health score.
 */
const CONDITION_STATUS_BAND_SCORE: Record<ConditionStatus, number> = {
  critical: 10,
  stressed: 30,
  stable: 50,
  healthy: 70,
  thriving: 90,
};

/** Return the worse (more severe) of two statuses; never softens. */
function worseConditionStatus(a: ConditionStatus, b: ConditionStatus): ConditionStatus {
  return CONDITION_STATUS_SEVERITY_ORDER.indexOf(a) <=
    CONDITION_STATUS_SEVERITY_ORDER.indexOf(b)
    ? a
    : b;
}

function isHighPressure(value?: string | null): boolean {
  return value === "high" || value === "critical";
}

/**
 * Derive recommendation hardening context from a PERSISTED categorical
 * business-condition profile (or null/undefined).
 *
 * This bridges the persisted profile shape — which is all production currently
 * stores — onto the existing status→hardening mapping, reusing the single
 * source of truth (HARDENING_BY_STATUS). It does NOT fabricate the rich domain
 * BusinessCondition; it derives a ConditionStatus directly from the stored
 * categorical signals.
 *
 * Deterministic. No DB reads/writes, no route/workspace lookups, no AI, no
 * side effects. When the profile is missing/insufficient it returns a
 * caution-preserving default so absence of data never reads as confidence.
 */
export function deriveHardeningContextFromConditionProfile(
  profile: ConditionProfileLike | null | undefined
): ProfileHardeningContext {
  const hasStatus =
    typeof profile?.businessStatus === "string" &&
    profile.businessStatus.trim().length > 0;
  const hasSeverity =
    typeof profile?.severityScore === "number" &&
    Number.isFinite(profile.severityScore);

  // Insufficient data → caution-preserving default (no false confidence).
  if (!profile || (!hasStatus && !hasSeverity)) {
    const fallback = HARDENING_BY_STATUS.stressed;
    return {
      conditionStatus: "stressed",
      conditionScore: CONDITION_STATUS_BAND_SCORE.stressed,
      hardeningPressure: fallback.hardeningPressure,
      recommendationRiskAdjustment: fallback.recommendationRiskAdjustment,
      confidenceAdjustment: fallback.confidenceAdjustment,
      cautionLevel: fallback.cautionLevel,
      reasons: [
        "Insufficient condition data: no current business condition profile available; defaulting to elevated caution",
      ],
      strengths: [],
      sufficientData: false,
      engagementId: profile?.engagementId ?? null,
    };
  }

  // Base status from the persisted businessStatus (default to stressed when the
  // status is absent or unrecognised — caution over confidence).
  let status: ConditionStatus = hasStatus
    ? BUSINESS_STATUS_TO_CONDITION_STATUS[
        profile.businessStatus!.trim().toLowerCase()
      ] ?? "stressed"
    : "stressed";

  // Escalate (never soften) on severity and pressure/dependency/maturity signals.
  const severity = hasSeverity ? (profile.severityScore as number) : undefined;
  if (severity !== undefined) {
    if (severity >= 9) status = worseConditionStatus(status, "critical");
    else if (severity >= 7) status = worseConditionStatus(status, "stressed");
    else if (severity >= 5) status = worseConditionStatus(status, "stable");
  }

  if (profile.cashPressureLevel === "critical")
    status = worseConditionStatus(status, "critical");
  else if (isHighPressure(profile.cashPressureLevel))
    status = worseConditionStatus(status, "stressed");

  if (isHighPressure(profile.marginPressureLevel))
    status = worseConditionStatus(status, "stressed");
  if (profile.urgencyLevel === "critical")
    status = worseConditionStatus(status, "stressed");

  if (profile.ownerDependencyRisk === "critical")
    status = worseConditionStatus(status, "stressed");
  else if (isHighPressure(profile.ownerDependencyRisk))
    status = worseConditionStatus(status, "stable");

  if (profile.keyPersonDependencyRisk === "critical")
    status = worseConditionStatus(status, "stressed");
  else if (isHighPressure(profile.keyPersonDependencyRisk))
    status = worseConditionStatus(status, "stable");

  if (isHighPressure(profile.clientConcentrationRisk))
    status = worseConditionStatus(status, "stable");

  const lowMaturity =
    profile.processMaturityLevel === "low" ||
    profile.managementMaturityLevel === "low" ||
    profile.executionCapacityLevel === "low" ||
    profile.resilienceLevel === "low" ||
    profile.growthReadinessLevel === "low";
  if (lowMaturity) status = worseConditionStatus(status, "stable");
  if (profile.moralFragilityLevel === "high")
    status = worseConditionStatus(status, "stable");

  // Reasons (risk-side signals).
  const reasons: string[] = [];
  if (hasStatus && ["critical", "distressed", "challenged"].includes(
    profile.businessStatus!.trim().toLowerCase()
  )) {
    reasons.push(`Business status: ${profile.businessStatus!.trim().toLowerCase()}`);
  }
  if (severity !== undefined && severity >= 7) {
    reasons.push(`Elevated severity score (${severity}/10)`);
  }
  if (isHighPressure(profile.cashPressureLevel)) {
    reasons.push(`Cash pressure: ${profile.cashPressureLevel}`);
  }
  if (isHighPressure(profile.marginPressureLevel)) {
    reasons.push(`Margin pressure: ${profile.marginPressureLevel}`);
  }
  if (profile.urgencyLevel === "critical") {
    reasons.push("Critical urgency");
  }
  if (isHighPressure(profile.ownerDependencyRisk)) {
    reasons.push(`Owner dependency risk: ${profile.ownerDependencyRisk}`);
  }
  if (isHighPressure(profile.keyPersonDependencyRisk)) {
    reasons.push(`Key-person dependency risk: ${profile.keyPersonDependencyRisk}`);
  }
  if (isHighPressure(profile.clientConcentrationRisk)) {
    reasons.push(`Client concentration risk: ${profile.clientConcentrationRisk}`);
  }
  if (profile.processMaturityLevel === "low") reasons.push("Weak process maturity");
  if (profile.managementMaturityLevel === "low")
    reasons.push("Weak management maturity");
  if (profile.executionCapacityLevel === "low")
    reasons.push("Weak execution capacity");
  if (profile.resilienceLevel === "low") reasons.push("Weak resilience");
  if (profile.growthReadinessLevel === "low") reasons.push("Weak growth readiness");
  if (profile.moralFragilityLevel === "high") reasons.push("High morale fragility");

  // Strengths (confidence-side signals).
  const strengths: string[] = [];
  if (hasStatus && ["improving", "strong"].includes(
    profile.businessStatus!.trim().toLowerCase()
  )) {
    strengths.push(`Business status: ${profile.businessStatus!.trim().toLowerCase()}`);
  }
  if (severity !== undefined && severity <= 3) {
    strengths.push(`Low severity score (${severity}/10)`);
  }
  if (profile.cashPressureLevel === "low") strengths.push("Low cash pressure");
  if (profile.ownerDependencyRisk === "low") strengths.push("Low owner dependency risk");
  if (profile.keyPersonDependencyRisk === "low")
    strengths.push("Low key-person dependency risk");
  if (profile.processMaturityLevel === "high") strengths.push("Strong process maturity");
  if (profile.managementMaturityLevel === "high")
    strengths.push("Strong management maturity");
  if (profile.executionCapacityLevel === "high")
    strengths.push("Strong execution capacity");
  if (profile.resilienceLevel === "high") strengths.push("Strong resilience");
  if (profile.growthReadinessLevel === "high") strengths.push("Growth ready");

  const mapping = HARDENING_BY_STATUS[status];

  return {
    conditionStatus: status,
    conditionScore: CONDITION_STATUS_BAND_SCORE[status],
    hardeningPressure: mapping.hardeningPressure,
    recommendationRiskAdjustment: mapping.recommendationRiskAdjustment,
    confidenceAdjustment: mapping.confidenceAdjustment,
    cautionLevel: mapping.cautionLevel,
    reasons,
    strengths,
    sufficientData: true,
    engagementId: profile.engagementId ?? null,
  };
}
