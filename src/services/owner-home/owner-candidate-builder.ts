/**
 * The ONE builder of spine-domain owner-decision candidates.
 *
 * Owner Home (the canonical owner decision) and every domain page's local "next step" use exactly this
 * builder, so both see the same normalized semantics: verification exclusions bounded by evidence time,
 * stale evidence (replaced by a refresh target in canonicalEligibility), cash/finance supersession,
 * survival issues derived from evidence independently of their actions' lifecycle, and Strategy
 * coherence with its current decision. A domain page never queries Owner Home and never ranks raw
 * action rows; it filters the canonical eligible list to its own domain (domainLocalCanonicalStep).
 *
 * Read-only: loads persisted, workspace- and business-scoped rows and normalizes them. Owns no table.
 */
import { db } from "@/lib/db";
import { continuityKey, ENGAGED_ACTION_STATUSES, readTimeContinuity } from "@/domain/founder-recovery/action-continuity";
import { loadOwnerGateConstraints } from "@/services/owner-mode/owner-action-gate.service";
import { CURRENT_DIAGNOSIS_CYCLE_ORDER, CURRENT_RECOVERY_CYCLE_ORDER, CURRENT_STRATEGY_CYCLE_ORDER, currentEvidenceWhere, provisionalEvidenceWhere } from "@/services/owner-spine/current-diagnosis-cycle";
import type { SurvivalLikeState } from "@/domain/owner-guidance/cash-finance-conflict";
import { currentCashFinanceReading, currentEvidenceTime } from "@/services/owner-spine/current-cash-finance-reading";
import { coherentStrategyActions, currentStrategyDecision } from "@/services/owner-strategy/decision-view";
import { presentStoredStrategyFinding } from "@/domain/owner-strategy/action-arbitration";
import type { OwnerHomeVerificationInput } from "@/domain/owner-home";
import { clampConfidence, clampScore, type DomainScore, type OwnerDomain, type OwnerFinding } from "@/domain/owner-spine/contracts";
import {
  canonicalEligibility,
  domainLocalCanonicalStep,
  strategyCandidatePriorityClass,
  type OwnerDecisionCandidate,
  type OwnerDecisionEvent,
  type OwnerDecisionStrategyContext,
  type OwnerGateHold,
} from "@/domain/owner-spine/owner-decision";
import type { OwnerGateConstraints } from "@/domain/owner-mode/owner-action-gate-policy";
import {
  domainActionToCandidate,
  issueVerificationFact,
  OWNER_DECISION_STALE_EVIDENCE_DAYS,
  recoveryActionToCandidate,
  survivalIssueCandidates,
  verificationReachedTarget,
  verificationTime,
  type IssueVerificationFact,
  type SurvivalEvidenceReading,
} from "@/services/owner-home/owner-decision-candidates";
import {
  financeCycleToDomainScore,
  recoveryCycleToDomainScore,
  cashflowCycleToDomainScore,
  salesCycleToDomainScore,
  operationsCycleToDomainScore,
  sopCycleToDomainScore,
  marketingCycleToDomainScore,
  strategyCycleToDomainScore,
} from "@/services/owner-condition/business-condition.service";

/**
 * Rows arrive through the untyped `db` proxy. These structural types name exactly the fields this
 * builder reads; every other column passes through unread to the domain mappers.
 */
export type PersistedRow = { readonly [column: string]: unknown };
export interface PersistedFindingRow extends PersistedRow {
  code: string;
  title: string;
  summary: string;
  sourceMetric: string;
  findingType: string;
  severity: OwnerFinding["severity"];
  sourceValue?: number | null;
  threshold?: number | null;
  verificationMetric?: string | null;
}
interface PersistedActionRow extends PersistedRow {
  id: string;
  title: string;
  status: string;
  findingCode: string;
  recommendationCode?: string | null;
  verifications?: PersistedRow[];
}
interface PersistedSnapshotRef extends PersistedRow {
  createdAt?: unknown;
  periodEnd?: unknown;
  supersededById?: unknown;
}
export interface PersistedCycleRow extends PersistedRow {
  snapshotId: string;
  findings: PersistedFindingRow[];
  actions: PersistedActionRow[];
  snapshot?: PersistedSnapshotRef | null;
}
interface PersistedVerificationRow extends PersistedRow {
  action?: {
    title?: unknown;
    findingCode?: unknown;
    targetValue?: unknown;
    metricToMove?: unknown;
    finding?: { code?: unknown } | null;
  } | null;
}

/** Map a persisted finding row to a spine OwnerFinding (attach the domain). */
function rowToFinding(row: PersistedFindingRow, domain: OwnerDomain): OwnerFinding {
  return {
    domain,
    code: row.code,
    title: row.title,
    summary: row.summary,
    sourceMetric: row.sourceMetric,
    sourceValue: row.sourceValue ?? null,
    threshold: row.threshold ?? null,
    severity: row.severity,
    confidence: clampConfidence(typeof row.confidence === "number" ? row.confidence : 0),
    impactScore: clampScore(Number(row.impactScore)),
    urgencyScore: clampScore(Number(row.urgencyScore)),
    findingType: row.findingType === "opportunity" ? "opportunity" : "risk",
    evidence: Array.isArray(row.evidence) ? (row.evidence as string[]) : [],
    missingData: Array.isArray(row.missingData) ? (row.missingData as string[]) : [],
    verificationMetric: row.verificationMetric ?? undefined,
  };
}

