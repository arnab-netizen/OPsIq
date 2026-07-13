/**
 * Bid Application Pack generator — pure domain function.
 *
 * Transforms a screened `TenderProcurementCandidate` into a structured
 * `BidApplicationPack` that the owner reviews before any bid work begins.
 *
 * Hard governance rules (mirrors the tender screen contract):
 * - NEVER produces a submission-ready document.
 * - `submissionAllowed` is always false.
 * - `ownerApprovalRequired` is always true.
 * - All risk bands and compliance gaps from the candidate are faithfully
 *   reproduced — no risk is suppressed or softened.
 * - Missing data is surfaced as owner action items, not hidden.
 * - No fabricated market data, no guaranteed-success language.
 *
 * Pure module: no DB, no Date.now, no AI, no network I/O.
 */

import type {
  TenderProcurementCandidate,
  RiskBand,
  FitBand,
  KnownState,
} from "./external-opportunity-intelligence";

// ── Output types ────────────────────────────────────────────────────────────

export interface BidCoverSection {
  opportunityTitle: string;
  targetBuyer: string;
  signalSourceType: string;
  sourceEvidenceSummary: string;
  sourceRefs: string[];
  bidDeadlineDays: number | null;
  tenderDecision: string;
  evaluatedAt: string;
}

export interface BidEligibilitySection {
  eligibility: KnownState;
  compliant: KnownState;
  capacityFit: FitBand;
  missingEligibilityData: string[];
  ownerActions: string[];
}

export interface BidRiskSection {
  emdExposure: RiskBand;
  paymentDelayRisk: RiskBand;
  performancePenaltyRisk: RiskBand;
  workingCapitalRequirement: RiskBand;
  documentationBurden: RiskBand;
  overallRiskSummary: string;
}

export interface BidEconomicsSection {
  unitEconomics: KnownState;
  ownerActions: string[];
}

export interface BidOwnerActionsSection {
  missingData: string[];
  preparationSteps: string[];
  approvalNote: string;
}

