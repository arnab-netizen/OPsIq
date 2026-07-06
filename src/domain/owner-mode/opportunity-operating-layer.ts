/**
 * Opportunity Operating Layer (hostile-hardening depth pass) — turns raw opportunity signals into a real
 * opportunity OPERATING layer, not a passive signal list. It runs the full decision loop on top of the
 * External Opportunity Intelligence engine and enriches every candidate with the checks a real owner needs
 * before spending a rupee or an hour:
 *
 *   source quality + evidence strength
 *   → current-business-fit gate (bottlenecks / capacity / cash / owner workload / SOP gaps / constraints)
 *   → tender/procurement bid-no-bid gate (eligibility / documents / cost / compliance / EMD / deadline)
 *   → win-readiness (+ reasons) and a proof-pack requirement
 *   → a delegated preparation checklist (owner does material decisions only)
 *   → freshness / staleness (expired tenders can never be active)
 *   → explicit negative reasons
 *   → next-action ownership
 *   → transparent opportunity-quality band (no hidden score)
 *   → cluster/anti-spam grouping (many similar signals → ONE owner card)
 *   → repeated-blocker learning → capability recommendations.
 *
 * Hard governance: nothing scales on a hunch (validation always required); tenders are never auto-submitted
 * and PREPARE_BID_DRAFT ≠ submission; no fabricated market data / profit / ROI / win-probability; no hidden
 * numeric score; unknown data can never yield HIGH quality or STRONG fit; unsafe-under-current-constraints
 * opportunities are parked/downgraded.
 */

import {
  buildExternalOpportunityIntelligence,
  type ExternalOpportunityCandidate,
  type TenderProcurementCandidate,
  type ExternalOpportunityContext,
  type FitBand,
  type RiskBand,
  type OppConfidence,
} from "./external-opportunity-intelligence";
import {
  mapPersistedSignalToRaw,
  isTenderIntake,
  type PersistedIntakeRow,
  type SourceQuality,
  type ExternalOpportunityIntakeType,
} from "./external-opportunity-intake";
import type { ApprovalLevel } from "./process-intelligence";

export type EvidenceStrength = "STRONG" | "MODERATE" | "WEAK" | "INSUFFICIENT";
export type ExecutionReadiness =
  | "READY_TO_VALIDATE" | "NEEDS_DATA" | "BLOCKED_BY_CAPACITY" | "BLOCKED_BY_CASH"
  | "BLOCKED_BY_COMPLIANCE" | "BLOCKED_BY_OWNER_WORKLOAD" | "BLOCKED_BY_CAPABILITY_GAP" | "REJECT_UNFIT";
export type Freshness = "FRESH" | "NEEDS_RECHECK" | "STALE" | "EXPIRED" | "UNKNOWN";
export type EligibilityStatus = "ELIGIBLE" | "NOT_ELIGIBLE" | "UNKNOWN" | "NEEDS_DATA";
export type DeadlineUrgency = "SAFE" | "SOON" | "URGENT" | "EXPIRED" | "UNKNOWN";
export type TenderBidDecision =
  | "DO_NOT_BID" | "REJECT_UNFIT" | "PARK" | "COLLECT_ELIGIBILITY_DATA" | "COLLECT_DOCUMENTS"
  | "COLLECT_COST_DATA" | "OWNER_REVIEW_REQUIRED" | "PREPARE_BID_DRAFT" | "NEEDS_CAPABILITY";
export type WinReadiness = "STRONG" | "MODERATE" | "WEAK" | "UNKNOWN";
export type NextActionOwner = "OWNER" | "MANAGER" | "STAFF" | "OPSIQ_DRAFT" | "EXTERNAL_ADVISOR" | "NO_ACTION";
export type OpportunityQuality = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
export type ChecklistType =
  | "B2B_OPPORTUNITY_PREP" | "TENDER_BID_PREP" | "GRANT_SCHEME_PREP" | "PRICING_TEST_PREP"
  | "CUSTOMER_SEGMENT_PREP" | "PARTNERSHIP_PREP" | "DATA_COLLECTION_PREP";
export type NegativeReason =
  | "LOW_MARGIN_RISK" | "CASH_EXPOSURE_RISK" | "PAYMENT_DELAY_RISK" | "HIGH_OWNER_WORKLOAD"
  | "STAFF_CAPACITY_LIMIT" | "EQUIPMENT_CAPACITY_LIMIT" | "DELIVERY_CAPACITY_LIMIT" | "UNRESOLVED_QUALITY_BOTTLENECK"
  | "MISSING_UNIT_ECONOMICS" | "MISSING_ELIGIBILITY" | "MISSING_DOCUMENTS" | "COMPLIANCE_UNKNOWN"
  | "DEADLINE_TOO_SOON" | "EXPIRED" | "WEAK_EVIDENCE" | "WEAK_WIN_READINESS" | "STRATEGIC_DISTRACTION" | "CAPABILITY_GAP";

