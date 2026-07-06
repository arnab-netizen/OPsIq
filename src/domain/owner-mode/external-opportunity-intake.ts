/**
 * Structured External Opportunity Intake (depth pass) — the governed, pure mapping that turns a REAL
 * owner/manager/system-submitted structured opportunity signal into the engine's `RawOpportunitySignal`,
 * so the External Opportunity Intelligence loop (classify → dedupe → tender-screen → promote) can operate on
 * live submissions instead of only DB-sim/injected data.
 *
 * This is controlled *structured* intake — NOT scraping, NOT autonomous external action, NOT outbound
 * contact, NOT spend. It only accepts a structured description a human (or an internal system) submits, and
 * normalises it. All qualitative bands (relevance / cash exposure / workload) are the SUBMITTER'S honest
 * assessment carried through verbatim — OpsIQ never fabricates a band, a market figure, or a profit number.
 * Missing data is preserved honestly (it lowers confidence / routes to NEEDS_DATA), never guessed.
 */

import type {
  RawOpportunitySignal,
  OpportunityType,
  SignalSourceType,
  FitBand,
  RiskBand,
  OppConfidence,
  KnownState,
  TenderSignalFields,
} from "./external-opportunity-intelligence";

/** The 13 structured intake types an owner/manager/system may submit. */
export type ExternalOpportunityIntakeType =
  | "COMPETITOR_REVIEW_GAP"
  | "B2B_DEMAND_SIGNAL"
  | "GOVERNMENT_TENDER"
  | "PUBLIC_PROCUREMENT_NOTICE"
  | "CORPORATE_VENDOR_OPPORTUNITY"
  | "GRANT_OR_SCHEME_SIGNAL"
  | "PRICING_GAP"
  | "SERVICE_GAP"
  | "COMMUNITY_OR_APARTMENT_DEMAND"
  | "SUPPLIER_OR_COST_ADVANTAGE"
  | "MARKET_TREND_SIGNAL"
  | "MANUAL_OWNER_OBSERVATION"
  | "DATA_INSUFFICIENT";

export const INTAKE_TYPES: readonly ExternalOpportunityIntakeType[] = [
  "COMPETITOR_REVIEW_GAP", "B2B_DEMAND_SIGNAL", "GOVERNMENT_TENDER", "PUBLIC_PROCUREMENT_NOTICE",
  "CORPORATE_VENDOR_OPPORTUNITY", "GRANT_OR_SCHEME_SIGNAL", "PRICING_GAP", "SERVICE_GAP",
  "COMMUNITY_OR_APARTMENT_DEMAND", "SUPPLIER_OR_COST_ADVANTAGE", "MARKET_TREND_SIGNAL",
  "MANUAL_OWNER_OBSERVATION", "DATA_INSUFFICIENT",
];

/** Each intake type maps to the engine's source + opportunity classification. */
const INTAKE_MAP: Record<ExternalOpportunityIntakeType, { signalSourceType: SignalSourceType; opportunityType: OpportunityType }> = {
  COMPETITOR_REVIEW_GAP: { signalSourceType: "COMPETITOR_REVIEW_GAP", opportunityType: "NEW_SERVICE" },
  B2B_DEMAND_SIGNAL: { signalSourceType: "B2B_DEMAND_SIGNAL", opportunityType: "B2B_OFFER" },
  GOVERNMENT_TENDER: { signalSourceType: "GOVERNMENT_TENDER", opportunityType: "TENDER_BID" },
  PUBLIC_PROCUREMENT_NOTICE: { signalSourceType: "PUBLIC_PROCUREMENT", opportunityType: "TENDER_BID" },
  CORPORATE_VENDOR_OPPORTUNITY: { signalSourceType: "CORPORATE_VENDOR_OPPORTUNITY", opportunityType: "TENDER_BID" },
  GRANT_OR_SCHEME_SIGNAL: { signalSourceType: "GRANT_OR_SCHEME", opportunityType: "OTHER" },
  PRICING_GAP: { signalSourceType: "PRICING_GAP", opportunityType: "PRICING_TEST" },
  SERVICE_GAP: { signalSourceType: "SERVICE_GAP", opportunityType: "NEW_SERVICE" },
  COMMUNITY_OR_APARTMENT_DEMAND: { signalSourceType: "COMMUNITY_OR_APARTMENT_DEMAND", opportunityType: "CUSTOMER_SEGMENT" },
  SUPPLIER_OR_COST_ADVANTAGE: { signalSourceType: "SUPPLIER_OR_COST_ADVANTAGE", opportunityType: "SUPPLIER_ADVANTAGE" },
  MARKET_TREND_SIGNAL: { signalSourceType: "MARKET_TREND_SIGNAL", opportunityType: "MARKETING_CHANNEL" },
  MANUAL_OWNER_OBSERVATION: { signalSourceType: "MANUAL_OWNER_OBSERVATION", opportunityType: "OTHER" },
  DATA_INSUFFICIENT: { signalSourceType: "DATA_INSUFFICIENT", opportunityType: "OTHER" },
};

