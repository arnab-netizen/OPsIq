/**
 * External Opportunity Intelligence v1 (depth pass) — a real intake→filter→promote loop, not a signal-enum
 * shell. It ingests structured, evidence-backed raw external signals broadly and filters aggressively so the
 * owner sees only the top MATERIAL opportunity (plus a tender/procurement candidate when materially relevant).
 *
 * Pipeline (all pure + deterministic):
 *   raw signals
 *   → normalize (fill bands, compute evidence completeness + missing fields)
 *   → dedupe (collapse duplicates by dedupe key)
 *   → classify (RAW / DUPLICATE / IRRELEVANT / NEEDS_DATA / CANDIDATE / REJECTED / PARKED)
 *   → tender/procurement signals go through a SEPARATE eligibility/cost/compliance/cash/capacity screen
 *   → promote non-tender candidates with a recommended next step
 *   → cash/profit guardrail, capability-gap check, approval-policy screen, owner-workload screen
 *   → owner cockpit summary (top candidate + top tender only)
 *
 * Hard governance rules:
 * - It NEVER scrapes, connects live paid sources, launches, spends, or contacts anyone.
 * - No candidate is ever ready-to-scale; validation is always required before scale.
 * - Tenders are NEVER auto-submitted and NEVER "ready-to-bid" unless eligibility, cost, compliance, capacity
 *   and cash exposure are all known; owner approval is mandatory before any submission. PREPARE_BID_DRAFT is
 *   preparation of an owner-reviewable draft only — not submission.
 * - Missing evidence lowers confidence; missing unit economics blocks confident promotion and links a
 *   capability gap. High cash / EMD / payment-delay exposure routes to owner review.
 * - No fabricated market data, no "highest profit"/guaranteed-success claim, no hidden score.
 */

import type { ApprovalLevel } from "./process-intelligence";

export type OpportunityType =
  | "NEW_SERVICE" | "B2B_OFFER" | "PRICING_TEST" | "CUSTOMER_SEGMENT" | "RETENTION_CAMPAIGN"
  | "LOCAL_PARTNERSHIP" | "OPERATIONS_ADJACENCY" | "MARKETING_CHANNEL" | "SUPPLIER_ADVANTAGE"
  | "TENDER_BID" | "OTHER";

export type SignalSourceType =
  | "COMPETITOR_REVIEW_GAP" | "LOCAL_SEARCH_DEMAND" | "CUSTOMER_COMPLAINT_PATTERN" | "B2B_DEMAND_SIGNAL"
  | "PRICING_GAP" | "SERVICE_GAP" | "SEASONAL_DEMAND" | "LOCAL_EVENT_SIGNAL" | "SUPPLIER_OR_COST_ADVANTAGE"
  | "MARKET_TREND_SIGNAL" | "REGULATORY_OR_COMPLIANCE_CHANGE" | "COMMUNITY_OR_APARTMENT_DEMAND"
  | "SOCIAL_MEDIA_PAIN_POINT" | "MANUAL_OWNER_OBSERVATION" | "GOVERNMENT_TENDER" | "PUBLIC_PROCUREMENT"
  | "CORPORATE_VENDOR_OPPORTUNITY" | "GRANT_OR_SCHEME" | "EXPORT_OR_INSTITUTIONAL_DEMAND" | "DATA_INSUFFICIENT";

/** The set of source types routed through the tender/procurement screen. */
const TENDER_SOURCES = new Set<SignalSourceType>([
  "GOVERNMENT_TENDER", "PUBLIC_PROCUREMENT", "CORPORATE_VENDOR_OPPORTUNITY", "EXPORT_OR_INSTITUTIONAL_DEMAND",
]);

export type SignalClassification = "RAW" | "DUPLICATE" | "IRRELEVANT" | "NEEDS_DATA" | "CANDIDATE" | "REJECTED" | "PARKED";

export type RecommendedNextStep =
  | "REJECT" | "PARK" | "COLLECT_DATA" | "COLLECT_ELIGIBILITY_DATA" | "COLLECT_COST_DATA"
  | "VALIDATE_CHEAPLY" | "PREPARE_BID_DRAFT" | "OWNER_REVIEW" | "NEEDS_CAPABILITY";

