/**
 * Module 21 — Growth Readiness Gate (pure; thin delegation, no new engine).
 *
 * The progression engine already blocks growth on weak cash / unclear margin /
 * capacity stress / owner firefighting / unverified profit. This is a thin gate
 * that DELEGATES to evaluateProgressionRecommendation and expresses the result as
 * an explicit growth-readiness verdict — it does not re-derive the rules
 * (no duplication). Every growth recommendation stays owner-review-required.
 */

import {
  evaluateProgressionRecommendation,
  ProgressionMove,
  type GrowthSignals,
  type ProgressionDecision,
} from "@/domain/execution/progression-engine";

export enum GrowthReadiness {
  GROWTH_READY = "GROWTH_READY",
  STABILIZE_FIRST = "STABILIZE_FIRST",
}

export interface GrowthReadinessResult {
  readiness: GrowthReadiness;
  allowed: boolean;
  blockedReasons: string[];
  decision: ProgressionDecision;
  /** Always true — a growth recommendation can never auto-apply. */
  ownerApprovalRequired: true;
}

/**
 * Assess growth readiness by delegating to the proven progression engine. Allowed
 * only when the engine permits the move; otherwise STABILIZE_FIRST with the
 * engine's blocked reasons.
 */
export function assessGrowthReadiness(
  signals: GrowthSignals,
  move: ProgressionMove = ProgressionMove.MARKETING_SCALE
): GrowthReadinessResult {
  const decision = evaluateProgressionRecommendation(signals, move);
  return {
    readiness: decision.allowed ? GrowthReadiness.GROWTH_READY : GrowthReadiness.STABILIZE_FIRST,
    allowed: decision.allowed,
    blockedReasons: decision.blockedReasons,
    decision,
    ownerApprovalRequired: true,
  };
}

/** Thrown when a growth recommendation is promoted while not growth-ready. */
export class GrowthNotReadyError extends Error {
  readonly code = "GROWTH_NOT_READY";
  readonly blockedReasons: string[];
  constructor(ref: string, blockedReasons: string[]) {
    super(`Growth action ${ref} blocked: stabilize first (${blockedReasons.join(", ")}).`);
    this.name = "GrowthNotReadyError";
    this.blockedReasons = blockedReasons;
  }
}

/** Guard: throws GrowthNotReadyError unless the business is growth-ready. */
export function assertGrowthReady(signals: GrowthSignals, move: ProgressionMove, ref: string): void {
  const r = assessGrowthReadiness(signals, move);
  if (!r.allowed) throw new GrowthNotReadyError(ref, r.blockedReasons);
}
