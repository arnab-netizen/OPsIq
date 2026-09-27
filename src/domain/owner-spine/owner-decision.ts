/**
 * Owner Intelligence Spine — canonical owner decision (the ONE cross-domain arbiter).
 *
 * OpsIQ must have exactly one mechanism that decides the owner's current highest-priority business
 * target. This module is that mechanism. Domain engines (Finance, Cashflow, Strategy, Recovery,
 * Sales, Operations, SOP, Marketing) decide what matters WITHIN their domain; their persisted
 * actions — plus business-scoped control sources (compliance breaches and, only when attribution is
 * unambiguous, critical workspace risks) — are normalized into `OwnerDecisionCandidate`s
 * by the owner-home service and arbitrated HERE. Home, Cockpit, Priorities and the Business Condition
 * rollup all render this output; none of them elects a #1 of its own.
 *
 * Arbitration order (docs/opsiq/architecture/OWNER_DECISION_CONSOLIDATION_PROOF.md §4):
 *   1. business-semantic class (safety/compliance → survival/cash → customer/service failure →
 *      overload → profit loss → blocked execution → missing critical evidence → growth → optimisation)
 *   2. severity (restored from the linked finding; never invented — unknown ranks lowest)
 *   3. the existing Spine priority score (`calculateOwnerPriorityScore`, stored per action)
 *   4. expected impact → confidence → lower effort
 *   5. only then stable identifiers (finding code, candidate id) as deterministic final tie-breakers.
 * The 0–100 priority score saturates (raw product reaches ~300), so ties at 100 are routine; they are
 * decided by business class and severity, never by alphabetical finding code or title.
 *
 * Pure: no DB, no I/O, no clock reads (the caller supplies `now`). Nothing is invented: missing data
 * is reported as missing, confidence is capped when evidence is insufficient, and an owner with no
 * diagnosed domain gets honest "add data" guidance instead of a fabricated target.
 */
import {
  clampConfidence,
  clampScore,
  ownerSeverityRank,
  type OwnerDomain,
  type OwnerSeverity,
} from "./contracts";

// --- Business-semantic priority classes ---------------------------------------------------------

export const OWNER_PRIORITY_CLASSES = [
  "SAFETY_COMPLIANCE",
  "SURVIVAL_CASH",
  "CUSTOMER_SERVICE_FAILURE",
  "OVERLOAD_BLOCKING",
  "PROFIT_LOSS",
  "BLOCKED_EXECUTION",
  "MISSING_CRITICAL_EVIDENCE",
  "GROWTH_OPPORTUNITY",
  "PROCESS_OPTIMISATION",
] as const;
export type OwnerPriorityClass = (typeof OWNER_PRIORITY_CLASSES)[number];

/** Owner-facing label for each class (plain language; used in "why this wins"). */
export const OWNER_PRIORITY_CLASS_LABEL: Record<OwnerPriorityClass, string> = {
  SAFETY_COMPLIANCE: "a safety or compliance problem",
  SURVIVAL_CASH: "a cash-survival danger",
  CUSTOMER_SERVICE_FAILURE: "a customer or service failure",
  OVERLOAD_BLOCKING: "overload that is blocking work",
  PROFIT_LOSS: "money the business is losing now",
  BLOCKED_EXECUTION: "work that cannot move forward",
  MISSING_CRITICAL_EVIDENCE: "missing information OpsIQ needs to advise you safely",
  GROWTH_OPPORTUNITY: "a growth or investment decision",
  PROCESS_OPTIMISATION: "a process improvement",
};

/** Rank of a class: lower wins. */
export function ownerPriorityClassRank(c: OwnerPriorityClass): number {
  return OWNER_PRIORITY_CLASSES.indexOf(c);
}

