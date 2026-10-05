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
 * SCORE COMPARABILITY (owner-spine/score-semantics.ts): the raw `priorityScore` of different domains is NOT a
 * universal ranking and is NOT sufficient to elect the owner-wide #1 action. Heterogeneous domain scores are
 * reconciled by semantic class and severity first; priority, impact, confidence and effort are only the
 * SUBORDINATE tie-breaks (stages 3–4 above, canonical-tie-break-only). Cross-domain election belongs solely to
 * `resolveOwnerDecision`; `rankOwnerActions` is domain-local.
 *
 * Pure: no DB, no I/O, no clock reads (the caller supplies `now`). Nothing is invented: missing data
 * is reported as missing, confidence is capped when evidence is insufficient, and an owner with no
 * diagnosed domain gets honest "add data" guidance instead of a fabricated target.
 */
import { humanizeMetricKey } from "@/lib/metric-label";
import { describeVerifiedActionLine } from "./owner-outcome-policy";
import {
  ownerImperativeContext,
  ownerLeverKey,
  ownerTargetIntent,
  partitionReconciled,
  quoteTitles,
  reconcileOwnerProhibition,
  type ReconciledProhibition,
} from "./owner-imperatives";
import {
  clampConfidence,
  clampScore,
  ownerSeverityRank,
  type OwnerDomain,
  type OwnerSeverity,
} from "./contracts";
import {
  isEvidenceRequestTarget,
  isRecordedFactTarget,
  resolveOwnerAdvicePolicy,
  type OwnerAdvicePolicy,
} from "./owner-advice-policy";
import { evaluateOwnerActionGate, NO_OWNER_GATE_CONSTRAINTS, type OwnerGateBlock, type OwnerGateBlockCode, type OwnerGateConstraints } from "@/domain/owner-mode/owner-action-gate-policy";

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
  SAFETY_COMPLIANCE: ["COMPLIANCE_BREACH", "COMPLIANCE_UNATTRIBUTED", "GATE_COMPLIANCE_EXPIRED"],
  SURVIVAL_CASH: [
    "FIN_INSOLVENT_RUNWAY", "FIN_LOW_RUNWAY", "FIN_LOW_ABSOLUTE_CASH", "FIN_HIGH_DEBT_PRESSURE",
    // Its own rule text: "vendor-cutoff and liquidity risk are elevated" — the same danger as CF_VENDOR_CUTOFF_RISK.
    "FIN_HIGH_PAYABLES",
    "CF_INSOLVENT_RUNWAY", "CF_LOW_RUNWAY", "CF_URGENT_PAYMENT_RISK", "CF_VENDOR_CUTOFF_RISK", "CF_DEBT_DEFAULT_RISK",
    // The action gate holds growth work while cash is unsafe (canonicalEligibility's blocker target).
    "GATE_CASH_UNSAFE",
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
  OVERLOAD_BLOCKING: ["OPS_CAPACITY_BOTTLENECK", "GATE_CAPACITY_UNSAFE"],
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
    // A known gross margin below the floor holds pricing/growth work (canonicalEligibility's blocker target).
    "GATE_MARGIN_BELOW_FLOOR",
    // A Finance survival state driven by profit and margin holds work (a cash-safety block named by its cause).
    "GATE_PROFIT_UNSAFE",
  ],
  BLOCKED_EXECUTION: [
    "OPS_SOP_NONCOMPLIANCE",
    "SOP_HIGH_OVERDUE", "SOP_LOW_COMPLETION", "SOP_HIGH_DISPUTE", "SOP_LOW_PROOF_COMPLIANCE", "SOP_LOW_VERIFICATION",
    "SOP_HIGH_REASSIGNMENT", "SOP_LOW_COVERAGE",
    // Internal actions failing repeatedly ("needs an SOP, not another reminder") — execution, not customers.
    "SOP_REPEATED_FAILURES",
    // A do-not-repeat memory holds a growth step until the memory records what has changed.
    "GATE_DO_NOT_REPEAT_REVIEW",
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
    // Cash/Finance figures that are not current hold work until current figures are diagnosed.
    "GATE_CASH_UNVERIFIED",
    // Total cash is not established (a Cash flow position missing a component, or Finance liquidity unconfirmed): the gate
    // holds discretionary growth until it is confirmed. A data request — never a survival verdict.
    "GATE_CASH_UNCONFIRMED",
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
    // A medium-severity "add the bank balance to confirm total cash" data request (opportunity-rules.ts).
    "FIN_LIQUIDITY_UNCONFIRMED",
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

/**
 * What drives a Finance survival reading, from the diagnosis's OWN findings that are responsible for it:
 * the MOST SEVERE cash-survival (runway, cash, debt or payables pressure) and profit/margin findings. The
 * driver is "cash" when a cash-survival finding is among those most severe findings, and "profit" when
 * they are only profit/margin losses. It is null when the findings don't say (none were loaded, or none is
 * of either kind). A medium payables finding next to a high negative-margin finding does not make a
 * margin-driven state a cash danger. A Finance survival state driven by profit is never described as a
 * cash danger.
 */
const FINDING_SEVERITY_RANK: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
export function financeSurvivalDriver(
  findings: ReadonlyArray<{ code?: unknown; severity?: unknown }> | null | undefined
): "cash" | "profit" | null {
  if (!findings) return null;
  const relevant = findings
    .map((f) => {
      const cls = typeof f?.code === "string" ? classifyOwnerFindingCode(f.code) : null;
      const rank = typeof f?.severity === "string" ? FINDING_SEVERITY_RANK[f.severity.toLowerCase()] ?? 0 : 0;
      return cls === "SURVIVAL_CASH" || cls === "PROFIT_LOSS" ? { cls, rank } : null;
    })
    .filter((f): f is { cls: "SURVIVAL_CASH" | "PROFIT_LOSS"; rank: number } => f !== null);
  if (relevant.length === 0) return null;
  const top = Math.max(...relevant.map((f) => f.rank));
  return relevant.some((f) => f.rank === top && f.cls === "SURVIVAL_CASH") ? "cash" : "profit";
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
   * The safety state that holds an otherwise-eligible step at the owner action gate (capacity, cash,
   * margin, compliance, do-not-repeat), elected as work in its own right: clear the blocker first.
   * Synthesized by canonicalEligibility from the gate's own constraints — never an action row.
   */
  | "safety_gate"
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
  | "stale_evidence"
  /**
   * The owner action gate would refuse it at the current safety state (owner-action-gate-policy.ts):
   * never elected or listed as a step; the blocker is elected instead (a "safety_gate" target).
   */
  | "held_by_safety_gate";

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
  /** True when the evidence cannot be shown to be current (older than the freshness window, or amended). */
  stale: boolean;
  /** Lifecycle exclusion computed by the normalizer; null ⇒ eligible. */
  exclusion: OwnerCandidateExclusion | null;
  /** Owner page where this is worked. */
  targetRoute: string;
  /**
   * The do-not-repeat rule this candidate is about: the rule a `GATE_DO_NOT_REPEAT_REVIEW` target reviews,
   * or the exact rule that forbids repeating the earlier step of a survival issue. Absent otherwise.
   */
  ruleId?: string | null;
  /** The ISSUE's own wording (a survival reading's finding title), independent of any action's title. */
  issueTitle?: string | null;
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
  /** The finding the target's work responds to (matches an exact do-not-repeat rule); null when none. */
  findingId: string | null;
  title: string;
  explanation: string;
  severity: OwnerSeverity | null;
  status: string;
  targetRoute: string;
  /** The do-not-repeat rule the target is about (the gate's exact blocking rule); null when none. */
  ruleId?: string | null;
}

export type OwnerDecisionChangeKind =
  | "CRITICAL_ISSUE_APPEARED"
  | "CRITICAL_ISSUE_RESOLVED"
  /** Workspace-level issues (risks / business-less compliance items) stopped — or started again — being attributable to this business. */
  | "ATTRIBUTION_CHANGED"
  | "ACTION_COMPLETED"
  | "ACTION_VERIFIED"
  | "EVIDENCE_UPDATED"
  | "EVIDENCE_OUT_OF_DATE"
  | "SEVERITY_INCREASED"
  | "SEVERITY_DECREASED"
  /** A critical recorded risk was accepted in its record (a deliberate decision, not a resolution). */
  | "RISK_ACCEPTED";

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
  /** Prohibitions that still stand (never on the main target or a supporting step). */
  whatNotToDo: string[];
  /**
   * Positive guidance on HOW to carry out the main target / supporting steps — prohibitions reconciled
   * into conditions (same lever, or a guardrail that would otherwise forbid a canonical step) and scope
   * notes (e.g. a provisional score). Never shown under a "don't" heading.
   */
  conditions: string[];
  missingInformation: string[];
  /**
   * What OpsIQ may CLAIM or RECOMMEND from the elected target, given its evidence (owner-advice-policy.ts). The
   * ONE advice policy: owner surfaces read it and never invent their own act / do-not-act / abstain semantics. It
   * composes the facts above (confidence, missingInformation, reassessmentTrigger) and never changes who wins.
   */
  advicePolicy: OwnerAdvicePolicy;
  /**
   * What changed, derived ONLY from persisted mutation facts inside the recent window (new diagnoses,
   * action completions/verifications, risk/compliance transitions, attribution changes). Reading the
   * decision never writes anything; transitions that cannot be proven from those facts are omitted.
   */
  whatChanged: OwnerDecisionChange[];
  whatChangedWindowDays: number;
  reassessmentTrigger: string;
  /** Full canonical order of eligible candidates (primary first) — the ONLY ranked owner-attention list. */
  attention: OwnerDecisionTarget[];
  /** Candidates removed from the election and why (for audit/transparency). */
  excluded: Array<{ candidateId: string; title: string; reason: OwnerCandidateExclusion }>;
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
  /** Domains whose latest evidence cannot be shown to be current (out of date or amended). */
  staleDomains: readonly string[];
  /**
   * Domains holding figures for a period that has not STARTED yet (genuinely future): excluded entirely
   * (current-diagnosis-cycle.ts); the owner is told they are not used.
   */
  futureDomains?: readonly string[];
  /**
   * Domains holding figures for the in-progress current period: provisional (never the current cycle; they
   * may only tighten the cash/finance safety state), stated so the owner knows they are not yet used as a
   * completed reading.
   */
  provisionalDomains?: readonly string[];
  strategy: OwnerDecisionStrategyContext | null;
  reassessment: { days: number; reason: string };
  /** Persisted mutation facts for "what changed" (gathered read-only by the caller). */
  changeFacts: OwnerChangeFacts;
  /**
   * The business's owner action-gate constraints (loadOwnerGateConstraints). Production callers always
   * pass them (src/__tests__/governance/owner-decision-gate-constraints.test.ts); pure tests may omit them.
   */
  gate?: OwnerGateConstraints | null;
  now: Date;
}

