/**
 * Business-scoped owner goals — DB proof (service level).
 *
 * `[db]`-gated. Proves the approved goals-scope decision against real Postgres:
 * explicit business scope, currency lock, replacement within one scope only, the single-business
 * legacy exception, owner-confirmed legacy assignment (revise + recreate + audit linkage),
 * multi-currency isolation (no aggregation, visible exclusions), archived businesses, target-type
 * rules, tenant isolation, Home resolution and objective ↔ goal links.
 *
 * Database-level integrity (partial unique indexes, concurrency, migration preflight) is proven in
 * goal-scope-integrity.db.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import {
  assignLegacyGoalToBusiness,
  computeGoalTrajectoryView,
  createGoal,
  getActiveBusinessGoal,
  getActiveLegacyGoal,
  getGoalsOverview,
  listBusinessGoalHistory,
  markGoalAchieved,
  resolveAlignedObjectiveLinks,
  resolveHomeGoal,
} from "@/services/owner-strategy/goal.service";
import { createObjective, updateObjective } from "@/services/owner-mode/business-objective.service";
import { ConflictError, NotFoundError, ValidationError } from "@/infra/errors";

const actor = randomUUID();
const workspaces: string[] = [];

function future(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function newWorkspace(): string {
  const ws = randomUUID();
  workspaces.push(ws);
  return ws;
}

async function business(workspaceId: string, name: string, currency = "INR", extra: Record<string, unknown> = {}): Promise<string> {
  const id = randomUUID();
  await db.ownerBusiness.create({
    data: { id, workspaceId, name, businessType: "laundry_local_service", currency, updatedAt: new Date(), ...extra },
  });
  return id;
}

/** A pre-scoping goal row exactly as existing production rows look after the migration (businessId null). */
async function legacyGoal(workspaceId: string, extra: Record<string, unknown> = {}): Promise<string> {
  const id = randomUUID();
  await db.ownerGoal.create({
    data: {
      id,
      workspaceId,
      actorId: actor,
      targetType: "REVENUE",
      targetAmount: 900000,
      targetCurrency: "INR",
      targetDate: future(365),
      status: "ACTIVE",
      updatedAt: new Date(),
      ...extra,
    },
  });
  return id;
}

async function snapshot(workspaceId: string, businessId: string, month: number, revenue: number, currency: string) {
  const start = new Date(Date.UTC(2026, month, 1));
  await db.ownerMetricSnapshot.create({
    data: {
      id: randomUUID(),
      workspaceId,
      businessId,
      periodStart: start,
      periodEnd: new Date(Date.UTC(2026, month + 1, 0)),
      currency,
      revenue,
      netProfit: revenue / 10,
      updatedAt: new Date(),
    },
  });
}

async function auditFor(entityId: string, eventName: string) {
  return db.auditEvent.findMany({ where: { entityId, eventName } });
}

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `goal-${actor}@example.com`, name: "Goal Test", isActive: true, updatedAt: new Date() },
  });
});

afterAll(async () => {
  await db.businessObjective.deleteMany({ where: { workspaceId: { in: workspaces } } });
  await db.ownerGoal.deleteMany({ where: { workspaceId: { in: workspaces } } });
  await db.ownerMetricSnapshot.deleteMany({ where: { workspaceId: { in: workspaces } } });
  await db.ownerBusiness.deleteMany({ where: { workspaceId: { in: workspaces } } });
  await db.auditEvent.deleteMany({ where: { actorId: actor } });
  await db.user.delete({ where: { id: actor } });
});

