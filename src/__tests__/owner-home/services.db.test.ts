/**
 * Owner Home (Module 12 Slice 2) — service-layer proof (DB-backed).
 *
 * `[db]`-gated → runs only under TEST_WITH_DB=true against a real PostgreSQL with the
 * proven owner-domain migrations applied. Proves the §19 owner-home summary is built
 * from a real persisted finance diagnosis cycle (business health, danger surfaces,
 * top risks, today's required actions) and that a recorded verified improvement is
 * surfaced. Owns no table.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-home/services.db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { createFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import { runFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import { updateFinanceAction } from "@/services/owner-finance/action.service";
import { recordFinanceVerification } from "@/services/owner-finance/verification.service";
import { getOwnerHome } from "@/services/owner-home/home.service";
import { createSalesSnapshot } from "@/services/owner-sales/snapshot.service";
import { runSalesDiagnosis } from "@/services/owner-sales/diagnosis.service";
import { updateSalesAction } from "@/services/owner-sales/action.service";
import { recordSalesVerification } from "@/services/owner-sales/verification.service";
import { createOperationsSnapshot } from "@/services/owner-operations/snapshot.service";
import { runOperationsDiagnosis } from "@/services/owner-operations/diagnosis.service";
import { updateOperationsAction } from "@/services/owner-operations/action.service";
import { recordOperationsVerification } from "@/services/owner-operations/verification.service";
import { createSopSnapshot } from "@/services/owner-sop/snapshot.service";
import { runSopDiagnosis } from "@/services/owner-sop/diagnosis.service";
import { updateSopAction } from "@/services/owner-sop/action.service";
import { recordSopVerification } from "@/services/owner-sop/verification.service";
import { createStrategySnapshot } from "@/services/owner-strategy/snapshot.service";
import { runStrategyDiagnosis } from "@/services/owner-strategy/diagnosis.service";
import { updateStrategyAction } from "@/services/owner-strategy/action.service";
import { recordStrategyVerification } from "@/services/owner-strategy/verification.service";

const actor = randomUUID();
const ws = () => randomUUID();

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `home-test-${actor}@example.com`, name: "Home Test", isActive: true, updatedAt: new Date() },
  });
});

async function newBusiness(workspaceId: string) {
  const b = await createBusiness(
    { name: "Home Svc Test", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
    actor,
    workspaceId
  );
  return b.id;
}

function leakySnapshot() {
  return {
    periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR",
    revenue: 100000, fixedCosts: 40000, variableCosts: 40000, discountAmount: 15000, cashOnHand: 50000,
  };
}

function salesDistressSnapshot() {
  return {
    periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR",
    leads: 1000, qualifiedLeads: 400, orders: 30, revenue: 60000,
    newCustomers: 12, repeatCustomers: 3, lostCustomers: 25, complaints: 6,
    discountAmount: 18000, refundAmount: 6000, b2bRevenue: 10000, b2cRevenue: 50000,
    b2bPipelineValue: 6000,
  };
}

function operationsOverloadSnapshot() {
  return {
    periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR",
    ordersReceived: 1500, ordersCompleted: 900, ordersDelayed: 500, reworkCount: 180,
    complaints: 120, staffHours: 400, machineCapacityUnits: 1000, idleHours: 120,
    deliveryAttempts: 900, deliveryFailures: 200, inventoryShortages: 4,
    sopChecks: 100, sopMisses: 50,
  };
}

function sopBreakdownSnapshot() {
  return {
    periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR",
    actionsAssigned: 100, actionsCompleted: 50, actionsVerified: 10, actionsOverdue: 40,
    actionsDisputed: 8, actionsReassigned: 30, repeatedFailures: 30, proofRequired: 40,
    proofProvided: 10, recurringProcesses: 20, documentedSops: 5,
  };
}

function strategyAvoidScenario() {
  return {
    periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR",
    optionName: "Open a second branch", currentRevenue: 500000, expectedRevenueChange: 20000,
    costChange: 60000, investmentRequired: 800000, timeToImpactMonths: 12,
    riskLevel: "high" as const, cashAvailable: 100000, capacityImpactPct: 80, staffImpact: 4,
  };
}

describe("[db] Owner Home service", () => {
  it("[db] builds the §19 owner-home summary from a real finance cycle", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createFinancialSnapshot(businessId, leakySnapshot(), actor, workspaceId);
    const cycle = await runFinanceDiagnosis(businessId, snap.id, actor, workspaceId);
    expect(cycle.findings.length).toBeGreaterThan(0);

    const home = await getOwnerHome(workspaceId, businessId);
    expect(home.hasData).toBe(true);
    expect(home.domainsWired).toContain("finance");
    const s = home.summary!;
    expect(typeof s.businessHealthScore).toBe("number");
    // finance has no cashflow/sales/operations diagnosis → those dangers are unknown.
    expect(s.cashDanger.level).toBe("unknown");
    expect(s.salesDanger.level).toBe("unknown");
    // a leaky finance snapshot produces at least one risk + at least one required action.
    expect(s.top3Risks.length).toBeGreaterThan(0);
    expect(s.top3Risks.length).toBeLessThanOrEqual(3);
    expect(s.requiredActions.length).toBeGreaterThan(0);
    expect(s.requiredActions.length).toBeLessThanOrEqual(5);
    expect(s.lastVerifiedImprovement).toBeNull();

    await teardownOwnerBusiness(businessId);
  });

  it("[db] surfaces the last verified improvement after a verified action", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createFinancialSnapshot(businessId, leakySnapshot(), actor, workspaceId);
    const cycle = await runFinanceDiagnosis(businessId, snap.id, actor, workspaceId);
    const action = cycle.actions[0];

    await updateFinanceAction(action.id, { status: "assigned" }, actor, workspaceId);
    await updateFinanceAction(action.id, { status: "in_progress" }, actor, workspaceId);
    await recordFinanceVerification(
      action.id,
      { beforeValue: 15, afterValue: 8, targetDirection: "down", targetValue: 10 },
      actor,
      workspaceId
    );

    const home = await getOwnerHome(workspaceId, businessId);
    const last = home.summary!.lastVerifiedImprovement;
    expect(last).not.toBeNull();
    expect(last!.domain).toBe("finance");
    expect(last!.beforeValue).toBe(15);
    expect(last!.afterValue).toBe(8);

    await teardownOwnerBusiness(businessId);
  });

  it("[db] empty business has no summary (nothing invented)", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const home = await getOwnerHome(workspaceId, businessId);
    expect(home.hasData).toBe(false);
    expect(home.summary).toBeNull();
    await teardownOwnerBusiness(businessId);
  });

  it("[db] enforces workspace isolation (cross-workspace business is NotFound)", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createFinancialSnapshot(businessId, leakySnapshot(), actor, workspaceId);
    await runFinanceDiagnosis(businessId, snap.id, actor, workspaceId);

    // A different workspace requesting this business id falls back to its own (none) →
    // never returns the foreign business's data.
    const foreign = await getOwnerHome(ws(), businessId);
    expect(foreign.selectedBusinessId).toBeNull();
    expect(foreign.hasData).toBe(false);

    await teardownOwnerBusiness(businessId);
  });

  // DC-PROJ-001 regression: sales, operations, sop, strategy each trigger re-diagnosis
  // on verification success (creating a new cycle). Verifications must be visible in
  // getOwnerHome even after the new cycle exists — i.e. queried directly, not through
  // the newest cycle's action chain.

  it("[db] DC-PROJ-001: sales verified improvement survives re-diagnosis cycle rollover", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createSalesSnapshot(businessId, salesDistressSnapshot(), actor, workspaceId);
    const cycle = await runSalesDiagnosis(businessId, snap.id, actor, workspaceId);
    expect(cycle.actions.length).toBeGreaterThan(0);
    const action = cycle.actions[0];

    await updateSalesAction(action.id, { status: "assigned" }, actor, workspaceId);
    await updateSalesAction(action.id, { status: "in_progress" }, actor, workspaceId);
    await recordSalesVerification(
      action.id,
      { beforeValue: 15, afterValue: 8, targetDirection: "down", targetValue: 10 },
      actor,
      workspaceId
    );

    const home = await getOwnerHome(workspaceId, businessId);
    expect(home.hasData).toBe(true);
    const last = home.summary!.lastVerifiedImprovement;
    expect(last).not.toBeNull();
    expect(last!.domain).toBe("sales");
    expect(last!.beforeValue).toBe(15);
    expect(last!.afterValue).toBe(8);

    await teardownOwnerBusiness(businessId);
  });

  it("[db] DC-PROJ-001: operations verified improvement survives re-diagnosis cycle rollover", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createOperationsSnapshot(businessId, operationsOverloadSnapshot(), actor, workspaceId);
    const cycle = await runOperationsDiagnosis(businessId, snap.id, actor, workspaceId);
    expect(cycle.actions.length).toBeGreaterThan(0);
    const action = cycle.actions[0];

    await updateOperationsAction(action.id, { status: "assigned" }, actor, workspaceId);
    await updateOperationsAction(action.id, { status: "in_progress" }, actor, workspaceId);
    await recordOperationsVerification(
      action.id,
      { beforeValue: 15, afterValue: 8, targetDirection: "down", targetValue: 10 },
      actor,
      workspaceId
    );

    const home = await getOwnerHome(workspaceId, businessId);
    expect(home.hasData).toBe(true);
    const last = home.summary!.lastVerifiedImprovement;
    expect(last).not.toBeNull();
    expect(last!.domain).toBe("operations");
    expect(last!.beforeValue).toBe(15);
    expect(last!.afterValue).toBe(8);

    await teardownOwnerBusiness(businessId);
  });

  it("[db] DC-PROJ-001: sop verified improvement survives re-diagnosis cycle rollover", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createSopSnapshot(businessId, sopBreakdownSnapshot(), actor, workspaceId);
    const cycle = await runSopDiagnosis(businessId, snap.id, actor, workspaceId);
    expect(cycle.actions.length).toBeGreaterThan(0);
    const action = cycle.actions[0];

    await updateSopAction(action.id, { status: "assigned" }, actor, workspaceId);
    await updateSopAction(action.id, { status: "in_progress" }, actor, workspaceId);
    await recordSopVerification(
      action.id,
      { beforeValue: 15, afterValue: 8, targetDirection: "down", targetValue: 10 },
      actor,
      workspaceId
    );

    const home = await getOwnerHome(workspaceId, businessId);
    expect(home.hasData).toBe(true);
    const last = home.summary!.lastVerifiedImprovement;
    expect(last).not.toBeNull();
    expect(last!.domain).toBe("sop");
    expect(last!.beforeValue).toBe(15);
    expect(last!.afterValue).toBe(8);

    await teardownOwnerBusiness(businessId);
  });

  it("[db] DC-PROJ-001: strategy verified improvement survives re-diagnosis cycle rollover", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const snap = await createStrategySnapshot(businessId, strategyAvoidScenario(), actor, workspaceId);
    const cycle = await runStrategyDiagnosis(businessId, snap.id, actor, workspaceId);
    expect(cycle.actions.length).toBeGreaterThan(0);
    const action = cycle.actions[0];

    await updateStrategyAction(action.id, { status: "assigned" }, actor, workspaceId);
    await updateStrategyAction(action.id, { status: "in_progress" }, actor, workspaceId);
    await recordStrategyVerification(
      action.id,
      { beforeValue: 15, afterValue: 8, targetDirection: "down", targetValue: 10 },
      actor,
      workspaceId
    );

    const home = await getOwnerHome(workspaceId, businessId);
    expect(home.hasData).toBe(true);
    const last = home.summary!.lastVerifiedImprovement;
    expect(last).not.toBeNull();
    expect(last!.domain).toBe("strategy");
    expect(last!.beforeValue).toBe(15);
    expect(last!.afterValue).toBe(8);

    await teardownOwnerBusiness(businessId);
  });
});
