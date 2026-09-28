/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows; explicit any is pragmatic here */
/**
 * Founder Recovery — owner dashboard service.
 *
 * Assembles the owner-only dashboard payload from persisted real data:
 * business list, selected business, latest cycle (findings + actions +
 * verification), overdue actions, and cycle history. Returns an explicit empty
 * state when the owner has no businesses or no cycles yet.
 */
import { dashboardContinuityActions, dashboardPriorWorkWhere, snapshotDiagnosisState, type SnapshotDiagnosisState } from "@/services/owner-spine/dashboard-continuity";
import { db } from "@/lib/db";
import { rankOwnerFindingsBySeverity } from "@/domain/owner-spine/contracts";
import { listBusinesses, getBusiness } from "./business.service";
import { CURRENT_RECOVERY_CYCLE_ORDER, currentEvidenceWhere, evidencePeriodState, type EvidencePeriodState } from "@/services/owner-spine/current-diagnosis-cycle";

export interface RecoveryDashboardPayload {
  businesses: Array<{
    id: string;
    name: string;
    businessType: string;
    currency: string;
    isActive: boolean;
  }>;
  selectedBusinessId: string | null;
  hasData: boolean;
  latestSnapshot: any | null;
  /**
   * Where `latestSnapshot`'s period sits (current-diagnosis-cycle.ts): "provisional" when it is the
   * in-progress current period — shown as in progress, never as the completed reading this page's cycle is
   * built on. A genuinely future snapshot is never returned.
   */
  latestSnapshotPeriodState: EvidencePeriodState | null;
  /** The latest snapshot's own diagnosis, when it was already diagnosed (the page never prompts a re-run of it). */
  latestSnapshotDiagnosis: SnapshotDiagnosisState | null;
  latestCycle: any | null;
  overdueActions: any[];
  cycleHistory: Array<{
    id: string;
    cycleNumber: number;
    healthStatus: string;
    healthScore: number;
    findingCount: number;
    actionCount: number;
    createdAt: string;
  }>;
}

