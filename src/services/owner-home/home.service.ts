/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows; explicit any is pragmatic here */
/**
 * Owner Home & Mobile Usability (Module 12) — owner-home service, and the ONE server-side resolver of
 * the owner's current decision.
 *
 * Read-only. Gathers the proven per-domain spine data for a business (domain scores, findings,
 * actions, recorded verifications) and:
 *   1. builds the §19 owner-home summary (health, dangers, risks, opportunities, verified improvement);
 *   2. normalizes every competing source into the Spine's candidate contract — all eight domain
 *      engines' actions, breached/expired compliance obligations (a business-less one in a multi-business
 *      workspace as an attribution request, never a block), and (only when the workspace holds exactly one
 *      real business) critical owner-recorded risks — and resolves the single canonical
 *      `currentOwnerDecision` with the Spine arbiter (owner-spine/owner-decision.ts).
 * Home, Cockpit, Priorities, the Command Center and Portfolio all render that decision; none of
 * them ranks on its own. Owns no table and mutates nothing; workspace ownership is enforced by the
 * shared Module 1 `getBusiness` guard and every read is workspace- and business-scoped. Reuses the
 * proven Business Condition domain-score mappers — no domain scoring is duplicated here.
 */
import { db } from "@/lib/db";
import { getBusiness, hasExactlyOneRealBusiness, listBusinesses } from "@/services/founder-recovery/business.service";
import { getFixtureTaintedStartupSessionIds } from "@/services/owner-strategy/startup-session.service";
import { buildOwnerHomeSummary, type OwnerHomeSummary } from "@/domain/owner-home";
import { buildBusinessConditionProfile, ownerSeverityRank, type OwnerSeverity } from "@/domain/owner-spine/contracts";
import { classifyOwnerFindingCode, financeSurvivalDriver, resolveOwnerDecision, type CurrentOwnerDecision } from "@/domain/owner-spine/owner-decision";
import { businessRiskToCandidate, complianceItemToCandidate, toOwnerSeverity, unattributedComplianceItemToCandidate } from "@/services/owner-home/owner-decision-candidates";
import { loadOwnerGateConstraints } from "@/services/owner-mode/owner-action-gate.service";
import type { OwnerGateConstraints } from "@/domain/owner-mode/owner-action-gate-policy";
import { buildOwnerSpineCandidates, loadOwnerSpineEvidence } from "@/services/owner-home/owner-candidate-builder";
import { currentCashFinanceReading } from "@/services/owner-spine/current-cash-finance-reading";
import { gatherOwnerChangeFacts } from "@/services/owner-home/owner-change-facts";
import { computeReassessmentCadence } from "@/services/owner-condition/business-condition.service";

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
  /** The review cadence the canonical decision was resolved with; null when there is no business. */
  reassessment?: { days: number; reason: string } | null;
}

/**
 * Build the §19 owner-home summary and the canonical owner decision for a business (or the owner's
 * only business). Deterministic and honest: no domain data ⇒ no summary and a NO_EVIDENCE decision.
 */
export async function getOwnerHome(
  workspaceId: string,
  requestedBusinessId?: string | null,
  opts: { now?: Date } = {}
): Promise<OwnerHomeResult> {
  return (await resolveOwnerHome(workspaceId, requestedBusinessId, opts)).home;
}

/**
 * getOwnerHome plus the owner action gate's constraints the canonical decision was resolved with (null when
 * no business is selected) — for surfaces that must describe the decision against the SAME constraints
 * (Now View: growth readiness and the do-not-repeat annotation). Server-side only: the constraints are never
 * part of the Home payload.
 */
