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
import { rankOwnerFindingsBySeverity } from "@/domain/owner-spine/contracts";
import { listBusinesses, getBusiness } from "@/services/founder-recovery/business.service";
import { withMeasuredBaseline } from "@/domain/founder-recovery/verification-evidence";
import { getDomainOwnerSteps, selectStrategyLocalStep, type StrategyDecisionStepState } from "@/services/owner-home/owner-candidate-builder";
import { evaluateOwnerActionGate } from "@/domain/owner-mode/owner-action-gate-policy";
import { ownerGateHoldText } from "@/domain/owner-spine/owner-decision";
import { ownerStrategyStepIntent } from "@/domain/owner-spine/owner-imperatives";
import { ENGAGED_ACTION_STATUSES } from "@/domain/founder-recovery/action-continuity";
import type { StrategyDecision } from "@/domain/owner-strategy/decision";
import { arbitrateStrategyActionRows, isStrategyDecisionStep, orderByDecisionFit, presentStoredStrategyFinding } from "@/domain/owner-strategy/action-arbitration";
import type { StrategyScenarioSummary } from "@/domain/owner-strategy/presentation";
import { currentStrategyDecision } from "./decision-view";
import { CURRENT_STRATEGY_CYCLE_ORDER } from "@/services/owner-spine/current-diagnosis-cycle";


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
  /** Whether the decision's own primary step is the next step (it may be replaced by the canonical one). */
  decisionStep: { state: StrategyDecisionStepState; replacedBecause: string | null };
  /** The current decision for the latest evaluation (derived on read, not persisted). */
  decision: StrategyDecision | null;
  missingCriticalData: string[];
  /**
   * Every saved scenario of the selected business (newest assessment period first). The owner
   * evaluates one explicitly by its id — the page never infers which one from the period.
   * `isCurrentDecision` marks the scenario the current decision was derived from.
   */
  scenarios: StrategyScenarioSummary[];
  cycleHistory: Array<{
    id: string;
    sequenceNumber: number;
    strategyState: string;
    verdictSource: "stored_legacy_state";
    healthScore: number;
    findingCount: number;
    actionCount: number;
    createdAt: string;
    /** The scenario that evaluation used (null when that scenario row no longer exists). */
    scenario: { id: string; optionName: string | null; periodStart: string; periodEnd: string } | null;
  }>;
}

function isoOf(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
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
  // and owner-home/home.service.ts for the same rule. With 0 businesses this falls
  // through to the existing empty-state return below; with 2+, it now also falls through
  // (selectedBusinessId stays null) rather than silently guessing businesses[0] — the exact
  // server-side "wrong business" mechanism the controlled-beta launch-blocker audit flagged.
  if (!selectedBusinessId && businesses.length === 1) selectedBusinessId = businesses[0].id;

  if (!selectedBusinessId) {
    return {
      businesses: businessList, selectedBusinessId: null, hasData: false, latestSnapshot: null,
      latestCycle: null, domainScore: null, recommendedNextAction: null, decisionStep: { state: "not_listed", replacedBecause: null }, decision: null, missingCriticalData: [],
      scenarios: [], cycleHistory: [],
    };
  }

  await getBusiness(selectedBusinessId, workspaceId); // ownership guard

  const [snapshots, latestCycle, cycles] = await Promise.all([
    db.ownerStrategySnapshot.findMany({
      where: { businessId: selectedBusinessId, workspaceId },
      // Newest assessment period first; createdAt/id make the order total.
      orderBy: [{ periodEnd: "desc" }, { periodStart: "desc" }, { createdAt: "desc" }, { id: "asc" }],
    }),
    db.ownerStrategyCycle.findFirst({
      where: { businessId: selectedBusinessId, workspaceId },
      orderBy: CURRENT_STRATEGY_CYCLE_ORDER,
      include: {
        snapshot: true,
        // Ranked after read: severity is a plain string, so a DB orderBy sorts it
        // alphabetically (critical, high, low, medium). See rankOwnerFindingsBySeverity.
        findings: true,
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
      include: {
        findings: { select: { id: true } },
        actions: { select: { id: true } },
        snapshot: { select: { id: true, optionName: true, periodStart: true, periodEnd: true } },
      },
    }),
  ]);
  const latestSnapshot = snapshots[0] ?? null;

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

  // The local next step is the first canonically ELIGIBLE Strategy item (the same builder and contract
  // as the owner decision, possibly an explicit refresh target). The decision's own step is "current"
  // only when its row is that item; otherwise the page says why not (selectStrategyLocalStep).
  // A step the owner action gate holds back is "held" (by what, and what clears it) — never called done,
  // verified or superseded; the decision's not-yet-listed step is checked against the same gate.
  const steps = latestCycle ? await getDomainOwnerSteps(workspaceId, selectedBusinessId, "strategy") : null;
  const heldRows = new Map((steps?.holds ?? []).map((h) => [h.sourceId, ownerGateHoldText(h.code, steps!.gate)] as const));
  const unlistedVerdict = decision && steps
    ? evaluateOwnerActionGate(steps.gate, { domain: "strategy", intent: ownerStrategyStepIntent(decision.code, decision.primaryStep.findingCode), findingId: null, findingCode: decision.primaryStep.findingCode })
    : null;
  const { recommended: recommendedNextAction, decisionStep } = selectStrategyLocalStep(
    decision !== null,
    arbitratedActions,
    steps?.eligible ?? [],
    (row) => decision !== null && isStrategyDecisionStep(row, decision),
    { rows: heldRows, unlistedStep: unlistedVerdict && !unlistedVerdict.allowed ? ownerGateHoldText(unlistedVerdict.code, steps!.gate) : null }
  );

  return {
    businesses: businessList,
    selectedBusinessId,
    hasData: latestCycle !== null,
    latestSnapshot: latestSnapshot ?? null,
    latestCycle: latestCycleView,
    domainScore,
    recommendedNextAction,
    decisionStep,
    decision,
    // Missing inputs of the scenario the current evaluation used — not of whichever saved
    // scenario happens to have the latest assessment period.
    missingCriticalData: Array.isArray(latestCycle?.snapshot?.missingCriticalData)
      ? (latestCycle.snapshot.missingCriticalData as string[])
      : [],
    scenarios: snapshots.map((sn: any) => {
      const evaluations = cycles.filter((c: any) => c.snapshotId === sn.id);
      return {
        id: sn.id,
        optionName: sn.optionName ?? null,
        periodStart: isoOf(sn.periodStart),
        periodEnd: isoOf(sn.periodEnd),
        createdAt: isoOf(sn.createdAt),
        // cycles are ordered newest first, so the first match is the latest evaluation.
        lastEvaluationSequence: evaluations[0]?.sequenceNumber ?? null,
        isCurrentDecision: latestCycle !== null && latestCycle.snapshotId === sn.id,
      };
    }),
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
      scenario: c.snapshot
        ? { id: c.snapshot.id, optionName: c.snapshot.optionName ?? null, periodStart: isoOf(c.snapshot.periodStart), periodEnd: isoOf(c.snapshot.periodEnd) }
        : null,
    })),
  };
}