const CLASS_CODES: Record<OwnerPriorityClass, readonly string[]> = {
  SAFETY_COMPLIANCE: ["COMPLIANCE_BREACH"],
  SURVIVAL_CASH: [
    "FIN_INSOLVENT_RUNWAY", "FIN_LOW_RUNWAY", "FIN_LOW_ABSOLUTE_CASH", "FIN_HIGH_DEBT_PRESSURE",
    "CF_INSOLVENT_RUNWAY", "CF_LOW_RUNWAY", "CF_URGENT_PAYMENT_RISK", "CF_VENDOR_CUTOFF_RISK", "CF_DEBT_DEFAULT_RISK",
  ],
  CUSTOMER_SERVICE_FAILURE: [
    "OPS_DELIVERY_FAILURE", "OPS_HIGH_COMPLAINT_RATE", "OPS_HIGH_REWORK",
    "SALES_HIGH_COMPLAINT_RATIO", "SALES_HIGH_REFUND_RATE",
    "SOP_REPEATED_FAILURES",
    "QUALITY_FAILURE",
  ],
  OVERLOAD_BLOCKING: [],
  PROFIT_LOSS: [
    "FIN_BELOW_BREAK_EVEN", "FIN_NEGATIVE_GROSS_MARGIN", "FIN_NEGATIVE_NET_MARGIN", "FIN_HIGH_FIXED_COST_BURDEN",
    "FIN_HIGH_PAYROLL_BURDEN", "FIN_HIGH_PAYABLES", "FIN_HIGH_RECEIVABLES", "FIN_NOTABLE_OUTSTANDING_DEBT",
    "FIN_DISCOUNT_LEAKAGE", "FIN_REFUND_REWORK_LEAKAGE",
    "CF_HIGH_OVERDUE_RECEIVABLES", "CF_SLOW_COLLECTIONS", "CF_OWNER_WITHDRAWAL_PRESSURE",
    "SALES_LOST_CUSTOMER_LEAKAGE", "SALES_DISCOUNT_DEPENDENCE",
    "MKT_WASTED_SPEND",
    "HIGH_COST_RATIO", "DISCOUNT_LEAKAGE", "DELIVERY_COST_LEAKAGE", "RECEIVABLES_PRESSURE", "LOW_REVENUE",
  ],
  BLOCKED_EXECUTION: [
    "OPS_CAPACITY_BOTTLENECK", "OPS_HIGH_DELAY", "OPS_LOW_COMPLETION", "OPS_INVENTORY_SHORTAGE", "OPS_SOP_NONCOMPLIANCE",
    "SOP_HIGH_OVERDUE", "SOP_LOW_COMPLETION", "SOP_HIGH_DISPUTE", "SOP_LOW_PROOF_COMPLIANCE", "SOP_LOW_VERIFICATION",
    "SOP_HIGH_REASSIGNMENT", "SOP_LOW_COVERAGE",
    "SLOW_TURNAROUND", "LOW_STAFF_PRODUCTIVITY",
  ],
  MISSING_CRITICAL_EVIDENCE: [
    "FIN_MISSING_CRITICAL_DATA", "FIN_INVALID_CURRENCY",
    "CF_MISSING_CRITICAL_DATA", "CF_INVALID_CURRENCY",
    "SALES_MISSING_CRITICAL_DATA", "SALES_INVALID_CURRENCY",
    "OPS_MISSING_CRITICAL_DATA", "OPS_INVALID_CURRENCY",
    "SOP_MISSING_CRITICAL_DATA", "SOP_INVALID_CURRENCY",
    "MKT_MISSING_CRITICAL_DATA", "MKT_INVALID_CURRENCY",
    "STR_MISSING_CRITICAL_DATA", "STR_INVALID_CURRENCY", "STR_MISSING_CASH", "STR_MISSING_RISK_LEVEL",
  ],
  GROWTH_OPPORTUNITY: [
    "FIN_OPP_BREAK_EVEN_RECOVERY", "FIN_OPP_DEBT_REDUCTION", "FIN_OPP_LEAKAGE_REDUCTION", "FIN_OPP_MARGIN_IMPROVEMENT",
    "FIN_OPP_RECEIVABLES_COLLECTION", "FIN_OPP_REVENUE_QUALITY",
    "CF_OPP_COLLECT_OVERDUE", "CF_OPP_DEFER_PAYABLES", "CF_OPP_REDUCE_OWNER_WITHDRAWAL",
    "SALES_LOW_CONVERSION", "SALES_POOR_FOLLOW_UP", "SALES_WEAK_REPEAT", "SALES_WEAK_B2B_PIPELINE",
    "SALES_OPP_CONVERT_PIPELINE", "SALES_OPP_IMPROVE_RETENTION", "SALES_OPP_RAISE_CONVERSION",
    "SALES_OPP_TIGHTEN_DISCOUNT", "SALES_OPP_WINBACK",
    "MKT_LOW_REFERRAL", "MKT_NO_FOLLOWUP", "MKT_POOR_CONVERSION", "MKT_WEAK_OFFER", "MKT_WRONG_CHANNEL_MIX",
    "MKT_OPP_ACTIVATE_REFERRALS", "MKT_OPP_ADD_FOLLOWUP", "MKT_OPP_BUILD_ORGANIC", "MKT_OPP_LIFT_CONVERSION",
    "MKT_OPP_SCALE_WINNER",
    "STR_UNAFFORDABLE", "STR_LOW_CASH_RESERVE", "STR_HIGH_EXECUTION_RISK", "STR_LONG_PAYBACK", "STR_NEGATIVE_BASE_CASE",
    "STR_NEGATIVE_ROI", "STR_NEGATIVE_WORST_CASE", "STR_WEAK_ROI",
    "STR_OPP_FAST_PAYBACK", "STR_OPP_SAFE_UPSIDE", "STR_OPP_STRONG_RETURN",
    "LOW_AOV", "WEAK_REPEAT_RATE", "POOR_CAMPAIGN_CONVERSION",
  ],
  PROCESS_OPTIMISATION: [
    "FIN_OPP_DATA_QUALITY", "CF_OPP_DATA_QUALITY", "SALES_OPP_DATA_QUALITY", "OPS_OPP_DATA_QUALITY",
    "SOP_OPP_DATA_QUALITY", "MKT_OPP_DATA_QUALITY",
    "OPS_HIGH_IDLE", "OPS_OPP_CLOSE_SOP_GAP", "OPS_OPP_CUT_REWORK", "OPS_OPP_RECLAIM_IDLE", "OPS_OPP_RECOVER_DELAYS",
    "OPS_OPP_USE_CAPACITY_HEADROOM",
    "SOP_OPP_CLEAR_OVERDUE", "SOP_OPP_CLOSE_COVERAGE_GAP", "SOP_OPP_CONVERT_TO_SOP", "SOP_OPP_RAISE_VERIFICATION",
  ],
};