export type TenderDecision =
  | "REJECT_UNFIT" | "PARK" | "COLLECT_ELIGIBILITY_DATA" | "COLLECT_COST_DATA" | "OWNER_REVIEW_REQUIRED"
  | "VALIDATE_CHEAPLY" | "PREPARE_BID_DRAFT" | "DO_NOT_BID" | "NEEDS_CAPABILITY";

export type OppConfidence = "HIGH" | "MEDIUM" | "LOW" | "NEEDS_DATA";
export type RiskBand = "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
export type FitBand = "STRONG" | "MODERATE" | "WEAK" | "UNKNOWN";
export type KnownState = "KNOWN" | "UNKNOWN";

/** Tender/procurement-specific fields, present only on tender signals. */
export interface TenderSignalFields {
  eligibility: KnownState;
  eligible: boolean | null; // only meaningful when eligibility is KNOWN
  emdExposure: RiskBand; // earnest-money / security-deposit exposure
  paymentDelayRisk: RiskBand;
  performancePenaltyRisk: RiskBand;
  workingCapitalRequirement: RiskBand;
  compliance: KnownState;
  documentationBurden: RiskBand;
  capacityFit: FitBand;
  unitEconomics: KnownState;
  bidDeadlineDays: number | null;
}

/** One structured, evidence-backed raw external signal (never scraped here). */
export interface RawOpportunitySignal {
  signalId: string;
  dedupeKey: string; // duplicates share a dedupe key
  signalSourceType: SignalSourceType;
  opportunityType: OpportunityType;
  sourceEvidenceSummary: string;
  sourceRefs: string[];
  customerPainPoint: string;
  targetCustomerSegment: string;
  expectedValueHypothesis: string;
  relevanceToBusiness: FitBand;
  rawConfidence: OppConfidence;
  cashRisk: RiskBand;
  ownerWorkloadRisk: RiskBand;
  operationalFit: FitBand;
  capabilityFit: FitBand;
  localFeasibility: FitBand;
  legalOrComplianceRisk: RiskBand;
  hasUnitEconomics: boolean;
  validationCostEstimate: number | null;
  missingData: string[];
  relatedCashProfitSignal: string | null;
  relatedCapabilityGap: string | null;
  relatedConstraint: string | null;
  relatedSLO: string | null;
  tender?: TenderSignalFields;
}

export interface ExternalOpportunityContext {
  cashProfitRiskActive: boolean; // an active cash/profit protection risk that should block risky expansion
  capabilityGapPresent: boolean; // OpsIQ lacks a capability required to manage this class of opportunity
}

export interface ExternalOpportunityInput {
  signals: RawOpportunitySignal[];
  context: ExternalOpportunityContext;
}

/** A normalized signal with derived completeness metadata. */
export interface NormalizedSignal extends RawOpportunitySignal {
  isTender: boolean;
  evidenceComplete: boolean;
  promotionReady: boolean; // has business need + target + evidence to be a candidate
  missingFields: string[];
}

/** Classification outcome for a raw signal. */
export interface ClassifiedSignal {
  signalId: string;
  signalSourceType: SignalSourceType;
  classification: SignalClassification;
  reason: string;
}

/** The promoted opportunity candidate (26-field shape). */
export interface ExternalOpportunityCandidate {
  workspaceId: string;
  opportunityType: OpportunityType;
  signalSourceType: SignalSourceType;
  sourceEvidenceSummary: string;
  sourceRefs: string[];
  customerPainPoint: string;
  targetCustomerSegment: string;
  expectedValueHypothesis: string;
  confidence: OppConfidence;
  missingData: string[];
  cashRisk: RiskBand;
  ownerWorkloadRisk: RiskBand;
  operationalFit: FitBand;
  capabilityFit: FitBand;
  localFeasibility: FitBand;
  legalOrComplianceRisk: RiskBand;
  validationCostEstimate: number | null;
  validationRequired: boolean; // always true
  recommendedNextStep: RecommendedNextStep;
  approvalLevel: ApprovalLevel;
  relatedCashProfitSignal: string | null;
  relatedCapabilityGap: string | null;
  systemCapabilityRecommendation: string | null;
  relatedConstraint: string | null;
  relatedSLO: string | null;
  riskIfIgnored: string;
  evaluatedAt: string;
}

