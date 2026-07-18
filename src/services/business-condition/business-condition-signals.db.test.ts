/**
 * [db]-gated integration test: business-condition signal derivation from real DB records.
 *
 * Proves that `getOwnerNowView` correctly derives the 11 `BusinessConditionProfile` risk-dimension
 * fields from real PostgreSQL records, returns "unknown" for absent data, is workspace-isolated,
 * and is deterministic across consecutive reads.
 *
 * Requires TEST_WITH_DB=true with migrations applied.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { getOwnerNowView, type GuidanceDeps } from "@/services/owner-guidance/owner-now-view.service";
import type { PrismaClient } from "@/generated/prisma/client";

const prisma = db as unknown as PrismaClient;

// Stable IDs — deterministic cleanup even if the test suite aborts
const WS_A = randomUUID(); // seeded: CRITICAL cashflow → cashPressureLevel="CRITICAL"
const WS_B = randomUUID(); // empty workspace → all signals "unknown"
const BIZ_A = randomUUID();
const USER = randomUUID();
const NOW = new Date("2026-07-17T00:00:00Z");
const PERIOD_START = new Date(NOW.getTime() - 30 * 86_400_000);

// Minimal deps for getOwnerNowView — only required fields; all optional functions omitted.
// Cast through unknown because GuidanceDeps.db is a typed select-interface that is a subset
// of PrismaClient but does not share the same generic Prisma return types.
const minDeps = { db: prisma as unknown as GuidanceDeps["db"], uuid: () => randomUUID(), now: () => NOW.getTime() } satisfies Partial<GuidanceDeps> as unknown as GuidanceDeps;

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] business-condition signal derivation — real PostgreSQL", () => {
  beforeAll(async () => {
    // User and workspaces
    await (prisma as unknown as Record<string, { upsert: (a: unknown) => Promise<unknown> }>).user.upsert({
      where: { id: USER },
      update: {},
      create: { id: USER, email: `bcsig-${USER.slice(0, 8)}@test.local`, name: "BC Signal Test", isActive: true, updatedAt: NOW },
    });
    for (const wid of [WS_A, WS_B]) {
      await (prisma as unknown as Record<string, { upsert: (a: unknown) => Promise<unknown> }>).workspace.upsert({
        where: { id: wid },
        update: {},
        create: { id: wid, name: `BC Signal WS ${wid.slice(0, 8)}`, slug: `bc-ws-${wid.replace(/-/g, "").slice(0, 12)}`, createdBy: USER },
      });
    }

    // Workspace A — minimal set that drives: cashPressureLevel=CRITICAL, marginPressureLevel=HIGH,
    // executionCapacityLevel=CRITICAL, ownerDependencyRisk=HIGH, growthReadinessLevel=BLOCKED
    await prisma.ownerBusiness.create({
      data: {
        id: BIZ_A, workspaceId: WS_A,
        name: "BC Signal Test Biz", businessType: "laundry_dry_cleaning",
        location: "Kolkata", currency: "INR", createdBy: USER,
      },
    });

    // Cashflow snapshot (FK prerequisite for cycle)
    const cfSnapshotId = randomUUID();
    await (prisma as unknown as Record<string, { create: (a: unknown) => Promise<unknown> }>).ownerCashflowSnapshot.create({
      data: {
        id: cfSnapshotId, workspaceId: WS_A, businessId: BIZ_A,
        periodStart: PERIOD_START, periodEnd: NOW, currency: "INR",
        cashInHand: 500, bankBalance: 0, receivables: 0, receivablesOverdue: 0, payables: 80000,
        dataConfidenceScore: 0.9, missingCriticalData: [],
      },
    });

    // Cashflow cycle — cashflowState=CRITICAL drives cashPressureLevel=CRITICAL
    await (prisma as unknown as Record<string, { create: (a: unknown) => Promise<unknown> }>).ownerCashflowCycle.create({
      data: {
        id: randomUUID(), workspaceId: WS_A, businessId: BIZ_A, snapshotId: cfSnapshotId,
        sequenceNumber: 1, status: "active",
        healthScore: 0.05, dangerScore: 0.98, opportunityScore: 0.0,
        dataConfidenceScore: 0.9, cashflowState: "CRITICAL", generatedAt: NOW,
      },
    });

    // Finance snapshot (FK prerequisite for finance cycle)
    const finSnapshotId = randomUUID();
    await (prisma as unknown as Record<string, { create: (a: unknown) => Promise<unknown> }>).ownerFinancialSnapshot.create({
      data: {
        id: finSnapshotId, workspaceId: WS_A, businessId: BIZ_A,
        periodStart: PERIOD_START, periodEnd: NOW, currency: "INR",
        revenue: 100000, costOfGoods: 90000, fixedCosts: 20000, variableCosts: 5000,
        dataConfidenceScore: 0.9, missingCriticalData: [],
      },
    });

    // Finance cycle — survivalState=AT_RISK drives marginPressureLevel=HIGH
    await (prisma as unknown as Record<string, { create: (a: unknown) => Promise<unknown> }>).ownerFinanceCycle.create({
      data: {
        id: randomUUID(), workspaceId: WS_A, businessId: BIZ_A, snapshotId: finSnapshotId,
        sequenceNumber: 1, status: "active",
        overallHealthScore: 0.2, survivalRiskScore: 0.88, growthOpportunityScore: 0.0,
        dataConfidenceScore: 0.9, survivalState: "AT_RISK", generatedAt: NOW,
      },
    });

    // Workload snapshot — dailyLoadPct=167 (Int) → ownerLoadPct=1.67 after /100 fix → HIGH
    await (prisma as unknown as Record<string, { create: (a: unknown) => Promise<unknown> }>).ownerWorkloadSnapshot.create({
      data: {
        id: randomUUID(), workspaceId: WS_A, businessId: BIZ_A,
        ownerMinutesPerDay: 600, sustainableMinutesPerDay: 360,
        ownerTasks: 22, ownerOnlyCriticalTasks: 9, dailyLoad: 1.67, dailyLoadPct: 167,
        band: "overloaded", bottleneckRisk: true, overloaded: true,
        recommendedPath: "delegate_with_proof", createdAt: NOW,
      },
    });

    // Capacity snapshot — bottleneckUtilization=0.97 (97%) → executionCapacityLevel=CRITICAL
    await (prisma as unknown as Record<string, { create: (a: unknown) => Promise<unknown> }>).ownerCapacitySnapshot.create({
      data: {
        id: randomUUID(), workspaceId: WS_A, businessId: BIZ_A,
        currentRevenue: 100000, safeUtilization: 0.7, resources: {},
        bottleneckUtilization: 0.97, growthCapacityRevenue: 0, availableBuffer: -5000,
        expansionTriggered: false, growthSafe: false, createdAt: NOW,
      },
    });
  });

  afterAll(async () => {
    // Reverse FK order; deleteMany is safe even if rows don't exist
    for (const wid of [WS_A, WS_B]) {
      await (prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>).ownerGuidanceSnapshot
        .deleteMany({ where: { workspaceId: wid } });
    }
    await (prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>).ownerCashflowCycle
      .deleteMany({ where: { workspaceId: WS_A } });
    await (prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>).ownerFinanceCycle
      .deleteMany({ where: { workspaceId: WS_A } });
    await (prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>).ownerWorkloadSnapshot
      .deleteMany({ where: { workspaceId: WS_A } });
    await (prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>).ownerCapacitySnapshot
      .deleteMany({ where: { workspaceId: WS_A } });
    await (prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>).ownerFinancialSnapshot
      .deleteMany({ where: { workspaceId: WS_A } });
    await (prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>).ownerCashflowSnapshot
      .deleteMany({ where: { workspaceId: WS_A } });
    await prisma.ownerBusiness.deleteMany({ where: { id: BIZ_A } });
    for (const wid of [WS_A, WS_B]) {
      await (prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>).workspace
        .deleteMany({ where: { id: wid } });
    }
    await (prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>).user
      .deleteMany({ where: { id: USER } });
  });

  it("[db] derives correct risk levels from seeded CRITICAL records in workspace A", async () => {
    const result = await getOwnerNowView(WS_A, BIZ_A, minDeps);
    expect(result.derivedBusinessCondition).not.toBeNull();
    const bc = result.derivedBusinessCondition!;
    // cashflowState=CRITICAL → cashPressureLevel=CRITICAL
    expect(bc.cashPressureLevel).toBe("CRITICAL");
    // survivalState=AT_RISK → marginPressureLevel=HIGH
    expect(bc.marginPressureLevel).toBe("HIGH");
    // bottleneckUtilization=0.97 → 97% → executionCapacityLevel=CRITICAL
    expect(bc.executionCapacityLevel).toBe("CRITICAL");
    // dailyLoadPct=167 / 100 = 1.67 (≥0.85) → ownerDependencyRisk=HIGH (after unit fix)
    expect(bc.ownerDependencyRisk).toBe("HIGH");
    // cashPressureLevel=CRITICAL → growthReadinessLevel=BLOCKED
    expect(bc.growthReadinessLevel).toBe("BLOCKED");
  });

  it("[db] empty workspace B produces all-unknown business condition signals", async () => {
    const result = await getOwnerNowView(WS_B, null, minDeps);
    expect(result.derivedBusinessCondition).not.toBeNull();
    const bc = result.derivedBusinessCondition!;
    const unknownCount = Object.values(bc).filter((v) => v === "unknown").length;
    expect(unknownCount).toBe(11);
  });

  it("[db] signals are workspace-isolated — WS_A data does not bleed into WS_B", async () => {
    const [resA, resB] = await Promise.all([
      getOwnerNowView(WS_A, BIZ_A, minDeps),
      getOwnerNowView(WS_B, null, minDeps),
    ]);
    expect(resA.derivedBusinessCondition!.cashPressureLevel).toBe("CRITICAL");
    expect(resB.derivedBusinessCondition!.cashPressureLevel).toBe("unknown");
  });

  it("[db] signal derivation is deterministic — two consecutive reads return identical signals", async () => {
    const r1 = await getOwnerNowView(WS_A, BIZ_A, minDeps);
    const r2 = await getOwnerNowView(WS_A, BIZ_A, minDeps);
    expect(r1.derivedBusinessCondition).toEqual(r2.derivedBusinessCondition);
  });
});