/**
 * Finding code → business class. Total over every code the domain rule files emit (enforced by
 * `src/__tests__/owner-decision/priority-class-exhaustiveness.test.ts`).
 */
export const OWNER_PRIORITY_CLASS_BY_CODE: Readonly<Record<string, OwnerPriorityClass>> = Object.freeze(
  Object.fromEntries(
    (Object.entries(CLASS_CODES) as Array<[OwnerPriorityClass, readonly string[]]>).flatMap(([cls, codes]) =>
      codes.map((code) => [code, cls] as const)
    )
  )
);

/**
 * Classify a finding code. Unknown codes fall back by naming convention (data gaps / invalid
 * currency are missing evidence; data-quality opportunities are optimisation), otherwise to growth:
 * an unrecognised code is never allowed to outrank a known danger class.
 */
export function classifyOwnerFindingCode(code: string): OwnerPriorityClass {
  const known = OWNER_PRIORITY_CLASS_BY_CODE[code];
  if (known) return known;
  if (/_MISSING_CRITICAL_DATA$|_INVALID_CURRENCY$|^STR_MISSING_/.test(code)) return "MISSING_CRITICAL_EVIDENCE";
  if (/_OPP_DATA_QUALITY$/.test(code)) return "PROCESS_OPTIMISATION";
  return "GROWTH_OPPORTUNITY";
}

// --- Candidate contract --------------------------------------------------------------------------

export type OwnerCandidateSource = "domain_action" | "compliance_item" | "business_risk";

/** Why a candidate is not eligible to be the owner's target (null = eligible). */
export type OwnerCandidateExclusion =
  | "completed"
  | "cancelled"
  | "verified_complete"
  | "verified_fix_awaiting_new_evidence"
  | "superseded";

/** One normalized candidate that competes for the owner's overall priority. */
export interface OwnerDecisionCandidate {
  /** Stable id: `${source}:${sourceId}`. */
  candidateId: string;
  businessId: string;
  workspaceId: string;
  source: OwnerCandidateSource;
  /** Domain that produced it; control sources use the domain their owner page lives under. */
  domain: OwnerDomain | "compliance" | "risk";
  sourceId: string;
  priorityClass: OwnerPriorityClass;
  findingCode: string;
  findingId: string | null;
  title: string;
  explanation: string;
  /** Severity from the linked finding (or source); null when the source has none (never invented). */
  severity: OwnerSeverity | null;
  /** Existing Spine priority score (0..100) — reused, never recalculated here. */
  priorityScore: number;
  expectedImpactScore: number;
  /** 0..1 evidence confidence carried from the source. */
  confidence: number;
  effortScore: number;
  status: string;
  ownerActionRequired: boolean;
  blocking: boolean;
  evidence: string[];
  missingData: string[];
  verificationMetric: string | null;
  /** When the evidence that raised this candidate was captured (snapshot time); null if unknown. */
  evidenceAsOf: Date | null;
  /** True when the evidence is older than the owner-decision freshness window. */
  stale: boolean;
  /** Lifecycle exclusion computed by the normalizer; null ⇒ eligible. */
  exclusion: OwnerCandidateExclusion | null;
  /** Owner page where this is worked. */
  targetRoute: string;
}

export function isEligibleOwnerCandidate(c: OwnerDecisionCandidate): boolean {
  return c.exclusion === null;
}

