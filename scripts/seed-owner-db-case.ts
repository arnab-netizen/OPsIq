/**
 * DB-backed seed for one full owner-business case — used by the `[db]`-gated real-ingestion test.
 *
 * Inserts PERSISTED records across the critical domains so the production owner-advice runtime can
 * read them back THROUGH the real providers (not fixtures). Typed against the generated Prisma client
 * so `tsc` validates every create payload even though execution is `[db]`-gated (runs in CI).
 */
import type { PrismaClient } from "@/generated/prisma/client";

export interface OwnerDbCaseIds {
  workspaceId: string;
  businessId: string;
  userId: string;
  now: Date;
  /** finance/cashflow period end — set "old" to simulate stale data. */
  periodEnd?: Date;
  /** override cash to flip the cash-risk signal between runs. */
  cashInHand?: number;
  /** When true, skips seeding ownerComplianceItem and proof records.
   *  Use for scenarios that must test cash/capacity constraint dominance
   *  without compliance_block (rank 0) overriding the intended dominant constraint. */
  skipComplianceAndProof?: boolean;
  /** Controls compliance item expiry when compliance IS seeded (skipComplianceAndProof falsy).
   *  false → seeds a valid (non-expired) compliance item (+365 days), no proof seeded.
   *  true/undefined (default) → seeds expired compliance (-5 days) + duplicateFlagged proof.
   *  Use false for SIM-A/SIM-D where criticalDomainsRealProviderBacked must be true
   *  but compliance_block must NOT be the dominant constraint. */
  complianceExpired?: boolean;
  /** Override capacity to "growth-safe" state (bottleneckUtilization=0.6, growthSafe=true).
   *  Default seeds over-capacity (bottleneckUtilization=1.1, growthSafe=false).
   *  Use to isolate Finance→Growth cross-domain tests from capacity constraints. */
  capacityGrowthSafe?: boolean;
}

// Deterministic, VALID uuid from (businessId, label) — scoped to the business so two seeded cases in
// different workspaces/businesses NEVER share a row id (otherwise concurrent [db] tests, which upsert
// and clean up by id, would clobber each other's rows). The node is an 8-hex businessId hash + a
// 4-hex label encoding = 12 hex chars (valid UUID v4-shaped).
const rid = (businessId: string, seed: string) => {
  let h = 5381;
  for (const c of `${businessId}:${seed}`) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
  const node = h.toString(16).padStart(8, "0").slice(0, 8);
  const tail = Array.from(seed).map((c) => c.charCodeAt(0).toString(16)).join("").slice(0, 4).padStart(4, "0");
  return `00000000-0000-4000-8000-${node}${tail}`;
};