function asDate(v: unknown): Date {
  return v instanceof Date ? v : new Date(v as string);
}

const spineCycleInclude = {
  // Severity is a plain string, so a DB orderBy sorts it alphabetically
  // (critical, high, low, medium). Findings are ranked after read: by
  // buildOwnerHomeSummary and by the *CycleToDomainScore adapters.
  findings: true,
  // Evidence time (snapshot capture) decides whether a verified fix predates this cycle's evidence.
  snapshot: { select: { id: true, createdAt: true, periodStart: true, periodEnd: true } },
  actions: {
    // Deterministic total order: priorityScore is clamped to [0,100], so
    // ties at the ceiling are a real, expected occurrence -- a single-key
    // orderBy has no guaranteed return order for tied rows across
    // repeated SELECTs. Same fix/rationale as dashboard.service.ts (PR #361).
    orderBy: [
      { priorityScore: "desc" },
      { expectedImpactScore: "desc" },
      { confidence: "desc" },
      { findingCode: "asc" },
      { title: "asc" },
      { id: "asc" },
    ],
    include: { verifications: { orderBy: { createdAt: "desc" } } },
  },
} as const;

/** Verification rows fetched across ALL cycles (re-diagnosis moves the live action to a new cycle). */
const verificationInclude = { action: { select: { title: true, findingCode: true } } } as const;

export { currentEvidenceTime };

const SAFE_SURVIVAL_STATES = new Set<SurvivalLikeState>(["SAFE", "WATCH"]);

type DomainKey = "finance" | "cashflow" | "sales" | "operations" | "sop" | "marketing" | "strategy";

/** The persisted spine evidence of one business: each domain's latest cycle and all its verifications. */
export interface OwnerSpineEvidence {
  finance: PersistedCycleRow | null;
  recovery: PersistedCycleRow | null;
  cashflow: PersistedCycleRow | null;
  sales: PersistedCycleRow | null;
  operations: PersistedCycleRow | null;
  sop: PersistedCycleRow | null;
  marketing: PersistedCycleRow | null;
  strategy: PersistedCycleRow | null;
  /** Domains holding figures for a period that has not STARTED yet (genuinely future: excluded entirely). */
  futureDomains: string[];
  /** Domains holding figures for the in-progress current period (provisional: never the current cycle). */
  provisionalDomains: string[];
  verifications: Record<DomainKey | "recovery", PersistedVerificationRow[]>;
}

/**
 * Read-time action continuity (readTimeContinuity, action-continuity.ts — the SAME rule the domain dashboards
 * apply): the owner's ENGAGED work still attached to an older cycle follows the current issue by continuity
 * key and takes the place of the current cycle's never-engaged proposal for that key (described by the
 * CURRENT diagnosis's finding; its own findingId — its baseline — is kept); COMPLETED work on another cycle is
 * terminal evidence that suppresses the current cycle's duplicate proposal until evidence that post-dates
 * the completion re-raises it, and is kept in view as completed (never as a step). Work whose finding the
 * current diagnosis no longer raises is not a current step.
 */
function followEngagedWork<C extends { id: string; createdAt?: unknown; snapshot?: { periodStart?: unknown; periodEnd?: unknown } | null; findings?: unknown[]; actions?: unknown[] }>(
  cycle: C | null,
  prior: ReadonlyArray<Record<string, unknown>>,
  codeOf: (a: Record<string, unknown>) => string | null
): (C & { continuityFindingAlias?: Map<string, unknown> }) | null {
  if (!cycle) return null;
  const findings = (cycle.findings ?? []) as Array<{ id: unknown; code?: unknown }>;
  const byCode = new Map(findings.map((f) => [String(f.code), f]));
  type Row = Record<string, unknown> & { id: string; cycleId: string; status: string; completedAt?: Date | string | null };
  const keyOf = (a: Row) => {
    const code = codeOf(a);
    return code === null ? null : continuityKey({ findingCode: code, recommendationCode: (a.recommendationCode as string | null | undefined) ?? null });
  };
  const r = readTimeContinuity<Row>(
    {
      id: cycle.id,
      createdAt: (cycle.createdAt as Date | string | null | undefined) ?? null,
      periodStart: (cycle.snapshot?.periodStart as Date | string | null | undefined) ?? null,
      periodEnd: (cycle.snapshot?.periodEnd as Date | string | null | undefined) ?? null,
      raisedCodes: new Set(byCode.keys()),
    },
    (cycle.actions ?? []) as Row[],
    prior as Row[],
    keyOf,
    codeOf
  );
  if (r.followed.length === 0 && r.completedEarlier.length === 0) return cycle;
  const alias = new Map<string, unknown>();
  for (const e of [...r.followed, ...r.completedEarlier]) if (typeof e.findingId === "string") alias.set(e.findingId, byCode.get(codeOf(e) ?? ""));
  return { ...cycle, actions: [...r.own, ...r.followed, ...r.completedEarlier], continuityFindingAlias: alias };
}

/**
 * Load the CURRENT diagnosis cycle (latest evidence period — current-diagnosis-cycle.ts) of every spine domain and every recorded verification (across ALL cycles:
 * re-diagnosis moves the live action to a new cycle, so the old cycle's actions hold the records).
 */
