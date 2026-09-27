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
import { humanizeMetricKey } from "@/lib/metric-label";
import { ownerImperativeContext, reconcileOwnerProhibition, ownerLeverKey } from "./owner-imperatives";
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
  // A plan the owner is evaluating that would put money or delivery at risk IF they commit now
  // (Strategy NOT_YET / DONT_AS_PLANNED). Prospective, so it follows every PRESENT problem above.
  "PLAN_COMMITMENT_RISK",
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
  PROFIT_LOSS: "money the business is losing or cannot collect",
  BLOCKED_EXECUTION: "work that cannot move forward",
  PLAN_COMMITMENT_RISK: "a plan that would put money or delivery at risk if you commit to it now",
  MISSING_CRITICAL_EVIDENCE: "missing information OpsIQ needs to advise you safely",
  GROWTH_OPPORTUNITY: "a growth or investment decision",
  PROCESS_OPTIMISATION: "a process improvement",
};

/** Rank of a class: lower wins. */
export function ownerPriorityClassRank(c: OwnerPriorityClass): number {
  return OWNER_PRIORITY_CLASSES.indexOf(c);
}

// Placement follows what each rule MEASURES (read from the emitting rule file), not its prefix or
// its risk/opportunity flag: an "opportunity" that frees trapped cash or stops a leak belongs with the
// loss it fixes; a data gap about a hypothetical Strategy option is part of that growth decision, not
// a gap in the evidence about the running business.
const CLASS_CODES: Record<OwnerPriorityClass, readonly string[]> = {
  SAFETY_COMPLIANCE: ["COMPLIANCE_BREACH"],
  SURVIVAL_CASH: [
    "FIN_INSOLVENT_RUNWAY", "FIN_LOW_RUNWAY", "FIN_LOW_ABSOLUTE_CASH", "FIN_HIGH_DEBT_PRESSURE",
    // Its own rule text: "vendor-cutoff and liquidity risk are elevated" — the same danger as CF_VENDOR_CUTOFF_RISK.
    "FIN_HIGH_PAYABLES",
    "CF_INSOLVENT_RUNWAY", "CF_LOW_RUNWAY", "CF_URGENT_PAYMENT_RISK", "CF_VENDOR_CUTOFF_RISK", "CF_DEBT_DEFAULT_RISK",
  ],
  CUSTOMER_SERVICE_FAILURE: [
    "OPS_DELIVERY_FAILURE", "OPS_HIGH_COMPLAINT_RATE", "OPS_HIGH_REWORK", "OPS_HIGH_DELAY", "OPS_LOW_COMPLETION",
    "SALES_HIGH_COMPLAINT_RATIO", "SALES_HIGH_REFUND_RATE",
    // "Stockouts are interrupting fulfilment" (its own rule text): customers are not being served.
    "OPS_INVENTORY_SHORTAGE",
    // Customers not coming back is a retention/service failure (Now View classifies churn the same way).
    "SALES_WEAK_REPEAT",
    "QUALITY_FAILURE", "SLOW_TURNAROUND", "WEAK_REPEAT_RATE",
  ],
  // Demand exceeding capacity is overload that blocks the business from serving customers.
  OVERLOAD_BLOCKING: ["OPS_CAPACITY_BOTTLENECK"],
  PROFIT_LOSS: [
    "FIN_BELOW_BREAK_EVEN", "FIN_NEGATIVE_GROSS_MARGIN", "FIN_NEGATIVE_NET_MARGIN", "FIN_HIGH_FIXED_COST_BURDEN",
    "FIN_HIGH_PAYROLL_BURDEN", "FIN_HIGH_RECEIVABLES",
    "FIN_DISCOUNT_LEAKAGE", "FIN_REFUND_REWORK_LEAKAGE",
    // Loss-reduction / cash-release fixes for the same money problems (never "growth" to defer).
    "FIN_OPP_BREAK_EVEN_RECOVERY", "FIN_OPP_DEBT_REDUCTION", "FIN_OPP_LEAKAGE_REDUCTION", "FIN_OPP_MARGIN_IMPROVEMENT",
    "FIN_OPP_RECEIVABLES_COLLECTION",
    "CF_HIGH_OVERDUE_RECEIVABLES", "CF_SLOW_COLLECTIONS", "CF_OWNER_WITHDRAWAL_PRESSURE",
    "CF_OPP_COLLECT_OVERDUE", "CF_OPP_DEFER_PAYABLES", "CF_OPP_REDUCE_OWNER_WITHDRAWAL",
    // The current revenue engine failing (sales lost now), not optional upside.
    "SALES_LOST_CUSTOMER_LEAKAGE", "SALES_DISCOUNT_DEPENDENCE", "SALES_LOW_CONVERSION", "SALES_POOR_FOLLOW_UP",

    "MKT_WASTED_SPEND", "MKT_POOR_CONVERSION", "MKT_NO_FOLLOWUP", "MKT_WEAK_OFFER",
    // Discount capping and idle paid hours "recover margin" (their own rule text): the same loss as
    // SALES_DISCOUNT_DEPENDENCE / LOW_STAFF_PRODUCTIVITY, never optional growth or process polish.
    "SALES_OPP_TIGHTEN_DISCOUNT", "OPS_HIGH_IDLE",
    "HIGH_COST_RATIO", "DISCOUNT_LEAKAGE", "DELIVERY_COST_LEAKAGE", "RECEIVABLES_PRESSURE", "LOW_REVENUE",
    "LOW_STAFF_PRODUCTIVITY", "POOR_CAMPAIGN_CONVERSION", "LOW_AOV",
  ],
  BLOCKED_EXECUTION: [
    "OPS_SOP_NONCOMPLIANCE",
    "SOP_HIGH_OVERDUE", "SOP_LOW_COMPLETION", "SOP_HIGH_DISPUTE", "SOP_LOW_PROOF_COMPLIANCE", "SOP_LOW_VERIFICATION",
    "SOP_HIGH_REASSIGNMENT", "SOP_LOW_COVERAGE",
    // Internal actions failing repeatedly ("needs an SOP, not another reminder") — execution, not customers.
    "SOP_REPEATED_FAILURES",
  ],
  // Assigned only from Strategy's resolved decision (strategyCandidatePriorityClass), never by code.
  PLAN_COMMITMENT_RISK: [],
  MISSING_CRITICAL_EVIDENCE: [
    "FIN_MISSING_CRITICAL_DATA", "FIN_INVALID_CURRENCY",
    "CF_MISSING_CRITICAL_DATA", "CF_INVALID_CURRENCY",
    "SALES_MISSING_CRITICAL_DATA", "SALES_INVALID_CURRENCY",
    "OPS_MISSING_CRITICAL_DATA", "OPS_INVALID_CURRENCY",
    "SOP_MISSING_CRITICAL_DATA", "SOP_INVALID_CURRENCY",
    "MKT_MISSING_CRITICAL_DATA", "MKT_INVALID_CURRENCY",
  ],
  GROWTH_OPPORTUNITY: [
    "SALES_OPP_CONVERT_PIPELINE", "SALES_OPP_IMPROVE_RETENTION", "SALES_OPP_RAISE_CONVERSION",
    "SALES_OPP_WINBACK",
    // A composite revenue-quality score below target (low severity, "diversify and de-discount"):
    // resilience upside, not a measured loss — the actual discount loss is FIN_DISCOUNT_LEAKAGE.
    "FIN_OPP_REVENUE_QUALITY",
    // Revenue-resilience risks, not measured losses: B2B dependence ("losing one contract can collapse
    // revenue") and a thin B2B pipeline ("future B2B sales stall") — same reasoning as revenue quality.
    "B2B_CONCENTRATION", "SALES_WEAK_B2B_PIPELINE",
    // Their own rule text calls these growth ("growth is not rented", "the cheapest growth is being
    // left on the table") — the same condition as MKT_OPP_ACTIVATE_REFERRALS / MKT_OPP_BUILD_ORGANIC.
    "MKT_LOW_REFERRAL", "MKT_WRONG_CHANNEL_MIX",
    "MKT_OPP_ACTIVATE_REFERRALS", "MKT_OPP_ADD_FOLLOWUP", "MKT_OPP_BUILD_ORGANIC", "MKT_OPP_LIFT_CONVERSION",
    "MKT_OPP_SCALE_WINNER",
    // Strategy evaluates an optional investment: its warnings AND its data gaps are part of that
    // growth decision (a missing field on a hypothetical option is not a gap about the running business).
    "STR_UNAFFORDABLE", "STR_LOW_CASH_RESERVE", "STR_HIGH_EXECUTION_RISK", "STR_LONG_PAYBACK", "STR_NEGATIVE_BASE_CASE",
    "STR_NEGATIVE_ROI", "STR_NEGATIVE_WORST_CASE", "STR_WEAK_ROI",
    "STR_OPP_FAST_PAYBACK", "STR_OPP_SAFE_UPSIDE", "STR_OPP_STRONG_RETURN",
    "STR_MISSING_CRITICAL_DATA", "STR_INVALID_CURRENCY", "STR_MISSING_CASH", "STR_MISSING_RISK_LEVEL",
  ],
  PROCESS_OPTIMISATION: [
    "FIN_OPP_DATA_QUALITY", "CF_OPP_DATA_QUALITY", "SALES_OPP_DATA_QUALITY", "OPS_OPP_DATA_QUALITY",
    "SOP_OPP_DATA_QUALITY", "MKT_OPP_DATA_QUALITY",
    // A low-severity "enter the EMI for the recorded debt" data request (opportunity-rules.ts).
    "FIN_NOTABLE_OUTSTANDING_DEBT",
    "OPS_OPP_CLOSE_SOP_GAP", "OPS_OPP_CUT_REWORK", "OPS_OPP_RECLAIM_IDLE", "OPS_OPP_RECOVER_DELAYS",
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
  if (/^STR_/.test(code)) return "GROWTH_OPPORTUNITY";
  if (/_MISSING_CRITICAL_DATA$|_INVALID_CURRENCY$/.test(code)) return "MISSING_CRITICAL_EVIDENCE";
  if (/_OPP_DATA_QUALITY$/.test(code)) return "PROCESS_OPTIMISATION";
  return "GROWTH_OPPORTUNITY";
}

// --- Strategy: precedence from the resolved five-state decision -------------------------------------

/** Strategy decision codes (owner-strategy/decision.ts STRATEGY_DECISION_CODES). */
export type StrategyDecisionCodeForPriority = "NEED_INFO" | "DONT_AS_PLANNED" | "NOT_YET" | "GO_WITH_CONDITIONS" | "GO";

const STRATEGY_MONEY_AT_RISK_CODES = new Set([
  // cash: the plan cannot be funded without draining the business
  "STR_UNAFFORDABLE", "STR_LOW_CASH_RESERVE",
  // economics: going ahead as planned loses money or never pays back
  "STR_NEGATIVE_BASE_CASE", "STR_NEGATIVE_ROI", "STR_NEGATIVE_WORST_CASE", "STR_WEAK_ROI", "STR_LONG_PAYBACK",
]);
const STRATEGY_EXECUTION_CODES = new Set(["STR_HIGH_EXECUTION_RISK"]);

/**
 * Class of a Strategy step, from Strategy's RESOLVED decision — never from the finding code alone.
 * Strategy evaluates an optional plan. Under GO / GO_WITH_CONDITIONS / NEED_INFO every step is part of
 * pursuing (or evaluating) that upside → growth. Under NOT_YET / DONT_AS_PLANNED Strategy is holding
 * the owner back from a plan because of an actual blocker — money the plan would put at risk
 * (unaffordable, or economics that lose money) or a plan the business cannot execute — so its guard
 * step is PLAN_COMMITMENT_RISK: above optional upside, process work and data requests, but below
 * every PRESENT problem (survival cash, customer failure, overload, measured losses, blocked work),
 * because the harm only happens if the owner commits. The "don't commit yet" warning stays visible
 * in whatNotToDo whatever the main target is.
 */
export function strategyCandidatePriorityClass(decisionCode: StrategyDecisionCodeForPriority | null, findingCode: string): OwnerPriorityClass {
  if (decisionCode === "NOT_YET" || decisionCode === "DONT_AS_PLANNED") {
    if (STRATEGY_MONEY_AT_RISK_CODES.has(findingCode) || STRATEGY_EXECUTION_CODES.has(findingCode)) return "PLAN_COMMITMENT_RISK";
  }
  return "GROWTH_OPPORTUNITY";
}

// --- Candidate contract --------------------------------------------------------------------------

export type OwnerCandidateSource =
  | "domain_action"
  | "compliance_item"
  | "business_risk"
  | "evidence_refresh"
  /**
   * A survival ISSUE raised by a cash/finance diagnosis that no eligible action for the SAME issue
   * represents (its action was completed/cancelled, or none exists) — the issue stays open while the
   * evidence that raised it is the evidence OpsIQ holds.
   */
  | "survival_reading";

/** Why a candidate is not eligible to be the owner's target (null = eligible). */
export type OwnerCandidateExclusion =
  | "completed"
  | "cancelled"
  | "verified_complete"
  | "verified_fix_awaiting_new_evidence"
  | "superseded"
  /** Its evidence is older than the freshness window: replaced by an explicit refresh target. */
  | "stale_evidence";

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

/**
 * The canonical candidate a persisted record (e.g. the entity an Alert points at) corresponds to.
 * Every owner-visible CRITICAL alert is a notification about a risk or a compliance breach (the only
 * owner-facing producers — business-risk.service.ts, compliance.service.ts); surfaces use this to link
 * such a notification to its place in the canonical order instead of showing it as a second priority.
 */
export function ownerDecisionCandidateIdForEntity(entityType: string | null | undefined, entityId: string | null | undefined): string | null {
  if (!entityId) return null;
  if (entityType === "BusinessRiskEntry") return `business_risk:${entityId}`;
  if (entityType === "OwnerComplianceItem") return `compliance_item:${entityId}`;
  return null;
}

// --- Canonical comparator --------------------------------------------------------------------------

/** The factor that decided the order between two candidates (for "why this wins"). */
export type OwnerPrecedenceFactor =
  | "class"
  | "recorded_block"
  | "severity"
  | "current_evidence"
  | "priority"
  | "impact"
  | "confidence"
  | "effort"
  | "identifier";

function isRecordedComplianceBlock(c: OwnerDecisionCandidate): boolean {
  return c.source === "compliance_item" && c.blocking;
}

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
  // A RECORDED compliance block (a breach, or an expired obligation the action gate stops on) is a
  // fact, not an estimate: within its class it precedes owner-estimated risks and diagnosed actions.
  const rb = Number(isRecordedComplianceBlock(b)) - Number(isRecordedComplianceBlock(a));
  if (rb !== 0) return [rb, "recorded_block"];
  const sev = severityRankOrUnknown(b.severity) - severityRankOrUnknown(a.severity);
  if (sev !== 0) return [sev, "severity"];
  // At equal class and severity, a CURRENT finding precedes a refresh of out-of-date figures: the
  // refresh keeps the urgency of what it stands in for, but never outranks equally urgent current work.
  const ce = Number(b.source !== "evidence_refresh") - Number(a.source !== "evidence_refresh");
  if (ce !== 0) return [ce, "current_evidence"];
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
  /** A workspace-level issue (risk / business-less compliance item) can no longer be attributed to this business. */
  | "ISSUE_NOT_ATTRIBUTABLE"
  | "ACTION_COMPLETED"
  | "ACTION_VERIFIED"
  | "EVIDENCE_UPDATED"
  | "EVIDENCE_OUT_OF_DATE"
  | "SEVERITY_INCREASED"
  | "SEVERITY_DECREASED"
  | "FUNDING_GAP_CHANGED"
  | "CONFIDENCE_CHANGED";

export interface OwnerDecisionChange {
  kind: OwnerDecisionChangeKind;
  message: string;
}

export interface CurrentOwnerDecision {
  /**
   * The business concern the main target represents, for narrative copy: its class — except for an
   * evidence refresh, whose concern is out-of-date information (never the old problem it stands in
   * for). Resolved here so no page re-derives it.
   */
  primaryConcernClass: OwnerPriorityClass | null;
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
  /** Condensed state persisted (as the owner.decision_changed audit event) so the next read can say what changed. */
  memory: OwnerDecisionMemory;
}

/** Minimal previous-decision state persisted as the owner.decision_changed audit event (for "what changed"). */
export interface OwnerDecisionMemory {
  generatedAt: string;
  primaryKey: string | null;
  primaryTitle: string | null;
  /** Critical issues still open — including ones awaiting an evidence refresh (never "resolved" by ageing). */
  criticalKeys: string[];
  /** Severity of every open, rated issue by stable issue key (domain + finding code / record id). */
  issueSeverities: Record<string, OwnerSeverity>;
  /** Evidence identity (snapshot id) per diagnosed domain; null in memories recorded before this existed. */
  evidenceIds: Record<string, string> | null;
  /** Domains whose evidence was out of date at this decision. */
  staleDomains: string[];
  /**
   * Whether workspace-level issues (owner-recorded risks, business-less compliance items) were
   * attributable to this business at this decision; null in memories recorded before this existed.
   */
  workspaceIssuesAttributable: boolean | null;
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
  /**
   * Evidence identity (the snapshot each domain's current diagnosis ran on). "New data" is reported
   * only when this identity changes — a re-diagnosis of the SAME snapshot (e.g. after an action is
   * completed or verified) is a new calculation, not new evidence.
   */
  evidenceIds?: Readonly<Record<string, string>>;
  /**
   * Lifecycle of known issues that are NOT competing now, by stable issue key: "open" (still open but
   * below the competing threshold, e.g. a critical risk now being mitigated) or "terminal" (the record
   * says it is closed: a resolved/closed risk, a compliant/waived obligation, a breach no longer
   * recorded). Absence from the candidates alone never proves resolution.
   */
  issueStates?: Readonly<Record<string, OwnerIssueState>>;
  /** Whether workspace-level issues can be attributed to this business (exactly one real business). */
  workspaceIssuesAttributable?: boolean;
  now: Date;
}

export interface OwnerIssueState {
  lifecycle: "open" | "terminal";
  title: string;
}

/** Issue keys of workspace-level records (risk, compliance) — attribution applies to these only. */
function isWorkspaceLevelIssueKey(key: string): boolean {
  return key.startsWith("risk:") || key.startsWith("compliance:");
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

/**
 * Stable identity of an issue across re-diagnoses. Domain actions are re-created per cycle, so their
 * issue is domain + finding code; control records (compliance items, risks) share one code per kind,
 * so their identity also includes the record id (two different breaches are two different issues).
 */
export function ownerCandidateIssueKey(c: Pick<OwnerDecisionCandidate, "domain" | "findingCode" | "candidateId" | "source">): string {
  // A survival reading shares the identity of the survival finding it carries, so an issue whose
  // action was closed while the same evidence still reads unsafe stays the SAME open issue.
  return c.source === "domain_action" || c.source === "survival_reading"
    ? `${c.domain}:${c.findingCode}`
    : `${c.domain}:${c.findingCode}:${c.candidateId}`;
}

function factorSentence(
  factor: OwnerPrecedenceFactor,
  winner: OwnerDecisionCandidate,
  runnerUp: OwnerDecisionCandidate
): string {
  const other = `"${runnerUp.title}" in ${ownerDomainLabel(runnerUp.domain)}`;
  // A refresh target is out-of-date figures, never a current problem: its class/severity are what
  // those figures LAST showed.
  const is = (c: OwnerDecisionCandidate) => (c.source === "evidence_refresh" ? "It confirms out-of-date figures that last showed" : "It is");
  const kind = (c: OwnerDecisionCandidate) =>
    c.source === "evidence_refresh" ? `out-of-date figures that last showed ${OWNER_PRIORITY_CLASS_LABEL[c.priorityClass]}` : OWNER_PRIORITY_CLASS_LABEL[c.priorityClass];
  const rating = (c: OwnerDecisionCandidate) => (clampScore(c.priorityScore) > 0 ? String(Math.round(clampScore(c.priorityScore))) : "not rated");
  if (winner.source === "evidence_refresh" && runnerUp.source === "evidence_refresh" && factor !== "class" && factor !== "severity") {
    // Two refresh targets are compared only on what their out-of-date figures LAST showed; the sentence
    // names the factor that actually decided, and never claims a "more pressing problem" on a tie.
    const lead = `Both rest on out-of-date figures that last showed ${OWNER_PRIORITY_CLASS_LABEL[winner.priorityClass]}${winner.severity ? ` (${winner.severity})` : ""}`;
    switch (factor) {
      case "priority":
        return `${lead}; what these last showed was rated higher (${rating(winner)} vs ${rating(runnerUp)} for ${other}), so confirm them first.`;
      case "impact":
        return `${lead}; what these last showed was expected to make a bigger difference than ${other}.`;
      case "confidence":
        return `${lead}; these figures were more reliable when last measured than those behind ${other}.`;
      case "effort":
        return `${lead}; confirming these takes less effort than ${other}.`;
      default:
        return `${lead}; they are equivalent on every known business factor, and OpsIQ lists this one before ${other} only so the order stays the same every time.`;
    }
  }
  switch (factor) {
    case "recorded_block":
      return `It is a recorded compliance problem, not an estimate, so it comes before ${other}.`;
    case "class":
      return `${is(winner)} ${OWNER_PRIORITY_CLASS_LABEL[winner.priorityClass]}, and OpsIQ always deals with that before ${kind(runnerUp)} such as ${other}.`;
    case "current_evidence":
      return `It is based on current figures, so it comes before ${other}, which rests on out-of-date figures.`;
    case "severity": {
      const rated = winner.source === "evidence_refresh" ? `Its out-of-date figures were last rated ${winner.severity}` : `It is rated ${winner.severity}`;
      return runnerUp.severity === null
        ? `${rated}; ${other} has no severity rating.`
        : runnerUp.source === "evidence_refresh"
          ? `${rated}, more serious than what the out-of-date figures behind ${other} last showed (${runnerUp.severity}).`
          : `${rated}, more serious than ${other} (rated ${runnerUp.severity}).`;
    }
    case "priority": {
      const sameSeverity = winner.severity !== null ? ` rated ${winner.severity}` : "";
      // Only Spine domain actions carry the combined urgency/impact/pressure score; Recovery and
      // control records carry a fixed rating on the same 0–100 scale, so the wording stays generic.
      const bothSpine = winner.source === "domain_action" && runnerUp.source === "domain_action" && winner.domain !== "recovery" && runnerUp.domain !== "recovery";
      const measure = bothSpine ? "higher combined urgency, impact and pressure score" : "higher priority rating";
      const w = rating(winner);
      const r = rating(runnerUp);
      return w === r
        ? `Both are ${OWNER_PRIORITY_CLASS_LABEL[winner.priorityClass]}${sameSeverity}; this one has a slightly ${measure} than ${other}.`
        : `Both are ${OWNER_PRIORITY_CLASS_LABEL[winner.priorityClass]}${sameSeverity}; this one has the ${measure} (${w} vs ${r} for ${other}).`;
    }
    case "impact":
      return `It is as urgent as ${other} but is expected to make a bigger difference to the business.`;
    case "confidence":
      return `Nothing else separates it from ${other}, and the evidence behind it is stronger.`;
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

/**
 * Critical issues that are still OPEN: eligible critical items (refresh targets stand in for, and are
 * not themselves, issues) plus critical items whose evidence merely went stale — ageing never
 * resolves a problem.
 */
function openIssues(ranked: readonly OwnerDecisionCandidate[], staleExcluded: readonly OwnerDecisionCandidate[]): Map<string, OwnerDecisionCandidate> {
  const open = new Map<string, OwnerDecisionCandidate>();
  for (const c of [...ranked, ...staleExcluded]) {
    if (c.source !== "evidence_refresh") open.set(ownerCandidateIssueKey(c), c);
  }
  return open;
}

function buildMemory(
  generatedAt: string,
  primary: OwnerDecisionTarget | null,
  open: Map<string, OwnerDecisionCandidate>,
  staleDomains: string[],
  confidenceScore: number,
  confidenceLevel: OwnerDecisionConfidenceLevel,
  fundingGap: number | null,
  evidenceIds: Readonly<Record<string, string>>,
  workspaceIssuesAttributable: boolean | null
): OwnerDecisionMemory {
  const issueSeverities: Record<string, OwnerSeverity> = {};
  for (const key of [...open.keys()].sort()) {
    const sev = open.get(key)!.severity;
    if (sev !== null) issueSeverities[key] = sev;
  }
  return {
    generatedAt,
    primaryKey: primary ? ownerCandidateIssueKey(primary) : null,
    primaryTitle: primary ? primary.title : null,
    criticalKeys: Object.keys(issueSeverities).filter((k) => issueSeverities[k] === "critical"),
    issueSeverities,
    evidenceIds: Object.fromEntries(Object.entries(evidenceIds).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
    staleDomains: [...staleDomains].sort(),
    workspaceIssuesAttributable,
    confidenceScore,
    confidenceLevel,
    fundingGap,
  };
}

/** True when two decision memories describe the same decision (no material change between them). */
export function sameOwnerDecisionMemory(a: OwnerDecisionMemory, b: OwnerDecisionMemory): boolean {
  const key = (m: OwnerDecisionMemory) =>
    JSON.stringify([
      m.primaryKey,
      Object.entries(m.issueSeverities).sort(),
      [...m.staleDomains].sort(),
      m.evidenceIds === null ? null : Object.entries(m.evidenceIds).sort(),
      m.workspaceIssuesAttributable,
      m.confidenceLevel,
      m.confidenceScore,
      m.fundingGap === null ? null : Math.round(m.fundingGap),
    ]);
  return key(a) === key(b);
}

function parseSeverityMap(value: unknown): Record<string, OwnerSeverity> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, OwnerSeverity> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === "critical" || v === "high" || v === "medium" || v === "low") out[k] = v;
  }
  return out;
}

function parseStringMap(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) if (typeof v === "string") out[k] = v;
  return out;
}

/** Parse a persisted memory defensively (it lives in the owner.decision_changed audit event payload). */
export function parseOwnerDecisionMemory(value: unknown): OwnerDecisionMemory | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.generatedAt !== "string" || Number.isNaN(Date.parse(v.generatedAt))) return null;
  // A memory without its confidence would fabricate a confidence change on the next read.
  if (typeof v.confidenceScore !== "number" || !Number.isFinite(v.confidenceScore)) return null;
  const level = v.confidenceLevel;
  const criticalKeys = Array.isArray(v.criticalKeys) ? v.criticalKeys.filter((k): k is string => typeof k === "string") : [];
  return {
    generatedAt: v.generatedAt,
    primaryKey: typeof v.primaryKey === "string" ? v.primaryKey : null,
    primaryTitle: typeof v.primaryTitle === "string" ? v.primaryTitle : null,
    criticalKeys,
    // Older memories only recorded critical keys: those are known to have been critical, nothing more.
    issueSeverities: parseSeverityMap(v.issueSeverities) ?? Object.fromEntries(criticalKeys.map((k) => [k, "critical" as const])),
    evidenceIds: parseStringMap(v.evidenceIds),
    staleDomains: Array.isArray(v.staleDomains) ? v.staleDomains.filter((k): k is string => typeof k === "string") : [],
    workspaceIssuesAttributable: typeof v.workspaceIssuesAttributable === "boolean" ? v.workspaceIssuesAttributable : null,
    confidenceScore: clampScore(v.confidenceScore),
    confidenceLevel:
      level === "high" || level === "moderate" || level === "low" || level === "insufficient" ? level : "insufficient",
    fundingGap: typeof v.fundingGap === "number" && Number.isFinite(v.fundingGap) ? v.fundingGap : null,
  };
}

