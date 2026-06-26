/**
 * Module 1 slice 2 — BusinessImpactAssessment composer (pure logic).
 *
 * Produces a spec-complete {@link RecommendationBusinessImpact} from structured
 * signals (reusing the proven ROI engine for the financial sub-field), and
 * fail-closed-reconciles the lean classification: cash-, capacity-, and
 * workload-unsafe assessments are forced into a blocking classification regardless
 * of what was proposed, so the promotion gate cannot be bypassed by an optimistic
 * label. The full lean scoring remains Module 7's responsibility; this is the
 * conservative safety reconciliation needed for the gate.
 */

import {
  calculateROI,
  type FinancialImpact,
} from "@/domain/business-impact/business-impact-engine";
import {
  LeanClassification,
  EvidenceConfidenceLevel,
  type RecommendationBusinessImpact,
  type ImpactDimension,
  type ImpactMagnitude,
  type TimeHorizonImpact,
  type RejectedAlternative,
} from "@/domain/business-impact/recommendation-business-impact";

export interface BusinessImpactInputs {
  recommendationId: string;
  workspaceId: string;
  evidenceBasis: string[];
  /** True when at least one evidence source is a verified export (accounting/bank/POS). */
  hasVerifiedSource: boolean;
  financial: FinancialImpact;
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
  /** What the engine/owner proposed; reconciled against safety below. */
  proposedLeanClassification: LeanClassification;
}

/** Evidence confidence derived from source strength and breadth. */
export function deriveEvidenceConfidence(evidenceBasis: string[], hasVerifiedSource: boolean): EvidenceConfidenceLevel {
  const count = (evidenceBasis ?? []).filter((e) => e && e.trim().length > 0).length;
  if (count === 0) return EvidenceConfidenceLevel.INSUFFICIENT;
  if (hasVerifiedSource && count >= 2) return EvidenceConfidenceLevel.VERIFIED;
  if (hasVerifiedSource) return EvidenceConfidenceLevel.STRONG;
  if (count >= 2) return EvidenceConfidenceLevel.MODERATE;
  return EvidenceConfidenceLevel.WEAK;
}

function isSevereNegative(d: ImpactDimension): boolean {
  return d.direction === "negative" && (d.magnitude === "high" || d.magnitude === "critical");
}

/**
 * Fail-closed reconciliation: a severely-negative cash/capacity/workload impact, or
 * insufficient evidence, forces a blocking classification even if a healthier label
 * was proposed. Safety can only tighten the classification, never loosen it.
 */
export function reconcileLeanClassification(
  proposed: LeanClassification,
  inputs: Pick<
    BusinessImpactInputs,
    "evidenceBasis" | "cashImpact" | "capacityImpact" | "staffWorkloadImpact" | "ownerWorkloadImpact"
  >
): LeanClassification {
  const evidenceCount = (inputs.evidenceBasis ?? []).filter((e) => e && e.trim().length > 0).length;
  if (evidenceCount === 0) return LeanClassification.DATA_INSUFFICIENT;
  if (isSevereNegative(inputs.cashImpact)) return LeanClassification.CASH_UNSAFE_REJECTED;
  if (inputs.capacityImpact.direction === "negative" && inputs.capacityImpact.magnitude === "critical") {
    return LeanClassification.GROWTH_UNSAFE;
  }
  if (isSevereNegative(inputs.staffWorkloadImpact) || isSevereNegative(inputs.ownerWorkloadImpact)) {
    return LeanClassification.FALSE_LEAN_REJECTED;
  }
  return proposed;
}

/** Compose a complete, gate-ready business-impact assessment from real signals. */
export function composeBusinessImpact(inputs: BusinessImpactInputs): RecommendationBusinessImpact {
  const roi = calculateROI(inputs.financial);
  const evidenceConfidence = deriveEvidenceConfidence(inputs.evidenceBasis, inputs.hasVerifiedSource);
  const leanClassification = reconcileLeanClassification(inputs.proposedLeanClassification, inputs);

  return {
    recommendationId: inputs.recommendationId,
    workspaceId: inputs.workspaceId,
    evidenceBasis: inputs.evidenceBasis,
    evidenceConfidence,
    financialImpact: { input: inputs.financial, roi },
    cashImpact: inputs.cashImpact,
    unitEconomicsImpact: inputs.unitEconomicsImpact,
    staffWorkloadImpact: inputs.staffWorkloadImpact,
    ownerWorkloadImpact: inputs.ownerWorkloadImpact,
    capacityImpact: inputs.capacityImpact,
    qualityImpact: inputs.qualityImpact,
    customerImpact: inputs.customerImpact,
    riskComplianceImpact: inputs.riskComplianceImpact,
    executionComplexity: inputs.executionComplexity,
    timeHorizon7d: inputs.timeHorizon7d,
    timeHorizon30d: inputs.timeHorizon30d,
    timeHorizon90d: inputs.timeHorizon90d,
    timeHorizon6m: inputs.timeHorizon6m,
    rejectedAlternatives: inputs.rejectedAlternatives,
    requiredProof: inputs.requiredProof,
    rollbackTrigger: inputs.rollbackTrigger,
    leanClassification,
  };
}
