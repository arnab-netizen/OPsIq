/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows; explicit any is pragmatic here */
/**
 * Owner Strategy & Scenario Planning (Module 8) — owner-strategy dashboard service.
 *
 * Assembles the aggregated owner-strategy payload from persisted real data:
 * businesses, selected business, latest scenario, latest cycle (findings + actions
 * + verifications), the strategy domain score, the recommended next action, and
 * missing-critical-data. Returns an explicit empty state. Reads persisted data
 * only — no mock, nothing invented.
 */
import { db } from "@/lib/db";
import { listBusinesses, getBusiness } from "@/services/founder-recovery/business.service";
import { withMeasuredBaseline } from "@/domain/founder-recovery/verification-evidence";
import { ENGAGED_ACTION_STATUSES } from "@/domain/founder-recovery/action-continuity";
import type { StrategyDecision } from "@/domain/owner-strategy/decision";
import { arbitrateStrategyActionRows, orderByDecisionFit, presentStoredStrategyFinding, withoutRetiredStrategyActions } from "@/domain/owner-strategy/action-arbitration";
import { currentStrategyDecision } from "./decision-view";
import { rankOwnerFindingsBySeverity } from "@/domain/owner-spine/contracts";

const TERMINAL_STATUSES = new Set(["completed", "cancelled"]);

export interface StrategyDashboardPayload {
  businesses: Array<{ id: string; name: string; businessType: string; currency: string; isActive: boolean }>;
  selectedBusinessId: string | null;
  hasData: boolean;
  latestSnapshot: any | null;
  latestCycle: any | null;
  domainScore: {
    domain: "strategy";
    healthScore: number;
    riskScore: number;
    opportunityScore: number;
    dataConfidenceScore: number;
    strategyState: string;
  } | null;
  recommendedNextAction: any | null;
  /** The current decision for the latest evaluation (derived on read, not persisted). */
  decision: StrategyDecision | null;
  missingCriticalData: string[];
  cycleHistory: Array<{
    id: string;
    sequenceNumber: number;
    strategyState: string;
    verdictSource: "stored_legacy_state";
    healthScore: number;
    findingCount: number;
    actionCount: number;
    createdAt: string;
  }>;
}