export async function getRecoveryDashboard(
  workspaceId: string,
  requestedBusinessId?: string | null
): Promise<RecoveryDashboardPayload> {
  const businesses = await listBusinesses(workspaceId);

  const businessList = businesses.map((b: any) => ({
    id: b.id,
    name: b.name,
    businessType: b.businessType,
    currency: b.currency,
    isActive: b.isActive,
  }));

  // Resolve selected business: requested (if owned) else most recent.
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
  if (!selectedBusinessId && businesses.length === 1) {
    selectedBusinessId = businesses[0].id;
  }

  if (!selectedBusinessId) {
    return {
      businesses: businessList,
      selectedBusinessId: null,
      hasData: false,
      latestSnapshot: null,
      latestSnapshotPeriodState: null,
      latestSnapshotDiagnosis: null,
      latestCycle: null,
      overdueActions: [],
      cycleHistory: [],
    };
  }

  await getBusiness(selectedBusinessId, workspaceId); // ownership guard

  const dashboardNow = new Date();
  const [latestSnapshot, latestCycleRow, cycles] = await Promise.all([
    // The latest snapshot that has STARTED (the one the owner can diagnose): a genuinely future period is
    // never shown; an in-progress one is labelled (latestSnapshotPeriodState).
    db.ownerMetricSnapshot.findFirst({
      where: { businessId: selectedBusinessId, workspaceId, periodStart: { lte: dashboardNow } },
      orderBy: { periodEnd: "desc" },
    }),
    db.recoveryCycle.findFirst({
      where: { businessId: selectedBusinessId, workspaceId, ...currentEvidenceWhere(dashboardNow) },
      orderBy: CURRENT_RECOVERY_CYCLE_ORDER,
      include: {
        snapshot: true,
        // Ranked after read: severity is a plain string, so a DB orderBy sorts it
        // alphabetically (critical, high, low, medium). See rankOwnerFindingsBySeverity.
        findings: true,
        actions: {
          // The finding code is the action's continuity key (dashboardContinuityActions).
          include: { verifications: { orderBy: { createdAt: "desc" } }, finding: { select: { code: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    db.recoveryCycle.findMany({
      where: { businessId: selectedBusinessId, workspaceId },
      orderBy: { cycleNumber: "desc" },
      include: {
        findings: { select: { id: true } },
        actions: { select: { id: true } },
      },
    }),
  ]);

  // Whether the snapshot this page would diagnose was already diagnosed (and on what): shown instead of a
  // prompt to re-run the same evidence (a changed snapshot needs a new cycle).
  const latestSnapshotCycle = latestSnapshot
    ? await db.recoveryCycle.findFirst({
        where: { businessId: selectedBusinessId, workspaceId, snapshotId: latestSnapshot.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true, createdAt: true, healthStatus: true },
      })
    : null;

  const now = new Date();

  // Engaged actions are re-attached to the new cycle when the diagnosis plans them again
  // (action-continuity.ts). Engaged actions left on an earlier cycle are still shown (after
  // current actions, flagged when the latest diagnosis no longer raises their finding) until
  // finished or cancelled.
  const carriedActions = latestCycleRow
    ? await db.recoveryAction.findMany({
        where: dashboardPriorWorkWhere(
          { businessId: selectedBusinessId, workspaceId },
          latestCycleRow.id,
          latestCycleRow.findings.map((f: { code: string }) => f.code),
          dashboardNow,
          true
        ),
        include: {
          verifications: { orderBy: { createdAt: "desc" } },
          cycle: { select: { cycleNumber: true } },
          finding: { select: { code: true } },
        },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const latestCycle = latestCycleRow
    ? {
        ...latestCycleRow,
        findings: rankOwnerFindingsBySeverity(latestCycleRow.findings),
        // One continuity rule with Owner Home (dashboard-continuity.ts): no duplicate proposal beside the
        // owner's engaged or completed work for the same key.
        actions: dashboardContinuityActions<any>(
          latestCycleRow,
          latestCycleRow.actions,
          carriedActions,
          (a) => a.finding?.code ?? null,
          (a) => a.cycle?.cycleNumber
        ),
      }
    : null;

  // P2-4: overdue actions/count come from the SAME canonical live action set the page displays
  // (latestCycle.actions — own actions minus a suppressed duplicate, plus engaged work elsewhere, per
  // dashboardContinuityActions) rather than an independent raw query. A hidden duplicate proposal a fresh
  // diagnosis re-plans beside the owner's already-completed work is excluded from `own` by continuity —
  // it must never inflate the overdue count/list either. Historical `completedEarlier` rows are never open
  // (status "completed"), so they are naturally excluded by the status filter below.
  const OPEN_STATUSES = new Set(["proposed", "assigned", "in_progress", "blocked"]);
  const overdueActions = latestCycle
    ? latestCycle.actions
        .filter((a: any) => OPEN_STATUSES.has(a.status) && a.dueAt && new Date(a.dueAt).getTime() < now.getTime())
        .sort((a: any, b: any) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
    : await db.recoveryAction.findMany({
        // No current cycle at all: nothing for continuity to dedupe against yet — the same raw, unscoped
        // query as before this fix.
        where: {
          businessId: selectedBusinessId, workspaceId,
          status: { in: [...OPEN_STATUSES] },
          dueAt: { lt: now },
          cycle: { snapshot: { periodStart: { lte: now } } },
        },
        orderBy: { dueAt: "asc" },
      });

  return {
    businesses: businessList,
    selectedBusinessId,
    hasData: latestCycleRow !== null,
    latestSnapshot: latestSnapshot ?? null,
    latestSnapshotPeriodState: latestSnapshot ? evidencePeriodState(latestSnapshot, dashboardNow) : null,
    latestSnapshotDiagnosis: snapshotDiagnosisState(latestSnapshot, latestSnapshotCycle, latestSnapshotCycle?.healthStatus ?? null),
    latestCycle,
    overdueActions,
    cycleHistory: cycles.map((c: any) => ({
      id: c.id,
      cycleNumber: c.cycleNumber,
      healthStatus: c.healthStatus,
      healthScore: c.healthScore,
      findingCount: c.findings.length,
      actionCount: c.actions.length,
      createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
    })),
  };
}
