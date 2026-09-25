/**
 * Phase 5: Owner Goal persistence — DB proof
 *
 * `[db]`-gated. Proves: goals persist to PostgreSQL; creating a new goal
 * marks the prior ACTIVE goal as REVISED (never two ACTIVE goals in one workspace);
 * markGoalAchieved transitions status; getActiveGoal returns null for empty workspace;
 * workspace isolation prevents cross-workspace reads.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/owner-strategy/goal.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import {
  createGoal,
  getActiveGoal,
  markGoalAchieved,
} from "@/services/owner-strategy/goal.service";
import { NotFoundError, ValidationError } from "@/infra/errors";

const actor = randomUUID();
const wsA = randomUUID();
const wsB = randomUUID();
const wsC = randomUUID();
const wsD = randomUUID();

/** Relative future date so the suite never expires (goals must target a future date). */
function future(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: {
      id: actor,
      email: `goal-${actor}@example.com`,
      name: "Goal Test",
      isActive: true,
      updatedAt: new Date(),
    },
  });
});

afterAll(async () => {
  await db.ownerGoalMilestone.deleteMany({ where: { workspaceId: wsA } });
  await db.ownerGoalMilestone.deleteMany({ where: { workspaceId: wsB } });
  await db.ownerGoal.deleteMany({ where: { workspaceId: wsA } });
  await db.ownerGoal.deleteMany({ where: { workspaceId: wsB } });
  await db.ownerGoal.deleteMany({ where: { workspaceId: { in: [wsC, wsD] } } });
  await db.ownerBusiness.deleteMany({ where: { workspaceId: { in: [wsC, wsD] } } });
  await db.auditEvent.deleteMany({ where: { actorId: actor } });
  await db.user.delete({ where: { id: actor } });
});

describe("[db] Phase 5 — Owner Goal persistence", () => {
  it("[db] persists a goal with all fields", async () => {
    const goalId = await createGoal({
      workspaceId: wsA,
      actorId: actor,
      targetType: "PROFIT",
      targetAmount: 10000,
      targetCurrency: "GBP",
      targetDate: future(270),
      baselineAmount: 3000,
      baselineDate: future(90),
    });

    expect(goalId).toBeTruthy();
    const row = await db.ownerGoal.findFirst({ where: { id: goalId } });
    expect(row).toBeTruthy();
    expect(row!.workspaceId).toBe(wsA);
    expect(row!.targetType).toBe("PROFIT");
    expect(row!.targetAmount).toBe(10000);
    expect(row!.targetCurrency).toBe("GBP");
    expect(row!.status).toBe("ACTIVE");
    expect(row!.baselineAmount).toBe(3000);
  });

  it("[db] creating a second goal marks the first ACTIVE goal as REVISED", async () => {
    const firstId = await createGoal({
      workspaceId: wsA,
      actorId: actor,
      targetType: "REVENUE",
      targetAmount: 50000,
      targetCurrency: "USD",
      targetDate: future(450),
    });

    const secondId = await createGoal({
      workspaceId: wsA,
      actorId: actor,
      targetType: "PROFIT",
      targetAmount: 12000,
      targetCurrency: "USD",
      targetDate: future(540),
    });

    const first = await db.ownerGoal.findFirst({ where: { id: firstId } });
    const second = await db.ownerGoal.findFirst({ where: { id: secondId } });

    expect(first!.status).toBe("REVISED");
    expect(second!.status).toBe("ACTIVE");

    // Only one ACTIVE goal exists in wsA
    const activeCount = await db.ownerGoal.count({ where: { workspaceId: wsA, status: "ACTIVE" } });
    expect(activeCount).toBe(1);
  });

  it("[db] getActiveGoal returns the current ACTIVE goal", async () => {
    const goal = await getActiveGoal(wsA);
    expect(goal).not.toBeNull();
    expect(goal!.status).toBe("ACTIVE");
    expect(goal!.workspaceId).toBe(wsA);
  });

  it("[db] getActiveGoal returns null for workspace with no goals", async () => {
    const emptyWs = randomUUID();
    const goal = await getActiveGoal(emptyWs);
    expect(goal).toBeNull();
  });

  it("[db] markGoalAchieved transitions status to ACHIEVED", async () => {
    const goalId = await createGoal({
      workspaceId: wsB,
      actorId: actor,
      targetType: "PROFIT",
      targetAmount: 5000,
      targetCurrency: "INR",
      targetDate: future(180),
    });

    await markGoalAchieved(goalId, wsB, actor);

    const row = await db.ownerGoal.findFirst({ where: { id: goalId } });
    expect(row!.status).toBe("ACHIEVED");
  });

  it("[db] markGoalAchieved throws NotFoundError for wrong workspace", async () => {
    const goalId = await createGoal({
      workspaceId: wsA,
      actorId: actor,
      targetType: "REVENUE",
      targetAmount: 20000,
      targetCurrency: "INR",
      targetDate: future(360),
    });

    await expect(markGoalAchieved(goalId, wsB, actor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("[db] getActiveGoal isolates by workspace — wsB goal not visible from wsA", async () => {
    await createGoal({
      workspaceId: wsB,
      actorId: actor,
      targetType: "REVENUE",
      targetAmount: 80000,
      targetCurrency: "INR",
      targetDate: future(630),
    });

    const wsAGoal = await getActiveGoal(wsA);
    const wsBGoal = await getActiveGoal(wsB);

    expect(wsAGoal?.workspaceId).toBe(wsA);
    expect(wsBGoal?.workspaceId).toBe(wsB);
    expect(wsAGoal?.id).not.toBe(wsBGoal?.id);
  });

  it("[db] rejects a goal whose target date is in the past (BIV-04)", async () => {
    await expect(
      createGoal({ workspaceId: wsA, actorId: actor, targetType: "PROFIT", targetAmount: 1, targetCurrency: "INR", targetDate: new Date("2020-01-01") })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("[db] omitted currency resolves to the workspace's single business currency — never USD (BIV-06)", async () => {
    await db.ownerBusiness.create({
      data: { id: randomUUID(), workspaceId: wsC, name: "INR biz", businessType: "laundry_local_service", currency: "INR", updatedAt: new Date() },
    });
    const goalId = await createGoal({ workspaceId: wsC, actorId: actor, targetType: "REVENUE", targetAmount: 100, targetDate: future(30) });
    const row = await db.ownerGoal.findUnique({ where: { id: goalId } });
    expect(row!.targetCurrency).toBe("INR");
  });

  it("[db] omitted currency with businesses in several currencies requires an explicit choice (BIV-06)", async () => {
    for (const currency of ["INR", "GBP"]) {
      await db.ownerBusiness.create({
        data: { id: randomUUID(), workspaceId: wsD, name: `${currency} biz`, businessType: "laundry_local_service", currency, updatedAt: new Date() },
      });
    }
    await expect(
      createGoal({ workspaceId: wsD, actorId: actor, targetType: "REVENUE", targetAmount: 100, targetDate: future(30) })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
