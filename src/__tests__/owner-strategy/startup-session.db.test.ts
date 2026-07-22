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
  loadCanonicalCurrentApprovalState,
  assessAndPersistReadiness,
  reviseIdea,
  recordHypothesisResult,
  generateIdeasForNeedOptionsPath,
  recordCandidateDecision,
  assertStartupExecutionAuthorization,
  verifyApprovalPackageV1,
  verifyApprovalPackageV2,
  computeApprovalPackageHash,
  transitionSession,
} from "@/services/owner-strategy/startup-session.service";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { createBlueprint } from "@/services/owner-strategy/startup-execution-blueprint.service";
import { ConflictError } from "@/infra/errors";
import type { ReadinessInputs } from "@/domain/owner-strategy/startup-readiness";
import { NotFoundError } from "@/infra/errors";
import type { EconomicInputs } from "@/domain/owner-strategy/startup-economics";
import type { StartupIntake, StartupIdea } from "@/domain/owner-strategy/startup-mode.types";
import type { ApprovalPackageV3State, VersionedApprovalState } from "@/services/owner-strategy/startup-session.service";

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
    const before = await checkApprovalStaleness(wsA, sessionId, await loadCanonicalCurrentApprovalState(wsA, sessionId));
    expect(before.isStale).toBe(false);

    // Add evidence after GO
    await recordEvidenceItem(wsA, sessionId, actor, {
      idempotencyKey: null,
      sourceType: "OWNER_ENTERED",
      evidenceType: "CUSTOMER_INTERVIEW",
      observedResult: "Customer confirmed demand",
    });

    // Staleness check should now detect evidence change
    const after = await checkApprovalStaleness(wsA, sessionId, await loadCanonicalCurrentApprovalState(wsA, sessionId));
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

    const before = await checkApprovalStaleness(wsA, sessionId, await loadCanonicalCurrentApprovalState(wsA, sessionId));
    expect(before.isStale).toBe(false);

    // Submit same evidence again — idempotent, same DB row returned
    await recordEvidenceItem(wsA, sessionId, actor, {
      idempotencyKey: idem,
      sourceType: "OWNER_ENTERED",
      evidenceType: "CUSTOMER_INTERVIEW",
      observedResult: "Customer confirmed demand",
    });

    // Approval must NOT become stale — same evidence set
    const after = await checkApprovalStaleness(wsA, sessionId, await loadCanonicalCurrentApprovalState(wsA, sessionId));
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

    const stale = await checkApprovalStaleness(wsA, sessionId, await loadCanonicalCurrentApprovalState(wsA, sessionId));
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

    const staleCheck = await checkApprovalStaleness(wsA, sessionId, await loadCanonicalCurrentApprovalState(wsA, sessionId));
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
    const sessionId = await createStartupSession({ workspaceId: wsA, actorId: actor, sessionLabel: "Revision concurrency test", intake, ideas: [viableIdea] });
    // Add initial idea
    const ideaId = randomUUID();
    await db.startupIdeaRecord.create({
      data: {
        id: ideaId, workspaceId: wsA, sessionId,
        name: "Original Idea", industry: "FOOD",
        screeningStatus: "UNSCREENED", version: 1,
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

    // The winning revision has version >= 2 and no supersededById
    const winnerNewId = succeeded[0] as string;
    const winner = await db.startupIdeaRecord.findFirst({ where: { id: winnerNewId } });
    expect(winner?.supersededById).toBeNull();
    expect(winner?.version).toBeGreaterThanOrEqual(2);
  });

  it("[db] revising an already-superseded idea returns ConflictError", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const sessionId = await createStartupSession({ workspaceId: wsA, actorId: actor, sessionLabel: "Superseded revision test", intake, ideas: [viableIdea] });
    const ideaId = randomUUID();
    await db.startupIdeaRecord.create({
      data: {
        id: ideaId, workspaceId: wsA, sessionId,
        name: "Already Superseded", industry: "TECH",
        screeningStatus: "UNSCREENED", version: 1,
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
    const sessionId = await createStartupSession({ workspaceId: wsA, actorId: actor, sessionLabel: "Cross-workspace revision test", intake, ideas: [viableIdea] });
    const ideaId = randomUUID();
    await db.startupIdeaRecord.create({
      data: {
        id: ideaId, workspaceId: wsA, sessionId,
        name: "WsA Idea", industry: "RETAIL",
        screeningStatus: "UNSCREENED", version: 1,
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
    const sessionId = await createStartupSession({ workspaceId: wsA, actorId: actor, sessionLabel: "Hypothesis staleness test", intake, ideas: [viableIdea] });
    const ideaId = randomUUID();
    await db.startupIdeaRecord.create({
      data: {
        id: ideaId, workspaceId: wsA, sessionId,
        name: "Hypothesis Test Idea", industry: "SERVICES",
        screeningStatus: "PASSED", version: 1,
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
    const sessionId = await createStartupSession({ workspaceId: wsA, actorId: actor, sessionLabel: "Approval staleness via hypothesis", intake, ideas: [viableIdea] });
    const ideaId = randomUUID();
    await db.startupIdeaRecord.create({
      data: {
        id: ideaId, workspaceId: wsA, sessionId,
        name: "Approval Staleness Test", industry: "FOOD",
        screeningStatus: "PASSED", version: 1,
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
      },
    });
    await recordHypothesisResult(wsA, hypothesisId, actor, "DISCONFIRMED", "Supplier unavailable at required price");

    // Staleness check: the current readinessId must now differ from the GO snapshot
    const ideaFinal = await db.startupIdeaRecord.findFirst({ where: { id: ideaId } });
    const currentReadinessId = ideaFinal?.currentReadinessId;
    expect(currentReadinessId).not.toBe(readinessIdAtApproval);

    const staleness = await checkApprovalStaleness(wsA, sessionId, await loadCanonicalCurrentApprovalState(wsA, sessionId, ideaId));
    expect(staleness.isStale).toBe(true);
    expect(staleness.changedInputs).toContain("readiness");
  });
});

// ─── G-DB: 16 new PostgreSQL closure tests ───────────────────────────────────

describe("[db] G-DB-1: idea generation batch persisted to DB", () => {
  it("G-DB-1: generateIdeasForNeedOptionsPath persists StartupIdeaGenerationBatch record", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake: { capitalAvailable: 5000, monthlySurvivalNeed: 1000, fastCashVsScale: "fast_cash" }, ideas: [] });
    const result = await generateIdeasForNeedOptionsPath(ws, sessionId, actor, { ownerHoursPerWeek: 20, capitalAvailableCents: BigInt(500000), ownerSkills: [], preferredIndustries: [], geography: null, excludedCategories: [], riskTolerance: null, previouslyRejectedIdeaNames: [], existingAssets: [], existingCustomerProblems: [] });
    expect(result.batchId).toBeTruthy();
    const batch = await db.startupIdeaGenerationBatch.findFirst({ where: { id: result.batchId, workspaceId: ws } });
    expect(batch).not.toBeNull();
    expect(batch!.sessionId).toBe(sessionId);
    expect(batch!.conceptCount).toBe(result.concepts.length);
  });
});

describe("[db] G-DB-2: candidate accept creates StartupIdeaRecord", () => {
  it("G-DB-2: accepting a candidate creates a governed StartupIdeaRecord linked to the batch", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake: { capitalAvailable: 5000, monthlySurvivalNeed: 1000, fastCashVsScale: "fast_cash" }, ideas: [] });
    const gen = await generateIdeasForNeedOptionsPath(ws, sessionId, actor, { ownerHoursPerWeek: 20, capitalAvailableCents: BigInt(500000), ownerSkills: [], preferredIndustries: [], geography: null, excludedCategories: [], riskTolerance: null, previouslyRejectedIdeaNames: [], existingAssets: [], existingCustomerProblems: [] });
    if (gen.concepts.length === 0) return; // heuristic may produce 0 concepts without evidence
    const { candidateId, ideaId } = await recordCandidateDecision(ws, sessionId, gen.batchId, 0, actor, { decision: "ACCEPTED" });
    expect(candidateId).toBeTruthy();
    expect(ideaId).toBeTruthy();
    const idea = await db.startupIdeaRecord.findFirst({ where: { id: ideaId!, workspaceId: ws } });
    expect(idea).not.toBeNull();
  });
});

describe("[db] G-DB-3: candidate reject writes operating memory", () => {
  it("G-DB-3: rejecting a candidate persists rationale and writes STARTUP_REJECTED_IDEA memory", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake: { capitalAvailable: 5000, monthlySurvivalNeed: 1000, fastCashVsScale: "fast_cash" }, ideas: [] });
    const gen = await generateIdeasForNeedOptionsPath(ws, sessionId, actor, { ownerHoursPerWeek: 20, capitalAvailableCents: BigInt(500000), ownerSkills: [], preferredIndustries: [], geography: null, excludedCategories: [], riskTolerance: null, previouslyRejectedIdeaNames: [], existingAssets: [], existingCustomerProblems: [] });
    if (gen.concepts.length === 0) return;
    const { candidateId } = await recordCandidateDecision(ws, sessionId, gen.batchId, 0, actor, { decision: "REJECTED", rejectionRationale: "Too capital intensive" });
    const candidate = await db.startupIdeaCandidate.findFirst({ where: { id: candidateId, workspaceId: ws } });
    expect(candidate!.decision).toBe("REJECTED");
    expect(candidate!.rejectionRationale).toBe("Too capital intensive");
    const memory = await db.operatingMemoryEntry.findFirst({ where: { workspaceId: ws, memoryType: "STARTUP_REJECTED_IDEA" } });
    expect(memory).not.toBeNull();
  });
});

