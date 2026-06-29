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
}

const uuid = (seed: string) => `00000000-0000-4000-8000-${seed.padStart(12, "0")}`;

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
    where: { id: uuid("cf1") },
    update: { cashInHand, periodEnd },
    create: { id: uuid("cf1"), workspaceId, businessId, periodStart, periodEnd, currency: "INR", cashInHand, bankBalance: 0, receivables: 240000, receivablesOverdue: 80000, payables: 30000, dataConfidenceScore: 0.8, missingCriticalData: [] },
  });

  await db.ownerFinancialSnapshot.upsert({
    where: { id: uuid("fin1") },
    update: { periodEnd },
    create: { id: uuid("fin1"), workspaceId, businessId, periodStart, periodEnd, currency: "INR", revenue: 320000, costOfGoods: 250000, fixedCosts: 60000, variableCosts: 20000, dataConfidenceScore: 0.8, missingCriticalData: [] },
  });

  await db.ownerWorkingCapitalItem.upsert({
    where: { id: uuid("wc1") },
    update: { amount: 240000 },
    create: { id: uuid("wc1"), workspaceId, businessId, kind: "receivable", counterparty: "Hotel client", amount: 240000, dueDate: new Date(now.getTime() - 10 * 86_400_000), status: "open" },
  });

  await db.ownerCapacitySnapshot.upsert({
    where: { id: uuid("cap1") },
    update: {},
    create: { id: uuid("cap1"), workspaceId, currentRevenue: 320000, safeUtilization: 0.7, resources: {}, bottleneckUtilization: 1.1, growthCapacityRevenue: 0, availableBuffer: -20000, expansionTriggered: false, growthSafe: false, createdAt: periodEnd },
  });

  await db.ownerComplianceItem.upsert({
    where: { id: uuid("cmp1") },
    update: {},
    create: { id: uuid("cmp1"), workspaceId, businessId, kind: "trade_licence", name: "Trade licence", status: "active", expiresAt: new Date(now.getTime() - 5 * 86_400_000), createdByUserId: userId },
  });

  await db.proof.upsert({
    where: { id: uuid("prf1") },
    update: {},
    create: { id: uuid("prf1"), workspaceId, proofType: "delivery", status: "REQUIRED", duplicateFlagged: true },
  });

  await db.ownerWorkloadSnapshot.upsert({
    where: { id: uuid("wl1") },
    update: {},
    create: { id: uuid("wl1"), workspaceId, ownerMinutesPerDay: 600, sustainableMinutesPerDay: 360, ownerTasks: 22, ownerOnlyCriticalTasks: 9, dailyLoad: 1.6, dailyLoadPct: 167, band: "overloaded", bottleneckRisk: true, overloaded: true, recommendedPath: "delegate_with_proof", createdAt: periodEnd },
  });

  await db.ownerStandingInstruction.upsert({
    where: { id: uuid("si1") },
    update: {},
    create: { id: uuid("si1"), workspaceId, scope: "pricing.routine", allowedActionTypes: ["routine_discount"], forbiddenActionTypes: ["expansion"], riskClass: "low", status: "active", createdByUserId: userId },
  });

  await db.behavioralLearningArtifact.upsert({
    where: { id: uuid("art1") },
    update: {},
    create: {
      id: uuid("art1"), sourceCaseId: "A1", businessType: "laundry_dry_cleaning", archetype: "laundry_dry_cleaning",
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
  await db.behavioralLearningArtifact.deleteMany({ where: { id: uuid("art1") } });
  await db.ownerStandingInstruction.deleteMany({ where: { id: uuid("si1") } });
  await db.ownerWorkloadSnapshot.deleteMany({ where: { id: uuid("wl1") } });
  await db.proof.deleteMany({ where: { id: uuid("prf1") } });
  await db.ownerComplianceItem.deleteMany({ where: { id: uuid("cmp1") } });
  await db.ownerCapacitySnapshot.deleteMany({ where: { id: uuid("cap1") } });
  await db.ownerWorkingCapitalItem.deleteMany({ where: { workspaceId, businessId } });
  await db.ownerFinancialSnapshot.deleteMany({ where: { id: uuid("fin1") } });
  await db.ownerCashflowSnapshot.deleteMany({ where: { id: uuid("cf1") } });
  await db.ownerBusiness.deleteMany({ where: { id: businessId } });
}
