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
  LEGACY_UNKNOWN_BASIS,
  LEGACY_UNKNOWN_LABEL,
  isEstimate,
  provenanceOf,
  type EvidenceProvenance,
  type EvidenceQuality,
} from "@/domain/owner-finance/evidence-quality";

/**
 * What the evidence behind a read can honestly claim. A first read rests on ONE evidence domain (the Money snapshot),
 * so its claim is always FINANCIAL_FIRST_READ. WHOLE_BUSINESS wording exists for a future multi-domain read and is
 * unreachable from finance-only evidence: the builder refuses the mismatch instead of trusting copy to stay put.
 */
export type FirstReadScope = "FINANCIAL_FIRST_READ" | "WHOLE_BUSINESS";
export type FirstReadEvidenceDomain = "finance" | "sales" | "operations" | "marketing" | "people" | "compliance";

/** A whole-business claim needs evidence from at least this many distinct domains. */
export const WHOLE_BUSINESS_MIN_DOMAINS = 3;

export class FirstReadScopeError extends Error {
  constructor(scope: FirstReadScope, domains: readonly FirstReadEvidenceDomain[]) {
    super(`A ${scope} read cannot rest on ${domains.length} evidence domain(s): ${domains.join(", ") || "none"}.`);
    this.name = "FirstReadScopeError";
  }
}

/** The widest claim the given evidence domains can support. */
export function maxScopeForDomains(domains: readonly FirstReadEvidenceDomain[]): FirstReadScope {
  return new Set(domains).size >= WHOLE_BUSINESS_MIN_DOMAINS ? "WHOLE_BUSINESS" : "FINANCIAL_FIRST_READ";
}

export const FIRST_READ_SCOPE_COPY: Record<FirstReadScope, { heading: string; scope: string; scopeNoFinding: string }> = {
  FINANCIAL_FIRST_READ: {
    heading: "Your first Money read",
    scope: "Based on the financial information you've given OpsIQ, this deserves attention first. It covers your money figures only.",
    // Used when the read did not find a specific item (needs more evidence / nothing stands out): never "deserves attention first".
    scopeNoFinding: "Based on the financial information you've given OpsIQ. It covers your money figures only.",
  },
  WHOLE_BUSINESS: {
    heading: "Your business read",
    scope: "Based on the information you've given OpsIQ across your business, this deserves attention first.",
    scopeNoFinding: "Based on the information you've given OpsIQ across your business.",
  },
};

/** The claim sentence for a scope and read status (a read that found nothing specific must not say "deserves attention first"). */
export function scopeSentence(scope: FirstReadScope, status: "READY" | "NEEDS_MORE_EVIDENCE" | "NO_ATTENTION_FOUND"): string {
  return status === "READY" ? FIRST_READ_SCOPE_COPY[scope].scope : FIRST_READ_SCOPE_COPY[scope].scopeNoFinding;
}

/**
 * The supporting number with the unit its metric implies (keys follow the finance engine's naming: `…Pct`, `…Days`,
 * amounts). An unknown metric is shown as a plain number: no unit is ever invented.
 */
export function formatMetricValue(sourceMetric: string, value: number | null, currency?: string | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  const n = new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value);
  if (/Pct$/.test(sourceMetric)) return `${n}%`;
  if (/Days(OfCosts)?$/.test(sourceMetric)) return `${n} days`;
  if (/^(revenue|totalLiquidFunds|totalDebtOutstanding)$/.test(sourceMetric) && currency) return `${currency} ${n}`;
  return n;
}

/** Where an owner can supply the information a known "what would sharpen this" request asks for. */
const SHARPEN_TARGETS: Record<string, string> = { FIN_LIQUIDITY_UNCONFIRMED: "/owner/cashflow" };

export const FIRST_MONEY_READ_HEADING = FIRST_READ_SCOPE_COPY.FINANCIAL_FIRST_READ.heading;
export const FIRST_MONEY_READ_SCOPE = FIRST_READ_SCOPE_COPY.FINANCIAL_FIRST_READ.scope;

/** Where a read's figures sit in time (canonical evidencePeriodState semantics: completed vs still in progress). */
export interface FirstReadPeriod {
  start: string;
  end: string;
  state: "completed" | "provisional";
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function utcParts(iso: string): { y: number; m: number; d: number } | null {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate() };
}

/** "September 2026" for a whole calendar month, else "1 Sep 2026 to 30 Sep 2026" — never a precision the period lacks. */
export function periodLabel(period: Pick<FirstReadPeriod, "start" | "end">): string {
  const a = utcParts(period.start);
  const b = utcParts(period.end);
  if (!a || !b) return "the period you entered";
  const lastDay = new Date(Date.UTC(a.y, a.m + 1, 0)).getUTCDate();
  if (a.y === b.y && a.m === b.m && a.d === 1 && b.d === lastDay) return `${MONTHS[a.m]} ${a.y}`;
  const fmt = (p: { y: number; m: number; d: number }) => `${p.d} ${MONTHS[p.m].slice(0, 3)} ${p.y}`;
  return `${fmt(a)} to ${fmt(b)}`;
}

