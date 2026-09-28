/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows; explicit any is pragmatic here */
/**
 * Owner Finance (Module 2) — owner-finance dashboard service.
 *
 * Assembles the aggregated owner-finance payload from persisted real data:
 * businesses, selected business, latest snapshot, latest cycle (findings +
 * actions + verifications), the finance domain score, the recommended next
 * action, and missing-critical-data. Returns an explicit empty state. Reads
 * persisted data only — no mock, nothing invented.
 */
import { db } from "@/lib/db";
import { rankOwnerFindingsBySeverity } from "@/domain/owner-spine/contracts";
import { listBusinesses, getBusiness } from "@/services/founder-recovery/business.service";
import { baselineFindingInclude, financeMeasuredBaseline, type BaselineFindingRow } from "./baseline.service";
import { dashboardContinuityActions, dashboardPriorWorkWhere, snapshotDiagnosisState, type SnapshotDiagnosisState } from "@/services/owner-spine/dashboard-continuity";
import { currentEffectiveFinancialSnapshotQuery, inProgressFinancialSnapshotQuery } from "@/services/owner-finance/financial-snapshot-selection";
import { getDomainLocalOwnerStep, presentDomainLocalStep } from "@/services/owner-home/owner-candidate-builder";
import { CURRENT_DIAGNOSIS_CYCLE_ORDER, currentEvidenceWhere, evidencePeriodState, type EvidencePeriodState } from "@/services/owner-spine/current-diagnosis-cycle";

export interface FinanceDashboardPayload {
  businesses: Array<{ id: string; name: string; businessType: string; currency: string; isActive: boolean }>;
  selectedBusinessId: string | null;
  hasData: boolean;
  latestSnapshot: any | null;
  /**
   * The in-progress current period's snapshot (provisional — never the current effective snapshot above),
   * shown and diagnosable, labelled as in progress; null when there is none.
   */
  inProgressSnapshot: any | null;
  /** Where the snapshot the page diagnoses sits: "provisional" when it is the in-progress one. */
  latestSnapshotPeriodState: EvidencePeriodState | null;
  /** The snapshot the page's "Run finance diagnosis" diagnoses: the in-progress one, else the current effective one. */
  diagnosisTargetSnapshot: any | null;
  /** That snapshot's own diagnosis, when it was already diagnosed (the page never prompts a re-run of it). */
  latestSnapshotDiagnosis: SnapshotDiagnosisState | null;
  latestCycle: any | null;
  domainScore: {
    domain: "finance";
    healthScore: number;
    riskScore: number;
    opportunityScore: number;
    dataConfidenceScore: number;
    survivalState: string;
  } | null;
  recommendedNextAction: any | null;
  missingCriticalData: string[];
  cycleHistory: Array<{
    id: string;
    sequenceNumber: number;
    survivalState: string;
    overallHealthScore: number;
    findingCount: number;
    actionCount: number;
    createdAt: string;
  }>;
}

