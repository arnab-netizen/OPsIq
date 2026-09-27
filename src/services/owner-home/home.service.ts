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
import { coherentStrategyActions, currentStrategyDecision } from "@/services/owner-strategy/decision-view";
import { presentStoredStrategyFinding } from "@/domain/owner-strategy/action-arbitration";
import { getBusiness, hasExactlyOneRealBusiness, listBusinesses } from "@/services/founder-recovery/business.service";
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

  // For domains where verification success triggers re-diagnosis (creating a new cycle),
  // verifications must be queried directly across ALL cycles — not through the newest
  // cycle's action chain — because the old cycle's actions hold the actual verification
  // records and are invisible from the newest cycle. Affected domains: finance, sales,
  // operations, sop, strategy (cashflow and marketing do not trigger re-diagnosis).
  const [finance, recovery, cashflow, sales, operations, sop, marketing, strategy,
    allFinanceVers, allSalesVers, allOperationsVers, allSopVers, allStrategyVers,
    financeSnapshot, complianceItems, singleRealBusiness, previousSnapshots] = await Promise.all([
    db.ownerFinanceCycle.findFirst({ where, ...latest }),
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
    // Missing-critical-data is carried from the finance snapshot the latest cycle diagnosed (never invented).
    db.ownerFinancialSnapshot.findFirst({ where, orderBy: { periodEnd: "desc" }, select: { missingCriticalData: true } }),
    // Business-attributable compliance obligations (a null businessId is attributable only when the
    // workspace holds exactly one real business — filtered below).
    db.ownerComplianceItem.findMany({
      where: { workspaceId, OR: [{ businessId }, { businessId: null }], status: { notIn: ["compliant", "waived"] } },
    }),
    hasExactlyOneRealBusiness(workspaceId),
    // The previous decision (persisted with the Now View snapshot) for "what changed". Some snapshot
    // writers (e.g. the process-execution POST's server-side re-derivation) carry no decision memory,
    // so the most recent snapshot that DOES carry one is used.
    db.ownerGuidanceSnapshot.findMany({ where: { workspaceId, businessId }, orderBy: { createdAt: "desc" }, take: 20, select: { payload: true } }),
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
    allVers: any[] | null,
    findingRows: any[]
  ) => {
    domainScores.push(score);
    for (const f of findingRows) findings.push(rowToFinding(f, domain));
    const evidenceAsOf = cycle.snapshot?.createdAt ? asDate(cycle.snapshot.createdAt) : null;
    const periodEnd = cycle.snapshot?.periodEnd ? asDate(cycle.snapshot.periodEnd) : null;
    const stale = periodEnd !== null && periodEnd.getTime() < staleCutoff;
    if (stale) staleDomains.push(domain);
    // Verifications: across all cycles where the domain re-diagnoses on success; else the latest cycle's.
    const verRows: Array<{ v: any; findingCode: string; title: string }> = allVers
      ? allVers.map((v: any) => ({ v, findingCode: v.action?.findingCode ?? "", title: v.action?.title ?? "" }))
      : actionRows.flatMap((a: any) => (a.verifications ?? []).map((v: any) => ({ v, findingCode: a.findingCode, title: a.title })));
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
    const ctx = { businessId, workspaceId, domain: "recovery" as const, findingsById: new Map(), evidenceAsOf, stale, verifiedFixes: new Map<string, Date>() };
    for (const a of recovery.actions) {
      candidates.push(recoveryActionToCandidate(a, ctx));
      if (a.status === "completed" && a.completedAt) events.push({ kind: "ACTION_COMPLETED", title: a.title, at: asDate(a.completedAt) });
      for (const v of a.verifications ?? []) {
        if (verificationReachedTarget(v)) events.push({ kind: "ACTION_VERIFIED", title: a.title, at: verificationTime(v) });
      }
    }
  }
  if (cashflow) addDomain("cashflow", cashflow, cashflowCycleToDomainScore(cashflow), cashflow.actions, null, cashflow.findings);
  if (sales) addDomain("sales", sales, salesCycleToDomainScore(sales), sales.actions, allSalesVers, sales.findings);
  if (operations) addDomain("operations", operations, operationsCycleToDomainScore(operations), operations.actions, allOperationsVers, operations.findings);
  if (sop) addDomain("sop", sop, sopCycleToDomainScore(sop), sop.actions, allSopVers, sop.findings);
  if (marketing) addDomain("marketing", marketing, marketingCycleToDomainScore(marketing), marketing.actions, null, marketing.findings);
  let strategyContext: OwnerDecisionStrategyContext | null = null;
  if (strategy) {
    // Only the decision's primary step and allowed supporting steps may compete (never a stale
    // "Pursue"/"Proceed" that conflicts with the current decision); the rest are superseded.
    const coherent = coherentStrategyActions(strategy, strategy.actions, now);
    const coherentIds = new Set(coherent.map((a: any) => a.id));
    // Retired "data quality" rows are data gaps, not upside (presentStoredStrategyFinding).
    const strategyFindings = strategy.findings.map((f: any) => presentStoredStrategyFinding(f));
    addDomain("strategy", strategy, strategyCycleToDomainScore(strategy), coherent, allStrategyVers, strategyFindings);
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
    const risks = await db.businessRiskEntry.findMany({
      where: { workspaceId, isFixtureRecord: false, status: { in: ["IDENTIFIED", "ASSESSED", "MITIGATING"] } },
    });
    for (const r of risks) {
      const c = businessRiskToCandidate(r, { businessId, workspaceId });
      if (c) candidates.push(c);
    }
  }

  const missingCriticalData = Array.isArray(financeSnapshot?.missingCriticalData)
    ? (financeSnapshot!.missingCriticalData as unknown[]).filter((m): m is string => typeof m === "string")
    : [];

  const summary = domainScores.length > 0
    ? buildOwnerHomeSummary({ domainScores, findings, verifications, missingCriticalData, now })
    : null;
  const dataSufficiency = summary?.dataSufficiency ?? {
    status: "insufficient" as const, lowestDataConfidenceScore: 0, lowConfidenceDomains: [], missingCriticalData,
  };
  const profile = buildBusinessConditionProfile({ businessId, workspaceId, domainScores, missingCriticalData, now });
  const reassessment = computeReassessmentCadence(profile.survivalRiskScore, profile.executionRiskScore, dataSufficiency.status);

  let previous = null as ReturnType<typeof parseOwnerDecisionMemory>;
  for (const snap of previousSnapshots) {
    previous = parseOwnerDecisionMemory((snap?.payload as any)?.ownerDecision);
    if (previous) break;
  }
  const since = previous ? Date.parse(previous.generatedAt) : null;
  const domainsDiagnosedSince = since === null
    ? []
    : domainScores.filter((d) => asDate(d.generatedAt).getTime() > since).map((d) => d.domain);

  const currentOwnerDecision = resolveOwnerDecision({
    businessId,
    workspaceId,
    candidates,
    diagnosedDomains: domainScores.map((d) => d.domain),
    dataSufficiency,
    staleDomains,
    strategy: strategyContext,
    reassessment,
    previous,
    events,
    domainsDiagnosedSince,
    now,
  });

  return {
    businesses: businessList,
    selectedBusinessId: businessId,
    hasData: domainScores.length > 0,
    domainsWired: domainScores.map((d) => d.domain),
    summary,
    currentOwnerDecision,
  };
}