/** The current business condition the opportunity must be checked against (built from live now-view data). */
export interface BusinessStateContext {
  hasCriticalQualityBottleneck: boolean;
  hasCashProfitRisk: boolean;
  staffCapacity: FitBand;
  equipmentCapacity: FitBand;
  deliveryCapacity: FitBand;
  ownerWorkloadHigh: boolean;
  unresolvedTrainingOrSopGap: boolean;
  activeHighRiskApproval: boolean;
  capabilityGapPresent: boolean;
  topConstraintType: string | null;
}

export interface TenderReadiness {
  eligibilityKnown: boolean;
  eligibilityStatus: EligibilityStatus;
  documentsKnown: boolean;
  requiredDocuments: string[];
  missingDocuments: string[];
  emdOrSecurityKnown: boolean;
  emdOrSecurityRisk: RiskBand;
  paymentDelayRisk: RiskBand;
  workingCapitalRisk: RiskBand;
  complianceRisk: RiskBand;
  penaltyRisk: RiskBand;
  deadlineKnown: boolean;
  deadlineAt: string | null;
  deadlineUrgency: DeadlineUrgency;
  bidPreparationWorkload: RiskBand;
  submissionAllowed: boolean; // never true here — submission is a separate owner-approved act
  bidDecision: TenderBidDecision;
}

export interface PrepChecklist {
  checklistType: ChecklistType;
  requiredDocuments: string[];
  requiredCostInputs: string[];
  requiredCapacityChecks: string[];
  requiredComplianceChecks: string[];
  requiredProofEvidence: string[];
  requiredOwnerDecision: string[];
  managerCollectableItems: string[];
  staffCollectableItems: string[];
  opsIqDraftableItems: string[];
  deadlineItems: string[];
  blockingItems: string[];
  nextChecklistAction: string;
}

/** One fully-enriched opportunity (the operating record for a single signal). */
export interface OperatingOpportunity {
  signalId: string;
  clusterKey: string;
  rawSignalType: ExternalOpportunityIntakeType;
  opportunityTitle: string;
  targetCustomerSegment: string;
  sourceQuality: SourceQuality;
  evidenceStrength: EvidenceStrength;
  confidence: OppConfidence;
  businessFit: FitBand;
  capacityFit: FitBand;
  executionReadiness: ExecutionReadiness;
  freshness: Freshness;
  deadlineAt: string | null;
  isTender: boolean;
  tenderReadiness: TenderReadiness | null;
  winReadiness: WinReadiness;
  winReadinessReasons: string[];
  proofPackRequirements: string[];
  prepChecklist: PrepChecklist | null;
  negativeReasons: NegativeReason[];
  nextActionOwner: NextActionOwner;
  recommendedNextStep: string;
  approvalLevel: ApprovalLevel;
  opportunityQuality: OpportunityQuality;
  validationRequired: boolean; // always true
  ownerVisibleSummary: string;
  systemCapabilityRecommendation: string | null;
  evaluatedAt: string;
}

export interface OpportunityCluster {
  clusterKey: string;
  clusterTheme: string;
  sourceSignalCount: number;
  strongestEvidenceSummary: string;
  topCandidateKey: string;
  relatedSignalKeys: string[];
  duplicateCount: number;
  ownerVisibleSummary: string;
}

export interface OpportunityOperatingSummary {
  rawSignals: number;
  clusters: number;
  candidates: number;
  tenderCandidates: number;
  parkedOrRejected: number;
  needsData: number;
  ownerReviewRequired: number;
  expiredOrStale: number;
}

export interface OpportunityOperatingAnalysis {
  workspaceId: string;
  opportunities: OperatingOpportunity[];
  topOpportunity: OperatingOpportunity | null;
  clusters: OpportunityCluster[];
  topCluster: OpportunityCluster | null;
  capabilityRecommendations: string[];
  summary: OpportunityOperatingSummary;
  evaluatedAt: string;
}

// ── Derivations ──────────────────────────────────────────────────────────────────────────────────────────

/** Evidence strength is never higher than the source quality permits — unverified/low sources are capped. */
function evidenceStrengthFor(row: PersistedIntakeRow): EvidenceStrength {
  const hasRefs = row.evidenceRefs.length > 0 || row.sourceRef != null;
  const hasNeed = row.extractedBusinessNeed != null && row.extractedBusinessNeed.length > 0;
  const capBySource: EvidenceStrength =
    row.sourceQuality === "VERIFIED_SOURCE" ? "STRONG"
      : row.sourceQuality === "OWNER_OBSERVED" || row.sourceQuality === "STAFF_REPORTED" || row.sourceQuality === "CUSTOMER_REPORTED" ? "MODERATE"
        : row.sourceQuality === "PUBLIC_SOURCE_UNVERIFIED" || row.sourceQuality === "THIRD_PARTY_UNVERIFIED" ? "WEAK"
          : "INSUFFICIENT"; // LOW_CONFIDENCE / UNKNOWN
  let base: EvidenceStrength = hasRefs && hasNeed ? "STRONG" : hasRefs || hasNeed ? "MODERATE" : "WEAK";
  if (row.missingData.length >= 2) base = "WEAK";
  if (!hasNeed && !hasRefs) base = "INSUFFICIENT";
  // Take the weaker of (content-derived) and (source-cap).
  const rank: Record<EvidenceStrength, number> = { STRONG: 0, MODERATE: 1, WEAK: 2, INSUFFICIENT: 3 };
  return rank[base] >= rank[capBySource] ? base : capBySource;
}

