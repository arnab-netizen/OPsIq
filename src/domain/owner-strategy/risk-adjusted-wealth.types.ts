/**
 * Owner Strategy — Risk-Adjusted Wealth Score + Opportunity Cost Review types
 * (execution.md Phase 3). Pure type definitions.
 *
 * These rank major actions/paths by risk-adjusted probability of wealth, not by
 * excitement or surface growth, and compare a proposed action against realistic
 * alternatives so a boring high-probability action can beat an exciting
 * low-evidence one.
 */
import type { LmhLevel, QualLevel } from "./wealth-path.types";

/** Realistic action/path kinds to compare (execution.md Phase 3 opportunity-cost list). */
export const ACTION_KINDS = [
  "preserve_cash",
  "reduce_debt",
  "fix_operations",
  "customer_retention",
  "sales_followup",
  "marketing",
  "staff_training",
  "equipment_purchase",
  "hiring",
  "expansion",
  "new_business",
  "owner_skill_building",
  "do_nothing",
  "other",
] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

/** Signals for one action/path. All optional → honest about missing data. */
export interface RiskAdjustedWealthInput {
  label: string;
  kind?: ActionKind | null;

  // Upside signals (higher = better)
  marketDemand?: LmhLevel | null;
  grossMarginPotentialPct?: number | null;
  netMarginPotentialPct?: number | null;
  cashConversion?: LmhLevel | null; // higher = faster cash back
  repeatPurchasePotential?: LmhLevel | null;
  pricingPower?: QualLevel | null;
  scalability?: LmhLevel | null;
  exitAssetValue?: LmhLevel | null;
  localMarketFit?: LmhLevel | null;

  // Risk / cost signals
  competitionIntensity?: LmhLevel | null; // higher = worse
  differentiationPossibility?: QualLevel | null; // higher = better (reduces risk)
  ownerWorkloadDependency?: LmhLevel | null; // higher = worse
  staffProcessRepeatability?: LmhLevel | null; // higher = better (reduces risk)
  capitalRequirement?: LmhLevel | null; // higher = worse
  paybackPeriodMonths?: number | null; // longer = worse
  downsideRisk?: LmhLevel | null; // higher = worse
  legalComplianceBurden?: LmhLevel | null; // higher = worse
  salesDifficulty?: LmhLevel | null; // higher = worse
  operationalComplexity?: LmhLevel | null; // higher = worse
  timeToFirstRevenueMonths?: number | null; // longer = worse

  // Evidence backing (drives the confidence weighting)
  evidenceStrength?: LmhLevel | null;
}

export interface RiskAdjustedWealthResult {
  label: string;
  kind: ActionKind;
  upsideScore: number; // 0..100 raw expected value
  safetyScore: number; // 0..100 (100 − risk)
  rawScore: number; // 0..100 blended upside + safety (before confidence weighting)
  confidence: number; // 0..1 (evidence strength + input completeness)
  provisionalLowConfidence: boolean;
  riskAdjustedScore: number; // 0..100 confidence-weighted — the ranking number
  inputsUsed: string[];
  missingInputs: string[];
  drivers: string[]; // notable positive/negative drivers
  rubric: string;
  whatWouldChangeResult: string[];
}

export interface OpportunityCostInput {
  proposed: RiskAdjustedWealthInput;
  alternatives: RiskAdjustedWealthInput[];
}

export interface RankedActionScore {
  label: string;
  kind: ActionKind;
  riskAdjustedScore: number;
  confidence: number;
  provisionalLowConfidence: boolean;
}

export interface OpportunityCostResult {
  proposed: RiskAdjustedWealthResult;
  ranked: RankedActionScore[]; // proposed + alternatives, best first
  recommendedLabel: string;
  proposedIsBest: boolean;
  betterAlternativeExists: boolean;
  rejectedAlternatives: Array<{ label: string; kind: ActionKind; reason: string }>;
  verdict: string;
  warnings: string[];
  confidence: number;
}