/** Insert a full persisted owner-business case. Returns the ids used. */
export async function seedOwnerDbCase(db: PrismaClient, ids: OwnerDbCaseIds): Promise<OwnerDbCaseIds> {
  const { workspaceId, businessId, userId, now } = ids;
  const periodEnd = ids.periodEnd ?? now;
  const periodStart = new Date(periodEnd.getTime() - 30 * 86_400_000);
  const cashInHand = ids.cashInHand ?? 15000;

  await db.ownerBusiness.upsert({
    where: { id: businessId },
    update: { location: "Kolkata, West Bengal", currency: "INR" },
    create: { id: businessId, workspaceId, name: "DB Ingestion Test Laundry", businessType: "laundry_dry_cleaning", location: "Kolkata, West Bengal", currency: "INR", createdBy: userId },
  });

  await db.ownerCashflowSnapshot.upsert({
    where: { id: rid(businessId, "cf1") },
    update: { cashInHand, periodEnd },
    create: { id: rid(businessId, "cf1"), workspaceId, businessId, periodStart, periodEnd, currency: "INR", cashInHand, bankBalance: 0, receivables: 240000, receivablesOverdue: 80000, payables: 30000, dataConfidenceScore: 0.8, missingCriticalData: [] },
  });

  await db.ownerFinancialSnapshot.upsert({
    where: { id: rid(businessId, "fin1") },
    update: { periodEnd },
    create: { id: rid(businessId, "fin1"), workspaceId, businessId, periodStart, periodEnd, currency: "INR", revenue: 320000, costOfGoods: 250000, fixedCosts: 60000, variableCosts: 20000, dataConfidenceScore: 0.8, missingCriticalData: [] },
  });

  await db.ownerWorkingCapitalItem.upsert({
    where: { id: rid(businessId, "wc1") },
    update: { amount: 240000 },
    create: { id: rid(businessId, "wc1"), workspaceId, businessId, kind: "receivable", counterparty: "Hotel client", amount: 240000, dueDate: new Date(now.getTime() - 10 * 86_400_000), status: "open" },
  });

  const capacitySafe = ids.capacityGrowthSafe ?? false;
  await db.ownerCapacitySnapshot.upsert({
    where: { id: rid(businessId, "cap1") },
    update: {},
    create: {
      id: rid(businessId, "cap1"), workspaceId, businessId, currentRevenue: 320000, safeUtilization: 0.7, resources: {},
      bottleneckUtilization: capacitySafe ? 0.6 : 1.1,
      growthCapacityRevenue: capacitySafe ? 80000 : 0,
      availableBuffer: capacitySafe ? 40000 : -20000,
      expansionTriggered: false,
      growthSafe: capacitySafe,
      createdAt: periodEnd,
    },
  });

  if (!ids.skipComplianceAndProof) {
    // complianceExpired=false → valid (+365 days), no proof (no compliance_block risk flag)
    // complianceExpired=true/undefined (default) → expired (-5 days), duplicateFlagged proof
    const expiredMode = ids.complianceExpired !== false;
    await db.ownerComplianceItem.upsert({
      where: { id: rid(businessId, "cmp1") },
      update: {},
      create: {
        id: rid(businessId, "cmp1"), workspaceId, businessId, kind: "trade_licence",
        name: "Trade licence", status: "active",
        expiresAt: new Date(now.getTime() + (expiredMode ? -5 : 365) * 86_400_000),
        createdByUserId: userId,
      },
    });

    if (expiredMode) {
      await db.proof.upsert({
        where: { id: rid(businessId, "prf1") },
        update: {},
        create: { id: rid(businessId, "prf1"), workspaceId, businessId, proofType: "delivery", status: "REQUIRED", duplicateFlagged: true },
      });
    }
  }

  await db.ownerWorkloadSnapshot.upsert({
    where: { id: rid(businessId, "wl1") },
    update: {},
    create: { id: rid(businessId, "wl1"), workspaceId, businessId, ownerMinutesPerDay: 600, sustainableMinutesPerDay: 360, ownerTasks: 22, ownerOnlyCriticalTasks: 9, dailyLoad: 1.6, dailyLoadPct: 167, band: "overloaded", bottleneckRisk: true, overloaded: true, recommendedPath: "delegate_with_proof", createdAt: periodEnd },
  });

  await db.ownerStandingInstruction.upsert({
    where: { id: rid(businessId, "si1") },
    update: {},
    create: { id: rid(businessId, "si1"), workspaceId, businessId, scope: "pricing.routine", allowedActionTypes: ["routine_discount"], forbiddenActionTypes: ["expansion"], riskClass: "low", status: "active", createdByUserId: userId },
  });

  await db.behavioralLearningArtifact.upsert({
    where: { id: rid(businessId, "art1") },
    update: {},
    create: {
      id: rid(businessId, "art1"), sourceCaseId: "A1", businessType: "laundry_dry_cleaning", archetype: "laundry_dry_cleaning",
      locationKey: "India|tier1", failureLabel: "bad_cash_advice", originalFailedBehavior: "spent in crisis",
      correctedBehavior: "block discretionary spend until margin proof", scopeArchetype: "laundry_dry_cleaning",
      scopeDecisionCategory: "cash_margin_working_capital", riskLevel: "high", approvalStatus: "pending",
      scope: "local_only", privacyClassification: "workspace_private", workspaceId, version: 1, active: true,
      createdAt: now.toISOString(), auditTrail: [{ at: now.toISOString(), actor: "seed", action: "created" }],
    },
  });

  return ids;
}

/** Remove the seeded rows (governed cleanup for the test). */
export async function cleanupOwnerDbCase(db: PrismaClient, ids: OwnerDbCaseIds): Promise<void> {
  const { workspaceId, businessId } = ids;
  await db.behavioralLearningArtifact.deleteMany({ where: { id: rid(businessId, "art1") } });
  await db.ownerStandingInstruction.deleteMany({ where: { id: rid(businessId, "si1") } });
  await db.ownerWorkloadSnapshot.deleteMany({ where: { id: rid(businessId, "wl1") } });
  if (!ids.skipComplianceAndProof) {
    if (ids.complianceExpired !== false) {
      await db.proof.deleteMany({ where: { id: rid(businessId, "prf1") } });
    }
    await db.ownerComplianceItem.deleteMany({ where: { id: rid(businessId, "cmp1") } });
  }
  await db.ownerCapacitySnapshot.deleteMany({ where: { id: rid(businessId, "cap1") } });
  await db.ownerWorkingCapitalItem.deleteMany({ where: { workspaceId, businessId } });
  await db.ownerFinancialSnapshot.deleteMany({ where: { id: rid(businessId, "fin1") } });
  await db.ownerCashflowSnapshot.deleteMany({ where: { id: rid(businessId, "cf1") } });
  // owner_goals.business_id is ON DELETE RESTRICT: remove this test business's goals first.
  await db.ownerGoal.deleteMany({ where: { businessId } });
  await db.ownerBusiness.deleteMany({ where: { id: businessId } });
}