function freshnessFor(row: PersistedIntakeRow, nowMs: number): Freshness {
  if (row.deadlineAt && row.deadlineAt.getTime() < nowMs) return "EXPIRED";
  const anchor = row.lastVerifiedAt ?? row.discoveredAt;
  if (!anchor) return row.staleAfterDays != null ? "NEEDS_RECHECK" : "UNKNOWN";
  if (row.staleAfterDays == null) return "UNKNOWN";
  const ageDays = (nowMs - anchor.getTime()) / 86_400_000;
  if (ageDays > row.staleAfterDays) return "STALE";
  if (ageDays > row.staleAfterDays * 0.66) return "NEEDS_RECHECK";
  return "FRESH";
}

function deadlineUrgencyFor(deadlineAt: Date | null, nowMs: number): DeadlineUrgency {
  if (!deadlineAt) return "UNKNOWN";
  const days = (deadlineAt.getTime() - nowMs) / 86_400_000;
  if (days < 0) return "EXPIRED";
  if (days <= 3) return "URGENT";
  if (days <= 10) return "SOON";
  return "SAFE";
}

/** Business-fit + capacity-fit against the current business condition. Unknown capacity ⇒ never STRONG. */
function fitFor(business: BusinessStateContext, addressesBottleneck: boolean): { businessFit: FitBand; capacityFit: FitBand } {
  const caps = [business.staffCapacity, business.equipmentCapacity, business.deliveryCapacity];
  const anyUnknown = caps.some((c) => c === "UNKNOWN");
  const anyWeak = caps.some((c) => c === "WEAK");
  const capacityFit: FitBand = anyWeak ? "WEAK" : anyUnknown ? "UNKNOWN" : caps.every((c) => c === "STRONG") ? "STRONG" : "MODERATE";

  let businessFit: FitBand;
  if (business.hasCriticalQualityBottleneck && !addressesBottleneck) {
    businessFit = "WEAK"; // an unresolved critical bottleneck makes unrelated growth a distraction
  } else if (addressesBottleneck) {
    businessFit = "MODERATE"; // directly helps, but still must be validated (never auto-STRONG)
  } else if (anyUnknown || anyWeak) {
    businessFit = anyWeak ? "WEAK" : "UNKNOWN"; // unknown capacity ⇒ not strong
  } else {
    businessFit = "MODERATE";
  }
  return { businessFit, capacityFit };
}

function collectNegativeReasons(
  row: PersistedIntakeRow, business: BusinessStateContext, evidence: EvidenceStrength, freshness: Freshness,
  capacityFit: FitBand, addressesBottleneck: boolean, tender: TenderReadiness | null, winReadiness: WinReadiness,
): NegativeReason[] {
  const r = new Set<NegativeReason>();
  if (row.cashExposureBand === "HIGH" || business.hasCashProfitRisk) r.add("CASH_EXPOSURE_RISK");
  if (row.ownerWorkloadBand === "HIGH" || business.ownerWorkloadHigh) r.add("HIGH_OWNER_WORKLOAD");
  if (business.staffCapacity === "WEAK") r.add("STAFF_CAPACITY_LIMIT");
  if (business.equipmentCapacity === "WEAK") r.add("EQUIPMENT_CAPACITY_LIMIT");
  if (business.deliveryCapacity === "WEAK") r.add("DELIVERY_CAPACITY_LIMIT");
  if (business.hasCriticalQualityBottleneck && !addressesBottleneck) { r.add("UNRESOLVED_QUALITY_BOTTLENECK"); r.add("STRATEGIC_DISTRACTION"); }
  if (!row.hasUnitEconomics) r.add("MISSING_UNIT_ECONOMICS");
  if (evidence === "WEAK" || evidence === "INSUFFICIENT") r.add("WEAK_EVIDENCE");
  if (freshness === "EXPIRED") r.add("EXPIRED");
  if (business.capabilityGapPresent) r.add("CAPABILITY_GAP");
  if (winReadiness === "WEAK") r.add("WEAK_WIN_READINESS");
  if (capacityFit === "WEAK") r.add("DELIVERY_CAPACITY_LIMIT");
  if (tender) {
    if (tender.eligibilityStatus === "UNKNOWN" || tender.eligibilityStatus === "NEEDS_DATA") r.add("MISSING_ELIGIBILITY");
    if (tender.missingDocuments.length > 0 || !tender.documentsKnown) r.add("MISSING_DOCUMENTS");
    if (tender.complianceRisk === "UNKNOWN" || tender.complianceRisk === "HIGH") r.add("COMPLIANCE_UNKNOWN");
    if (tender.paymentDelayRisk === "HIGH") r.add("PAYMENT_DELAY_RISK");
    if (tender.workingCapitalRisk === "HIGH" || tender.emdOrSecurityRisk === "HIGH") r.add("CASH_EXPOSURE_RISK");
    if (tender.deadlineUrgency === "URGENT") r.add("DEADLINE_TOO_SOON");
    if (tender.deadlineUrgency === "EXPIRED") r.add("EXPIRED");
  }
  return Array.from(r);
}