describe("[db] single-business owner", () => {
  it("[db] a new goal carries the explicit business and the business currency", async () => {
    const ws = newWorkspace();
    const biz = await business(ws, "Trinity Services", "inr");
    const goalId = await createGoal({ workspaceId: ws, actorId: actor, businessId: biz, targetType: "REVENUE", targetAmount: 500000, targetDate: future(200) });
    const row = await db.ownerGoal.findUnique({ where: { id: goalId } });
    expect(row).toMatchObject({ businessId: biz, targetCurrency: "INR", status: "ACTIVE", targetType: "REVENUE" });
    const created = await auditFor(goalId, "owner.goal_created");
    expect(created).toHaveLength(1);
    expect(created[0].payload).toMatchObject({ scope: "business", businessId: biz, via: "create" });
  });

  it("[db] currency is locked to the business: a different currency is refused, the same one (any case) is accepted", async () => {
    const ws = newWorkspace();
    const biz = await business(ws, "Trinity Services", "INR");
    await expect(
      createGoal({ workspaceId: ws, actorId: actor, businessId: biz, targetType: "PROFIT", targetAmount: 1, targetCurrency: "USD", targetDate: future(90) })
    ).rejects.toBeInstanceOf(ValidationError);
    const id = await createGoal({ workspaceId: ws, actorId: actor, businessId: biz, targetType: "PROFIT", targetAmount: 1, targetCurrency: "inr", targetDate: future(90) });
    expect((await db.ownerGoal.findUnique({ where: { id } }))!.targetCurrency).toBe("INR");
  });

  it("[db] legacy transition: with exactly one real business, a new business goal revises the legacy workspace goal", async () => {
    const ws = newWorkspace();
    const biz = await business(ws, "Trinity Services");
    const legacyId = await legacyGoal(ws);
    const newId = await createGoal({ workspaceId: ws, actorId: actor, businessId: biz, targetType: "REVENUE", targetAmount: 600000, targetDate: future(300) });
    const legacy = await db.ownerGoal.findUnique({ where: { id: legacyId } });
    expect(legacy).toMatchObject({ status: "REVISED", supersededById: newId, businessId: null, targetAmount: 900000 });
    expect(await getActiveLegacyGoal(ws)).toBeNull();
    const revised = await auditFor(legacyId, "owner.goal_revised");
    expect(revised).toHaveLength(1);
    expect(revised[0].payload).toMatchObject({
      oldGoalId: legacyId,
      newGoalId: newId,
      previousScope: "workspace",
      newScope: "business",
      businessId: biz,
      reason: "legacy_workspace_goal_replaced_by_sole_business_goal",
    });
    expect(revised[0].actorId).toBe(actor);
  });

  it("[db] a new goal for a business replaces that business's previous goal (REVISED + successor link + audit)", async () => {
    const ws = newWorkspace();
    const biz = await business(ws, "Trinity Services");
    const first = await createGoal({ workspaceId: ws, actorId: actor, businessId: biz, targetType: "REVENUE", targetAmount: 1, targetDate: future(30) });
    const second = await createGoal({ workspaceId: ws, actorId: actor, businessId: biz, targetType: "PROFIT", targetAmount: 2, targetDate: future(60) });
    expect(await db.ownerGoal.findUnique({ where: { id: first } })).toMatchObject({ status: "REVISED", supersededById: second });
    expect((await getActiveBusinessGoal(ws, biz))!.id).toBe(second);
    expect((await auditFor(first, "owner.goal_revised"))[0].payload).toMatchObject({
      previousScope: "business",
      previousBusinessId: biz,
      reason: "replaced_by_new_business_goal",
    });
    expect((await listBusinessGoalHistory(ws, biz)).map((g) => g.id)).toEqual([first]);
  });
});

