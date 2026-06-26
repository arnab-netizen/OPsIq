/**
 * Module 1 — Recommendation BusinessImpactAssessment + promotion gate (pure logic).
 *
 * The spec's hard rule: no recommendation can be promoted without a complete
 * business-impact assessment. The existing `business-impact-engine.ts` produces an
 * ROI/value score; this module adds the GOVERNANCE assessment every recommendation
 * must carry across all decision dimensions, plus a fail-closed gate that the
 * recommendation promotion path enforces.
 *
 * Pure: no DB, no I/O. The financialImpact sub-field reuses the engine's
 * FinancialImpact/ROIResult types (no duplication). Persistence + live wiring into
 * updateRecommendationStatus is layered on top of this gate.
 */

import type { FinancialImpact, ROIResult } from "@/domain/business-impact/business-impact-engine";

/** Lean classification shared with the Lean/False-Lean guardrail (Module 7/11). */
export enum LeanClassification {
  LEAN_APPROVED = "LEAN_APPROVED",
  LEAN_APPROVED_WITH_MONITORING = "LEAN_APPROVED_WITH_MONITORING",
  LEAN_REDESIGN_REQUIRED = "LEAN_REDESIGN_REQUIRED",
  FALSE_LEAN_REJECTED = "FALSE_LEAN_REJECTED",
  GROWTH_UNSAFE = "GROWTH_UNSAFE",
  CASH_UNSAFE_REJECTED = "CASH_UNSAFE_REJECTED",
  DATA_INSUFFICIENT = "DATA_INSUFFICIENT",
}

/** Classifications that BLOCK promotion (fail-closed). */
export const PROMOTION_BLOCKING_LEAN = new Set<LeanClassification>([
  LeanClassification.FALSE_LEAN_REJECTED,
  LeanClassification.GROWTH_UNSAFE,
  LeanClassification.CASH_UNSAFE_REJECTED,
  LeanClassification.DATA_INSUFFICIENT,
]);

export enum EvidenceConfidenceLevel {
  VERIFIED = "VERIFIED",
  STRONG = "STRONG",
  MODERATE = "MODERATE",
  WEAK = "WEAK",
  INSUFFICIENT = "INSUFFICIENT",
}

export type ImpactDirection = "positive" | "negative" | "neutral" | "unknown";
export type ImpactMagnitude = "none" | "low" | "medium" | "high" | "critical";

/** A single business-impact dimension with a direction, magnitude, and rationale. */
export interface ImpactDimension {
  direction: ImpactDirection;
  magnitude: ImpactMagnitude;
  rationale: string;
}

export interface TimeHorizonImpact {
  expectedEffect: string;
  magnitude: ImpactMagnitude;
  confidence: EvidenceConfidenceLevel;
}

export interface RejectedAlternative {
  option: string;
  whyRejected: string;
}

/** The full governance assessment every recommendation must carry. */
export interface RecommendationBusinessImpact {
  recommendationId: string;
  workspaceId: string;
  evidenceBasis: string[];
  evidenceConfidence: EvidenceConfidenceLevel;
  financialImpact: { input: FinancialImpact; roi: ROIResult };
  cashImpact: ImpactDimension;
  unitEconomicsImpact: ImpactDimension;
  staffWorkloadImpact: ImpactDimension;
  ownerWorkloadImpact: ImpactDimension;
  capacityImpact: ImpactDimension;
  qualityImpact: ImpactDimension;
  customerImpact: ImpactDimension;
  riskComplianceImpact: ImpactDimension;
  executionComplexity: ImpactMagnitude;
  timeHorizon7d: TimeHorizonImpact;
  timeHorizon30d: TimeHorizonImpact;
  timeHorizon90d: TimeHorizonImpact;
  timeHorizon6m: TimeHorizonImpact;
  rejectedAlternatives: RejectedAlternative[];
  requiredProof: string[];
  rollbackTrigger: string;
  leanClassification: LeanClassification;
}

/** The dimensions that must all be present and non-"unknown" for a complete assessment. */
const REQUIRED_DIMENSIONS: (keyof RecommendationBusinessImpact)[] = [
  "cashImpact",
  "unitEconomicsImpact",
  "staffWorkloadImpact",
  "ownerWorkloadImpact",
  "capacityImpact",
  "qualityImpact",
  "customerImpact",
  "riskComplianceImpact",
];