/** e.g. "Based on your September 2026 figures · a good estimate", "…October 2026 figures so far · still in progress (provisional)". */
export function basisLine(period: FirstReadPeriod, qualityLabel: string): string {
  const label = periodLabel(period);
  return period.state === "provisional"
    ? `Based on your ${label} figures so far · still in progress (provisional) · ${qualityLabel}`
    : `Based on your ${label} figures · completed period · ${qualityLabel}`;
}

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
  /** ISO currency of the business, used only to label money-valued metrics. */
  currency?: string | null;
  /** The period the figures cover and whether it has ended. */
  period: FirstReadPeriod;
  /** The evidence domains this read rests on. Finance-only for a first Money read. */
  evidenceDomains?: readonly FirstReadEvidenceDomain[];
  /** The claim scope requested; refused when the evidence cannot support it. Defaults to the widest supported. */
  scope?: FirstReadScope;
  /** Critical/important inputs still missing from the snapshot (owner-facing labels). */
  missingEvidence: readonly string[];
}

export type FirstMoneyReadStatus = "READY" | "NEEDS_MORE_EVIDENCE" | "NO_ATTENTION_FOUND";

export interface FirstMoneyRead {
  status: FirstMoneyReadStatus;
  /** The runtime claim scope; the heading and scope wording are derived from it (FIRST_READ_SCOPE_COPY). */
  scopeKind: FirstReadScope;
  heading: string;
  scope: string;
  /** Which period the read is about, whether it is provisional, and how reliable it is, in one line. */
  period: FirstReadPeriod;
  basis: string;
  /** 1. What did OpsIQ notice? */
  noticed: string;
  /** 2–3. Supporting metric and its actual value (null when not computable — never invented). */
  evidenceMetric: string | null;
  actualValue: number | null;
  /** The value with its unit (percent, days, currency), or null. */
  actualValueText: string | null;
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
  /** Explicit provenance: NULL storage is LEGACY_UNKNOWN, never ACTUAL and never authoritative. */
  evidenceProvenance: EvidenceProvenance;
  /** What would make this read sharper (the top canonical data request), when it is not the primary item. */
  sharpenBy: { title: string; detail: string; href: string | null } | null;
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
  const quality = input.evidenceQuality;
  // Unknown provenance is never penalised in the stored score (existing records keep it), but it must not read as MORE
  // trustworthy than an owner-stated estimate (capped below HIGH): the card says "Not stated" and the tier agrees.
  const rawTier = confidenceTierFromScore(input.confidenceScore);
  const tier = !quality && rawTier === "HIGH" ? "MEDIUM" : rawTier;
  const domains: readonly FirstReadEvidenceDomain[] = input.evidenceDomains ?? ["finance"];
  const supported = maxScopeForDomains(domains);
  const scopeKind = input.scope ?? supported;
  if (scopeKind === "WHOLE_BUSINESS" && supported !== "WHOLE_BUSINESS") throw new FirstReadScopeError(scopeKind, domains);
  const copy = FIRST_READ_SCOPE_COPY[scopeKind];
  const common = {
    scopeKind,
    heading: copy.heading,
    scope: copy.scope, // READY wording; non-READY statuses override below
    period: input.period,
    basis: basisLine(input.period, quality ? EVIDENCE_QUALITY_LABEL[quality] : LEGACY_UNKNOWN_BASIS),
    confidenceTier: tier,
    confidenceLabel: CONFIDENCE_LABEL[tier],
    missingEvidence: [...input.missingEvidence],
    evidenceQuality: quality,
    evidenceQualityLabel: quality ? EVIDENCE_QUALITY_LABEL[quality] : LEGACY_UNKNOWN_LABEL,
    evidenceQualityNote: quality ? EVIDENCE_QUALITY_EXPLANATION[quality] : "OpsIQ doesn't know whether these numbers are from your records or estimated, so it does not treat them as confirmed.",
    isEstimated: isEstimate(quality),
    evidenceProvenance: provenanceOf(quality),
  };
  const criticalMissing = input.criticalInputsMissing === true;
  const blocked = tier === "BLOCKED" || criticalMissing;
  const acceptNote = blocked
    ? "There isn't enough reliable information to act on this yet. Correct a number or add what is missing first."
    : null;
  const cautions: string[] = [];
  if (!quality) cautions.push("OpsIQ doesn't know how reliable these numbers are, so it treats them as unconfirmed rather than as taken from your records.");
  if (isEstimate(quality)) cautions.push("This rests on estimated numbers, so treat it as a first guide rather than a settled answer.");
  if (input.dataRequestCode === "FIN_LIQUIDITY_UNCONFIRMED") {
    cautions.push("OpsIQ can't yet confirm how long your cash will last, because your bank balance isn't known. That is a missing figure, not a sign you have no money.");
  }
  if (input.period.state === "provisional") cautions.push("This covers a period that is still in progress, so the read may change as the period completes.");
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
      actualValueText: formatMetricValue(finding.sourceMetric, finding.sourceValue ?? null, input.currency),
      supportingEvidence: finding.evidence.map(humanizeEvidenceLine),
      whyItMatters: finding.summary,
      ...present(action),
      sharpenBy: input.dataRequest
        ? { title: input.dataRequest.title, detail: input.dataRequest.description, href: (input.dataRequestCode && SHARPEN_TARGETS[input.dataRequestCode]) || null }
        : null,
      canAccept: !blocked,
      acceptNote,
      cautions,
    };
  }

  if (input.dataRequest) {
    return {
      ...common,
      status: "NEEDS_MORE_EVIDENCE",
      scope: copy.scopeNoFinding,
      noticed: "OpsIQ can't point to a specific money problem from these figures yet.",
      evidenceMetric: null,
      actualValue: null,
      actualValueText: null,
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
    scope: copy.scopeNoFinding,
    noticed: "Nothing in the money figures you gave stands out as needing attention right now.",
    evidenceMetric: null,
    actualValue: null,
    actualValueText: null,
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
