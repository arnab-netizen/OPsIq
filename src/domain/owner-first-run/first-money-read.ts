/**
 * Owner first-run — the first-value result contract ("Your first Money read").
 *
 * This is a PRESENTATION mapping over the canonical finance diagnosis (diagnoseFinanceSnapshot +
 * planFinanceActionsFromDiagnosis). It is not a second engine: it picks nothing, scores nothing and
 * invents no numbers — it reshapes the top-ranked finding/action into the eleven answers an owner needs,
 * labels the scope honestly (money only), and carries evidence quality and missing evidence through.
 * Pure.
 */
import { confidenceTierFromScore, type ConfidenceTier } from "@/domain/owner-finance/data-confidence";
import { humanizeEvidenceLine, humanizeMetricKey, humanizeSnakeCase } from "@/lib/metric-label";
import {
  EVIDENCE_QUALITY_EXPLANATION,
  EVIDENCE_QUALITY_LABEL,
  isEstimate,
  type EvidenceQuality,
} from "@/domain/owner-finance/evidence-quality";

export const FIRST_MONEY_READ_HEADING = "Your first Money read";
export const FIRST_MONEY_READ_SCOPE =
  "Based on the financial information you've given OpsIQ, this deserves attention first. It covers your money figures only.";

/**
 * Whole-business claims the first read must never make: it rests on a money snapshot, not on whole-business
 * readiness. Enforced by test against every rendered string.
 */
export const OVERCLAIM_PHRASES = [
  "biggest business problem",
  "biggest problem",
  "your business's problem",
  "main problem in your business",
  "whole business",
  "entire business",
  "root cause",
] as const;

export interface FirstMoneyReadFinding {
  title: string;
  summary: string;
  sourceMetric: string;
  sourceValue?: number | null;
  evidence: readonly string[];
  missingData: readonly string[];
}

export interface FirstMoneyReadAction {
  title: string;
  description: string;
  ownerRole: string;
  expectedTimeframeDays: number;
  verificationMetric: string;
}

/**
 * Finance findings whose recommended action is to SUPPLY information rather than to change the business.
 * They are real and canonical, but they are not "what OpsIQ noticed about the money": the first read leads with
 * the highest-ranked action that is not one of these, and offers the top one as "what would sharpen this".
 */
export const DATA_GATHERING_FINDING_CODES: ReadonlySet<string> = new Set([
  "FIN_MISSING_CRITICAL_DATA",
  "FIN_OPP_DATA_QUALITY",
  "FIN_LIQUIDITY_UNCONFIRMED",
  "FIN_NOTABLE_OUTSTANDING_DEBT",
]);

export function isDataGatheringFinding(code: string): boolean {
  return DATA_GATHERING_FINDING_CODES.has(code);
}

/**
 * Presentation choice over the canonical ranked actions (it re-ranks nothing): the first read's primary item is
 * the first ranked action that is a real finding; the first ranked data request is kept apart. When only data
 * requests exist, there is no primary finding and the read says so instead of dressing a request as a diagnosis.
 */
export function selectFirstReadActions<T extends { findingCode: string }>(
  rankedActions: readonly T[],
): { primary: T | null; dataRequest: T | null } {
  return {
    primary: rankedActions.find((a) => !isDataGatheringFinding(a.findingCode)) ?? null,
    dataRequest: rankedActions.find((a) => isDataGatheringFinding(a.findingCode)) ?? null,
  };
}

export interface FirstMoneyReadInput {
  /** The real finding behind the primary action (null when only data requests exist). */
  finding: FirstMoneyReadFinding | null;
  /** The primary action (null when nothing needs attention). */
  action: FirstMoneyReadAction | null;
  /** The top ranked "supply this information" action, shown as what would sharpen the read. */
  dataRequest: FirstMoneyReadAction | null;
  /** Finding code behind `dataRequest` (used for the caveat only). */
  dataRequestCode?: string | null;
  /** The snapshot lacks revenue, a cost or cash (the canonical critical inputs). */
  criticalInputsMissing?: boolean;
  confidenceScore: number;
  evidenceQuality: EvidenceQuality | null;
  /** Critical/important inputs still missing from the snapshot (owner-facing labels). */
  missingEvidence: readonly string[];
}

export type FirstMoneyReadStatus = "READY" | "NEEDS_MORE_EVIDENCE" | "NO_ATTENTION_FOUND";

export interface FirstMoneyRead {
  status: FirstMoneyReadStatus;
  heading: string;
  scope: string;
  /** 1. What did OpsIQ notice? */
  noticed: string;
  /** 2–3. Supporting metric and its actual value (null when not computable — never invented). */
  evidenceMetric: string | null;
  actualValue: number | null;
  supportingEvidence: string[];
  /** 4. Why it matters. */
  whyItMatters: string;
  /** 5–7. What to do, who owns it, when. */
  recommendedAction: string | null;
  actionDetail: string | null;
  owner: string | null;
  timing: string | null;
  /** 8. What to watch. */
  watchMetric: string | null;
  /** 9. Confidence. */
  confidenceTier: ConfidenceTier;
  confidenceLabel: string;
  /** 10. Missing evidence. */
  missingEvidence: string[];
  /** 11. Estimated evidence. */
  evidenceQuality: EvidenceQuality | null;
  evidenceQualityLabel: string | null;
  evidenceQualityNote: string | null;
  isEstimated: boolean;
  /** What would make this read sharper (the top canonical data request), when it is not the primary item. */
  sharpenBy: { title: string; detail: string } | null;
  /** False when confidence is BLOCKED (the repo's own tier contract: do not act on it yet) or there is no action. */
  canAccept: boolean;
  acceptNote: string | null;
  /** Plain cautions shown with the read (estimates, unconfirmed cash, thin confidence). Never blocks on its own. */
  cautions: string[];
}

