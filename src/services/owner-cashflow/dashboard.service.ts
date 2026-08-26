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
import { listBusinesses, getBusiness } from "@/services/founder-recovery/business.service";

export interface CashflowDashboardPayload {
  businesses: Array<{ id: string; name: string; businessType: string; currency: string; isActive: boolean }>;
  selectedBusinessId: string | null;
  hasData: boolean;
  latestSnapshot: any | null;
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
    db.ownerCashflowSnapshot.findFirst({
      where: { businessId: selectedBusinessId, workspaceId },
      orderBy: { periodEnd: "desc" },
    }),
    db.ownerCashflowCycle.findFirst({
      where: { businessId: selectedBusinessId, workspaceId },
      orderBy: { sequenceNumber: "desc" },
      include: {
        snapshot: true,
        findings: { orderBy: { severity: "asc" } },
        actions: {
          include: { verifications: { orderBy: { createdAt: "desc" } } },
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
      cashflowState: c.cashflowState,
      healthScore: c.healthScore,
      findingCount: c.findings.length,
      actionCount: c.actions.length,
      createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
    })),
  };
}
