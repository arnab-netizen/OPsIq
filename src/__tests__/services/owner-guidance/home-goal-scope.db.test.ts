/**
 * Home (owner now-view) goal scope — real live path, real Postgres.
 *
 * `[db]`-gated. getOwnerNowView(workspaceId, businessId) with its default (live) dependencies:
 * Home shows the SELECTED business's own goal, labelled with its scope; a business without a goal
 * gets "No goal set for <business>"; a legacy workspace goal appears only in a single-business
 * workspace ("Workspace goal") and is suppressed — never attributed — in a multi-business one.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";
import { createGoal } from "@/services/owner-strategy/goal.service";

const actor = randomUUID();
const workspaces: string[] = [];

function newWorkspace(): string {
  const ws = randomUUID();
  workspaces.push(ws);
  return ws;
}
async function business(workspaceId: string, name: string, currency = "INR"): Promise<string> {
  const id = randomUUID();
  await db.ownerBusiness.create({ data: { id, workspaceId, name, businessType: "laundry_local_service", currency, updatedAt: new Date() } });
  return id;
}
async function legacyGoal(workspaceId: string, targetAmount: number): Promise<string> {
  const id = randomUUID();
  await db.ownerGoal.create({
    data: {
      id, workspaceId, actorId: actor, targetType: "REVENUE", targetAmount, targetCurrency: "INR",
      targetDate: new Date(Date.now() + 365 * 86_400_000), status: "ACTIVE", updatedAt: new Date(),
    },
  });
  return id;
}
const future = () => new Date(Date.now() + 200 * 86_400_000);

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `home-goal-${actor}@example.com`, name: "Home Goal", isActive: true, updatedAt: new Date() },
  });
});

afterAll(async () => {
  await db.ownerGuidanceSnapshot.deleteMany({ where: { workspaceId: { in: workspaces } } });
  await db.ownerGoal.deleteMany({ where: { workspaceId: { in: workspaces } } });
  await db.ownerBusiness.deleteMany({ where: { workspaceId: { in: workspaces } } });
  await db.auditEvent.deleteMany({ where: { workspaceId: { in: workspaces } } });
  await db.user.delete({ where: { id: actor } });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Home goal scope (live now-view path)", () => {
  it("[db] multi-business: A's goal is shown for A with its business label and never for B", async () => {
    const ws = newWorkspace();
    const a = await business(ws, "Alpha");
    const b = await business(ws, "Beta", "GBP");
    await createGoal({ workspaceId: ws, actorId: actor, businessId: a, targetType: "REVENUE", targetAmount: 314159, targetDate: future() });

    const homeA = (await getOwnerNowView(ws, a)).goalAttentionSignal!;
    expect(homeA.goalScope).toBe("business");
    expect(homeA.scopeLabel).toBe("Business goal · Alpha");
    expect(homeA.targetAmount).toBe(314159);
    expect(homeA.targetCurrency).toBe("INR");

    const homeB = (await getOwnerNowView(ws, b)).goalAttentionSignal!;
    expect(homeB.state).toBe("NO_GOAL");
    expect(homeB.targetAmount).toBeNull();
    expect(homeB.scopeLabel).toBe("No goal set for Beta");
    expect(homeB.beginnerExplanation).toMatch(/No goal set for Beta/);
    expect(JSON.stringify(homeB)).not.toContain("314159");
  });

  it("[db] multi-business: a legacy workspace goal is suppressed on every business's Home", async () => {
    const ws = newWorkspace();
    const a = await business(ws, "Alpha");
    const b = await business(ws, "Beta");
    await legacyGoal(ws, 271828);
    for (const biz of [a, b]) {
      const signal = (await getOwnerNowView(ws, biz)).goalAttentionSignal!;
      expect(signal.state).toBe("NO_GOAL");
      expect(signal.targetAmount).toBeNull();
      expect(JSON.stringify(signal)).not.toContain("271828");
    }
  });

  it("[db] single business: the legacy workspace goal is shown, labelled \"Workspace goal\"", async () => {
    const ws = newWorkspace();
    const solo = await business(ws, "Solo");
    await legacyGoal(ws, 161803);
    const signal = (await getOwnerNowView(ws, solo)).goalAttentionSignal!;
    expect(signal.goalScope).toBe("workspace");
    expect(signal.scopeLabel).toBe("Workspace goal");
    expect(signal.targetAmount).toBe(161803);
  });

  it("[db] single business: once a business goal replaces the legacy goal, Home shows the business goal", async () => {
    const ws = newWorkspace();
    const solo = await business(ws, "Solo");
    await legacyGoal(ws, 111);
    await createGoal({ workspaceId: ws, actorId: actor, businessId: solo, targetType: "PROFIT", targetAmount: 222, targetDate: future() });
    const signal = (await getOwnerNowView(ws, solo)).goalAttentionSignal!;
    expect(signal.goalScope).toBe("business");
    expect(signal.scopeLabel).toBe("Business goal · Solo");
    expect(signal.targetAmount).toBe(222);
  });
});