/** Tender/procurement bid-no-bid gate. Never allows submission; PREPARE_BID_DRAFT ≠ submit. */
function buildTenderReadiness(row: PersistedIntakeRow, business: BusinessStateContext, nowMs: number): TenderReadiness {
  const eligibilityKnown = row.eligibilityRequirements != null;
  const eligibilityStatus: EligibilityStatus = eligibilityKnown ? "NEEDS_DATA" : "UNKNOWN"; // criteria known ≠ we qualify
  const documentsKnown = row.requiredDocuments.length > 0;
  const missingDocuments = row.missingDocuments.length > 0
    ? row.missingDocuments
    : documentsKnown ? [] : ["required tender document list not yet gathered"];
  const complianceRisk: RiskBand = row.complianceRequirements ? "LOW" : "UNKNOWN";
  const deadlineKnown = row.deadlineAt != null;
  const deadlineUrgency = deadlineUrgencyFor(row.deadlineAt, nowMs);
  const emdOrSecurityKnown = row.cashExposureBand !== "UNKNOWN";
  const unitEconomicsKnown = row.tenderOrProcurementValue != null && row.hasUnitEconomics;

  let bidDecision: TenderBidDecision;
  if (deadlineUrgency === "EXPIRED") {
    bidDecision = "DO_NOT_BID";
  } else if (business.capabilityGapPresent && !eligibilityKnown) {
    bidDecision = "NEEDS_CAPABILITY";
  } else if (!eligibilityKnown) {
    bidDecision = "COLLECT_ELIGIBILITY_DATA";
  } else if (!documentsKnown || missingDocuments.length > 0) {
    bidDecision = "COLLECT_DOCUMENTS";
  } else if (!unitEconomicsKnown) {
    bidDecision = "COLLECT_COST_DATA";
  } else if (complianceRisk === "UNKNOWN") {
    bidDecision = "OWNER_REVIEW_REQUIRED";
  } else if (row.cashExposureBand === "HIGH" || business.hasCashProfitRisk) {
    bidDecision = "OWNER_REVIEW_REQUIRED";
  } else {
    bidDecision = "PREPARE_BID_DRAFT"; // an owner-reviewable draft only — never a submission
  }

  return {
    eligibilityKnown,
    eligibilityStatus,
    documentsKnown,
    requiredDocuments: row.requiredDocuments,
    missingDocuments,
    emdOrSecurityKnown,
    emdOrSecurityRisk: row.cashExposureBand,
    paymentDelayRisk: row.cashExposureBand === "HIGH" ? "HIGH" : "UNKNOWN",
    workingCapitalRisk: row.cashExposureBand,
    complianceRisk,
    penaltyRisk: "UNKNOWN",
    deadlineKnown,
    deadlineAt: row.deadlineAt ? row.deadlineAt.toISOString() : null,
    deadlineUrgency,
    bidPreparationWorkload: row.ownerWorkloadBand,
    submissionAllowed: false, // ALWAYS false here — submission is a separate, owner-approved act OpsIQ never does
    bidDecision,
  };
}

function winReadinessFor(row: PersistedIntakeRow, evidence: EvidenceStrength, capacityFit: FitBand, tender: TenderReadiness | null): { winReadiness: WinReadiness; reasons: string[]; proofPack: string[] } {
  const reasons: string[] = [];
  const proofPack: string[] = [];
  const hasProof = row.evidenceRefs.length > 0;
  if (!hasProof) { reasons.push("No past-work / quality proof attached"); proofPack.push("past-work evidence", "quality/process proof"); }
  if (!row.hasUnitEconomics) { reasons.push("Cost/pricing readiness unknown (no unit economics)"); proofPack.push("pricing/costing evidence"); }
  if (capacityFit === "WEAK" || capacityFit === "UNKNOWN") reasons.push(`Execution capacity ${capacityFit.toLowerCase()}`);
  if (tender) {
    if (!tender.eligibilityKnown) reasons.push("Eligibility not established");
    if (tender.missingDocuments.length > 0) { reasons.push("Documentation incomplete"); proofPack.push("compliance documents"); }
    if (tender.deadlineUrgency === "URGENT") reasons.push("Deadline is urgent");
  }
  let winReadiness: WinReadiness;
  if (evidence === "STRONG" && hasProof && row.hasUnitEconomics && (capacityFit === "STRONG" || capacityFit === "MODERATE") && (!tender || tender.eligibilityKnown)) {
    winReadiness = "MODERATE"; // strong inputs → MODERATE at best without a proven track record; never fake-strong
    if (reasons.length === 0) reasons.push("Evidence, proof, cost and capacity inputs are present");
  } else if (evidence === "INSUFFICIENT" || (!hasProof && !row.hasUnitEconomics)) {
    winReadiness = "WEAK";
  } else if (evidence === "WEAK") {
    winReadiness = "WEAK";
  } else {
    winReadiness = "UNKNOWN";
  }
  return { winReadiness, reasons, proofPack: Array.from(new Set(proofPack)) };
}