export async function loadOwnerSpineEvidence(workspaceId: string, businessId: string, now: Date = new Date()): Promise<OwnerSpineEvidence> {
  const where = { businessId, workspaceId };
  // Current evidence only: a period that has not ended by `now` is never the current reading.
  const evidenceWhere = { ...where, ...currentEvidenceWhere(now) };
  const latest = { orderBy: CURRENT_DIAGNOSIS_CYCLE_ORDER, include: spineCycleInclude };
  // Figures for a period that has not STARTED are not used at all; figures for the in-progress current
  // period are provisional (never the current cycle) — the owner is told which is which.
  const futureWhere = { ...where, snapshot: { periodStart: { gt: now } } };
  const provisionalWhere = { ...where, ...provisionalEvidenceWhere(now) };
  const futureSelect = { select: { id: true } } as const;
  const [finance, recovery, cashflow, sales, operations, sop, marketing, strategy,
    financeVers, salesVers, operationsVers, sopVers, strategyVers, cashflowVers, marketingVers, recoveryVers] = await Promise.all([
    // Finance also needs its snapshot's amendment state: an amended (superseded) snapshot means the
    // latest diagnosis is based on figures the owner has since corrected.
    db.ownerFinanceCycle.findFirst({
      where: evidenceWhere,
      orderBy: CURRENT_DIAGNOSIS_CYCLE_ORDER,
      include: { ...spineCycleInclude, snapshot: { select: { id: true, createdAt: true, periodStart: true, periodEnd: true, supersededById: true, missingCriticalData: true } } },
    }),
    db.recoveryCycle.findFirst({
      where: evidenceWhere,
      orderBy: CURRENT_RECOVERY_CYCLE_ORDER,
      include: {
        snapshot: true,
        findings: { select: { code: true, severity: true, confidence: true, title: true } },
        actions: {
          include: { finding: { select: { code: true, severity: true } }, verifications: { orderBy: { createdAt: "desc" } } },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    // Cashflow also needs its snapshot's cash components: whether the cash position can be established from BOTH
    // is part of the survival-evidence sufficiency (survival-evidence.ts), read from the same current cycle.
    db.ownerCashflowCycle.findFirst({
      where: evidenceWhere,
      orderBy: CURRENT_DIAGNOSIS_CYCLE_ORDER,
      include: { ...spineCycleInclude, snapshot: { select: { id: true, createdAt: true, periodStart: true, periodEnd: true, cashInHand: true, bankBalance: true } } },
    }),
    db.ownerSalesCycle.findFirst({ where: evidenceWhere, ...latest }),
    db.ownerOperationsCycle.findFirst({ where: evidenceWhere, ...latest }),
    db.ownerSopCycle.findFirst({ where: evidenceWhere, ...latest }),
    db.ownerMarketingCycle.findFirst({ where: evidenceWhere, ...latest }),
    // Strategy needs its evaluated snapshot: its actions are arbitrated against the current decision.
    db.ownerStrategyCycle.findFirst({ where, orderBy: CURRENT_STRATEGY_CYCLE_ORDER, include: { ...spineCycleInclude, snapshot: true } }),
    db.ownerFinanceVerification.findMany({ where, include: verificationInclude, orderBy: { createdAt: "desc" } }),
    db.ownerSalesVerification.findMany({ where, include: verificationInclude, orderBy: { createdAt: "desc" } }),
    db.ownerOperationsVerification.findMany({ where, include: verificationInclude, orderBy: { createdAt: "desc" } }),
    db.ownerSopVerification.findMany({ where, include: verificationInclude, orderBy: { createdAt: "desc" } }),
    db.ownerStrategyVerification.findMany({ where, include: verificationInclude, orderBy: { createdAt: "desc" } }),
    db.ownerCashflowVerification.findMany({ where, include: verificationInclude, orderBy: { createdAt: "desc" } }),
    db.ownerMarketingVerification.findMany({ where, include: verificationInclude, orderBy: { createdAt: "desc" } }),
    // RecoveryVerification has no businessId column: scope through its action's business.
    db.recoveryVerification.findMany({
      where: { workspaceId, action: { businessId, workspaceId } },
      include: { action: { select: { title: true, targetValue: true, metricToMove: true, finding: { select: { code: true } } } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  // Work on other cycles for read-time continuity (followEngagedWork): engaged work, and completed work for a
  // finding the current cycle raises (terminal evidence against a duplicate proposal). Never work on a cycle
  // of a period that has not started (a future plan's priority and wording are never followed).
  const startedCycle = { cycle: { snapshot: { periodStart: { lte: now } } } };
  const priorWhere = (codes: string[]) => ({
    ...where,
    ...startedCycle,
    OR: [{ status: { in: [...ENGAGED_ACTION_STATUSES] } }, { status: "completed", findingCode: { in: codes } }],
  });
  const codesOf = (c: { findings?: unknown[] } | null) => ((c?.findings ?? []) as Array<{ code?: unknown }>).map((f) => String(f.code));
  const engagedInclude = { include: { verifications: { orderBy: { createdAt: "desc" as const } } } };
  const [engFinance, engCashflow, engSales, engOperations, engSop, engMarketing, engRecovery] = await Promise.all([
    finance ? db.ownerFinanceAction.findMany({ where: priorWhere(codesOf(finance)), ...engagedInclude }) : [],
    cashflow ? db.ownerCashflowAction.findMany({ where: priorWhere(codesOf(cashflow)), ...engagedInclude }) : [],
    sales ? db.ownerSalesAction.findMany({ where: priorWhere(codesOf(sales)), ...engagedInclude }) : [],
    operations ? db.ownerOperationsAction.findMany({ where: priorWhere(codesOf(operations)), ...engagedInclude }) : [],
    sop ? db.ownerSopAction.findMany({ where: priorWhere(codesOf(sop)), ...engagedInclude }) : [],
    marketing ? db.ownerMarketingAction.findMany({ where: priorWhere(codesOf(marketing)), ...engagedInclude }) : [],
    recovery
      ? db.recoveryAction.findMany({
          where: {
            ...where,
            ...startedCycle,
            OR: [{ status: { in: [...ENGAGED_ACTION_STATUSES] } }, { status: "completed", finding: { code: { in: codesOf(recovery) } } }],
          },
          include: { finding: { select: { code: true, severity: true } }, verifications: { orderBy: { createdAt: "desc" as const } } },
        })
      : [],
  ]);
  const byFindingCode = (a: Record<string, unknown>) => (typeof a.findingCode === "string" ? a.findingCode : null);
  const byLinkedFinding = (a: Record<string, unknown>) => {
    const f = a.finding as { code?: unknown } | null | undefined;
    return typeof f?.code === "string" ? f.code : null;
  };
  const periodReads = (w: Record<string, unknown>) => Promise.all([
    db.ownerFinanceCycle.findFirst({ where: w, ...futureSelect }).then((r: unknown) => (r ? "finance" : null)),
    db.ownerCashflowCycle.findFirst({ where: w, ...futureSelect }).then((r: unknown) => (r ? "cashflow" : null)),
    db.ownerSalesCycle.findFirst({ where: w, ...futureSelect }).then((r: unknown) => (r ? "sales" : null)),
    db.ownerOperationsCycle.findFirst({ where: w, ...futureSelect }).then((r: unknown) => (r ? "operations" : null)),
    db.ownerSopCycle.findFirst({ where: w, ...futureSelect }).then((r: unknown) => (r ? "sop" : null)),
    db.ownerMarketingCycle.findFirst({ where: w, ...futureSelect }).then((r: unknown) => (r ? "marketing" : null)),
    db.recoveryCycle.findFirst({ where: w, ...futureSelect }).then((r: unknown) => (r ? "recovery" : null)),
  ]);
  const [futureReads, provisionalReads] = await Promise.all([periodReads(futureWhere), periodReads(provisionalWhere)]);
  return {
    finance: followEngagedWork(finance, engFinance, byFindingCode),
    recovery: followEngagedWork(recovery, engRecovery, byLinkedFinding),
    cashflow: followEngagedWork(cashflow, engCashflow, byFindingCode),
    sales: followEngagedWork(sales, engSales, byFindingCode),
    operations: followEngagedWork(operations, engOperations, byFindingCode),
    sop: followEngagedWork(sop, engSop, byFindingCode),
    marketing: followEngagedWork(marketing, engMarketing, byFindingCode),
    strategy,
    futureDomains: futureReads.filter((d): d is string => d !== null),
    provisionalDomains: provisionalReads.filter((d): d is string => d !== null),
    verifications: {
      finance: financeVers, sales: salesVers, operations: operationsVers, sop: sopVers, strategy: strategyVers,
      cashflow: cashflowVers, marketing: marketingVers, recovery: recoveryVers,
    },
  };
}

/** Everything the spine evidence says, normalized once for Home and for domain pages. */
export interface OwnerSpineBuild {
  candidates: OwnerDecisionCandidate[];
  domainScores: DomainScore[];
  findings: OwnerFinding[];
  verifications: OwnerHomeVerificationInput[];
  events: OwnerDecisionEvent[];
  staleDomains: string[];
  /** Domains holding figures for a period that has not started yet (excluded entirely). */
  futureDomains: string[];
  /** Domains holding figures for the in-progress current period (provisional, labelled as in progress). */
  provisionalDomains: string[];
  survivalReadings: SurvivalEvidenceReading[];
  strategyContext: OwnerDecisionStrategyContext | null;
  /** Missing critical data of the EXACT snapshot the latest Finance diagnosis ran on. */
  missingCriticalData: string[];
}

/** Normalize loaded spine evidence into canonical candidates (pure over the loaded rows). */
export function buildOwnerSpineCandidates(
  ev: OwnerSpineEvidence,
  scope: { businessId: string; workspaceId: string; now: Date }
): OwnerSpineBuild {
  const { businessId, workspaceId, now } = scope;
  const { finance, recovery, cashflow, sales, operations, sop, marketing, strategy } = ev;
  const domainScores: DomainScore[] = [];
  const findings: OwnerFinding[] = [];
  const verifications: OwnerHomeVerificationInput[] = [];
  const candidates: OwnerDecisionCandidate[] = [];
  const events: OwnerDecisionEvent[] = [];
  const staleDomains: string[] = [];
  const futureDomains = [...ev.futureDomains];
  const provisionalDomains = [...ev.provisionalDomains];
  const staleCutoff = now.getTime() - OWNER_DECISION_STALE_EVIDENCE_DAYS * 86_400_000;
  const issueVerifications: Record<"finance" | "cashflow", IssueVerificationFact[]> = { finance: [], cashflow: [] };

  const pushVerification = (domain: OwnerDomain, v: PersistedRow, actionTitle: string) => {
    verifications.push({
      domain,
      actionTitle,
      metric: v.verificationMetric as OwnerHomeVerificationInput["metric"],
      beforeValue: (v.beforeValue ?? null) as OwnerHomeVerificationInput["beforeValue"],
      afterValue: (v.afterValue ?? null) as OwnerHomeVerificationInput["afterValue"],
      status: v.status as OwnerHomeVerificationInput["status"],
      verifiedAt: asDate(v.createdAt),
    });
    if (verificationReachedTarget(v)) events.push({ kind: "ACTION_VERIFIED", title: actionTitle, at: verificationTime(v) });
  };

  /** Latest target-reached verification per finding code (from a list of verification rows). */
  const fixesFrom = (rows: Array<{ v: PersistedRow; findingCode: string }>): Map<string, Date> => {
    const m = new Map<string, Date>();
    for (const { v, findingCode } of rows) {
      if (!verificationReachedTarget(v)) continue;
      const at = verificationTime(v);
      const prev = m.get(findingCode);
      if (!prev || at > prev) m.set(findingCode, at);
    }
    return m;
  };

  const addDomain = (domain: DomainKey, cycle: PersistedCycleRow, score: DomainScore, actionRows: readonly PersistedActionRow[], allVers: readonly PersistedVerificationRow[], findingRows: readonly PersistedFindingRow[]) => {
    domainScores.push(score);
    for (const f of findingRows) findings.push(rowToFinding(f, domain));
    const evidenceAsOf = cycle.snapshot?.createdAt ? asDate(cycle.snapshot.createdAt) : null;
    const periodEnd = cycle.snapshot?.periodEnd ? asDate(cycle.snapshot.periodEnd) : null;
    // Not current: the evidence period is old, or (Finance) the diagnosed snapshot has since been amended.
    // (A period that has not ended is never loaded as the current cycle — currentEvidenceWhere.)
    const stale = (periodEnd !== null && periodEnd.getTime() < staleCutoff) || Boolean(cycle.snapshot?.supersededById);
    if (stale) staleDomains.push(domain);
    const verRows: Array<{ v: PersistedRow; findingCode: string; title: string }> = allVers.map((v) => ({
      v, findingCode: String(v.action?.findingCode ?? ""), title: String(v.action?.title ?? ""),
    }));
    for (const r of verRows) pushVerification(domain, r.v, r.title);
    if (domain === "finance" || domain === "cashflow") {
      for (const r of verRows) issueVerifications[domain].push(issueVerificationFact(r.v, r.findingCode));
    }
    const ctx = {
      businessId,
      workspaceId,
      domain,
      findingsById: new Map<string, PersistedFindingRow>([
        ...(cycle.findings ?? []).map((f) => [String(f.id), f] as [string, PersistedFindingRow]),
        // Engaged work followed from an older cycle is described by the CURRENT diagnosis's finding.
        ...[...((cycle as { continuityFindingAlias?: Map<string, PersistedFindingRow> }).continuityFindingAlias ?? new Map<string, PersistedFindingRow>())],
      ]),
      evidenceAsOf,
      stale,
      verifiedFixes: fixesFrom(verRows),
    };
    for (const a of actionRows) {
      candidates.push(domainActionToCandidate(a, ctx));
      if (a.status === "completed" && a.completedAt) events.push({ kind: "ACTION_COMPLETED", title: a.title, at: asDate(a.completedAt) });
    }
  };

  if (finance) addDomain("finance", finance, financeCycleToDomainScore(finance), finance.actions, ev.verifications.finance, finance.findings);
  if (recovery) {
    domainScores.push(recoveryCycleToDomainScore(recovery, recovery.snapshot));
    // Recovery findings do not carry the spine findingType/impact shape → excluded from
    // the risk/opportunity lists (honest: nothing inferred). Recovery scores still count.
    const evidenceAsOf = recovery.snapshot?.createdAt ? asDate(recovery.snapshot.createdAt) : null;
    const periodEnd = recovery.snapshot?.periodEnd ? asDate(recovery.snapshot.periodEnd) : null;
    const stale = periodEnd !== null && periodEnd.getTime() < staleCutoff;
    if (stale) staleDomains.push("recovery");
    // Recovery persists targetValue 0 when its action had no target: "reached target" is judged
    // against the ACTION's own target (null ⇒ never reached), not the placeholder.
    const recoveryVerRows = ev.verifications.recovery.map((v) => ({
      v: { ...v, targetValue: typeof v.action?.targetValue === "number" ? v.action.targetValue : null },
      findingCode: String(v.action?.finding?.code ?? v.action?.metricToMove ?? "RECOVERY_ACTION"),
      title: String(v.action?.title ?? ""),
    }));
    for (const r of recoveryVerRows) {
      if (verificationReachedTarget(r.v)) events.push({ kind: "ACTION_VERIFIED", title: r.title, at: verificationTime(r.v) });
    }
    const ctx = { businessId, workspaceId, domain: "recovery" as const, findingsById: new Map(), evidenceAsOf, stale, verifiedFixes: fixesFrom(recoveryVerRows) };
    for (const a of recovery.actions) {
      const targetValue = typeof a.targetValue === "number" ? a.targetValue : null;
      candidates.push(recoveryActionToCandidate({ ...a, verifications: (a.verifications ?? []).map((v) => ({ ...v, targetValue })) }, ctx));
      if (a.status === "completed" && a.completedAt) events.push({ kind: "ACTION_COMPLETED", title: a.title, at: asDate(a.completedAt) });
    }
  }
  if (cashflow) addDomain("cashflow", cashflow, cashflowCycleToDomainScore(cashflow), cashflow.actions, ev.verifications.cashflow, cashflow.findings);
  // Cash triage and Finance diagnosis can go stale relative to each other. The ONE current cash/finance
  // reading (current-cash-finance-reading.ts — the same one Now View and the safety gates use) decides
  // which survival reading is current: a survival-class action from a reading superseded by a NEWER,
  // disagreeing reading of the other source must not win the election. Freshness is the period each
  // reading describes; an out-of-date or amended reading never supersedes the other (fails safe).
  const cashAt = cashflow ? currentEvidenceTime(cashflow.snapshot, staleCutoff, now.getTime()) : null;
  const financeAt = finance ? currentEvidenceTime(finance.snapshot, staleCutoff, now.getTime()) : null;
  let supersededSurvivalDomain: "cashflow" | "finance" | null = null;
  if (cashflow && finance) {
    const cashFinance = currentCashFinanceReading(
      { state: cashflow.cashflowState as string | null, snapshot: cashflow.snapshot },
      { state: finance.survivalState as string | null, snapshot: finance.snapshot },
      now.getTime()
    );
    // Exactly the shared reading's supersession — the same effective-evidence eligibility the safety gate
    // enforces (owner-action-gate.service.ts), so Home never elects what the gate would treat as superseded
    // or vice versa. What DRIVES the enforced state (cash vs a profit-driven Finance state) names the
    // blocker (gateDriver), it does not change which reading is current.
    supersededSurvivalDomain = cashFinance.supersededSource === "cash" ? "cashflow" : cashFinance.supersededSource === "finance" ? "finance" : null;
    if (supersededSurvivalDomain && cashFinance.supersededState && !SAFE_SURVIVAL_STATES.has(cashFinance.supersededState)) {
      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        if (c.domain === supersededSurvivalDomain && c.priorityClass === "SURVIVAL_CASH" && !c.exclusion) {
          candidates[i] = { ...c, exclusion: "superseded" };
        }
      }
    }
  }
  // Survival EVIDENCE per source — issues are derived from it independently of their actions' lifecycle.
  const survivalReadings: SurvivalEvidenceReading[] = [];
  if (cashflow) {
    survivalReadings.push({
      domain: "cashflow", periodEnd: cashflow.snapshot?.periodEnd ? asDate(cashflow.snapshot.periodEnd) : null,
      evidenceAt: cashflow.snapshot?.createdAt ? asDate(cashflow.snapshot.createdAt) : null,
      stale: cashAt === null, superseded: supersededSurvivalDomain === "cashflow",
      dataConfidenceScore: Number(cashflow.dataConfidenceScore ?? 0), findings: cashflow.findings ?? [],
      verifications: issueVerifications.cashflow,
    });
  }
  if (finance) {
    survivalReadings.push({
      domain: "finance", periodEnd: finance.snapshot?.periodEnd ? asDate(finance.snapshot.periodEnd) : null,
      evidenceAt: finance.snapshot?.createdAt ? asDate(finance.snapshot.createdAt) : null,
      stale: financeAt === null, superseded: supersededSurvivalDomain === "finance",
      dataConfidenceScore: Number(finance.dataConfidenceScore ?? 0), findings: finance.findings ?? [],
      verifications: issueVerifications.finance,
    });
  }
  if (sales) addDomain("sales", sales, salesCycleToDomainScore(sales), sales.actions, ev.verifications.sales, sales.findings);
  if (operations) addDomain("operations", operations, operationsCycleToDomainScore(operations), operations.actions, ev.verifications.operations, operations.findings);
  if (sop) addDomain("sop", sop, sopCycleToDomainScore(sop), sop.actions, ev.verifications.sop, sop.findings);
  if (marketing) addDomain("marketing", marketing, marketingCycleToDomainScore(marketing), marketing.actions, ev.verifications.marketing, marketing.findings);
  let strategyContext: OwnerDecisionStrategyContext | null = null;
  if (strategy) {
    // Only the decision's primary step and allowed supporting steps may compete (never a stale
    // "Pursue"/"Proceed" that conflicts with the current decision); the rest are superseded.
    const coherent = coherentStrategyActions(strategy, strategy.actions, now);
    const coherentIds = new Set(coherent.map((a) => a.id));
    // Retired "data quality" rows are data gaps, not upside (presentStoredStrategyFinding).
    const strategyFindings = strategy.findings.map((f) => presentStoredStrategyFinding(f));
    const strategyStart = candidates.length;
    addDomain("strategy", strategy, strategyCycleToDomainScore(strategy), coherent, ev.verifications.strategy, strategyFindings);
    // Strategy precedence comes from its RESOLVED five-state decision and blocker, not the code alone.
    const decision = currentStrategyDecision(strategy, now);
    const strategyDecisionCode = decision?.code ?? null;
    for (let i = strategyStart; i < candidates.length; i++) {
      candidates[i] = { ...candidates[i], priorityClass: strategyCandidatePriorityClass(strategyDecisionCode, candidates[i].findingCode) };
    }
    for (const a of strategy.actions) {
      if (coherentIds.has(a.id)) continue;
      const c = domainActionToCandidate(a, {
        businessId, workspaceId, domain: "strategy", findingsById: new Map(), evidenceAsOf: null, stale: false, verifiedFixes: new Map(),
      });
      candidates.push({ ...c, exclusion: c.exclusion ?? "superseded" });
    }
    if (decision) {
      strategyContext = {
        code: decision.code,
        headline: decision.headline,
        headlineDetail: decision.headlineDetail,
        optionName: typeof strategy.snapshot?.optionName === "string" ? strategy.snapshot.optionName : null,
        fundingGap: decision.values.fundingGap,
        currency: decision.values.currency,
      };
    }
  }

  // A survival issue stays open while the evidence that raised it is the evidence OpsIQ holds, whatever
  // happened to its action; only an eligible action for the SAME issue represents it (survivalIssueCandidates).
  candidates.push(...survivalIssueCandidates(survivalReadings, candidates, { businessId, workspaceId }));

  // Missing-critical-data comes from the EXACT snapshot the latest Finance diagnosis ran on — never
  // inferred from whichever snapshot has the latest period. No Finance diagnosis ⇒ nothing is claimed.
  const missingCriticalData = Array.isArray(finance?.snapshot?.missingCriticalData)
    ? (finance.snapshot.missingCriticalData as unknown[]).filter((m): m is string => typeof m === "string")
    : [];

  return { candidates, domainScores, findings, verifications, events, staleDomains, futureDomains, provisionalDomains, survivalReadings, strategyContext, missingCriticalData };
}

/**
 * One domain's canonically ELIGIBLE items in canonical order: the same list the owner decision elects
 * from (canonicalEligibility), filtered to that domain. Includes that domain's explicit refresh target
 * when its evidence is out of date. Never a completed, cancelled, verified, stale-replaced or superseded item.
 */
export async function getDomainEligibleOwnerSteps(
  workspaceId: string,
  businessId: string,
  domain: OwnerDecisionCandidate["domain"],
  now: Date = new Date()
): Promise<OwnerDecisionCandidate[]> {
  return (await getDomainOwnerSteps(workspaceId, businessId, domain, now)).eligible;
}

/**
 * One domain's canonically eligible items AND the domain's steps the owner action gate holds back (with
 * the constraints they were resolved with) — so a domain page can say a step is held, and by what,
 * instead of calling it done or superseded.
 */
export async function getDomainOwnerSteps(
  workspaceId: string,
  businessId: string,
  domain: OwnerDecisionCandidate["domain"],
  now: Date = new Date()
): Promise<{ eligible: OwnerDecisionCandidate[]; holds: OwnerGateHold[]; gate: OwnerGateConstraints }> {
  const [ev, gate] = await Promise.all([
    loadOwnerSpineEvidence(workspaceId, businessId, now),
    loadOwnerGateConstraints(workspaceId, businessId, { db: db as never, now: () => now }),
  ]);
  const { candidates } = buildOwnerSpineCandidates(ev, { businessId, workspaceId, now });
  const { ranked, holds } = canonicalEligibility(candidates, { businessId, workspaceId, gate });
  return { eligible: ranked.filter((c) => c.domain === domain), holds: holds.filter((h) => h.domain === domain), gate };
}

/**
 * The next step WITHIN one domain: the first of that domain's canonically eligible items
 * (domainLocalCanonicalStep over the shared builder) — never a second cross-domain election.
 */
export async function getDomainLocalOwnerStep(
  workspaceId: string,
  businessId: string,
  domain: OwnerDecisionCandidate["domain"],
  now: Date = new Date()
): Promise<OwnerDecisionCandidate | null> {
  const [ev, gate] = await Promise.all([
    loadOwnerSpineEvidence(workspaceId, businessId, now),
    loadOwnerGateConstraints(workspaceId, businessId, { db: db as never, now: () => now }),
  ]);
  const { candidates } = buildOwnerSpineCandidates(ev, { businessId, workspaceId, now });
  return domainLocalCanonicalStep(candidates, { businessId, workspaceId, gate }, domain);
}

/**
 * The domain page's local step in the shape its "Next step within …" block renders: the persisted
 * action row when the step IS one of this domain's actions (so the page shows its own record), and
 * otherwise the canonical item itself (a survival issue or an explicit refresh target).
 */
export function presentDomainLocalStep<T extends { id: string }>(step: OwnerDecisionCandidate | null, rows: readonly T[]): (T & { localStepSource: "domain_action" }) | DomainLocalStepView | null {
  if (!step) return null;
  if (step.source === "domain_action") {
    const row = rows.find((r) => String(r.id) === step.sourceId);
    if (row) return { ...row, localStepSource: "domain_action" as const };
  }
  return {
    id: step.candidateId,
    localStepSource: step.source,
    title: step.title,
    description: step.explanation,
    evidence: step.evidence,
    priorityScore: step.priorityScore,
    expectedImpactScore: step.expectedImpactScore,
    effortScore: step.effortScore,
    verificationMetric: step.verificationMetric,
    status: step.status,
    targetRoute: step.targetRoute,
  };
}

/** A local step that is not one of the domain's own action rows (a survival issue or a refresh target). */
export interface DomainLocalStepView {
  id: string;
  localStepSource: OwnerDecisionCandidate["source"];
  title: string;
  description: string;
  evidence: string[];
  priorityScore: number;
  expectedImpactScore: number;
  effortScore: number;
  verificationMetric: string | null;
  status: string;
  targetRoute: string;
}

/** Whether Strategy's own decision step is the page's next step (see selectStrategyLocalStep). */
export type StrategyDecisionStepState =
  /** The decision's primary-step row is canonically eligible: it IS the next step. */
  | "current"
  /** No action row carries the decision's step yet (the scenario was evaluated before it existed). */
  | "not_listed"
  /** Its row exists but is not canonically eligible (out-of-date figures, done, verified, superseded). */
  | "replaced"
  /** Its row exists, or would, but the owner action gate holds it back at the current safety state. */
  | "held";

export interface StrategyLocalStepSelection<T> {
  recommended: (T & { localStepSource: "domain_action" }) | DomainLocalStepView | null;
  /**
   * `openStep` (only when "not_listed"): the first canonically eligible Strategy item while the decision's
   * own step has no action row yet — shown beside the decision's step, never instead of it.
   */
  decisionStep: { state: StrategyDecisionStepState; replacedBecause: string | null; openStep?: { title: string; description: string } | null };
}

/**
 * Strategy's local next step under the SAME eligibility contract as every other domain page: it is
 * always the first canonically eligible Strategy item (domainLocalCanonicalStep's order). The
 * decision's own step is "current" only when its row IS that item; otherwise the page says why it is
 * not — out-of-date figures, done, cancelled, verified or superseded, or another open Strategy step
 * ranking ahead of it. `isDecisionStepRow` identifies the decision's step on a row whatever the row's
 * status (a completed or cancelled row still carries the step).
 */
export function selectStrategyLocalStep<T extends { id: string; status?: string; title?: string }>(
  decisionPresent: boolean,
  rows: readonly T[],
  eligible: readonly OwnerDecisionCandidate[],
  isDecisionStepRow: (row: T) => boolean,
  held: {
    /** Why each held row is held (ownerGateHoldText), by row id. */
    rows: ReadonlyMap<string, string>;
    /** Why the decision's step would be held if it had no row yet (null ⇒ the gate would allow it). */
    unlistedStep: string | null;
  } = { rows: new Map(), unlistedStep: null }
): StrategyLocalStepSelection<T> {
  const first = eligible[0] ?? null;
  const recommended = presentDomainLocalStep(first, rows);
  if (!decisionPresent) return { recommended, decisionStep: { state: "not_listed", replacedBecause: null } };
  const stepRows = rows.filter(isDecisionStepRow);
  if (first?.source === "domain_action" && stepRows.some((r) => String(r.id) === first.sourceId)) {
    return { recommended, decisionStep: { state: "current", replacedBecause: null } };
  }
  if (first?.source === "evidence_refresh") {
    return {
      recommended,
      decisionStep: { state: "replaced", replacedBecause: "The Strategy figures it rests on are out of date, so OpsIQ will not tell you to act on it until they are updated." },
    };
  }
  if (stepRows.length === 0) {
    // The decision's step is not persisted yet. When the gate would hold it, the card says so (never "add
    // it to your action list"). Otherwise the card still shows it, and the first eligible Strategy ACTION —
    // which IS in the action list — is shown with it, never dropped.
    if (held.unlistedStep) return { recommended, decisionStep: { state: "held", replacedBecause: held.unlistedStep } };
    const openStep = first?.source === "domain_action" && recommended
      ? { title: recommended.title ?? first.title, description: ("description" in recommended && typeof recommended.description === "string") ? recommended.description : first.explanation }
      : null;
    return { recommended, decisionStep: { state: "not_listed", replacedBecause: null, openStep } };
  }
  // A step row the owner action gate holds back is held — never called done, verified or superseded.
  const heldRow = stepRows.find((r) => held.rows.has(String(r.id)));
  if (heldRow) return { recommended, decisionStep: { state: "held", replacedBecause: held.rows.get(String(heldRow.id)) ?? null } };
  const eligibleRowIds = new Set(eligible.filter((c) => c.source === "domain_action").map((c) => c.sourceId));
  const openEligible = stepRows.find((r) => eligibleRowIds.has(String(r.id)));
  const replacedBecause = openEligible && first
    ? `Another open Strategy step, "${first.title}", comes first in OpsIQ's order.`
    : stepRows.some((r) => r.status === "completed")
      ? "It is already done."
      : stepRows.some((r) => r.status === "cancelled")
        ? "It was cancelled."
        : "It is already verified or no longer part of the current plan.";
  return { recommended, decisionStep: { state: "replaced", replacedBecause } };
}