/** The tender/procurement candidate (separate screen). */
export interface TenderProcurementCandidate {
  workspaceId: string;
  signalSourceType: SignalSourceType;
  opportunityTitle: string;
  sourceEvidenceSummary: string;
  sourceRefs: string[];
  targetBuyer: string;
  eligibility: KnownState;
  emdExposure: RiskBand;
  paymentDelayRisk: RiskBand;
  performancePenaltyRisk: RiskBand;
  workingCapitalRequirement: RiskBand;
  compliance: KnownState;
  documentationBurden: RiskBand;
  capacityFit: FitBand;
  unitEconomics: KnownState;
  bidDeadlineDays: number | null;
  tenderDecision: TenderDecision;
  readyToBid: boolean; // never true unless eligibility+cost+compliance+capacity+cash are all known & safe
  ownerApprovalRequired: boolean; // always true before any submission
  approvalLevel: ApprovalLevel;
  missingData: string[];
  systemCapabilityRecommendation: string | null;
  ownerVisibleExplanation: string;
  evaluatedAt: string;
}

export interface ExternalOpportunitySummary {
  rawSignals: number;
  duplicatesCollapsed: number;
  irrelevantOrParked: number;
  needsData: number;
  candidates: number;
  tenderCandidates: number;
  ownerReviewRequired: number;
}

export interface ExternalOpportunityAnalysis {
  workspaceId: string;
  classifiedSignals: ClassifiedSignal[];
  candidates: ExternalOpportunityCandidate[];
  topCandidate: ExternalOpportunityCandidate | null;
  tenderCandidates: TenderProcurementCandidate[];
  topTenderCandidate: TenderProcurementCandidate | null;
  capabilityRecommendations: string[];
  summary: ExternalOpportunitySummary;
  evaluatedAt: string;
}

// ── Pipeline stage 1: normalize ────────────────────────────────────────────────────────────────────────

/** Fill defaults, compute evidence completeness + promotion readiness + missing fields. Pure. */
export function normalizeExternalOpportunitySignals(signals: RawOpportunitySignal[]): NormalizedSignal[] {
  return signals.map((s) => {
    const missingFields: string[] = [];
    if (s.sourceEvidenceSummary.trim().length === 0) missingFields.push("source evidence");
    if (s.sourceRefs.length === 0) missingFields.push("source references");
    if (s.customerPainPoint.trim().length === 0) missingFields.push("customer pain point / need");
    if (s.targetCustomerSegment.trim().length === 0) missingFields.push("target customer/buyer");
    if (s.expectedValueHypothesis.trim().length === 0) missingFields.push("value hypothesis");
    const evidenceComplete = s.sourceEvidenceSummary.trim().length > 0 && s.sourceRefs.length > 0;
    const promotionReady = missingFields.length === 0 && s.signalSourceType !== "DATA_INSUFFICIENT" && s.rawConfidence !== "NEEDS_DATA";
    return { ...s, isTender: TENDER_SOURCES.has(s.signalSourceType), evidenceComplete, promotionReady, missingFields };
  });
}

// ── Pipeline stage 2: dedupe ───────────────────────────────────────────────────────────────────────────

/** Collapse duplicates by dedupe key (first wins). Returns unique signals + the collapsed duplicate ids. */
export function dedupeOpportunitySignals(signals: NormalizedSignal[]): { unique: NormalizedSignal[]; duplicates: NormalizedSignal[] } {
  const seen = new Set<string>();
  const unique: NormalizedSignal[] = [];
  const duplicates: NormalizedSignal[] = [];
  for (const s of signals) {
    if (seen.has(s.dedupeKey)) { duplicates.push(s); continue; }
    seen.add(s.dedupeKey);
    unique.push(s);
  }
  return { unique, duplicates };
}