function checklistTypeFor(row: PersistedIntakeRow): ChecklistType {
  if (isTenderIntake(row.rawSignalType)) return "TENDER_BID_PREP";
  switch (row.rawSignalType) {
    case "B2B_DEMAND_SIGNAL": return "B2B_OPPORTUNITY_PREP";
    case "GRANT_OR_SCHEME_SIGNAL": return "GRANT_SCHEME_PREP";
    case "PRICING_GAP": return "PRICING_TEST_PREP";
    case "COMMUNITY_OR_APARTMENT_DEMAND": return "CUSTOMER_SEGMENT_PREP";
    default: return row.missingData.length > 0 ? "DATA_COLLECTION_PREP" : "B2B_OPPORTUNITY_PREP";
  }
}

function buildPrepChecklist(row: PersistedIntakeRow, tender: TenderReadiness | null, proofPack: string[], nextOwner: NextActionOwner): PrepChecklist {
  const checklistType = checklistTypeFor(row);
  const requiredDocuments = tender ? Array.from(new Set([...tender.requiredDocuments, ...tender.missingDocuments])) : [];
  const requiredCostInputs = row.hasUnitEconomics ? [] : ["per-unit cost", "expected margin"];
  const requiredCapacityChecks = ["staff capacity", "equipment capacity", "delivery capacity"];
  const requiredComplianceChecks = tender && tender.complianceRisk !== "LOW" ? ["compliance / documentation requirements"] : [];
  const requiredProofEvidence = proofPack;
  const requiredOwnerDecision: string[] = [];
  if (tender) requiredOwnerDecision.push("owner approval before any bid submission");
  if (row.cashExposureBand === "HIGH") requiredOwnerDecision.push("owner sign-off on cash exposure");
  const deadlineItems = row.deadlineAt ? [`submit/decide before ${row.deadlineAt.toISOString().slice(0, 10)}`] : [];
  const blockingItems: string[] = [];
  if (tender && !tender.eligibilityKnown) blockingItems.push("eligibility unknown");
  if (tender && tender.missingDocuments.length > 0) blockingItems.push("documents missing");
  if (!row.hasUnitEconomics) blockingItems.push("unit economics missing");

  // Delegation: routine collection to manager/staff; drafts to OpsIQ; material decisions to the owner.
  const managerCollectableItems = [...requiredCostInputs, ...requiredComplianceChecks];
  const staffCollectableItems = [...requiredCapacityChecks];
  const opsIqDraftableItems = ["prepare a prep checklist", "draft the validation plan"].concat(tender ? ["draft an owner-reviewable bid outline (not a submission)"] : []);

  const nextChecklistAction =
    blockingItems.length > 0 ? `Collect: ${blockingItems.join(", ")}`
      : nextOwner === "OWNER" ? "Owner to review before proceeding"
        : "Delegate routine data collection, then validate cheaply";

  return {
    checklistType, requiredDocuments, requiredCostInputs, requiredCapacityChecks, requiredComplianceChecks,
    requiredProofEvidence, requiredOwnerDecision, managerCollectableItems, staffCollectableItems,
    opsIqDraftableItems, deadlineItems, blockingItems, nextChecklistAction,
  };
}

function executionReadinessFor(
  row: PersistedIntakeRow, business: BusinessStateContext, evidence: EvidenceStrength, freshness: Freshness,
  businessFit: FitBand, capacityFit: FitBand, addressesBottleneck: boolean, tender: TenderReadiness | null,
): ExecutionReadiness {
  if (freshness === "EXPIRED") return "REJECT_UNFIT";
  if (businessFit === "WEAK" && !addressesBottleneck) return "REJECT_UNFIT";
  if (business.capabilityGapPresent && !row.hasUnitEconomics) return "BLOCKED_BY_CAPABILITY_GAP";
  if (row.cashExposureBand === "HIGH" || business.hasCashProfitRisk) return "BLOCKED_BY_CASH";
  if (tender && (tender.complianceRisk === "UNKNOWN" || tender.complianceRisk === "HIGH")) return "BLOCKED_BY_COMPLIANCE";
  if (capacityFit === "WEAK") return "BLOCKED_BY_CAPACITY";
  if (row.ownerWorkloadBand === "HIGH" || business.ownerWorkloadHigh) return "BLOCKED_BY_OWNER_WORKLOAD";
  if (evidence === "INSUFFICIENT" || row.missingData.length > 0 || !row.hasUnitEconomics) return "NEEDS_DATA";
  return "READY_TO_VALIDATE";
}