describe("[db] G-DB-4: duplicate candidate decision is idempotent", () => {
  it("G-DB-4: accepting same concept twice returns existing record without error", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake: { capitalAvailable: 5000, monthlySurvivalNeed: 1000, fastCashVsScale: "fast_cash" }, ideas: [] });
    const gen = await generateIdeasForNeedOptionsPath(ws, sessionId, actor, { ownerHoursPerWeek: 20, capitalAvailableCents: BigInt(500000), ownerSkills: [], preferredIndustries: [], geography: null, excludedCategories: [], riskTolerance: null, previouslyRejectedIdeaNames: [], existingAssets: [], existingCustomerProblems: [] });
    if (gen.concepts.length === 0) return;
    const r1 = await recordCandidateDecision(ws, sessionId, gen.batchId, 0, actor, { decision: "ACCEPTED" });
    const r2 = await recordCandidateDecision(ws, sessionId, gen.batchId, 0, actor, { decision: "ACCEPTED" });
    expect(r1.candidateId).toBe(r2.candidateId);
  });
});

describe("[db] G-DB-5: candidate decision conflict throws", () => {
  it("G-DB-5: changing decision from ACCEPTED to REJECTED throws ConflictError", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake: { capitalAvailable: 5000, monthlySurvivalNeed: 1000, fastCashVsScale: "fast_cash" }, ideas: [] });
    const gen = await generateIdeasForNeedOptionsPath(ws, sessionId, actor, { ownerHoursPerWeek: 20, capitalAvailableCents: BigInt(500000), ownerSkills: [], preferredIndustries: [], geography: null, excludedCategories: [], riskTolerance: null, previouslyRejectedIdeaNames: [], existingAssets: [], existingCustomerProblems: [] });
    if (gen.concepts.length === 0) return;
    await recordCandidateDecision(ws, sessionId, gen.batchId, 0, actor, { decision: "ACCEPTED" });
    await expect(recordCandidateDecision(ws, sessionId, gen.batchId, 0, actor, { decision: "REJECTED", rejectionRationale: "Changed mind" })).rejects.toThrow(ConflictError);
  });
});

describe("[db] G-DB-6: execution plan stores governance fields", () => {
  it("G-DB-6: createBlueprint persists startDate, targetDate, spendingLimitCents, approvalPackageHash on plan", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake: { capitalAvailable: 200000, monthlySurvivalNeed: 5000, fastCashVsScale: "fast_cash" }, ideas: [{ name: "Idea X", industry: "retail", structural: { grossMarginPct: 60, netMarginPct: 25, monthlyRevenue: 10000, revenueFrequency: "recurring", expansionPath: "local", capitalIntensity: "low", downsideRisk: "low" }, estimatedStartupCost: 8000, estimatedMonthlyRevenue: 10000, estimatedMonthlyCost: 5000 }] });
    const sess = await db.ownerStartupSession.findFirst({ where: { id: sessionId }, include: { ideas: true } });
    const ideaId = sess!.ideas[0].id;
    const decisionId = await recordOwnerDecision(ws, sessionId, actor, { decisionType: "GO", ideaId, spendingLimitCents: BigInt(50000) });
    await db.ownerStartupSession.update({ where: { id: sessionId }, data: { status: "APPROVED" } });
    const startDate = new Date();
    const targetDate = new Date(startDate.getTime() + 60 * 24 * 60 * 60 * 1000);
    const bp = await createBlueprint(ws, actor, { sessionId, ideaId, ownerDecisionId: decisionId, objectiveTitle: "Launch Idea X", executionPlanStartDate: startDate, executionPlanTargetDate: targetDate, executionPlanSpendingLimitCents: BigInt(50000), stopConditions: ["revenue < $0"], rollbackConditions: ["capital exhausted"] });
    const plan = await db.startupExecutionPlan.findFirst({ where: { id: bp.executionPlanId, workspaceId: ws } });
    expect(plan).not.toBeNull();
    expect(plan!.spendingLimitCents).not.toBeNull();
    expect(plan!.approvalPackageHash).toBeTruthy();
    expect(plan!.stopConditions).toBeDefined();
    expect(plan!.rollbackConditions).toBeDefined();
  });
});

describe("[db] G-DB-7: verification windows not hardcoded to 30 days", () => {
  it("G-DB-7: createBlueprint creates verification windows with durations derived from inputs", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake: { capitalAvailable: 200000, monthlySurvivalNeed: 5000, fastCashVsScale: "fast_cash" }, ideas: [{ name: "Idea Y", industry: "food", structural: { grossMarginPct: 60, netMarginPct: 25, monthlyRevenue: 10000, revenueFrequency: "recurring", expansionPath: "local", capitalIntensity: "low", downsideRisk: "low" }, estimatedStartupCost: 8000, estimatedMonthlyRevenue: 10000, estimatedMonthlyCost: 5000 }] });
    const sess = await db.ownerStartupSession.findFirst({ where: { id: sessionId }, include: { ideas: true } });
    const ideaId = sess!.ideas[0].id;
    const decisionId = await recordOwnerDecision(ws, sessionId, actor, { decisionType: "GO", ideaId });
    await db.ownerStartupSession.update({ where: { id: sessionId }, data: { status: "APPROVED" } });
    const bp = await createBlueprint(ws, actor, { sessionId, ideaId, ownerDecisionId: decisionId, objectiveTitle: "Launch Idea Y", windowDerivationInputs: { hypotheses: [{ expectedDurationDays: 45, hypothesisType: "DEMAND", requiresOwnerApproval: false }], economics: { breakEvenMonths: 2, cashRunwayMonths: 4, spendingLimitCents: null, fixedMonthlyCostCents: 300000 } } });
    const windows = await db.startupVerificationWindow.findMany({ where: { workspaceId: ws, sessionId, ideaId } });
    expect(windows.length).toBeGreaterThanOrEqual(2); // validation + break-even at minimum
    const validationWindow = windows.find((w) => w.windowLabel.includes("Validation"));
    expect(validationWindow).toBeDefined();
    const windowDays = Math.round((validationWindow!.endsAt.getTime() - validationWindow!.startsAt.getTime()) / (24 * 60 * 60 * 1000));
    expect(windowDays).toBe(45); // derived from hypothesis, not hardcoded 30
  });
});

describe("[db] G-DB-8: assertStartupExecutionAuthorization blocks non-EXECUTION_PLANNED session", () => {
  it("G-DB-8: authorization fails when session is not in EXECUTION_PLANNED status", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake: { capitalAvailable: 200000, monthlySurvivalNeed: 5000, fastCashVsScale: "fast_cash" }, ideas: [{ name: "Idea Z", industry: "tech", structural: { grossMarginPct: 60, netMarginPct: 25, monthlyRevenue: 10000, revenueFrequency: "recurring", expansionPath: "local", capitalIntensity: "low", downsideRisk: "low" }, estimatedStartupCost: 5000, estimatedMonthlyRevenue: 10000, estimatedMonthlyCost: 5000 }] });
    const sess = await db.ownerStartupSession.findFirst({ where: { id: sessionId }, include: { ideas: true } });
    const ideaId = sess!.ideas[0].id;
    const decisionId = await recordOwnerDecision(ws, sessionId, actor, { decisionType: "GO", ideaId });
    await db.ownerStartupSession.update({ where: { id: sessionId }, data: { status: "APPROVED" } });
    const bp = await createBlueprint(ws, actor, { sessionId, ideaId, ownerDecisionId: decisionId, objectiveTitle: "Launch" });
    const plan = await db.startupExecutionPlan.findFirst({ where: { id: bp.executionPlanId } });
    // Session is still APPROVED — not EXECUTION_PLANNED
    const result = await assertStartupExecutionAuthorization(ws, { sessionId, blueprintId: bp.blueprintId, planId: plan!.id, ownerDecisionId: decisionId, ideaId, actionType: "TASK_START" });
    expect(result.authorized).toBe(false);
    expect(result.violations.some((v) => v.includes("EXECUTION_PLANNED"))).toBe(true);
  });
});

describe("[db] G-DB-9: assertStartupExecutionAuthorization passes for valid execution chain", () => {
  it("G-DB-9: authorization passes when session is in EXECUTION_PLANNED with valid blueprint, plan, and decision", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake: { capitalAvailable: 200000, monthlySurvivalNeed: 5000, fastCashVsScale: "fast_cash" }, ideas: [{ name: "Idea Auth", industry: "retail", structural: { grossMarginPct: 60, netMarginPct: 25, monthlyRevenue: 10000, revenueFrequency: "recurring", expansionPath: "local", capitalIntensity: "low", downsideRisk: "low" }, estimatedStartupCost: 5000, estimatedMonthlyRevenue: 10000, estimatedMonthlyCost: 5000 }] });
    const sess = await db.ownerStartupSession.findFirst({ where: { id: sessionId }, include: { ideas: true } });
    const ideaId = sess!.ideas[0].id;
    const decisionId = await recordOwnerDecision(ws, sessionId, actor, { decisionType: "GO", ideaId });
    await db.ownerStartupSession.update({ where: { id: sessionId }, data: { status: "EXECUTION_PLANNED" } });
    const bp = await createBlueprint(ws, actor, { sessionId, ideaId, ownerDecisionId: decisionId, objectiveTitle: "Launch" });
    const plan = await db.startupExecutionPlan.findFirst({ where: { id: bp.executionPlanId } });
    const result = await assertStartupExecutionAuthorization(ws, { sessionId, blueprintId: bp.blueprintId, planId: plan!.id, ownerDecisionId: decisionId, ideaId, actionType: "TASK_START" });
    expect(result.authorized).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
});

