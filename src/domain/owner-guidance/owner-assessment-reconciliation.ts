/**
 * UX-02A — canonical owner-assessment reconciliation (pure, structured-truth layer).
 *
 * OpsIQ computes several signals that could each be mistaken for "the" overall
 * business assessment (OwnerNowView, derivedBusinessCondition, per-domain diagnoses,
 * the legacy persisted BusinessConditionProfile, ...). This module does not compute a
 * new verdict: it reconciles the existing OwnerNowView fields — the canonical
 * owner-assessment core — with the existing derivedBusinessCondition detail into one
 * CanonicalOwnerAssessment contract, and encodes the one rule that is not already
 * explicit anywhere: missing/unknown data reduces certainty (readiness), it never by
 * itself worsens the reported health or condition detail.
 *
 * UX-02B (owner-facing prose) must consume CanonicalOwnerAssessment rather than
 * re-deriving readiness or health from OwnerNowView/derivedBusinessCondition itself.
 *
 * The narrative's "primary concern" is the business class of the ONE canonical owner decision's
 * main target (owner-spine/owner-decision.ts), copied verbatim — never OwnerNowView's own
 * operating-signal ranking (`topOwnerActions[0]`), which previously let the Cockpit narrative say
 * "Cash flow is the first issue" while the owner's actual main target was something else.
 */

import { EvidenceConfidenceLevel } from "@/domain/business-impact/recommendation-business-impact";
import type { AreaStatus } from "@/domain/owner-guidance/guidance-orchestrator";
import type { GuidanceClassification } from "@/domain/owner-guidance/guidance-classification";
import type { BusinessIssue } from "@/domain/owner-guidance/issue-priority";
import type { OwnerPriorityClass } from "@/domain/owner-spine/owner-decision";
import type { DerivedBusinessConditionSignals } from "@/services/business-condition/business-condition-profile.service";

/** How much of the canonical assessment can be trusted, given evidence gaps alone. */
export type OwnerAssessmentReadiness = "AVAILABLE" | "LIMITED" | "INSUFFICIENT";

/**
 * Minimal structural input contract: only the existing OwnerNowView fields this
 * reconciliation reads, plus the optional existing 11-field condition detail.
 * Intentionally not `OwnerNowView` itself, so this module cannot accidentally grow a
 * dependency on fields it has no reconciliation rule for.
 */
export interface OwnerAssessmentReconciliationInput {
  businessId: string;
  classification: GuidanceClassification;
  confidence: EvidenceConfidenceLevel;
  confidenceCapped: boolean;
  missingDataRequests: string[];
  businessHealth: AreaStatus;
  cashDangerStatus: AreaStatus;
  profitLeakStatus: AreaStatus;
  staffOverloadStatus: AreaStatus;
  ownerOverloadStatus: AreaStatus;
  qualityFailureStatus: AreaStatus;
  customerRetentionStatus: AreaStatus;
  supplierInventoryStatus: AreaStatus;
  capacityStatus: AreaStatus;
  growthReadinessStatus: AreaStatus;
  topOwnerActions: BusinessIssue[];
  urgentRisks: BusinessIssue[];
  /** Business class of the canonical owner decision's main target (null when there is none). */
  canonicalPrimaryClass: OwnerPriorityClass | null;
  /** Existing 11-field derived-business-condition detail, when available. */
  conditionDimensions?: DerivedBusinessConditionSignals | null;
}

export interface CanonicalOwnerAssessmentAreaStatus {
  cash: AreaStatus | null;
  profit: AreaStatus | null;
  staffLoad: AreaStatus | null;
  ownerLoad: AreaStatus | null;
  quality: AreaStatus | null;
  customerRetention: AreaStatus | null;
  supplierInventory: AreaStatus | null;
  capacity: AreaStatus | null;
  growthReadiness: AreaStatus | null;
}