// ── Pipeline stage 3: classify ─────────────────────────────────────────────────────────────────────────

/** Classify each unique signal. Vague / unsupported ideas never become owner-visible candidates. Pure. */
export function classifyRawOpportunitySignals(unique: NormalizedSignal[], duplicates: NormalizedSignal[]): ClassifiedSignal[] {
  const out: ClassifiedSignal[] = [];
  for (const d of duplicates) {
    out.push({ signalId: d.signalId, signalSourceType: d.signalSourceType, classification: "DUPLICATE", reason: "collapsed into an earlier identical signal" });
  }
  for (const s of unique) {
    let classification: SignalClassification;
    let reason: string;
    if (s.signalSourceType === "DATA_INSUFFICIENT" || !s.evidenceComplete) {
      classification = "NEEDS_DATA";
      reason = `not enough evidence yet (${s.missingFields.join(", ") || "insufficient linked evidence"})`;
    } else if (s.relevanceToBusiness === "WEAK" && s.operationalFit === "WEAK" && s.localFeasibility === "WEAK") {
      classification = "REJECTED";
      reason = "weak business relevance and no operational/local fit";
    } else if (s.relevanceToBusiness === "WEAK" || s.operationalFit === "WEAK" || s.localFeasibility === "WEAK") {
      classification = "PARKED";
      reason = "weak fit — parked to revisit if a stronger signal appears";
    } else if (!s.promotionReady) {
      classification = "NEEDS_DATA";
      reason = `missing ${s.missingFields.join(", ") || "required fields"} before it can be a candidate`;
    } else {
      classification = "CANDIDATE";
      reason = "material, relevant, evidence-backed";
    }
    out.push({ signalId: s.signalId, signalSourceType: s.signalSourceType, classification, reason });
  }
  return out;
}

// ── Pipeline stage 4: tender / procurement screen ──────────────────────────────────────────────────────

/**
 * Screen a tender/procurement signal. Never auto-submits; never ready-to-bid unless eligibility, cost,
 * compliance, capacity, and cash exposure are all known & safe. Owner approval mandatory before submission.
 */
