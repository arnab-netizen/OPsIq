/**
 * Startup owner decision + idea arbitration cross-workspace isolation — DB proof.
 *
 * Root cause under test (same class as startup-session-cross-workspace.db.test.ts):
 *  - recordOwnerDecision (POST /api/owner/startup/sessions/[sessionId]/decision) only
 *    checked the body ideaId inside loadCanonicalCurrentApprovalState, which runs only when
 *    a linked*Id is missing; with all four linked ids supplied, a workspace-B decision row
 *    was written pointing at workspace A's idea. The linked*Id values themselves (system rec,
 *    profile version, economic model, readiness, idea version, business model, market sizing,
 *    validation plan) were never verified and went straight into the stored row and the
 *    approval-package hash. Even on the checked path the idea was matched to the workspace,
 *    not the session.
 *  - runIdeaArbitration never verified the session, so a call as workspace B with A's
 *    sessionId wrote a GoalArbitrationRecord and an audit event carrying A's sessionId.
 *
 * Each case acts on a foreign parent and asserts NotFoundError (HTTP 404) and no write.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-strategy/startup-decision-arbitration-cross-workspace.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import {
  createStartupSession,
  buildAndPersistEconomicModel,
  createSystemRecommendation,
  recordOwnerDecision,
  runIdeaArbitration,
} from "@/services/owner-strategy/startup-session.service";
import { NotFoundError } from "@/infra/errors";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
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

const idea: StartupIdea = {
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

let sessA = "";
let sessA2 = "";
let ideaA = "";
let sessB = "";
let ideaB = "";
let econA = "";
let sysRecA = "";

const arbitraryLinks = () => ({
  linkedSystemRecId: randomUUID(),
  linkedProfileVersionId: randomUUID(),
  linkedEconomicModelId: randomUUID(),
  linkedReadinessId: randomUUID(),
});

async function bDecisionCount(): Promise<number> {
  return db.startupOwnerDecision.count({ where: { workspaceId: wsB } });
}

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `startup-dec-xws-${actor}@example.com`, name: "Startup Decision XWS", isActive: true, updatedAt: new Date() },
  });
  sessA = await createStartupSession({ workspaceId: wsA, actorId: actor, intake, ideas: [idea] });
  ideaA = (await db.startupIdeaRecord.findFirstOrThrow({ where: { sessionId: sessA, workspaceId: wsA } })).id;
  sessA2 = await createStartupSession({ workspaceId: wsA, actorId: actor, intake, ideas: [idea] });
  sessB = await createStartupSession({ workspaceId: wsB, actorId: actor, intake, ideas: [idea] });
  ideaB = (await db.startupIdeaRecord.findFirstOrThrow({ where: { sessionId: sessB, workspaceId: wsB } })).id;
  econA = await buildAndPersistEconomicModel(wsA, sessA, ideaA, actor, economicInputs);
  sysRecA = await createSystemRecommendation(wsA, sessA, actor, { ideaId: ideaA, recommendation: "HOLD", rationale: "r", confidence: 40, inputSnapshot: {} });
});

afterAll(async () => {
  for (const ws of [wsA, wsB]) {
    await db.ownerStartupSession.updateMany({ where: { workspaceId: ws }, data: { currentOwnerDecisionId: null, currentSystemRecId: null } });
    await db.startupOwnerDecision.deleteMany({ where: { workspaceId: ws } });
    await db.goalArbitrationRecord.deleteMany({ where: { workspaceId: ws } });
    await db.operatingMemoryEntry.deleteMany({ where: { workspaceId: ws } });
    await db.startupSystemRecommendation.deleteMany({ where: { workspaceId: ws } });
    await db.startupEconomicModel.deleteMany({ where: { workspaceId: ws } });
    await db.startupIdeaRecord.deleteMany({ where: { workspaceId: ws } });
    await db.ownerStartupSession.deleteMany({ where: { workspaceId: ws } });
  }
  await db.auditEvent.deleteMany({ where: { actorId: actor } });
  await db.user.delete({ where: { id: actor } });
});

describe("recordOwnerDecision — idea and linked artifacts must belong to the caller's session", () => {
  it("[db] B with A's ideaId and four arbitrary linked ids → NotFound, no row written", async () => {
    const before = await bDecisionCount();
    await expect(
      recordOwnerDecision(wsB, sessB, actor, { decisionType: "GO", ideaId: ideaA, ...arbitraryLinks() })
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await bDecisionCount()).toBe(before);
    expect(await db.startupOwnerDecision.count({ where: { ideaId: ideaA, workspaceId: wsB } })).toBe(0);
  });

  it("[db] B on A's session → NotFound, no row written", async () => {
    await expect(recordOwnerDecision(wsB, sessA, actor, { decisionType: "HOLD" })).rejects.toBeInstanceOf(NotFoundError);
    expect(await db.startupOwnerDecision.count({ where: { sessionId: sessA } })).toBe(0);
  });

  it("[db] same workspace, idea from another session → NotFound, no row written", async () => {
    await expect(
      recordOwnerDecision(wsA, sessA2, actor, { decisionType: "GO", ideaId: ideaA, ...arbitraryLinks() })
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await db.startupOwnerDecision.count({ where: { sessionId: sessA2 } })).toBe(0);
  });

  it("[db] B's own session/idea but A's real linked artifacts → NotFound, no row written", async () => {
    const before = await bDecisionCount();
    await expect(
      recordOwnerDecision(wsB, sessB, actor, { decisionType: "GO", ideaId: ideaB, linkedEconomicModelId: econA, linkedSystemRecId: sysRecA, linkedProfileVersionId: null, linkedReadinessId: null })
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await bDecisionCount()).toBe(before);
  });

  it("[db] B's own session with an arbitrary linked id and no idea → NotFound", async () => {
    await expect(
      recordOwnerDecision(wsB, sessB, actor, { decisionType: "HOLD", linkedReadinessId: randomUUID() })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("[db] legitimate decisions still record (own idea, own linked artifacts, or none)", async () => {
    const d1 = await recordOwnerDecision(wsA, sessA, actor, { decisionType: "GO", ideaId: ideaA, linkedEconomicModelId: econA, linkedSystemRecId: sysRecA });
    const row = await db.startupOwnerDecision.findUniqueOrThrow({ where: { id: d1 } });
    expect(row.ideaId).toBe(ideaA);
    expect(row.linkedEconomicModelId).toBe(econA);
    const d2 = await recordOwnerDecision(wsB, sessB, actor, { decisionType: "HOLD", ideaId: ideaB });
    expect((await db.startupOwnerDecision.findUniqueOrThrow({ where: { id: d2 } })).workspaceId).toBe(wsB);
  });
});

describe("runIdeaArbitration — session must belong to the caller's workspace", () => {
  it("[db] B with A's sessionId → NotFound, no arbitration record or audit event in B", async () => {
    const recordsBefore = await db.goalArbitrationRecord.count({ where: { workspaceId: wsB } });
    await expect(runIdeaArbitration(wsB, sessA, actor)).rejects.toBeInstanceOf(NotFoundError);
    expect(await db.goalArbitrationRecord.count({ where: { workspaceId: wsB } })).toBe(recordsBefore);
    const events = await db.auditEvent.findMany({ where: { workspaceId: wsB, eventName: AUDIT_EVENTS.STARTUP_ARBITRATION_RUN } });
    expect(events.filter((e) => JSON.stringify(e.payload ?? "").includes(sessA))).toHaveLength(0);
  });

  it("[db] own session still arbitrates", async () => {
    const result = await runIdeaArbitration(wsA, sessA, actor);
    expect(result.arbitrationRecordId).toBeTruthy();
  });
});