/** The 4 tender/procurement intake types (routed through the tender screen; owner approval mandatory). */
const TENDER_INTAKE = new Set<ExternalOpportunityIntakeType>([
  "GOVERNMENT_TENDER", "PUBLIC_PROCUREMENT_NOTICE", "CORPORATE_VENDOR_OPPORTUNITY",
]);

export function isTenderIntake(t: ExternalOpportunityIntakeType): boolean {
  return TENDER_INTAKE.has(t);
}

/** How trustworthy the signal's origin is (the submitter's honest classification). */
export type SourceQuality =
  | "VERIFIED_SOURCE"
  | "OWNER_OBSERVED"
  | "STAFF_REPORTED"
  | "CUSTOMER_REPORTED"
  | "PUBLIC_SOURCE_UNVERIFIED"
  | "THIRD_PARTY_UNVERIFIED"
  | "LOW_CONFIDENCE"
  | "UNKNOWN";

export const SOURCE_QUALITIES: readonly SourceQuality[] = [
  "VERIFIED_SOURCE", "OWNER_OBSERVED", "STAFF_REPORTED", "CUSTOMER_REPORTED",
  "PUBLIC_SOURCE_UNVERIFIED", "THIRD_PARTY_UNVERIFIED", "LOW_CONFIDENCE", "UNKNOWN",
];

/** The raw structured submission (the owner-facing contract). Bands are the submitter's own assessment. */
export interface ExternalOpportunitySignalSubmission {
  rawSignalType: ExternalOpportunityIntakeType;
  sourceName?: string | null;
  sourceChannel?: string | null;
  sourceRef?: string | null; // URL or reference where available (never fetched)
  rawDescription: string;
  extractedBusinessNeed?: string | null;
  targetCustomerSegment?: string | null;
  locationContext?: string | null;
  deadlineAt?: string | null; // ISO; tender/grant deadline where applicable
  tenderOrProcurementValue?: number | null; // owner-supplied, stored for the record only
  eligibilityRequirements?: string | null; // presence ⇒ eligibility criteria KNOWN
  complianceRequirements?: string | null; // presence ⇒ compliance requirements KNOWN
  estimatedCashExposure?: number | null; // owner-supplied, stored for the record only (never → profit)
  cashExposureBand?: RiskBand; // submitter's honest cash-exposure assessment
  relevanceBand?: FitBand; // submitter's honest business-relevance assessment
  ownerWorkloadBand?: RiskBand; // submitter's honest owner-workload assessment
  ownerWorkloadNotes?: string | null;
  hasUnitEconomics?: boolean; // does the submitter already know the per-unit economics?
  sourceQuality?: SourceQuality; // submitter's honest origin-trust classification
  requiredDocuments?: string[]; // tender/grant document requirements known
  missingDocuments?: string[]; // tender/grant documents still to gather
  discoveredAt?: string | null; // ISO; when the signal was first seen (defaults to submit time)
  lastVerifiedAt?: string | null; // ISO; when it was last confirmed still live
  staleAfterDays?: number | null; // recheck window; drives freshness
  evidenceRefs?: string[];
  missingData?: string[];
  idempotencyKey?: string | null;
  dedupeKey?: string | null;
}