function nextActionOwnerFor(
  readiness: ExecutionReadiness, tender: TenderReadiness | null, row: PersistedIntakeRow, business: BusinessStateContext,
): NextActionOwner {
  if (readiness === "REJECT_UNFIT") return "NO_ACTION";
  if (readiness === "BLOCKED_BY_COMPLIANCE" || (tender && tender.complianceRisk === "UNKNOWN")) return "EXTERNAL_ADVISOR";
  if (readiness === "BLOCKED_BY_CASH" || row.cashExposureBand === "HIGH" || business.hasCashProfitRisk) return "OWNER";
  if (tender && tender.bidDecision === "PREPARE_BID_DRAFT") return "OPSIQ_DRAFT";
  if (readiness === "NEEDS_DATA" || readiness === "BLOCKED_BY_CAPACITY") return "MANAGER";
  if (readiness === "READY_TO_VALIDATE") return "OPSIQ_DRAFT";
  return "OWNER";
}

function opportunityQualityFor(
  evidence: EvidenceStrength, businessFit: FitBand, capacityFit: FitBand, winReadiness: WinReadiness,
  negativeReasons: NegativeReason[], freshness: Freshness,
): OpportunityQuality {
  if (freshness === "EXPIRED") return "LOW";
  if (evidence === "INSUFFICIENT" || businessFit === "UNKNOWN" || capacityFit === "UNKNOWN") return "UNKNOWN";
  const hardNegatives = negativeReasons.filter((n) =>
    n === "UNRESOLVED_QUALITY_BOTTLENECK" || n === "CASH_EXPOSURE_RISK" || n === "STRATEGIC_DISTRACTION" || n === "EXPIRED").length;
  if (hardNegatives > 0 || evidence === "WEAK" || businessFit === "WEAK" || winReadiness === "WEAK") return "LOW";
  if (evidence === "STRONG" && (businessFit === "MODERATE" || businessFit === "STRONG") && (capacityFit === "MODERATE" || capacityFit === "STRONG") && negativeReasons.length <= 1) return "MEDIUM";
  return "LOW";
}

// ── Orchestrator ─────────────────────────────────────────────────────────────────────────────────────────

const QUALITY_RANK: Record<OpportunityQuality, number> = { HIGH: 0, MEDIUM: 1, LOW: 2, UNKNOWN: 3 };
const READINESS_RANK: Record<ExecutionReadiness, number> = {
  READY_TO_VALIDATE: 0, NEEDS_DATA: 1, BLOCKED_BY_OWNER_WORKLOAD: 2, BLOCKED_BY_CAPACITY: 3,
  BLOCKED_BY_CASH: 4, BLOCKED_BY_COMPLIANCE: 5, BLOCKED_BY_CAPABILITY_GAP: 6, REJECT_UNFIT: 7,
};

/** Does this signal directly address the current top constraint / a quality bottleneck? */
function addressesBottleneckFor(row: PersistedIntakeRow, business: BusinessStateContext): boolean {
  if (!business.hasCriticalQualityBottleneck && !business.topConstraintType) return false;
  const t = row.rawSignalType;
  // Retention/service/pricing/supplier signals can address quality/margin/cost bottlenecks; growth-only can't.
  return t === "SERVICE_GAP" || t === "PRICING_GAP" || t === "SUPPLIER_OR_COST_ADVANTAGE" || t === "MANUAL_OWNER_OBSERVATION";
}

/**
 * Build the full opportunity operating layer over the workspace's live persisted signals. Pure +
 * deterministic. Groups similar signals into clusters (owner sees one card per theme), enriches each with
 * the full decision loop, learns from repeated blockers, and surfaces only the top material opportunity.
 */
