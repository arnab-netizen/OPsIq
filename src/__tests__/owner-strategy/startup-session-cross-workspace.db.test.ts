/**
 * Startup session cross-workspace write/read isolation — DB proof.
 *
 * Root cause under test: every route under /api/owner/startup/sessions/[sessionId]/**
 * passes `ctx.verifiedWorkspaceId` plus the URL `sessionId` / `ideaId` straight into
 * startup-session.service. Several service functions used those ids in by-unique-id
 * writes (`startupIdeaRecord.update({ where: { id: ideaId } })`,
 * `ownerStartupSession.update({ where: { id: sessionId } })`,
 * `startupResearchPlan.findUnique({ where: { sessionId } })`) or as parent FKs on new
 * rows without ever verifying the session/idea belongs to the caller's workspace.
 * A member of workspace B could therefore mutate (or read) workspace A's startup
 * session and idea records by supplying A's ids.
 *
 * Every case below acts as workspace B on a workspace A parent and asserts:
 *   (1) the call is rejected with NotFoundError (HTTP 404 via the canonical wrapper), and
 *   (2) workspace A's rows are byte-for-byte unchanged and no B row points at A's parent.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-strategy/startup-session-cross-workspace.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import {
  createStartupSession,
  buildAndPersistEconomicModel,
  assessAndPersistReadiness,
  createSystemRecommendation,
  buildAndPersistBusinessModel,
  buildAndPersistMarketSizing,
  buildAndPersistValidationPlan,
  buildAndPersistResearchPlan,
  executeAutoResearch,
  getOwnerResearchTasks,
  recordEvidenceItem,
  buildAndPersistStartupExplanation,
  generateIdeasForNeedOptionsPath,
  reviseIdea,
} from "@/services/owner-strategy/startup-session.service";
import { NotFoundError } from "@/infra/errors";
import type { EconomicInputs } from "@/domain/owner-strategy/startup-economics";
import type { ReadinessInputs } from "@/domain/owner-strategy/startup-readiness";
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

const readinessInputs: ReadinessInputs = {
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

const explanationInputs = {
  ideaName: null,
  screeningStatus: null,
  screeningReasons: [],
  economicClassification: null,
  breakEvenMonths: null,
  cashRunwayMonths: null,
  readinessStatus: null,
  hardGateFailures: [],
  failedGates: [],
  passedGates: [],
  evidenceGaps: [],
  bindingConstraints: [],
  hypothesesConfirmed: 0,
  hypothesesFailed: 0,
  hypothesesTotal: 0,
  rejectedAlternativeIds: [],
  rejectedAlternativeNames: [],
  closestAlternativeName: null,
  systemRecommendation: null,
  systemRationale: null,
  unknownInputs: [],
  whatWouldChangeRecommendation: null,
  evidenceIds: [],
  profileVersionId: null,
  inputSnapshotVersion: "1",
};

let sessA = "";
let ideaA = "";
let sessB = "";
let ideaB = "";
const idemKeyA = `xws-idem-${randomUUID()}`;
let evidenceA = "";

async function snapshotA() {
  const session = await db.ownerStartupSession.findUniqueOrThrow({ where: { id: sessA } });
  const ideaRow = await db.startupIdeaRecord.findUniqueOrThrow({ where: { id: ideaA } });
  const plan = await db.startupResearchPlan.findFirst({ where: { sessionId: sessA } });
  return JSON.stringify({ session, ideaRow, plan }, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
}

async function countBRowsPointingAtA(): Promise<number> {
  const where = { workspaceId: wsB, OR: [{ sessionId: sessA }, { ideaId: ideaA }] };
  const [econ, ready, bm, sizing, vplan] = await Promise.all([
    db.startupEconomicModel.count({ where }),
    db.startupReadinessAssessment.count({ where }),
    db.startupBusinessModelVersion.count({ where }),
    db.startupMarketSizing.count({ where }),
    db.startupValidationPlan.count({ where }),
  ]);
  const [sysRec, evidence, batches, ideas, plans] = await Promise.all([
    db.startupSystemRecommendation.count({ where: { workspaceId: wsB, sessionId: sessA } }),
    db.startupEvidenceRecord.count({ where: { workspaceId: wsB, sessionId: sessA } }),
    db.startupIdeaGenerationBatch.count({ where: { workspaceId: wsB, sessionId: sessA } }),
    db.startupIdeaRecord.count({ where: { workspaceId: wsB, sessionId: sessA } }),
    db.startupResearchPlan.count({ where: { workspaceId: wsB, sessionId: sessA } }),
  ]);
  return econ + ready + bm + sizing + vplan + sysRec + evidence + batches + ideas + plans;
}

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `startup-xws-${actor}@example.com`, name: "Startup XWS Test", isActive: true, updatedAt: new Date() },
  });
  sessA = await createStartupSession({ workspaceId: wsA, actorId: actor, intake, ideas: [idea] });
  ideaA = (await db.startupIdeaRecord.findFirstOrThrow({ where: { sessionId: sessA, workspaceId: wsA } })).id;
  sessB = await createStartupSession({ workspaceId: wsB, actorId: actor, intake, ideas: [idea] });
  ideaB = (await db.startupIdeaRecord.findFirstOrThrow({ where: { sessionId: sessB, workspaceId: wsB } })).id;
  // Workspace A owns a research plan and an idempotency-keyed evidence row.
  await buildAndPersistResearchPlan(wsA, sessA, actor, "Mobile Car Wash", "Automotive services");
  evidenceA = await recordEvidenceItem(wsA, sessA, actor, {
    idempotencyKey: idemKeyA,
    sourceType: "OWNER_ENTERED",
    evidenceType: "CUSTOMER_INTERVIEW",
    observedResult: "Workspace A private observation",
  });
});

afterAll(async () => {
  for (const ws of [wsA, wsB]) {
    await db.startupResearchAcquisition.deleteMany({ where: { workspaceId: ws } });
    await db.startupResearchPlan.deleteMany({ where: { workspaceId: ws } });
    await db.startupEvidenceRecord.deleteMany({ where: { workspaceId: ws } });
    await db.startupIdeaGenerationBatch.deleteMany({ where: { workspaceId: ws } });
    await db.startupSystemRecommendation.deleteMany({ where: { workspaceId: ws } });
    await db.startupValidationPlan.deleteMany({ where: { workspaceId: ws } });
    await db.startupMarketSizing.deleteMany({ where: { workspaceId: ws } });
    await db.startupBusinessModelVersion.deleteMany({ where: { workspaceId: ws } });
    await db.startupReadinessAssessment.deleteMany({ where: { workspaceId: ws } });
    await db.startupEconomicModel.deleteMany({ where: { workspaceId: ws } });
    await db.startupIdeaRecord.deleteMany({ where: { workspaceId: ws } });
    await db.ownerStartupSession.deleteMany({ where: { workspaceId: ws } });
  }
  await db.auditEvent.deleteMany({ where: { actorId: actor } });
  await db.user.delete({ where: { id: actor } });
});

describe("startup session — workspace B cannot act on workspace A's session or idea", () => {
  it("[db] buildAndPersistEconomicModel rejects A's session/idea and B-session-with-A-idea", async () => {
    const before = await snapshotA();
    await expect(buildAndPersistEconomicModel(wsB, sessA, ideaA, actor, economicInputs)).rejects.toBeInstanceOf(NotFoundError);
    await expect(buildAndPersistEconomicModel(wsB, sessB, ideaA, actor, economicInputs)).rejects.toBeInstanceOf(NotFoundError);
    expect(await snapshotA()).toBe(before);
    expect(await countBRowsPointingAtA()).toBe(0);
  });

  it("[db] assessAndPersistReadiness rejects A's session/idea", async () => {
    const before = await snapshotA();
    await expect(assessAndPersistReadiness(wsB, sessA, ideaA, actor, readinessInputs)).rejects.toBeInstanceOf(NotFoundError);
    expect(await snapshotA()).toBe(before);
    expect(await countBRowsPointingAtA()).toBe(0);
  });

  it("[db] createSystemRecommendation rejects A's session (and a foreign ideaId on B's session)", async () => {
    const before = await snapshotA();
    await expect(
      createSystemRecommendation(wsB, sessA, actor, { recommendation: "GO", rationale: "x", confidence: 50, inputSnapshot: {} })
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      createSystemRecommendation(wsB, sessB, actor, { ideaId: ideaA, recommendation: "GO", rationale: "x", confidence: 50, inputSnapshot: {} })
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await snapshotA()).toBe(before);
    expect(await countBRowsPointingAtA()).toBe(0);
  });

  it("[db] business model / market sizing / validation plan reject A's idea", async () => {
    const before = await snapshotA();
    const bm = { customerSegment: "SMB", customerProblem: "p", valueProposition: "v", deliveryMethod: "d", revenueModel: "r", pricingHypothesis: "$100/mo" };
    await expect(buildAndPersistBusinessModel(wsB, sessA, ideaA, actor, bm)).rejects.toBeInstanceOf(NotFoundError);
    await expect(buildAndPersistMarketSizing(wsB, sessA, ideaA, actor, { sizingStatus: "ESTIMATED", confidence: 40 })).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      buildAndPersistValidationPlan(wsB, sessA, ideaA, actor, { passCriteria: "3 paying customers", failCriteria: "0 after 30 days" })
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await snapshotA()).toBe(before);
    expect(await countBRowsPointingAtA()).toBe(0);
  });

  it("[db] research plan: B cannot overwrite, auto-acquire against, or read A's plan", async () => {
    const before = await snapshotA();
    await expect(buildAndPersistResearchPlan(wsB, sessA, actor, "Overwrite", "Other")).rejects.toBeInstanceOf(NotFoundError);
    await expect(executeAutoResearch(wsB, sessA, actor)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getOwnerResearchTasks(wsB, sessA)).rejects.toBeInstanceOf(NotFoundError);
    expect(await snapshotA()).toBe(before);
    expect(await db.startupResearchAcquisition.count({ where: { workspaceId: wsB } })).toBe(0);
  });

  it("[db] recordEvidenceItem rejects A's session and does not leak A's idempotent evidence id", async () => {
    const before = await snapshotA();
    const attempt = recordEvidenceItem(wsB, sessA, actor, {
      idempotencyKey: idemKeyA,
      sourceType: "OWNER_ENTERED",
      evidenceType: "CUSTOMER_INTERVIEW",
      observedResult: "probe",
    });
    await expect(attempt).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      recordEvidenceItem(wsB, sessB, actor, { ideaId: ideaA, sourceType: "OWNER_ENTERED", evidenceType: "CUSTOMER_INTERVIEW", observedResult: "probe" })
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(evidenceA).toBeTruthy();
    expect(await snapshotA()).toBe(before);
    expect(await countBRowsPointingAtA()).toBe(0);
  });

  it("[db] explanation / idea generation / revise reject A's session", async () => {
    const before = await snapshotA();
    await expect(buildAndPersistStartupExplanation(wsB, sessA, null, actor, explanationInputs)).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      generateIdeasForNeedOptionsPath(wsB, sessA, actor, {
        ownerHoursPerWeek: 20, capitalAvailableCents: BigInt(500000), ownerSkills: [], preferredIndustries: [], geography: null,
        excludedCategories: [], riskTolerance: null, previouslyRejectedIdeaNames: [], existingAssets: [], existingCustomerProblems: [],
      })
    ).rejects.toBeInstanceOf(NotFoundError);
    // B's own idea, but A's session id in the URL: must not create a B idea parented on A's session.
    await expect(reviseIdea(wsB, sessA, ideaB, actor, { name: "Revised" })).rejects.toBeInstanceOf(NotFoundError);
    expect(await snapshotA()).toBe(before);
    expect(await countBRowsPointingAtA()).toBe(0);
    const ideaBRow = await db.startupIdeaRecord.findUniqueOrThrow({ where: { id: ideaB } });
    expect(ideaBRow.supersededById).toBeNull();
  });

  it("[db] legitimate same-workspace calls still succeed", async () => {
    const modelId = await buildAndPersistEconomicModel(wsA, sessA, ideaA, actor, economicInputs);
    const ideaRow = await db.startupIdeaRecord.findUniqueOrThrow({ where: { id: ideaA } });
    expect(ideaRow.currentEconomicModelVersionId).toBe(modelId);
    const tasks = await getOwnerResearchTasks(wsA, sessA);
    expect(Array.isArray(tasks)).toBe(true);
    const recId = await createSystemRecommendation(wsA, sessA, actor, { ideaId: ideaA, recommendation: "HOLD", rationale: "r", confidence: 40, inputSnapshot: {} });
    const sessionRow = await db.ownerStartupSession.findUniqueOrThrow({ where: { id: sessA } });
    expect(sessionRow.currentSystemRecId).toBe(recId);
  });
});