// --- Canonical comparator --------------------------------------------------------------------------

/** The factor that decided the order between two candidates (for "why this wins"). */
export type OwnerPrecedenceFactor =
  | "class"
  | "severity"
  | "priority"
  | "impact"
  | "confidence"
  | "effort"
  | "identifier";

function severityRankOrUnknown(s: OwnerSeverity | null): number {
  return s === null ? -1 : ownerSeverityRank(s);
}

/** Returns [ordering, deciding factor]. ordering < 0 ⇒ a before b. Total and deterministic. */
export function compareOwnerCandidatesWithFactor(
  a: OwnerDecisionCandidate,
  b: OwnerDecisionCandidate
): [number, OwnerPrecedenceFactor] {
  const cls = ownerPriorityClassRank(a.priorityClass) - ownerPriorityClassRank(b.priorityClass);
  if (cls !== 0) return [cls, "class"];
  const sev = severityRankOrUnknown(b.severity) - severityRankOrUnknown(a.severity);
  if (sev !== 0) return [sev, "severity"];
  const pr = clampScore(b.priorityScore) - clampScore(a.priorityScore);
  if (pr !== 0) return [pr, "priority"];
  const im = clampScore(b.expectedImpactScore) - clampScore(a.expectedImpactScore);
  if (im !== 0) return [im, "impact"];
  const cf = clampConfidence(b.confidence) - clampConfidence(a.confidence);
  if (cf !== 0) return [cf, "confidence"];
  const ef = clampScore(a.effortScore) - clampScore(b.effortScore);
  if (ef !== 0) return [ef, "effort"];
  if (a.findingCode !== b.findingCode) return [a.findingCode < b.findingCode ? -1 : 1, "identifier"];
  if (a.candidateId !== b.candidateId) return [a.candidateId < b.candidateId ? -1 : 1, "identifier"];
  return [0, "identifier"];
}

export function compareOwnerCandidates(a: OwnerDecisionCandidate, b: OwnerDecisionCandidate): number {
  return compareOwnerCandidatesWithFactor(a, b)[0];
}

/** Eligible candidates in canonical order (pure; does not mutate the input). */
export function rankOwnerCandidates(candidates: readonly OwnerDecisionCandidate[]): OwnerDecisionCandidate[] {
  return candidates.filter(isEligibleOwnerCandidate).sort(compareOwnerCandidates);
}

// --- Decision contract -------------------------------------------------------------------------------

export const OWNER_DECISION_CONTRACT_VERSION = "owner-decision-v1" as const;

export type OwnerDecisionState =
  /** A primary target was elected from eligible candidates. */
  | "TARGET"
  /** Domains are diagnosed but no open work remains. */
  | "NO_OPEN_ACTIONS"
  /** No domain has been diagnosed yet: only honest "add data" guidance. */
  | "NO_EVIDENCE";

export type OwnerDecisionConfidenceLevel = "high" | "moderate" | "low" | "insufficient";

export interface OwnerDecisionTarget {
  candidateId: string;
  source: OwnerCandidateSource;
  domain: OwnerDecisionCandidate["domain"];
  domainLabel: string;
  priorityClass: OwnerPriorityClass;
  findingCode: string;
  title: string;
  explanation: string;
  severity: OwnerSeverity | null;
  status: string;
  targetRoute: string;
}

export type OwnerDecisionChangeKind =
  | "MAIN_TARGET_CHANGED"
  | "CRITICAL_ISSUE_APPEARED"
  | "CRITICAL_ISSUE_RESOLVED"
  | "ACTION_COMPLETED"
  | "ACTION_VERIFIED"
  | "EVIDENCE_UPDATED"
  | "FUNDING_GAP_CHANGED"
  | "CONFIDENCE_CHANGED";

export interface OwnerDecisionChange {
  kind: OwnerDecisionChangeKind;
  message: string;
}

export interface CurrentOwnerDecision {
  contractVersion: typeof OWNER_DECISION_CONTRACT_VERSION;
  businessId: string;
  workspaceId: string;
  generatedAt: string;
  state: OwnerDecisionState;
  primaryTarget: OwnerDecisionTarget | null;
  primaryCandidateId: string | null;
  primaryDomain: OwnerDecisionCandidate["domain"] | null;
  whyThisWins: string[];
  evidence: string[];
  confidence: {
    level: OwnerDecisionConfidenceLevel;
    /** 0..100 */
    score: number;
    capped: boolean;
    reasons: string[];
  };
  whatToDoFirst: string | null;
  supportingSteps: OwnerDecisionTarget[];
  whatCanWait: OwnerDecisionTarget[];
  whatNotToDo: string[];
  missingInformation: string[];
  whatChanged: OwnerDecisionChange[];
  reassessmentTrigger: string;
  /** Full canonical order of eligible candidates (primary first) — the ONLY ranked owner-attention list. */
  attention: OwnerDecisionTarget[];
  /** Candidates removed from the election and why (for audit/transparency). */
  excluded: Array<{ candidateId: string; title: string; reason: OwnerCandidateExclusion }>;
  /** Condensed state persisted (with the Now View snapshot) so the next read can say what changed. */
  memory: OwnerDecisionMemory;
}