export function buildOpportunityOperatingLayer(
  rows: PersistedIntakeRow[],
  business: BusinessStateContext,
  workspaceId: string,
  evaluatedAt: string,
): OpportunityOperatingAnalysis {
  const nowMs = Date.parse(evaluatedAt);
  const ctx: ExternalOpportunityContext = { cashProfitRiskActive: business.hasCashProfitRisk, capabilityGapPresent: business.capabilityGapPresent };

  // Base engine pass (classify / dedupe / tender-screen / promote) over the mapped raw signals.
  const raws = rows.map((r) => mapPersistedSignalToRaw(r, nowMs));
  const engine = buildExternalOpportunityIntelligence({ signals: raws, context: ctx }, workspaceId, evaluatedAt);
  const classById = new Map(engine.classifiedSignals.map((c) => [c.signalId, c.classification]));
  const candByType = new Map<string, ExternalOpportunityCandidate>();
  engine.candidates.forEach((c) => candByType.set(`${c.signalSourceType}:${c.opportunityType}`, c));
  const tenderByType = new Map<string, TenderProcurementCandidate>();
  engine.tenderCandidates.forEach((t) => tenderByType.set(t.signalSourceType, t));

  const opportunities: OperatingOpportunity[] = [];
  const blockerCounts = new Map<NegativeReason, number>();

  for (const row of rows) {
    const signalId = `intake:${row.id}`;
    const classification = classById.get(signalId) ?? "RAW";
    const isTender = isTenderIntake(row.rawSignalType);
    const evidence = evidenceStrengthFor(row);
    const freshness = freshnessFor(row, nowMs);
    const addressesBottleneck = addressesBottleneckFor(row, business);
    const { businessFit, capacityFit } = fitFor(business, addressesBottleneck);
    const tender = isTender ? buildTenderReadiness(row, business, nowMs) : null;
    const { winReadiness, reasons: winReasons, proofPack } = winReadinessFor(row, evidence, capacityFit, tender);
    const executionReadiness = executionReadinessFor(row, business, evidence, freshness, businessFit, capacityFit, addressesBottleneck, tender);
    const negativeReasons = collectNegativeReasons(row, business, evidence, freshness, capacityFit, addressesBottleneck, tender, winReadiness);
    negativeReasons.forEach((n) => blockerCounts.set(n, (blockerCounts.get(n) ?? 0) + 1));
    const nextActionOwner = nextActionOwnerFor(executionReadiness, tender, row, business);
    const prepChecklist = classification === "REJECTED" || executionReadiness === "REJECT_UNFIT"
      ? null
      : buildPrepChecklist(row, tender, proofPack, nextActionOwner);
    const opportunityQuality = opportunityQualityFor(evidence, businessFit, capacityFit, winReadiness, negativeReasons, freshness);

    const cand = candByType.get(`${raws.find((r) => r.signalId === signalId)?.signalSourceType}:${raws.find((r) => r.signalId === signalId)?.opportunityType}`);
    const recommendedNextStep = tender
      ? tender.bidDecision
      : freshness === "EXPIRED"
        ? "REJECT"
        : executionReadiness === "REJECT_UNFIT"
          ? "REJECT"
          : businessFit === "WEAK" && !addressesBottleneck
            ? "PARK"
            : (cand?.recommendedNextStep ?? (executionReadiness === "READY_TO_VALIDATE" ? "VALIDATE_CHEAPLY" : "COLLECT_DATA"));
    const approvalLevel: ApprovalLevel = nextActionOwner === "OWNER" || (tender != null) || row.cashExposureBand === "HIGH" ? "OWNER" : "MANAGER";

    const systemCapabilityRecommendation = cand?.systemCapabilityRecommendation
      ?? (tender && tender.bidDecision === "NEEDS_CAPABILITY" ? "OpsIQ needs a tender eligibility + document/cost checklist capability to screen procurement safely." : null);

    opportunities.push({
      signalId,
      clusterKey: row.dedupeKey,
      rawSignalType: row.rawSignalType,
      opportunityTitle: row.extractedBusinessNeed ?? row.rawDescription.slice(0, 80),
      targetCustomerSegment: row.targetCustomerSegment ?? "",
      sourceQuality: row.sourceQuality,
      evidenceStrength: evidence,
      confidence: cand?.confidence ?? (evidence === "STRONG" ? "MEDIUM" : evidence === "INSUFFICIENT" ? "NEEDS_DATA" : "LOW"),
      businessFit,
      capacityFit,
      executionReadiness,
      freshness,
      deadlineAt: row.deadlineAt ? row.deadlineAt.toISOString() : null,
      isTender,
      tenderReadiness: tender,
      winReadiness,
      winReadinessReasons: winReasons,
      proofPackRequirements: proofPack,
      prepChecklist,
      negativeReasons,
      nextActionOwner,
      recommendedNextStep,
      approvalLevel,
      opportunityQuality,
      validationRequired: true,
      ownerVisibleSummary: buildOwnerSummary(row, opportunityQuality, executionReadiness, negativeReasons, tender),
      systemCapabilityRecommendation,
      evaluatedAt,
    });
  }

  // Clustering: group by clusterKey (semantic dedupe key). Owner sees one card per theme.
  const clusterMap = new Map<string, OperatingOpportunity[]>();
  for (const o of opportunities) {
    const arr = clusterMap.get(o.clusterKey) ?? [];
    arr.push(o);
    clusterMap.set(o.clusterKey, arr);
  }
  const clusters: OpportunityCluster[] = Array.from(clusterMap.entries()).map(([clusterKey, members]) => {
    const sorted = [...members].sort((a, b) => QUALITY_RANK[a.opportunityQuality] - QUALITY_RANK[b.opportunityQuality] || READINESS_RANK[a.executionReadiness] - READINESS_RANK[b.executionReadiness]);
    const top = sorted[0];
    return {
      clusterKey,
      clusterTheme: `${top.rawSignalType} · ${top.targetCustomerSegment || "unspecified segment"}`,
      sourceSignalCount: members.length,
      strongestEvidenceSummary: top.ownerVisibleSummary,
      topCandidateKey: top.signalId,
      relatedSignalKeys: members.map((m) => m.signalId),
      duplicateCount: Math.max(0, members.length - 1),
      ownerVisibleSummary: members.length > 1
        ? `${members.length} similar signals grouped — top: ${top.opportunityTitle}`
        : top.opportunityTitle,
    };
  });

  // Rank opportunities: best quality + readiness first; expired/rejected sink.
  opportunities.sort((a, b) => QUALITY_RANK[a.opportunityQuality] - QUALITY_RANK[b.opportunityQuality] || READINESS_RANK[a.executionReadiness] - READINESS_RANK[b.executionReadiness]);
  clusters.sort((a, b) => b.sourceSignalCount - a.sourceSignalCount);

  // Repeated-blocker learning → capability recommendations (a blocker hit ≥2× becomes a system need).
  const capabilityRecommendations = new Set<string>();
  opportunities.forEach((o) => { if (o.systemCapabilityRecommendation) capabilityRecommendations.add(o.systemCapabilityRecommendation); });
  for (const [reason, count] of blockerCounts.entries()) {
    if (count >= 2) capabilityRecommendations.add(capabilityRecFor(reason));
  }

  const summary: OpportunityOperatingSummary = {
    rawSignals: rows.length,
    clusters: clusters.length,
    candidates: opportunities.filter((o) => o.recommendedNextStep === "VALIDATE_CHEAPLY" || o.recommendedNextStep === "PREPARE_BID_DRAFT").length,
    tenderCandidates: opportunities.filter((o) => o.isTender).length,
    parkedOrRejected: opportunities.filter((o) => o.recommendedNextStep === "PARK" || o.recommendedNextStep === "REJECT" || o.recommendedNextStep === "REJECT_UNFIT" || o.recommendedNextStep === "DO_NOT_BID").length,
    needsData: opportunities.filter((o) => o.executionReadiness === "NEEDS_DATA").length,
    ownerReviewRequired: opportunities.filter((o) => o.nextActionOwner === "OWNER").length,
    expiredOrStale: opportunities.filter((o) => o.freshness === "EXPIRED" || o.freshness === "STALE").length,
  };

  // The cockpit's top opportunity must be a live (non-expired) one where possible.
  const topOpportunity = opportunities.find((o) => o.freshness !== "EXPIRED") ?? opportunities[0] ?? null;

  return {
    workspaceId,
    opportunities,
    topOpportunity,
    clusters,
    topCluster: clusters[0] ?? null,
    capabilityRecommendations: Array.from(capabilityRecommendations),
    summary,
    evaluatedAt,
  };
}