export interface CanonicalOwnerAssessment {
  businessId: string;
  source: "OWNER_NOW_VIEW";
  readiness: OwnerAssessmentReadiness;
  health: AreaStatus | null;
  confidence: EvidenceConfidenceLevel;
  confidenceCapped: boolean;
  guidanceClassification: GuidanceClassification;
  missingData: string[];
  /** Class of the canonical owner decision's main target — the only source of the primary concern. */
  primaryConcernClass: OwnerPriorityClass | null;
  urgentRisks: BusinessIssue[];
  areaStatus: CanonicalOwnerAssessmentAreaStatus;
  conditionDimensions: DerivedBusinessConditionSignals | null;
  knownConditionDimensionCount: number;
  unknownConditionDimensionCount: number;
}

const CONDITION_DIMENSION_COUNT = 11;

function countKnownConditionDimensions(
  conditionDimensions: DerivedBusinessConditionSignals | null | undefined,
): number {
  if (!conditionDimensions) return 0;
  return Object.values(conditionDimensions).filter((value) => value !== "unknown").length;
}

function determineReadiness(input: OwnerAssessmentReconciliationInput, knownDimensions: number): OwnerAssessmentReadiness {
  const unknownDimensions = input.conditionDimensions
    ? CONDITION_DIMENSION_COUNT - knownDimensions
    : CONDITION_DIMENSION_COUNT;

  const hasIssueEvidence = input.topOwnerActions.length > 0 || input.urgentRisks.length > 0;

  const isInsufficient =
    input.confidence === EvidenceConfidenceLevel.INSUFFICIENT &&
    knownDimensions === 0 &&
    !hasIssueEvidence;

  if (isInsufficient) return "INSUFFICIENT";

  const isLimited =
    input.confidenceCapped ||
    input.missingDataRequests.length > 0 ||
    unknownDimensions > 0;

  if (isLimited) return "LIMITED";

  return "AVAILABLE";
}

/**
 * Reconcile the existing OwnerNowView + derivedBusinessCondition signals into one
 * canonical structured assessment. Pure: no fetch, no Prisma, no Date.now, no env
 * access — every value is either copied verbatim from the input or a deterministic
 * count/comparison over it.
 */
export function reconcileOwnerAssessment(
  input: OwnerAssessmentReconciliationInput,
): CanonicalOwnerAssessment {
  const knownConditionDimensionCount = countKnownConditionDimensions(input.conditionDimensions);
  const unknownConditionDimensionCount = input.conditionDimensions
    ? CONDITION_DIMENSION_COUNT - knownConditionDimensionCount
    : CONDITION_DIMENSION_COUNT;

  const readiness = determineReadiness(input, knownConditionDimensionCount);
  const insufficient = readiness === "INSUFFICIENT";

  return {
    businessId: input.businessId,
    source: "OWNER_NOW_VIEW",
    readiness,
    health: insufficient ? null : input.businessHealth,
    confidence: input.confidence,
    confidenceCapped: input.confidenceCapped,
    guidanceClassification: input.classification,
    missingData: input.missingDataRequests,
    primaryConcernClass: input.canonicalPrimaryClass,
    urgentRisks: input.urgentRisks,
    areaStatus: {
      cash: insufficient ? null : input.cashDangerStatus,
      profit: insufficient ? null : input.profitLeakStatus,
      staffLoad: insufficient ? null : input.staffOverloadStatus,
      ownerLoad: insufficient ? null : input.ownerOverloadStatus,
      quality: insufficient ? null : input.qualityFailureStatus,
      customerRetention: insufficient ? null : input.customerRetentionStatus,
      supplierInventory: insufficient ? null : input.supplierInventoryStatus,
      capacity: insufficient ? null : input.capacityStatus,
      growthReadiness: insufficient ? null : input.growthReadinessStatus,
    },
    conditionDimensions: input.conditionDimensions ?? null,
    knownConditionDimensionCount,
    unknownConditionDimensionCount,
  };
}