/** Minimal previous-decision state persisted with the Now View snapshot (for "what changed"). */
export interface OwnerDecisionMemory {
  generatedAt: string;
  primaryKey: string | null;
  primaryTitle: string | null;
  criticalKeys: string[];
  confidenceScore: number;
  confidenceLevel: OwnerDecisionConfidenceLevel;
  fundingGap: number | null;
}

/** Strategy's live decision, as far as the arbiter needs it (for "what not to do"). */
export interface OwnerDecisionStrategyContext {
  code: "NEED_INFO" | "DONT_AS_PLANNED" | "NOT_YET" | "GO_WITH_CONDITIONS" | "GO";
  headline: string;
  headlineDetail: string | null;
  optionName: string | null;
  fundingGap: number | null;
  currency: string;
}

export interface OwnerDecisionEvent {
  kind: "ACTION_COMPLETED" | "ACTION_VERIFIED";
  title: string;
  at: Date;
}

export interface ResolveOwnerDecisionInput {
  businessId: string;
  workspaceId: string;
  candidates: readonly OwnerDecisionCandidate[];
  /** Domains that have at least one diagnosis (evidence exists). */
  diagnosedDomains: readonly string[];
  dataSufficiency: {
    status: "sufficient" | "caution" | "insufficient";
    lowestDataConfidenceScore: number;
    lowConfidenceDomains: string[];
    missingCriticalData: string[];
  };
  /** Domains whose latest evidence is older than the freshness window. */
  staleDomains: readonly string[];
  strategy: OwnerDecisionStrategyContext | null;
  reassessment: { days: number; reason: string };
  previous: OwnerDecisionMemory | null;
  events: readonly OwnerDecisionEvent[];
  /** Domains with a diagnosis generated after `previous.generatedAt`. */
  domainsDiagnosedSince: readonly string[];
  now: Date;
}

const DOMAIN_LABEL: Record<string, string> = {
  finance: "Finance",
  cashflow: "Cash flow",
  strategy: "Strategy",
  recovery: "Recovery",
  sales: "Sales",
  operations: "Operations",
  sop: "Execution",
  marketing: "Marketing",
  customer: "Customers",
  portfolio: "Portfolio",
  compliance: "Compliance",
  risk: "Risks",
};

export function ownerDomainLabel(domain: string): string {
  return DOMAIN_LABEL[domain] ?? domain;
}

const MAX_SUPPORTING = 3;
const MAX_CAN_WAIT = 5;

function toTarget(c: OwnerDecisionCandidate): OwnerDecisionTarget {
  return {
    candidateId: c.candidateId,
    source: c.source,
    domain: c.domain,
    domainLabel: ownerDomainLabel(c.domain),
    priorityClass: c.priorityClass,
    findingCode: c.findingCode,
    title: c.title,
    explanation: c.explanation,
    severity: c.severity,
    status: c.status,
    targetRoute: c.targetRoute,
  };
}

/** Stable identity of an issue across re-diagnoses (action rows are re-created per cycle). */
export function ownerCandidateIssueKey(c: Pick<OwnerDecisionCandidate, "domain" | "findingCode">): string {
  return `${c.domain}:${c.findingCode}`;
}

function factorSentence(
  factor: OwnerPrecedenceFactor,
  winner: OwnerDecisionCandidate,
  runnerUp: OwnerDecisionCandidate
): string {
  const other = `"${runnerUp.title}" (${ownerDomainLabel(runnerUp.domain)})`;
  switch (factor) {
    case "class":
      return `It is ${OWNER_PRIORITY_CLASS_LABEL[winner.priorityClass]}, and OpsIQ always deals with that before ${OWNER_PRIORITY_CLASS_LABEL[runnerUp.priorityClass]} such as ${other}.`;
    case "severity":
      return `It is rated ${winner.severity ?? "unrated"}, more serious than ${other} (${runnerUp.severity ?? "unrated"}).`;
    case "priority":
      return `Both are ${OWNER_PRIORITY_CLASS_LABEL[winner.priorityClass]} of the same seriousness; this one has the higher combined urgency, impact and pressure score (${Math.round(clampScore(winner.priorityScore))} vs ${Math.round(clampScore(runnerUp.priorityScore))} for ${other}).`;
    case "impact":
      return `It is as urgent as ${other} but is expected to make a bigger difference to the business.`;
    case "confidence":
      return `It is as urgent and as valuable as ${other}, and the evidence behind it is stronger.`;
    case "effort":
      return `It is as urgent and as valuable as ${other} and takes less effort, so it comes first.`;
    case "identifier":
      return `It is equal to ${other} on every business factor; OpsIQ lists it first so the order stays the same every time.`;
  }
}