export async function getFinanceDashboard(
  workspaceId: string,
  requestedBusinessId?: string | null
): Promise<FinanceDashboardPayload> {
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
      inProgressSnapshot: null, latestSnapshotPeriodState: null, diagnosisTargetSnapshot: null, latestSnapshotDiagnosis: null,
      latestCycle: null, domainScore: null, recommendedNextAction: null, missingCriticalData: [],
      cycleHistory: [],
    };
  }

  await getBusiness(selectedBusinessId, workspaceId); // ownership guard

  const dashboardNow = new Date();
  const [latestSnapshot, inProgressSnapshot, latestCycle, cycles] = await Promise.all([
    // Current effective snapshot (financial-snapshot-selection.ts); the diagnosis-bound one is latestCycle.snapshot.
    db.ownerFinancialSnapshot.findFirst(currentEffectiveFinancialSnapshotQuery({ workspaceId, businessId: selectedBusinessId }, undefined, dashboardNow)),
    // The in-progress period's figures (provisional): shown, labelled and diagnosable — never current evidence.
    db.ownerFinancialSnapshot.findFirst(inProgressFinancialSnapshotQuery({ workspaceId, businessId: selectedBusinessId }, undefined, dashboardNow)),
    db.ownerFinanceCycle.findFirst({
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
            ...baselineFindingInclude,
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
    db.ownerFinanceCycle.findMany({
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
    ? await db.ownerFinanceAction.findMany({
        where: dashboardPriorWorkWhere(
          { businessId: selectedBusinessId, workspaceId },
          latestCycle.id,
          latestCycle.findings.map((f: { code: string }) => f.code),
          dashboardNow
        ),
        include: {
          verifications: { orderBy: { createdAt: "desc" } },
          ...baselineFindingInclude,
          cycle: { select: { sequenceNumber: true } },
        },
        orderBy: [{ priorityScore: "desc" }, { id: "asc" }],
      })
    : [];
  // measuredBaseline follows the snapshot amendment chain (baseline.service.ts).
  const withBaseline = async <T extends { verificationMetric: string; finding?: BaselineFindingRow | null }>(a: T) => ({
    ...a,
    measuredBaseline: await financeMeasuredBaseline(a, workspaceId),
  });
  const latestCycleView = latestCycle
    ? {
        ...latestCycle,
        findings: rankOwnerFindingsBySeverity(latestCycle.findings),
        // One continuity rule with Owner Home (dashboard-continuity.ts): no duplicate proposal beside the
        // owner's engaged or completed work for the same key.
        actions: await Promise.all(
          dashboardContinuityActions<any>(latestCycle, latestCycle.actions, carriedActions, (a) => a.findingCode, (a) => a.cycle?.sequenceNumber).map(withBaseline)
        ),
      }
    : null;

  const domainScore = latestCycle
    ? {
        domain: "finance" as const,
        healthScore: latestCycle.overallHealthScore,
        riskScore: latestCycle.survivalRiskScore,
        opportunityScore: latestCycle.growthOpportunityScore,
        dataConfidenceScore: latestCycle.dataConfidenceScore,
        survivalState: latestCycle.survivalState,
      }
    : null;

  // DOMAIN-LOCAL next step: the canonical eligible candidates (the SAME builder and eligibility contract
  // the owner decision uses — verification timing, stale → refresh, supersession, survival issues)
  // filtered to this domain. Never a completed, cancelled, verified, stale-replaced or superseded item,
  // and never a second election: the owner's overall main target is the canonical owner decision.
  const recommendedNextAction = latestCycle
    ? presentDomainLocalStep(await getDomainLocalOwnerStep(workspaceId, selectedBusinessId, "finance"), latestCycleView?.actions ?? [])
    : null;

  const diagnosisTargetSnapshot = inProgressSnapshot ?? latestSnapshot ?? null;
  const targetCycle = diagnosisTargetSnapshot
    ? await db.ownerFinanceCycle.findFirst({
        where: { businessId: selectedBusinessId, workspaceId, snapshotId: diagnosisTargetSnapshot.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true, createdAt: true, survivalState: true },
      })
    : null;

  return {
    businesses: businessList,
    selectedBusinessId,
    hasData: latestCycle !== null,
    latestSnapshot: latestSnapshot ?? null,
    inProgressSnapshot: inProgressSnapshot ?? null,
    latestSnapshotPeriodState: diagnosisTargetSnapshot ? evidencePeriodState(diagnosisTargetSnapshot, dashboardNow) : null,
    diagnosisTargetSnapshot,
    latestSnapshotDiagnosis: snapshotDiagnosisState(diagnosisTargetSnapshot, targetCycle, targetCycle?.survivalState ?? null),
    latestCycle: latestCycleView,
    domainScore,
    recommendedNextAction,
    // From the snapshot the CURRENT diagnosis ran on (its cycle's own snapshot) — never inferred from
    // the latest period; only before any diagnosis does the latest snapshot guide what to enter.
    missingCriticalData: (latestCycle?.snapshot ?? latestSnapshot)
      ? (Array.isArray((latestCycle?.snapshot ?? latestSnapshot).missingCriticalData) ? ((latestCycle?.snapshot ?? latestSnapshot).missingCriticalData as string[]) : [])
      : [],
    cycleHistory: cycles.map((c: any) => ({
      id: c.id,
      sequenceNumber: c.sequenceNumber,
      survivalState: c.survivalState,
      overallHealthScore: c.overallHealthScore,
      findingCount: c.findings.length,
      actionCount: c.actions.length,
      createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
    })),
  };
}