const CONFIDENCE_LABEL: Record<ConfidenceTier, string> = {
  HIGH: "Fairly confident",
  MEDIUM: "Reasonably confident",
  LOW: "Directional only — treat as a first guide",
  BLOCKED: "Not enough information to rely on this yet",
};

function timingLabel(days: number): string {
  if (days <= 0) return "Today";
  if (days === 1) return "Within 1 day";
  return `Within ${days} days`;
}

/** "owner" -> "Owner", "head_chef" -> "Head chef": a role is shown the way a person would say it. */
function roleLabel(role: string): string {
  return humanizeSnakeCase(role.trim().replace(/[-\s]+/g, "_").toLowerCase());
}

export function buildFirstMoneyRead(input: FirstMoneyReadInput): FirstMoneyRead {
  const tier = confidenceTierFromScore(input.confidenceScore);
  const quality = input.evidenceQuality;
  const common = {
    heading: FIRST_MONEY_READ_HEADING,
    scope: FIRST_MONEY_READ_SCOPE,
    confidenceTier: tier,
    confidenceLabel: CONFIDENCE_LABEL[tier],
    missingEvidence: [...input.missingEvidence],
    evidenceQuality: quality,
    evidenceQualityLabel: quality ? EVIDENCE_QUALITY_LABEL[quality] : null,
    evidenceQualityNote: quality ? EVIDENCE_QUALITY_EXPLANATION[quality] : null,
    isEstimated: isEstimate(quality),
  };
  const criticalMissing = input.criticalInputsMissing === true;
  const blocked = tier === "BLOCKED" || criticalMissing;
  const acceptNote = blocked
    ? "There isn't enough reliable information to act on this yet. Correct a number or add what is missing first."
    : null;
  const cautions: string[] = [];
  if (isEstimate(quality)) cautions.push("This rests on estimated numbers, so treat it as a first guide rather than a settled answer.");
  if (input.dataRequestCode === "FIN_LIQUIDITY_UNCONFIRMED") {
    cautions.push("OpsIQ can't yet confirm how long your cash will last, because your bank balance isn't known. That is a missing figure, not a sign you have no money.");
  }
  if (tier === "LOW") cautions.push("OpsIQ's confidence is low, so this points the direction without being certain.");
  const present = (a: FirstMoneyReadAction) => ({
    recommendedAction: a.title,
    actionDetail: a.description,
    owner: roleLabel(a.ownerRole),
    timing: timingLabel(a.expectedTimeframeDays),
    watchMetric: humanizeMetricKey(a.verificationMetric),
  });
  const none = { recommendedAction: null, actionDetail: null, owner: null, timing: null, watchMetric: null };

  if (input.finding && input.action) {
    const { finding, action } = input;
    return {
      ...common,
      status: "READY",
      noticed: finding.title,
      evidenceMetric: humanizeMetricKey(finding.sourceMetric),
      actualValue: finding.sourceValue ?? null,
      supportingEvidence: finding.evidence.map(humanizeEvidenceLine),
      whyItMatters: finding.summary,
      ...present(action),
      sharpenBy: input.dataRequest ? { title: input.dataRequest.title, detail: input.dataRequest.description } : null,
      canAccept: !blocked,
      acceptNote,
      cautions,
    };
  }

  if (input.dataRequest) {
    return {
      ...common,
      status: "NEEDS_MORE_EVIDENCE",
      noticed: "OpsIQ can't point to a specific money problem from these figures yet.",
      evidenceMetric: null,
      actualValue: null,
      supportingEvidence: [],
      whyItMatters: "Rather than guess, OpsIQ needs one more piece of information before it can say where to look first.",
      ...present(input.dataRequest),
      sharpenBy: null,
      canAccept: !blocked,
      acceptNote,
      cautions,
    };
  }

  return {
    ...common,
    status: "NO_ATTENTION_FOUND",
    noticed: "Nothing in the money figures you gave stands out as needing attention right now.",
    evidenceMetric: null,
    actualValue: null,
    supportingEvidence: [],
    whyItMatters: "That only reflects the figures provided. Adding more detail can surface issues these figures can't show.",
    ...none,
    sharpenBy: null,
    canAccept: false,
    acceptNote: null,
    cautions,
  };
}

/** Every owner-visible string in a read, for the overclaim guard. */
export function firstMoneyReadStrings(read: FirstMoneyRead): string[] {
  return [
    read.heading,
    read.scope,
    read.noticed,
    read.whyItMatters,
    read.recommendedAction,
    read.actionDetail,
    read.confidenceLabel,
    read.evidenceQualityNote,
    read.acceptNote,
    ...read.cautions,
    read.sharpenBy?.title ?? null,
    read.sharpenBy?.detail ?? null,
  ].filter((s): s is string => typeof s === "string");
}

export function findOverclaims(strings: readonly string[]): string[] {
  const hits: string[] = [];
  for (const s of strings) {
    const lower = s.toLowerCase();
    for (const p of OVERCLAIM_PHRASES) if (lower.includes(p)) hits.push(p);
  }
  return hits;
}
