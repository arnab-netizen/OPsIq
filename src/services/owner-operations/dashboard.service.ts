/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows; explicit any is pragmatic here */
/**
 * Owner Operations (Module 4) — owner-operations dashboard service.
 *
 * Assembles the aggregated owner-operations payload from persisted real data:
 * businesses, selected business, latest snapshot, latest cycle (findings +
 * actions + verifications), the operations domain score, the recommended next
 * action, and missing-critical-data. Returns an explicit empty state. Reads
 * persisted data only — no mock, nothing invented.
 */
import { db } from "@/lib/db";
import { listBusinesses, getBusiness } from "@/services/founder-recovery/business.service";

export interface OperationsDashboardPayload {
  businesses: Array<{ id: string; name: string; businessType: string; currency: string; isActive: boolean }>;
  selectedBusinessId: string | null;
  hasData: boolean;
  latestSnapshot: any | null;
  latestCycle: any | null;
  domainScore: {
    domain: "operations";
    healthScore: number;
    riskScore: number;
    opportunityScore: number;
    dataConfidenceScore: number;
    operationsState: string;
  } | null;
  recommendedNextAction: any | null;
  missingCriticalData: string[];
  cycleHistory: Array<{
    id: string;
    sequenceNumber: number;
    operationsState: string;
    healthScore: number;
    findingCount: number;
    actionCount: number;
    createdAt: string;
  }>;
}

export async function getOperationsDashboard(
  workspaceId: string,
  requestedBusinessId?: string | null
): Promise<OperationsDashboardPayload> {
  const businesses = await listBusinesses(workspaceId);
  const businessList = businesses.map((b: any) => ({
    id: b.id, name: b.name, businessType: b.businessType, currency: b.currency, isActive: b.isActive,
  }));

  let selectedBusinessId: string | null = null;
  if (requestedBusinessId) {
    const owned = businesses.find((b: any) => b.id === requestedBusinessId);
    if (owned) selectedBusinessId = owned.id;
  }
  if (!selectedBusinessId && businesses.length > 0) selectedBusinessId = businesses[0].id;

  if (!selectedBusinessId) {
    return {
      businesses: businessList, selectedBusinessId: null, hasData: false, latestSnapshot: null,
      latestCycle: null, domainScore: null, recommendedNextAction: null, missingCriticalData: [],
      cycleHistory: [],
    };
  }

  await getBusiness(selectedBusinessId, workspaceId); // ownership guard

  const [latestSnapshot, latestCycle, cycles] = await Promise.all([
    db.ownerOperationsSnapshot.findFirst({
      where: { businessId: selectedBusinessId, workspaceId },
      orderBy: { periodEnd: "desc" },
    }),
    db.ownerOperationsCycle.findFirst({
      where: { businessId: selectedBusinessId, workspaceId },
      orderBy: { sequenceNumber: "desc" },
      include: {
        snapshot: true,
        findings: { orderBy: { severity: "asc" } },
        actions: {
          include: { verifications: { orderBy: { createdAt: "desc" } } },
          orderBy: { priorityScore: "desc" },
        },
      },
    }),
    db.ownerOperationsCycle.findMany({
      where: { businessId: selectedBusinessId, workspaceId },
      orderBy: { sequenceNumber: "desc" },
      include: { findings: { select: { id: true } }, actions: { select: { id: true } } },
    }),
  ]);

  const domainScore = latestCycle
    ? {
        domain: "operations" as const,
        healthScore: latestCycle.healthScore,
        riskScore: latestCycle.riskScore,
        opportunityScore: latestCycle.opportunityScore,
        dataConfidenceScore: latestCycle.dataConfidenceScore,
        operationsState: latestCycle.operationsState,
      }
    : null;

  const recommendedNextAction =
    latestCycle && latestCycle.actions.length > 0 ? latestCycle.actions[0] : null;

  return {
    businesses: businessList,
    selectedBusinessId,
    hasData: latestCycle !== null,
    latestSnapshot: latestSnapshot ?? null,
    latestCycle: latestCycle ?? null,
    domainScore,
    recommendedNextAction,
    missingCriticalData: latestSnapshot
      ? (Array.isArray(latestSnapshot.missingCriticalData) ? (latestSnapshot.missingCriticalData as string[]) : [])
      : [],
    cycleHistory: cycles.map((c: any) => ({
      id: c.id,
      sequenceNumber: c.sequenceNumber,
      operationsState: c.operationsState,
      healthScore: c.healthScore,
      findingCount: c.findings.length,
      actionCount: c.actions.length,
      createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
    })),
  };
}
