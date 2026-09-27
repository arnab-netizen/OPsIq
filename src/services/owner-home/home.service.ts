/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows; explicit any is pragmatic here */
/**
 * Owner Home & Mobile Usability (Module 12) — owner-home service, and the ONE server-side resolver of
 * the owner's current decision.
 *
 * Read-only. Gathers the proven per-domain spine data for a business (domain scores, findings,
 * actions, recorded verifications) and:
 *   1. builds the §19 owner-home summary (health, dangers, risks, opportunities, verified improvement);
 *   2. normalizes every competing source into the Spine's candidate contract — all eight domain
 *      engines' actions, breached/expired compliance obligations, and (only when the workspace holds
 *      exactly one real business) critical owner-recorded risks — and resolves the single canonical
 *      `currentOwnerDecision` with the Spine arbiter (owner-spine/owner-decision.ts).
 * Home, Cockpit, Priorities, the Command Center and Portfolio all render that decision; none of
 * them ranks on its own. Owns no table and mutates nothing; workspace ownership is enforced by the
 * shared Module 1 `getBusiness` guard and every read is workspace- and business-scoped. Reuses the
 * proven Business Condition domain-score mappers — no domain scoring is duplicated here.
 */
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { resolveCashFinanceSignal, type SurvivalLikeState } from "@/domain/owner-guidance/cash-finance-conflict";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { coherentStrategyActions, currentStrategyDecision } from "@/services/owner-strategy/decision-view";
import { presentStoredStrategyFinding } from "@/domain/owner-strategy/action-arbitration";
import { getBusiness, hasExactlyOneRealBusiness, listBusinesses } from "@/services/founder-recovery/business.service";
import { getFixtureTaintedStartupSessionIds } from "@/services/owner-strategy/startup-session.service";
import {
  buildOwnerHomeSummary,
  type OwnerHomeSummary,
  type OwnerHomeVerificationInput,
} from "@/domain/owner-home";
import {
  buildBusinessConditionProfile,
  clampConfidence,
  clampScore,
  type DomainScore,
  type OwnerDomain,
  type OwnerFinding,
} from "@/domain/owner-spine/contracts";
import {
  parseOwnerDecisionMemory,
  resolveOwnerDecision,
  sameOwnerDecisionMemory,
  strategyCandidatePriorityClass,
  type CurrentOwnerDecision,
  type OwnerDecisionCandidate,
  type OwnerDecisionEvent,
  type OwnerDecisionStrategyContext,
} from "@/domain/owner-spine/owner-decision";
import {
  businessRiskToCandidate,
  complianceItemToCandidate,
  domainActionToCandidate,
  OWNER_DECISION_STALE_EVIDENCE_DAYS,
  recoveryActionToCandidate,
  verificationReachedTarget,
  verificationTime,
} from "@/services/owner-home/owner-decision-candidates";
import {
  computeReassessmentCadence,
  financeCycleToDomainScore,
  recoveryCycleToDomainScore,
  cashflowCycleToDomainScore,
  salesCycleToDomainScore,
  operationsCycleToDomainScore,
  sopCycleToDomainScore,
  marketingCycleToDomainScore,
  strategyCycleToDomainScore,
} from "@/services/owner-condition/business-condition.service";