function capabilityRecFor(reason: NegativeReason): string {
  switch (reason) {
    case "MISSING_UNIT_ECONOMICS": return "Repeated opportunities blocked by missing unit economics — build a unit-economics capture capability.";
    case "MISSING_DOCUMENTS": return "Repeated tenders blocked by missing documents — build a tender document/proof-pack readiness capability.";
    case "MISSING_ELIGIBILITY": return "Repeated tenders blocked by unknown eligibility — build a tender eligibility checklist capability.";
    case "DELIVERY_CAPACITY_LIMIT": return "Repeated opportunities blocked by delivery capacity — build a capacity-planning capability.";
    case "HIGH_OWNER_WORKLOAD": return "Repeated opportunities blocked by owner workload — build delegation/triage capability.";
    case "COMPLIANCE_UNKNOWN": return "Repeated opportunities blocked by unknown compliance — build a compliance-check capability or engage an advisor.";
    case "WEAK_EVIDENCE": return "Repeated weak-evidence signals — build a structured evidence-capture intake.";
    default: return `Repeated blocker (${reason}) — surface a capability to unblock future opportunities.`;
  }
}

function buildOwnerSummary(row: PersistedIntakeRow, quality: OpportunityQuality, readiness: ExecutionReadiness, negatives: NegativeReason[], tender: TenderReadiness | null): string {
  const title = row.extractedBusinessNeed ?? row.rawDescription.slice(0, 60);
  const q = `${quality} quality`;
  const step = tender ? tender.bidDecision.replace(/_/g, " ").toLowerCase() : readiness.replace(/_/g, " ").toLowerCase();
  const why = negatives.length > 0 ? ` — watch: ${negatives.slice(0, 3).join(", ")}` : "";
  return `${title} (${q}; ${step})${why}`;
}