export function screenTenderProcurementSignal(sig: NormalizedSignal, ctx: ExternalOpportunityContext, workspaceId: string, evaluatedAt: string): TenderProcurementCandidate {
  const t: TenderSignalFields = sig.tender ?? {
    eligibility: "UNKNOWN", eligible: null, emdExposure: "UNKNOWN", paymentDelayRisk: "UNKNOWN",
    performancePenaltyRisk: "UNKNOWN", workingCapitalRequirement: "UNKNOWN", compliance: "UNKNOWN",
    documentationBurden: "UNKNOWN", capacityFit: "UNKNOWN", unitEconomics: "UNKNOWN", bidDeadlineDays: null,
  };
  const missingData: string[] = [];
  let systemCapabilityRecommendation: string | null = null;
  let decision: TenderDecision;
  let explanation: string;

  const capabilityMissing = ctx.capabilityGapPresent;
  if (t.eligibility === "KNOWN" && t.eligible === false) {
    decision = "DO_NOT_BID";
    explanation = "Eligibility is confirmed as not met — do not bid.";
  } else if (capabilityMissing && (t.eligibility === "UNKNOWN" || t.unitEconomics === "UNKNOWN")) {
    decision = "NEEDS_CAPABILITY";
    systemCapabilityRecommendation = "OpsIQ needs a tender eligibility + cost/risk checklist capability to screen procurement safely; build it before relying on tender screening.";
    explanation = "OpsIQ lacks the tender eligibility/cost tracking capability to screen this safely.";
    missingData.push("tender eligibility + cost/risk tracking capability");
  } else if (t.eligibility === "UNKNOWN") {
    decision = "COLLECT_ELIGIBILITY_DATA";
    explanation = "Eligibility is unknown — collect the eligibility criteria before doing anything else.";
    missingData.push("eligibility criteria");
  } else if (t.unitEconomics === "UNKNOWN") {
    decision = "COLLECT_COST_DATA";
    explanation = "The cost/unit economics of fulfilling this tender are unknown — collect them before pricing a bid.";
    missingData.push("cost / unit economics");
  } else if (t.compliance === "UNKNOWN") {
    decision = "OWNER_REVIEW_REQUIRED";
    explanation = "Compliance/documentation requirements are unclear — the owner must review before proceeding.";
    missingData.push("compliance requirements");
  } else if (t.emdExposure === "HIGH" || t.paymentDelayRisk === "HIGH" || t.workingCapitalRequirement === "HIGH" || ctx.cashProfitRiskActive) {
    decision = "OWNER_REVIEW_REQUIRED";
    explanation = "High earnest-money / payment-delay / working-capital exposure — the owner must review the cash risk before any bid.";
  } else if (t.capacityFit === "WEAK" || t.capacityFit === "UNKNOWN") {
    decision = "PARK";
    explanation = "Capacity to deliver is weak or unknown — park until capacity is confirmed.";
    if (t.capacityFit === "UNKNOWN") missingData.push("delivery capacity fit");
  } else if (sig.relevanceToBusiness === "WEAK") {
    decision = "REJECT_UNFIT";
    explanation = "Weak fit with the current business — not worth pursuing.";
  } else {
    // Everything known and safe → prepare an owner-reviewable draft only. NOT a submission.
    decision = "PREPARE_BID_DRAFT";
    explanation = "Eligibility, cost, compliance, capacity and cash exposure are known and within reach — prepare an owner-reviewable bid draft. OpsIQ will not submit; the owner approves and submits.";
  }

  const readyToBid = decision === "PREPARE_BID_DRAFT" &&
    t.eligibility === "KNOWN" && t.unitEconomics === "KNOWN" && t.compliance === "KNOWN" &&
    t.capacityFit !== "WEAK" && t.capacityFit !== "UNKNOWN" &&
    t.emdExposure !== "HIGH" && t.paymentDelayRisk !== "HIGH" && t.workingCapitalRequirement !== "HIGH";

  return {
    workspaceId,
    signalSourceType: sig.signalSourceType,
    opportunityTitle: sig.expectedValueHypothesis || "Procurement / tender opportunity",
    sourceEvidenceSummary: sig.sourceEvidenceSummary,
    sourceRefs: sig.sourceRefs,
    targetBuyer: sig.targetCustomerSegment,
    eligibility: t.eligibility,
    emdExposure: t.emdExposure,
    paymentDelayRisk: t.paymentDelayRisk,
    performancePenaltyRisk: t.performancePenaltyRisk,
    workingCapitalRequirement: t.workingCapitalRequirement,
    compliance: t.compliance,
    documentationBurden: t.documentationBurden,
    capacityFit: t.capacityFit,
    unitEconomics: t.unitEconomics,
    bidDeadlineDays: t.bidDeadlineDays,
    tenderDecision: decision,
    readyToBid, // NEVER a submission — only signals a draft may be prepared
    ownerApprovalRequired: true, // always, before any submission
    approvalLevel: "OWNER",
    missingData: missingData.length ? missingData : sig.missingData,
    systemCapabilityRecommendation,
    ownerVisibleExplanation: explanation,
    evaluatedAt,
  };
}

// ── Pipeline stage 5: promote + guardrails (non-tender candidates) ──────────────────────────────────────

function lowerConfidence(c: OppConfidence, floor: OppConfidence): OppConfidence {
  const rank: Record<OppConfidence, number> = { HIGH: 0, MEDIUM: 1, LOW: 2, NEEDS_DATA: 3 };
  return rank[c] >= rank[floor] ? c : floor;
}

