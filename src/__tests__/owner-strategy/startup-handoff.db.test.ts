/**
 * F-STARTUP-NO-HANDOFF — handOffStartupSessionToBusiness() DB proof.
 *
 * `[db]`-gated. Proves: happy-path creates a real OwnerBusiness from the
 * approved idea's own name/industry (plus intake.location when present),
 * links it to the session, transitions the session to ACTIVE, and marks the
 * execution plan COMPLETED; a second call after a successful handoff is
 * idempotent (same businessId, no duplicate); N genuinely concurrent
 * handoff attempts on the same session never produce more than one
 * OwnerBusiness; every guard (no decision, non-GO decision, revised idea,
 * no execution plan) blocks with ConflictError and creates nothing.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-strategy/startup-handoff.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import {
  createStartupSession,
  recordOwnerDecision,
  reviseIdea,
} from "@/services/owner-strategy/startup-session.service";
import { createBlueprint } from "@/services/owner-strategy/startup-execution-blueprint.service";
import { handOffStartupSessionToBusiness } from "@/services/owner-strategy/startup-handoff.service";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { ConflictError } from "@/infra/errors";
import type { StartupIntake, StartupIdea } from "@/domain/owner-strategy/startup-mode.types";

const actor = randomUUID();

const intake: StartupIntake = {
  capitalAvailable: 10000,
  monthlySurvivalNeed: 2000,
  hoursPerWeekAvailable: 40,
  riskTolerance: "medium",
  targetMonthlyIncome: 4000,
  canSell: true,
  canOperateDaily: true,
  fastCashVsScale: "fast_cash",
  location: "Austin, TX",
};

const viableIdea: StartupIdea = {
  name: "Mobile Car Wash",
  industry: "Automotive services",
  structural: {
    grossMarginPct: 65,
    netMarginPct: 30,
    monthlyRevenue: 5000,
    revenueFrequency: "recurring",
    repeatCustomerPct: 0.6,
    customerAcquisitionDifficulty: "low",
    demandValidated: true,
    ownerIsPrimaryOperator: true,
    differentiation: "moderate",
    pricingPower: "moderate",
    capitalIntensity: "low",
    downsideRisk: "low",
  },
  estimatedStartupCost: 3000,
  estimatedMonthlyRevenue: 5000,
  estimatedMonthlyCost: 1500,
  timeToFirstRevenueMonths: 1,
};

const createdWorkspaces: string[] = [];

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `startup-handoff-${actor}@example.com`, name: "Startup Handoff Test", isActive: true, updatedAt: new Date() },
  });
});

afterAll(async () => {
  for (const ws of createdWorkspaces) {
    await db.ownerBusiness.deleteMany({ where: { workspaceId: ws } });
    await db.startupExecutionPlan.deleteMany({ where: { workspaceId: ws } });
    await db.startupInitiative.deleteMany({ where: { workspaceId: ws } });
    await db.startupExecutionBlueprint.deleteMany({ where: { workspaceId: ws } });
    await db.startupOwnerDecision.deleteMany({ where: { workspaceId: ws } });
    await db.startupIdeaRecord.deleteMany({ where: { workspaceId: ws } });
    await db.ownerStartupSession.deleteMany({ where: { workspaceId: ws } });
  }
  await db.auditEvent.deleteMany({ where: { actorId: actor } });
  await db.user.delete({ where: { id: actor } });
});

async function seedApprovedSession(ws: string) {
  createdWorkspaces.push(ws);
  const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake, ideas: [viableIdea] });
  const sess = await db.ownerStartupSession.findFirst({ where: { id: sessionId }, include: { ideas: true } });
  const ideaId = sess!.ideas[0].id;
  const decisionId = await recordOwnerDecision(ws, sessionId, actor, { decisionType: "GO", ideaId });
  await db.ownerStartupSession.update({ where: { id: sessionId }, data: { status: "EXECUTION_PLANNED" } });
  return { sessionId, ideaId, decisionId };
}

async function seedExecutionPlannedSession(ws: string) {
  const base = await seedApprovedSession(ws);
  const bp = await createBlueprint(ws, actor, {
    sessionId: base.sessionId,
    ideaId: base.ideaId,
    ownerDecisionId: base.decisionId,
    objectiveTitle: "Launch",
  });
  return { ...base, planId: bp.executionPlanId };
}

describe("[db] handOffStartupSessionToBusiness — happy path", () => {
  it("creates a real OwnerBusiness from the approved idea, links it, and transitions to ACTIVE", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const { sessionId, planId } = await seedExecutionPlannedSession(ws);

    const result = await handOffStartupSessionToBusiness(ws, sessionId, actor);
    expect(result.alreadyHandedOff).toBe(false);
    expect(result.businessId).toBeTruthy();

    const business = await db.ownerBusiness.findUnique({ where: { id: result.businessId } });
    expect(business).not.toBeNull();
    expect(business!.name).toBe("Mobile Car Wash");
    expect(business!.businessType).toBe("Automotive services");
    expect(business!.location).toBe("Austin, TX");
    expect(business!.workspaceId).toBe(ws);
    expect(business!.createdBy).toBe(actor);
    expect(business!.isActive).toBe(true);

    const session = await db.ownerStartupSession.findFirst({ where: { id: sessionId } });
    expect(session!.status).toBe("ACTIVE");
    expect(session!.businessId).toBe(result.businessId);

    const plan = await db.startupExecutionPlan.findFirst({ where: { id: planId } });
    expect(plan!.status).toBe("COMPLETED");

    const audit = await db.auditEvent.findFirst({
      where: { eventName: AUDIT_EVENTS.STARTUP_SESSION_HANDED_OFF_TO_BUSINESS, workspaceId: ws },
      orderBy: { occurredAt: "desc" },
    });
    expect(audit).not.toBeNull();
    expect((audit!.payload as { businessId: string }).businessId).toBe(result.businessId);
  });
});

describe("[db] handOffStartupSessionToBusiness — idempotent retry", () => {
  it("a second call after a successful handoff returns the same businessId and creates no duplicate", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const { sessionId } = await seedExecutionPlannedSession(ws);

    const first = await handOffStartupSessionToBusiness(ws, sessionId, actor);
    const second = await handOffStartupSessionToBusiness(ws, sessionId, actor);

    expect(first.alreadyHandedOff).toBe(false);
    expect(second.alreadyHandedOff).toBe(true);
    expect(second.businessId).toBe(first.businessId);

    const count = await db.ownerBusiness.count({ where: { workspaceId: ws } });
    expect(count).toBe(1);
  });
});

describe("[db][concurrency] handOffStartupSessionToBusiness — concurrent calls never produce a duplicate business", () => {
  it("6 concurrent handoff attempts on the same session produce exactly one OwnerBusiness", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const { sessionId } = await seedExecutionPlannedSession(ws);

    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => handOffStartupSessionToBusiness(ws, sessionId, actor))
    );

    const fulfilled = results.filter(
      (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof handOffStartupSessionToBusiness>>> =>
        r.status === "fulfilled"
    );
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");

    // At least one caller must win; every winner (whether it created the
    // business or found it already linked) must agree on the same id.
    expect(fulfilled.length).toBeGreaterThan(0);
    const businessIds = new Set(fulfilled.map((r) => r.value.businessId));
    expect(businessIds.size).toBe(1);

    for (const r of rejected) {
      expect(r.reason).toBeInstanceOf(ConflictError);
    }

    const count = await db.ownerBusiness.count({ where: { workspaceId: ws } });
    expect(count).toBe(1);

    const session = await db.ownerStartupSession.findFirst({ where: { id: sessionId } });
    expect(session!.status).toBe("ACTIVE");
    expect(session!.businessId).toBe([...businessIds][0]);
  });
});

describe("[db] handOffStartupSessionToBusiness — guards", () => {
  it("blocks when the session has no owner decision recorded", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    createdWorkspaces.push(ws);
    const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake, ideas: [viableIdea] });
    await db.ownerStartupSession.update({ where: { id: sessionId }, data: { status: "EXECUTION_PLANNED" } });

    await expect(handOffStartupSessionToBusiness(ws, sessionId, actor)).rejects.toThrow(ConflictError);
    expect(await db.ownerBusiness.count({ where: { workspaceId: ws } })).toBe(0);
  });

  it("blocks when the current decision is not a GO", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    createdWorkspaces.push(ws);
    const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake, ideas: [viableIdea] });
    const sess = await db.ownerStartupSession.findFirst({ where: { id: sessionId }, include: { ideas: true } });
    const ideaId = sess!.ideas[0].id;
    await recordOwnerDecision(ws, sessionId, actor, { decisionType: "HOLD", ideaId });
    await db.ownerStartupSession.update({ where: { id: sessionId }, data: { status: "EXECUTION_PLANNED" } });

    await expect(handOffStartupSessionToBusiness(ws, sessionId, actor)).rejects.toThrow(ConflictError);
    expect(await db.ownerBusiness.count({ where: { workspaceId: ws } })).toBe(0);
  });

  it("blocks when the approved idea has since been revised", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const { sessionId, ideaId } = await seedExecutionPlannedSession(ws);
    await reviseIdea(ws, sessionId, ideaId, actor, { name: "Mobile Car Wash Pro" });

    await expect(handOffStartupSessionToBusiness(ws, sessionId, actor)).rejects.toThrow(ConflictError);
    expect(await db.ownerBusiness.count({ where: { workspaceId: ws } })).toBe(0);
  });

  it("blocks when no active execution plan exists for the approved idea", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const { sessionId } = await seedApprovedSession(ws); // EXECUTION_PLANNED but no blueprint/plan created

    await expect(handOffStartupSessionToBusiness(ws, sessionId, actor)).rejects.toThrow(ConflictError);
    expect(await db.ownerBusiness.count({ where: { workspaceId: ws } })).toBe(0);
  });
});
