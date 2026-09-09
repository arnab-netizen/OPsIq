/**
 * P0-C — blueprint output fixture provenance. `[db]`-gated.
 *
 * createBlueprint() writes to six owner-visible-by-default record types in one transaction
 * (BusinessObjective, ProcessExecutionTask, KPIOwnershipRecord, BusinessRiskEntry,
 * ResourceAllocation, ConstraintResolutionRecord). Before this fix, the only way to tell an
 * acceptance/QA blueprint run's output apart from a real owner's own Startup Mode use was string-
 * matching the idea name embedded in default titles/labels — exactly the approach the trust
 * closure explicitly forbids. This proves the structural fix: passing
 * `{ isFixtureRecord: true }` tags every record the blueprint creates, and every ordinary
 * owner-facing list function for those six types excludes fixture rows by construction — an
 * ordinary owner sees ZERO fixture-generated records, regardless of title content.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-strategy/startup-blueprint-fixture-isolation.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { createStartupSession, recordOwnerDecision } from "@/services/owner-strategy/startup-session.service";
import { createBlueprint } from "@/services/owner-strategy/startup-execution-blueprint.service";
import { listObjectives } from "@/services/owner-mode/business-objective.service";
import { listBusinessRisks } from "@/services/owner-mode/business-risk.service";
import { listKPIOwnership } from "@/services/owner-mode/kpi-ownership.service";
import { getPersistedProcessTasks } from "@/services/owner-mode/process-execution-bridge.service";
import { listActiveConstraints } from "@/services/owner-mode/constraint-resolution.service";
import type { StartupIntake, StartupIdea } from "@/domain/owner-strategy/startup-mode.types";

const actor = randomUUID();
const ws = randomUUID();

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
  name: "OPSIQ Production Acceptance - Fixture Isolation Idea",
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
  estimatedMonthlyCost: 1800,
  timeToFirstRevenueMonths: 1,
};

async function createApprovedBlueprint(isFixtureRecord: boolean) {
  const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake, ideas: [viableIdea] });
  const idea = await db.startupIdeaRecord.findFirst({ where: { sessionId } });
  const decisionId = await recordOwnerDecision(ws, sessionId, actor, {
    decisionType: "GO",
    rationale: "fixture isolation test",
  });
  return createBlueprint(
    ws,
    actor,
    { sessionId, ideaId: idea!.id, ownerDecisionId: decisionId, objectiveTitle: `Fixture isolation objective (${isFixtureRecord})` },
    { isFixtureRecord }
  );
}

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `blueprint-fixture-${actor}@example.com`, name: "Blueprint Fixture Test", isActive: true, updatedAt: new Date() },
  });
  // listBusinessRisks() (like Home) now requires a real, active, non-fixture business to exist
  // before returning any business-derived risk (see hasAnyRealBusiness) -- this test's workspace
  // needs one so the "ordinary owner sees ZERO fixture-generated records" assertions below still
  // exercise fixture filtering specifically, not the separate zero-business gate.
  await db.ownerBusiness.create({
    data: {
      id: randomUUID(), workspaceId: ws, name: "Fixture Isolation Test Business", businessType: "generic_local_service",
      currency: "USD", isActive: true, isFixtureBusiness: false, createdBy: actor,
    },
  });
});

afterAll(async () => {
  await db.ownerBusiness.deleteMany({ where: { workspaceId: ws } });
  await db.startupIdeaRecord.deleteMany({ where: { workspaceId: ws } });
  await db.ownerStartupSession.deleteMany({ where: { workspaceId: ws } });
  await db.auditEvent.deleteMany({ where: { actorId: actor } });
  await db.user.delete({ where: { id: actor } });
});

describe("[db] Startup blueprint output fixture isolation", () => {
  it("[db] isFixtureRecord: true tags every owner-visible record the blueprint creates", async () => {
    const bp = await createApprovedBlueprint(true);

    const objective = await db.businessObjective.findFirst({ where: { id: bp.objectiveId } });
    expect(objective?.isFixtureRecord).toBe(true);

    const tasks = await db.processExecutionTask.findMany({ where: { id: { in: bp.taskIds } } });
    expect(tasks.length).toBe(bp.taskIds.length);
    expect(tasks.every((t) => t.isFixtureRecord)).toBe(true);

    const kpis = await db.kPIOwnershipRecord.findMany({ where: { id: { in: bp.kpiIds } } });
    expect(kpis.length).toBe(bp.kpiIds.length);
    expect(kpis.every((k) => k.isFixtureRecord)).toBe(true);

    const risks = await db.businessRiskEntry.findMany({ where: { id: { in: bp.riskIds } } });
    expect(risks.length).toBe(bp.riskIds.length);
    expect(risks.every((r) => r.isFixtureRecord)).toBe(true);

    const constraint = await db.constraintResolutionRecord.findFirst({ where: { id: { in: bp.constraintIds } } });
    expect(constraint?.isFixtureRecord).toBe(true);
  });

  it("[db] isFixtureRecord defaults to false when opts is omitted — real Startup Mode use is never mistagged", async () => {
    const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake, ideas: [viableIdea] });
    const idea = await db.startupIdeaRecord.findFirst({ where: { sessionId } });
    const decisionId = await recordOwnerDecision(ws, sessionId, actor, { decisionType: "GO", rationale: "real use, no opts" });
    const bp = await createBlueprint(ws, actor, { sessionId, ideaId: idea!.id, ownerDecisionId: decisionId, objectiveTitle: "Real owner objective" });

    const objective = await db.businessObjective.findFirst({ where: { id: bp.objectiveId } });
    expect(objective?.isFixtureRecord).toBe(false);
    const risks = await db.businessRiskEntry.findMany({ where: { id: { in: bp.riskIds } } });
    expect(risks.every((r) => r.isFixtureRecord === false)).toBe(true);
  });

  it("[db] an ordinary owner sees ZERO fixture-generated records across every blueprint output list", async () => {
    const real = await createApprovedBlueprint(false);
    const fixture = await createApprovedBlueprint(true);

    const objectives = await listObjectives(ws);
    expect(objectives.some((o) => o.id === real.objectiveId)).toBe(true);
    expect(objectives.some((o) => o.id === fixture.objectiveId)).toBe(false);

    const risks = await listBusinessRisks(ws);
    expect(risks.some((r) => real.riskIds.includes(r.id))).toBe(true);
    expect(risks.some((r) => fixture.riskIds.includes(r.id))).toBe(false);

    const kpis = await listKPIOwnership(ws);
    expect(kpis.some((k) => real.kpiIds.includes(k.id))).toBe(true);
    expect(kpis.some((k) => fixture.kpiIds.includes(k.id))).toBe(false);

    const tasks = await getPersistedProcessTasks(ws);
    expect(tasks.some((t) => real.taskIds.includes(t.id))).toBe(true);
    expect(tasks.some((t) => fixture.taskIds.includes(t.id))).toBe(false);

    const constraints = await listActiveConstraints(ws);
    expect(constraints.some((c) => real.constraintIds.includes(c.id))).toBe(true);
    expect(constraints.some((c) => fixture.constraintIds.includes(c.id))).toBe(false);
  });
});
