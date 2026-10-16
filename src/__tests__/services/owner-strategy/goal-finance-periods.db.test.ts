/**
 * Net Profit goals read the SAME evidence Money saves. `[db]`-gated regression for the hostile-audit defect
 * "0 period(s) with data" despite three saved financial snapshots (goals read only the recovery metric store).
 *
 * Contract proven: a period is usable for a PROFIT goal when it is a completed, current (un-amended) Finance snapshot
 * in the goal's currency whose net profit is DERIVABLE (fixed + variable costs both known — an explicit 0 counts, an
 * UNKNOWN half does not); the recovery results fill only periods Finance does not have; no period counts twice.
 */
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { computeGoalTrajectoryView, createGoal } from "@/services/owner-strategy/goal.service";

const actor = randomUUID();
const workspaces: string[] = [];
const future = (days: number) => new Date(Date.now() + days * 86_400_000);

async function setup(currency = "INR") {
  const ws = randomUUID();
  workspaces.push(ws);
  const businessId = randomUUID();
  await db.ownerBusiness.create({ data: { id: businessId, workspaceId: ws, name: "Goals Co", businessType: "laundry_local_service", currency, updatedAt: new Date() } });
  return { ws, businessId };
}

async function finSnapshot(t: { ws: string; businessId: string }, month: number, fields: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return db.ownerFinancialSnapshot.create({
    data: {
      id: randomUUID(), workspaceId: t.ws, businessId: t.businessId,
      periodStart: new Date(Date.UTC(2026, month, 1)), periodEnd: new Date(Date.UTC(2026, month + 1, 0)),
      currency: "INR", dataConfidenceScore: 80, missingCriticalData: [], updatedAt: new Date(), ...fields, ...extra,
    },
  });
}

async function profitView(t: { ws: string; businessId: string }) {
  const goalId = await createGoal({ workspaceId: t.ws, actorId: actor, businessId: t.businessId, targetType: "PROFIT", targetAmount: 100000, targetDate: future(365) });
  const goal = await db.ownerGoal.findUniqueOrThrow({ where: { id: goalId } });
  return computeGoalTrajectoryView({ ...(goal as object), targetDate: goal.targetDate } as never);
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] goals read Finance snapshots through one definition of a usable period", () => {
  beforeAll(async () => {
    await db.user.upsert({ where: { id: actor }, update: {}, create: { id: actor, email: `gfp-${actor}@example.com`, name: "GFP", isActive: true, updatedAt: new Date() } });
  });
  afterAll(async () => {
    await db.ownerGoal.deleteMany({ where: { workspaceId: { in: workspaces } } });
    await db.ownerMetricSnapshot.deleteMany({ where: { workspaceId: { in: workspaces } } });
    await db.ownerFinancialSnapshot.deleteMany({ where: { workspaceId: { in: workspaces } } });
    await db.ownerBusiness.deleteMany({ where: { workspaceId: { in: workspaces } } });
    await db.auditEvent.deleteMany({ where: { actorId: actor } });
    await db.user.delete({ where: { id: actor } });
  });

  it("[db] three valid consecutive Finance periods (80,000 / 20,000 fixed / 35,000 variable) → exactly three qualifying periods, profit 25,000 each", async () => {
    const t = await setup();
    for (const m of [5, 6, 7]) await finSnapshot(t, m, { revenue: 80000, fixedCosts: 20000, variableCosts: 35000 });
    const view = await profitView(t);
    expect(view.dataWindow?.periods).toBe(3);
    expect(view.trajectory.confidenceRationale).not.toMatch(/period\(s\) with data/);
    expect(view.trajectory.currentValue).toBe(25000);
  });

  it("[db] an UNKNOWN cost half is not a usable profit period (never treated as zero cost)", async () => {
    const t = await setup();
    for (const m of [5, 6, 7]) await finSnapshot(t, m, { revenue: 80000, fixedCosts: 20000 });
    const view = await profitView(t);
    expect(view.trajectory.confidenceRationale).toMatch(/only 0 period\(s\) with data/);
  });

  it("[db] an explicit 0 cost is KNOWN and counts (distinct from UNKNOWN)", async () => {
    const t = await setup();
    for (const m of [5, 6, 7]) await finSnapshot(t, m, { revenue: 80000, fixedCosts: 20000, variableCosts: 0 });
    const view = await profitView(t);
    expect(view.trajectory.confidenceRationale).not.toMatch(/period\(s\) with data/);
    expect(view.trajectory.currentValue).toBe(60000);
  });

  it("[db] an amended (superseded) period is replaced by its current version and counted once", async () => {
    const t = await setup();
    const newId = randomUUID();
    const old = await finSnapshot(t, 5, { revenue: 10, fixedCosts: 1, variableCosts: 1 });
    await finSnapshot(t, 5, { id: newId, version: 2, revenue: 80000, fixedCosts: 20000, variableCosts: 35000 });
    await db.ownerFinancialSnapshot.update({ where: { id: old.id }, data: { supersededById: newId } });
    await finSnapshot(t, 6, { revenue: 80000, fixedCosts: 20000, variableCosts: 35000 });
    await finSnapshot(t, 7, { revenue: 80000, fixedCosts: 20000, variableCosts: 35000 });
    const view = await profitView(t);
    expect(view.dataWindow?.periods).toBe(3);
  });

  it("[db] a recovery result and a Finance snapshot for the SAME period count once; recovery fills other periods", async () => {
    const t = await setup();
    await finSnapshot(t, 6, { revenue: 80000, fixedCosts: 20000, variableCosts: 35000 });
    await finSnapshot(t, 7, { revenue: 80000, fixedCosts: 20000, variableCosts: 35000 });
    const rec = (month: number, netProfit: number) =>
      db.ownerMetricSnapshot.create({
        data: { id: randomUUID(), workspaceId: t.ws, businessId: t.businessId, periodStart: new Date(Date.UTC(2026, month, 1)), periodEnd: new Date(Date.UTC(2026, month + 1, 0)), currency: "INR", revenue: 1, netProfit, updatedAt: new Date() },
      });
    await rec(7, 999); // same period as a Finance snapshot → Finance wins, not double counted
    await rec(5, 5000); // a period Finance lacks → recovery fills it
    const view = await profitView(t);
    expect(view.dataWindow?.periods).toBe(3);
    expect(view.trajectory.currentValue).toBe(25000);
  });

  it("[db] snapshots in another currency are excluded and reported, never converted", async () => {
    const t = await setup("INR");
    await finSnapshot(t, 6, { revenue: 80000, fixedCosts: 20000, variableCosts: 35000 }, { currency: "USD" });
    const view = await profitView(t);
    expect(view.dataWindow).toBeNull();
    expect(view.excludedSnapshotCount).toBe(1);
  });
});