/** Recent-change window for "what changed" (days). */
export const OWNER_WHAT_CHANGED_WINDOW_DAYS = 14;

/**
 * One domain's evidence transition: its CURRENT diagnosis against the PREVIOUS one (both persisted).
 * Issue keys use ownerCandidateIssueKey (domain + finding code); severities are the findings' own.
 */
export interface OwnerEvidenceTransition {
  domain: string;
  /** The snapshot the previous diagnosis ran on (null ⇒ first diagnosis). */
  previousEvidenceId: string | null;
  currentEvidenceId: string;
  /** True only when the current evidence is causally newer (a different, later snapshot) — a re-diagnosis of the same figures is not. */
  newerEvidence: boolean;
  /** When the current evidence was FIRST diagnosed (the window test; a re-diagnosis never re-dates it). */
  at: Date;
  previousIssues: Readonly<Record<string, { severity: OwnerSeverity | null; title: string }>>;
  currentIssues: Readonly<Record<string, { severity: OwnerSeverity | null; title: string }>>;
  /** The current diagnosis could not measure (missing critical data): an absent issue is not proven resolved. */
  resolutionUnproven?: boolean;
}

/** A workspace-level record's lifecycle transition proven by its own record/audit trail. */
export interface OwnerRecordIssueFact {
  key: string;
  title: string;
  change: "appeared" | "closed" | "no_longer_critical" | "accepted";
  at: Date;
}