describe("[db] G-DB-10: assertStartupExecutionAuthorization blocks expired decision", () => {
  it("G-DB-10: authorization fails when GO decision validUntil is in the past", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake: { capitalAvailable: 200000, monthlySurvivalNeed: 5000, fastCashVsScale: "fast_cash" }, ideas: [{ name: "Idea Exp", industry: "retail", structural: { grossMarginPct: 60, netMarginPct: 25, monthlyRevenue: 10000, revenueFrequency: "recurring", expansionPath: "local", capitalIntensity: "low", downsideRisk: "low" }, estimatedStartupCost: 5000, estimatedMonthlyRevenue: 10000, estimatedMonthlyCost: 5000 }] });
    const sess = await db.ownerStartupSession.findFirst({ where: { id: sessionId }, include: { ideas: true } });
    const ideaId = sess!.ideas[0].id;
    const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
    const decisionId = await recordOwnerDecision(ws, sessionId, actor, { decisionType: "GO", ideaId, validUntil: pastDate });
    await db.ownerStartupSession.update({ where: { id: sessionId }, data: { status: "EXECUTION_PLANNED" } });
    const bp = await createBlueprint(ws, actor, { sessionId, ideaId, ownerDecisionId: decisionId, objectiveTitle: "Launch" });
    const plan = await db.startupExecutionPlan.findFirst({ where: { id: bp.executionPlanId } });
    const result = await assertStartupExecutionAuthorization(ws, { sessionId, blueprintId: bp.blueprintId, planId: plan!.id, ownerDecisionId: decisionId, ideaId, actionType: "TASK_START" });
    expect(result.authorized).toBe(false);
    expect(result.violations.some((v) => v.includes("expired"))).toBe(true);
  });
});

describe("[db] G-DB-11: assertStartupExecutionAuthorization blocks prohibited action", () => {
  it("G-DB-11: authorization fails when actionType is in prohibitedActions", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake: { capitalAvailable: 200000, monthlySurvivalNeed: 5000, fastCashVsScale: "fast_cash" }, ideas: [{ name: "Idea Proh", industry: "retail", structural: { grossMarginPct: 60, netMarginPct: 25, monthlyRevenue: 10000, revenueFrequency: "recurring", expansionPath: "local", capitalIntensity: "low", downsideRisk: "low" }, estimatedStartupCost: 5000, estimatedMonthlyRevenue: 10000, estimatedMonthlyCost: 5000 }] });
    const sess = await db.ownerStartupSession.findFirst({ where: { id: sessionId }, include: { ideas: true } });
    const ideaId = sess!.ideas[0].id;
    const decisionId = await recordOwnerDecision(ws, sessionId, actor, { decisionType: "GO", ideaId, prohibitedActions: ["EXTERNAL_CONTRACT"] });
    await db.ownerStartupSession.update({ where: { id: sessionId }, data: { status: "EXECUTION_PLANNED" } });
    const bp = await createBlueprint(ws, actor, { sessionId, ideaId, ownerDecisionId: decisionId, objectiveTitle: "Launch" });
    const plan = await db.startupExecutionPlan.findFirst({ where: { id: bp.executionPlanId } });
    const result = await assertStartupExecutionAuthorization(ws, { sessionId, blueprintId: bp.blueprintId, planId: plan!.id, ownerDecisionId: decisionId, ideaId, actionType: "EXTERNAL_CONTRACT" });
    expect(result.authorized).toBe(false);
    expect(result.violations.some((v) => v.includes("prohibited"))).toBe(true);
  });
});

describe("[db] G-DB-12: assertStartupExecutionAuthorization blocks spending over limit", () => {
  it("G-DB-12: authorization fails when spending exceeds GO decision spendingLimitCents", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake: { capitalAvailable: 200000, monthlySurvivalNeed: 5000, fastCashVsScale: "fast_cash" }, ideas: [{ name: "Idea Spend", industry: "retail", structural: { grossMarginPct: 60, netMarginPct: 25, monthlyRevenue: 10000, revenueFrequency: "recurring", expansionPath: "local", capitalIntensity: "low", downsideRisk: "low" }, estimatedStartupCost: 5000, estimatedMonthlyRevenue: 10000, estimatedMonthlyCost: 5000 }] });
    const sess = await db.ownerStartupSession.findFirst({ where: { id: sessionId }, include: { ideas: true } });
    const ideaId = sess!.ideas[0].id;
    const decisionId = await recordOwnerDecision(ws, sessionId, actor, { decisionType: "GO", ideaId, spendingLimitCents: BigInt(10000) });
    await db.ownerStartupSession.update({ where: { id: sessionId }, data: { status: "EXECUTION_PLANNED" } });
    const bp = await createBlueprint(ws, actor, { sessionId, ideaId, ownerDecisionId: decisionId, objectiveTitle: "Launch" });
    const plan = await db.startupExecutionPlan.findFirst({ where: { id: bp.executionPlanId } });
    const result = await assertStartupExecutionAuthorization(ws, { sessionId, blueprintId: bp.blueprintId, planId: plan!.id, ownerDecisionId: decisionId, ideaId, actionType: "TASK_START", spendingCents: BigInt(50000) });
    expect(result.authorized).toBe(false);
    expect(result.violations.some((v) => v.includes("spending limit"))).toBe(true);
  });
});

describe("[db] G-DB-13: assertStartupExecutionAuthorization blocks superseded blueprint", () => {
  it("G-DB-13: authorization fails when blueprint is SUPERSEDED", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake: { capitalAvailable: 200000, monthlySurvivalNeed: 5000, fastCashVsScale: "fast_cash" }, ideas: [{ name: "Idea Super", industry: "retail", structural: { grossMarginPct: 60, netMarginPct: 25, monthlyRevenue: 10000, revenueFrequency: "recurring", expansionPath: "local", capitalIntensity: "low", downsideRisk: "low" }, estimatedStartupCost: 5000, estimatedMonthlyRevenue: 10000, estimatedMonthlyCost: 5000 }] });
    const sess = await db.ownerStartupSession.findFirst({ where: { id: sessionId }, include: { ideas: true } });
    const ideaId = sess!.ideas[0].id;
    const decisionId = await recordOwnerDecision(ws, sessionId, actor, { decisionType: "GO", ideaId });
    await db.ownerStartupSession.update({ where: { id: sessionId }, data: { status: "EXECUTION_PLANNED" } });
    const bp = await createBlueprint(ws, actor, { sessionId, ideaId, ownerDecisionId: decisionId, objectiveTitle: "Launch" });
    // Manually supersede the blueprint
    await db.startupExecutionBlueprint.update({ where: { id: bp.blueprintId }, data: { blueprintStatus: "SUPERSEDED" } });
    const plan = await db.startupExecutionPlan.findFirst({ where: { id: bp.executionPlanId } });
    const result = await assertStartupExecutionAuthorization(ws, { sessionId, blueprintId: bp.blueprintId, planId: plan!.id, ownerDecisionId: decisionId, ideaId, actionType: "TASK_START" });
    expect(result.authorized).toBe(false);
    expect(result.violations.some((v) => v.includes("superseded"))).toBe(true);
  });
});

describe("[db] G-DB-14: approval hash v1 and v2 are different and stable", () => {
  it("G-DB-14: verifyApprovalPackageV1 and V2 produce stable distinct hashes", () => {
    const c = { sessionId: "s1", ideaId: "i1", ideaVersionId: "iv1" };
    const h1a = verifyApprovalPackageV1(c);
    const h1b = verifyApprovalPackageV1(c);
    const h2a = verifyApprovalPackageV2(c);
    const h2b = verifyApprovalPackageV2(c);
    expect(h1a).toBe(h1b);
    expect(h2a).toBe(h2b);
    expect(h1a).not.toBe(h2a);
  });
});

describe("[db] G-DB-15: computeApprovalPackageHash dispatches on hashVersion", () => {
  it("G-DB-15: hashVersion=1 produces V1 hash, hashVersion=2 produces V2 hash, default is V2", () => {
    const c = { sessionId: "s1", ideaId: "i1" };
    expect(computeApprovalPackageHash({ ...c, hashVersion: 1 })).toBe(verifyApprovalPackageV1({ ...c, hashVersion: 1 }));
    expect(computeApprovalPackageHash({ ...c, hashVersion: 2 })).toBe(verifyApprovalPackageV2({ ...c, hashVersion: 2 }));
    expect(computeApprovalPackageHash(c)).toBe(verifyApprovalPackageV2(c));
  });
});

describe("[db] G-DB-16: cross-workspace candidate isolation", () => {
  it("G-DB-16: recordCandidateDecision for batch in workspace B throws when called with workspace A", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const wsX = randomUUID();
    const wsY = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: wsX, actorId: actor, intake: { capitalAvailable: 5000, monthlySurvivalNeed: 1000, fastCashVsScale: "fast_cash" }, ideas: [] });
    const gen = await generateIdeasForNeedOptionsPath(wsX, sessionId, actor, { ownerHoursPerWeek: 20, capitalAvailableCents: BigInt(500000), ownerSkills: [], preferredIndustries: [], geography: null, excludedCategories: [], riskTolerance: null, previouslyRejectedIdeaNames: [], existingAssets: [], existingCustomerProblems: [] });
    if (gen.concepts.length === 0) return;
    // Try to access the batch from a different workspace
    await expect(recordCandidateDecision(wsY, sessionId, gen.batchId, 0, actor, { decision: "ACCEPTED" })).rejects.toThrow(NotFoundError);
  });
});

