/**
 * UX-02B — owner-facing assessment composer (pure presentation-contract layer).
 *
 * Translates the UX-02A CanonicalOwnerAssessment into deterministic, plain-language
 * copy an owner can read directly. It is a mapping only: it does not compute,
 * rank, score, or diagnose anything, and it never reads OwnerNowView,
 * derivedBusinessCondition, domain diagnoses, the owner decision, Recovery state,
 * public signals, or the legacy BusinessConditionProfile directly — those were
 * already reconciled by UX-02A. Missing or unknown evidence can only change how
 * certain the copy sounds (confidenceLabel/confidenceMessage); it never changes
 * how the business condition (health) is described.
 *
 * UX-03 renders OwnerAssessmentNarrative on Home; it must not reimplement any of
 * the mappings below inside React.
 */

import { EvidenceConfidenceLevel } from "@/domain/business-impact/recommendation-business-impact";
import type { OwnerPriorityClass } from "@/domain/owner-spine/owner-decision";
import type { CanonicalOwnerAssessment } from "@/domain/owner-guidance/owner-assessment-reconciliation";
import type { AreaStatus } from "@/domain/owner-guidance/guidance-orchestrator";

export interface OwnerAssessmentNarrative {
  headline: string;
  primaryConcern: string | null;
  confidenceLabel: string;
  confidenceMessage: string;
  nextDataStep: string | null;
}

const INSUFFICIENT_EVIDENCE_HEADLINE = "There isn't enough evidence to assess this business yet.";

const HEALTH_HEADLINE: Record<AreaStatus, string> = {
  OK: "No major problem is showing in the current evidence.",
  WATCH: "There are areas of the business to watch.",
  DANGER: "The business needs attention.",
  CRITICAL: "The business needs urgent attention.",
};

const PRIMARY_CONCERN_BY_CLASS: Record<OwnerPriorityClass, string> = {
  SAFETY_COMPLIANCE: "Compliance or safety is the first issue to address.",
  SURVIVAL_CASH: "Cash flow is the first issue to address.",
  CUSTOMER_SERVICE_FAILURE: "Customer service or quality is the first issue to address.",
  OVERLOAD_BLOCKING: "Staff or owner workload is the first issue to address.",
  PROFIT_LOSS: "Profitability is the first issue to address.",
  BLOCKED_EXECUTION: "Work that cannot move forward is the first issue to address.",
  MISSING_CRITICAL_EVIDENCE: "Missing business information is the first issue to address.",
  GROWTH_OPPORTUNITY: "Growth is the first opportunity to consider.",
  PROCESS_OPTIMISATION: "Process improvement is the first opportunity to consider.",
};

const AVAILABLE_CONFIDENCE_LABEL: Record<EvidenceConfidenceLevel, string> = {
  [EvidenceConfidenceLevel.VERIFIED]: "Verified evidence",
  [EvidenceConfidenceLevel.STRONG]: "Strong evidence",
  [EvidenceConfidenceLevel.MODERATE]: "Moderate evidence",
  [EvidenceConfidenceLevel.WEAK]: "Limited evidence",
  // Defensive fallback for inconsistent upstream input; never changes readiness.
  [EvidenceConfidenceLevel.INSUFFICIENT]: "Limited evidence",
};

function composeHeadline(assessment: CanonicalOwnerAssessment): string {
  if (assessment.readiness === "INSUFFICIENT") {
    return INSUFFICIENT_EVIDENCE_HEADLINE;
  }
  if (assessment.health === null) {
    // Defensive invariant: readiness says evidence exists but health is null.
    // Fail safely rather than inventing a health state.
    return INSUFFICIENT_EVIDENCE_HEADLINE;
  }
  return HEALTH_HEADLINE[assessment.health];
}

function composePrimaryConcern(assessment: CanonicalOwnerAssessment): string | null {
  if (assessment.primaryConcernClass === null) return null;
  return PRIMARY_CONCERN_BY_CLASS[assessment.primaryConcernClass];
}

function composeConfidenceLabel(assessment: CanonicalOwnerAssessment): string {
  if (assessment.readiness === "INSUFFICIENT") return "Not enough evidence";
  if (assessment.readiness === "LIMITED") return "Limited confidence";
  return AVAILABLE_CONFIDENCE_LABEL[assessment.confidence];
}

function composeConfidenceMessage(assessment: CanonicalOwnerAssessment): string {
  if (assessment.readiness === "INSUFFICIENT") {
    return "More current business data is needed before OpsIQ can make a reliable assessment.";
  }
  if (assessment.readiness === "LIMITED") {
    if (assessment.missingData.length > 0) {
      return "Some important data is missing, so this assessment is provisional.";
    }
    if (assessment.unknownConditionDimensionCount > 0) {
      return "Some business signals are still unknown, so this assessment is provisional.";
    }
    return "The available evidence limits how certain this assessment can be.";
  }
  return "The assessment is supported by the available evidence.";
}

function formatNextDataStepItem(rawItem: string): string {
  const withoutTrailingNoise = rawItem.replace(/[.\s]+$/, "");
  return `Add or update ${withoutTrailingNoise}.`;
}

function composeNextDataStep(assessment: CanonicalOwnerAssessment): string | null {
  if (assessment.missingData.length > 0) {
    return formatNextDataStepItem(assessment.missingData[0]);
  }
  if (assessment.readiness === "INSUFFICIENT") {
    return "Add recent operating data for this business.";
  }
  return null;
}

/**
 * Compose the owner-facing narrative from the canonical structured assessment.
 * Pure, deterministic, synchronous: reads only the fields it needs from
 * `assessment` and never mutates it.
 */
export function composeOwnerAssessment(
  assessment: CanonicalOwnerAssessment,
): OwnerAssessmentNarrative {
  return {
    headline: composeHeadline(assessment),
    primaryConcern: composePrimaryConcern(assessment),
    confidenceLabel: composeConfidenceLabel(assessment),
    confidenceMessage: composeConfidenceMessage(assessment),
    nextDataStep: composeNextDataStep(assessment),
  };
}