export interface BusinessImpactGateResult {
  ok: boolean;
  blockedReasons: string[];
}

function dimensionPresent(d: ImpactDimension | undefined): boolean {
  return (
    !!d &&
    !!d.direction &&
    !!d.magnitude &&
    typeof d.rationale === "string" &&
    d.rationale.trim().length > 0
  );
}

function horizonPresent(h: TimeHorizonImpact | undefined): boolean {
  return !!h && typeof h.expectedEffect === "string" && h.expectedEffect.trim().length > 0 && !!h.magnitude && !!h.confidence;
}

/**
 * Fail-closed promotion gate. Returns ok=false with reasons when the assessment is
 * absent, incomplete, scoped to a different workspace, or its lean classification
 * blocks promotion. The decision depends only on the typed assessment.
 */
export function evaluateBusinessImpactGate(
  assessment: RecommendationBusinessImpact | null | undefined,
  ctx: { recommendationId: string; workspaceId: string }
): BusinessImpactGateResult {
  const reasons: string[] = [];

  if (!assessment) {
    return { ok: false, blockedReasons: ["No BusinessImpactAssessment present; recommendation cannot be promoted."] };
  }
  if (assessment.recommendationId !== ctx.recommendationId) {
    reasons.push("Assessment recommendationId does not match the recommendation being promoted.");
  }
  if (assessment.workspaceId !== ctx.workspaceId) {
    reasons.push("Assessment is scoped to a different workspace.");
  }
  if (!assessment.evidenceBasis || assessment.evidenceBasis.filter((e) => e && e.trim().length > 0).length === 0) {
    reasons.push("Empty evidence basis.");
  }
  if (!assessment.evidenceConfidence) {
    reasons.push("Missing evidence confidence.");
  }
  if (!assessment.financialImpact || !assessment.financialImpact.roi) {
    reasons.push("Missing financial impact / ROI.");
  }
  for (const dim of REQUIRED_DIMENSIONS) {
    if (!dimensionPresent(assessment[dim] as ImpactDimension)) {
      reasons.push(`Missing or empty impact dimension: ${String(dim)}.`);
    }
  }
  if (!assessment.executionComplexity) {
    reasons.push("Missing execution complexity.");
  }
  if (!horizonPresent(assessment.timeHorizon7d) || !horizonPresent(assessment.timeHorizon30d) || !horizonPresent(assessment.timeHorizon90d) || !horizonPresent(assessment.timeHorizon6m)) {
    reasons.push("Incomplete time-horizon impacts (7d/30d/90d/6m all required).");
  }
  if (!assessment.requiredProof || assessment.requiredProof.filter((p) => p && p.trim().length > 0).length === 0) {
    reasons.push("No required proof specified.");
  }
  if (!assessment.rollbackTrigger || assessment.rollbackTrigger.trim().length === 0) {
    reasons.push("No rollback trigger specified.");
  }
  if (!assessment.leanClassification) {
    reasons.push("Missing lean classification.");
  } else if (PROMOTION_BLOCKING_LEAN.has(assessment.leanClassification)) {
    reasons.push(`Lean classification blocks promotion: ${assessment.leanClassification}.`);
  }

  return { ok: reasons.length === 0, blockedReasons: reasons };
}

/** Thrown when a recommendation is promoted without a complete, safe business-impact assessment. */
export class BusinessImpactGateError extends Error {
  readonly code = "BUSINESS_IMPACT_GATE_BLOCKED";
  readonly blockedReasons: string[];
  constructor(recommendationId: string, blockedReasons: string[]) {
    super(`Recommendation ${recommendationId} cannot be promoted: ${blockedReasons.join(" ")}`);
    this.name = "BusinessImpactGateError";
    this.blockedReasons = blockedReasons;
  }
}

/**
 * Promotion guard for the recommendation service to call before approving a
 * recommendation. Throws BusinessImpactGateError when the gate fails closed.
 */
export function assertBusinessImpactForPromotion(
  assessment: RecommendationBusinessImpact | null | undefined,
  ctx: { recommendationId: string; workspaceId: string }
): void {
  const result = evaluateBusinessImpactGate(assessment, ctx);
  if (!result.ok) {
    throw new BusinessImpactGateError(ctx.recommendationId, result.blockedReasons);
  }
}
