/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows; explicit any is pragmatic here */
/**
 * Owner Cashflow (Module 5) — owner-cashflow dashboard service.
 *
 * Assembles the aggregated owner-cashflow payload from persisted real data:
 * businesses, selected business, latest snapshot, latest cycle (findings +
 * actions + verifications), the cashflow domain score, the recommended next
 * action, and missing-critical-data. Returns an explicit empty state. Reads
 * persisted data only — no mock, nothing invented.
 */
import { db } from "@/lib/db";
import { rankOwnerFindingsBySeverity } from "@/domain/owner-spine/contracts";
import { listBusinesses, getBusiness } from "@/services/founder-recovery/business.service";
import { withMeasuredBaseline } from "@/domain/founder-recovery/verification-evidence";
import { ENGAGED_ACTION_STATUSES } from "@/domain/founder-recovery/action-continuity";
import { getDomainLocalOwnerStep, presentDomainLocalStep } from "@/services/owner-home/owner-candidate-builder";
import { CURRENT_DIAGNOSIS_CYCLE_ORDER, currentEvidenceWhere, evidencePeriodState, type EvidencePeriodState } from "@/services/owner-spine/current-diagnosis-cycle";

export interface CashflowDashboardPayload {
  businesses: Array<{ id: string; name: string; businessType: string; currency: string; isActive: boolean }>;
  selectedBusinessId: string | null;
  hasData: boolean;
  latestSnapshot: any | null;
  /**
   * Where `latestSnapshot`'s period sits (current-diagnosis-cycle.ts): "provisional" when it is the
   * in-progress current period — shown as in progress, never as the completed reading this page's cycle is
   * built on. A genuinely future snapshot is never returned.
   */
  latestSnapshotPeriodState: EvidencePeriodState | null;
  latestCycle: any | null;
  domainScore: {
    domain: "cashflow";
    healthScore: number;
    riskScore: number;
    opportunityScore: number;
    dataConfidenceScore: number;
    cashflowState: string;
  } | null;
  recommendedNextAction: any | null;
  missingCriticalData: string[];
  cycleHistory: Array<{
    id: string;
    sequenceNumber: number;
    cashflowState: string;
    healthScore: number;
    findingCount: number;
    actionCount: number;
    createdAt: string;
  }>;
}

export async function getCashflowDashboard(
  workspaceId: string,
  requestedBusinessId?: string | null
): Promise<CashflowDashboardPayload> {
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
      businesses: businessList, selectedBusinessId: null, hasData: false, latestSnapshot: null, latestSnapshotPeriodState: null,
      latestCycle: null, domainScore: null, recommendedNextAction: null, missingCriticalData: [],
      cycleHistory: [],
    };
  }

  await getBusiness(selectedBusinessId, workspaceId); // ownership guard

  const dashboardNow = new Date();
  const [latestSnapshot, latestCycle, cycles] = await Promise.all([
    // The latest snapshot that has STARTED (the one the owner can diagnose): a genuinely future period is
    // never shown; an in-progress one is labelled (latestSnapshotPeriodState).
    db.ownerCashflowSnapshot.findFirst({
      where: { businessId: selectedBusinessId, workspaceId, periodStart: { lte: dashboardNow } },
      orderBy: { periodEnd: "desc" },
    }),
    db.ownerCashflowCycle.findFirst({
      where: { businessId: selectedBusinessId, workspaceId, ...currentEvidenceWhere(dashboardNow) },
      orderBy: CURRENT_DIAGNOSIS_CYCLE_ORDER,
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
    db.ownerCashflowCycle.findMany({
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
    ? await db.ownerCashflowAction.findMany({
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
  const latestCycleView = latestCycle
    ? {
        ...latestCycle,
        findings: rankOwnerFindingsBySeverity(latestCycle.findings),
        actions: [
          ...latestCycle.actions.map(withMeasuredBaseline),
          ...carriedActions.map((a: { verificationMetric: string; findingCode: string; cycle: { sequenceNumber: number } }) => ({
            ...withMeasuredBaseline(a),
            carriedFromCycleSequence: a.cycle.sequenceNumber,
            // false when the latest diagnosis no longer raises this finding (finish or cancel it).
            stillFlaggedByLatestDiagnosis: latestCycle.findings.some((f: { code: string }) => f.code === a.findingCode),
          })),
        ],
      }
    : null;

  const domainScore = latestCycle
    ? {
        domain: "cashflow" as const,
        healthScore: latestCycle.healthScore,
        riskScore: latestCycle.dangerScore,
        opportunityScore: latestCycle.opportunityScore,
        dataConfidenceScore: latestCycle.dataConfidenceScore,
        cashflowState: latestCycle.cashflowState,
      }
    : null;

  // DOMAIN-LOCAL next step: the canonical eligible candidates (the SAME builder and eligibility contract
  // the owner decision uses — verification timing, stale → refresh, supersession, survival issues)
  // filtered to this domain. Never a completed, cancelled, verified, stale-replaced or superseded item,
  // and never a second election: the owner's overall main target is the canonical owner decision.
  const recommendedNextAction = latestCycle
    ? presentDomainLocalStep(await getDomainLocalOwnerStep(workspaceId, selectedBusinessId, "cashflow"), latestCycleView?.actions ?? [])
    : null;

  return {
    businesses: businessList,
    selectedBusinessId,
    hasData: latestCycle !== null,
    latestSnapshot: latestSnapshot ?? null,
    latestSnapshotPeriodState: latestSnapshot ? evidencePeriodState(latestSnapshot, dashboardNow) : null,
    latestCycle: latestCycleView,
    domainScore,
    recommendedNextAction,
    // The missing data of the snapshot this page's (completed) cycle was diagnosed on — never an in-progress
    // or other period's snapshot beside that cycle's scores and findings.
    missingCriticalData: latestCycle?.snapshot
      ? (Array.isArray(latestCycle.snapshot.missingCriticalData) ? (latestCycle.snapshot.missingCriticalData as string[]) : [])
      : [],
    cycleHistory: cycles.map((c: any) => ({
      id: c.id,
      sequenceNumber: c.sequenceNumber,
      cashflowState: c.cashflowState,
      healthScore: c.healthScore,
      findingCount: c.findings.length,
      actionCount: c.actions.length,
      createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
    })),
  };
}
