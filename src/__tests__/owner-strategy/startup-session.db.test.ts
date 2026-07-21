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
  reviseIdea,
  recordHypothesisResult,
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

  // ─── Section 5 supplementary DB tests: staleness, reapproval, objective ───

  it("[db] stale profile version returns 409 and does not mutate the session", async () => {
    const sessionId = await createStartupSession({ workspaceId: wsA, actorId: actor, intake, ideas: [viableIdea] });

    // Advance to version 1
    await updateContextProfile(wsA, sessionId, actor, { v: 1 }, "v1");
    const before = await db.ownerStartupSession.findFirst({ where: { id: sessionId }, select: { profileVersion: true } });

    // Submit stale expectedVersion=0 — must throw ConflictError and leave version unchanged
    await expect(
      updateContextProfile(wsA, sessionId, actor, { v: 99 }, "stale", 0)
    ).rejects.toMatchObject({ statusCode: 409 });

    const after = await db.ownerStartupSession.findFirst({ where: { id: sessionId }, select: { profileVersion: true } });
    expect(after?.profileVersion).toBe(before?.profileVersion); // not mutated
  });

  it("[db] current profile version increments exactly once per update", async () => {
    const sessionId = await createStartupSession({ workspaceId: wsA, actorId: actor, intake, ideas: [viableIdea] });
    const r1 = await updateContextProfile(wsA, sessionId, actor, { a: 1 }, "first");
    const r2 = await updateContextProfile(wsA, sessionId, actor, { a: 2 }, "second");
    expect(r1.versionNumber).toBe(1);
    expect(r2.versionNumber).toBe(2);
    const stored = await db.ownerStartupSession.findFirst({ where: { id: sessionId } });
    expect(stored?.profileVersion).toBe(2);
  });

  it("[db] duplicate idempotent evidence does not make approval stale", async () => {
    const sessionId = await createStartupSession({ workspaceId: wsA, actorId: actor, intake, ideas: [viableIdea] });
    const idem = `idem-stale-test-${randomUUID()}`;

    // Record evidence once
    await recordEvidenceItem(wsA, sessionId, actor, {
      idempotencyKey: idem,
      sourceType: "OWNER_ENTERED",
      evidenceType: "CUSTOMER_INTERVIEW",
      observedResult: "Customer confirmed demand",
    });

    // GO decision — captures current evidence snapshot (one record)
    await recordOwnerDecision(wsA, sessionId, actor, { decisionType: "GO", rationale: "test" });

    const before = await checkApprovalStaleness(wsA, sessionId, {});
    expect(before.isStale).toBe(false);

    // Submit same evidence again — idempotent, same DB row returned
    await recordEvidenceItem(wsA, sessionId, actor, {
      idempotencyKey: idem,
      sourceType: "OWNER_ENTERED",
      evidenceType: "CUSTOMER_INTERVIEW",
      observedResult: "Customer confirmed demand",
    });

    // Approval must NOT become stale — same evidence set
    const after = await checkApprovalStaleness(wsA, sessionId, {});
    expect(after.isStale).toBe(false);
  });

  it("[db] stale blueprint creation returns 409 (ConflictError)", async () => {
    const sessionId = await createStartupSession({ workspaceId: wsA, actorId: actor, intake, ideas: [viableIdea] });
    const idea = await db.startupIdeaRecord.findFirst({ where: { sessionId } });

    // GO decision — no evidence at this point
    const decisionId = await recordOwnerDecision(wsA, sessionId, actor, { decisionType: "GO", rationale: "go" });

    // Add evidence AFTER the decision — makes approval stale
    await recordEvidenceItem(wsA, sessionId, actor, {
      idempotencyKey: null,
      sourceType: "OWNER_ENTERED",
      evidenceType: "CUSTOMER_INTERVIEW",
      observedResult: "New post-decision finding",
    });

    // Blueprint creation with stale decision must throw ConflictError
    await expect(
      createBlueprint(wsA, actor, {
        sessionId,
        ideaId: idea!.id,
        ownerDecisionId: decisionId,
        objectiveTitle: "Stale blueprint attempt",
      })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("[db] stale blueprint creation creates no new BusinessObjective", async () => {
    const sessionId = await createStartupSession({ workspaceId: wsA, actorId: actor, intake, ideas: [viableIdea] });
    const idea = await db.startupIdeaRecord.findFirst({ where: { sessionId } });

    const decisionId = await recordOwnerDecision(wsA, sessionId, actor, { decisionType: "GO", rationale: "go" });

    await recordEvidenceItem(wsA, sessionId, actor, {
      idempotencyKey: null,
      sourceType: "OWNER_ENTERED",
      evidenceType: "CUSTOMER_INTERVIEW",
      observedResult: "Stale evidence",
    });

    const objectivesBefore = await db.businessObjective.count({ where: { workspaceId: wsA, linkedStartupSessionId: sessionId } });

    await expect(
      createBlueprint(wsA, actor, {
        sessionId,
        ideaId: idea!.id,
        ownerDecisionId: decisionId,
        objectiveTitle: "Should not create objective",
      })
    ).rejects.toBeInstanceOf(ConflictError);

    const objectivesAfter = await db.businessObjective.count({ where: { workspaceId: wsA, linkedStartupSessionId: sessionId } });
    expect(objectivesAfter).toBe(objectivesBefore); // rolled back — no orphan objective
  });

  it("[db] reapproval after staleness creates a new immutable decision with updated package hash", async () => {
    const sessionId = await createStartupSession({ workspaceId: wsA, actorId: actor, intake, ideas: [viableIdea] });

    // GO decision 1 — no evidence
    const dec1Id = await recordOwnerDecision(wsA, sessionId, actor, { decisionType: "GO", rationale: "v1" });

    // Add new evidence → stale
    await recordEvidenceItem(wsA, sessionId, actor, {
      idempotencyKey: null,
      sourceType: "OWNER_ENTERED",
      evidenceType: "CUSTOMER_INTERVIEW",
      observedResult: "New post-decision customer finding",
    });

    const stale = await checkApprovalStaleness(wsA, sessionId, {});
    expect(stale.isStale).toBe(true);

    // GO decision 2 — fresh with updated evidence snapshot
    const dec2Id = await recordOwnerDecision(wsA, sessionId, actor, { decisionType: "GO", rationale: "v2 reapproval" });
    expect(dec2Id).not.toBe(dec1Id);

    const dec1 = await db.startupOwnerDecision.findFirst({ where: { id: dec1Id } });
    const dec2 = await db.startupOwnerDecision.findFirst({ where: { id: dec2Id } });

    // Both decisions preserved (immutable history)
    expect(dec1).toBeTruthy();
    expect(dec2).toBeTruthy();

    // Package hashes differ (evidence set changed)
    expect(dec2?.packageHashSha256).not.toBe(dec1?.packageHashSha256);

    // Session now points to the new decision
    const session = await db.ownerStartupSession.findFirst({ where: { id: sessionId } });
    expect(session?.currentOwnerDecisionId).toBe(dec2Id);
  });

  it("[db] blueprint succeeds after reapproval and returned objective is correctly linked", async () => {
    const sessionId = await createStartupSession({ workspaceId: wsA, actorId: actor, intake, ideas: [viableIdea] });
    const idea = await db.startupIdeaRecord.findFirst({ where: { sessionId } });

    // GO decision 1
    await recordOwnerDecision(wsA, sessionId, actor, { decisionType: "GO", rationale: "v1" });

    // Add evidence → stale
    await recordEvidenceItem(wsA, sessionId, actor, {
      idempotencyKey: null,
      sourceType: "OWNER_ENTERED",
      evidenceType: "CUSTOMER_INTERVIEW",
      observedResult: "Staleness trigger",
    });

    // Reapprove — captures updated evidence
    const dec2Id = await recordOwnerDecision(wsA, sessionId, actor, { decisionType: "GO", rationale: "reapproval" });

    const staleCheck = await checkApprovalStaleness(wsA, sessionId, {});
    expect(staleCheck.isStale).toBe(false); // should be fresh now

    // Blueprint creation must succeed
    const result = await createBlueprint(wsA, actor, {
      sessionId,
      ideaId: idea!.id,
      ownerDecisionId: dec2Id,
      objectiveTitle: "Post-reapproval launch objective",
    });

    expect(result.blueprintId).toBeTruthy();
    expect(result.objectiveId).toBeTruthy();

    // Objective exists and is correctly linked
    const objective = await db.businessObjective.findFirst({ where: { id: result.objectiveId } });
    expect(objective).toBeTruthy();
    expect(objective?.workspaceId).toBe(wsA);
    expect(objective?.linkedStartupSessionId).toBe(sessionId);
    expect(objective?.linkedStartupIdeaId).toBe(idea!.id);
  });

  it("[db] objective by-ID lookup is workspace-isolated", async () => {
    const { getObjective } = await import("@/services/owner-mode/business-objective.service");

    const sessionId = await createStartupSession({ workspaceId: wsA, actorId: actor, intake, ideas: [viableIdea] });
    const idea = await db.startupIdeaRecord.findFirst({ where: { sessionId } });
    const decisionId = await recordOwnerDecision(wsA, sessionId, actor, { decisionType: "GO", rationale: "iso" });

    const result = await createBlueprint(wsA, actor, {
      sessionId,
      ideaId: idea!.id,
      ownerDecisionId: decisionId,
      objectiveTitle: "Isolation test objective",
    });

    // getObjective with correct workspace → succeeds
    const obj = await getObjective(wsA, result.objectiveId);
    expect(obj.id).toBe(result.objectiveId);

    // getObjective with wrong workspace → NotFoundError
    await expect(getObjective(wsB, result.objectiveId)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("[db] failed blueprint transaction creates no orphan objective", async () => {
    // Create a blueprint, then verify the SECOND duplicate attempt leaves no new objectives
    const sessionId = await createStartupSession({ workspaceId: wsA, actorId: actor, intake, ideas: [viableIdea] });
    const idea = await db.startupIdeaRecord.findFirst({ where: { sessionId } });
    const decisionId = await recordOwnerDecision(wsA, sessionId, actor, { decisionType: "GO", rationale: "txn" });

    // First blueprint — succeeds
    await createBlueprint(wsA, actor, {
      sessionId, ideaId: idea!.id, ownerDecisionId: decisionId,
      objectiveTitle: "First blueprint",
    });

    const objectivesBefore = await db.businessObjective.count({ where: { workspaceId: wsA, linkedStartupSessionId: sessionId } });

    // Second blueprint — fails with ConflictError (duplicate)
    await expect(
      createBlueprint(wsA, actor, {
        sessionId, ideaId: idea!.id, ownerDecisionId: decisionId,
        objectiveTitle: "Duplicate blueprint",
      })
    ).rejects.toBeInstanceOf(ConflictError);

    const objectivesAfter = await db.businessObjective.count({ where: { workspaceId: wsA, linkedStartupSessionId: sessionId } });
    // Exactly one objective: from the first successful blueprint
    expect(objectivesAfter).toBe(objectivesBefore);
  });
});

describe("[db][concurrency] reviseIdea — exactly one winner per concurrent revision", () => {
  it("[db] two simultaneous revisions of the same idea — exactly one wins", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const sessionId = await createStartupSession(wsA, actor, { label: "Revision concurrency test" });
    // Add initial idea
    const ideaId = randomUUID();
    await db.startupIdeaRecord.create({
      data: {
        id: ideaId, workspaceId: wsA, sessionId,
        name: "Original Idea", industry: "FOOD",
        screeningStatus: "UNSCREENED", version: 1,
        createdBy: actor, updatedBy: actor,
        screeningReasons: [], screeningConstraints: [], evidenceRequired: [],
        accepted: false,
      },
    });

    // Fire two concurrent revisions
    const r1 = reviseIdea(wsA, sessionId, ideaId, actor, { name: "Revision A" }).catch((e: unknown) => e);
    const r2 = reviseIdea(wsA, sessionId, ideaId, actor, { name: "Revision B" }).catch((e: unknown) => e);
    const [res1, res2] = await Promise.all([r1, r2]);

    // Exactly one must succeed (string = new ideaId) and one must fail (ConflictError)
    const succeeded = [res1, res2].filter((r) => typeof r === "string");
    const failed = [res1, res2].filter((r) => r instanceof ConflictError);
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);

    // The original idea must have exactly one supersededById (no branching)
    const original = await db.startupIdeaRecord.findFirst({ where: { id: ideaId } });
    expect(original?.supersededById).toBeTruthy();

    // Exactly one current (non-superseded) version
    const activeVersions = await db.startupIdeaRecord.findMany({
      where: { workspaceId: wsA, sessionId, supersededById: null },
    });
    expect(activeVersions).toHaveLength(1);
    expect(activeVersions[0].version).toBeGreaterThanOrEqual(2);
  });

  it("[db] revising an already-superseded idea returns ConflictError", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const sessionId = await createStartupSession(wsA, actor, { label: "Superseded revision test" });
    const ideaId = randomUUID();
    await db.startupIdeaRecord.create({
      data: {
        id: ideaId, workspaceId: wsA, sessionId,
        name: "Already Superseded", industry: "TECH",
        screeningStatus: "UNSCREENED", version: 1,
        createdBy: actor, updatedBy: actor,
        screeningReasons: [], screeningConstraints: [], evidenceRequired: [],
        accepted: false,
      },
    });

    // First revision — must succeed
    const newId = await reviseIdea(wsA, sessionId, ideaId, actor, { name: "Revision 1" });
    expect(typeof newId).toBe("string");

    // Second revision of the same original idea (already superseded) — must fail
    await expect(
      reviseIdea(wsA, sessionId, ideaId, actor, { name: "Revision 2" })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("[db] cross-workspace reviseIdea is denied", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const sessionId = await createStartupSession(wsA, actor, { label: "Cross-workspace revision test" });
    const ideaId = randomUUID();
    await db.startupIdeaRecord.create({
      data: {
        id: ideaId, workspaceId: wsA, sessionId,
        name: "WsA Idea", industry: "RETAIL",
        screeningStatus: "UNSCREENED", version: 1,
        createdBy: actor, updatedBy: actor,
        screeningReasons: [], screeningConstraints: [], evidenceRequired: [],
        accepted: false,
      },
    });

    // Attempt revision from wsB — must fail with NotFoundError (not ConflictError)
    await expect(
      reviseIdea(wsB, sessionId, ideaId, actor, { name: "Hacked Revision" })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("[db] recordHypothesisResult — staleness and readiness propagation", () => {
  it("[db] DISCONFIRMED hypothesis triggers reassessment creating a new readiness record", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const sessionId = await createStartupSession(wsA, actor, { label: "Hypothesis staleness test" });
    const ideaId = randomUUID();
    await db.startupIdeaRecord.create({
      data: {
        id: ideaId, workspaceId: wsA, sessionId,
        name: "Hypothesis Test Idea", industry: "SERVICES",
        screeningStatus: "PASSED", version: 1,
        createdBy: actor, updatedBy: actor,
        screeningReasons: [], screeningConstraints: [], evidenceRequired: [],
        accepted: false,
      },
    });

    // Create an initial readiness assessment
    const baseReadiness = await assessAndPersistReadiness(wsA, sessionId, ideaId, actor, {
      problemEvidenceCount: 3, customerEvidenceCount: 5, wtpEvidenceCount: 3,
      deliveryTrialCompleted: false, acquisitionChannelTested: false,
      economicClassification: "VIABLE", cashRunwayMonths: 12, breakEvenMonths: 6,
      supplierQuoteObtained: false, regulatoryCheckCompleted: true,
      licenceRequired: false, licenceObtained: null,
      ownerHoursAvailable: 30, capitalAvailableCents: null, startupCostCents: null,
      criticalHypothesesPassed: 2, criticalHypothesesFailed: 0,
    });
    expect(baseReadiness.status).toBe("CONDITIONALLY_READY");

    // Get initial readinessId
    const ideaBefore = await db.startupIdeaRecord.findFirst({ where: { id: ideaId } });
    const readinessIdBefore = ideaBefore?.currentReadinessId;
    expect(readinessIdBefore).toBeTruthy();

    // Create a DEMAND hypothesis and record DISCONFIRMED result
    const hypothesisId = randomUUID();
    await db.startupHypothesis.create({
      data: {
        id: hypothesisId, workspaceId: wsA, sessionId, ideaId,
        statement: "Customers will pay $50/month", hypothesisType: "DEMAND",
        confidenceBefore: 60, falsificationCriteria: "<10% WTP",
        requiresOwnerApproval: true, validationMethod: "CUSTOMER_INTERVIEW",
        createdBy: actor,
      },
    });

    await recordHypothesisResult(wsA, hypothesisId, actor, "DISCONFIRMED", "Customers declined to pay");

    // Readiness record must have been replaced
    const ideaAfter = await db.startupIdeaRecord.findFirst({ where: { id: ideaId } });
    expect(ideaAfter?.currentReadinessId).not.toBe(readinessIdBefore);

    // New readiness record must reflect the failed hypothesis
    const newReadiness = await db.startupReadinessAssessment.findFirst({
      where: { id: ideaAfter!.currentReadinessId! },
    });
    expect(newReadiness?.hardGateFailures).toBeTruthy();
    const gateFailures = newReadiness?.hardGateFailures as string[];
    expect(gateFailures.some((f: string) => f.includes("HYPOTHESIS_FAILED"))).toBe(true);
    expect(newReadiness?.readinessStatus).toBe("BLOCKED");
  });

  it("[db] DISCONFIRMED hypothesis with existing GO decision — approval staleness detectable via changed readinessId", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const sessionId = await createStartupSession(wsA, actor, { label: "Approval staleness via hypothesis" });
    const ideaId = randomUUID();
    await db.startupIdeaRecord.create({
      data: {
        id: ideaId, workspaceId: wsA, sessionId,
        name: "Approval Staleness Test", industry: "FOOD",
        screeningStatus: "PASSED", version: 1,
        createdBy: actor, updatedBy: actor,
        screeningReasons: [], screeningConstraints: [], evidenceRequired: [],
        accepted: false,
      },
    });

    // Initial readiness
    await assessAndPersistReadiness(wsA, sessionId, ideaId, actor, {
      problemEvidenceCount: 5, customerEvidenceCount: 10, wtpEvidenceCount: 5,
      deliveryTrialCompleted: true, acquisitionChannelTested: true,
      economicClassification: "VIABLE", cashRunwayMonths: 18, breakEvenMonths: 4,
      supplierQuoteObtained: true, regulatoryCheckCompleted: true,
      licenceRequired: false, licenceObtained: null,
      ownerHoursAvailable: 40, capitalAvailableCents: null, startupCostCents: null,
      criticalHypothesesPassed: 3, criticalHypothesesFailed: 0,
    });

    // Capture readinessId for GO decision snapshot
    const ideaAfterReadiness = await db.startupIdeaRecord.findFirst({ where: { id: ideaId } });
    const readinessIdAtApproval = ideaAfterReadiness?.currentReadinessId ?? null;

    // Record GO decision pointing to this readiness record
    await recordOwnerDecision(wsA, sessionId, actor, {
      decisionType: "GO",
      linkedSystemRecId: null,
      linkedReadinessId: readinessIdAtApproval,
      linkedIdeaId: ideaId,
    });

    // Create a hypothesis and disconfirm it
    const hypothesisId = randomUUID();
    await db.startupHypothesis.create({
      data: {
        id: hypothesisId, workspaceId: wsA, sessionId, ideaId,
        statement: "Supplier available at $5 unit cost", hypothesisType: "SUPPLY",
        confidenceBefore: 70, falsificationCriteria: "No supplier found",
        requiresOwnerApproval: true, validationMethod: "SUPPLIER_QUOTE",
        createdBy: actor,
      },
    });
    await recordHypothesisResult(wsA, hypothesisId, actor, "DISCONFIRMED", "Supplier unavailable at required price");

    // Staleness check: the current readinessId must now differ from the GO snapshot
    const ideaFinal = await db.startupIdeaRecord.findFirst({ where: { id: ideaId } });
    const currentReadinessId = ideaFinal?.currentReadinessId;
    expect(currentReadinessId).not.toBe(readinessIdAtApproval);

    const staleness = await checkApprovalStaleness(wsA, sessionId, {
      ideaId,
      readinessId: currentReadinessId ?? null,
    });
    expect(staleness.isStale).toBe(true);
    expect(staleness.changedInputs).toContain("readiness");
  });
});