function confidenceLevelFor(score: number): OwnerDecisionConfidenceLevel {
  if (score >= 75) return "high";
  if (score >= 50) return "moderate";
  if (score >= 25) return "low";
  return "insufficient";
}

function formatMoney(value: number, currency: string): string {
  const symbol = currency === "INR" ? "₹" : currency === "GBP" ? "£" : currency === "EUR" ? "€" : currency === "USD" ? "$" : "";
  const rounded = Math.round(value);
  const locale = currency === "INR" ? "en-IN" : "en-GB";
  return symbol ? `${symbol}${rounded.toLocaleString(locale)}` : `${rounded.toLocaleString(locale)} ${currency}`;
}

function buildMemory(
  generatedAt: string,
  primary: OwnerDecisionTarget | null,
  attention: OwnerDecisionTarget[],
  confidenceScore: number,
  confidenceLevel: OwnerDecisionConfidenceLevel,
  fundingGap: number | null
): OwnerDecisionMemory {
  return {
    generatedAt,
    primaryKey: primary ? ownerCandidateIssueKey(primary) : null,
    primaryTitle: primary ? primary.title : null,
    criticalKeys: attention.filter((t) => t.severity === "critical").map((t) => ownerCandidateIssueKey(t)),
    confidenceScore,
    confidenceLevel,
    fundingGap,
  };
}

/** Parse a persisted memory defensively (it lives in a Json snapshot payload). */
export function parseOwnerDecisionMemory(value: unknown): OwnerDecisionMemory | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.generatedAt !== "string" || Number.isNaN(Date.parse(v.generatedAt))) return null;
  const level = v.confidenceLevel;
  return {
    generatedAt: v.generatedAt,
    primaryKey: typeof v.primaryKey === "string" ? v.primaryKey : null,
    primaryTitle: typeof v.primaryTitle === "string" ? v.primaryTitle : null,
    criticalKeys: Array.isArray(v.criticalKeys) ? v.criticalKeys.filter((k): k is string => typeof k === "string") : [],
    confidenceScore: typeof v.confidenceScore === "number" ? clampScore(v.confidenceScore) : 0,
    confidenceLevel:
      level === "high" || level === "moderate" || level === "low" || level === "insufficient" ? level : "insufficient",
    fundingGap: typeof v.fundingGap === "number" && Number.isFinite(v.fundingGap) ? v.fundingGap : null,
  };
}