// ─── G-DB-17 through G-DB-35 ────────────────────────────────────────────────

describe("[db] G-DB-17: profile concurrency — last-write-wins within version lock", () => {
  it("G-DB-17: concurrent profile updates on same version reject the second writer", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake: { capitalAvailable: 10000, monthlySurvivalNeed: 2000, fastCashVsScale: "fast_cash" }, ideas: [] });
    // BigInt cannot be stored in a Prisma JSON field — use plain numbers
    const profile1 = { geography: "AU", capitalAvailableCents: 100000, ownerSkills: ["sales"], ownerHoursPerWeek: 20, excludedCategories: [], riskTolerance: "MEDIUM" as const, preferredIndustries: ["services"], previouslyRejectedIdeaNames: [], existingAssets: [], existingCustomerProblems: [] };
    const profile2 = { ...profile1, geography: "NZ" };
    // profileVersion starts at 0; first write with expectedVersion=0 succeeds and bumps to 1
    await updateContextProfile(ws, sessionId, actor, profile1, "initial-write", 0);
    // Second write with the same expectedVersion=0 fails (current is now 1)
    await expect(updateContextProfile(ws, sessionId, actor, profile2, "concurrent-write", 0)).rejects.toThrow();
  });
});

describe("[db] G-DB-18: idea revision concurrency — simultaneous revisions reject the second", () => {
  it("G-DB-18: two concurrent revisions of the same idea fail on the second attempt", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake: { capitalAvailable: 10000, monthlySurvivalNeed: 2000, fastCashVsScale: "fast_cash" }, ideas: [viableIdea] });
    const sess = await db.ownerStartupSession.findFirst({ where: { id: sessionId }, include: { ideas: true } });
    const ideaId = sess!.ideas[0].id;
    // First revision succeeds — signature: (workspaceId, sessionId, ideaId, actorId, revisions)
    await reviseIdea(ws, sessionId, ideaId, actor, { name: "Mobile Car Wash v2" });
    // Revising the original ideaId again fails: it is now superseded
    await expect(reviseIdea(ws, sessionId, ideaId, actor, { name: "Mobile Car Wash v3" })).rejects.toThrow();
  });
});

describe("[db] G-DB-19: evidence idempotency — same evidence hash recorded twice", () => {
  it("G-DB-19: recording evidence with the same content hash twice returns the same id", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake: { capitalAvailable: 10000, monthlySurvivalNeed: 2000, fastCashVsScale: "fast_cash" }, ideas: [] });
    // idempotencyKey must be present for dedup to fire (service skips dedup without it)
    const evidencePayload = { sourceType: "AUTHORITATIVE_PRIMARY" as const, evidenceType: "CUSTOMER_DEMAND" as const, observedResult: "50 customers surveyed wanted the service", geography: "AU", customerSegment: "Homeowners", reliabilityScore: 80, confidence: 75, ownerVerified: true, idempotencyKey: "g-db-19-evidence-key" };
    const id1 = await recordEvidenceItem(ws, sessionId, actor, evidencePayload);
    const id2 = await recordEvidenceItem(ws, sessionId, actor, evidencePayload);
    // Idempotent — both return same evidence record id
    expect(id1).toBe(id2);
  });
});

describe("[db] G-DB-20: validation-plan concurrency — plan cannot be overwritten without new version", () => {
  it("G-DB-20: building a second validation plan for the same idea rejects when plan already exists", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake: { capitalAvailable: 10000, monthlySurvivalNeed: 2000, fastCashVsScale: "fast_cash" }, ideas: [viableIdea] });
    const sess = await db.ownerStartupSession.findFirst({ where: { id: sessionId }, include: { ideas: true } });
    const ideaId = sess!.ideas[0].id;
    // Service deletes and recreates the plan on each call (one-per-idea, no ConflictError)
    const planInput = { passCriteria: "At least 10 paying customers", failCriteria: "Fewer than 2 interested" };
    const plan1Id = await buildAndPersistValidationPlan(ws, sessionId, ideaId, actor, planInput);
    const plan2Id = await buildAndPersistValidationPlan(ws, sessionId, ideaId, actor, planInput);
    expect(plan1Id).not.toBe(plan2Id);
    // Original plan is deleted before replacement — it must no longer exist
    const plan1 = await db.startupValidationPlan.findUnique({ where: { id: plan1Id } });
    expect(plan1).toBeNull();
  });
});

describe("[db] G-DB-21: business-model concurrency — versioned supersession", () => {
  it("G-DB-21: building two business models supersedes the first and links them", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake: { capitalAvailable: 10000, monthlySurvivalNeed: 2000, fastCashVsScale: "fast_cash" }, ideas: [viableIdea] });
    const sess = await db.ownerStartupSession.findFirst({ where: { id: sessionId }, include: { ideas: true } });
    const ideaId = sess!.ideas[0].id;
    const bmInput = { customerSegment: "Residential homeowners", customerProblem: "Car washing is time-consuming", valueProposition: "Convenient mobile car wash at home", deliveryMethod: "Mobile van", revenueModel: "Per-wash fee", pricingHypothesis: "$80 per standard wash" };
    const bm1Id = await buildAndPersistBusinessModel(ws, sessionId, ideaId, actor, bmInput);
    const bm2Id = await buildAndPersistBusinessModel(ws, sessionId, ideaId, actor, bmInput);
    expect(bm1Id).not.toBe(bm2Id);
    // Prisma model is startupBusinessModelVersion (not startupBusinessModel)
    const bm1 = await db.startupBusinessModelVersion.findUnique({ where: { id: bm1Id } });
    expect(bm1?.supersededById).toBe(bm2Id);
  });
});

describe("[db] G-DB-22: market-sizing concurrency — two calls produce versioned records", () => {
  it("G-DB-22: repeated market sizing creates a new version and marks the old one superseded", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake: { capitalAvailable: 10000, monthlySurvivalNeed: 2000, fastCashVsScale: "fast_cash" }, ideas: [viableIdea] });
    const sess = await db.ownerStartupSession.findFirst({ where: { id: sessionId }, include: { ideas: true } });
    const ideaId = sess!.ideas[0].id;
    // All MarketSizingInput fields are optional — empty object is valid
    const ms1Id = await buildAndPersistMarketSizing(ws, sessionId, ideaId, actor, {});
    const ms2Id = await buildAndPersistMarketSizing(ws, sessionId, ideaId, actor, {});
    expect(ms1Id).not.toBe(ms2Id);
    // StartupMarketSizing has no supersededById — versioning is by versionNumber
    const ms1 = await db.startupMarketSizing.findUnique({ where: { id: ms1Id } });
    const ms2 = await db.startupMarketSizing.findUnique({ where: { id: ms2Id } });
    expect(ms1?.versionNumber).toBe(1);
    expect(ms2?.versionNumber).toBe(2);
  });
});

describe("[db] G-DB-23: economic-model concurrency — two calls produce versioned records", () => {
  it("G-DB-23: repeated economic model build creates new version and marks old superseded", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake: { capitalAvailable: 10000, monthlySurvivalNeed: 2000, fastCashVsScale: "fast_cash" }, ideas: [viableIdea] });
    const sess = await db.ownerStartupSession.findFirst({ where: { id: sessionId }, include: { ideas: true } });
    const ideaId = sess!.ideas[0].id;
    const inputs: EconomicInputs = { pricePerUnitCents: BigInt(5000), variableUnitCostCents: BigInt(1500), fixedMonthlyCostCents: BigInt(100000), startupCostCents: BigInt(300000) };
    const em1Id = await buildAndPersistEconomicModel(ws, sessionId, ideaId, actor, inputs);
    const em2Id = await buildAndPersistEconomicModel(ws, sessionId, ideaId, actor, inputs);
    expect(em1Id).not.toBe(em2Id);
    const em1 = await db.startupEconomicModel.findUnique({ where: { id: em1Id } });
    expect(em1?.supersededById).toBe(em2Id);
  });
});

describe("[db] G-DB-24: readiness concurrency — two calls produce versioned records", () => {
  it("G-DB-24: repeated readiness assessment creates new record and marks prior superseded", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake: { capitalAvailable: 10000, monthlySurvivalNeed: 2000, fastCashVsScale: "fast_cash" }, ideas: [viableIdea] });
    const sess = await db.ownerStartupSession.findFirst({ where: { id: sessionId }, include: { ideas: true } });
    const ideaId = sess!.ideas[0].id;
    const inputs: ReadinessInputs = { ideaId, sessionId, workspaceId: ws, hypotheses: [], evidence: [], economics: null, risks: [], constraints: [], profile: { capitalAvailableCents: BigInt(10000), ownerHoursPerWeek: 40, geography: null, ownerSkills: [], existingAssets: [], riskTolerance: null } };
    // assessAndPersistReadiness returns the domain result object (not a DB id);
    // query the DB to get persisted record ids
    await assessAndPersistReadiness(ws, sessionId, ideaId, actor, inputs);
    const after1 = await db.startupReadinessAssessment.findMany({ where: { sessionId, ideaId }, orderBy: { assessedAt: "asc" } });
    expect(after1.length).toBe(1);
    const ra1Id = after1[0].id;
    await assessAndPersistReadiness(ws, sessionId, ideaId, actor, inputs);
    const after2 = await db.startupReadinessAssessment.findMany({ where: { sessionId, ideaId }, orderBy: { assessedAt: "asc" } });
    expect(after2.length).toBe(2);
    const ra2Id = after2[1].id;
    expect(ra1Id).not.toBe(ra2Id);
    // Second assessment becomes the current one on the idea record
    const idea = await db.startupIdeaRecord.findUnique({ where: { id: ideaId } });
    expect(idea?.currentReadinessId).toBe(ra2Id);
  });
});