/** The persisted-row field shape produced by a validated submission (server fills id/workspace/audit). */
export interface NormalizedIntakeRow {
  idempotencyKey: string;
  dedupeKey: string;
  rawSignalType: ExternalOpportunityIntakeType;
  sourceName: string | null;
  sourceChannel: string | null;
  sourceRef: string | null;
  rawDescription: string;
  extractedBusinessNeed: string | null;
  targetCustomerSegment: string | null;
  locationContext: string | null;
  deadlineAt: Date | null;
  tenderOrProcurementValue: number | null;
  eligibilityRequirements: string | null;
  complianceRequirements: string | null;
  estimatedCashExposure: number | null;
  cashExposureBand: RiskBand;
  relevanceBand: FitBand;
  ownerWorkloadBand: RiskBand;
  ownerWorkloadNotes: string | null;
  hasUnitEconomics: boolean;
  sourceQuality: SourceQuality;
  requiredDocuments: string[];
  missingDocuments: string[];
  discoveredAt: Date | null;
  lastVerifiedAt: Date | null;
  staleAfterDays: number | null;
  evidenceRefs: string[];
  missingData: string[];
}

export type IntakePlan =
  | { ok: true; row: NormalizedIntakeRow }
  | { ok: false; reason: string };

const RISK_BANDS: readonly RiskBand[] = ["LOW", "MEDIUM", "HIGH", "UNKNOWN"];
const FIT_BANDS: readonly FitBand[] = ["STRONG", "MODERATE", "WEAK", "UNKNOWN"];
// A submitter must not smuggle unsupported fraud/HR-discipline verdicts into a free-text field.
const FORBIDDEN_LANGUAGE = /\b(fraud|fraudulent|theft|thief|embezzl|negligence|negligent|fire them|firing|payroll cut|docking pay|disciplin)\b/i;

function s(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t.length > 0 ? t : null;
}

/** Deterministic dedupe key from the semantic core of a submission (type + need/segment/source). */
function deriveDedupeKey(sub: ExternalOpportunitySignalSubmission): string {
  const core = [
    sub.rawSignalType,
    (s(sub.extractedBusinessNeed) ?? s(sub.rawDescription) ?? "").toLowerCase().replace(/\s+/g, " ").slice(0, 80),
    (s(sub.targetCustomerSegment) ?? "").toLowerCase().slice(0, 40),
  ].join("|");
  return core;
}

/**
 * Validate + normalise a structured submission into a persisted-row shape. Pure + deterministic. Fails
 * closed on missing type / empty description / unsupported enum / forbidden language. Missing optional
 * data is preserved (it will lower confidence / route to NEEDS_DATA downstream), never invented.
 */
