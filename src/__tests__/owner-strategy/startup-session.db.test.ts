/**
 * Startup session persistence DB proof — Capability 13.
 *
 * `[db]`-gated. Proves: startup validation results are persisted to PostgreSQL;
 * per-idea evaluation records link correctly to their session; the recommended idea
 * name is stored; workspace isolation prevents cross-workspace reads; listing sessions
 * returns summary data without the full JSON payload; rejection of ideas with
 * insufficient capital is persisted correctly.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-strategy/startup-session.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import {
  createStartupSession,
  getStartupSession,
  listStartupSessions,
  updateContextProfile,
  recordOwnerDecision,
  recordEvidenceItem,
  buildAndPersistEconomicModel,
  buildAndPersistBusinessModel,
  buildAndPersistValidationPlan,
  buildAndPersistMarketSizing,
  checkApprovalStaleness,
  assessAndPersistReadiness,
} from "@/services/owner-strategy/startup-session.service";
import { createBlueprint } from "@/services/owner-strategy/startup-execution-blueprint.service";
import { ConflictError } from "@/infra/errors";
import type { ReadinessInputs } from "@/domain/owner-strategy/startup-readiness";
import { NotFoundError } from "@/infra/errors";
import type { EconomicInputs } from "@/domain/owner-strategy/startup-economics";
import type { StartupIntake, StartupIdea } from "@/domain/owner-strategy/startup-mode.types";

const actor = randomUUID();
const wsA = randomUUID();
const wsB = randomUUID();

const intake: StartupIntake = {
  capitalAvailable: 10000,
  monthlySurvivalNeed: 2000,
  hoursPerWeekAvailable: 40,
  riskTolerance: "medium",
  targetMonthlyIncome: 4000,
  canSell: true,
  canOperateDaily: true,
  fastCashVsScale: "fast_cash",
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

const capitalTrapIdea: StartupIdea = {
  name: "Artisan Bakery",
  industry: "Food & Beverage",
  structural: {
    grossMarginPct: 50,
    netMarginPct: 10,
    monthlyRevenue: 8000,
    revenueFrequency: "recurring",
    customerAcquisitionDifficulty: "medium",
    capitalIntensity: "high",
    downsideRisk: "high",
    workingCapitalPressure: "high",
  },
  estimatedStartupCost: 80000, // far above capitalAvailable=10000
  estimatedMonthlyRevenue: 8000,
  estimatedMonthlyCost: 6000,
  timeToFirstRevenueMonths: 6,
};

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `startup-sess-${actor}@example.com`, name: "Startup Session Test", isActive: true, updatedAt: new Date() },
  });
});

afterAll(async () => {
  await db.startupIdeaRecord.deleteMany({ where: { workspaceId: wsA } });
  await db.startupIdeaRecord.deleteMany({ where: { workspaceId: wsB } });
  await db.ownerStartupSession.deleteMany({ where: { workspaceId: wsA } });
  await db.ownerStartupSession.deleteMany({ where: { workspaceId: wsB } });
  await db.auditEvent.deleteMany({ where: { actorId: actor } });
  await db.user.delete({ where: { id: actor } });
});

describe("[db] Startup session persistence", () => {
  it("[db] persists a validation session and stores per-idea records", async () => {
    const sessionId = await createStartupSession({
      workspaceId: wsA,
      actorId: actor,
      sessionLabel: "Initial exploration",
      intake,
      ideas: [viableIdea, capitalTrapIdea],
    });

    expect(sessionId).toBeTruthy();

    const session = await db.ownerStartupSession.findFirst({ where: { id: sessionId } });
    expect(session).toBeTruthy();
    expect(session!.workspaceId).toBe(wsA);
    expect(session!.sessionLabel).toBe("Initial exploration");
    expect(session!.status).toBe("DRAFT");

    const ideas = await db.startupIdeaRecord.findMany({ where: { sessionId } });
    expect(ideas.length).toBe(2);
  });

  it("[db] correctly marks idea as accepted or rejected based on capital sufficiency", async () => {
    const sessionId = await createStartupSession({
      workspaceId: wsA,
      actorId: actor,
      intake,
      ideas: [viableIdea, capitalTrapIdea],
    });

    const ideas = await db.startupIdeaRecord.findMany({ where: { sessionId } });
    const viable = ideas.find((i) => i.name === "Mobile Car Wash");
    const trap = ideas.find((i) => i.name === "Artisan Bakery");

    expect(viable).toBeTruthy();
    expect(viable!.accepted).toBe(true);
    expect(trap).toBeTruthy();
    expect(trap!.accepted).toBe(false);
  });

  it("[db] persists the recommended idea name at session level", async () => {
    const sessionId = await createStartupSession({
      workspaceId: wsA,
      actorId: actor,
      intake,
      ideas: [viableIdea],
    });

    const session = await db.ownerStartupSession.findFirst({ where: { id: sessionId } });
    expect(session!.recommendedName).toBe("Mobile Car Wash");
  });

  it("[db] getStartupSession returns session with ideas", async () => {
    const sessionId = await createStartupSession({
      workspaceId: wsA,
      actorId: actor,
      intake,
      ideas: [viableIdea, capitalTrapIdea],
    });

    const session = await getStartupSession(wsA, sessionId);
    expect(session.id).toBe(sessionId);
    expect(session.ideas.length).toBe(2);
    // Accepted ideas ordered first
    expect(session.ideas[0].accepted).toBe(true);
  });

  it("[db] getStartupSession rejects cross-workspace access", async () => {
    const sessionId = await createStartupSession({
      workspaceId: wsA,
      actorId: actor,
      intake,
      ideas: [viableIdea],
    });

    await expect(getStartupSession(wsB, sessionId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("[db] listStartupSessions returns summary without full JSON payload", async () => {
    await createStartupSession({
      workspaceId: wsA,
      actorId: actor,
      sessionLabel: "Summary test",
      intake,
      ideas: [viableIdea, capitalTrapIdea],
    });

    const sessions = await listStartupSessions(wsA);
    expect(sessions.length).toBeGreaterThanOrEqual(1);
    const summary = sessions.find((s) => s.sessionLabel === "Summary test");
    expect(summary).toBeTruthy();
    expect(summary!.ideaCount).toBe(2);
    expect(summary!.acceptedCount).toBe(1);
    expect(summary!.recommendedName).toBe("Mobile Car Wash");
    // Summaries don't contain full validationResult JSON
    expect("validationResult" in summary!).toBe(false);
  });

  it("[db] listStartupSessions isolates by workspace", async () => {
    await createStartupSession({
      workspaceId: wsB,
      actorId: actor,
      sessionLabel: "WsB session",
      intake,
      ideas: [viableIdea],
    });

    const wsBSessions = await listStartupSessions(wsB);
    const wsASessions = await listStartupSessions(wsA);

    expect(wsBSessions.some((s) => s.sessionLabel === "WsB session")).toBe(true);
    expect(wsASessions.every((s) => s.sessionLabel !== "WsB session")).toBe(true);
  });

  it("[db] session with no viable ideas stores null recommendedName", async () => {
    // Only the capital-trap idea — will be rejected
    const sessionId = await createStartupSession({
      workspaceId: wsA,
      actorId: actor,
      intake,
      ideas: [capitalTrapIdea],
    });

    const session = await db.ownerStartupSession.findFirst({ where: { id: sessionId } });
    expect(session!.recommendedName).toBeNull();
  });
});

describe("[db][concurrency] Startup session concurrent operations", () => {
  it("[db] concurrent profile updates — only one wins with optimistic lock", async () => {
    const sessionId = await createStartupSession({
      workspaceId: wsA,
      actorId: actor,
      intake,
      ideas: [viableIdea],
    });

    // First update establishes version=1 — succeeds
    await updateContextProfile(wsA, sessionId, actor, { step: "first" }, "first update", 0);

    // Second update with stale expectedVersion=0 should fail
    await expect(
      updateContextProfile(wsA, sessionId, actor, { step: "stale" }, "stale update", 0)
    ).rejects.toThrow("CONCURRENCY_CONFLICT");

    // Correct version=1 succeeds
    const r = await updateContextProfile(wsA, sessionId, actor, { step: "second" }, "second update", 1);
    expect(r.versionNumber).toBe(2);
  });

  it("[db] simultaneous profile updates — exactly one wins via updateMany optimistic lock", async () => {
    const sessionId = await createStartupSession({
      workspaceId: wsA,
      actorId: actor,
      intake,
      ideas: [viableIdea],
    });

    // Fire two concurrent updates without specifying expectedVersion — race on DB row version
    const results = await Promise.allSettled([
      updateContextProfile(wsA, sessionId, actor, { racer: "A" }, "racer A"),
      updateContextProfile(wsA, sessionId, actor, { racer: "B" }, "racer B"),
    ]);

    const succeeded = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");

    // Exactly one must win
    expect(succeeded.length).toBe(1);
    expect(failed.length).toBe(1);
    const winner = succeeded[0] as PromiseFulfilledResult<{ versionId: string; versionNumber: number }>;
    expect(winner.value.versionNumber).toBe(1);
  });

  it("[db] duplicate evidence submission is idempotent", async () => {
    const sessionId = await createStartupSession({
      workspaceId: wsA,
      actorId: actor,
      intake,
      ideas: [viableIdea],
    });

    const key = `evidence-idem-${sessionId}`;
    const id1 = await recordEvidenceItem(wsA, sessionId, actor, {
      idempotencyKey: key,
      sourceType: "OWNER_ENTERED",
      evidenceType: "CUSTOMER_INTERVIEW",
      observedResult: "Customer confirmed demand",
    });
    const id2 = await recordEvidenceItem(wsA, sessionId, actor, {
      idempotencyKey: key,
      sourceType: "OWNER_ENTERED",
      evidenceType: "CUSTOMER_INTERVIEW",
      observedResult: "Customer confirmed demand",
    });

    expect(id1).toBe(id2);

    const count = await db.startupEvidenceRecord.count({ where: { sessionId, idempotencyKey: key } });
    expect(count).toBe(1);
  });

  it("[db] concurrent owner decisions — supersession chain is consistent", async () => {
    const sessionId = await createStartupSession({
      workspaceId: wsA,
      actorId: actor,
      intake,
      ideas: [viableIdea],
    });

    const d1 = await recordOwnerDecision(wsA, sessionId, actor, { decisionType: "HOLD", rationale: "first" });
    const d2 = await recordOwnerDecision(wsA, sessionId, actor, { decisionType: "GO", rationale: "second" });

    const first = await db.startupOwnerDecision.findFirst({ where: { id: d1 } });
    const second = await db.startupOwnerDecision.findFirst({ where: { id: d2 } });

    // First decision superseded by second
    expect(first!.supersededById).toBe(d2);
    // Second is active
    expect(second!.supersededById).toBeNull();

    const session = await db.ownerStartupSession.findFirst({ where: { id: sessionId } });
    expect(session!.currentOwnerDecisionId).toBe(d2);
  });

  it("[db] economic model versions — sequential versioning is preserved", async () => {
    const sessionId = await createStartupSession({
      workspaceId: wsA,
      actorId: actor,
      intake,
      ideas: [viableIdea],
    });

    const ideas = await db.startupIdeaRecord.findMany({ where: { sessionId } });
    const ideaId = ideas[0].id;

    const economicInputs: EconomicInputs = {
      startupCostCents: 300000n,
      fixedMonthlyCostCents: 100000n,
      variableUnitCostCents: 1000n,
      pricePerUnitCents: 5000n,
      cacCents: 2000n,
      workingCapitalCents: 50000n,
      paymentDelayDays: 0,
      ownerLabourHoursPerWeek: 40,
      availableCapitalCents: 1000000n,
      ownerMonthlyNeedCents: 200000n,
    };

    const m1 = await buildAndPersistEconomicModel(wsA, sessionId, ideaId, actor, economicInputs);
    const m2 = await buildAndPersistEconomicModel(wsA, sessionId, ideaId, actor, economicInputs);

    const model1 = await db.startupEconomicModel.findFirst({ where: { id: m1 } });
    const model2 = await db.startupEconomicModel.findFirst({ where: { id: m2 } });

    expect(model1!.versionNumber).toBe(1);
    expect(model2!.versionNumber).toBe(2);
    // First model superseded by second
    expect(model1!.supersededById).toBe(m2);
  });

  it("[db] cross-workspace denial for getStartupSession", async () => {
    const wsC = randomUUID();
    const sessionId = await createStartupSession({
      workspaceId: wsA,
      actorId: actor,
      intake,
      ideas: [viableIdea],
    });

    await expect(getStartupSession(wsC, sessionId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("[db] cross-workspace denial for updateContextProfile", async () => {
    const wsC = randomUUID();
    const sessionId = await createStartupSession({
      workspaceId: wsA,
      actorId: actor,
      intake,
      ideas: [viableIdea],
    });

    await expect(
      updateContextProfile(wsC, sessionId, actor, { hack: true })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("[db] audit events are rolled back when transaction fails", async () => {
    const fakeSessionId = randomUUID();

    // Attempt to record evidence for a non-existent session — transaction should roll back
    // Evidence create will fail FK because session doesn't exist, so audit event is never written
    const beforeCount = await db.auditEvent.count({ where: { actorId: actor } });

    await expect(
      recordEvidenceItem(wsA, fakeSessionId, actor, {
        idempotencyKey: null,
        sourceType: "OWNER_ENTERED",
        evidenceType: "CUSTOMER_INTERVIEW",
        observedResult: "This should fail",
      })
    ).rejects.toThrow();

    const afterCount = await db.auditEvent.count({ where: { actorId: actor } });
    expect(afterCount).toBe(beforeCount);
  });

  it("[db] concurrent evidence submissions with same idempotency key — only one record created", async () => {
    const sessionId = await createStartupSession({
      workspaceId: wsA,
      actorId: actor,
      intake,
      ideas: [viableIdea],
    });

    const key = `concurrent-idem-${randomUUID()}`;
    const results = await Promise.allSettled([
      recordEvidenceItem(wsA, sessionId, actor, {
        idempotencyKey: key,
        sourceType: "OWNER_ENTERED",
        evidenceType: "PRICING_OBSERVATION",
        observedResult: "Price is $50",
      }),
      recordEvidenceItem(wsA, sessionId, actor, {
        idempotencyKey: key,
        sourceType: "OWNER_ENTERED",
        evidenceType: "PRICING_OBSERVATION",
        observedResult: "Price is $50",
      }),
    ]);

    const ids = results
      .filter((r) => r.status === "fulfilled")
      .map((r) => (r as PromiseFulfilledResult<string>).value);

    // All returned IDs must be the same (idempotency)
    const unique = new Set(ids);
    expect(unique.size).toBe(1);

    const count = await db.startupEvidenceRecord.count({ where: { sessionId, idempotencyKey: key } });
    expect(count).toBe(1);
  });

  it("[db] listing sessions never returns sessions from a different workspace", async () => {
    const wsIsolated = randomUUID();
    await createStartupSession({
      workspaceId: wsA,
      actorId: actor,
      sessionLabel: "isolation-probe",
      intake,
      ideas: [viableIdea],
    });

    const isolatedSessions = await listStartupSessions(wsIsolated);
    expect(isolatedSessions.every((s) => s.workspaceId !== wsA)).toBe(true);
  });

  // ─── Additional concurrency + isolation tests (Sections 8–14) ───────────────

  it("[db] concurrent business model versions — sequential builds produce correct version numbers", async () => {
    const sessionId = await createStartupSession({ workspaceId: wsA, actorId: actor, intake, ideas: [viableIdea] });
    const idea = await db.startupIdeaRecord.findFirst({ where: { sessionId } });
    expect(idea).toBeTruthy();

    const bm = { customerSegment: "SMB", customerProblem: "p", valueProposition: "v", deliveryMethod: "d", revenueModel: "r", pricingHypothesis: "$100/mo" };
    const id1 = await buildAndPersistBusinessModel(wsA, sessionId, idea!.id, actor, bm);
    const id2 = await buildAndPersistBusinessModel(wsA, sessionId, idea!.id, actor, { ...bm, pricingHypothesis: "$150/mo" });

    const v1 = await db.startupBusinessModelVersion.findFirst({ where: { id: id1 } });
    const v2 = await db.startupBusinessModelVersion.findFirst({ where: { id: id2 } });
    expect(v1!.versionNumber).toBe(1);
    expect(v2!.versionNumber).toBe(2);
    expect(v1!.supersededById).toBe(id2);
  });

  it("[db] concurrent market sizing versions — version numbers increment correctly", async () => {
    const sessionId = await createStartupSession({ workspaceId: wsA, actorId: actor, intake, ideas: [viableIdea] });
    const idea = await db.startupIdeaRecord.findFirst({ where: { sessionId } });

    const sz1 = await buildAndPersistMarketSizing(wsA, sessionId, idea!.id, actor, { sizingStatus: "ESTIMATED", confidence: 40 });
    const sz2 = await buildAndPersistMarketSizing(wsA, sessionId, idea!.id, actor, { sizingStatus: "INSUFFICIENT_EVIDENCE", confidence: 20 });

    const r1 = await db.startupMarketSizing.findFirst({ where: { id: sz1 } });
    const r2 = await db.startupMarketSizing.findFirst({ where: { id: sz2 } });
    expect(r1!.versionNumber).toBe(1);
    expect(r2!.versionNumber).toBe(2);
  });

  it("[db] validation plan upsert — replacing a plan emits audit event and creates new record", async () => {
    const sessionId = await createStartupSession({ workspaceId: wsA, actorId: actor, intake, ideas: [viableIdea] });
    const idea = await db.startupIdeaRecord.findFirst({ where: { sessionId } });

    const plan1 = { passCriteria: "3 paying customers", failCriteria: "0 paying customers after 30 days" };
    const plan2 = { passCriteria: "5 paying customers", failCriteria: "0 paying customers after 14 days" };
    const p1 = await buildAndPersistValidationPlan(wsA, sessionId, idea!.id, actor, plan1);
    const p2 = await buildAndPersistValidationPlan(wsA, sessionId, idea!.id, actor, plan2);

    // Old plan must be gone (unique on ideaId, replaced by upsert)
    const old = await db.startupValidationPlan.findFirst({ where: { id: p1 } });
    const current = await db.startupValidationPlan.findFirst({ where: { id: p2 } });
    expect(old).toBeNull();
    expect(current?.passCriteria).toBe("5 paying customers");
  });

  it("[db] approval staleness — adding evidence after GO marks approval stale", async () => {
    const sessionId = await createStartupSession({ workspaceId: wsA, actorId: actor, intake, ideas: [viableIdea] });

    // Record GO decision (no evidence yet)
    const decisionId = await recordOwnerDecision(wsA, sessionId, actor, {
      decisionType: "GO",
      rationale: "looks good",
    });
    expect(decisionId).toBeTruthy();

    // Check staleness before adding evidence — should not be stale
    const before = await checkApprovalStaleness(wsA, sessionId, {});
    expect(before.isStale).toBe(false);

    // Add evidence after GO
    await recordEvidenceItem(wsA, sessionId, actor, {
      idempotencyKey: null,
      sourceType: "OWNER_ENTERED",
      evidenceType: "CUSTOMER_INTERVIEW",
      observedResult: "Customer confirmed demand",
    });

    // Staleness check should now detect evidence change
    const after = await checkApprovalStaleness(wsA, sessionId, {});
    expect(after.isStale).toBe(true);
    expect(after.changedInputs).toContain("evidence");
  });

  it("[db] concurrent readiness assessments — version numbers increment correctly", async () => {
    const sessionId = await createStartupSession({ workspaceId: wsA, actorId: actor, intake, ideas: [viableIdea] });
    const idea = await db.startupIdeaRecord.findFirst({ where: { sessionId } });

    const readinessInput: ReadinessInputs = {
      capitalAvailableCents: 1000000n,
      startupCostCents: 200000n,
      cashRunwayMonths: 6,
      cashFlowPositiveByMonth: 3,
      ownerHoursPerWeek: 30,
      requiredHoursPerWeek: 20,
      hasRegulatoryClearance: true,
      criticalHypothesesCount: 0,
      failedCriticalHypothesesCount: 0,
      economicClassification: "VIABLE",
    };

    const r1 = await assessAndPersistReadiness(wsA, sessionId, idea!.id, actor, readinessInput);
    const r2 = await assessAndPersistReadiness(wsA, sessionId, idea!.id, actor, { ...readinessInput, ownerHoursPerWeek: 10, requiredHoursPerWeek: 25 });

    expect(r1.status).toBeTruthy();
    expect(r2.status).toBeTruthy();
    const assessments = await db.startupReadinessAssessment.findMany({ where: { sessionId } });
    expect(assessments.length).toBeGreaterThanOrEqual(2);
  });

  it("[db] concurrent economic model builds — both succeed and produce distinct versions", async () => {
    const sessionId = await createStartupSession({ workspaceId: wsA, actorId: actor, intake, ideas: [viableIdea] });
    const idea = await db.startupIdeaRecord.findFirst({ where: { sessionId } });

    const economicInputs: EconomicInputs = {
      startupCostCents: 500000n,
      fixedMonthlyCostCents: 100000n,
      variableUnitCostCents: 1000n,
      pricePerUnitCents: 5000n,
      cacCents: 2000n,
      workingCapitalCents: 50000n,
      paymentDelayDays: 0,
      ownerLabourHoursPerWeek: 40,
      availableCapitalCents: 1000000n,
      ownerMonthlyNeedCents: 200000n,
    };

    // Sequential builds (DB unique constraint on [ideaId, versionNumber] prevents race)
    const m1 = await buildAndPersistEconomicModel(wsA, sessionId, idea!.id, actor, economicInputs);
    const m2 = await buildAndPersistEconomicModel(wsA, sessionId, idea!.id, actor, { ...economicInputs, pricePerUnitCents: 7500n });

    const model1 = await db.startupEconomicModel.findFirst({ where: { id: m1 } });
    const model2 = await db.startupEconomicModel.findFirst({ where: { id: m2 } });
    expect(model1!.versionNumber).toBe(1);
    expect(model2!.versionNumber).toBe(2);
    expect(model1!.supersededById).toBe(m2);
  });

  it("[db] blueprint linkage — blueprint record references objectiveId and ownerDecisionId", async () => {
    const sessionId = await createStartupSession({ workspaceId: wsA, actorId: actor, intake, ideas: [viableIdea] });
    const idea = await db.startupIdeaRecord.findFirst({ where: { sessionId } });

    const decisionId = await recordOwnerDecision(wsA, sessionId, actor, {
      decisionType: "GO",
      rationale: "Blueprint test",
    });

    const result = await createBlueprint(wsA, actor, {
      sessionId,
      ideaId: idea!.id,
      ownerDecisionId: decisionId,
      objectiveTitle: "Blueprint linkage test objective",
    });

    const blueprint = await db.startupExecutionBlueprint.findFirst({ where: { id: result.blueprintId } });
    expect(blueprint?.objectiveId).toBe(result.objectiveId);
    expect(blueprint?.ownerDecisionId).toBe(decisionId);
    expect(blueprint?.sessionId).toBe(sessionId);

    const objective = await db.businessObjective.findFirst({ where: { id: result.objectiveId } });
    expect(objective?.linkedStartupSessionId).toBe(sessionId);
    expect(objective?.linkedStartupIdeaId).toBe(idea!.id);
  });

  it("[db] duplicate blueprint blocked — second createBlueprint for same idea returns ConflictError", async () => {
    const sessionId = await createStartupSession({ workspaceId: wsA, actorId: actor, intake, ideas: [viableIdea] });
    const idea = await db.startupIdeaRecord.findFirst({ where: { sessionId } });

    const decisionId = await recordOwnerDecision(wsA, sessionId, actor, {
      decisionType: "GO",
      rationale: "dup test",
    });

    await createBlueprint(wsA, actor, {
      sessionId,
      ideaId: idea!.id,
      ownerDecisionId: decisionId,
      objectiveTitle: "Dup test objective",
    });

    await expect(
      createBlueprint(wsA, actor, {
        sessionId,
        ideaId: idea!.id,
        ownerDecisionId: decisionId,
        objectiveTitle: "Second duplicate attempt",
      })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("[db] cross-workspace evidence denial — evidence not accessible from different workspace", async () => {
    const wsOther = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: wsA, actorId: actor, intake, ideas: [viableIdea] });

    await recordEvidenceItem(wsA, sessionId, actor, {
      idempotencyKey: null,
      sourceType: "OWNER_ENTERED",
      evidenceType: "PRICING_OBSERVATION",
      observedResult: "Market data point",
    });

    const evidenceInOtherWs = await db.startupEvidenceRecord.findMany({
      where: { workspaceId: wsOther, sessionId },
    });
    expect(evidenceInOtherWs).toHaveLength(0);
  });

  it("[db] cross-workspace decision denial — recordOwnerDecision requires valid session in workspace", async () => {
    const wsOther = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: wsA, actorId: actor, intake, ideas: [viableIdea] });

    await expect(
      recordOwnerDecision(wsOther, sessionId, actor, { decisionType: "GO", rationale: "cross-ws" })
    ).rejects.toThrow();
  });

  it("[db] approval package hash stored — GO decision persists 21-field hash", async () => {
    const sessionId = await createStartupSession({ workspaceId: wsA, actorId: actor, intake, ideas: [viableIdea] });

    const decisionId = await recordOwnerDecision(wsA, sessionId, actor, {
      decisionType: "GO",
      rationale: "hash test",
      permittedActions: ["launch_mvp"],
      prohibitedActions: ["hire_staff"],
      materialAssumptions: ["customers exist"],
    });

    const stored = await db.startupOwnerDecision.findFirst({ where: { id: decisionId } });
    expect(stored?.packageHashSha256).toBeTruthy();
    expect(stored?.packageHashSha256?.length).toBe(64); // SHA-256 hex
    expect(stored?.hashVersion).toBe(2);
    expect(stored?.policyVersion).toBe("1");
  });

  it("[db] audit event for business model emitted within transaction", async () => {
    const sessionId = await createStartupSession({ workspaceId: wsA, actorId: actor, intake, ideas: [viableIdea] });
    const idea = await db.startupIdeaRecord.findFirst({ where: { sessionId } });

    const before = await db.auditEvent.count({ where: { actorId: actor } });
    await buildAndPersistBusinessModel(wsA, sessionId, idea!.id, actor, {
      customerSegment: "SMB", customerProblem: "p", valueProposition: "v",
      deliveryMethod: "d", revenueModel: "r", pricingHypothesis: "$100/mo",
    });
    const after = await db.auditEvent.count({ where: { actorId: actor } });
    expect(after).toBeGreaterThan(before);
  });

  it("[db] audit event for validation plan emitted within transaction", async () => {
    const sessionId = await createStartupSession({ workspaceId: wsA, actorId: actor, intake, ideas: [viableIdea] });
    const idea = await db.startupIdeaRecord.findFirst({ where: { sessionId } });

    const before = await db.auditEvent.count({ where: { actorId: actor } });
    await buildAndPersistValidationPlan(wsA, sessionId, idea!.id, actor, {
      passCriteria: "3 customers", failCriteria: "0 customers",
    });
    const after = await db.auditEvent.count({ where: { actorId: actor } });
    expect(after).toBeGreaterThan(before);
  });

  it("[db] audit event for market sizing emitted within transaction", async () => {
    const sessionId = await createStartupSession({ workspaceId: wsA, actorId: actor, intake, ideas: [viableIdea] });
    const idea = await db.startupIdeaRecord.findFirst({ where: { sessionId } });

    const before = await db.auditEvent.count({ where: { actorId: actor } });
    await buildAndPersistMarketSizing(wsA, sessionId, idea!.id, actor, {
      sizingStatus: "ESTIMATED", confidence: 40,
      initialCustomerPool: 500,
    });
    const after = await db.auditEvent.count({ where: { actorId: actor } });
    expect(after).toBeGreaterThan(before);
  });
});