export interface OwnerChangeFacts {
  /** Start of the recent-change window. */
  since: Date;
  transitions: readonly OwnerEvidenceTransition[];
  events: readonly OwnerDecisionEvent[];
  recordIssues: readonly OwnerRecordIssueFact[];
  /** Attribution of workspace-level issues changed inside the window (a business added or archived). */
  attribution: { change: "lost" | "regained"; at: Date; openCriticalCount: number } | null;
  /** Domains whose evidence went out of date inside the window. */
  newlyStaleDomains: readonly string[];
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
    findingId: c.findingId,
    title: c.title,
    explanation: c.explanation,
    severity: c.severity,
    status: c.status,
    targetRoute: c.targetRoute,
    ruleId: c.ruleId ?? null,
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

/**
 * "What changed", from persisted mutation facts only. Resolution needs evidence: an issue raised by the
 * previous diagnosis and absent from a causally NEWER one is resolved; present in both is still open
 * (its severity may change); a re-diagnosis of the same figures claims nothing. Records (risks,
 * compliance) resolve only through their own lifecycle. Loss or return of attribution is reported as
 * such, never as "resolved" or "new".
 */
export function describeOwnerChanges(facts: OwnerChangeFacts): OwnerDecisionChange[] {
  const since = facts.since.getTime();
  // Most important first — so a short list never hides a record lifecycle or attribution change behind
  // generic "new figures" lines: record facts, attribution, issue changes in new evidence, completions and
  // verifications, out-of-date evidence, then which domains got new figures. Identical lines appear once.
  const records: OwnerDecisionChange[] = [];
  const attribution: OwnerDecisionChange[] = [];
  const issues: OwnerDecisionChange[] = [];
  const work: OwnerDecisionChange[] = [];
  const stale: OwnerDecisionChange[] = [];
  const evidence: OwnerDecisionChange[] = [];
  for (const t of [...facts.transitions].sort((a, b) => (a.domain < b.domain ? -1 : a.domain > b.domain ? 1 : 0))) {
    if (t.at.getTime() < since || !t.newerEvidence) continue;
    const label = ownerDomainLabel(t.domain);
    evidence.push({ kind: "EVIDENCE_UPDATED", message: `New ${label} figures were analysed.` });
    if (t.previousEvidenceId === null) continue;
    for (const [key, cur] of Object.entries(t.currentIssues)) {
      const before = t.previousIssues[key];
      const where = `"${cur.title}" in ${label}`;
      if (!before) {
        if (cur.severity === "critical") issues.push({ kind: "CRITICAL_ISSUE_APPEARED", message: `New critical issue in the new ${label} figures: ${where}.` });
      } else if (cur.severity && before.severity) {
        if (ownerSeverityRank(cur.severity) > ownerSeverityRank(before.severity) && (cur.severity === "critical" || cur.severity === "high")) {
          issues.push({ kind: "SEVERITY_INCREASED", message: `${where} became more serious in the new figures: ${before.severity} → ${cur.severity}.` });
        } else if (ownerSeverityRank(cur.severity) < ownerSeverityRank(before.severity) && (before.severity === "critical" || before.severity === "high")) {
          issues.push({ kind: "SEVERITY_DECREASED", message: `${where} improved in the new figures from ${before.severity} to ${cur.severity}; it is still open.` });
        }
      }
    }
    for (const [key, before] of Object.entries(t.previousIssues)) {
      if (t.resolutionUnproven) break;
      if (before.severity === "critical" && !(key in t.currentIssues)) {
        issues.push({ kind: "CRITICAL_ISSUE_RESOLVED", message: `"${before.title}" in ${label} is no longer shown by the new figures.` });
      }
    }
  }
  for (const r of facts.recordIssues) {
    if (r.at.getTime() < since) continue;
    if (r.change === "appeared") records.push({ kind: "CRITICAL_ISSUE_APPEARED", message: `New critical issue recorded: "${r.title}".` });
    else if (r.change === "closed") records.push({ kind: "CRITICAL_ISSUE_RESOLVED", message: `"${r.title}" was closed in its record.` });
    else if (r.change === "accepted") records.push({ kind: "RISK_ACCEPTED", message: `"${r.title}" was accepted as a known risk in its record; it is not resolved.` });
    else records.push({ kind: "SEVERITY_DECREASED", message: `"${r.title}" is no longer rated critical; its record is still open.` });
  }
  if (facts.attribution && facts.attribution.at.getTime() >= since && facts.attribution.openCriticalCount > 0) {
    attribution.push(
      facts.attribution.change === "lost"
        ? { kind: "ATTRIBUTION_CHANGED", message: "A business was added to this workspace, so OpsIQ can no longer attribute workspace-wide risks and compliance items specifically to this business." }
        : { kind: "ATTRIBUTION_CHANGED", message: "This is again the workspace's only business, so OpsIQ attributes workspace-wide risks and compliance items to it again." }
    );
  }
  for (const e of [...facts.events].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    if (e.at.getTime() < since) continue;
    work.push(
      e.kind === "ACTION_COMPLETED"
        ? { kind: "ACTION_COMPLETED", message: `Completed: "${e.title}".` }
        : { kind: "ACTION_VERIFIED", message: describeVerifiedActionLine(e.title) }
    );
  }
  for (const d of [...facts.newlyStaleDomains].sort()) {
    stale.push({ kind: "EVIDENCE_OUT_OF_DATE", message: `The figures in ${ownerDomainLabel(d)} are now out of date — update them before acting on what they flagged.` });
  }
  const seen = new Set<string>();
  return [...records, ...attribution, ...issues, ...work, ...stale, ...evidence].filter((c) => (seen.has(c.message) ? false : (seen.add(c.message), true)));
}

/** One explicit refresh-evidence target per domain whose eligible actions rest on stale evidence. */
/** Out-of-date figures never carry more than "low" confidence (below the "moderate" threshold). */
const REFRESH_CONFIDENCE_CAP = 0.4;

function buildRefreshTargets(staleCandidates: OwnerDecisionCandidate[], input: { businessId: string; workspaceId: string }): OwnerDecisionCandidate[] {
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

/** A step the owner action gate would refuse at the current safety state (canonicalEligibility). */
export interface OwnerGateHold {
  candidateId: string;
  /** The held action row's id (the candidate's sourceId). */
  sourceId: string;
  /** The finding the held work responds to (null when none). */
  findingId: string | null;
  title: string;
  domain: OwnerDecisionCandidate["domain"];
  code: OwnerGateBlockCode;
  reason: string;
  /** The do-not-repeat rule holding it (DO_NOT_REPEAT_BLOCKED only). */
  ruleId?: string;
  /** Every check that holds it (the first is `code`): clearing one never reveals a hidden second one. */
  blocks: readonly OwnerGateBlock[];
  /** The held work's own class, severity, score and confidence (the issue it responds to stays visible). */
  priorityClass: OwnerPriorityClass;
  severity: OwnerSeverity | null;
  priorityScore: number;
  confidence: number;
}

const MARGIN_REPAIR_CODES = new Set(["FIN_NEGATIVE_GROSS_MARGIN", "FIN_NEGATIVE_NET_MARGIN", "FIN_OPP_MARGIN_IMPROVEMENT", "HIGH_COST_RATIO"]);

/**
 * What a cash-safety block is really about (the shared reading's gateDriver): cash itself, a Finance
 * survival state driven by profit and margin, or figures that are not current. The blocker target is named
 * and routed by it — a margin problem is never called "Stabilise cash".
 */
type CashBlockKind = "cash" | "profit" | "unverified" | "evidence";
function cashBlockKind(gate: OwnerGateConstraints): CashBlockKind {
  // A block caused ONLY by incomplete material cash evidence (the state itself — SAFE/WATCH — would not hold growth): named
  // as the data request it is, never as a cash danger ("Stabilise cash").
  const safeState = gate.cash.gateState === "SAFE" || gate.cash.gateState === "WATCH";
  if (gate.cash.evidenceSufficient === false && safeState && gate.cash.driver !== "unverified") return "evidence";
  return gate.cash.driver === "finance_profit" ? "profit" : gate.cash.driver === "unverified" ? "unverified" : "cash";
}

/** The domain a cash-evidence gap points the owner to (the source that holds the gap; Cash flow first). */
function cashEvidenceDomain(gate: OwnerGateConstraints): "cashflow" | "finance" {
  const first = gate.cash.evidenceGaps?.find((g) => g.source === "cashflow") ?? gate.cash.evidenceGaps?.[0];
  return first?.source === "finance" ? "finance" : "cashflow";
}

/** Whether an eligible candidate already IS the work that clears a gate blocker (so none is synthesized). */
function addressesBlocker(c: OwnerDecisionCandidate, code: OwnerGateBlockCode, gate: OwnerGateConstraints): boolean {
  switch (code) {
    case "COMPLIANCE_BLOCKED":
      return c.source === "compliance_item" && c.blocking;
    case "CASH_SAFETY_BLOCKED": {
      const kind = cashBlockKind(gate);
      if (kind === "profit") return c.domain === "finance" && c.priorityClass === "PROFIT_LOSS";
      if (kind === "evidence") {
        // The request for the missing cash figure (or a refresh of it), in the source that holds the gap.
        return (c.domain === "cashflow" || c.domain === "finance") && (c.source === "evidence_refresh" || c.priorityClass === "MISSING_CRITICAL_EVIDENCE");
      }
      if (kind === "unverified") {
        // The refresh of the source whose figures decide it (an amended Finance snapshot → Finance).
        const src = gate.cash.source === "finance" ? "finance" : gate.cash.source === "cashflow" ? "cashflow" : null;
        return (src ? c.domain === src : c.domain === "cashflow" || c.domain === "finance") &&
          (c.source === "evidence_refresh" || c.priorityClass === "MISSING_CRITICAL_EVIDENCE");
      }
      return c.priorityClass === "SURVIVAL_CASH";
    }
    case "MARGIN_SAFETY_BLOCKED":
      return MARGIN_REPAIR_CODES.has(c.findingCode);
    case "CAPACITY_BLOCKED":
    case "DO_NOT_REPEAT_BLOCKED":
      return false;
  }
}

interface GateTarget { findingCode: string; priorityClass: OwnerPriorityClass; domain: OwnerDecisionCandidate["domain"]; route: string }

/** The do-not-repeat rules are recorded and overridden on the Cockpit (OwnerDoNotRepeatPanel). */
export const OWNER_DNR_RULES_ROUTE = "/owner/cockpit#do-not-repeat-rules";
/** The Cockpit panel's anchor for ONE rule (the panel lists and focuses it: OwnerDoNotRepeatPanel). */
export function ownerDnrRuleRoute(ruleId: string): string {
  return `/owner/cockpit#dnr-rule-${ruleId}`;
}

function gateTarget(code: OwnerGateBlockCode, gate: OwnerGateConstraints, heldDomain: OwnerDecisionCandidate["domain"], ruleId: string | null = null): GateTarget {
  switch (code) {
    case "COMPLIANCE_BLOCKED":
      return { findingCode: "GATE_COMPLIANCE_EXPIRED", priorityClass: "SAFETY_COMPLIANCE", domain: "compliance", route: "/owner/compliance" };
    case "CASH_SAFETY_BLOCKED": {
      const kind = cashBlockKind(gate);
      if (kind === "profit") return { findingCode: "GATE_PROFIT_UNSAFE", priorityClass: "PROFIT_LOSS", domain: "finance", route: "/owner/finance" };
      if (kind === "evidence") {
        const d = cashEvidenceDomain(gate);
        return { findingCode: "GATE_CASH_UNCONFIRMED", priorityClass: "MISSING_CRITICAL_EVIDENCE", domain: d, route: `/owner/${d}` };
      }
      if (kind === "unverified") {
        // Routed to the source whose figures need confirming (an amended Finance snapshot → Finance).
        return gate.cash.source === "finance"
          ? { findingCode: "GATE_CASH_UNVERIFIED", priorityClass: "MISSING_CRITICAL_EVIDENCE", domain: "finance", route: "/owner/finance" }
          : { findingCode: "GATE_CASH_UNVERIFIED", priorityClass: "MISSING_CRITICAL_EVIDENCE", domain: "cashflow", route: "/owner/cashflow" };
      }
      return { findingCode: "GATE_CASH_UNSAFE", priorityClass: "SURVIVAL_CASH", domain: "cashflow", route: "/owner/cashflow" };
    }
    case "MARGIN_SAFETY_BLOCKED":
      return { findingCode: "GATE_MARGIN_BELOW_FLOOR", priorityClass: "PROFIT_LOSS", domain: "finance", route: "/owner/finance" };
    case "CAPACITY_BLOCKED":
      return { findingCode: "GATE_CAPACITY_UNSAFE", priorityClass: "OVERLOAD_BLOCKING", domain: "operations", route: "/owner/operations" };
    case "DO_NOT_REPEAT_BLOCKED":
      return { findingCode: "GATE_DO_NOT_REPEAT_REVIEW", priorityClass: "BLOCKED_EXECUTION", domain: heldDomain, route: ruleId ? ownerDnrRuleRoute(ruleId) : OWNER_DNR_RULES_ROUTE };
  }
}

/**
 * What holds a step back, in owner words: "This step is currently held by <constraint>. <Clear/verify the
 * condition> before proceeding." Named by the blocker's real cause (cashBlockKind) — the same constraint
 * the gate enforces.
 */
export function ownerGateHoldText(code: OwnerGateBlockCode, gate: OwnerGateConstraints): string {
  const [constraint, condition] = ((): [string, string] => {
    switch (code) {
      case "COMPLIANCE_BLOCKED": {
        const name = gate.expiredCompliance?.name ?? "an obligation";
        return [`the expired compliance obligation "${name}"`, `Renew "${name}" (or get professional review)`];
      }
      case "CASH_SAFETY_BLOCKED": {
        const kind = cashBlockKind(gate);
        if (kind === "profit") return ["the profitability safety limit", "Restore profitability"];
        if (kind === "evidence") return ["total cash not being confirmed yet", "Enter the missing cash in hand / bank balance figure"];
        if (kind === "unverified") return ["cash and Finance figures that are not current", "Confirm current cash and Finance figures"];
        return ["the cash safety limit", "Stabilise cash"];
      }
      case "MARGIN_SAFETY_BLOCKED":
        return gate.grossMarginOutOfDate
          ? ["the gross-margin safety floor (the last recorded margin is from out-of-date figures)", "Confirm your current gross margin and keep it above the floor"]
          : ["the gross-margin safety floor", "Restore gross margin above the floor"];
      case "CAPACITY_BLOCKED":
        return ["the capacity limit", "Clear the capacity bottleneck"];
      case "DO_NOT_REPEAT_BLOCKED":
        return ["a do-not-repeat rule", "Record what has changed on that rule (Cockpit → Do-not-repeat rules)"];
    }
  })();
  return `This step is currently held by ${constraint}. ${condition} before proceeding.`;
}

/**
 * Every check that holds a step, in owner words: the first one's full text, then each other one named — so
 * clearing one never reveals a hidden second (planning sees them all; mutation enforcement still reports its
 * deterministic first).
 */
export function ownerGateHoldsText(blocks: readonly Pick<OwnerGateBlock, "code">[], gate: OwnerGateConstraints): string {
  const codes = [...new Set(blocks.map((b) => b.code))];
  if (codes.length === 0) return "";
  const first = ownerGateHoldText(codes[0], gate);
  if (codes.length === 1) return first;
  const others = codes.slice(1).map((c) => {
    const m = /held by (.*?)\. /.exec(ownerGateHoldText(c, gate));
    return m ? m[1] : c;
  });
  return `${first} It is also held by ${others.length === 1 ? others[0] : `${others.slice(0, -1).join(", ")} and ${others[others.length - 1]}`}: each must be cleared.`;
}

function gateBlockerTitle(code: OwnerGateBlockCode, gate: OwnerGateConstraints, domainLabel: string, dnrMatch: "broad" | "exact" | null): string {
  switch (code) {
    case "COMPLIANCE_BLOCKED":
      return `Renew "${gate.expiredCompliance?.name ?? "the expired obligation"}" (or get professional review) — work is on hold until then`;
    case "CASH_SAFETY_BLOCKED": {
      const kind = cashBlockKind(gate);
      if (kind === "profit") return "Restore profitability before advancing the work it holds back";
      if (kind === "evidence") return "Confirm your total cash (enter the missing cash in hand / bank balance) before advancing the growth work it holds back";
      if (kind === "unverified") return "Confirm current cash and Finance figures before advancing the work they hold back";
      return "Stabilise cash before advancing the work it holds back";
    }
    case "MARGIN_SAFETY_BLOCKED":
      return gate.grossMarginOutOfDate
        ? "Confirm your current gross margin (the last figures are out of date) before scaling sales or marketing"
        : "Restore gross margin above the safety floor before scaling sales or marketing";
    case "CAPACITY_BLOCKED":
      return `Clear the capacity bottleneck${gate.capacity.bottlenecks.length ? ` (${gate.capacity.bottlenecks.join(", ")})` : ""} before taking on more work`;
    case "DO_NOT_REPEAT_BLOCKED":
      return dnrMatch === "exact"
        ? `Review the earlier ${domainLabel} result marked do-not-repeat before repeating that step`
        : `Review the earlier ${domainLabel} result marked do-not-repeat before repeating that growth step`;
  }
}

/** Danger classes: a held step in one of these responds to a present problem the owner must still see. */
const DANGER_CLASSES: ReadonlySet<OwnerPriorityClass> = new Set([
  "SAFETY_COMPLIANCE", "SURVIVAL_CASH", "CUSTOMER_SERVICE_FAILURE", "OVERLOAD_BLOCKING", "PROFIT_LOSS",
]);

/**
 * How far a gate blocker target can be trusted, from its SOURCE (never an unconditional 1):
 *   - an expired obligation with a known expiry: a recorded, dated fact (1);
 *   - capacity: the confidence of the equipment record that decides it (capacityConstraint: a dated
 *     maintenance fact 1, a recorded state within the freshness window 0.9, older or undated ≤ 0.4);
 *   - an exact recorded do-not-repeat rule: the RULE is a recorded fact (1) — but when the held work
 *     responds to a present danger, the target presents that danger, whose confidence is the held work's own
 *     evidence confidence (the rule proves nothing about the danger); a broad rule: the held work's own
 *     confidence (whether it applies rests on the held work's evidence);
 *   - the cash/finance reading: its own source-derived confidence (capped for unverified, out-of-date or
 *     provisional figures); a margin reading: its snapshot's confidence (capped when out of date);
 *   - unknown: never high (UNKNOWN_BLOCKER_CONFIDENCE).
 * Low confidence never lowers the blocker's priority class.
 */
const UNKNOWN_BLOCKER_CONFIDENCE = 0.4;
function blockerConfidence(code: OwnerGateBlockCode, gate: OwnerGateConstraints, group: readonly OwnerGateHold[], exactDnr: boolean, dangerHeld: boolean): number {
  switch (code) {
    case "COMPLIANCE_BLOCKED":
      return 1;
    case "CAPACITY_BLOCKED":
      return typeof gate.capacity.confidence === "number" ? clampConfidence(gate.capacity.confidence) : UNKNOWN_BLOCKER_CONFIDENCE;
    case "DO_NOT_REPEAT_BLOCKED":
      return exactDnr && !dangerHeld ? 1 : Math.max(...group.map((h) => clampConfidence(h.confidence)));
    case "CASH_SAFETY_BLOCKED":
      return typeof gate.cash.confidence === "number" ? clampConfidence(gate.cash.confidence) : UNKNOWN_BLOCKER_CONFIDENCE;
    case "MARGIN_SAFETY_BLOCKED":
      return typeof gate.grossMarginConfidence === "number" ? clampConfidence(gate.grossMarginConfidence) : UNKNOWN_BLOCKER_CONFIDENCE;
  }
}

/**
 * One explicit "clear this blocker" target per gate blocker that holds eligible work and that no eligible
 * item already addresses — for EVERY check that holds a step, not only its first (clearing one blocker never
 * reveals a hidden second one).
 *
 * A do-not-repeat hold keeps the held work's own class, severity and score: a rule that holds back a
 * cash-survival step never makes the cash danger disappear below customer or profit work (the issue stays
 * visible, with the rule review — or a different response — as its step), and a rule that holds back a growth
 * step never lifts that growth item above missing evidence or plan risk.
 */
function buildGateBlockerTargets(
  holds: readonly OwnerGateHold[],
  eligible: readonly OwnerDecisionCandidate[],
  gate: OwnerGateConstraints,
  scope: { businessId: string; workspaceId: string }
): OwnerDecisionCandidate[] {
  const out: OwnerDecisionCandidate[] = [];
  const groups = new Map<string, { code: OwnerGateBlockCode; reason: string; ruleId: string | null; holds: OwnerGateHold[] }>();
  for (const h of holds) {
    for (const b of h.blocks) {
      // One review target per do-not-repeat RULE (the exact rule that holds the work — never a broad rule
      // that merely shares its domain); one target per other blocker kind.
      const ruleId = b.code === "DO_NOT_REPEAT_BLOCKED" ? b.ruleId ?? null : null;
      const key = b.code === "DO_NOT_REPEAT_BLOCKED" ? `${b.code}:${ruleId ?? h.domain}` : b.code;
      const g = groups.get(key) ?? { code: b.code, reason: b.reason, ruleId, holds: [] };
      g.holds.push(h);
      groups.set(key, g);
    }
  }
  for (const [key, g] of groups) {
    const { code, holds: group, ruleId } = g;
    if (eligible.some((c) => addressesBlocker(c, code, gate))) continue;
    const t = gateTarget(code, gate, group[0].domain, ruleId);
    const rule = ruleId ? gate.doNotRepeat.find((r) => r.id === ruleId) ?? null : null;
    const exactDnr = code === "DO_NOT_REPEAT_BLOCKED" && rule?.match === "exact";
    const dnrMatch = code === "DO_NOT_REPEAT_BLOCKED" ? (exactDnr ? "exact" : "broad") : null;
    const held = quoteHeld(group.map((h) => h.title));
    // A do-not-repeat hold carries the held work's most urgent class/severity/score (see the doc above).
    const lead = code === "DO_NOT_REPEAT_BLOCKED"
      ? [...group].sort((a, b) => ownerPriorityClassRank(a.priorityClass) - ownerPriorityClassRank(b.priorityClass) || severityRankOrUnknown(b.severity) - severityRankOrUnknown(a.severity))[0]
      : null;
    const dangerHeld = lead !== null && DANGER_CLASSES.has(lead.priorityClass);
    // A held danger stays the ISSUE: the title names the problem's class, and the held STEP is quoted as the
    // step that is marked do-not-repeat (never presented as "the problem").
    const title = dangerHeld
      ? `${OWNER_PRIORITY_CLASS_LABEL[lead!.priorityClass]} in ${ownerDomainLabel(lead!.domain)} is still open, and its planned step "${lead!.title}" is marked do-not-repeat — respond another way or review that rule`
      : gateBlockerTitle(code, gate, ownerDomainLabel(group[0].domain), dnrMatch);
    const provisionalNote = code === "CASH_SAFETY_BLOCKED" && gate.cash.provisional && gate.cash.driver !== "unverified" ? " This rests on this period's in-progress figures, not a completed period." : "";
    out.push({
      candidateId: `safety_gate:${key}`,
      businessId: scope.businessId,
      workspaceId: scope.workspaceId,
      source: "safety_gate",
      domain: t.domain,
      sourceId: key,
      priorityClass: lead ? lead.priorityClass : t.priorityClass,
      findingCode: t.findingCode,
      // A do-not-repeat review names the exact rule and the finding it is about (a single held finding).
      findingId: code === "DO_NOT_REPEAT_BLOCKED" ? rule?.findingId ?? (new Set(group.map((h) => h.findingId)).size === 1 ? group[0].findingId : null) : null,
      ruleId,
      title,
      explanation: dangerHeld
        ? `The problem is still open (${OWNER_PRIORITY_CLASS_LABEL[lead!.priorityClass]}${lead!.severity ? `, ${lead!.severity}` : ""}); only its planned step is held. ${g.reason} OpsIQ holds ${held} until the rule is reviewed, so respond to the problem another way or review the rule (record what has changed).`
        : `${g.reason}${provisionalNote} OpsIQ holds ${held} until this is cleared, so it is not a step for now.`,
      // Nothing is invented: the gate records no severity, score or effort for its own constraint; a
      // do-not-repeat hold carries the held work's own.
      severity: lead ? lead.severity : null,
      priorityScore: lead ? lead.priorityScore : 0,
      expectedImpactScore: 0,
      confidence: blockerConfidence(code, gate, group, exactDnr, dangerHeld),
      effortScore: 50,
      status: "open",
      ownerActionRequired: true,
      blocking: true,
      evidence: group.map((h) => `On hold: ${h.title}`),
      missingData: [],
      verificationMetric: null,
      evidenceAsOf: null,
      stale: false,
      exclusion: null,
      targetRoute: t.route,
    });
  }
  return out;
}

function quoteHeld(titles: readonly string[]): string {
  const q = titles.slice(0, 3).map((t) => `"${t}"`);
  const more = titles.length > 3 ? ` and ${titles.length - 3} other step${titles.length === 4 ? "" : "s"}` : "";
  return q.length <= 1 ? `${q[0] ?? "this work"}${more}` : `${q.slice(0, -1).join(", ")} and ${q[q.length - 1]}${more}`;
}

/**
 * The canonical eligibility contract, shared by the owner decision and by every domain page's local
 * "next step" (which is this list filtered to its domain — never raw action rows): candidates outside
 * the scope are dropped; stale domain actions and survival issues leave the election and are replaced,
 * per domain, by ONE explicit refresh-evidence target; lifecycle exclusions are kept for transparency.
 *
 * With the business's owner-gate constraints (`scope.gate` — the SAME constraints the server-side action
 * gate enforces, owner-action-gate-policy.ts), an action the gate would refuse is never a step: it is
 * excluded as "held_by_safety_gate" and the blocker itself is elected as work ("safety_gate" target)
 * unless an eligible item already addresses it. So a canonical step is always gate-compatible at the
 * state it was resolved with; the gate still re-checks at mutation time. Without `gate` (pure callers that
 * model no safety state) no action is held.
 */
export function canonicalEligibility(
  candidates: readonly OwnerDecisionCandidate[],
  scope: { businessId: string; workspaceId: string; gate?: OwnerGateConstraints | null }
): { processed: OwnerDecisionCandidate[]; ranked: OwnerDecisionCandidate[]; holds: OwnerGateHold[] } {
  const scoped = candidates.filter((c) => c.businessId === scope.businessId && c.workspaceId === scope.workspaceId);
  // A stale diagnosis is never an authoritative "do this now": its otherwise-eligible actions leave the
  // election and are replaced by an explicit "refresh this evidence" target that carries what they
  // flagged (nothing is silently dropped). Survival issues on stale evidence are replaced the same way.
  // Recorded control facts are never stale.
  const holds: OwnerGateHold[] = [];
  const processed = scoped.map((c) => {
    if (c.exclusion === null && c.stale && (c.source === "domain_action" || c.source === "survival_reading")) return { ...c, exclusion: "stale_evidence" as const };
    // A survival ISSUE is never held — a do-not-repeat rule forbids repeating a STEP, it does not make the
    // danger go away. When an exact rule forbids the step the issue was last responded with, the issue stays
    // eligible under its own wording (never the forbidden step's title) and names that rule.
    if (c.exclusion === null && c.source === "survival_reading" && scope.gate && !scope.gate.optedOut && c.findingId) {
      const dnr = evaluateOwnerActionGate(
        { ...NO_OWNER_GATE_CONSTRAINTS, doNotRepeat: scope.gate.doNotRepeat },
        { domain: c.domain, intent: ownerTargetIntent(c), findingId: c.findingId, findingCode: c.findingCode }
      );
      if (!dnr.allowed && dnr.code === "DO_NOT_REPEAT_BLOCKED") {
        const rule = scope.gate.doNotRepeat.find((r) => r.id === dnr.ruleId) ?? null;
        const earlier = c.status !== "no_action" ? ` "${c.title}"` : "";
        return {
          ...c,
          title: c.issueTitle ?? c.title,
          explanation: `${c.explanation} The earlier step${earlier} for it is marked do-not-repeat${rule?.summary ? ` ("${rule.summary}")` : ""}: respond to the problem another way, or review that rule (record what has changed).`,
          ruleId: dnr.ruleId ?? null,
        };
      }
    }
    if (c.exclusion === null && c.source === "domain_action" && scope.gate) {
      const verdict = evaluateOwnerActionGate(scope.gate, { domain: c.domain, intent: ownerTargetIntent(c), findingId: c.findingId, findingCode: c.findingCode });
      if (!verdict.allowed) {
        holds.push({
          candidateId: c.candidateId, sourceId: c.sourceId, findingId: c.findingId, title: c.title, domain: c.domain, code: verdict.code, reason: verdict.reason,
          ...(verdict.ruleId ? { ruleId: verdict.ruleId } : {}),
          blocks: verdict.blocks, priorityClass: c.priorityClass, severity: c.severity, priorityScore: c.priorityScore, confidence: c.confidence,
        });
        return { ...c, exclusion: "held_by_safety_gate" as const };
      }
    }
    return c;
  });
  const refreshTargets = buildRefreshTargets(processed.filter((c) => c.exclusion === "stale_evidence"), scope);
  const eligible = [...processed, ...refreshTargets].filter(isEligibleOwnerCandidate);
  const blockerTargets = scope.gate ? buildGateBlockerTargets(holds, eligible, scope.gate, scope) : [];
  return { processed, ranked: rankOwnerCandidates([...eligible, ...blockerTargets]), holds };
}

/**
 * The first canonically eligible candidate of one domain (domain pages' local next step), or null. It
 * may be a refresh target synthesized by the eligibility contract (source "evidence_refresh").
 */
export function domainLocalCanonicalStep(
  candidates: readonly OwnerDecisionCandidate[],
  scope: { businessId: string; workspaceId: string; gate?: OwnerGateConstraints | null },
  domain: OwnerDecisionCandidate["domain"]
): OwnerDecisionCandidate | null {
  return canonicalEligibility(candidates, scope).ranked.find((c) => c.domain === domain) ?? null;
}

/**
 * Resolve the ONE current owner decision. Deterministic for identical input. Exactly one primary
 * target when any eligible candidate exists; otherwise an honest non-target state.
 */
export function resolveOwnerDecision(input: ResolveOwnerDecisionInput): CurrentOwnerDecision {
  const { processed, ranked, holds } = canonicalEligibility(input.candidates, input);
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
  for (const d of input.futureDomains ?? []) {
    pushMissing(`${ownerDomainLabel(d)} figures entered for a period that has not started yet are not used. Correct the period if it was entered by mistake.`);
  }
  for (const d of input.provisionalDomains ?? []) {
    // Only Cash flow and Finance in-progress figures feed a safety check (they may tighten it); other domains'
    // in-progress figures are not used at all until the period ends.
    // With no completed period to rest on, never claim advice rests on one.
    const rests = hasEvidence ? " Advice rests on the latest completed period." : " Add figures for a completed period so OpsIQ can advise.";
    pushMissing(d === "cashflow" || d === "finance"
      ? `${ownerDomainLabel(d)} figures for the current period are still in progress: OpsIQ uses them only to flag a worsening, never to clear a problem or approve growth, until the period ends.${rests}`
      : `${ownerDomainLabel(d)} figures for the current period are still in progress, so they are not used until the period ends.${rests}`);
  }

  // Confidence: the primary's own evidence confidence, capped by business-wide data sufficiency.
  const reasons: string[] = [];
  let score = primary ? Math.round(clampConfidence(primary.confidence) * 100) : 0;
  let capped = false;
  const primaryIsRefresh = primary?.source === "evidence_refresh";
  const primaryIsDataRequest = primary !== null && isEvidenceRequestTarget(primary);
  // Recorded control facts (a compliance breach, an owner-recorded risk) do not depend on domain
  // data completeness, so business-wide data sufficiency never caps them.
  // A safety-gate blocker resting on a recorded fact (an expired obligation, recorded capacity) is not capped
  // as provisional either; one resting on data-derived readings (cash, margin, a do-not-repeat hold on
  // diagnosed work) is capped like the evidence it rests on (its own confidence is source-derived).
  const primaryIsRecordedFact = primary !== null && isRecordedFactTarget(primary);
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
  if (primary?.source === "safety_gate" && (primary.findingCode === "GATE_CASH_UNSAFE" || primary.findingCode === "GATE_PROFIT_UNSAFE") && input.gate?.cash.provisional) {
    reasons.push("This rests on this period's in-progress figures, not a completed period, so it is provisional.");
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
                : primary.source === "safety_gate"
                  ? `and OpsIQ's safety checks hold other work until it is cleared`
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

  // What NOT to do vs how to do it: every prohibition passes through the shared reconciler, so it never
  // vetoes the main target or a supporting step. A reconciled item is positive guidance on a canonical
  // step and goes to `conditions`, never under a "don't" heading.
  const imperativeCtx = ownerImperativeContext(primary ? { primaryTarget: primary, supportingSteps: supporting } : null);
  const reconciled: ReconciledProhibition[] = [];
  if (primary) {
    const primaryRank = ownerPriorityClassRank(primary.priorityClass);
    // Genuine growth work (by intent, not class) that is not already a next step.
    const growth = rest.find((c) => ownerTargetIntent(c) === "GROW" && !supportingIds.has(c.candidateId));
    if (growth && primaryRank < ownerPriorityClassRank("GROWTH_OPPORTUNITY")) {
      const lever = ownerLeverKey(growth.findingCode);
      reconciled.push(
        reconcileOwnerProhibition(
          {
            text: `Hold "${growth.title}" (it adds investment or scales demand) until "${primary.title}" is handled.`,
            vetoes: "NONE",
            levers: lever ? [lever] : [],
            // Same business lever as a canonical step: it is part of that work, done in a controlled way.
            asCondition: (t) => `"${growth.title}" moves the same lever as ${quoteTitles(t)}: do it as part of that work, with a controlled first rollout until "${primary.title}" is verified.`,
          },
          imperativeCtx
        )
      );
    }
  }
  // Steps the action gate holds at the current safety state: stated as what not to do yet, with the reason
  // (the blocker itself is a canonical target — canonicalEligibility).
  for (const h of holds.slice(0, MAX_CAN_WAIT)) {
    reconciled.push({ kind: "prohibition", text: `Don't start "${h.title}" yet — ${h.reason}`, conditionOn: [] });
  }
  const s = input.strategy;
  if (s && (s.code === "NOT_YET" || s.code === "DONT_AS_PLANNED" || s.code === "NEED_INFO")) {
    const option = s.optionName ? `"${s.optionName}"` : "the plan you are evaluating";
    const says = `Strategy says "${s.headline}"${s.headlineDetail ? `: ${s.headlineDetail}` : "."}`;
    // When the main target IS a Strategy step, the gate is its precondition, not a contradiction.
    reconciled.push({
      kind: "prohibition",
      text: primary && primary.domain === "strategy" ? `Don't commit to ${option} until "${primary.title}" is done — ${says}` : `Don't commit to ${option} yet — ${says}`,
      conditionOn: [],
    });
  }
  if (input.dataSufficiency.status === "insufficient" && input.dataSufficiency.lowConfidenceDomains.length > 0) {
    // A domain that owns a canonical step is never told "don't rely on it": its issue needs attention and
    // only its numerical score is provisional (a condition). Other low-confidence domains keep the caution.
    const stepDomains = new Set([primary, ...supporting].filter((c): c is OwnerDecisionCandidate => c !== null && c.source !== "evidence_refresh").map((c) => c.domain));
    for (const d of input.dataSufficiency.lowConfidenceDomains.filter((x) => stepDomains.has(x as OwnerDecisionCandidate["domain"]))) {
      const label = ownerDomainLabel(d);
      const missing = input.dataSufficiency.missingCriticalData.length > 0 && d === "finance"
        ? ` until ${input.dataSufficiency.missingCriticalData.slice(0, 3).map(humanizeMetricKey).join(", ")} ${input.dataSufficiency.missingCriticalData.length === 1 ? "is" : "are"} supplied`
        : ` until the missing ${label} data is supplied`;
      reconciled.push({ kind: "condition", text: `The ${label} issue needs attention now, but its ${label} score is provisional${missing}.`, conditionOn: [] });
    }
    const others = input.dataSufficiency.lowConfidenceDomains.filter((x) => !stepDomains.has(x as OwnerDecisionCandidate["domain"]));
    if (others.length > 0) {
      reconciled.push({ kind: "prohibition", text: `Don't rely on the ${others.map(ownerDomainLabel).join(", ")} scores yet — they are based on incomplete data.`, conditionOn: [] });
    }
  }
  const { prohibitions: whatNotToDo, conditions } = partitionReconciled(reconciled);

  const evidence = primary ? [...primary.evidence] : [];

  const whatToDoFirst = primary ? primary.title : !hasEvidence ? missingInformation[0] ?? null : null;

  // Built from the CURRENT step's semantics — never from a dead action: a live action can be done; an
  // open issue with no live action changes only with new figures; a refresh needs the update itself.
  const cadence = `or within ${input.reassessment.days} days (${input.reassessment.reason})`;
  const reassessmentTrigger = primary
    ? primary.source === "evidence_refresh"
      ? `Check again after you update the ${ownerDomainLabel(primary.domain)} figures and re-run its diagnosis, ${cadence}.`
      : primary.source === "survival_reading"
        ? `Check again when new ${ownerDomainLabel(primary.domain)} figures are added (only new figures can show this has gone), ${cadence}.`
        : primary.source === "safety_gate"
          ? `Check again once this is cleared — the work it holds then becomes available — ${cadence}.`
          : primary.source === "domain_action"
          ? `Check again when "${primary.title}" is done${primary.verificationMetric ? ` or your ${humanizeMetricKey(primary.verificationMetric)} changes` : ""}, when new ${ownerDomainLabel(primary.domain)} data is added, ${cadence}.`
          : `Check again when the ${ownerDomainLabel(primary.domain)} record for this is updated, ${cadence}.`
    : hasEvidence
      ? `Check again when new data is added, ${cadence}.`
      : "Check again as soon as you add your business numbers.";

  const advicePolicy = resolveOwnerAdvicePolicy({
    state,
    primary: primary
      ? { source: primary.source, priorityClass: primary.priorityClass, findingCode: primary.findingCode, domain: primary.domain, missingData: primary.missingData }
      : null,
    intent: primary ? ownerTargetIntent(primary) : null,
    primaryDomainLabel: primary ? ownerDomainLabel(primary.domain) : "",
    dataSufficiency: {
      status: input.dataSufficiency.status,
      lowConfidenceDomains: input.dataSufficiency.lowConfidenceDomains,
      missingCriticalData: input.dataSufficiency.missingCriticalData,
    },
    staleDomains: input.staleDomains,
    gateCashProvisional:
      primary?.source === "safety_gate" && (primary.findingCode === "GATE_CASH_UNSAFE" || primary.findingCode === "GATE_PROFIT_UNSAFE") && input.gate?.cash.provisional === true,
    gateCashConflicting: input.gate?.cash.conflicting === true,
    missingInformation,
    reassessmentTrigger,
  });

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
    conditions,
    missingInformation,
    advicePolicy,
    whatChanged: describeOwnerChanges(input.changeFacts),
    whatChangedWindowDays: OWNER_WHAT_CHANGED_WINDOW_DAYS,
    reassessmentTrigger,
    attention,
    excluded,
  };
}

/** Domain pages that show the canonical main target at the `main-target` anchor (DomainMainTargetContext). */
const DOMAIN_PAGES_WITH_MAIN_TARGET_ANCHOR = new Set(["finance", "cashflow", "sales", "operations", "sop", "marketing", "strategy"]);

/** Where a link to a canonical target lands: the domain page's main-target block when it has one. */
export function ownerTargetHref(t: Pick<OwnerDecisionTarget, "domain" | "targetRoute">): string {
  return DOMAIN_PAGES_WITH_MAIN_TARGET_ANCHOR.has(t.domain) && !t.targetRoute.includes("#") ? `${t.targetRoute}#main-target` : t.targetRoute;
}

/**
 * Whether the canonical decision's main target or a supporting step (an actionable one — a refresh
 * target is a data request) lives in this domain. Domain pages use it to frame their own data gaps.
 */
export function decisionHasActionableStepIn(
  decision: Pick<CurrentOwnerDecision, "primaryTarget" | "supportingSteps"> | null,
  domain: string
): boolean {
  if (!decision?.primaryTarget) return false;
  return [decision.primaryTarget, ...decision.supportingSteps].some((t) => t.domain === domain && t.source !== "evidence_refresh");
}