export function planExternalOpportunitySignal(sub: ExternalOpportunitySignalSubmission): IntakePlan {
  if (!sub || typeof sub !== "object") return { ok: false, reason: "A submission is required." };
  if (!INTAKE_TYPES.includes(sub.rawSignalType)) return { ok: false, reason: "Unknown opportunity signal type." };
  const description = s(sub.rawDescription);
  if (!description) return { ok: false, reason: "A signal description is required." };
  if (FORBIDDEN_LANGUAGE.test(description) || FORBIDDEN_LANGUAGE.test(sub.ownerWorkloadNotes ?? "")) {
    return { ok: false, reason: "The signal must not contain fraud/negligence/HR-discipline language." };
  }
  const cashExposureBand: RiskBand = RISK_BANDS.includes(sub.cashExposureBand as RiskBand) ? (sub.cashExposureBand as RiskBand) : "UNKNOWN";
  const relevanceBand: FitBand = FIT_BANDS.includes(sub.relevanceBand as FitBand) ? (sub.relevanceBand as FitBand) : "MODERATE";
  const ownerWorkloadBand: RiskBand = RISK_BANDS.includes(sub.ownerWorkloadBand as RiskBand) ? (sub.ownerWorkloadBand as RiskBand) : "LOW";
  const deadlineAt = s(sub.deadlineAt) ? new Date(sub.deadlineAt as string) : null;
  if (deadlineAt && Number.isNaN(deadlineAt.getTime())) return { ok: false, reason: "The deadline is not a valid date." };
  const discoveredAt = s(sub.discoveredAt) ? new Date(sub.discoveredAt as string) : null;
  if (discoveredAt && Number.isNaN(discoveredAt.getTime())) return { ok: false, reason: "The discovered date is not valid." };
  const lastVerifiedAt = s(sub.lastVerifiedAt) ? new Date(sub.lastVerifiedAt as string) : null;
  if (lastVerifiedAt && Number.isNaN(lastVerifiedAt.getTime())) return { ok: false, reason: "The last-verified date is not valid." };
  const sourceQuality: SourceQuality = SOURCE_QUALITIES.includes(sub.sourceQuality as SourceQuality) ? (sub.sourceQuality as SourceQuality) : "UNKNOWN";
  const staleAfterDays = typeof sub.staleAfterDays === "number" && Number.isFinite(sub.staleAfterDays) && sub.staleAfterDays > 0 ? Math.round(sub.staleAfterDays) : null;

  const missingData = Array.from(new Set((sub.missingData ?? []).map((m) => s(m)).filter((m): m is string => m !== null)));
  // Tenders with no eligibility criteria supplied surface an honest data gap (never a silent assumption).
  if (isTenderIntake(sub.rawSignalType) && !s(sub.eligibilityRequirements) && !missingData.some((m) => /eligibilit/i.test(m))) {
    missingData.push("tender eligibility criteria");
  }

  const row: NormalizedIntakeRow = {
    idempotencyKey: s(sub.idempotencyKey) ?? `${sub.rawSignalType}:${deriveDedupeKey(sub)}`,
    dedupeKey: s(sub.dedupeKey) ?? deriveDedupeKey(sub),
    rawSignalType: sub.rawSignalType,
    sourceName: s(sub.sourceName),
    sourceChannel: s(sub.sourceChannel),
    sourceRef: s(sub.sourceRef),
    rawDescription: description,
    extractedBusinessNeed: s(sub.extractedBusinessNeed),
    targetCustomerSegment: s(sub.targetCustomerSegment),
    locationContext: s(sub.locationContext),
    deadlineAt,
    tenderOrProcurementValue: typeof sub.tenderOrProcurementValue === "number" && Number.isFinite(sub.tenderOrProcurementValue) ? sub.tenderOrProcurementValue : null,
    eligibilityRequirements: s(sub.eligibilityRequirements),
    complianceRequirements: s(sub.complianceRequirements),
    estimatedCashExposure: typeof sub.estimatedCashExposure === "number" && Number.isFinite(sub.estimatedCashExposure) ? sub.estimatedCashExposure : null,
    cashExposureBand,
    relevanceBand,
    ownerWorkloadBand,
    ownerWorkloadNotes: s(sub.ownerWorkloadNotes),
    hasUnitEconomics: sub.hasUnitEconomics === true,
    sourceQuality,
    requiredDocuments: Array.from(new Set((sub.requiredDocuments ?? []).map((d) => s(d)).filter((d): d is string => d !== null))).slice(0, 30),
    missingDocuments: Array.from(new Set((sub.missingDocuments ?? []).map((d) => s(d)).filter((d): d is string => d !== null))).slice(0, 30),
    discoveredAt,
    lastVerifiedAt,
    staleAfterDays,
    evidenceRefs: Array.from(new Set((sub.evidenceRefs ?? []).map((r) => s(r)).filter((r): r is string => r !== null))).slice(0, 20),
    missingData,
  };
  return { ok: true, row };
}