export interface BidApplicationPack {
  workspaceId: string;
  /** Cover information — what the tender is and where it comes from. */
  cover: BidCoverSection;
  /** Eligibility, compliance, and capacity status. */
  eligibility: BidEligibilitySection;
  /** Financial and operational risk profile from the tender screen. */
  risk: BidRiskSection;
  /** Unit-economics readiness. */
  economics: BidEconomicsSection;
  /** Consolidated owner action list before bid work can begin. */
  ownerActions: BidOwnerActionsSection;
  /** System capability recommendation from the tender screen, if any. */
  systemCapabilityRecommendation: string | null;
  /** Owner-visible explanation forwarded from the tender screen. */
  ownerVisibleExplanation: string;
  /**
   * Always false — this pack is preparation only; it never constitutes a bid
   * submission or pre-authorization to submit.
   */
  submissionAllowed: false;
  /** Always true — any progression beyond this pack requires explicit owner sign-off. */
  ownerApprovalRequired: true;
  generatedAt: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildOverallRiskSummary(candidate: TenderProcurementCandidate): string {
  const highRisks: string[] = [];
  if (candidate.emdExposure === "HIGH") highRisks.push("high EMD/security-deposit exposure");
  if (candidate.paymentDelayRisk === "HIGH") highRisks.push("high payment-delay risk");
  if (candidate.performancePenaltyRisk === "HIGH") highRisks.push("high performance-penalty risk");
  if (candidate.workingCapitalRequirement === "HIGH") highRisks.push("high working-capital requirement");
  if (candidate.documentationBurden === "HIGH") highRisks.push("heavy documentation burden");

  if (highRisks.length === 0) return "No high-risk factors identified from current data.";
  return `High-risk factors present: ${highRisks.join("; ")}. Owner review required before proceeding.`;
}

function buildEligibilityOwnerActions(candidate: TenderProcurementCandidate): string[] {
  const actions: string[] = [];
  if (candidate.eligibility === "UNKNOWN") {
    actions.push("Collect and confirm eligibility criteria from the procuring entity.");
  }
  if (candidate.compliance === "UNKNOWN") {
    actions.push("Identify and verify all compliance and licensing requirements.");
  }
  if (candidate.capacityFit === "WEAK" || candidate.capacityFit === "UNKNOWN") {
    actions.push("Assess current operational capacity against the tender scope before proceeding.");
  }
  return actions;
}

function buildMissingEligibilityData(candidate: TenderProcurementCandidate): string[] {
  const missing: string[] = [];
  if (candidate.eligibility === "UNKNOWN") missing.push("eligibility criteria");
  if (candidate.compliance === "UNKNOWN") missing.push("compliance/documentation requirements");
  if (candidate.capacityFit === "UNKNOWN") missing.push("capacity assessment");
  return missing;
}

function buildEconomicsOwnerActions(candidate: TenderProcurementCandidate): string[] {
  if (candidate.unitEconomics === "UNKNOWN") {
    return ["Calculate cost structure, margin, and unit economics before committing to bid preparation."];
  }
  return [];
}

function buildPreparationSteps(candidate: TenderProcurementCandidate): string[] {
  const steps: string[] = [
    "Review all eligibility, compliance, and capacity findings above.",
    "Resolve all missing-data items listed before proceeding.",
  ];
  if (candidate.tenderDecision === "PREPARE_BID_DRAFT") {
    steps.push("Draft an owner-reviewable bid outline — do not submit without explicit owner approval.");
    steps.push("Validate bid pricing, margin, and working-capital requirements before finalising.");
  }
  if (candidate.bidDeadlineDays !== null && candidate.bidDeadlineDays <= 7) {
    steps.push(`Urgent: bid deadline is ${candidate.bidDeadlineDays} day(s) away — prioritise data collection immediately.`);
  }
  return steps;
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Generates a structured bid-preparation pack from a screened tender candidate.
 * Pure and deterministic — no side effects.
 */
export function generateBidApplicationPack(
  candidate: TenderProcurementCandidate,
  generatedAt: string,
): BidApplicationPack {
  const eligibilityOwnerActions = buildEligibilityOwnerActions(candidate);
  const economicsOwnerActions = buildEconomicsOwnerActions(candidate);

  const allOwnerActions = [
    ...eligibilityOwnerActions,
    ...economicsOwnerActions,
    ...(candidate.missingData ?? []).map((d) => `Collect missing data: ${d}`),
  ];

  return {
    workspaceId: candidate.workspaceId,
    cover: {
      opportunityTitle: candidate.opportunityTitle,
      targetBuyer: candidate.targetBuyer,
      signalSourceType: candidate.signalSourceType,
      sourceEvidenceSummary: candidate.sourceEvidenceSummary,
      sourceRefs: candidate.sourceRefs,
      bidDeadlineDays: candidate.bidDeadlineDays,
      tenderDecision: candidate.tenderDecision,
      evaluatedAt: candidate.evaluatedAt,
    },
    eligibility: {
      eligibility: candidate.eligibility,
      compliant: candidate.compliance,
      capacityFit: candidate.capacityFit,
      missingEligibilityData: buildMissingEligibilityData(candidate),
      ownerActions: eligibilityOwnerActions,
    },
    risk: {
      emdExposure: candidate.emdExposure,
      paymentDelayRisk: candidate.paymentDelayRisk,
      performancePenaltyRisk: candidate.performancePenaltyRisk,
      workingCapitalRequirement: candidate.workingCapitalRequirement,
      documentationBurden: candidate.documentationBurden,
      overallRiskSummary: buildOverallRiskSummary(candidate),
    },
    economics: {
      unitEconomics: candidate.unitEconomics,
      ownerActions: economicsOwnerActions,
    },
    ownerActions: {
      missingData: candidate.missingData,
      preparationSteps: buildPreparationSteps(candidate),
      approvalNote:
        "This pack is a preparation document only. No bid may be submitted without explicit owner approval. submissionAllowed is always false.",
    },
    systemCapabilityRecommendation: candidate.systemCapabilityRecommendation,
    ownerVisibleExplanation: candidate.ownerVisibleExplanation,
    submissionAllowed: false,
    ownerApprovalRequired: true,
    generatedAt,
  };
}
