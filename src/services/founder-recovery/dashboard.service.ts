/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows; explicit any is pragmatic here */
/**
 * Founder Recovery — owner dashboard service.
 *
 * Assembles the owner-only dashboard payload from persisted real data:
 * business list, selected business, latest cycle (findings + actions +
 * verification), overdue actions, and cycle history. Returns an explicit empty
 * state when the owner has no businesses or no cycles yet.
 */
import { ENGAGED_ACTION_STATUSES } from "@/domain/founder-recovery/action-continuity";
import { db } from "@/lib/db";
import { rankOwnerFindingsBySeverity } from "@/domain/owner-spine/contracts";
import { listBusinesses, getBusiness } from "./business.service";

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
  // and cockpit-finance-priority.service.ts for the same rule. With 0 businesses this falls
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
      latestCycle: null,
      overdueActions: [],
      cycleHistory: [],
    };
  }

  await getBusiness(selectedBusinessId, workspaceId); // ownership guard

  const [latestSnapshot, latestCycleRow, cycles] = await Promise.all([
    db.ownerMetricSnapshot.findFirst({
      where: { businessId: selectedBusinessId, workspaceId },
      orderBy: { periodEnd: "desc" },
    }),
    db.recoveryCycle.findFirst({
      where: { businessId: selectedBusinessId, workspaceId },
      orderBy: { cycleNumber: "desc" },
      include: {
        snapshot: true,
        // Ranked after read: severity is a plain string, so a DB orderBy sorts it
        // alphabetically (critical, high, low, medium). See rankOwnerFindingsBySeverity.
        findings: true,
        actions: {
          include: { verifications: { orderBy: { createdAt: "desc" } } },
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

  const now = new Date();
  const overdueActions = await db.recoveryAction.findMany({
    where: {
      businessId: selectedBusinessId,
      workspaceId,
      status: { in: ["proposed", "assigned", "in_progress", "blocked"] },
      dueAt: { lt: now },
    },
    orderBy: { dueAt: "asc" },
  });

  // Engaged actions are re-attached to the new cycle when the diagnosis plans them again
  // (action-continuity.ts). Engaged actions left on an earlier cycle are still shown (after
  // current actions, flagged when the latest diagnosis no longer raises their finding) until
  // finished or cancelled.
  const carriedActions = latestCycleRow
    ? await db.recoveryAction.findMany({
        where: {
          businessId: selectedBusinessId,
          workspaceId,
          cycleId: { not: latestCycleRow.id },
          status: { in: [...ENGAGED_ACTION_STATUSES] },
        },
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
        actions: [
          ...latestCycleRow.actions,
          ...carriedActions.map((a: { cycle: { cycleNumber: number }; finding: { code: string } | null }) => ({
            ...a,
            carriedFromCycleSequence: a.cycle.cycleNumber,
            stillFlaggedByLatestDiagnosis:
              a.finding !== null && latestCycleRow.findings.some((f: { code: string }) => f.code === a.finding!.code),
          })),
        ],
      }
    : null;

  return {
    businesses: businessList,
    selectedBusinessId,
    hasData: latestCycleRow !== null,
    latestSnapshot: latestSnapshot ?? null,
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
