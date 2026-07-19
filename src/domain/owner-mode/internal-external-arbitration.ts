/**
 * Phase 4 — Internal vs External Opportunity Arbitration (Capability 12).
 *
 * Extends the base `arbitrate()` primitive with signal-origin awareness.
 * Internal opportunities (process improvements, cost reductions, quality)
 * and external opportunities (new markets, new clients, partnerships) compete
 * for the same owner attention and resource pools but carry different risk
 * profiles and confidence characteristics.
 *
 * Pure — no DB, no I/O.
 */

import { arbitrate, type ArbitrationCandidate, type ArbitrationResult } from "./decision-arbitration";

export type OpportunityOrigin = "INTERNAL" | "EXTERNAL";
export type OpportunityCategory =
  | "PROCESS_IMPROVEMENT"
  | "COST_REDUCTION"
  | "QUALITY_UPLIFT"
  | "CAPACITY_EXPANSION"
  | "NEW_MARKET"
  | "NEW_CLIENT"
  | "PARTNERSHIP"
  | "PRODUCT_EXTENSION"
  | "RISK_MITIGATION";

const CATEGORY_ORIGIN: Record<OpportunityCategory, OpportunityOrigin> = {
  PROCESS_IMPROVEMENT: "INTERNAL",
  COST_REDUCTION: "INTERNAL",
  QUALITY_UPLIFT: "INTERNAL",
  CAPACITY_EXPANSION: "INTERNAL",
  NEW_MARKET: "EXTERNAL",
  NEW_CLIENT: "EXTERNAL",
  PARTNERSHIP: "EXTERNAL",
  PRODUCT_EXTENSION: "EXTERNAL",
  RISK_MITIGATION: "INTERNAL",
};

/** Internal opportunities have lower action risk (reversible operational changes).
 *  External opportunities have higher action risk but also higher upside. */
const ORIGIN_RISK_MODIFIER: Record<OpportunityOrigin, { actionRiskAdder: number; inactionRiskAdder: number }> = {
  INTERNAL: { actionRiskAdder: -0.1, inactionRiskAdder: 0 },
  EXTERNAL: { actionRiskAdder: 0.1, inactionRiskAdder: 0.1 },
};

export interface OpportunitySignal {
  signalId: string;
  category: OpportunityCategory;
  title: string;
  estimatedValueScore: number; // 0..1 — normalised expected value
  confidenceScore: number; // 0..1
  effortScore: number; // 0..1 — how much effort required (higher = harder)
  linkedObjectiveId: string | null;
  isValidated: boolean; // passed through validation gate
  isConflictingWithExisting: boolean; // conflicts with an existing action
  timeSensitiveDays: number | null; // null = no urgency
}

export interface OpportunityArbitrationCandidate extends ArbitrationCandidate {
  signalId: string;
  category: OpportunityCategory;
  origin: OpportunityOrigin;
  estimatedValueScore: number;
  effortScore: number;
  isValidated: boolean;
}

export interface InternalExternalArbitrationResult {
  arbitrationResult: ArbitrationResult;
  candidates: OpportunityArbitrationCandidate[];
  recommendedSignalId: string | null;
  recommendedOrigin: OpportunityOrigin | null;
  internalWinnerCount: number;
  externalWinnerCount: number;
  skippedUnvalidated: string[]; // signalIds skipped for lacking validation
}

/** Convert an OpportunitySignal to ArbitrationCandidate. */
function toCandidate(signal: OpportunitySignal): OpportunityArbitrationCandidate {
  const origin = CATEGORY_ORIGIN[signal.category];
  const modifier = ORIGIN_RISK_MODIFIER[origin];

  // Effort-adjusted action risk: high effort = higher risk of starting
  const baseActionRisk = Math.min(1.0, signal.effortScore * 0.6 + (1 - signal.confidenceScore) * 0.4);
  const riskOfAction = Math.max(0, Math.min(1.0, baseActionRisk + modifier.actionRiskAdder));

  // Time-sensitive signals have higher inaction risk
  let inactionBase = 1 - signal.estimatedValueScore;
  if (signal.timeSensitiveDays !== null && signal.timeSensitiveDays <= 30) {
    inactionBase = Math.min(1.0, inactionBase + 0.3);
  }
  const riskOfInaction = Math.max(0, Math.min(1.0, inactionBase + modifier.inactionRiskAdder));

  return {
    id: signal.signalId,
    signalId: signal.signalId,
    category: signal.category,
    origin,
    estimatedValueScore: signal.estimatedValueScore,
    effortScore: signal.effortScore,
    isValidated: signal.isValidated,
    blockedBy: signal.isConflictingWithExisting ? ["capacity"] : [],
    riskOfAction: parseFloat(riskOfAction.toFixed(3)),
    riskOfInaction: parseFloat(riskOfInaction.toFixed(3)),
    confidence: signal.confidenceScore,
    ownerGoalAligned: signal.linkedObjectiveId !== null,
    reversible: origin === "INTERNAL", // internal changes are generally more reversible
  };
}

/**
 * Arbitrate internal vs external opportunity signals to surface the single
 * highest-value, feasible, validated signal the owner should act on next.
 *
 * Unvalidated signals are reported but excluded from arbitration.
 */
export function arbitrateOpportunities(
  signals: OpportunitySignal[],
): InternalExternalArbitrationResult {
  const validated = signals.filter((s) => s.isValidated);
  const skippedUnvalidated = signals
    .filter((s) => !s.isValidated)
    .map((s) => s.signalId);

  const candidates = validated.map(toCandidate);
  const baseResult = arbitrate(candidates);

  const recommendedId = baseResult.recommended?.id ?? null;
  const recommendedCandidate = candidates.find((c) => c.id === recommendedId) ?? null;

  const winners = baseResult.decisions.filter((d) => d.verdict === "recommended");
  const internalWinnerCount = winners.filter((d) => {
    const c = candidates.find((c) => c.id === d.id);
    return c?.origin === "INTERNAL";
  }).length;
  const externalWinnerCount = winners.length - internalWinnerCount;

  return {
    arbitrationResult: baseResult,
    candidates,
    recommendedSignalId: recommendedId,
    recommendedOrigin: recommendedCandidate?.origin ?? null,
    internalWinnerCount,
    externalWinnerCount,
    skippedUnvalidated,
  };
}