function detectChanges(
  input: ResolveOwnerDecisionInput,
  ranked: OwnerDecisionCandidate[],
  primary: OwnerDecisionCandidate | null,
  confidenceScore: number,
  confidenceLevel: OwnerDecisionConfidenceLevel
): OwnerDecisionChange[] {
  const prev = input.previous;
  if (!prev) return [];
  const since = Date.parse(prev.generatedAt);
  const changes: OwnerDecisionChange[] = [];

  const primaryKey = primary ? ownerCandidateIssueKey(primary) : null;
  if (primaryKey !== prev.primaryKey) {
    if (primary && prev.primaryTitle) {
      changes.push({ kind: "MAIN_TARGET_CHANGED", message: `Your main target changed from "${prev.primaryTitle}" to "${primary.title}".` });
    } else if (primary) {
      changes.push({ kind: "MAIN_TARGET_CHANGED", message: `You now have a main target: "${primary.title}".` });
    } else if (prev.primaryTitle) {
      changes.push({ kind: "MAIN_TARGET_CHANGED", message: `"${prev.primaryTitle}" is no longer your main target, and nothing else needs your attention right now.` });
    }
  }

  const currentCritical = new Map(ranked.filter((c) => c.severity === "critical").map((c) => [ownerCandidateIssueKey(c), c]));
  const prevCritical = new Set(prev.criticalKeys);
  for (const [key, c] of currentCritical) {
    if (!prevCritical.has(key)) changes.push({ kind: "CRITICAL_ISSUE_APPEARED", message: `New critical issue: "${c.title}" (${ownerDomainLabel(c.domain)}).` });
  }
  const resolvedCount = prev.criticalKeys.filter((k) => !currentCritical.has(k)).length;
  if (resolvedCount > 0) {
    changes.push({
      kind: "CRITICAL_ISSUE_RESOLVED",
      message: resolvedCount === 1 ? "A critical issue from your last check is no longer open." : `${resolvedCount} critical issues from your last check are no longer open.`,
    });
  }

  for (const e of [...input.events].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    if (e.at.getTime() <= since) continue;
    changes.push(
      e.kind === "ACTION_COMPLETED"
        ? { kind: "ACTION_COMPLETED", message: `Completed: "${e.title}".` }
        : { kind: "ACTION_VERIFIED", message: `Verified as fixed: "${e.title}" reached its target.` }
    );
  }

  for (const d of input.domainsDiagnosedSince) {
    changes.push({ kind: "EVIDENCE_UPDATED", message: `New ${ownerDomainLabel(d)} data was analysed since your last check.` });
  }

  const gap = input.strategy?.fundingGap ?? null;
  if (gap !== prev.fundingGap && (gap !== null || prev.fundingGap !== null)) {
    const currency = input.strategy?.currency ?? "INR";
    const fmt = (v: number | null) => (v === null ? "unknown" : v <= 0 ? "covered" : formatMoney(v, currency));
    changes.push({ kind: "FUNDING_GAP_CHANGED", message: `Funding gap changed from ${fmt(prev.fundingGap)} to ${fmt(gap)}.` });
  }

  if (confidenceLevel !== prev.confidenceLevel || Math.abs(confidenceScore - prev.confidenceScore) >= 15) {
    changes.push({ kind: "CONFIDENCE_CHANGED", message: `OpsIQ's confidence in this advice changed from ${prev.confidenceLevel} to ${confidenceLevel}.` });
  }
  return changes;
}

/**
 * Resolve the ONE current owner decision. Deterministic for identical input. Exactly one primary
 * target when any eligible candidate exists; otherwise an honest non-target state.
 */
