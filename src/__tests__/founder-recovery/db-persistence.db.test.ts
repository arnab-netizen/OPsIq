/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows; explicit any is pragmatic here */
/**
 * DB-backed persistence proof for Owner Recovery Mode.
 *
 * Gated by the `[db]` tag → only runs under TEST_WITH_DB=true against a real
 * PostgreSQL (see .env.test). These tests assert real INSERT/SELECT/UPDATE
 * round-trips through the actual services — NOT mocks.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/founder-recovery/db-persistence.db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { createBusiness, getBusiness, listBusinesses } from "@/services/founder-recovery/business.service";
import { createSnapshot } from "@/services/founder-recovery/snapshot.service";
import { runCycle } from "@/services/founder-recovery/cycle.service";
import { updateRecoveryAction } from "@/services/founder-recovery/action.service";
import { recordVerification } from "@/services/founder-recovery/verification.service";
import { getRecoveryDashboard } from "@/services/founder-recovery/dashboard.service";

const ws = () => randomUUID();
const actor = randomUUID();

// Audit events enforce actor_id -> users(id); seed a real user for the actor.
beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: {
      id: actor,
      email: `owner-recovery-test-${actor}@example.com`,
      name: "Owner Recovery Test",
      isActive: true,
      updatedAt: new Date(),
    },
  });
});

function failingPeriod1(currency = "INR") {
  return {
    periodStart: "2026-04-01",
    periodEnd: "2026-04-30",
    currency,
    revenue: 100000,
    totalCosts: 95000,
    orderCount: 1000,
    newCustomers: 70,
    repeatCustomers: 30, // 30% -> WEAK_REPEAT_RATE (high)
    deliveryCost: 12000, // 12% -> DELIVERY_COST_LEAKAGE (high)
  };
}

describe("[db] Owner Recovery persistence", () => {
  it("[db] persists a business and reads it back (workspace-scoped)", async () => {
    const workspaceId = ws();
    const business = await createBusiness(
      { name: "Tumbledry DB Test", businessType: "laundry_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
      actor,
      workspaceId
    );
    expect(business.id).toBeTruthy();

    const row = await db.ownerBusiness.findUnique({ where: { id: business.id } });
    expect(row).not.toBeNull();
    expect(row.name).toBe("Tumbledry DB Test");
    expect(row.currency).toBe("INR");
    expect(row.workspaceId).toBe(workspaceId);

    const list = await listBusinesses(workspaceId);
    expect(list.map((b: any) => b.id)).toContain(business.id);
  });

  it("[db] runs a full cycle: snapshot -> findings -> actions persisted", async () => {
    const workspaceId = ws();
    const business = await createBusiness(
      { name: "Laundry Cycle", businessType: "laundry_local_service", currency: "INR" },
      actor,
      workspaceId
    );
    const snap = await createSnapshot(business.id, failingPeriod1() as any, actor, workspaceId);

    const cycle = await runCycle(business.id, snap.id, actor, workspaceId);
    expect(cycle.cycleNumber).toBe(1);

    // Findings persisted with evidence + threshold + source metric.
    const findings = await db.recoveryFinding.findMany({ where: { cycleId: cycle.id } });
    const codes = findings.map((f: any) => f.code);
    expect(codes).toContain("WEAK_REPEAT_RATE");
    expect(codes).toContain("DELIVERY_COST_LEAKAGE");
    for (const f of findings) {
      expect(f.sourceMetric).toBeTruthy();
      expect(f.evidence.length).toBeGreaterThan(0);
      expect(f.verificationMetric).toBeTruthy();
    }

    // Actions persisted WITH owner/due/metric/baseline/target preserved.
    const actions = await db.recoveryAction.findMany({ where: { cycleId: cycle.id } });
    expect(actions.length).toBeGreaterThan(0);
    for (const a of actions) {
      expect(a.assignedToRole).toBeTruthy();
      expect(a.dueAt).not.toBeNull();
      expect(a.metricToMove).toBeTruthy();
      expect(a.completionCriteria.length).toBeGreaterThan(0);
    }
  });

  it("[db] dashboard reflects persisted findings, actions and empty state", async () => {
    const workspaceId = ws();

    // Empty state first.
    const empty = await getRecoveryDashboard(workspaceId, null);
    expect(empty.hasData).toBe(false);
    expect(empty.businesses).toHaveLength(0);

    const business = await createBusiness(
      { name: "Dash Laundry", businessType: "laundry_local_service", currency: "INR" },
      actor,
      workspaceId
    );
    const snap = await createSnapshot(business.id, failingPeriod1() as any, actor, workspaceId);
    await runCycle(business.id, snap.id, actor, workspaceId);

    const dash = await getRecoveryDashboard(workspaceId, business.id);
    expect(dash.hasData).toBe(true);
    expect(dash.selectedBusinessId).toBe(business.id);
    expect(dash.latestCycle).not.toBeNull();
    expect(dash.latestCycle.findings.length).toBeGreaterThan(0);
    expect(dash.latestCycle.actions.length).toBeGreaterThan(0);
  });

  it("[db] executes action through status machine and verifies before/after outcome", async () => {
    const workspaceId = ws();
    const business = await createBusiness(
      { name: "Verify Laundry", businessType: "laundry_local_service", currency: "INR" },
      actor,
      workspaceId
    );
    const snap = await createSnapshot(business.id, failingPeriod1() as any, actor, workspaceId);
    const cycle = await runCycle(business.id, snap.id, actor, workspaceId);

    const repeatAction: any = cycle.actions.find((a: any) => a.metricToMove === "repeatCustomerRatePct");
    expect(repeatAction).toBeTruthy();
    expect(repeatAction.baselineValue).toBe(30);
    expect(repeatAction.direction).toBe("up");

    // proposed -> assigned -> in_progress -> completed (with evidence)
    const v = repeatAction.version;
    const a1 = await updateRecoveryAction(repeatAction.id, { status: "assigned", version: v }, actor, workspaceId);
    const a2 = await updateRecoveryAction(repeatAction.id, { status: "in_progress", version: a1.version }, actor, workspaceId);
    const a3 = await updateRecoveryAction(
      repeatAction.id,
      { status: "completed", version: a2.version, completionNotes: "Reactivation campaign sent", actualOutcome: "Repeat rate climbed" },
      actor,
      workspaceId
    );
    expect(a3.status).toBe("completed");
    expect(a3.completedAt).not.toBeNull();

    // Verify with a real AFTER value that reaches the target.
    const { verification, result } = await recordVerification(
      repeatAction.id,
      { afterValue: 60 },
      actor,
      workspaceId
    );
    expect(result.status).toBe("verified_improved");
    expect(result.reachedTarget).toBe(true);

    const persisted = await db.recoveryVerification.findUnique({ where: { id: verification.id } });
    expect(persisted.status).toBe("verified_improved");
    expect(persisted.afterValue).toBe(60);
    expect(persisted.baselineValue).toBe(30);
  });

  it("[db] rejects an invalid status transition", async () => {
    const workspaceId = ws();
    const business = await createBusiness(
      { name: "Transition Laundry", businessType: "laundry_local_service", currency: "INR" },
      actor,
      workspaceId
    );
    const snap = await createSnapshot(business.id, failingPeriod1() as any, actor, workspaceId);
    const cycle = await runCycle(business.id, snap.id, actor, workspaceId);
    const action: any = cycle.actions[0];

    // proposed -> completed is not allowed.
    await expect(
      updateRecoveryAction(action.id, { status: "completed", version: action.version, completionNotes: "x", actualOutcome: "y" }, actor, workspaceId)
    ).rejects.toThrow(/Invalid recovery action transition/);
  });

  it("[db] runs a second cycle linked to the first (closed loop)", async () => {
    const workspaceId = ws();
    const business = await createBusiness(
      { name: "Loop Laundry", businessType: "laundry_local_service", currency: "INR" },
      actor,
      workspaceId
    );
    const snap1 = await createSnapshot(business.id, failingPeriod1() as any, actor, workspaceId);
    const cycle1 = await runCycle(business.id, snap1.id, actor, workspaceId);

    const snap2 = await createSnapshot(
      business.id,
      {
        periodStart: "2026-05-01",
        periodEnd: "2026-05-31",
        currency: "INR",
        revenue: 120000,
        totalCosts: 96000,
        orderCount: 1100,
        newCustomers: 50,
        repeatCustomers: 70, // 58% repeat -> resolves WEAK_REPEAT_RATE
        deliveryCost: 9000, // 7.5% -> resolves DELIVERY_COST_LEAKAGE
      } as any,
      actor,
      workspaceId
    );
    const cycle2 = await runCycle(business.id, snap2.id, actor, workspaceId);

    expect(cycle2.cycleNumber).toBe(2);
    expect(cycle2.previousCycleId).toBe(cycle1.id);

    const codes2 = cycle2.findings.map((f: any) => f.code);
    expect(codes2).not.toContain("WEAK_REPEAT_RATE");
    expect(codes2).not.toContain("DELIVERY_COST_LEAKAGE");
  });

  it("[db] enforces workspace isolation across businesses", async () => {
    const wsA = ws();
    const wsB = ws();
    const business = await createBusiness(
      { name: "Isolated Laundry", businessType: "laundry_local_service", currency: "INR" },
      actor,
      wsA
    );

    // WS-B cannot read WS-A's business.
    await expect(getBusiness(business.id, wsB)).rejects.toThrow();
    const listB = await listBusinesses(wsB);
    expect(listB.map((b: any) => b.id)).not.toContain(business.id);

    // WS-B dashboard does not surface WS-A data.
    const dashB = await getRecoveryDashboard(wsB, business.id);
    expect(dashB.businesses.map((b: any) => b.id)).not.toContain(business.id);
  });

  it("[db] rejects a duplicate snapshot for the same business/period", async () => {
    const workspaceId = ws();
    const business = await createBusiness(
      { name: "Dup Laundry", businessType: "laundry_local_service", currency: "INR" },
      actor,
      workspaceId
    );
    await createSnapshot(business.id, failingPeriod1() as any, actor, workspaceId);
    await expect(createSnapshot(business.id, failingPeriod1() as any, actor, workspaceId)).rejects.toThrow();
  });
});