/** Cash/profit guardrail + capability-gap check + approval-policy + owner-workload screen, applied in order. */
export function promoteOpportunityCandidate(sig: NormalizedSignal, ctx: ExternalOpportunityContext, workspaceId: string, evaluatedAt: string): ExternalOpportunityCandidate {
  let confidence = sig.rawConfidence;
  if (sig.missingData.length > 0) confidence = lowerConfidence(confidence, "LOW");
  if (!sig.hasUnitEconomics) confidence = lowerConfidence(confidence, "LOW");

  const highCash = sig.cashRisk === "HIGH" || ctx.cashProfitRiskActive;
  const legalUnclear = sig.legalOrComplianceRisk === "HIGH" || sig.legalOrComplianceRisk === "UNKNOWN";
  const capabilityMissing = ctx.capabilityGapPresent || sig.capabilityFit === "WEAK" || !sig.hasUnitEconomics;

  let recommendedNextStep: RecommendedNextStep;
  let riskIfIgnored: string;
  let systemCapabilityRecommendation: string | null = null;
  let relatedCapabilityGap = sig.relatedCapabilityGap;

  if (highCash) {
    // Cash/profit protection blocks risky expansion → owner decides.
    recommendedNextStep = "OWNER_REVIEW";
    riskIfIgnored = "A potentially real opportunity is paused until cash is safe — acceptable, since chasing it now could strain cash.";
  } else if (legalUnclear) {
    recommendedNextStep = "OWNER_REVIEW";
    riskIfIgnored = "Unclear legal/compliance exposure — must be reviewed by the owner before any test.";
  } else if (!sig.hasUnitEconomics) {
    // Cannot measure the opportunity's economics → collect the cost data / surface the capability gap.
    recommendedNextStep = capabilityMissing ? "NEEDS_CAPABILITY" : "COLLECT_COST_DATA";
    if (recommendedNextStep === "NEEDS_CAPABILITY") {
      relatedCapabilityGap = relatedCapabilityGap ?? "MISSING_UNIT_ECONOMICS_OR_MEASUREMENT";
      systemCapabilityRecommendation = "OpsIQ cannot measure this opportunity's economics — it needs a unit-economics / acquisition-cost capture capability before a confident recommendation.";
    }
    riskIfIgnored = "The opportunity may be real but cannot be measured safely until its unit economics are captured.";
  } else if (sig.operationalFit === "WEAK" || sig.localFeasibility === "WEAK") {
    recommendedNextStep = "PARK";
    riskIfIgnored = "Weak operational/local fit — safe to park and revisit if a stronger signal appears.";
  } else {
    recommendedNextStep = "VALIDATE_CHEAPLY";
    riskIfIgnored = "A plausible, low-risk opportunity goes untested — a cheap validation would confirm or rule it out.";
  }

  // Owner-workload screen: a high-workload test should be an owner decision, not a routine one.
  if (sig.ownerWorkloadRisk === "HIGH" && recommendedNextStep === "VALIDATE_CHEAPLY") {
    recommendedNextStep = "OWNER_REVIEW";
    riskIfIgnored = "The test would add significant owner workload — the owner should decide whether it is worth their time now.";
  }

  // Approval-policy screen: owner for material/high-risk, manager for cheap safe next steps.
  const ownerGated = highCash || legalUnclear || recommendedNextStep === "OWNER_REVIEW";
  const approvalLevel: ApprovalLevel = ownerGated ? "OWNER" : "MANAGER";

  return {
    workspaceId,
    opportunityType: sig.opportunityType,
    signalSourceType: sig.signalSourceType,
    sourceEvidenceSummary: sig.sourceEvidenceSummary,
    sourceRefs: sig.sourceRefs,
    customerPainPoint: sig.customerPainPoint,
    targetCustomerSegment: sig.targetCustomerSegment,
    expectedValueHypothesis: sig.expectedValueHypothesis,
    confidence,
    missingData: sig.missingData,
    cashRisk: sig.cashRisk,
    ownerWorkloadRisk: sig.ownerWorkloadRisk,
    operationalFit: sig.operationalFit,
    capabilityFit: sig.capabilityFit,
    localFeasibility: sig.localFeasibility,
    legalOrComplianceRisk: sig.legalOrComplianceRisk,
    validationCostEstimate: sig.validationCostEstimate,
    validationRequired: true,
    recommendedNextStep,
    approvalLevel,
    relatedCashProfitSignal: sig.relatedCashProfitSignal,
    relatedCapabilityGap,
    systemCapabilityRecommendation,
    relatedConstraint: sig.relatedConstraint,
    relatedSLO: sig.relatedSLO,
    riskIfIgnored,
    evaluatedAt,
  };
}

