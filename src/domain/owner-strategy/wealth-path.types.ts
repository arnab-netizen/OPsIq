/**
 * Owner Strategy (Module 8) — Wealth Path & Business Model Quality types
 * (execution.md Phase 2). Pure type definitions; no logic, no I/O.
 *
 * These types express the "cheat code" differentiator: judging whether a
 * business is structurally worth the owner's time, cash, and risk, and which
 * kind of wealth vehicle (if any) it is. All inputs are optional so the engine
 * can be honest about missing data instead of inventing facts.
 */

// ---------------------------------------------------------------------------
// Qualitative scales (deterministic, ordered low → high)
// ---------------------------------------------------------------------------

export const QUAL_LEVELS = ["none", "weak", "moderate", "strong"] as const;
export type QualLevel = (typeof QUAL_LEVELS)[number];

export const LMH_LEVELS = ["low", "medium", "high"] as const;
export type LmhLevel = (typeof LMH_LEVELS)[number];

export const REVENUE_FREQUENCIES = [
  "one_off",
  "occasional",
  "recurring",
  "subscription",
] as const;
export type RevenueFrequency = (typeof REVENUE_FREQUENCIES)[number];

/** Structural expansion path — how (and whether) the model can grow beyond one unit. */
export const EXPANSION_PATHS = [
  "none",
  "local",
  "multi_unit",
  "asset_light_scalable",
  "product",
  "marketplace",
] as const;
export type ExpansionPath = (typeof EXPANSION_PATHS)[number];

// ---------------------------------------------------------------------------
// Wealth path taxonomy (execution.md Phase 2 — the 10 required categories)
// ---------------------------------------------------------------------------

export const WEALTH_PATH_TYPES = [
  "survival_cashflow_business",
  "local_profit_business",
  "multi_unit_scalable_business",
  "asset_light_scalable_service",
  "technology_product_business",
  "marketplace_aggregator_business",
  "strategic_stepping_stone",
  "owner_dependent_job",
  "dead_end_business",
  "trap_business",
] as const;
export type WealthPathType = (typeof WEALTH_PATH_TYPES)[number];

/** Strategic options OpsIQ is allowed to recommend (Amendment Rule K). */
export const STRATEGIC_OPTIONS = [
  "continue",
  "stabilize",
  "validate",
  "pivot",
  "pause",
  "sell",
  "exit",
  "stop_investing",
  "cashflow_only",
  "redirect",
] as const;
export type StrategicOption = (typeof STRATEGIC_OPTIONS)[number];

export const BMQ_TIERS = ["weak", "moderate", "strong", "exceptional"] as const;
export type BmqTier = (typeof BMQ_TIERS)[number];

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/**
 * Structural business-model signals. Every field is optional: absence is
 * recorded as missing data (never invented). Numbers that are NaN/Infinity are
 * treated as missing.
 */
export interface WealthPathInput {
  // Economics
  grossMarginPct?: number | null; // 0..100
  netMarginPct?: number | null; // after overhead; may be negative
  monthlyRevenue?: number | null;
  cashRunwayMonths?: number | null;
  timeToCashMonths?: number | null;

  // Demand durability
  revenueFrequency?: RevenueFrequency | null;
  repeatCustomerPct?: number | null; // 0..100
  customerAcquisitionDifficulty?: LmhLevel | null;
  demandValidated?: boolean | null;

  // Owner dependency (owner-job detection)
  ownerIsPrimaryOperator?: boolean | null;
  staffCanRunWithoutOwner?: boolean | null;
  ownerHoursPerWeek?: number | null;

  // Structural strength
  differentiation?: QualLevel | null;
  pricingPower?: QualLevel | null;
  competitiveMoat?: QualLevel | null;
  expansionPath?: ExpansionPath | null;

  // Risk / capital
  capitalIntensity?: LmhLevel | null;
  workingCapitalPressure?: LmhLevel | null;
  downsideRisk?: LmhLevel | null;
  regulatoryBurden?: LmhLevel | null;

  // Trajectory
  trendDeclining?: boolean | null;
}

// ---------------------------------------------------------------------------
// Business Model Quality result (Score-Integrity Rule D disclosure)
// ---------------------------------------------------------------------------

export interface BmqDimensionScore {
  dimension: string;
  score: number; // 0..100
  weight: number; // 0..1
  basis: string; // which inputs drove it / default note
}

export interface BusinessModelQualityResult {
  score: number; // 0..100 weighted
  tier: BmqTier;
  dimensions: BmqDimensionScore[];
  inputsUsed: string[];
  missingInputs: string[];
  assumptions: string[];
  confidence: number; // 0..1
  provisionalLowConfidence: boolean;
  dataSource: "owner_reported_structural_signals";
  rubric: string;
  whatWouldChangeResult: string[];
}

// ---------------------------------------------------------------------------
// Wealth Path result
// ---------------------------------------------------------------------------

export interface WealthPathResult {
  pathType: WealthPathType;
  label: string;
  rationale: string;
  quality: BusinessModelQualityResult;
  evidence: string[];
  missingInputs: string[];
  confidence: number; // 0..1
  provisionalLowConfidence: boolean;
  strategicOptions: StrategicOption[];
  warnings: string[];
  /** True when the structural data is too thin to drive high-risk execution. */
  blocksHighRiskExecution: boolean;
  whatWouldChangeResult: string[];
}