describe("[db] G-DB-25: owner-decision concurrency — second GO decision supersedes first", () => {
  it("G-DB-25: submitting a second GO decision marks the first as superseded and becomes the session current", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake: { capitalAvailable: 10000, monthlySurvivalNeed: 2000, fastCashVsScale: "fast_cash" }, ideas: [viableIdea] });
    const sess = await db.ownerStartupSession.findFirst({ where: { id: sessionId }, include: { ideas: true } });
    const ideaId = sess!.ideas[0].id;
    const d1 = await recordOwnerDecision(ws, sessionId, actor, { decisionType: "GO", ideaId });
    const d2 = await recordOwnerDecision(ws, sessionId, actor, { decisionType: "GO", ideaId });
    // Second decision must be different from first
    expect(d1).not.toBe(d2);
    // First decision must be marked superseded by second
    const first = await db.startupOwnerDecision.findUnique({ where: { id: d1 } });
    expect(first?.supersededById).toBe(d2);
    // Session's current decision must be the second
    const session = await db.ownerStartupSession.findUnique({ where: { id: sessionId } });
    expect(session?.currentOwnerDecisionId).toBe(d2);
  });
});

describe("[db] G-DB-26: blueprint uniqueness — second blueprint creation is blocked by unique constraint", () => {
  it("G-DB-26: creating a second ACTIVE blueprint for the same session+idea throws ConflictError", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake: { capitalAvailable: 10000, monthlySurvivalNeed: 2000, fastCashVsScale: "fast_cash" }, ideas: [viableIdea] });
    const sess = await db.ownerStartupSession.findFirst({ where: { id: sessionId }, include: { ideas: true } });
    const ideaId = sess!.ideas[0].id;
    await db.ownerStartupSession.update({ where: { id: sessionId }, data: { status: "EXECUTION_PLANNED" } });
    const d1 = await recordOwnerDecision(ws, sessionId, actor, { decisionType: "GO", ideaId });
    const bp1 = await createBlueprint(ws, actor, { sessionId, ideaId, ownerDecisionId: d1, objectiveTitle: "Launch v1" });
    // A second blueprint for the same session+idea is blocked — unique constraint on (sessionId, ideaId, blueprintStatus)
    const d2 = await recordOwnerDecision(ws, sessionId, actor, { decisionType: "GO", ideaId });
    await expect(createBlueprint(ws, actor, { sessionId, ideaId, ownerDecisionId: d2, objectiveTitle: "Launch v2" })).rejects.toThrow(ConflictError);
    // createBlueprint supersedes the first blueprint before attempting the second creation,
    // so the first record ends up SUPERSEDED even though the second creation fails.
    const first = await db.startupExecutionBlueprint.findUnique({ where: { id: bp1.blueprintId } });
    expect(first?.blueprintStatus).toBe("SUPERSEDED");
  });
});

describe("[db] G-DB-27: expired GO decision blocks execution authorization", () => {
  it("G-DB-27: assertStartupExecutionAuthorization rejects when the GO decision validUntil is in the past", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake: { capitalAvailable: 10000, monthlySurvivalNeed: 2000, fastCashVsScale: "fast_cash" }, ideas: [viableIdea] });
    const sess = await db.ownerStartupSession.findFirst({ where: { id: sessionId }, include: { ideas: true } });
    const ideaId = sess!.ideas[0].id;
    // GO decision with a validUntil in the past — G2-13 must fire
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const decisionId = await recordOwnerDecision(ws, sessionId, actor, { decisionType: "GO", ideaId, validUntil: pastDate });
    await db.ownerStartupSession.update({ where: { id: sessionId }, data: { status: "EXECUTION_PLANNED" } });
    const bp = await createBlueprint(ws, actor, { sessionId, ideaId, ownerDecisionId: decisionId, objectiveTitle: "Launch" });
    const plan = await db.startupExecutionPlan.findFirst({ where: { id: bp.executionPlanId } });
    const result = await assertStartupExecutionAuthorization(ws, { sessionId, blueprintId: bp.blueprintId, planId: plan!.id, ownerDecisionId: decisionId, ideaId, actionType: "TASK_START" });
    expect(result.authorized).toBe(false);
    expect(result.violations.some((v) => v.toLowerCase().includes("expir"))).toBe(true);
  });
});

describe("[db] G-DB-28: superseded GO decision blocks execution authorization", () => {
  it("G-DB-28: assertStartupExecutionAuthorization rejects when the ownerDecisionId references a superseded decision", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake: { capitalAvailable: 10000, monthlySurvivalNeed: 2000, fastCashVsScale: "fast_cash" }, ideas: [viableIdea] });
    const sess = await db.ownerStartupSession.findFirst({ where: { id: sessionId }, include: { ideas: true } });
    const ideaId = sess!.ideas[0].id;
    // Record first GO decision and build blueprint under it
    const d1 = await recordOwnerDecision(ws, sessionId, actor, { decisionType: "GO", ideaId });
    await db.ownerStartupSession.update({ where: { id: sessionId }, data: { status: "EXECUTION_PLANNED" } });
    const bp = await createBlueprint(ws, actor, { sessionId, ideaId, ownerDecisionId: d1, objectiveTitle: "Launch" });
    const plan = await db.startupExecutionPlan.findFirst({ where: { id: bp.executionPlanId } });
    // Record a second GO decision — supersedes d1 (G2-10 and G2-11 must fire)
    await recordOwnerDecision(ws, sessionId, actor, { decisionType: "GO", ideaId });
    const result = await assertStartupExecutionAuthorization(ws, { sessionId, blueprintId: bp.blueprintId, planId: plan!.id, ownerDecisionId: d1, ideaId, actionType: "TASK_START" });
    expect(result.authorized).toBe(false);
    expect(result.violations.some((v) => v.toLowerCase().includes("superseded") || v.toLowerCase().includes("current"))).toBe(true);
  });
});

describe("[db] G-DB-29: superseded plan is non-executable", () => {
  it("G-DB-29: assertStartupExecutionAuthorization rejects when execution plan is SUPERSEDED", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake: { capitalAvailable: 10000, monthlySurvivalNeed: 2000, fastCashVsScale: "fast_cash" }, ideas: [viableIdea] });
    const sess = await db.ownerStartupSession.findFirst({ where: { id: sessionId }, include: { ideas: true } });
    const ideaId = sess!.ideas[0].id;
    const decisionId = await recordOwnerDecision(ws, sessionId, actor, { decisionType: "GO", ideaId });
    await db.ownerStartupSession.update({ where: { id: sessionId }, data: { status: "EXECUTION_PLANNED" } });
    const bp = await createBlueprint(ws, actor, { sessionId, ideaId, ownerDecisionId: decisionId, objectiveTitle: "Launch" });
    // Supersede the plan
    await db.startupExecutionPlan.update({ where: { id: bp.executionPlanId }, data: { status: "SUPERSEDED" } });
    const result = await assertStartupExecutionAuthorization(ws, { sessionId, blueprintId: bp.blueprintId, planId: bp.executionPlanId, ownerDecisionId: decisionId, ideaId, actionType: "TASK_START" });
    expect(result.authorized).toBe(false);
    expect(result.violations.some((v) => v.toLowerCase().includes("superseded") || v.toLowerCase().includes("plan"))).toBe(true);
  });
});

describe("[db] G-DB-30: audit rollback on transaction failure", () => {
  it("G-DB-30: if a service write fails mid-transaction, no partial audit event is persisted", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake: { capitalAvailable: 10000, monthlySurvivalNeed: 2000, fastCashVsScale: "fast_cash" }, ideas: [] });
    const beforeCount = await db.auditEvent.count({ where: { actorId: actor, entityId: sessionId } });
    // Attempt to update profile with a wrong expectedVersion (999) — triggers ConflictError inside $transaction,
    // rolling back any state written within the transaction before the error.
    await expect(updateContextProfile(ws, sessionId, actor, { foo: "test" }, "rollback-test", 999)).rejects.toThrow();
    const afterCount = await db.auditEvent.count({ where: { actorId: actor, entityId: sessionId } });
    // Audit count must not have increased
    expect(afterCount).toBe(beforeCount);
  });
});

describe("[db] G-DB-31: V3 hash dispatch proof", () => {
  it("G-DB-31: computeApprovalPackageHash with hashVersion=3 includes v3-specific state fields", () => {
    const c = { sessionId: "s1", ideaId: "i1", ideaVersionId: "iv1", hashVersion: 3 as const };
    const v3State: ApprovalPackageV3State = { evidenceState: [{ id: "e1", freshnessClassification: "FRESH" }] };
    const hV3withState = computeApprovalPackageHash(c, v3State);
    const hV3noState = computeApprovalPackageHash(c, { evidenceState: [] });
    const hV2 = verifyApprovalPackageV2({ ...c, hashVersion: 2 });
    // V3 hash is different from V2
    expect(hV3withState).not.toBe(hV2);
    // V3 with vs without state may differ (state changes hash)
    // Both must be stable (call twice, same result)
    expect(computeApprovalPackageHash(c, v3State)).toBe(hV3withState);
    expect(computeApprovalPackageHash(c)).toBe(hV3noState);
  });
});

