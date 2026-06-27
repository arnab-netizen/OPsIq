/**
 * Evidence Confidence Gate (Section 10). Pure.
 *
 * Recommendation strength is constrained by data confidence. Low-confidence data
 * may NOT drive scale, major growth, hiring, capex, new-branch, major marketing,
 * or irreversible spend. Below VERIFIED, allocations are returned as capped ranges
 * rather than overly-precise amounts (unless the amount is a fixed obligation).
 */

import {
  type BudgetConfidenceLevel,
  CONFIDENCE_ORDER,
} from "@/domain/owner-budget/types";

/** Recommendation classes whose risk must be gated by confidence. */
export type GatedRecommendation =
  | "scale" | "major_growth" | "hiring" | "capex" | "new_branch"
  | "major_marketing" | "irreversible_spend" | "capped_test" | "evidence_collection"
  | "reversible_action" | "controlled_growth" | "reallocation";

const MIN_CONFIDENCE: Record<GatedRecommendation, BudgetConfidenceLevel> = {
  scale: "VERIFIED",
  major_growth: "VERIFIED",
  hiring: "VERIFIED",
  capex: "VERIFIED",
  new_branch: "VERIFIED",
  major_marketing: "VERIFIED",
  irreversible_spend: "VERIFIED",
  controlled_growth: "OPERATIONAL",
  reallocation: "OPERATIONAL",
  capped_test: "PARTIAL",
  reversible_action: "PARTIAL",
  evidence_collection: "UNVERIFIED",
};

export interface ConfidenceGateResult {
  allowed: boolean;
  requiredConfidence: BudgetConfidenceLevel;
  actualConfidence: BudgetConfidenceLevel;
  reason: string;
}

export function confidenceRank(c: BudgetConfidenceLevel): number {
  return CONFIDENCE_ORDER.indexOf(c);
}

/** Is a gated recommendation permitted at the current confidence level? */
export function checkConfidenceGate(
  recommendation: GatedRecommendation,
  actual: BudgetConfidenceLevel
): ConfidenceGateResult {
  const required = MIN_CONFIDENCE[recommendation];
  const allowed = confidenceRank(actual) >= confidenceRank(required);
  return {
    allowed,
    requiredConfidence: required,
    actualConfidence: actual,
    reason: allowed
      ? `${recommendation} permitted at ${actual} confidence.`
      : `${recommendation} blocked: needs ${required}, have ${actual}. Collect evidence / use capped reversible action.`,
  };
}

export interface AllocationExpression {
  /** Precise amount only when confidence is high OR the amount is a fixed obligation. */
  precise: number | null;
  /** Capped range [low, high] used below VERIFIED for discretionary amounts. */
  range: [number, number] | null;
  label: string;
}

/**
 * Express an allocation amount. Below VERIFIED confidence, discretionary amounts
 * are returned as a capped range (Section 10) instead of false precision; fixed
 * obligations are always precise.
 */
export function expressAllocation(
  amount: number,
  confidence: BudgetConfidenceLevel,
  isFixedObligation: boolean
): AllocationExpression {
  if (isFixedObligation || confidenceRank(confidence) >= confidenceRank("VERIFIED")) {
    return { precise: amount, range: null, label: `${amount}` };
  }
  // Cap discretionary spend tighter the lower the confidence.
  const factor = confidence === "OPERATIONAL" ? 0.85 : confidence === "PARTIAL" ? 0.5 : 0.25;
  const high = Math.round(amount * factor);
  const low = Math.round(high * 0.6);
  return { precise: null, range: [low, high], label: `${low}–${high} (capped at ${confidence})` };
}