/** A persisted row (subset needed for mapping) as read back from the store. */
export interface PersistedIntakeRow extends NormalizedIntakeRow {
  id: string;
  workspaceId: string;
}

function tenderFieldsFor(row: NormalizedIntakeRow, nowMs: number): TenderSignalFields {
  const eligibility: KnownState = row.eligibilityRequirements ? "KNOWN" : "UNKNOWN";
  const compliance: KnownState = row.complianceRequirements ? "KNOWN" : "UNKNOWN";
  // Unit economics are only KNOWN when the submitter both gave a value AND confirmed they know the economics.
  const unitEconomics: KnownState = row.tenderOrProcurementValue != null && row.hasUnitEconomics ? "KNOWN" : "UNKNOWN";
  const bidDeadlineDays = row.deadlineAt ? Math.max(0, Math.round((row.deadlineAt.getTime() - nowMs) / 86_400_000)) : null;
  return {
    eligibility,
    eligible: null, // knowing the criteria ≠ knowing we qualify — stays unconfirmed until the owner checks
    emdExposure: row.cashExposureBand,
    paymentDelayRisk: "UNKNOWN",
    performancePenaltyRisk: "UNKNOWN",
    workingCapitalRequirement: row.cashExposureBand,
    compliance,
    documentationBurden: "UNKNOWN",
    capacityFit: "UNKNOWN",
    unitEconomics,
    bidDeadlineDays,
  };
}

/**
 * Map a persisted structured signal into the engine's `RawOpportunitySignal`. Pure. Confidence is derived
 * conservatively from the evidence actually supplied; nothing is fabricated. Tender/procurement types carry
 * tender fields so the engine's separate tender screen (owner-approval-mandatory) runs.
 */
export function mapPersistedSignalToRaw(row: PersistedIntakeRow, nowMs: number): RawOpportunitySignal {
  const map = INTAKE_MAP[row.rawSignalType];
  const hasEvidence = row.evidenceRefs.length > 0 || row.sourceRef != null;
  const rawConfidence: OppConfidence =
    row.missingData.length > 0 || !row.extractedBusinessNeed ? "NEEDS_DATA" : hasEvidence ? "MEDIUM" : "LOW";
  const summaryParts = [row.rawDescription];
  if (row.sourceName) summaryParts.push(`(source: ${row.sourceName})`);
  return {
    signalId: `intake:${row.id}`,
    dedupeKey: row.dedupeKey,
    signalSourceType: map.signalSourceType,
    opportunityType: map.opportunityType,
    sourceEvidenceSummary: summaryParts.join(" "),
    sourceRefs: [row.sourceRef, ...row.evidenceRefs].filter((r): r is string => r != null),
    customerPainPoint: row.extractedBusinessNeed ?? "",
    targetCustomerSegment: row.targetCustomerSegment ?? "",
    expectedValueHypothesis: row.extractedBusinessNeed ?? row.rawDescription,
    relevanceToBusiness: row.relevanceBand,
    rawConfidence,
    cashRisk: row.cashExposureBand,
    ownerWorkloadRisk: row.ownerWorkloadBand,
    operationalFit: "MODERATE",
    capabilityFit: "MODERATE",
    localFeasibility: row.locationContext ? "STRONG" : "MODERATE",
    legalOrComplianceRisk: isTenderIntake(row.rawSignalType) && !row.complianceRequirements ? "UNKNOWN" : "LOW",
    hasUnitEconomics: row.hasUnitEconomics,
    validationCostEstimate: null, // never fabricated
    missingData: row.missingData,
    relatedCashProfitSignal: null,
    relatedCapabilityGap: null,
    relatedConstraint: null,
    relatedSLO: null,
    ...(isTenderIntake(row.rawSignalType) ? { tender: tenderFieldsFor(row, nowMs) } : {}),
  };
}
