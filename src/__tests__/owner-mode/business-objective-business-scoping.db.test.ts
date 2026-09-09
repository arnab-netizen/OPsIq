/**
 * [db] BusinessObjective business scoping — regression proof.
 *
 * Root cause this closes: owner-now-view.service.ts's buildBusinessOperatingSystem()
 * loaded active BusinessObjective rows by workspaceId + status ACTIVE only -- with no
 * businessId column and no way to scope to one business, an objective belonging to any
 * business in the workspace could surface on every other business's Home/Priorities view.
 *
 * Proves:
 *  1. Business A's objective does not appear when Business B is the active business.
 *  2. Business B's objective does not appear when Business A is the active business.
 *  3. A zero-active-business owner (businessId=null) sees zero business-specific objectives.
 *  4/5. A workspace-level objective (businessId=null, including a legacy row that predates
 *       this column and so is null by default) is never silently mixed into any single
 *       business's priority list -- it surfaces only in the businessId=null (workspace-level)
 *       view, per the explicit presentation rule in buildBusinessOperatingSystem().
 *  6. A startup-created business objective (via createBlueprint + handOffStartupSessionToBusiness)
 *     persists the correct businessId once the handoff creates the real business.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-mode/business-objective-business-scoping.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { getOwnerNowView, type GuidanceDeps } from "@/services/owner-guidance/owner-now-view.service";
import { createObjective } from "@/services/owner-mode/business-objective.service";
import { createStartupSession, recordOwnerDecision } from "@/services/owner-strategy/startup-session.service";
import { createBlueprint } from "@/services/owner-strategy/startup-execution-blueprint.service";
import { handOffStartupSessionToBusiness } from "@/services/owner-strategy/startup-handoff.service";
import type { PrismaClient } from "@/generated/prisma/client";
import type { StartupIntake, StartupIdea } from "@/domain/owner-strategy/startup-mode.types";

const prisma = db as unknown as PrismaClient;
const NOW = new Date("2026-09-09T00:00:00Z");
const minDeps = { db: prisma as unknown as GuidanceDeps["db"], uuid: () => randomUUID(), now: () => NOW.getTime() } satisfies Partial<GuidanceDeps> as unknown as GuidanceDeps;

const actorId = randomUUID();
const ws = randomUUID();
const bizA = randomUUID();
const bizB = randomUUID();

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] BusinessObjective business scoping", () => {
  beforeAll(async () => {
    await db.user.upsert({
      where: { id: actorId },
      update: {},
      create: { id: actorId, email: `bos-scope-${actorId}@test.local`, name: "BOS Scoping Test", isActive: true, updatedAt: NOW },
    });
    await db.workspace.upsert({
      where: { id: ws },
      update: {},
      create: { id: ws, name: `BOS Scoping WS ${ws.slice(0, 8)}`, slug: `bos-scope-${ws.replace(/-/g, "").slice(0, 12)}`, createdBy: actorId },
    });
    await db.ownerBusiness.create({
      data: { id: bizA, workspaceId: ws, name: "Business A", businessType: "laundry_dry_cleaning", currency: "INR", createdBy: actorId },
    });
    await db.ownerBusiness.create({
      data: { id: bizB, workspaceId: ws, name: "Business B", businessType: "cafe", currency: "INR", createdBy: actorId },
    });
  });

  afterAll(async () => {
    await db.businessObjective.deleteMany({ where: { workspaceId: ws } });
    await db.startupExecutionPlan.deleteMany({ where: { workspaceId: ws } });
    await db.startupInitiative.deleteMany({ where: { workspaceId: ws } });
    await db.startupExecutionBlueprint.deleteMany({ where: { workspaceId: ws } });
    await db.startupOwnerDecision.deleteMany({ where: { workspaceId: ws } });
    await db.startupIdeaRecord.deleteMany({ where: { workspaceId: ws } });
    await db.ownerStartupSession.deleteMany({ where: { workspaceId: ws } });
    await db.ownerGuidanceSnapshot.deleteMany({ where: { workspaceId: ws } });
    await db.auditEvent.deleteMany({ where: { workspaceId: ws } });
    await db.ownerBusiness.deleteMany({ where: { workspaceId: ws } });
    await db.workspace.deleteMany({ where: { id: ws } });
    await db.user.deleteMany({ where: { id: actorId } });
  });

  it("[db] 1+2. an objective scoped to Business A never appears for Business B, and vice versa", async () => {
    const objA = await createObjective({
      workspaceId: ws, actorId, businessId: bizA,
      title: "Grow Business A revenue", objectiveType: "REVENUE",
    });
    const objB = await createObjective({
      workspaceId: ws, actorId, businessId: bizB,
      title: "Grow Business B revenue", objectiveType: "REVENUE",
    });

    const viewA = await getOwnerNowView(ws, bizA, minDeps);
    const idsInA = viewA.businessOperatingSystem!.topObjectives.map((o) => o.objectiveId);
    expect(idsInA).toContain(objA.id);
    expect(idsInA).not.toContain(objB.id);

    const viewB = await getOwnerNowView(ws, bizB, minDeps);
    const idsInB = viewB.businessOperatingSystem!.topObjectives.map((o) => o.objectiveId);
    expect(idsInB).toContain(objB.id);
    expect(idsInB).not.toContain(objA.id);
  });

  it("[db] 3. a zero-active-business owner sees zero business-specific objectives", async () => {
    // Business-scoped objectives exist in this workspace (from the prior test / created fresh
    // here), but none of them carry businessId=null, so the zero-business view must show none.
    await createObjective({
      workspaceId: ws, actorId, businessId: bizA,
      title: "Zero-business-view probe (business-scoped)", objectiveType: "GROWTH",
    });

    const zeroBusinessView = await getOwnerNowView(ws, null, minDeps);
    // Every objective returned to a zero-business view must itself carry businessId=null --
    // verified directly against the DB rather than just trusting the summary shape.
    const returnedIds = zeroBusinessView.businessOperatingSystem!.topObjectives.map((o) => o.objectiveId);
    if (returnedIds.length > 0) {
      const rows = await db.businessObjective.findMany({ where: { id: { in: returnedIds } } });
      expect(rows.every((r) => r.businessId === null)).toBe(true);
    }
    const bizScoped = await db.businessObjective.findMany({ where: { workspaceId: ws, status: "ACTIVE", businessId: { not: null } } });
    expect(bizScoped.length).toBeGreaterThan(0); // sanity: business-specific objectives really do exist
    expect(returnedIds.some((id) => bizScoped.map((b) => b.id).includes(id))).toBe(false);
  });

  it("[db] 4+5. a workspace-level objective (businessId=null) never contaminates a single business's view, including a legacy-shaped row with no businessId at all", async () => {
    const workspaceLevel = await createObjective({
      workspaceId: ws, actorId, businessId: null,
      title: "Workspace-level strategic objective", objectiveType: "STRATEGIC",
    });
    // Simulate a legacy pre-migration row: created without ever passing businessId, exactly the
    // shape every historical row has (see B5 dry-run classification — never auto-backfilled).
    const legacyShaped = await createObjective({
      workspaceId: ws, actorId,
      title: "Legacy-shaped ambiguous objective", objectiveType: "STRATEGIC",
    });
    expect(legacyShaped.businessId).toBeNull();

    const viewA = await getOwnerNowView(ws, bizA, minDeps);
    const idsInA = viewA.businessOperatingSystem!.topObjectives.map((o) => o.objectiveId);
    expect(idsInA).not.toContain(workspaceLevel.id);
    expect(idsInA).not.toContain(legacyShaped.id);

    const zeroBusinessView = await getOwnerNowView(ws, null, minDeps);
    const idsInZero = zeroBusinessView.businessOperatingSystem!.topObjectives.map((o) => o.objectiveId);
    expect(idsInZero).toContain(workspaceLevel.id);
    expect(idsInZero).toContain(legacyShaped.id);
  });

  it("[db] 6. a startup-created business objective persists the correct businessId once the handoff creates the real business", async () => {
    const intake: StartupIntake = {
      capitalAvailable: 10000, monthlySurvivalNeed: 2000, hoursPerWeekAvailable: 40,
      riskTolerance: "medium", targetMonthlyIncome: 4000, canSell: true, canOperateDaily: true,
      fastCashVsScale: "fast_cash", location: "Kolkata",
    };
    const idea: StartupIdea = {
      name: "Scoping Test Startup", industry: "Automotive services",
      structural: {
        grossMarginPct: 65, netMarginPct: 30, monthlyRevenue: 5000, revenueFrequency: "recurring",
        repeatCustomerPct: 0.6, customerAcquisitionDifficulty: "low", demandValidated: true,
        ownerIsPrimaryOperator: true, differentiation: "moderate", pricingPower: "moderate",
        capitalIntensity: "low", downsideRisk: "low",
      },
      estimatedStartupCost: 3000, estimatedMonthlyRevenue: 5000, estimatedMonthlyCost: 1500,
      timeToFirstRevenueMonths: 1,
    };

    const sessionId = await createStartupSession({ workspaceId: ws, actorId, intake, ideas: [idea] });
    const sess = await db.ownerStartupSession.findFirst({ where: { id: sessionId }, include: { ideas: true } });
    const ideaId = sess!.ideas[0].id;
    const decisionId = await recordOwnerDecision(ws, sessionId, actorId, { decisionType: "GO", ideaId });
    await db.ownerStartupSession.update({ where: { id: sessionId }, data: { status: "EXECUTION_PLANNED" } });

    const bp = await createBlueprint(ws, actorId, {
      sessionId, ideaId, ownerDecisionId: decisionId, objectiveTitle: "Launch Scoping Test Startup",
    });

    // Before handoff: no OwnerBusiness exists yet for this session, so the objective is correctly
    // businessId=null -- never inferred/guessed at blueprint-creation time.
    const beforeHandoff = await db.businessObjective.findUnique({ where: { id: bp.objectiveId } });
    expect(beforeHandoff!.businessId).toBeNull();

    const handoff = await handOffStartupSessionToBusiness(ws, sessionId, actorId);
    expect(handoff.alreadyHandedOff).toBe(false);

    const afterHandoff = await db.businessObjective.findUnique({ where: { id: bp.objectiveId } });
    expect(afterHandoff!.businessId).toBe(handoff.businessId);

    // And it now correctly surfaces only for that specific business's now-view.
    const viewForNewBusiness = await getOwnerNowView(ws, handoff.businessId, minDeps);
    const ids = viewForNewBusiness.businessOperatingSystem!.topObjectives.map((o) => o.objectiveId);
    expect(ids).toContain(bp.objectiveId);
  });
});