describe("[db] multi-business owner", () => {
  it("[db] each business keeps its own ACTIVE goal; replacing A's never touches B's or the legacy goal", async () => {
    const ws = newWorkspace();
    const a = await business(ws, "Alpha");
    const b = await business(ws, "Beta");
    const legacyId = await legacyGoal(ws);
    const a1 = await createGoal({ workspaceId: ws, actorId: actor, businessId: a, targetType: "REVENUE", targetAmount: 1, targetDate: future(30) });
    const b1 = await createGoal({ workspaceId: ws, actorId: actor, businessId: b, targetType: "REVENUE", targetAmount: 2, targetDate: future(30) });
    const a2 = await createGoal({ workspaceId: ws, actorId: actor, businessId: a, targetType: "PROFIT", targetAmount: 3, targetDate: future(30) });
    expect((await db.ownerGoal.findUnique({ where: { id: a1 } }))!.status).toBe("REVISED");
    expect((await db.ownerGoal.findUnique({ where: { id: b1 } }))!.status).toBe("ACTIVE");
    expect((await db.ownerGoal.findUnique({ where: { id: legacyId } }))!.status).toBe("ACTIVE");
    expect((await getActiveBusinessGoal(ws, a))!.id).toBe(a2);
    expect((await getActiveBusinessGoal(ws, b))!.id).toBe(b1);
  });

  it("[db] Home: A's goal is shown only for A; B without a goal says so; the legacy goal is never attributed to either", async () => {
    const ws = newWorkspace();
    const a = await business(ws, "Alpha");
    const b = await business(ws, "Beta");
    await legacyGoal(ws);
    const aGoal = await createGoal({ workspaceId: ws, actorId: actor, businessId: a, targetType: "REVENUE", targetAmount: 1, targetDate: future(30) });
    const homeA = await resolveHomeGoal(ws, a);
    expect(homeA.view!.goal.id).toBe(aGoal);
    expect(homeA.scopeLabel).toBe("Business goal · Alpha");
    const homeB = await resolveHomeGoal(ws, b);
    expect(homeB.view).toBeNull();
    expect(homeB.scopeLabel).toBe("No goal set for Beta");
  });

  it("[db] Home: in a single-business workspace the legacy goal is shown as a Workspace goal", async () => {
    const ws = newWorkspace();
    const a = await business(ws, "Solo");
    const legacyId = await legacyGoal(ws);
    const home = await resolveHomeGoal(ws, a);
    expect(home.view!.goal.id).toBe(legacyId);
    expect(home.scopeLabel).toBe("Workspace goal");
  });

  it("[db] Home reflects a goal change immediately (read-time re-evaluation, nothing cached)", async () => {
    const ws = newWorkspace();
    const a = await business(ws, "Alpha");
    await business(ws, "Beta");
    expect((await resolveHomeGoal(ws, a)).view).toBeNull();
    const id = await createGoal({ workspaceId: ws, actorId: actor, businessId: a, targetType: "REVENUE", targetAmount: 1, targetDate: future(30) });
    expect((await resolveHomeGoal(ws, a)).view!.goal.id).toBe(id);
  });
});

describe("[db] multi-currency", () => {
  it("[db] INR and GBP businesses are measured only on their own results in their own currency; mismatches are counted, never mixed", async () => {
    const ws = newWorkspace();
    const inr = await business(ws, "Mumbai", "INR");
    const gbp = await business(ws, "London", "GBP");
    for (let m = 0; m < 4; m++) await snapshot(ws, inr, m, 100000 + m * 10000, "INR");
    await snapshot(ws, inr, 4, 999999, "GBP"); // mis-entered currency on the INR business
    for (let m = 0; m < 3; m++) await snapshot(ws, gbp, m, 5000 + m * 500, "GBP");
    await createGoal({ workspaceId: ws, actorId: actor, businessId: inr, targetType: "REVENUE", targetAmount: 500000, targetDate: future(365) });
    await createGoal({ workspaceId: ws, actorId: actor, businessId: gbp, targetType: "REVENUE", targetAmount: 20000, targetDate: future(365) });

    const inrView = await computeGoalTrajectoryView((await getActiveBusinessGoal(ws, inr))!);
    expect(inrView.goal.targetCurrency).toBe("INR");
    expect(inrView.dataWindow!.periods).toBe(4);
    expect(inrView.excludedSnapshotCount).toBe(1);
    expect(inrView.excludedReason).toMatch(/different currency/);
    expect(inrView.trajectory.currentValue).toBe(130000);

    const gbpView = await computeGoalTrajectoryView((await getActiveBusinessGoal(ws, gbp))!);
    expect(gbpView.goal.targetCurrency).toBe("GBP");
    expect(gbpView.dataWindow!.periods).toBe(3);
    expect(gbpView.excludedSnapshotCount).toBe(0);
    expect(gbpView.trajectory.currentValue).toBe(6000);

    for (const v of [inrView, gbpView]) {
      for (const n of Object.values(v.trajectory)) {
        if (typeof n === "number") expect(Number.isFinite(n)).toBe(true);
      }
    }
  });

  it("[db] a legacy workspace goal whose results span businesses is not projected (no fabricated consolidation)", async () => {
    const ws = newWorkspace();
    const a = await business(ws, "A", "INR");
    const b = await business(ws, "B", "INR");
    await snapshot(ws, a, 0, 100, "INR");
    await snapshot(ws, b, 0, 200, "INR");
    await legacyGoal(ws);
    const v = await computeGoalTrajectoryView((await getActiveLegacyGoal(ws))!);
    expect(v.unavailableReason).toMatch(/consolidated reporting/);
    expect(v.trajectory.currentValue).toBeNull();
    expect(v.dataWindow).toBeNull();
  });
});