/** Map a persisted finding row to a spine OwnerFinding (attach the domain). */
function rowToFinding(row: any, domain: OwnerDomain): OwnerFinding {
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
    impactScore: clampScore(row.impactScore),
    urgencyScore: clampScore(row.urgencyScore),
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
  snapshot: { select: { createdAt: true, periodEnd: true } },
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

export interface OwnerHomeResult {
  businesses: Array<{ id: string; name: string; businessType: string; currency: string; isActive: boolean }>;
  selectedBusinessId: string | null;
  hasData: boolean;
  domainsWired: string[];
  summary: OwnerHomeSummary | null;
  /**
   * The ONE canonical owner decision for the selected business (null only when no business is
   * selected). Every owner surface renders this; none elects its own "#1".
   */
  currentOwnerDecision: CurrentOwnerDecision | null;
}

const SAFE_SURVIVAL_STATES = new Set<SurvivalLikeState>(["SAFE", "WATCH"]);

type DomainKey = "finance" | "cashflow" | "sales" | "operations" | "sop" | "marketing" | "strategy";

/**
 * Build the §19 owner-home summary and the canonical owner decision for a business (or the owner's
 * only business). Deterministic and honest: no domain data ⇒ no summary and a NO_EVIDENCE decision.
 */
export async function getOwnerHome(
  workspaceId: string,
  requestedBusinessId?: string | null,
  opts: { now?: Date } = {}
): Promise<OwnerHomeResult> {
  const now = opts.now ?? new Date();
  const businesses = await listBusinesses(workspaceId);
  const businessList = businesses.map((b: any) => ({
    id: b.id, name: b.name, businessType: b.businessType, currency: b.currency, isActive: b.isActive,
  }));

  let selectedBusinessId: string | null = null;
  if (requestedBusinessId && businesses.find((b: any) => b.id === requestedBusinessId)) {
    selectedBusinessId = requestedBusinessId;
  }
  // Unambiguous only when exactly one real business exists — see hasExactlyOneRealBusiness()
  // and owner-home/home.service.ts for the same rule. With 0 businesses this falls
  // through to the existing empty-state return below; with 2+, it now also falls through
  // (selectedBusinessId stays null) rather than silently guessing businesses[0] — the exact
  // server-side "wrong business" mechanism the controlled-beta launch-blocker audit flagged.
  if (!selectedBusinessId && businesses.length === 1) selectedBusinessId = businesses[0].id;

  if (!selectedBusinessId) {
    return { businesses: businessList, selectedBusinessId: null, hasData: false, domainsWired: [], summary: null, currentOwnerDecision: null };
  }
  const businessId = selectedBusinessId;

  await getBusiness(businessId, workspaceId); // ownership guard
  const where = { businessId, workspaceId };
  const latest = { orderBy: { sequenceNumber: "desc" as const }, include: spineCycleInclude };

  // Every domain re-diagnoses when a verification reaches its target (creating a new cycle from the
  // same snapshot), so verifications are queried directly across ALL cycles — not through the
  // newest cycle's action chain — because the old cycle's actions hold the actual verification
  // records and are invisible from the newest cycle. (Finance, sales, operations, sop, strategy,
  // cashflow, marketing and recovery all re-diagnose on a target-reached verification.)
  const [finance, recovery, cashflow, sales, operations, sop, marketing, strategy,
    allFinanceVers, allSalesVers, allOperationsVers, allSopVers, allStrategyVers,
    complianceItems, singleRealBusiness, decisionHistory,
    allCashflowVers, allMarketingVers, allRecoveryVers] = await Promise.all([
    // Finance also needs its snapshot's amendment state: an amended (superseded) snapshot means the
    // latest diagnosis is based on figures the owner has since corrected.
    db.ownerFinanceCycle.findFirst({
      where,
      orderBy: { sequenceNumber: "desc" },
      include: { ...spineCycleInclude, snapshot: { select: { createdAt: true, periodEnd: true, supersededById: true, missingCriticalData: true } } },
    }),
    db.recoveryCycle.findFirst({
      where,
      orderBy: { cycleNumber: "desc" },
      include: {
        snapshot: true,
        findings: { select: { code: true, severity: true, confidence: true } },
        actions: {
          include: { finding: { select: { code: true, severity: true } }, verifications: { orderBy: { createdAt: "desc" } } },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    db.ownerCashflowCycle.findFirst({ where, ...latest }),
    db.ownerSalesCycle.findFirst({ where, ...latest }),
    db.ownerOperationsCycle.findFirst({ where, ...latest }),
    db.ownerSopCycle.findFirst({ where, ...latest }),
    db.ownerMarketingCycle.findFirst({ where, ...latest }),
    // Strategy needs its evaluated snapshot: its actions are arbitrated against the current decision.
    db.ownerStrategyCycle.findFirst({ where, ...latest, include: { ...spineCycleInclude, snapshot: true } }),
    db.ownerFinanceVerification.findMany({ where, include: verificationInclude, orderBy: { createdAt: "desc" } }),
    db.ownerSalesVerification.findMany({ where, include: verificationInclude, orderBy: { createdAt: "desc" } }),
    db.ownerOperationsVerification.findMany({ where, include: verificationInclude, orderBy: { createdAt: "desc" } }),
    db.ownerSopVerification.findMany({ where, include: verificationInclude, orderBy: { createdAt: "desc" } }),
    db.ownerStrategyVerification.findMany({ where, include: verificationInclude, orderBy: { createdAt: "desc" } }),
    // Business-attributable compliance obligations (a null businessId is attributable only when the
    // workspace holds exactly one real business — filtered below).
    db.ownerComplianceItem.findMany({
      where: { workspaceId, OR: [{ businessId }, { businessId: null }], status: { notIn: ["compliant", "waived"] } },
    }),
    hasExactlyOneRealBusiness(workspaceId),
    // Decision memory for "what changed": the resolver's own OWNER_DECISION_CHANGED audit trail for
    // this business (written below whenever the decision materially changes, on ANY route).
    db.auditEvent.findMany({
      where: { workspaceId, eventName: AUDIT_EVENTS.OWNER_DECISION_CHANGED, entityType: "OwnerBusiness", entityId: businessId },
      orderBy: { occurredAt: "desc" },
      take: 5,
      select: { payload: true },
    }),
    db.ownerCashflowVerification.findMany({ where, include: verificationInclude, orderBy: { createdAt: "desc" } }),
    db.ownerMarketingVerification.findMany({ where, include: verificationInclude, orderBy: { createdAt: "desc" } }),
    // RecoveryVerification has no businessId column: scope through its action's business.
    db.recoveryVerification.findMany({
      where: { workspaceId, action: { businessId, workspaceId } },
      include: { action: { select: { title: true, targetValue: true, metricToMove: true, finding: { select: { code: true } } } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const domainScores: DomainScore[] = [];
  const findings: OwnerFinding[] = [];
  const verifications: OwnerHomeVerificationInput[] = [];
  const candidates: OwnerDecisionCandidate[] = [];
  const events: OwnerDecisionEvent[] = [];
  const staleDomains: string[] = [];
  const staleCutoff = now.getTime() - OWNER_DECISION_STALE_EVIDENCE_DAYS * 86_400_000;

  const pushVerification = (domain: OwnerDomain, v: any, actionTitle: string) => {
    verifications.push({
      domain,
      actionTitle,
      metric: v.verificationMetric,
      beforeValue: v.beforeValue ?? null,
      afterValue: v.afterValue ?? null,
      status: v.status,
      verifiedAt: asDate(v.createdAt),
    });
    if (verificationReachedTarget(v)) events.push({ kind: "ACTION_VERIFIED", title: actionTitle, at: verificationTime(v) });
  };

  /** Latest target-reached verification per finding code (from a list of verification rows). */
  const fixesFrom = (rows: Array<{ v: any; findingCode: string }>): Map<string, Date> => {
    const m = new Map<string, Date>();
    for (const { v, findingCode } of rows) {
      if (!verificationReachedTarget(v)) continue;
      const at = verificationTime(v);
      const prev = m.get(findingCode);
      if (!prev || at > prev) m.set(findingCode, at);
    }
    return m;
  };

  const addDomain = (
    domain: DomainKey,
    cycle: any,
    score: DomainScore,
    actionRows: any[],
    allVers: any[],
    findingRows: any[]
  ) => {
    domainScores.push(score);
    for (const f of findingRows) findings.push(rowToFinding(f, domain));
    const evidenceAsOf = cycle.snapshot?.createdAt ? asDate(cycle.snapshot.createdAt) : null;
    const periodEnd = cycle.snapshot?.periodEnd ? asDate(cycle.snapshot.periodEnd) : null;
    // Stale: the evidence period is old, or (Finance) the diagnosed snapshot has since been amended.
    const stale = (periodEnd !== null && periodEnd.getTime() < staleCutoff) || Boolean(cycle.snapshot?.supersededById);
    if (stale) staleDomains.push(domain);
    const verRows: Array<{ v: any; findingCode: string; title: string }> = allVers.map((v: any) => ({
      v, findingCode: v.action?.findingCode ?? "", title: v.action?.title ?? "",
    }));
    for (const r of verRows) pushVerification(domain, r.v, r.title);
    const ctx = {
      businessId,
      workspaceId,
      domain,
      findingsById: new Map<string, any>((cycle.findings ?? []).map((f: any) => [String(f.id), f])),
      evidenceAsOf,
      stale,
      verifiedFixes: fixesFrom(verRows),
    };
    for (const a of actionRows) {
      candidates.push(domainActionToCandidate(a, ctx));
      if (a.status === "completed" && a.completedAt) events.push({ kind: "ACTION_COMPLETED", title: a.title, at: asDate(a.completedAt) });
    }
  };

  if (finance) addDomain("finance", finance, financeCycleToDomainScore(finance), finance.actions, allFinanceVers, finance.findings);
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
    const recoveryVerRows = allRecoveryVers.map((v: any) => ({
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
      candidates.push(recoveryActionToCandidate({ ...a, verifications: (a.verifications ?? []).map((v: any) => ({ ...v, targetValue })) }, ctx));
      if (a.status === "completed" && a.completedAt) events.push({ kind: "ACTION_COMPLETED", title: a.title, at: asDate(a.completedAt) });
    }
  }
  if (cashflow) addDomain("cashflow", cashflow, cashflowCycleToDomainScore(cashflow), cashflow.actions, allCashflowVers, cashflow.findings);
  // Cash triage and Finance diagnosis can go stale relative to each other. The SAME arbitration
  // Now View applies (resolveCashFinanceSignal) decides which survival reading is current: a
  // survival-class action from a reading superseded by a NEWER, disagreeing reading of the other
  // source must not win the election. Incomparable freshness fails safe (nothing is excluded).
  if (cashflow && finance) {
    const cashFinance = resolveCashFinanceSignal(
      { state: (cashflow.cashflowState as SurvivalLikeState | null) ?? null, generatedAt: asDate(cashflow.createdAt) },
      { state: (finance.survivalState as SurvivalLikeState | null) ?? null, generatedAt: asDate(finance.createdAt) }
    );
    const supersededDomain = cashFinance.supersededSource === "cash" ? "cashflow" : cashFinance.supersededSource === "finance" ? "finance" : null;
    if (supersededDomain && cashFinance.supersededState && !SAFE_SURVIVAL_STATES.has(cashFinance.supersededState)) {
      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        if (c.domain === supersededDomain && c.priorityClass === "SURVIVAL_CASH" && !c.exclusion) {
          candidates[i] = { ...c, exclusion: "superseded" };
        }
      }
    }
  }
  if (sales) addDomain("sales", sales, salesCycleToDomainScore(sales), sales.actions, allSalesVers, sales.findings);
  if (operations) addDomain("operations", operations, operationsCycleToDomainScore(operations), operations.actions, allOperationsVers, operations.findings);
  if (sop) addDomain("sop", sop, sopCycleToDomainScore(sop), sop.actions, allSopVers, sop.findings);
  if (marketing) addDomain("marketing", marketing, marketingCycleToDomainScore(marketing), marketing.actions, allMarketingVers, marketing.findings);
  let strategyContext: OwnerDecisionStrategyContext | null = null;
  if (strategy) {
    // Only the decision's primary step and allowed supporting steps may compete (never a stale
    // "Pursue"/"Proceed" that conflicts with the current decision); the rest are superseded.
    const coherent = coherentStrategyActions(strategy, strategy.actions, now);
    const coherentIds = new Set(coherent.map((a: any) => a.id));
    // Retired "data quality" rows are data gaps, not upside (presentStoredStrategyFinding).
    const strategyFindings = strategy.findings.map((f: any) => presentStoredStrategyFinding(f));
    const strategyStart = candidates.length;
    addDomain("strategy", strategy, strategyCycleToDomainScore(strategy), coherent, allStrategyVers, strategyFindings);
    // Strategy precedence comes from its RESOLVED five-state decision and blocker, not the code alone.
    const strategyDecisionCode = currentStrategyDecision(strategy, now)?.code ?? null;
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
    const decision = currentStrategyDecision(strategy, now);
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

  // Control sources (business-attributable only; see owner-decision-candidates.ts).
  for (const item of complianceItems) {
    if (item.businessId === null && !singleRealBusiness) continue;
    const c = complianceItemToCandidate(item, { businessId, workspaceId, now });
    if (c) candidates.push(c);
  }
  if (singleRealBusiness) {
    // Same read-time fixture correction Now View's topRisks and listBusinessRisks apply: a QA
    // blueprint's risk (including historical rows whose isFixtureRecord was wrongly persisted as
    // false, linked to a fixture startup session) must never become a real owner's main target.
    const fixtureTaintedSessionIds = await getFixtureTaintedStartupSessionIds(workspaceId);
    const fixtureSessionExclusion = fixtureTaintedSessionIds.length > 0
      ? { OR: [{ linkedStartupSessionId: null }, { linkedStartupSessionId: { notIn: fixtureTaintedSessionIds } }] }
      : {};
    const risks = await db.businessRiskEntry.findMany({
      where: { workspaceId, isFixtureRecord: false, status: { in: ["IDENTIFIED", "ASSESSED", "MITIGATING"] }, ...fixtureSessionExclusion },
    });
    for (const r of risks) {
      const c = businessRiskToCandidate(r, { businessId, workspaceId });
      if (c) candidates.push(c);
    }
  }

  // Missing-critical-data comes from the EXACT snapshot the latest Finance diagnosis ran on — never
  // inferred from whichever snapshot has the latest period (a later, undiagnosed snapshot does not
  // describe the diagnosis being arbitrated). No Finance diagnosis ⇒ nothing is claimed.
  const missingCriticalData = Array.isArray(finance?.snapshot?.missingCriticalData)
    ? (finance!.snapshot!.missingCriticalData as unknown[]).filter((m): m is string => typeof m === "string")
    : [];

  const summary = domainScores.length > 0
    ? buildOwnerHomeSummary({ domainScores, findings, verifications, missingCriticalData, now })
    : null;
  const dataSufficiency = summary?.dataSufficiency ?? {
    status: "insufficient" as const, lowestDataConfidenceScore: 0, lowConfidenceDomains: [], missingCriticalData,
  };
  const profile = buildBusinessConditionProfile({ businessId, workspaceId, domainScores, missingCriticalData, now });
  const reassessment = computeReassessmentCadence(
    profile.survivalRiskScore,
    profile.executionRiskScore,
    dataSufficiency.status === "sufficient" && staleDomains.length > 0 ? "caution" : dataSufficiency.status
  );

  const decisionInput = {
    businessId,
    workspaceId,
    candidates,
    diagnosedDomains: domainScores.map((d) => d.domain),
    dataSufficiency,
    staleDomains,
    strategy: strategyContext,
    reassessment,
    events,
    now,
  };
  // "What changed" compares against the previous DISTINCT decision recorded for this business, so the
  // answer is the same on Home, Cockpit, Priorities or the Command Center and on every re-read.
  const memories = decisionHistory
    .map((e: any) => parseOwnerDecisionMemory(e?.payload?.memory))
    .filter((m: ReturnType<typeof parseOwnerDecisionMemory>): m is NonNullable<typeof m> => m !== null);
  const currentMemory = resolveOwnerDecision({ ...decisionInput, previous: null, domainsDiagnosedSince: [] }).memory;
  const previous = memories.find((m: NonNullable<ReturnType<typeof parseOwnerDecisionMemory>>) => !sameOwnerDecisionMemory(m, currentMemory)) ?? null;
  const since = previous ? Date.parse(previous.generatedAt) : null;
  const domainsDiagnosedSince = since === null
    ? []
    : domainScores.filter((d) => asDate(d.generatedAt).getTime() > since).map((d) => d.domain);
  const currentOwnerDecision = resolveOwnerDecision({ ...decisionInput, previous, domainsDiagnosedSince });

  // Record the decision when it materially changed (or is the first one): an auditable trail of what
  // OpsIQ told the owner, and the memory above. Best-effort — a failed write never breaks the read.
  const latestMemory = memories[0] ?? null;
  if (!latestMemory || !sameOwnerDecisionMemory(latestMemory, currentOwnerDecision.memory)) {
    try {
      await emitAuditEvent({
        eventName: AUDIT_EVENTS.OWNER_DECISION_CHANGED,
        actorType: "system",
        workspaceId,
        entityType: "OwnerBusiness",
        entityId: businessId,
        payload: {
          memory: currentOwnerDecision.memory,
          state: currentOwnerDecision.state,
          primaryCandidateId: currentOwnerDecision.primaryCandidateId,
          primaryTitle: currentOwnerDecision.primaryTarget?.title ?? null,
          priorityClass: currentOwnerDecision.primaryTarget?.priorityClass ?? null,
        },
      });
    } catch {
      // The decision is still correct and returned; only its change history misses this entry.
    }
  }

  return {
    businesses: businessList,
    selectedBusinessId: businessId,
    hasData: domainScores.length > 0,
    domainsWired: domainScores.map((d) => d.domain),
    summary,
    currentOwnerDecision,
  };
}