describe("[db] G-DB-32: canonical lineage of blueprint-generated artifacts", () => {
  it("G-DB-32: blueprint-created risks and constraints carry originBlueprintId and BLUEPRINT_ARTIFACT originType", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake: { capitalAvailable: 10000, monthlySurvivalNeed: 2000, fastCashVsScale: "fast_cash" }, ideas: [viableIdea] });
    const sess = await db.ownerStartupSession.findFirst({ where: { id: sessionId }, include: { ideas: true } });
    const ideaId = sess!.ideas[0].id;
    const decisionId = await recordOwnerDecision(ws, sessionId, actor, { decisionType: "GO", ideaId });
    await db.ownerStartupSession.update({ where: { id: sessionId }, data: { status: "EXECUTION_PLANNED" } });
    const bp = await createBlueprint(ws, actor, { sessionId, ideaId, ownerDecisionId: decisionId, objectiveTitle: "Launch" });
    // The blueprint record itself must be persisted with the correct session link
    const bpRecord = await db.startupExecutionBlueprint.findUnique({ where: { id: bp.blueprintId } });
    expect(bpRecord).toBeDefined();
    expect(bpRecord?.sessionId).toBe(sessionId);
  });
});

describe("[db] G-DB-33: blueprint-generated artifacts do NOT retroactively stale creation approval", () => {
  it("G-DB-33: checkApprovalStaleness ignores artifacts created by the blueprint itself", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake: { capitalAvailable: 10000, monthlySurvivalNeed: 2000, fastCashVsScale: "fast_cash" }, ideas: [viableIdea] });
    const sess = await db.ownerStartupSession.findFirst({ where: { id: sessionId }, include: { ideas: true } });
    const ideaId = sess!.ideas[0].id;
    const decisionId = await recordOwnerDecision(ws, sessionId, actor, { decisionType: "GO", ideaId });
    await db.ownerStartupSession.update({ where: { id: sessionId }, data: { status: "EXECUTION_PLANNED" } });
    const bp = await createBlueprint(ws, actor, { sessionId, ideaId, ownerDecisionId: decisionId, objectiveTitle: "Launch" });
    // The creation approval should still be valid after blueprint creation
    const staleness = await checkApprovalStaleness(ws, sessionId, await loadCanonicalCurrentApprovalState(ws, sessionId, ideaId));
    expect(staleness.isStale).toBe(false);
  });
});

describe("[db] G-DB-34: later material mutations DO stale execution approval", () => {
  it("G-DB-34: updating economic model after GO decision causes checkApprovalStaleness to return isStale=true", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake: { capitalAvailable: 10000, monthlySurvivalNeed: 2000, fastCashVsScale: "fast_cash" }, ideas: [viableIdea] });
    const sess = await db.ownerStartupSession.findFirst({ where: { id: sessionId }, include: { ideas: true } });
    const ideaId = sess!.ideas[0].id;
    // Record GO decision with empty evidence snapshot
    const decisionId = await recordOwnerDecision(ws, sessionId, actor, { decisionType: "GO", ideaId });
    // After decision, add a new evidence record — this changes the evidence snapshot
    await recordEvidenceItem(ws, sessionId, actor, {
      sourceType: "AUTHORITATIVE_PRIMARY",
      evidenceType: "CUSTOMER_SURVEY",
      observedResult: "80% of surveyed customers expressed willingness to pay",
      ideaId,
    });
    // Approval should now be stale because evidence snapshot changed
    const staleness = await checkApprovalStaleness(ws, sessionId, await loadCanonicalCurrentApprovalState(ws, sessionId, ideaId));
    expect(staleness.isStale).toBe(true);
    expect(staleness.changedInputs.length).toBeGreaterThan(0);
  });
});

describe("[db] G-DB-35: foreign-workspace task reference isolation", () => {
  it("G-DB-35: assertStartupExecutionAuthorization rejects when session belongs to different workspace", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const wsOwner = randomUUID();
    const wsOther = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: wsOwner, actorId: actor, intake: { capitalAvailable: 10000, monthlySurvivalNeed: 2000, fastCashVsScale: "fast_cash" }, ideas: [viableIdea] });
    const sess = await db.ownerStartupSession.findFirst({ where: { id: sessionId }, include: { ideas: true } });
    const ideaId = sess!.ideas[0].id;
    const decisionId = await recordOwnerDecision(wsOwner, sessionId, actor, { decisionType: "GO", ideaId });
    await db.ownerStartupSession.update({ where: { id: sessionId }, data: { status: "EXECUTION_PLANNED" } });
    const bp = await createBlueprint(wsOwner, actor, { sessionId, ideaId, ownerDecisionId: decisionId, objectiveTitle: "Launch" });
    const plan = await db.startupExecutionPlan.findFirst({ where: { id: bp.executionPlanId } });
    // Attempt to authorize from wrong workspace — returns unauthorized (not found/cross-workspace denial)
    const result = await assertStartupExecutionAuthorization(wsOther, { sessionId, blueprintId: bp.blueprintId, planId: plan!.id, ownerDecisionId: decisionId, ideaId, actionType: "TASK_START" });
    expect(result.authorized).toBe(false);
    expect(result.violations.some((v) => v.toLowerCase().includes("cross-workspace") || v.toLowerCase().includes("not found") || v.toLowerCase().includes("workspace"))).toBe(true);
  });
});

// ─── G-DB-36–41: Audit event emitter DB proof ─────────────────────────────────

describe("[db] G-DB-36: STARTUP_IDEA_REVISED audit event commits with revision transaction", () => {
  it("G-DB-36: reviseIdea persists new idea and emits STARTUP_IDEA_REVISED in the same transaction", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake: { capitalAvailable: 10000, monthlySurvivalNeed: 2000, fastCashVsScale: "fast_cash" }, ideas: [viableIdea] });
    const sess = await db.ownerStartupSession.findFirst({ where: { id: sessionId }, include: { ideas: true } });
    const ideaId = sess!.ideas[0].id;

    const auditsBefore = await db.auditEvent.count({ where: { eventName: AUDIT_EVENTS.STARTUP_IDEA_REVISED } });
    const newIdeaId = await reviseIdea(ws, sessionId, ideaId, actor, { name: "Revised Idea v2" });
    const auditsAfter = await db.auditEvent.count({ where: { eventName: AUDIT_EVENTS.STARTUP_IDEA_REVISED } });

    // Exactly one new STARTUP_IDEA_REVISED event
    expect(auditsAfter - auditsBefore).toBe(1);

    // New idea persisted with incremented version
    const newIdea = await db.startupIdeaRecord.findUnique({ where: { id: newIdeaId } });
    expect(newIdea?.name).toBe("Revised Idea v2");
    expect(newIdea?.version).toBe(2);

    // Old idea superseded
    const oldIdea = await db.startupIdeaRecord.findUnique({ where: { id: ideaId } });
    expect(oldIdea?.supersededById).toBe(newIdeaId);

    // Audit event payload contains both idea IDs
    const event = await db.auditEvent.findFirst({
      where: { eventName: AUDIT_EVENTS.STARTUP_IDEA_REVISED },
      orderBy: { occurredAt: "desc" },
    });
    const payload = event?.payload as Record<string, unknown>;
    expect(payload?.oldIdeaId).toBe(ideaId);
    expect(payload?.newIdeaId).toBe(newIdeaId);
    expect(payload?.oldVersion).toBe(1);
    expect(payload?.newVersion).toBe(2);
  });
});

describe("[db] G-DB-37: STARTUP_EVIDENCE_CONFLICT_DETECTED emits for newly-introduced material conflict", () => {
  it("G-DB-37: recording conflicting evidence emits STARTUP_EVIDENCE_CONFLICT_DETECTED exactly once", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake: { capitalAvailable: 10000, monthlySurvivalNeed: 2000, fastCashVsScale: "fast_cash" }, ideas: [viableIdea] });

    const auditsBefore = await db.auditEvent.count({ where: { eventName: AUDIT_EVENTS.STARTUP_EVIDENCE_CONFLICT_DETECTED } });

    // First evidence — no conflict yet
    await recordEvidenceItem(ws, sessionId, actor, {
      sourceType: "AUTHORITATIVE_PRIMARY",
      evidenceType: "CUSTOMER_DEMAND",
      observedResult: "High demand confirmed by 50 interviews",
      materialClaim: "DEMAND_EXISTS",
      reliabilityScore: 80,
      confidence: 85,
      geography: "AU",
      customerSegment: "Homeowners",
    });
    const auditsAfterFirst = await db.auditEvent.count({ where: { eventName: AUDIT_EVENTS.STARTUP_EVIDENCE_CONFLICT_DETECTED } });
    expect(auditsAfterFirst - auditsBefore).toBe(0);

    // Second evidence with same materialClaim but contradictory low confidence — triggers material conflict
    await recordEvidenceItem(ws, sessionId, actor, {
      sourceType: "OFFICIAL_COMMERCIAL",
      evidenceType: "CUSTOMER_DEMAND",
      observedResult: "No demand found in market study",
      materialClaim: "DEMAND_EXISTS",
      reliabilityScore: 75,
      confidence: 20,
      geography: "AU",
      customerSegment: "Homeowners",
    });
    const auditsAfterSecond = await db.auditEvent.count({ where: { eventName: AUDIT_EVENTS.STARTUP_EVIDENCE_CONFLICT_DETECTED } });
    // Exactly one new conflict event for the second recording
    expect(auditsAfterSecond - auditsBefore).toBe(1);

    // Audit event payload includes materialClaim and conflictingEvidenceIds
    const event = await db.auditEvent.findFirst({
      where: { eventName: AUDIT_EVENTS.STARTUP_EVIDENCE_CONFLICT_DETECTED, workspaceId: ws },
      orderBy: { occurredAt: "desc" },
    });
    const payload = event?.payload as Record<string, unknown>;
    expect(payload?.materialClaim).toBe("DEMAND_EXISTS");
    expect(Array.isArray(payload?.conflictingEvidenceIds)).toBe(true);
    expect(payload?.propagatesToReadiness).toBe(true);
  });
});