describe("[db] legacy goal projection (hostile-review P1)", () => {
  it("[db] a legacy goal in a multi-business workspace is never projected, even when only one business has results in its currency", async () => {
    const ws = newWorkspace();
    const usd = await business(ws, "Boston", "USD");
    const eur = await business(ws, "Berlin", "EUR");
    for (let m = 0; m < 6; m++) await snapshot(ws, usd, m, 1000 + m * 100, "USD");
    for (let m = 0; m < 6; m++) await snapshot(ws, eur, m, 900 + m * 100, "EUR");
    await legacyGoal(ws, { targetCurrency: "USD" });
    const v = await computeGoalTrajectoryView((await getActiveLegacyGoal(ws))!);
    expect(v.unavailableReason).toMatch(/consolidated reporting/);
    expect(v.trajectory.currentValue).toBeNull();
    expect(v.trajectory.percentComplete).toBeNull();
    expect(v.dataWindow).toBeNull();
  });

  it("[db] same currency but the second business has no results yet: still not projected", async () => {
    const ws = newWorkspace();
    const a = await business(ws, "A", "INR");
    await business(ws, "B", "INR");
    for (let m = 0; m < 4; m++) await snapshot(ws, a, m, 1000 + m * 100, "INR");
    await legacyGoal(ws);
    const v = await computeGoalTrajectoryView((await getActiveLegacyGoal(ws))!);
    expect(v.unavailableReason).toMatch(/consolidated reporting/);
    expect(v.trajectory.currentValue).toBeNull();
  });

  it("[db] a legacy goal in a single-business workspace is projected on that business's results", async () => {
    const ws = newWorkspace();
    const solo = await business(ws, "Solo", "INR");
    for (let m = 0; m < 4; m++) await snapshot(ws, solo, m, 1000 + m * 100, "INR");
    await legacyGoal(ws);
    const v = await computeGoalTrajectoryView((await getActiveLegacyGoal(ws))!);
    expect(v.unavailableReason).toBeNull();
    expect(v.trajectory.currentValue).toBe(1300);
  });
});

