/**
 * F-STARTUP-OUTCOME-LOOP — closeStartupInitiative() DB proof.
 *
 * `[db]`-gated. Proves the fix for the documented "Startup outcome learning
 * loop" defect (docs/opsiq/status/CURRENT_MAIN_CLOSURE_REGISTER.md): a
 * handed-off StartupInitiative's PENDING FundedInitiativeOutcome row can now
 * be classified (SUCCESS/FAILED/CANCELLED), is repointed at the real
 * OwnerBusiness (fixing the businessId=workspaceId placeholder stamped at
 * blueprint time), becomes visible to getInitiativeOutcomes() under the real
 * business id (the same lookup budget.service.ts's learning loop uses), and
 * that closing is guarded against double-close, pre-handoff close, and the
 * known duplicate-PENDING-row ambiguity left by the (separate, pre-existing)
 * blueprint-supersession gap.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-strategy/startup-initiative-outcome.service.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import {
  createStartupSession,
  recordOwnerDecision,
} from "@/services/owner-strategy/startup-session.service";
import { createBlueprint } from "@/services/owner-strategy/startup-execution-blueprint.service";
import { handOffStartupSessionToBusiness } from "@/services/owner-strategy/startup-handoff.service";
import { closeStartupInitiative } from "@/services/owner-strategy/startup-initiative-outcome.service";
import { getInitiativeOutcomes } from "@/services/owner-budget/vendor.service";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { ConflictError, NotFoundError, InvalidStateTransitionError } from "@/infra/errors";
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
  name: "Mobile Detailing Co",
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
  if (!process.env["TEST_WITH_DB"]) return;
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `startup-initiative-outcome-${actor}@example.com`, name: "Startup Outcome Test", isActive: true, updatedAt: new Date() },
  });
});

afterAll(async () => {
  if (!process.env["TEST_WITH_DB"]) return;
  for (const ws of createdWorkspaces) {
    await db.fundedInitiativeOutcome.deleteMany({ where: { workspaceId: ws } });
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

async function seedHandedOffInitiative(ws: string) {
  createdWorkspaces.push(ws);
  const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake, ideas: [viableIdea] });
  const sess = await db.ownerStartupSession.findFirst({ where: { id: sessionId }, include: { ideas: true } });
  const ideaId = sess!.ideas[0].id;
  const decisionId = await recordOwnerDecision(ws, sessionId, actor, { decisionType: "GO", ideaId });
  await db.ownerStartupSession.update({ where: { id: sessionId }, data: { status: "EXECUTION_PLANNED" } });
  const bp = await createBlueprint(ws, actor, {
    sessionId,
    ideaId,
    ownerDecisionId: decisionId,
    objectiveTitle: "Launch",
    targetValue: 5000,
  });
  const handoff = await handOffStartupSessionToBusiness(ws, sessionId, actor);
  return { sessionId, ideaId, initiativeId: bp.initiativeId, businessId: handoff.businessId, label: "Mobile Detailing Co startup launch" };
}

async function seedNotHandedOffInitiative(ws: string) {
  createdWorkspaces.push(ws);
  const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake, ideas: [viableIdea] });
  const sess = await db.ownerStartupSession.findFirst({ where: { id: sessionId }, include: { ideas: true } });
  const ideaId = sess!.ideas[0].id;
  const decisionId = await recordOwnerDecision(ws, sessionId, actor, { decisionType: "GO", ideaId });
  await db.ownerStartupSession.update({ where: { id: sessionId }, data: { status: "EXECUTION_PLANNED" } });
  const bp = await createBlueprint(ws, actor, {
    sessionId,
    ideaId,
    ownerDecisionId: decisionId,
    objectiveTitle: "Launch",
    targetValue: 5000,
  });
  return { sessionId, ideaId, initiativeId: bp.initiativeId };
}

describe("[db] closeStartupInitiative — happy path", () => {
  it("classifies a verified SUCCESS, repoints the PENDING row at the real business, and marks the initiative COMPLETED", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const seed = await seedHandedOffInitiative(ws);

    // Confirm the pre-existing defect's starting condition: the blueprint-time row is PENDING
    // and stamped with the workspaceId placeholder, not the (not-yet-existing) real business.
    const before = await db.fundedInitiativeOutcome.findFirst({ where: { workspaceId: ws, initiativeLabel: seed.label } });
    expect(before!.outcome).toBe("PENDING");
    expect(before!.businessId).toBe(ws);

    const result = await closeStartupInitiative(ws, seed.initiativeId, { outcomeVerified: true, expectedImpact: 5000, actualImpact: 5200 }, actor);

    expect(result.status).toBe("COMPLETED");
    expect(result.businessId).toBe(seed.businessId);
    expect(result.classification.outcome).toBe("SUCCESS");
    expect(result.classification.safeForLearning).toBe(true);

    const initiative = await db.startupInitiative.findFirst({ where: { id: seed.initiativeId } });
    expect(initiative!.status).toBe("COMPLETED");

    const outcomeRow = await db.fundedInitiativeOutcome.findFirst({ where: { id: result.fundedInitiativeOutcomeId } });
    expect(outcomeRow!.outcome).toBe("SUCCESS");
    expect(outcomeRow!.businessId).toBe(seed.businessId); // root-cause fix: no longer the workspaceId placeholder
    expect(outcomeRow!.safeForLearning).toBe(true);

    // Future-consumption path: the SAME lookup budget.service.ts's learning loop uses
    // (workspaceId + real businessId) now finds the closed outcome.
    const visible = await getInitiativeOutcomes(ws, seed.businessId);
    expect(visible.some((o) => o.id === result.fundedInitiativeOutcomeId)).toBe(true);

    const audit = await db.auditEvent.findFirst({
      where: { eventName: AUDIT_EVENTS.STARTUP_INITIATIVE_OUTCOME_CLOSED, workspaceId: ws },
      orderBy: { occurredAt: "desc" },
    });
    expect(audit).not.toBeNull();
    expect((audit!.payload as { outcome: string }).outcome).toBe("SUCCESS");
  });

  it("classifies a verified FAILED outcome and still marks the initiative COMPLETED (not cancelled)", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const seed = await seedHandedOffInitiative(ws);

    const result = await closeStartupInitiative(ws, seed.initiativeId, { outcomeVerified: true, expectedImpact: 5000, actualImpact: 200 }, actor);

    expect(result.status).toBe("COMPLETED");
    expect(result.classification.outcome).toBe("FAILED");
    expect(result.classification.safeForLearning).toBe(true);
    expect(result.classification.disposition).toBe("escalate"); // first failure for this label
  });

  it("cancelling before any measurement marks the initiative CANCELLED and the outcome not safe-for-learning", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const seed = await seedHandedOffInitiative(ws);

    const result = await closeStartupInitiative(ws, seed.initiativeId, { outcomeVerified: false, cancelled: true }, actor);

    expect(result.status).toBe("CANCELLED");
    expect(result.classification.outcome).toBe("CANCELLED");
    expect(result.classification.safeForLearning).toBe(false);

    const initiative = await db.startupInitiative.findFirst({ where: { id: seed.initiativeId } });
    expect(initiative!.status).toBe("CANCELLED");
  });
});

describe("[db] closeStartupInitiative — guards", () => {
  it("refuses to close before the session has been handed off to a real business", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const seed = await seedNotHandedOffInitiative(ws);

    await expect(
      closeStartupInitiative(ws, seed.initiativeId, { outcomeVerified: true, expectedImpact: 100, actualImpact: 100 }, actor)
    ).rejects.toThrow(ConflictError);

    const initiative = await db.startupInitiative.findFirst({ where: { id: seed.initiativeId } });
    expect(initiative!.status).toBe("ACTIVE"); // untouched
  });

  it("refuses a second close of an already-closed initiative", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const seed = await seedHandedOffInitiative(ws);

    await closeStartupInitiative(ws, seed.initiativeId, { outcomeVerified: true, expectedImpact: 5000, actualImpact: 5200 }, actor);

    await expect(
      closeStartupInitiative(ws, seed.initiativeId, { outcomeVerified: true, expectedImpact: 5000, actualImpact: 5200 }, actor)
    ).rejects.toThrow(InvalidStateTransitionError);
  });

  it("rejects an unknown initiativeId", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    createdWorkspaces.push(ws);

    await expect(
      closeStartupInitiative(ws, randomUUID(), { outcomeVerified: true }, actor)
    ).rejects.toThrow(NotFoundError);
  });

  it("does not leak across workspaces: closing another workspace's initiativeId under this workspace 404s", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const wsA = randomUUID();
    const seed = await seedHandedOffInitiative(wsA);
    const wsB = randomUUID();
    createdWorkspaces.push(wsB);

    await expect(
      closeStartupInitiative(wsB, seed.initiativeId, { outcomeVerified: true }, actor)
    ).rejects.toThrow(NotFoundError);
  });

  it("fails closed (refuses to guess) when more than one PENDING row shares the initiative's label", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const seed = await seedHandedOffInitiative(ws);

    // Simulate the known, separate blueprint-supersession-orphan gap: a second stray PENDING row
    // with the identical label (as would be left behind by an unmarked-SUPERSEDED prior initiative).
    await db.fundedInitiativeOutcome.create({
      data: {
        id: randomUUID(), workspaceId: ws, businessId: ws,
        initiativeLabel: seed.label, outcome: "PENDING", nextStep: "Validate first customer",
        safeForLearning: true, createdBy: actor, updatedAt: new Date(),
      },
    });

    await expect(
      closeStartupInitiative(ws, seed.initiativeId, { outcomeVerified: true, expectedImpact: 5000, actualImpact: 5200 }, actor)
    ).rejects.toThrow(ConflictError);

    const initiative = await db.startupInitiative.findFirst({ where: { id: seed.initiativeId } });
    expect(initiative!.status).toBe("ACTIVE"); // untouched — refused rather than guessed
  });
});
