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
import { NotFoundError } from "@/infra/errors";

const actor = randomUUID();
const wsA = randomUUID();
const wsB = randomUUID();

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
      targetDate: new Date("2027-01-01"),
      baselineAmount: 3000,
      baselineDate: new Date("2026-07-01"),
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
      targetDate: new Date("2027-06-01"),
    });

    const secondId = await createGoal({
      workspaceId: wsA,
      actorId: actor,
      targetType: "PROFIT",
      targetAmount: 12000,
      targetCurrency: "USD",
      targetDate: new Date("2027-12-01"),
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
      targetDate: new Date("2026-12-01"),
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
      targetDate: new Date("2027-03-01"),
    });

    await expect(markGoalAchieved(goalId, wsB, actor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("[db] getActiveGoal isolates by workspace — wsB goal not visible from wsA", async () => {
    await createGoal({
      workspaceId: wsB,
      actorId: actor,
      targetType: "REVENUE",
      targetAmount: 80000,
      targetDate: new Date("2028-01-01"),
    });

    const wsAGoal = await getActiveGoal(wsA);
    const wsBGoal = await getActiveGoal(wsB);

    expect(wsAGoal?.workspaceId).toBe(wsA);
    expect(wsBGoal?.workspaceId).toBe(wsB);
    expect(wsAGoal?.id).not.toBe(wsBGoal?.id);
  });
});
