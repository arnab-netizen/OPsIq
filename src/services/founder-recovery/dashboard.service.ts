/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows; explicit any is pragmatic here */
/**
 * Founder Recovery — owner dashboard service.
 *
 * Assembles the owner-only dashboard payload from persisted real data:
 * business list, selected business, latest cycle (findings + actions +
 * verification), overdue actions, and cycle history. Returns an explicit empty
 * state when the owner has no businesses or no cycles yet.
 */
import { db } from "@/lib/db";
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
  if (!selectedBusinessId && businesses.length > 0) {
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
        findings: { orderBy: { severity: "asc" } },
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

  return {
    businesses: businessList,
    selectedBusinessId,
    hasData: latestCycleRow !== null,
    latestSnapshot: latestSnapshot ?? null,
    latestCycle: latestCycleRow ?? null,
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