function detectChanges(
  input: ResolveOwnerDecisionInput,
  open: Map<string, OwnerDecisionCandidate>,
  staleDomains: string[],
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

  // Stable issue identity (domain + finding code / record id): appeared, escalated, improved, resolved
  // are distinct — an issue that is still open but less severe has improved, it has NOT resolved.
  for (const [key, c] of open) {
    if (c.severity === null) continue;
    const before = prev.issueSeverities[key];
    const where = `"${c.title}" in ${ownerDomainLabel(c.domain)}`;
    if (before === undefined) {
      if (c.severity === "critical") changes.push({ kind: "CRITICAL_ISSUE_APPEARED", message: `New critical issue: ${where}.` });
    } else if (ownerSeverityRank(c.severity) > ownerSeverityRank(before) && (c.severity === "critical" || c.severity === "high")) {
      changes.push({ kind: "SEVERITY_INCREASED", message: `${where} became more serious: ${before} → ${c.severity}.` });
    } else if (ownerSeverityRank(c.severity) < ownerSeverityRank(before) && (before === "critical" || before === "high")) {
      changes.push({ kind: "SEVERITY_DECREASED", message: `${where} improved from ${before} to ${c.severity}; it is still open.` });
    }
  }
  // A previously critical issue that is no longer competing is classified from EVIDENCE, never from
  // its absence alone:
  //   - still open by its own lifecycle (e.g. a risk now being mitigated below critical) → improved,
  //     still open;
  //   - a workspace-level issue that can no longer be attributed to this business → not attributable;
  //   - terminal by its own lifecycle (completed / verified action, closed risk, compliant obligation)
  //     → resolved;
  //   - left the open list on NEW evidence for its domain (a different snapshot) → resolved;
  //   - anything else (same snapshot, unknown evidence identity, a cancelled action) → nothing is
  //     claimed: resolution needs evidence.
  const terminalKeys = new Set(
    input.candidates
      .filter((c) => c.exclusion === "completed" || c.exclusion === "verified_complete" || c.exclusion === "verified_fix_awaiting_new_evidence")
      .map((c) => ownerCandidateIssueKey(c))
  );
  const newEvidence = (key: string): boolean => {
    const domain = key.split(":", 1)[0];
    const before = prev.evidenceIds?.[domain];
    const now = input.evidenceIds?.[domain];
    return before !== undefined && now !== undefined && before !== now;
  };
  let resolvedCount = 0;
  let unattributableCount = 0;
  for (const [k, sev] of Object.entries(prev.issueSeverities)) {
    if (sev !== "critical" || open.has(k)) continue;
    const state = input.issueStates?.[k];
    if (state?.lifecycle === "open") {
      changes.push({ kind: "SEVERITY_DECREASED", message: `"${state.title}" is no longer rated critical; it is still open.` });
    } else if (isWorkspaceLevelIssueKey(k) && input.workspaceIssuesAttributable === false && state?.lifecycle !== "terminal") {
      unattributableCount++;
    } else if (terminalKeys.has(k) || state?.lifecycle === "terminal" || newEvidence(k)) {
      resolvedCount++;
    }
  }
  if (resolvedCount > 0) {
    changes.push({
      kind: "CRITICAL_ISSUE_RESOLVED",
      message: resolvedCount === 1 ? "A critical issue from OpsIQ's previous advice has been closed or cleared by new figures." : `${resolvedCount} critical issues from OpsIQ's previous advice have been closed or cleared by new figures.`,
    });
  }
  if (unattributableCount > 0) {
    changes.push({
      kind: "ISSUE_NOT_ATTRIBUTABLE",
      message: `${unattributableCount === 1 ? "A critical workspace-wide risk or compliance item" : `${unattributableCount} critical workspace-wide risks or compliance items`} can no longer be tied to this business because the workspace now has more than one business. ${unattributableCount === 1 ? "It is" : "They are"} still open — see Risks and Compliance.`,
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

  const prevStale = new Set(prev.staleDomains);
  for (const d of staleDomains) {
    if (!prevStale.has(d)) {
      changes.push({ kind: "EVIDENCE_OUT_OF_DATE", message: `The figures in ${ownerDomainLabel(d)} are now out of date — update them before acting on what they flagged.` });
    }
  }

  // New EVIDENCE (a different snapshot), never a new calculation on the same snapshot. A memory
  // recorded before evidence identity existed cannot prove anything changed, so nothing is claimed.
  if (prev.evidenceIds !== null) {
    for (const [d, id] of Object.entries(input.evidenceIds ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      if (prev.evidenceIds[d] !== id) changes.push({ kind: "EVIDENCE_UPDATED", message: `New data in ${ownerDomainLabel(d)} was analysed since OpsIQ's previous advice.` });
    }
  }

  const gap = input.strategy?.fundingGap ?? null;
  const roundedGap = gap === null ? null : Math.round(gap);
  const roundedPrevGap = prev.fundingGap === null ? null : Math.round(prev.fundingGap);
  const currency = input.strategy?.currency ?? "INR";
  const fmt = (v: number | null) => (v === null ? "unknown" : v <= 0 ? "covered" : formatMoney(v, currency));
  // Compared as the owner reads it: two "covered" gaps (e.g. -100 and -500) are not a change.
  // Only a change between two KNOWN gaps is reported (a plan appearing or leaving is not a "change
  // from unknown"); two "covered" gaps (e.g. -100 and -500) are not a change either.
  if (gap !== null && prev.fundingGap !== null && roundedGap !== roundedPrevGap && fmt(prev.fundingGap) !== fmt(gap)) {
    changes.push({ kind: "FUNDING_GAP_CHANGED", message: `Funding gap changed from ${fmt(prev.fundingGap)} to ${fmt(gap)}.` });
  }

  // Confidence is only comparable for the SAME advice (a new target is reported as a target change).
  if (primary && prev.primaryKey !== null && primaryKey === prev.primaryKey) {
    if (confidenceLevel !== prev.confidenceLevel) {
      const word = (l: OwnerDecisionConfidenceLevel) => (l === "insufficient" ? "very low" : l);
      changes.push({ kind: "CONFIDENCE_CHANGED", message: `OpsIQ's confidence in this advice changed from ${word(prev.confidenceLevel)} to ${word(confidenceLevel)}.` });
    } else if (Math.abs(confidenceScore - prev.confidenceScore) >= 15) {
      changes.push({ kind: "CONFIDENCE_CHANGED", message: `OpsIQ's confidence in this advice moved from ${Math.round(prev.confidenceScore)} to ${Math.round(confidenceScore)} out of 100 (still ${confidenceLevel}).` });
    }
  }
  return changes;
}

/** One explicit refresh-evidence target per domain whose eligible actions rest on stale evidence. */
/** Out-of-date figures never carry more than "low" confidence (below the "moderate" threshold). */
const REFRESH_CONFIDENCE_CAP = 0.4;

function buildRefreshTargets(staleCandidates: OwnerDecisionCandidate[], input: ResolveOwnerDecisionInput): OwnerDecisionCandidate[] {
  const byDomain = new Map<string, OwnerDecisionCandidate[]>();
  for (const c of staleCandidates) byDomain.set(c.domain, [...(byDomain.get(c.domain) ?? []), c]);
  const out: OwnerDecisionCandidate[] = [];
  for (const [domain, group] of byDomain) {
    const ordered = [...group].sort(compareOwnerCandidates);
    const top = ordered[0];
    const label = ownerDomainLabel(domain);
    const more = ordered.length > 1 ? ` and ${ordered.length - 1} other item${ordered.length === 2 ? "" : "s"}` : "";
    const asOf = ordered.reduce<Date | null>((d, c) => (c.evidenceAsOf && (!d || c.evidenceAsOf < d) ? c.evidenceAsOf : d), null);
    out.push({
      candidateId: `evidence_refresh:${domain}`,
      businessId: input.businessId,
      workspaceId: input.workspaceId,
      source: "evidence_refresh",
      domain: top.domain,
      sourceId: domain,
      // Keeps the urgency class of the most serious item it stands in for: an out-of-date survival
      // danger is still urgent to CONFIRM — refreshing it must not fall behind fresh minor work.
      priorityClass: top.priorityClass,
      findingCode: "EVIDENCE_REFRESH",
      findingId: null,
      title: `Update the figures in ${label} before acting on them`,
      explanation: `Your latest ${label} diagnosis is out of date, so OpsIQ will not tell you to act on it yet. It last flagged "${top.title}"${more}. Enter current figures and re-run the ${label} diagnosis to confirm what still needs doing.`,
      // Every ranking attribute comes from the SAME most-serious item (never mixed across items or
      // classes); confidence is also capped at "low" — the figures are out of date.
      severity: top.severity,
      priorityScore: clampScore(top.priorityScore),
      expectedImpactScore: clampScore(top.expectedImpactScore),
      confidence: Math.min(clampConfidence(top.confidence), REFRESH_CONFIDENCE_CAP),
      effortScore: clampScore(top.effortScore),
      status: "proposed",
      ownerActionRequired: true,
      blocking: false,
      evidence: ordered.map((c) => `Out-of-date finding: ${c.title}`),
      missingData: [],
      verificationMetric: null,
      evidenceAsOf: asOf,
      stale: false,
      exclusion: null,
      targetRoute: top.targetRoute,
    });
  }
  return out;
}

/**
 * Resolve the ONE current owner decision. Deterministic for identical input. Exactly one primary
 * target when any eligible candidate exists; otherwise an honest non-target state.
 */
export function resolveOwnerDecision(input: ResolveOwnerDecisionInput): CurrentOwnerDecision {
  const scoped = input.candidates.filter((c) => c.businessId === input.businessId && c.workspaceId === input.workspaceId);
  // A stale diagnosis is never an authoritative "do this now": its otherwise-eligible actions leave the
  // election and are replaced, per domain, by an explicit "refresh this evidence" target that carries
  // what they flagged (nothing is silently dropped). Recorded control facts are never stale.
  // Survival issues on stale evidence are replaced the same way: a last-known danger becomes an explicit
  // "confirm it" target, never silently dropped and never presented as current.
  const processed = scoped.map((c) =>
    c.exclusion === null && c.stale && (c.source === "domain_action" || c.source === "survival_reading") ? { ...c, exclusion: "stale_evidence" as const } : c
  );
  const refreshTargets = buildRefreshTargets(processed.filter((c) => c.exclusion === "stale_evidence"), input);
  const ranked = rankOwnerCandidates([...processed, ...refreshTargets]);
  const excluded = processed
    .filter((c) => c.exclusion !== null)
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
  for (const d of input.staleDomains) pushMissing(`Current figures for ${ownerDomainLabel(d)} — the latest ones are out of date, so what they showed cannot be relied on yet.`);

  // Confidence: the primary's own evidence confidence, capped by business-wide data sufficiency.
  const reasons: string[] = [];
  let score = primary ? Math.round(clampConfidence(primary.confidence) * 100) : 0;
  let capped = false;
  const primaryIsRefresh = primary?.source === "evidence_refresh";
  const primaryIsDataRequest = primary?.priorityClass === "MISSING_CRITICAL_EVIDENCE" || primaryIsRefresh;
  // Recorded control facts (a compliance breach, an owner-recorded risk) do not depend on domain
  // data completeness, so business-wide data sufficiency never caps them.
  const primaryIsRecordedFact = primary !== null && (primary.source === "compliance_item" || primary.source === "business_risk");
  if (primary && !primaryIsDataRequest && !primaryIsRecordedFact) {
    // The reason is stated whenever data is short — also when the score was already at or below the cap.
    if (input.dataSufficiency.status === "insufficient") {
      if (score > 40) { score = 40; capped = true; }
      reasons.push("Important business data is missing, so this advice is provisional.");
    } else if (input.dataSufficiency.status === "caution") {
      if (score > 70) { score = 70; capped = true; }
      reasons.push("Some data is incomplete, so treat this advice with some caution.");
    }
  }
  if (primaryIsRefresh) reasons.push("These figures are out of date, so what they showed is not proven now; confirm them before acting on it.");
  else if (primaryIsDataRequest) reasons.push("This is a request for missing information; advice on everything else waits for it.");
  const level: OwnerDecisionConfidenceLevel = primary ? confidenceLevelFor(score) : "insufficient";
  if (!primary && !hasEvidence) reasons.push("There is no business data yet.");

  // Why this wins: explicit arbitration against the strongest competitor, and against the strongest
  // competitor from a DIFFERENT domain (so a Finance-vs-Strategy conflict is always named).
  const whyThisWins: string[] = [];
  if (primary) {
    whyThisWins.push(
      primaryIsRefresh
        // Never claims the old problem is current — only that it was last flagged and needs confirming.
        ? `Your ${ownerDomainLabel(primary.domain)} figures are out of date, and they last showed ${OWNER_PRIORITY_CLASS_LABEL[primary.priorityClass]}${primary.severity ? ` (${primary.severity})` : ""}; confirming them comes before acting on anything they showed.`
        : `This is ${OWNER_PRIORITY_CLASS_LABEL[primary.priorityClass]}${primary.severity ? ` (${primary.severity})` : ""}, ${
            primary.source === "domain_action"
              ? `from your ${ownerDomainLabel(primary.domain)} diagnosis`
              : primary.source === "survival_reading"
                ? `still shown by your current ${ownerDomainLabel(primary.domain)} figures, and no open action addresses it`
                : `from what is recorded in ${ownerDomainLabel(primary.domain)}`
          }.`
    );
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
  // Supporting steps: ONLY the same-domain items that come immediately after the primary in the
  // canonical order (a same-domain item may never jump ahead of a more urgent item from another
  // domain). Everything after that stays in canonical order as "next, in order".
  const rest = ranked.slice(1);
  const supporting: OwnerDecisionCandidate[] = [];
  if (primary) {
    for (const c of rest) {
      if (c.domain !== primary.domain || supporting.length >= MAX_SUPPORTING) break;
      supporting.push(c);
    }
  }
  const supportingIds = new Set(supporting.map((c) => c.candidateId));
  const canWait = rest.filter((c) => !supportingIds.has(c.candidateId)).slice(0, MAX_CAN_WAIT);

  // What NOT to do: never start lower-class work ahead of the primary; honour Strategy's live decision.
  // Every prohibition passes through the shared reconciler, so it can never veto the main target or a
  // supporting step (same intent or same business lever ⇒ a condition on executing it instead).
  const whatNotToDo: string[] = [];
  const imperativeCtx = ownerImperativeContext(primary ? { primaryTarget: primary, supportingSteps: supporting } : null);
  if (primary) {
    const primaryRank = ownerPriorityClassRank(primary.priorityClass);
    // Never name a step the owner is being told to do next (supporting) as something not to do.
    const growth = rest.find((c) => c.priorityClass === "GROWTH_OPPORTUNITY" && c.source !== "evidence_refresh" && !supportingIds.has(c.candidateId));
    if (growth && primaryRank < ownerPriorityClassRank("GROWTH_OPPORTUNITY")) {
      const lever = ownerLeverKey(growth.findingCode);
      whatNotToDo.push(
        reconcileOwnerProhibition(
          {
            text: `Don't start growth or investment work such as "${growth.title}" until "${primary.title}" is handled.`,
            vetoes: "NONE",
            levers: lever ? [lever] : [],
            // Same business lever as the target: it is part of that work, done in a controlled way.
            asCondition: (t) => `"${growth.title}" moves the same lever as "${t}": do it as part of that work, and keep the first rollout controlled until "${primary.title}" is verified.`,
          },
          imperativeCtx
        ).text
      );
    }
  }
  const s = input.strategy;
  if (s && (s.code === "NOT_YET" || s.code === "DONT_AS_PLANNED" || s.code === "NEED_INFO")) {
    const option = s.optionName ? `"${s.optionName}"` : "the plan you are evaluating";
    const says = `Strategy says "${s.headline}"${s.headlineDetail ? `: ${s.headlineDetail}` : "."}`;
    // When the main target IS a Strategy step, the gate is its precondition, not a contradiction.
    whatNotToDo.push(
      primary && primary.domain === "strategy"
        ? `Don't commit to ${option} until "${primary.title}" is done — ${says}`
        : `Don't commit to ${option} yet — ${says}`
    );
  }
  if (input.dataSufficiency.status === "insufficient" && input.dataSufficiency.lowConfidenceDomains.length > 0) {
    // The main target's own domain is never vetoed: its issue is real enough to address, only its
    // numerical score is provisional. Other low-confidence domains keep the plain caution.
    const primaryDomain = primary && primary.source !== "evidence_refresh" ? primary.domain : null;
    const others = input.dataSufficiency.lowConfidenceDomains.filter((d) => d !== primaryDomain);
    if (primaryDomain && input.dataSufficiency.lowConfidenceDomains.includes(primaryDomain)) {
      const label = ownerDomainLabel(primaryDomain);
      const missing = input.dataSufficiency.missingCriticalData.length > 0 && primaryDomain === "finance"
        ? ` (${input.dataSufficiency.missingCriticalData.slice(0, 3).map(humanizeMetricKey).join(", ")} missing)`
        : "";
      whatNotToDo.push(
        `The ${label} issue in "${primary!.title}" is real enough to address, but its ${label} score is provisional because some ${label} data is incomplete${missing}; don't base other decisions on the ${label} scores yet.`
      );
    }
    if (others.length > 0) {
      whatNotToDo.push(`Don't rely on the ${others.map(ownerDomainLabel).join(", ")} scores yet — they are based on incomplete data.`);
    }
  }

  const evidence = primary ? [...primary.evidence] : [];

  const whatToDoFirst = primary ? primary.title : !hasEvidence ? missingInformation[0] ?? null : null;

  const reassessmentTrigger = primary
    ? `Check again when "${primary.title}" is done${primary.verificationMetric ? ` or your ${humanizeMetricKey(primary.verificationMetric)} changes` : ""}, when new ${ownerDomainLabel(primary.domain)} data is added, or within ${input.reassessment.days} days (${input.reassessment.reason}).`
    : hasEvidence
      ? `Check again when new data is added, or within ${input.reassessment.days} days (${input.reassessment.reason}).`
      : "Check again as soon as you add your business numbers.";

  const staleExcluded = processed.filter((c) => c.exclusion === "stale_evidence");
  const open = openIssues(ranked, staleExcluded);
  const staleDomainsNow = [...new Set(refreshTargets.map((t) => t.domain))];
  const generatedAt = input.now.toISOString();
  const primaryTarget = primary ? toTarget(primary) : null;
  const attention = ranked.map(toTarget);
  return {
    contractVersion: OWNER_DECISION_CONTRACT_VERSION,
    primaryConcernClass: primary ? (primary.source === "evidence_refresh" ? "MISSING_CRITICAL_EVIDENCE" : primary.priorityClass) : null,
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
    whatChanged: detectChanges(input, open, staleDomainsNow, primary, score, level),
    reassessmentTrigger,
    attention,
    excluded,
    memory: buildMemory(generatedAt, primaryTarget, open, staleDomainsNow, score, level, input.strategy?.fundingGap ?? null, input.evidenceIds ?? {}, input.workspaceIssuesAttributable ?? null),
  };
}
