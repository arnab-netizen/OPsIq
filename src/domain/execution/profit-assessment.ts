/**
 * Profit-impact assessment (Slice 14).
 *
 * Produces a `ProfitImpactConfidence` (consumed by the Slice 15 learning gate)
 * plus a disclosed calculation basis. Hard rules:
 *  - No profit claim without a basis and confidence.
 *  - ESTIMATED_FROM_DEFAULTS / INSUFFICIENT_DATA / NOT_CALCULATED are NOT
 *    "proven profit improvement" (not safe for learning).
 *  - Revenue-only data (missing costs) is never treated as profit.
 *  - Cash collected is tracked separately from cash pending and from revenue.
 */

import { ProfitImpactConfidence } from "@/domain/execution/learning-gate";

export interface ProfitImpactInputs {
  actualRevenue?: number | null;
  cashCollected?: number | null;
  cashPending?: number | null;
  discountCost?: number | null;
  refundCost?: number | null;
  laborCost?: number | null;
  deliveryCost?: number | null;
  materialCost?: number | null;
  complaintCost?: number | null;
  /** Some inputs came from owner-provided estimates. */
  usedOwnerInput?: boolean;
  /** Some inputs were filled from generic defaults. */
  usedDefaults?: boolean;
}

export interface ProfitImpactAssessment {
  netImpactEstimate: number | null;
  grossMarginEstimate: number | null;
  calculationBasis: string;
  inputValuesUsed: string[];
  missingInputs: string[];
  confidence: ProfitImpactConfidence;
  measured: boolean;
  safeForLearning: boolean;
  profitNegative: boolean;
  /** Cash collected — distinct from revenue and from cash pending. */
  cashCollected: number | null;
  cashPending: number | null;
}

/** The minimal inputs required to claim a real (non-revenue-only) profit figure. */
const REQUIRED_FOR_PROFIT = ["actualRevenue", "laborCost", "materialCost"] as const;
const COST_KEYS = [
  "discountCost",
  "refundCost",
  "laborCost",
  "deliveryCost",
  "materialCost",
  "complaintCost",
] as const;

export function assessProfitImpact(
  inputs: ProfitImpactInputs
): ProfitImpactAssessment {
  const present: string[] = [];
  const missing: string[] = [];
  for (const k of REQUIRED_FOR_PROFIT) {
    if (inputs[k] != null) present.push(k);
    else missing.push(k);
  }

  let confidence: ProfitImpactConfidence;
  if (missing.length === REQUIRED_FOR_PROFIT.length) {
    confidence = ProfitImpactConfidence.NOT_CALCULATED;
  } else if (missing.length > 0) {
    // e.g. revenue present but costs missing → revenue-only, not profit.
    confidence = ProfitImpactConfidence.INSUFFICIENT_DATA;
  } else if (inputs.usedDefaults) {
    confidence = ProfitImpactConfidence.ESTIMATED_FROM_DEFAULTS;
  } else if (inputs.usedOwnerInput) {
    confidence = ProfitImpactConfidence.ESTIMATED_FROM_OWNER_INPUT;
  } else {
    confidence = ProfitImpactConfidence.MEASURED;
  }

  const measured = confidence === ProfitImpactConfidence.MEASURED;
  const safeForLearning =
    confidence === ProfitImpactConfidence.MEASURED ||
    confidence === ProfitImpactConfidence.ESTIMATED_FROM_OWNER_INPUT;

  // Net is only computed when all required inputs are present; revenue-only never
  // yields a net profit figure.
  let net: number | null = null;
  let gm: number | null = null;
  if (missing.length === 0 && inputs.actualRevenue != null) {
    const totalCost = COST_KEYS.reduce(
      (sum, k) => sum + (inputs[k] ?? 0),
      0
    );
    net = inputs.actualRevenue - totalCost;
    gm = inputs.actualRevenue > 0 ? net / inputs.actualRevenue : null;
  }

  return {
    netImpactEstimate: net,
    grossMarginEstimate: gm,
    calculationBasis:
      missing.length === 0
        ? "revenue minus itemized costs"
        : "insufficient inputs — basis incomplete",
    inputValuesUsed: present,
    missingInputs: missing,
    confidence,
    measured,
    safeForLearning,
    profitNegative: net != null && net < 0,
    cashCollected: inputs.cashCollected ?? null,
    cashPending: inputs.cashPending ?? null,
  };
}