export async function resolveOwnerHome(
  workspaceId: string,
  requestedBusinessId?: string | null,
  opts: { now?: Date } = {}
): Promise<{ home: OwnerHomeResult; gate: OwnerGateConstraints | null }> {
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
    return { home: { businesses: businessList, selectedBusinessId: null, hasData: false, domainsWired: [], summary: null, currentOwnerDecision: null, reassessment: null }, gate: null };
  }
  const businessId = selectedBusinessId;

  await getBusiness(businessId, workspaceId); // ownership guard

  // Spine evidence → canonical candidates: the SAME builder every domain page's local step uses.
  const [evidence, complianceItems, singleRealBusiness, gate] = await Promise.all([
    loadOwnerSpineEvidence(workspaceId, businessId, now),
    // This business's compliance obligations and the business-less ones (a null businessId is attributable
    // only when the workspace holds exactly one real business; otherwise it is surfaced for attribution —
    // below). Terminal items raise nothing.
    db.ownerComplianceItem.findMany({
      where: { workspaceId, OR: [{ businessId }, { businessId: null }], status: { notIn: ["compliant", "waived"] } },
    }),
    hasExactlyOneRealBusiness(workspaceId),
    // The owner action gate's constraints for this business: the decision never elects a step the gate
    // would refuse at this state (canonicalEligibility); the gate still re-checks at mutation time.
    loadOwnerGateConstraints(workspaceId, businessId, { db: db as never, now: () => now }),
  ]);
  const build = buildOwnerSpineCandidates(evidence, { businessId, workspaceId, now });
  const { domainScores, findings, verifications, staleDomains, survivalReadings, missingCriticalData } = build;
  const candidates = [...build.candidates];

  // Control sources (business-attributable only; see owner-decision-candidates.ts).
  let unassignedCritical = 0;
  for (const item of complianceItems) {
    const c = complianceItemToCandidate(item, { businessId, workspaceId, now });
    if (item.businessId === null) {
      if (c?.blocking) unassignedCritical++;
      if (!singleRealBusiness) {
        // Several businesses: applicability of a business-less item is unknown — surfaced for attribution,
        // never silently blocking this business (the gate does not attribute it either).
        const u = unattributedComplianceItemToCandidate(item, { businessId, workspaceId, now });
        if (u) candidates.push(u);
        continue;
      }
    }
    if (c) candidates.push(c);
  }
  // Same read-time fixture correction Now View's topRisks and listBusinessRisks apply: a QA blueprint's
  // risk (including historical rows whose isFixtureRecord was wrongly persisted as false, linked to a
  // fixture startup session) must never become a real owner's main target. BusinessRiskEntry has no
  // businessId: risks compete only while the workspace holds exactly one real business.
  const fixtureTaintedSessionIds = await getFixtureTaintedStartupSessionIds(workspaceId);
  const fixtureSessionExclusion = fixtureTaintedSessionIds.length > 0
    ? { OR: [{ linkedStartupSessionId: null }, { linkedStartupSessionId: { notIn: fixtureTaintedSessionIds } }] }
    : {};
  const risks = await db.businessRiskEntry.findMany({
    where: { workspaceId, isFixtureRecord: false, ...fixtureSessionExclusion },
    select: {
      id: true, title: true, description: true, category: true, status: true, severity: true, residualRisk: true,
      likelihood: true, impact: true, mitigationAction: true, isFixtureRecord: true, updatedAt: true,
    },
  });
  let openCriticalRisks = 0;
  for (const r of risks) {
    const c = businessRiskToCandidate(r, { businessId, workspaceId });
    if (!c) continue;
    openCriticalRisks++;
    if (singleRealBusiness) candidates.push(c);
  }

  const summaryInput = { domainScores, findings, verifications, missingCriticalData, staleDomains, now };
  const baseSummary = domainScores.length > 0 ? buildOwnerHomeSummary(summaryInput) : null;
  const dataSufficiency = baseSummary?.dataSufficiency ?? {
    status: "insufficient" as const, lowestDataConfidenceScore: 0, lowConfidenceDomains: [], missingCriticalData,
  };
  const profile = buildBusinessConditionProfile({ businessId, workspaceId, domainScores, missingCriticalData, now });
  const reassessment = computeReassessmentCadence(
    profile.survivalRiskScore,
    profile.executionRiskScore,
    dataSufficiency.status === "sufficient" && staleDomains.length > 0 ? "caution" : dataSufficiency.status
  );

  // "What changed" from persisted mutation facts only — this read writes nothing.
  const evidencePeriodEnds: Record<string, Date | null> = {};
  const evidenceAsOf: Record<string, Date | null> = {};
  for (const [domain, cycle] of Object.entries({
    finance: evidence.finance, cashflow: evidence.cashflow, sales: evidence.sales, operations: evidence.operations,
    sop: evidence.sop, marketing: evidence.marketing, strategy: evidence.strategy, recovery: evidence.recovery,
  })) {
    if (!cycle) continue;
    evidencePeriodEnds[domain] = cycle.snapshot?.periodEnd ? new Date(cycle.snapshot.periodEnd as string | Date) : null;
    evidenceAsOf[domain] = cycle.snapshot?.createdAt ? new Date(cycle.snapshot.createdAt as string | Date) : null;
  }
  const changeFacts = await gatherOwnerChangeFacts({
    workspaceId,
    businessId,
    now,
    events: build.events,
    evidencePeriodEnds,
    businesses: businesses.filter((b: any) => !b.isFixtureBusiness).map((b: any) => ({ id: b.id, createdAt: b.createdAt })),
    workspaceIssuesAttributable: singleRealBusiness,
    fixtureTaintedStartupSessionIds: fixtureTaintedSessionIds,
    currentDiagnoses: {
      finance: evidence.finance, cashflow: evidence.cashflow, sales: evidence.sales, operations: evidence.operations,
      sop: evidence.sop, marketing: evidence.marketing, strategy: evidence.strategy, recovery: evidence.recovery,
    },
    openWorkspaceCriticalCount: openCriticalRisks + unassignedCritical,
  });

  const currentOwnerDecision = resolveOwnerDecision({
    businessId,
    workspaceId,
    candidates,
    diagnosedDomains: domainScores.map((d) => d.domain),
    dataSufficiency,
    staleDomains,
    futureDomains: build.futureDomains,
    provisionalDomains: build.provisionalDomains,
    strategy: build.strategyContext,
    reassessment,
    changeFacts,
    gate,
    now,
  });

  // Danger cards: cash position only on the cash card (Cash flow, or Finance's own cash-survival findings
  // when Cash flow has no current reading); Finance's overall risk is its own card with provenance.
  const cashReading = survivalReadings.find((r) => r.domain === "cashflow") ?? null;
  const financeReading = survivalReadings.find((r) => r.domain === "finance") ?? null;
  const financeCash = financeReading && !financeReading.superseded ? mostSevereCashFinding(financeReading.findings) : null;
  const financeCashSignal = financeCash ? { ...financeCash, current: !financeReading!.stale } : null;
  // The ONE current cash/finance reading (same as Now View and the gates): a genuine, incomparable
  // disagreement is shown on the cash card as a conflict, never resolved by picking one side.
  const cashFinance = currentCashFinanceReading(
    evidence.cashflow ? { state: evidence.cashflow.cashflowState as string | null, snapshot: evidence.cashflow.snapshot } : null,
    evidence.finance ? { state: evidence.finance.survivalState as string | null, snapshot: evidence.finance.snapshot } : null,
    now.getTime()
  );
  // A disagreement is shown on the CASH card only when Finance's own findings are about cash; a
  // profit-driven Finance state is Finance's own card (with its provenance), never a cash conflict.
  const financeProfitDriven = financeSurvivalDriver(evidence.finance?.findings) === "profit";
  const cashFinanceConflict = cashFinance.conflicting && cashFinance.cashState && cashFinance.financeState && !financeProfitDriven
    ? { cashState: cashFinance.cashState, financeState: cashFinance.financeState }
    : null;
  const summary = baseSummary
    ? buildOwnerHomeSummary({
        ...summaryInput,
        evidenceAsOf,
        cashflowSuperseded: Boolean(cashReading?.superseded),
        financeSuperseded: Boolean(financeReading?.superseded),
        financeCashSignal,
        cashFinanceConflict,
        // The in-progress period's reading tightens the cash card only when it decides the gate's state (the
        // SAME shared reading the gate enforces), labelled as in progress.
        // Named by what drives it (gateDriver): a cash driver tightens the CASH card; a profit/margin-driven
        // Finance state tightens the FINANCIAL card (never shown as cash danger); unverified figures fabricate
        // no level (the canonical decision asks for them to be confirmed).
        provisionalCash: gate.cash.provisional && gate.cash.gateState && gate.cash.driver === "cash"
          ? { state: gate.cash.gateState, source: gate.cash.source === "finance" ? "finance" : "cashflow" }
          : null,
        provisionalFinancial: gate.cash.provisional && gate.cash.gateState && gate.cash.driver === "finance_profit"
          ? { state: gate.cash.gateState }
          : null,
      })
    : null;

  return {
    home: {
      businesses: businessList,
      selectedBusinessId: businessId,
      hasData: domainScores.length > 0,
      domainsWired: domainScores.map((d) => d.domain),
      summary,
      currentOwnerDecision,
      // The review cadence the canonical decision was resolved with (the single cadence surfaces show).
      reassessment,
    },
    gate,
  };
}

/** The most severe cash-survival (SURVIVAL_CASH-class) finding of a Finance diagnosis, or null. */
function mostSevereCashFinding(rows: readonly any[]): { severity: OwnerSeverity; title: string } | null {
  let best: { severity: OwnerSeverity; title: string } | null = null;
  for (const f of rows) {
    if (typeof f?.code !== "string" || classifyOwnerFindingCode(f.code) !== "SURVIVAL_CASH") continue;
    const severity = toOwnerSeverity(f.severity);
    if (!severity) continue;
    if (!best || ownerSeverityRank(severity) > ownerSeverityRank(best.severity)) best = { severity, title: String(f.title ?? f.code) };
  }
  return best;
}