export async function getStrategyDashboard(
  workspaceId: string,
  requestedBusinessId?: string | null
): Promise<StrategyDashboardPayload> {
  const businesses = await listBusinesses(workspaceId);
  const businessList = businesses.map((b: any) => ({
    id: b.id, name: b.name, businessType: b.businessType, currency: b.currency, isActive: b.isActive,
  }));

  let selectedBusinessId: string | null = null;
  if (requestedBusinessId) {
    const owned = businesses.find((b: any) => b.id === requestedBusinessId);
    if (owned) selectedBusinessId = owned.id;
  }
  // Unambiguous only when exactly one real business exists — see hasExactlyOneRealBusiness()
  // and cockpit-finance-priority.service.ts for the same rule. With 0 businesses this falls
  // through to the existing empty-state return below; with 2+, it now also falls through
  // (selectedBusinessId stays null) rather than silently guessing businesses[0] — the exact
  // server-side "wrong business" mechanism the controlled-beta launch-blocker audit flagged.
  if (!selectedBusinessId && businesses.length === 1) selectedBusinessId = businesses[0].id;

  if (!selectedBusinessId) {
    return {
      businesses: businessList, selectedBusinessId: null, hasData: false, latestSnapshot: null,
      latestCycle: null, domainScore: null, recommendedNextAction: null, decision: null, missingCriticalData: [],
      cycleHistory: [],
    };
  }

  await getBusiness(selectedBusinessId, workspaceId); // ownership guard

  const [latestSnapshot, latestCycle, cycles] = await Promise.all([
    db.ownerStrategySnapshot.findFirst({
      where: { businessId: selectedBusinessId, workspaceId },
      orderBy: { periodEnd: "desc" },
    }),
    db.ownerStrategyCycle.findFirst({
      where: { businessId: selectedBusinessId, workspaceId },
      orderBy: { sequenceNumber: "desc" },
      include: {
        snapshot: true,
        findings: { orderBy: { severity: "asc" } },
        actions: {
          include: {
            verifications: { orderBy: { createdAt: "desc" } },
            // Measured baseline for outcome verification (prefill + provenance display).
            finding: { select: { sourceMetric: true, sourceValue: true } },
          },
          // Deterministic total order -- see owner-sales/dashboard.service.ts
          // for the full incident writeup. priorityScore ties at the [0,100]
          // clamp ceiling are real and expected; a single-key orderBy has no
          // guaranteed return order for tied rows, so an unrelated UPDATE
          // (e.g. Assign) can silently reorder the owner-visible list on the
          // very next read. `id` terminates the chain because
          // rankOwnerActions()'s own comparator (contracts.ts) is not
          // itself a total order (OwnerAction.id is optional there).
          orderBy: [
            { priorityScore: "desc" },
            { expectedImpactScore: "desc" },
            { confidence: "desc" },
            { findingCode: "asc" },
            { title: "asc" },
            { id: "asc" },
          ],
        },
      },
    }),
    db.ownerStrategyCycle.findMany({
      where: { businessId: selectedBusinessId, workspaceId },
      orderBy: { sequenceNumber: "desc" },
      include: { findings: { select: { id: true } }, actions: { select: { id: true } } },
    }),
  ]);

  // Each action carries the value the diagnosis measured for its verification
  // metric (null when not measured) — the baseline an outcome is compared to.
  // Engaged actions are re-attached to the new cycle when the diagnosis plans them again
  // (action-continuity.ts). Engaged actions left on an earlier cycle are still shown (after
  // current actions, flagged when the latest diagnosis no longer raises their finding) until
  // finished or cancelled.
  const carriedActions = latestCycle
    ? await db.ownerStrategyAction.findMany({
        where: {
          businessId: selectedBusinessId,
          workspaceId,
          cycleId: { not: latestCycle.id },
          status: { in: [...ENGAGED_ACTION_STATUSES] },
        },
        include: {
          verifications: { orderBy: { createdAt: "desc" } },
          finding: { select: { sourceMetric: true, sourceValue: true } },
          cycle: { select: { sequenceNumber: true } },
        },
        orderBy: [{ priorityScore: "desc" }, { id: "asc" }],
      })
    : [];
  // The current decision (derived from the evaluated snapshot, not persisted — decision-view.ts).
  // Every action, current or carried from an earlier cycle, is arbitrated against it: exactly one
  // open action is the primary step; steps that conflict with the decision (e.g. a carried
  // "Pursue" when the decision is "Not yet") are shown on hold, never as a recommendation.
  const decision = latestCycle ? currentStrategyDecision(latestCycle) : null;
  const allActions: any[] = latestCycle
    ? [
        ...latestCycle.actions.map(withMeasuredBaseline),
        ...carriedActions.map((a: { verificationMetric: string; findingCode: string; cycle: { sequenceNumber: number } }) => ({
          ...withMeasuredBaseline(a),
          carriedFromCycleSequence: a.cycle.sequenceNumber,
          // false when the latest diagnosis no longer raises this finding (finish or cancel it).
          stillFlaggedByLatestDiagnosis: latestCycle.findings.some((f: { code: string }) => f.code === a.findingCode),
        })),
      ]
    : [];
  const arbitratedActions: any[] = decision ? orderByDecisionFit(arbitrateStrategyActionRows(allActions, decision)) : allActions;
  const latestCycleView = latestCycle
    ? {
        ...latestCycle,
        // Canonical severity order (critical → low), not the alphabetical order of the string column.
        findings: rankOwnerFindingsBySeverity(latestCycle.findings.map(presentStoredStrategyFinding)),
        actions: arbitratedActions,
      }
    : null;

  const domainScore = latestCycle
    ? {
        domain: "strategy" as const,
        healthScore: latestCycle.healthScore,
        riskScore: latestCycle.riskScore,
        opportunityScore: latestCycle.opportunityScore,
        dataConfidenceScore: latestCycle.dataConfidenceScore,
        strategyState: latestCycle.strategyState,
      }
    : null;

  // The persisted row carrying the decision's primary step (null when the latest cycle was
  // evaluated before this step existed — the page then shows `decision.primaryStep` itself). Without
  // a decision, fall back to the top open action, never a retired "Pursue"/"Size up".
  const recommendedNextAction = decision
    ? (arbitratedActions.find((a) => a.decisionFit === "primary" && !TERMINAL_STATUSES.has(a.status)) ?? null)
    : (withoutRetiredStrategyActions(latestCycle?.actions ?? []).find((a: any) => !TERMINAL_STATUSES.has(a.status)) ?? null);

  return {
    businesses: businessList,
    selectedBusinessId,
    hasData: latestCycle !== null,
    latestSnapshot: latestSnapshot ?? null,
    latestCycle: latestCycleView,
    domainScore,
    recommendedNextAction,
    decision,
    missingCriticalData: latestSnapshot
      ? (Array.isArray(latestSnapshot.missingCriticalData) ? (latestSnapshot.missingCriticalData as string[]) : [])
      : [],
    cycleHistory: cycles.map((c: any) => ({
      id: c.id,
      sequenceNumber: c.sequenceNumber,
      // Stored rating from the earlier scoring model, shown as such — never re-derived.
      strategyState: c.strategyState,
      verdictSource: "stored_legacy_state" as const,
      healthScore: c.healthScore,
      findingCount: c.findings.length,
      actionCount: c.actions.length,
      createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
    })),
  };
}
