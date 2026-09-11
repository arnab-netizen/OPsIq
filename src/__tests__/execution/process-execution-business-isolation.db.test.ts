/**
 * Process-Execution — cross-business data-leak regression proof (D1 launch blocker, controlled-beta
 * truth closure). `[db]`-gated (TEST_WITH_DB=true).
 *
 * Root cause 1 (majority of the leaked rows): STARTUP_MODE tasks created by
 * startup-execution-blueprint.service.ts never had `businessId` stamped, even though
 * OwnerStartupSession.businessId (the session's own owning business) was available in the same
 * transaction. Fix: the blueprint-creation query now selects the session's businessId and stamps it
 * onto every ProcessExecutionTask row it creates.
 *
 * Root cause 2 (legacy PROCESS_CORRECTION / SOP_CHECKLIST / TRAINING rows): persistProcessExecutionRoutes'
 * change-detection never compared `businessId`, so a row created before businessId-threading existed
 * stayed NULL forever even once the recomputed route carried the correct businessId. Fix: `changed` now
 * also compares `existing.businessId !== r.businessId`.
 *
 * Read-path fix: getPersistedProcessTasks(workspaceId, injected?, businessId?) and
 * buildExecutionLifecycle/queryExecutionLifecycle (the exact function Cockpit's Execution lifecycle ->
 * "Requires your decision" list renders from) now scope by businessId when supplied. A row is included
 * when its businessId matches OR is null (some source families -- WORKLOAD_REDUCTION, CAPABILITY_GAP,
 * SOP_CHECKLIST, TRAINING, EFFECTIVENESS_RECHECK -- are genuinely workspace-level by design and never
 * carry a businessId; excluding them unconditionally would hide a whole class of legitimate tasks from
 * every business view, not just close the leak). A row that DOES carry a DIFFERENT business's id is
 * always excluded -- that is the actual leak this file proves closed.
 *
 * Cases (per the mission spec):
 *  A. task businessId=A in a workspace that also has businessId=B -> visible under a businessId=A read.
 *  B. same setup -> NOT visible under a businessId=B read.
 *  C. switching the businessId argument A -> B -> A on the same data returns exactly A's own rows each
 *     time (no stale bleed-through).
 *  D. a task in a DIFFERENT workspace is never returned regardless of businessId argument.
 *  E. isFixtureRecord: true is excluded from a business-scoped read, same as a workspace-scoped one.
 *  F. a genuinely workspace-level task (businessId null) is visible under EVERY business's read.
 *  G. persistProcessExecutionRoutes re-syncs businessId onto an existing row whose businessId was
 *     previously null/stale (root cause 2).
 *  H. the STARTUP_MODE blueprint-creation path stamps businessId on every task it creates (root cause 1).
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/execution/process-execution-business-isolation.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import {
  getPersistedProcessTasks, persistProcessExecutionRoutes,
  type ProcessBridgeDb, type ProcessBridgeDeps,
} from "@/services/owner-mode/process-execution-bridge.service";
import { queryExecutionLifecycle, type GuidanceDeps } from "@/services/owner-guidance/owner-now-view.service";
import { createStartupSession, recordOwnerDecision } from "@/services/owner-strategy/startup-session.service";
import { createBlueprint } from "@/services/owner-strategy/startup-execution-blueprint.service";
import type { StartupIntake, StartupIdea } from "@/domain/owner-strategy/startup-mode.types";

const actor = randomUUID();
const ws = randomUUID();       // holds bizA + bizB (the two-business-in-one-workspace scenario)
const wsOther = randomUUID();  // separate workspace entirely
const bizA = randomUUID();
const bizB = randomUUID();
const bizOther = randomUUID();

const deps: ProcessBridgeDeps = { db: db as unknown as ProcessBridgeDb, uuid: () => randomUUID(), now: () => new Date() };

async function seedTask(
  workspaceId: string,
  taskKey: string,
  over: Record<string, unknown> = {},
): Promise<string> {
  const id = randomUUID();
  await db.processExecutionTask.create({
    data: {
      id,
      workspaceId,
      businessId: null,
      taskKey,
      sourceFamily: "PROCESS_CORRECTION",
      sourceFindingKey: "biz-isolation-test",
      executionRoute: "CREATE_OWNER_APPROVAL_TASK",
      actionOwner: "OWNER",
      approvalLevel: "OWNER_APPROVAL_REQUIRED",
      status: "PROPOSED",
      requiredEvidence: [],
      evidenceRefs: [],
      completionCriteria: "Owner records decision.",
      reassessmentTrigger: "Re-evaluate at next review.",
      riskIfIgnored: "Risk compounds.",
      ownerVisibleSummary: "Business isolation test task",
      severity: "HIGH",
      priorityRank: 1,
      isFixtureRecord: false,
      updatedAt: new Date(),
      ...over,
    },
  });
  return id;
}

const AT = "2026-09-11T00:00:00.000Z";

const intake: StartupIntake = {
  capitalAvailable: 10000, monthlySurvivalNeed: 2000, hoursPerWeekAvailable: 40, riskTolerance: "medium",
  targetMonthlyIncome: 4000, canSell: true, canOperateDaily: true, fastCashVsScale: "fast_cash",
};
const viableIdea: StartupIdea = {
  name: "Biz Isolation Startup Idea", industry: "Automotive services",
  structural: {
    grossMarginPct: 65, netMarginPct: 30, monthlyRevenue: 5000, revenueFrequency: "recurring",
    repeatCustomerPct: 0.6, customerAcquisitionDifficulty: "low", demandValidated: true,
    ownerIsPrimaryOperator: true, differentiation: "moderate", pricingPower: "moderate",
    capitalIntensity: "low", downsideRisk: "low",
  },
  estimatedStartupCost: 3000, estimatedMonthlyRevenue: 5000, estimatedMonthlyCost: 1800, timeToFirstRevenueMonths: 1,
};

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Process-execution business isolation (D1 launch-blocker fix)", () => {
  beforeAll(async () => {
    await db.user.create({ data: { id: actor, email: `biz-iso-${actor}@laundry.test`, name: "Biz Isolation Owner", isActive: true, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: ws, name: "Biz Isolation WS", slug: `biz-iso-ws-${ws.slice(0, 8)}`, createdBy: actor } });
    await db.workspace.create({ data: { id: wsOther, name: "Biz Isolation WS Other", slug: `biz-iso-ws-other-${wsOther.slice(0, 8)}`, createdBy: actor } });
    await db.ownerBusiness.create({ data: { id: bizA, workspaceId: ws, name: "Biz Isolation A", businessType: "laundry", updatedAt: new Date() } });
    await db.ownerBusiness.create({ data: { id: bizB, workspaceId: ws, name: "Biz Isolation B", businessType: "laundry", updatedAt: new Date() } });
    await db.ownerBusiness.create({ data: { id: bizOther, workspaceId: wsOther, name: "Biz Isolation Other-WS", businessType: "laundry", updatedAt: new Date() } });
  });

  afterAll(async () => {
    await db.processExecutionTask.deleteMany({ where: { workspaceId: { in: [ws, wsOther] } } });
    await db.auditEvent.deleteMany({ where: { workspaceId: { in: [ws, wsOther] } } });
    await db.startupExecutionPlan.deleteMany({ where: { workspaceId: ws } });
    await db.startupInitiative.deleteMany({ where: { workspaceId: ws } });
    await db.startupVerificationWindow.deleteMany({ where: { workspaceId: ws } });
    await db.startupExecutionBlueprint.deleteMany({ where: { workspaceId: ws } });
    await db.businessObjective.deleteMany({ where: { workspaceId: ws } });
    await db.kPIOwnershipRecord.deleteMany({ where: { workspaceId: ws } });
    await db.businessRiskEntry.deleteMany({ where: { workspaceId: ws } });
    await db.resourceAllocation.deleteMany({ where: { workspaceId: ws } });
    await db.constraintResolutionRecord.deleteMany({ where: { workspaceId: ws } });
    await db.fundedInitiativeOutcome.deleteMany({ where: { workspaceId: ws } });
    await db.startupOwnerDecision.deleteMany({ where: { workspaceId: ws } });
    await db.startupIdeaRecord.deleteMany({ where: { workspaceId: ws } });
    await db.ownerStartupSession.deleteMany({ where: { workspaceId: ws } });
    await db.ownerBusiness.deleteMany({ where: { id: { in: [bizA, bizB, bizOther] } } });
    await db.workspace.deleteMany({ where: { id: { in: [ws, wsOther] } } });
    await db.user.delete({ where: { id: actor } });
  });

  describe("A-F: getPersistedProcessTasks business scoping", () => {
    it("A. a task with businessId=A is visible under a businessId=A read (sibling businessId=B exists in same workspace)", async () => {
      const taskA = await seedTask(ws, `iso:a:${randomUUID().slice(0, 8)}`, { businessId: bizA });
      await seedTask(ws, `iso:b:${randomUUID().slice(0, 8)}`, { businessId: bizB });

      const tasks = await getPersistedProcessTasks(ws, deps, bizA);
      expect(tasks.some((t) => t.id === taskA)).toBe(true);
    });

    it("B. business A's task is NOT returned under a businessId=B read", async () => {
      const taskA = await seedTask(ws, `iso:a2:${randomUUID().slice(0, 8)}`, { businessId: bizA });
      const taskB = await seedTask(ws, `iso:b2:${randomUUID().slice(0, 8)}`, { businessId: bizB });

      const tasksForB = await getPersistedProcessTasks(ws, deps, bizB);
      expect(tasksForB.some((t) => t.id === taskA)).toBe(false);
      expect(tasksForB.some((t) => t.id === taskB)).toBe(true);
    });

    it("C. switching the businessId argument A -> B -> A returns exactly A's own rows each time (no stale bleed-through)", async () => {
      const taskA = await seedTask(ws, `iso:switch-a:${randomUUID().slice(0, 8)}`, { businessId: bizA });
      const taskB = await seedTask(ws, `iso:switch-b:${randomUUID().slice(0, 8)}`, { businessId: bizB });

      const readA1 = await getPersistedProcessTasks(ws, deps, bizA);
      expect(readA1.some((t) => t.id === taskA)).toBe(true);
      expect(readA1.some((t) => t.id === taskB)).toBe(false);

      const readB = await getPersistedProcessTasks(ws, deps, bizB);
      expect(readB.some((t) => t.id === taskB)).toBe(true);
      expect(readB.some((t) => t.id === taskA)).toBe(false);

      const readA2 = await getPersistedProcessTasks(ws, deps, bizA);
      expect(readA2.some((t) => t.id === taskA)).toBe(true);
      expect(readA2.some((t) => t.id === taskB)).toBe(false);
    });

    it("D. a task in a DIFFERENT workspace is never returned regardless of businessId argument (workspace isolation holds)", async () => {
      const otherTask = await seedTask(wsOther, `iso:other-ws:${randomUUID().slice(0, 8)}`, { businessId: bizOther });

      // Querying `ws` with bizOther's id (a foreign business from a foreign workspace) returns nothing.
      const crossWsRead = await getPersistedProcessTasks(ws, deps, bizOther);
      expect(crossWsRead.some((t) => t.id === otherTask)).toBe(false);

      // A workspace-only read of `ws` also never picks up the other workspace's row.
      const wsOnlyRead = await getPersistedProcessTasks(ws, deps);
      expect(wsOnlyRead.some((t) => t.id === otherTask)).toBe(false);

      // The other workspace's own read correctly returns its own task.
      const otherWsRead = await getPersistedProcessTasks(wsOther, deps, bizOther);
      expect(otherWsRead.some((t) => t.id === otherTask)).toBe(true);
    });

    it("E. isFixtureRecord: true is excluded from a business-scoped read (fixture isolation holds)", async () => {
      const fixtureTask = await seedTask(ws, `iso:fixture:${randomUUID().slice(0, 8)}`, { businessId: bizA, isFixtureRecord: true });
      const realTask = await seedTask(ws, `iso:real:${randomUUID().slice(0, 8)}`, { businessId: bizA, isFixtureRecord: false });

      const tasks = await getPersistedProcessTasks(ws, deps, bizA);
      expect(tasks.some((t) => t.id === fixtureTask)).toBe(false);
      expect(tasks.some((t) => t.id === realTask)).toBe(true);
    });

    it("F. a genuinely workspace-level task (businessId null) is visible under EVERY business's read — no regression for PASS23-style tasks", async () => {
      const workspaceLevelTask = await seedTask(ws, `iso:workspace-level:${randomUUID().slice(0, 8)}`, { businessId: null, sourceFamily: "WORKLOAD_REDUCTION" });

      const readA = await getPersistedProcessTasks(ws, deps, bizA);
      const readB = await getPersistedProcessTasks(ws, deps, bizB);
      expect(readA.some((t) => t.id === workspaceLevelTask)).toBe(true);
      expect(readB.some((t) => t.id === workspaceLevelTask)).toBe(true);
    });
  });

  describe("A'-F': queryExecutionLifecycle business scoping (the exact read path Cockpit's 'Requires your decision' renders from)", () => {
    it("a task with businessId=A appears in lifecycle.requiresDecision for a businessId=A read, not for businessId=B", async () => {
      const key = `iso:lifecycle-a:${randomUUID().slice(0, 8)}`;
      await seedTask(ws, key, { businessId: bizA, status: "PROPOSED" });

      const lifecycleA = await queryExecutionLifecycle(ws, db as unknown as GuidanceDeps["db"], bizA);
      expect(lifecycleA!.requiresDecision.some((i) => i.taskKey === key)).toBe(true);

      const lifecycleB = await queryExecutionLifecycle(ws, db as unknown as GuidanceDeps["db"], bizB);
      expect(lifecycleB!.requiresDecision.some((i) => i.taskKey === key)).toBe(false);
    });
  });

  describe("G: persistProcessExecutionRoutes re-syncs a stale/null businessId (root cause 2)", () => {
    it("directly proves the `changed` comparison: a row with businessId=null persisted again with the SAME taskKey and a real businessId is updated in place", async () => {
      const wsG2 = randomUUID();
      const bizG2 = randomUUID();
      await db.workspace.create({ data: { id: wsG2, name: "Resync WS2", slug: `resync-ws2-${wsG2.slice(0, 8)}`, createdBy: actor } });
      await db.ownerBusiness.create({ data: { id: bizG2, workspaceId: wsG2, name: "Resync Biz2", businessType: "laundry", updatedAt: new Date() } });

      // A CASH_PROFIT-style route whose taskKey is workspace-scoped-shaped on purpose (no businessId
      // embedded) so re-evaluation with a new businessId updates the SAME row in place — the direct,
      // unambiguous proof that `changed` now reacts to a businessId change alone.
      const taskKey = `resync-direct:${randomUUID().slice(0, 8)}`;
      await db.processExecutionTask.create({
        data: {
          id: randomUUID(), workspaceId: wsG2, businessId: null, taskKey,
          sourceFamily: "PROCESS_CORRECTION", sourceFindingKey: "resync-direct",
          executionRoute: "CREATE_MANAGER_TASK", actionOwner: "MANAGER", approvalLevel: "MANAGER_APPROVAL_REQUIRED",
          status: "PROPOSED", requiredEvidence: [], evidenceRefs: [],
          completionCriteria: "c", reassessmentTrigger: "r", riskIfIgnored: "risk",
          ownerVisibleSummary: "Resync direct test", severity: "HIGH", priorityRank: 1,
          isFixtureRecord: false, updatedAt: new Date(),
        },
      });

      const fakeRoute = {
        workspaceId: wsG2, businessId: bizG2, taskKey, sourceFamily: "PROCESS_CORRECTION" as const,
        sourceFindingKey: "resync-direct", executionRoute: "CREATE_MANAGER_TASK" as const, actionOwner: "MANAGER" as const,
        approvalLevel: "MANAGER_APPROVAL_REQUIRED" as const, requiredEvidence: [] as string[],
        completionCriteria: "c", reassessmentTrigger: "r", riskIfIgnored: "risk",
        ownerVisibleSummary: "Resync direct test", notActionableReason: null, evidenceRefs: [] as string[],
        severity: "HIGH" as const, priorityRank: 1, status: "PROPOSED", canStart: true,
      };
      const analysis = {
        workspaceId: wsG2, routes: [fakeRoute], topRoute: fakeRoute,
        summary: { total: 1, ownerApproval: 0, managerStaff: 1, dataTasks: 0, monitorOnly: 0 },
        evaluatedAt: AT,
      };
      const result = await persistProcessExecutionRoutes(wsG2, analysis, actor, deps);
      expect(result.updated).toBe(1);
      expect(result.deduped).toBe(0);

      const row = await db.processExecutionTask.findFirst({ where: { workspaceId: wsG2, taskKey } });
      expect(row?.businessId).toBe(bizG2);

      await db.processExecutionTask.deleteMany({ where: { workspaceId: wsG2 } });
      await db.auditEvent.deleteMany({ where: { workspaceId: wsG2 } });
      await db.ownerBusiness.deleteMany({ where: { id: bizG2 } });
      await db.workspace.deleteMany({ where: { id: wsG2 } });
    });
  });

  describe("H: STARTUP_MODE blueprint creation stamps businessId (root cause 1)", () => {
    it("every ProcessExecutionTask createBlueprint() creates carries the owning session's businessId", async () => {
      const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake, ideas: [viableIdea] });
      // Simulate a session already handed off to bizA (OwnerStartupSession.businessId is set on
      // activation by handOffStartupSessionToBusiness -- setting it directly here isolates the
      // blueprint-creation code path under test from that unrelated handoff flow).
      await db.ownerStartupSession.update({ where: { id: sessionId }, data: { businessId: bizA } });

      const idea = await db.startupIdeaRecord.findFirst({ where: { sessionId } });
      const decisionId = await recordOwnerDecision(ws, sessionId, actor, { decisionType: "GO", rationale: "biz isolation test" });
      const bp = await createBlueprint(ws, actor, {
        sessionId, ideaId: idea!.id, ownerDecisionId: decisionId,
        objectiveTitle: "Biz isolation startup objective",
      });

      expect(bp.taskIds.length).toBeGreaterThan(0);
      const tasks = await db.processExecutionTask.findMany({ where: { id: { in: bp.taskIds } } });
      expect(tasks.length).toBe(bp.taskIds.length);
      expect(tasks.every((t) => t.businessId === bizA)).toBe(true);
      expect(tasks.every((t) => t.sourceFamily === "STARTUP_MODE")).toBe(true);

      // And the business-scoped read only ever surfaces these tasks under bizA, never under bizB.
      const readA = await getPersistedProcessTasks(ws, deps, bizA);
      expect(bp.taskIds.every((id) => readA.some((t) => t.id === id))).toBe(true);
      const readB = await getPersistedProcessTasks(ws, deps, bizB);
      expect(bp.taskIds.some((id) => readB.some((t) => t.id === id))).toBe(false);
    });

    it("a STARTUP_MODE session with businessId=null still creates tasks (workspace-level, no crash) — sanity check for the OwnerStartupSession.businessId nullable column", async () => {
      const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake, ideas: [viableIdea] });
      const idea = await db.startupIdeaRecord.findFirst({ where: { sessionId } });
      const decisionId = await recordOwnerDecision(ws, sessionId, actor, { decisionType: "GO", rationale: "null businessId sanity check" });
      const bp = await createBlueprint(ws, actor, {
        sessionId, ideaId: idea!.id, ownerDecisionId: decisionId,
        objectiveTitle: "Null-businessId startup objective",
      });

      const tasks = await db.processExecutionTask.findMany({ where: { id: { in: bp.taskIds } } });
      expect(tasks.length).toBe(bp.taskIds.length);
      expect(tasks.every((t) => t.businessId === null)).toBe(true);
    });
  });
});