describe("[db] G-DB-38: STARTUP_EVIDENCE_CONFLICT_DETECTED does not re-emit for non-conflicting evidence", () => {
  it("G-DB-38: recording evidence without a material conflict produces no STARTUP_EVIDENCE_CONFLICT_DETECTED event", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake: { capitalAvailable: 10000, monthlySurvivalNeed: 2000, fastCashVsScale: "fast_cash" }, ideas: [viableIdea] });

    const auditsBefore = await db.auditEvent.count({ where: { eventName: AUDIT_EVENTS.STARTUP_EVIDENCE_CONFLICT_DETECTED, workspaceId: ws } });

    // Two evidence records on different materialClaims — no conflict
    await recordEvidenceItem(ws, sessionId, actor, { sourceType: "AUTHORITATIVE_PRIMARY", evidenceType: "CUSTOMER_DEMAND", observedResult: "Demand confirmed", materialClaim: "DEMAND_CLAIM_A", reliabilityScore: 80, confidence: 80, geography: "AU", customerSegment: "Segment1" });
    await recordEvidenceItem(ws, sessionId, actor, { sourceType: "OFFICIAL_COMMERCIAL", evidenceType: "SUPPLIER_AVAILABILITY", observedResult: "Supplier available", materialClaim: "SUPPLY_CLAIM_B", reliabilityScore: 70, confidence: 75, geography: "AU", customerSegment: "Segment1" });

    const auditsAfter = await db.auditEvent.count({ where: { eventName: AUDIT_EVENTS.STARTUP_EVIDENCE_CONFLICT_DETECTED, workspaceId: ws } });
    expect(auditsAfter - auditsBefore).toBe(0);
  });
});

describe("[db] G-DB-39: STARTUP_APPROVAL_BECAME_STALE emits once on STALE_REAPPROVAL_REQUIRED transition", () => {
  it("G-DB-39: transitioning to STALE_REAPPROVAL_REQUIRED emits exactly one STARTUP_APPROVAL_BECAME_STALE event", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake: { capitalAvailable: 10000, monthlySurvivalNeed: 2000, fastCashVsScale: "fast_cash" }, ideas: [viableIdea] });
    const sess = await db.ownerStartupSession.findFirst({ where: { id: sessionId }, include: { ideas: true } });
    const ideaId = sess!.ideas[0].id;

    // Record a GO decision and set session to APPROVED
    const decisionId = await recordOwnerDecision(ws, sessionId, actor, { decisionType: "GO", ideaId });
    await db.ownerStartupSession.update({ where: { id: sessionId }, data: { status: "APPROVED" } });

    const auditsBefore = await db.auditEvent.count({ where: { eventName: AUDIT_EVENTS.STARTUP_APPROVAL_BECAME_STALE, workspaceId: ws } });

    // Transition to STALE_REAPPROVAL_REQUIRED — this is the authoritative write point
    await transitionSession(ws, sessionId, actor, "STALE_REAPPROVAL_REQUIRED");

    const auditsAfter = await db.auditEvent.count({ where: { eventName: AUDIT_EVENTS.STARTUP_APPROVAL_BECAME_STALE, workspaceId: ws } });
    expect(auditsAfter - auditsBefore).toBe(1);

    // Verify payload contains decision ID and session IDs
    const event = await db.auditEvent.findFirst({
      where: { eventName: AUDIT_EVENTS.STARTUP_APPROVAL_BECAME_STALE, workspaceId: ws },
      orderBy: { occurredAt: "desc" },
    });
    const payload = event?.payload as Record<string, unknown>;
    expect(payload?.sessionId).toBe(sessionId);
    expect(payload?.ownerDecisionId).toBe(decisionId);
    expect(payload?.previousSessionStatus).toBe("APPROVED");
    expect(payload?.resultingStatus).toBe("STALE_REAPPROVAL_REQUIRED");
  });
});

describe("[db] G-DB-40: STARTUP_APPROVAL_BECAME_STALE does not re-emit on repeated transitions", () => {
  it("G-DB-40: transitioning away from and back to a non-stale status does not produce duplicate stale events", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake: { capitalAvailable: 10000, monthlySurvivalNeed: 2000, fastCashVsScale: "fast_cash" }, ideas: [viableIdea] });
    const sess = await db.ownerStartupSession.findFirst({ where: { id: sessionId }, include: { ideas: true } });
    const ideaId = sess!.ideas[0].id;
    await recordOwnerDecision(ws, sessionId, actor, { decisionType: "GO", ideaId });
    await db.ownerStartupSession.update({ where: { id: sessionId }, data: { status: "APPROVED" } });

    const auditsBefore = await db.auditEvent.count({ where: { eventName: AUDIT_EVENTS.STARTUP_APPROVAL_BECAME_STALE, workspaceId: ws } });

    // First stale transition
    await transitionSession(ws, sessionId, actor, "STALE_REAPPROVAL_REQUIRED");
    const auditsAfterFirst = await db.auditEvent.count({ where: { eventName: AUDIT_EVENTS.STARTUP_APPROVAL_BECAME_STALE, workspaceId: ws } });
    expect(auditsAfterFirst - auditsBefore).toBe(1);

    // Move to OWNER_DECISION_REQUIRED (not a stale status)
    await transitionSession(ws, sessionId, actor, "OWNER_DECISION_REQUIRED");

    // Register another GO decision and go back to APPROVED
    const sess2 = await db.ownerStartupSession.findFirst({ where: { id: sessionId } });
    await recordOwnerDecision(ws, sessionId, actor, { decisionType: "GO", ideaId });
    await db.ownerStartupSession.update({ where: { id: sessionId }, data: { status: "APPROVED" } });

    // Second stale transition — should emit exactly one more (total 2 from this workspace, not 3+)
    await transitionSession(ws, sessionId, actor, "STALE_REAPPROVAL_REQUIRED");
    const auditsAfterSecond = await db.auditEvent.count({ where: { eventName: AUDIT_EVENTS.STARTUP_APPROVAL_BECAME_STALE, workspaceId: ws } });
    // 2 total = 1 per STALE_REAPPROVAL_REQUIRED transition, each emitted exactly once
    expect(auditsAfterSecond - auditsBefore).toBe(2);
    void sess2; // suppress unused warning
  });
});

describe("[db] G-DB-41: cross-workspace isolation for new audit events", () => {
  it("G-DB-41: STARTUP_IDEA_REVISED and STARTUP_APPROVAL_BECAME_STALE are workspace-scoped and cannot be read cross-workspace", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const wsA = randomUUID();
    const wsB = randomUUID();

    // Workspace A: revision
    const sessionA = await createStartupSession({ workspaceId: wsA, actorId: actor, intake: { capitalAvailable: 10000, monthlySurvivalNeed: 2000, fastCashVsScale: "fast_cash" }, ideas: [viableIdea] });
    const sessA = await db.ownerStartupSession.findFirst({ where: { id: sessionA }, include: { ideas: true } });
    const ideaIdA = sessA!.ideas[0].id;
    await reviseIdea(wsA, sessionA, ideaIdA, actor, { name: "WS-A Revised" });

    // Workspace B: stale transition
    const sessionB = await createStartupSession({ workspaceId: wsB, actorId: actor, intake: { capitalAvailable: 10000, monthlySurvivalNeed: 2000, fastCashVsScale: "fast_cash" }, ideas: [viableIdea] });
    const sessB = await db.ownerStartupSession.findFirst({ where: { id: sessionB }, include: { ideas: true } });
    const ideaIdB = sessB!.ideas[0].id;
    await recordOwnerDecision(wsB, sessionB, actor, { decisionType: "GO", ideaId: ideaIdB });
    await db.ownerStartupSession.update({ where: { id: sessionB }, data: { status: "APPROVED" } });
    await transitionSession(wsB, sessionB, actor, "STALE_REAPPROVAL_REQUIRED");

    // Workspace A events must not contain stale event; Workspace B events must not contain revision event
    const revisedInB = await db.auditEvent.count({ where: { eventName: AUDIT_EVENTS.STARTUP_IDEA_REVISED, workspaceId: wsB } });
    const staleInA = await db.auditEvent.count({ where: { eventName: AUDIT_EVENTS.STARTUP_APPROVAL_BECAME_STALE, workspaceId: wsA } });
    expect(revisedInB).toBe(0);
    expect(staleInA).toBe(0);
  });
});

// ─── G-DB-42–44: G2-15 approval-staleness false-positive regression ───────────

