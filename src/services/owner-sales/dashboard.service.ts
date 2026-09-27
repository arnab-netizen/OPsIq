/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows; explicit any is pragmatic here */
/**
 * Owner Sales (Module 3) — owner-sales dashboard service.
 *
 * Assembles the aggregated owner-sales payload from persisted real data:
 * businesses, selected business, latest snapshot, latest cycle (findings +
 * actions + verifications), the sales domain score, the recommended next action,
 * and missing-critical-data. Returns an explicit empty state. Reads persisted
 * data only — no mock, nothing invented.
 */
import { db } from "@/lib/db";
import { rankOwnerFindingsBySeverity } from "@/domain/owner-spine/contracts";
import { listBusinesses, getBusiness } from "@/services/founder-recovery/business.service";
import { withMeasuredBaseline } from "@/domain/founder-recovery/verification-evidence";
import { ENGAGED_ACTION_STATUSES } from "@/domain/founder-recovery/action-continuity";

export interface SalesDashboardPayload {
  businesses: Array<{ id: string; name: string; businessType: string; currency: string; isActive: boolean }>;
  selectedBusinessId: string | null;
  hasData: boolean;
  latestSnapshot: any | null;
  latestCycle: any | null;
  domainScore: {
    domain: "sales";
    healthScore: number;
    riskScore: number;
    opportunityScore: number;
    dataConfidenceScore: number;
    salesState: string;
  } | null;
  recommendedNextAction: any | null;
  missingCriticalData: string[];
  cycleHistory: Array<{
    id: string;
    sequenceNumber: number;
    salesState: string;
    healthScore: number;
    findingCount: number;
    actionCount: number;
    createdAt: string;
  }>;
}

export async function getSalesDashboard(
  workspaceId: string,
  requestedBusinessId?: string | null
): Promise<SalesDashboardPayload> {
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
      latestCycle: null, domainScore: null, recommendedNextAction: null, missingCriticalData: [],
      cycleHistory: [],
    };
  }

  await getBusiness(selectedBusinessId, workspaceId); // ownership guard

  const [latestSnapshot, latestCycle, cycles] = await Promise.all([
    db.ownerSalesSnapshot.findFirst({
      where: { businessId: selectedBusinessId, workspaceId },
      orderBy: { periodEnd: "desc" },
    }),
    db.ownerSalesCycle.findFirst({
      where: { businessId: selectedBusinessId, workspaceId },
      orderBy: { sequenceNumber: "desc" },
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
          // Deterministic total order: priorityScore is clamped to [0,100]
          // (calculateOwnerPriorityScore), so ties at the ceiling are a real,
          // expected occurrence whenever multiple critical findings coexist
          // -- not an edge case. A single-key orderBy has no guaranteed
          // return order for tied rows across repeated SELECTs, so an
          // unrelated UPDATE (e.g. an Assign PATCH) can change which tied
          // row Postgres returns first on the very next read, silently
          // reordering the owner-visible action list. The first 5 keys
          // mirror rankOwnerActions()'s tiebreak chain (contracts.ts); `id`
          // is added as the final key because rankOwnerActions()'s own
          // comparator does not terminate in a unique key (OwnerAction.id
          // is optional there) and is therefore not itself a total order.
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
    db.ownerSalesCycle.findMany({
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
    ? await db.ownerSalesAction.findMany({
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
        domain: "sales" as const,
        healthScore: latestCycle.healthScore,
        riskScore: latestCycle.riskScore,
        opportunityScore: latestCycle.opportunityScore,
        dataConfidenceScore: latestCycle.dataConfidenceScore,
        salesState: latestCycle.salesState,
      }
    : null;

  // DOMAIN-LOCAL next action: the highest-ranked OPEN action of this domain's latest cycle (never a
  // completed/cancelled one). The owner's overall main target comes only from the canonical owner
  // decision (owner-home/home.service.ts).
  const recommendedNextAction =
    latestCycle?.actions.find((a: { status: string }) => a.status !== "completed" && a.status !== "cancelled") ?? null;

  return {
    businesses: businessList,
    selectedBusinessId,
    hasData: latestCycle !== null,
    latestSnapshot: latestSnapshot ?? null,
    latestCycle: latestCycleView,
    domainScore,
    recommendedNextAction,
    missingCriticalData: latestSnapshot
      ? (Array.isArray(latestSnapshot.missingCriticalData) ? (latestSnapshot.missingCriticalData as string[]) : [])
      : [],
    cycleHistory: cycles.map((c: any) => ({
      id: c.id,
      sequenceNumber: c.sequenceNumber,
      salesState: c.salesState,
      healthScore: c.healthScore,
      findingCount: c.findings.length,
      actionCount: c.actions.length,
      createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
    })),
  };
}