// ── Orchestrator ───────────────────────────────────────────────────────────────────────────────────────

const STEP_RANK: Record<RecommendedNextStep, number> = {
  VALIDATE_CHEAPLY: 0, PREPARE_BID_DRAFT: 1, OWNER_REVIEW: 2, NEEDS_CAPABILITY: 3, COLLECT_COST_DATA: 4,
  COLLECT_ELIGIBILITY_DATA: 5, COLLECT_DATA: 6, PARK: 7, REJECT: 8,
};
const CONFIDENCE_RANK: Record<OppConfidence, number> = { HIGH: 0, MEDIUM: 1, LOW: 2, NEEDS_DATA: 3 };
const TENDER_RANK: Record<TenderDecision, number> = {
  PREPARE_BID_DRAFT: 0, VALIDATE_CHEAPLY: 1, OWNER_REVIEW_REQUIRED: 2, NEEDS_CAPABILITY: 3, COLLECT_COST_DATA: 4,
  COLLECT_ELIGIBILITY_DATA: 5, PARK: 6, DO_NOT_BID: 7, REJECT_UNFIT: 8,
};

/**
 * Run the full loop. Pure + deterministic. The owner cockpit sees only the top material candidate and the
 * top tender candidate; everything else is classified and summarised. No candidate is ever ready-to-scale.
 */
export function buildExternalOpportunityIntelligence(
  input: ExternalOpportunityInput,
  workspaceId: string,
  evaluatedAt: string,
): ExternalOpportunityAnalysis {
  const normalized = normalizeExternalOpportunitySignals(input.signals);
  const { unique, duplicates } = dedupeOpportunitySignals(normalized);
  const classifiedSignals = classifyRawOpportunitySignals(unique, duplicates);
  const candidateIds = new Set(classifiedSignals.filter((c) => c.classification === "CANDIDATE").map((c) => c.signalId));

  const candidates: ExternalOpportunityCandidate[] = [];
  const tenderCandidates: TenderProcurementCandidate[] = [];
  for (const s of unique) {
    if (s.isTender) {
      // Tenders are screened even when evidence is thin (they surface eligibility/data gaps to the owner).
      tenderCandidates.push(screenTenderProcurementSignal(s, input.context, workspaceId, evaluatedAt));
    } else if (candidateIds.has(s.signalId)) {
      candidates.push(promoteOpportunityCandidate(s, input.context, workspaceId, evaluatedAt));
    }
  }

  candidates.sort((a, b) => STEP_RANK[a.recommendedNextStep] - STEP_RANK[b.recommendedNextStep] || CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence]);
  tenderCandidates.sort((a, b) => TENDER_RANK[a.tenderDecision] - TENDER_RANK[b.tenderDecision]);

  const capabilityRecommendations = Array.from(new Set([
    ...candidates.map((c) => c.systemCapabilityRecommendation),
    ...tenderCandidates.map((t) => t.systemCapabilityRecommendation),
  ].filter((r): r is string => r !== null)));

  const summary: ExternalOpportunitySummary = {
    rawSignals: input.signals.length,
    duplicatesCollapsed: duplicates.length,
    irrelevantOrParked: classifiedSignals.filter((c) => c.classification === "IRRELEVANT" || c.classification === "PARKED" || c.classification === "REJECTED").length,
    needsData: classifiedSignals.filter((c) => c.classification === "NEEDS_DATA").length,
    candidates: candidates.length,
    tenderCandidates: tenderCandidates.length,
    ownerReviewRequired: candidates.filter((c) => c.approvalLevel === "OWNER").length + tenderCandidates.filter((t) => t.ownerApprovalRequired).length,
  };

  return {
    workspaceId,
    classifiedSignals,
    candidates,
    topCandidate: candidates[0] ?? null,
    tenderCandidates,
    topTenderCandidate: tenderCandidates[0] ?? null,
    capabilityRecommendations,
    summary,
    evaluatedAt,
  };
}