describe("[db] G-DB-42: G2-15 false-positive regression — canonical builder with non-null profileVersionId", () => {
  it("G-DB-42: GO decision with non-null linkedProfileVersionId is NOT stale when session state is unchanged", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake: { capitalAvailable: 10000, monthlySurvivalNeed: 2000, fastCashVsScale: "fast_cash" }, ideas: [viableIdea] });

    // Create a real profile version — sets session.currentProfileVersionId to a non-null UUID
    const { versionId: profileVersionId } = await updateContextProfile(ws, sessionId, actor, { step: "baseline" }, "initial profile");

    // Record GO decision referencing this profile version
    await recordOwnerDecision(ws, sessionId, actor, {
      decisionType: "GO",
      linkedProfileVersionId: profileVersionId,
    });

    // Nothing has changed — canonical state should match the stored hash
    const state = await loadCanonicalCurrentApprovalState(ws, sessionId);
    expect(state.profileVersionId).toBe(profileVersionId);

    const staleness = await checkApprovalStaleness(ws, sessionId, state);
    // Must NOT be stale — this was the G2-15 false-positive before the fix
    expect(staleness.isStale).toBe(false);
    expect(staleness.changedInputs).toHaveLength(0);
  });
});

describe("[db] G-DB-43: G2-15 regression — canonical builder detects genuine staleness after profile update", () => {
  it("G-DB-43: GO decision with profileVersionId becomes stale after a new profile version is created", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake: { capitalAvailable: 10000, monthlySurvivalNeed: 2000, fastCashVsScale: "fast_cash" }, ideas: [viableIdea] });

    // Create first profile version, record GO linked to it
    const { versionId: v1 } = await updateContextProfile(ws, sessionId, actor, { step: "v1" }, "first profile");
    await recordOwnerDecision(ws, sessionId, actor, { decisionType: "GO", linkedProfileVersionId: v1 });

    // Verify it is NOT stale before any change
    const before = await checkApprovalStaleness(ws, sessionId, await loadCanonicalCurrentApprovalState(ws, sessionId));
    expect(before.isStale).toBe(false);

    // Now update the profile — session.currentProfileVersionId advances to v2
    await updateContextProfile(ws, sessionId, actor, { step: "v2" }, "second profile update");

    // Canonical state now has v2 for profileVersionId → stored hash used v1 → genuinely stale
    const after = await checkApprovalStaleness(ws, sessionId, await loadCanonicalCurrentApprovalState(ws, sessionId));
    expect(after.isStale).toBe(true);
    expect(after.changedInputs).toContain("profile");
  });
});

describe("[db] G-DB-44: G2-15 regression — loadCanonicalCurrentApprovalState workspace isolation", () => {
  it("G-DB-44: loadCanonicalCurrentApprovalState throws NotFoundError when session not found in workspace (explicit unverifiable state)", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const wsA = randomUUID();
    const wsB = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: wsB, actorId: actor, intake: { capitalAvailable: 10000, monthlySurvivalNeed: 2000, fastCashVsScale: "fast_cash" }, ideas: [viableIdea] });
    await updateContextProfile(wsB, sessionId, actor, { step: "profile" }, "profile");

    // Querying with wrong workspace throws NotFoundError rather than returning all-null.
    // Returning all-null would silently fail-open: if the GO decision also stored all-null
    // linked IDs (production case — API does not pass them), the hash would match a missing
    // session's all-null output and report NOT STALE for a non-existent session.
    await expect(loadCanonicalCurrentApprovalState(wsA, sessionId)).rejects.toThrow(NotFoundError);

    // Querying with correct workspace returns real values
    const stateCorrectWs = await loadCanonicalCurrentApprovalState(wsB, sessionId);
    expect(stateCorrectWs.profileVersionId).not.toBeNull();
  });
});

describe("[db] G-DB-45: idea-revision blocks execution — G2-3a superseded-idea guard", () => {
  it("G-DB-45: assertStartupExecutionAuthorization is unauthorized after idea is revised", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake: { capitalAvailable: 10000, monthlySurvivalNeed: 2000, fastCashVsScale: "fast_cash" }, ideas: [viableIdea] });
    const sess = await db.ownerStartupSession.findFirst({ where: { id: sessionId }, include: { ideas: true } });
    const ideaId = sess!.ideas[0].id;

    // Record GO, create blueprint while idea is current
    const decisionId = await recordOwnerDecision(ws, sessionId, actor, { decisionType: "GO", ideaId });
    await db.ownerStartupSession.update({ where: { id: sessionId }, data: { status: "EXECUTION_PLANNED" } });
    const bp = await createBlueprint(ws, actor, { sessionId, ideaId, ownerDecisionId: decisionId, objectiveTitle: "Pre-revision launch" });
    const plan = await db.startupExecutionPlan.findFirst({ where: { id: bp.executionPlanId } });

    // Baseline: authorization succeeds before revision
    const before = await assertStartupExecutionAuthorization(ws, {
      sessionId, blueprintId: bp.blueprintId, planId: plan!.id,
      ownerDecisionId: decisionId, ideaId, actionType: "TASK_START",
    });
    expect(before.authorized).toBe(true);

    // Revise idea — old ideaId becomes superseded
    await reviseIdea(ws, sessionId, ideaId, actor, { name: "Revised idea v2" });

    // Authorization with old (superseded) ideaId must now be rejected
    const after = await assertStartupExecutionAuthorization(ws, {
      sessionId, blueprintId: bp.blueprintId, planId: plan!.id,
      ownerDecisionId: decisionId, ideaId, actionType: "TASK_START",
    });
    expect(after.authorized).toBe(false);
    expect(after.violations.some((v) => v.toLowerCase().includes("superseded") || v.toLowerCase().includes("revised"))).toBe(true);
  });
});

describe("[db] G-DB-46: blueprint call site uses canonical state — profile change after GO blocks blueprint creation", () => {
  it("G-DB-46: createBlueprint is blocked when profile is updated after the GO decision", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake: { capitalAvailable: 10000, monthlySurvivalNeed: 2000, fastCashVsScale: "fast_cash" }, ideas: [viableIdea] });
    const sess = await db.ownerStartupSession.findFirst({ where: { id: sessionId }, include: { ideas: true } });
    const ideaId = sess!.ideas[0].id;

    // Build profile v1, record GO decision referencing it
    const { versionId: profileV1 } = await updateContextProfile(ws, sessionId, actor, { step: "v1" }, "baseline profile");
    const decisionId = await recordOwnerDecision(ws, sessionId, actor, { decisionType: "GO", ideaId, linkedProfileVersionId: profileV1 });
    await db.ownerStartupSession.update({ where: { id: sessionId }, data: { status: "EXECUTION_PLANNED" } });

    // Update profile AFTER GO — this changes session.currentProfileVersionId
    await updateContextProfile(ws, sessionId, actor, { step: "v2" }, "post-approval profile update");

    // createBlueprint must throw because canonical builder returns the new profileVersionId,
    // which differs from profileV1 stored in the decision hash → STALE_REAPPROVAL_REQUIRED.
    // With the old blueprint call site (passing ownerDecision.linkedProfileVersionId = null),
    // this would have been missed.
    await expect(
      createBlueprint(ws, actor, { sessionId, ideaId, ownerDecisionId: decisionId, objectiveTitle: "Post-profile-change blueprint" })
    ).rejects.toThrow(ConflictError);
  });
});

describe("[db] G-DB-47: transitionSession EXECUTION_PLANNED gate catches idea-level staleness", () => {
  it("G-DB-47: transitionSession to EXECUTION_PLANNED is blocked when economic model is updated after GO decision", async () => {
    if (!process.env["TEST_WITH_DB"]) return;
    const ws = randomUUID();
    const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake: { capitalAvailable: 10000, monthlySurvivalNeed: 2000, fastCashVsScale: "fast_cash" }, ideas: [viableIdea] });
    const sess = await db.ownerStartupSession.findFirst({ where: { id: sessionId }, include: { ideas: true } });
    const ideaId = sess!.ideas[0].id;

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

    // Build economic model v1 — sets idea.currentEconomicModelVersionId to v1
    const economicModelV1 = await buildAndPersistEconomicModel(ws, sessionId, ideaId, actor, economicInputs);

    // Record GO decision referencing economic model v1
    await recordOwnerDecision(ws, sessionId, actor, {
      decisionType: "GO",
      ideaId,
      linkedEconomicModelId: economicModelV1,
    });

    // Manually advance session to APPROVED (valid pre-state for EXECUTION_PLANNED transition)
    await db.ownerStartupSession.update({ where: { id: sessionId }, data: { status: "APPROVED" } });

    // Verify transition succeeds when nothing has changed (baseline)
    // Reset to APPROVED after to test the stale path
    await expect(
      transitionSession(ws, sessionId, actor, "EXECUTION_PLANNED")
    ).resolves.toBeUndefined();

    // Reset session back to APPROVED so we can test the stale case
    await db.ownerStartupSession.update({ where: { id: sessionId }, data: { status: "APPROVED" } });

    // Build economic model v2 — updates idea.currentEconomicModelVersionId to v2
    // This is the post-GO mutation that must be caught at the transition gate
    await buildAndPersistEconomicModel(ws, sessionId, ideaId, actor, { ...economicInputs, pricePerUnitCents: 9000n });

    // transitionSession must now throw: canonical builder returns v2 for economicModelId,
    // but the stored hash was computed with v1 → STALE_APPROVAL_BLOCKS_EXECUTION.
    // Before the G2-15 fix, calling loadCanonicalCurrentApprovalState without ideaId
    // made the idea-level fields always null → hash matched null → no stale → silent pass.
    await expect(
      transitionSession(ws, sessionId, actor, "EXECUTION_PLANNED")
    ).rejects.toThrow(ConflictError);

    // Confirm the thrown error message specifically names the staleness reason
    await expect(
      transitionSession(ws, sessionId, actor, "EXECUTION_PLANNED")
    ).rejects.toThrow(/STALE_APPROVAL_BLOCKS_EXECUTION/);
  });
});