describe("[db] legacy workspace goals", () => {
  it("[db] a null-scope goal is preserved and readable as an explicit workspace goal", async () => {
    const ws = newWorkspace();
    await business(ws, "A");
    await business(ws, "B");
    const legacyId = await legacyGoal(ws, { targetCurrency: "INR", targetAmount: 123 });
    const legacy = await getActiveLegacyGoal(ws);
    expect(legacy).toMatchObject({ id: legacyId, scope: "workspace", businessId: null, targetAmount: 123 });
    const overview = await getGoalsOverview(ws, null);
    expect(overview.legacyGoal!.goal.id).toBe(legacyId);
    expect(overview.legacyAttributable).toBe(false);
    expect(overview.consolidationSupported).toBe(false);
  });

  it("[db] assignment revises the legacy goal and recreates it for the chosen business, linked and audited", async () => {
    const ws = newWorkspace();
    const a = await business(ws, "Alpha");
    await business(ws, "Beta");
    const legacyId = await legacyGoal(ws, { targetType: "PROFIT", targetAmount: 777, baselineAmount: 100 });
    const newId = await assignLegacyGoalToBusiness({ workspaceId: ws, actorId: actor, legacyGoalId: legacyId, businessId: a });
    const [legacy, created] = await Promise.all([
      db.ownerGoal.findUnique({ where: { id: legacyId } }),
      db.ownerGoal.findUnique({ where: { id: newId } }),
    ]);
    expect(legacy).toMatchObject({ status: "REVISED", supersededById: newId, businessId: null });
    expect(created).toMatchObject({ status: "ACTIVE", businessId: a, targetType: "PROFIT", targetAmount: 777, baselineAmount: 100, targetCurrency: "INR" });
    expect(created!.targetDate.getTime()).toBe(legacy!.targetDate.getTime());
    expect((await auditFor(legacyId, "owner.goal_revised"))[0].payload).toMatchObject({
      oldGoalId: legacyId,
      newGoalId: newId,
      previousScope: "workspace",
      newScope: "business",
      businessId: a,
      reason: "legacy_workspace_goal_assigned_to_business",
    });
    expect((await auditFor(newId, "owner.goal_created"))[0].payload).toMatchObject({ via: "legacy_assignment", supersedesGoalIds: [legacyId] });
    await expect(
      assignLegacyGoalToBusiness({ workspaceId: ws, actorId: actor, legacyGoalId: legacyId, businessId: a })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("[db] assignment is refused — never converted — for another currency, an unmeasured type, or a business that already has a goal", async () => {
    const ws = newWorkspace();
    const inr = await business(ws, "Mumbai", "INR");
    const gbp = await business(ws, "London", "GBP");
    const legacyId = await legacyGoal(ws, { targetCurrency: "INR" });
    await expect(assignLegacyGoalToBusiness({ workspaceId: ws, actorId: actor, legacyGoalId: legacyId, businessId: gbp })).rejects.toBeInstanceOf(ValidationError);
    await createGoal({ workspaceId: ws, actorId: actor, businessId: inr, targetType: "REVENUE", targetAmount: 1, targetDate: future(30) });
    await expect(assignLegacyGoalToBusiness({ workspaceId: ws, actorId: actor, legacyGoalId: legacyId, businessId: inr })).rejects.toBeInstanceOf(ConflictError);
    expect((await db.ownerGoal.findUnique({ where: { id: legacyId } }))!.status).toBe("ACTIVE");

    const ws2 = newWorkspace();
    const biz2 = await business(ws2, "Solo");
    const nw = await legacyGoal(ws2, { targetType: "NET_WORTH" });
    await expect(assignLegacyGoalToBusiness({ workspaceId: ws2, actorId: actor, legacyGoalId: nw, businessId: biz2 })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("[db] archived businesses", () => {
  it("[db] an archived business keeps its goal history, is labelled on Home, and accepts no new goal", async () => {
    const ws = newWorkspace();
    const a = await business(ws, "Alpha");
    await business(ws, "Beta");
    const g1 = await createGoal({ workspaceId: ws, actorId: actor, businessId: a, targetType: "REVENUE", targetAmount: 1, targetDate: future(30) });
    const g2 = await createGoal({ workspaceId: ws, actorId: actor, businessId: a, targetType: "REVENUE", targetAmount: 2, targetDate: future(30) });
    await db.ownerBusiness.update({ where: { id: a }, data: { isActive: false } });
    expect((await getActiveBusinessGoal(ws, a))!).toMatchObject({ id: g2, businessActive: false });
    expect((await listBusinessGoalHistory(ws, a)).map((g) => g.id)).toEqual([g1]);
    expect((await resolveHomeGoal(ws, a)).scopeLabel).toBe("Business goal · Alpha (archived business)");
    await expect(
      createGoal({ workspaceId: ws, actorId: actor, businessId: a, targetType: "REVENUE", targetAmount: 3, targetDate: future(30) })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("[db] target types", () => {
  it("[db] new NET_WORTH / MULTIPLE goals are rejected; legacy rows of those types stay readable and are not projected", async () => {
    const ws = newWorkspace();
    const biz = await business(ws, "Solo");
    for (const targetType of ["NET_WORTH", "MULTIPLE"]) {
      await expect(
        createGoal({ workspaceId: ws, actorId: actor, businessId: biz, targetType: targetType as "REVENUE", targetAmount: 1, targetDate: future(30) })
      ).rejects.toBeInstanceOf(ValidationError);
    }
    await snapshot(ws, biz, 0, 1000, "INR");
    await legacyGoal(ws, { targetType: "MULTIPLE" });
    const v = await computeGoalTrajectoryView((await getActiveLegacyGoal(ws))!);
    expect(v.metricBasis).toBe("not_measured");
    expect(v.unavailableReason).toMatch(/does not measure a business multiple/);
    expect(v.trajectory.currentValue).toBeNull();
  });
});

describe("[db] tenant isolation", () => {
  it("[db] a business, goal or legacy goal of another workspace is never reachable by id", async () => {
    const wsA = newWorkspace();
    const wsB = newWorkspace();
    const bizA = await business(wsA, "A");
    const bizB = await business(wsB, "B");
    const goalB = await createGoal({ workspaceId: wsB, actorId: actor, businessId: bizB, targetType: "REVENUE", targetAmount: 1, targetDate: future(30) });
    const legacyB = await legacyGoal(wsB);
    await expect(
      createGoal({ workspaceId: wsA, actorId: actor, businessId: bizB, targetType: "REVENUE", targetAmount: 1, targetDate: future(30) })
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(getGoalsOverview(wsA, bizB)).rejects.toBeInstanceOf(NotFoundError);
    expect(await getActiveBusinessGoal(wsA, bizB)).toBeNull();
    await expect(assignLegacyGoalToBusiness({ workspaceId: wsA, actorId: actor, legacyGoalId: legacyB, businessId: bizA })).rejects.toBeInstanceOf(NotFoundError);
    await expect(markGoalAchieved(goalB, wsA, actor)).rejects.toBeInstanceOf(NotFoundError);
    expect((await resolveHomeGoal(wsA, bizB)).view).toBeNull();
    expect((await db.ownerGoal.findUnique({ where: { id: goalB } }))!.status).toBe("ACTIVE");
  });

  it("[db] a fixture (test) business cannot receive a goal", async () => {
    const ws = newWorkspace();
    const fixture = await business(ws, "QA", "INR", { isFixtureBusiness: true });
    await expect(
      createGoal({ workspaceId: ws, actorId: actor, businessId: fixture, targetType: "REVENUE", targetAmount: 1, targetDate: future(30) })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("[db] objective ↔ goal links", () => {
  it("[db] same-business link is accepted; wrong-business, cross-workspace and replaced goals are refused", async () => {
    const ws = newWorkspace();
    const other = newWorkspace();
    const a = await business(ws, "Alpha");
    const b = await business(ws, "Beta");
    const otherBiz = await business(other, "Other");
    const goalA1 = await createGoal({ workspaceId: ws, actorId: actor, businessId: a, targetType: "REVENUE", targetAmount: 1, targetDate: future(30) });
    const goalB = await createGoal({ workspaceId: ws, actorId: actor, businessId: b, targetType: "REVENUE", targetAmount: 1, targetDate: future(30) });
    const goalOther = await createGoal({ workspaceId: other, actorId: actor, businessId: otherBiz, targetType: "REVENUE", targetAmount: 1, targetDate: future(30) });
    const base = { workspaceId: ws, actorId: actor, title: "Grow", objectiveType: "REVENUE" as const, businessId: a };

    const ok = await createObjective({ ...base, linkedGoalId: goalA1 });
    expect(ok.linkedGoalId).toBe(goalA1);
    await expect(createObjective({ ...base, linkedGoalId: goalB })).rejects.toBeInstanceOf(ValidationError);
    await expect(createObjective({ ...base, linkedGoalId: goalOther })).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateObjective({ workspaceId: ws, actorId: actor, objectiveId: ok.id, linkedGoalId: goalB })).rejects.toBeInstanceOf(ValidationError);

    const goalA2 = await createGoal({ workspaceId: ws, actorId: actor, businessId: a, targetType: "PROFIT", targetAmount: 2, targetDate: future(30) });
    await expect(createObjective({ ...base, linkedGoalId: goalA1 })).rejects.toThrow(/replaced/);

    // Read-time: the existing link to the replaced goal follows its successor (still aligned);
    // a (historical) link to another business's goal is not aligned.
    await db.businessObjective.create({
      data: { id: randomUUID(), workspaceId: ws, businessId: a, title: "Stale cross link", objectiveType: "REVENUE", linkedGoalId: goalB },
    });
    const objectives = await db.businessObjective.findMany({ where: { workspaceId: ws } });
    const aligned = await resolveAlignedObjectiveLinks(
      ws,
      objectives.map((o) => ({ objectiveId: o.id, objectiveBusinessId: o.businessId, linkedGoalId: o.linkedGoalId }))
    );
    expect(aligned.has(ok.id)).toBe(true);
    const cross = objectives.find((o) => o.title === "Stale cross link")!;
    expect(aligned.has(cross.id)).toBe(false);
    expect(goalA2).toBeTruthy();
  });
});