export function resolveOwnerDecision(input: ResolveOwnerDecisionInput): CurrentOwnerDecision {
  const ranked = rankOwnerCandidates(
    input.candidates.filter((c) => c.businessId === input.businessId && c.workspaceId === input.workspaceId)
  );
  const excluded = input.candidates
    .filter((c) => c.exclusion !== null && c.businessId === input.businessId && c.workspaceId === input.workspaceId)
    .map((c) => ({ candidateId: c.candidateId, title: c.title, reason: c.exclusion as OwnerCandidateExclusion }));

  const primary = ranked[0] ?? null;
  const hasEvidence = input.diagnosedDomains.length > 0;
  const state: OwnerDecisionState = primary ? "TARGET" : hasEvidence ? "NO_OPEN_ACTIONS" : "NO_EVIDENCE";

  // Missing information: never invented — carried from the diagnosis layer and the primary's finding.
  const missingInformation: string[] = [];
  const pushMissing = (s: string) => {
    if (s && !missingInformation.includes(s)) missingInformation.push(s);
  };
  if (!hasEvidence) pushMissing("Add your business numbers (sales, costs and cash) so OpsIQ can find your main target.");
  for (const m of input.dataSufficiency.missingCriticalData) pushMissing(m);
  if (primary) for (const m of primary.missingData) pushMissing(m);
  for (const d of input.staleDomains) pushMissing(`Update your ${ownerDomainLabel(d)} data — the latest figures are out of date.`);

  // Confidence: the primary's own evidence confidence, capped by business-wide data sufficiency.
  const reasons: string[] = [];
  let score = primary ? Math.round(clampConfidence(primary.confidence) * 100) : 0;
  let capped = false;
  const primaryIsDataRequest = primary?.priorityClass === "MISSING_CRITICAL_EVIDENCE";
  if (primary && !primaryIsDataRequest) {
    if (input.dataSufficiency.status === "insufficient" && score > 40) {
      score = 40;
      capped = true;
      reasons.push("Important business data is missing, so this advice is provisional.");
    } else if (input.dataSufficiency.status === "caution" && score > 70) {
      score = 70;
      capped = true;
      reasons.push("Some data is incomplete, so treat this advice with some caution.");
    }
    if (primary.stale && score > 50) {
      score = 50;
      capped = true;
      reasons.push(`The ${ownerDomainLabel(primary.domain)} figures behind this are out of date.`);
    }
  }
  if (primaryIsDataRequest) reasons.push("OpsIQ is certain this information is missing; advice on everything else waits for it.");
  const level: OwnerDecisionConfidenceLevel = primary ? confidenceLevelFor(score) : "insufficient";
  if (!primary && !hasEvidence) reasons.push("There is no business data yet.");

  // Why this wins: explicit arbitration against the strongest competitor, and against the strongest
  // competitor from a DIFFERENT domain (so a Finance-vs-Strategy conflict is always named).
  const whyThisWins: string[] = [];
  if (primary) {
    whyThisWins.push(`This is ${OWNER_PRIORITY_CLASS_LABEL[primary.priorityClass]}${primary.severity ? ` (${primary.severity})` : ""} from your ${ownerDomainLabel(primary.domain)} evidence.`);
    const runnerUp = ranked[1] ?? null;
    if (runnerUp) {
      const [, factor] = compareOwnerCandidatesWithFactor(primary, runnerUp);
      whyThisWins.push(factorSentence(factor, primary, runnerUp));
    }
    const otherDomain = ranked.find((c) => c.domain !== primary.domain) ?? null;
    if (otherDomain && otherDomain !== runnerUp) {
      const [, factor] = compareOwnerCandidatesWithFactor(primary, otherDomain);
      whyThisWins.push(factorSentence(factor, primary, otherDomain));
    }
    if (!runnerUp) whyThisWins.push("It is the only open item that needs you right now.");
  }

  // Supporting steps: the next items from the SAME domain (what to do after the first step);
  // what can wait: everything else, in canonical order.
  const rest = ranked.slice(1);
  const supporting = primary ? rest.filter((c) => c.domain === primary.domain).slice(0, MAX_SUPPORTING) : [];
  const supportingIds = new Set(supporting.map((c) => c.candidateId));
  const canWait = rest.filter((c) => !supportingIds.has(c.candidateId)).slice(0, MAX_CAN_WAIT);

  // What NOT to do: never start lower-class work ahead of the primary; honour Strategy's live decision.
  const whatNotToDo: string[] = [];
  if (primary) {
    const primaryRank = ownerPriorityClassRank(primary.priorityClass);
    const growth = rest.find((c) => c.priorityClass === "GROWTH_OPPORTUNITY");
    if (growth && primaryRank < ownerPriorityClassRank("GROWTH_OPPORTUNITY")) {
      whatNotToDo.push(`Don't start growth or investment work such as "${growth.title}" until "${primary.title}" is handled.`);
    }
  }
  const s = input.strategy;
  if (s && (s.code === "NOT_YET" || s.code === "DONT_AS_PLANNED" || s.code === "NEED_INFO")) {
    const option = s.optionName ? `"${s.optionName}"` : "the plan you are evaluating";
    whatNotToDo.push(`Don't commit to ${option} yet — Strategy says "${s.headline}"${s.headlineDetail ? `: ${s.headlineDetail}` : "."}`);
  }
  if (input.dataSufficiency.status === "insufficient" && input.dataSufficiency.lowConfidenceDomains.length > 0) {
    whatNotToDo.push(
      `Don't rely on the ${input.dataSufficiency.lowConfidenceDomains.map(ownerDomainLabel).join(", ")} scores yet — they are based on incomplete data.`
    );
  }

  const evidence = primary ? [...primary.evidence] : [];

  const whatToDoFirst = primary ? primary.title : !hasEvidence ? missingInformation[0] ?? null : null;

  const reassessmentTrigger = primary
    ? `Check again when "${primary.title}" is done${primary.verificationMetric ? ` or ${primary.verificationMetric} changes` : ""}, when new ${ownerDomainLabel(primary.domain)} data is added, or within ${input.reassessment.days} days (${input.reassessment.reason})`
    : hasEvidence
      ? `Check again when new data is added, or within ${input.reassessment.days} days (${input.reassessment.reason})`
      : "Check again as soon as you add your business numbers.";

  const generatedAt = input.now.toISOString();
  const primaryTarget = primary ? toTarget(primary) : null;
  const attention = ranked.map(toTarget);
  return {
    contractVersion: OWNER_DECISION_CONTRACT_VERSION,
    businessId: input.businessId,
    workspaceId: input.workspaceId,
    generatedAt,
    state,
    primaryTarget,
    primaryCandidateId: primary ? primary.candidateId : null,
    primaryDomain: primary ? primary.domain : null,
    whyThisWins,
    evidence,
    confidence: { level, score, capped, reasons },
    whatToDoFirst,
    supportingSteps: supporting.map(toTarget),
    whatCanWait: canWait.map(toTarget),
    whatNotToDo,
    missingInformation,
    whatChanged: detectChanges(input, ranked, primary, score, level),
    reassessmentTrigger,
    attention,
    excluded,
    memory: buildMemory(generatedAt, primaryTarget, attention, score, level, input.strategy?.fundingGap ?? null),
  };
}
