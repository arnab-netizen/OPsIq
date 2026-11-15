/**
 * Generated data-gap task reconciliation — production D3 regression. `[db]`-gated (TEST_WITH_DB=true).
 *
 * Root cause: persistProcessExecutionRoutes only visits routes that are CURRENT. A ProcessExecutionTask created
 * for `cp:<business>:PROFIT_DATA_INSUFFICIENT` while data was missing stayed PROPOSED forever once the route
 * stopped being emitted, and Home's execution lifecycle (which reads persisted rows) kept showing
 * "Not enough financial data to assess profit — collect financial data".
 *
 * Fix under test: retireResolvedDataGapTasks cancels (never deletes) a PROPOSED CASH_PROFIT data-gap task of the
 * SAME business that the authoritative current bridge no longer emits, with a system audit event.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/execution/process-execution-data-gap-reconciliation.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import {
  persistProcessExecutionRoutes, retireResolvedDataGapTasks, reconcileDataGapTasksAfterDiagnosis,
  type ProcessBridgeDb, type ProcessBridgeDeps,
} from "@/services/owner-mode/process-execution-bridge.service";
import { buildCashProfitProtection, type CashProfitInput } from "@/domain/owner-mode/cash-profit-protection";
import { buildProcessExecutionBridge } from "@/domain/owner-mode/process-execution-bridge";
import { queryExecutionLifecycle, type GuidanceDeps } from "@/services/owner-guidance/owner-now-view.service";
import { createFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import { runFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";

const actor = randomUUID();
const ws = randomUUID();
const bizA = randomUUID();
const bizB = randomUUID();
const bizFin = randomUUID();
const deps: ProcessBridgeDeps = { db: db as unknown as ProcessBridgeDb, uuid: () => randomUUID(), now: () => new Date() };
const AT = "2026-09-29T00:00:00.000Z";

const cashInput = (over: Partial<CashProfitInput> = {}): CashProfitInput => ({
  cashRunwayDays: null, netMarginPct: null, lowMarginJobCount: 0, pricingLeakCount: 0, discountLeakCount: 0,
  reworkCostEventCount: 0, deliveryCostEventCount: 0, staffInefficiencyCount: 0, b2bUnderpricedCount: 0,
  overdueReceivableCount: 0, hasUnitEconomics: true, financialDataComplete: true,
  supportingProofIds: [], supportingOperationalEventIds: [], supportingFinancialSnapshotIds: [], ...over,
});
/** The authoritative bridge for one business, as getOwnerNowView builds it. */
const bridgeFor = (businessId: string, over: Partial<CashProfitInput> = {}) =>
  buildProcessExecutionBridge(null, buildCashProfitProtection(cashInput(over), ws, AT), ws, AT, null, businessId);
const insufficient = (businessId: string) => bridgeFor(businessId, { financialDataComplete: false });
const sufficient = (businessId: string) => bridgeFor(businessId, { financialDataComplete: true });
const keyOf = (businessId: string, signal: string) => `cp:${businessId}:${signal}`;

const task = (workspaceId: string, businessId: string, taskKey: string) => db.processExecutionTask.findFirst({ where: { workspaceId, businessId, taskKey } });
const transitions = (entityId: string) => db.auditEvent.findMany({ where: { workspaceId: ws, entityId, eventName: AUDIT_EVENTS.OWNER_PROCESS_EXECUTION_TASK_TRANSITIONED } });
const lifecycleKeys = async (businessId: string) => {
  const v = await queryExecutionLifecycle(ws, db as unknown as GuidanceDeps["db"], businessId, false);
  return [...(v?.requiresDecision ?? []), ...(v?.inExecution ?? []), ...(v?.awaitingVerification ?? []), ...(v?.recentlyVerified ?? [])]
    .map((i: { taskKey: string }) => i.taskKey);
};

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] generated data-gap task reconciliation (D3)", () => {
  beforeAll(async () => {
    await db.user.create({ data: { id: actor, email: `gap-${actor}@example.com`, name: "Gap QA", isActive: true, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: ws, name: "Gap WS", slug: `gap-ws-${ws.slice(0, 8)}`, createdBy: actor } });
    for (const [id, name] of [[bizA, "Gap A"], [bizB, "Gap B"], [bizFin, "Gap Finance"]] as const) {
      await db.ownerBusiness.create({ data: { id, workspaceId: ws, name, businessType: "generic_local_service", updatedAt: new Date() } });
    }
  });

  afterAll(async () => {
    await db.processExecutionTask.deleteMany({ where: { workspaceId: ws } });
    await db.auditEvent.deleteMany({ where: { workspaceId: ws } });
    await teardownOwnerBusiness(bizFin);
    await db.ownerBusiness.deleteMany({ where: { id: { in: [bizA, bizB, bizFin] } } });
    await db.workspace.deleteMany({ where: { id: ws } });
    await db.user.delete({ where: { id: actor } });
  });

  it("Stage 1–3: PROPOSED while data is missing → CANCELLED (row kept, audited, off the lifecycle) → idempotent", async () => {
    const key = keyOf(bizA, "PROFIT_DATA_INSUFFICIENT");
    // Stage 1 — insufficient data: the route is emitted and persisted.
    const a1 = insufficient(bizA);
    expect(a1.routes.map((r) => r.taskKey)).toContain(key);
    await persistProcessExecutionRoutes(ws, a1, actor, deps);
    const before = await task(ws, bizA, key);
    expect(before?.status).toBe("PROPOSED");
    expect(before?.executionRoute).toBe("CREATE_MISSING_DATA_TASK");
    expect(await lifecycleKeys(bizA)).toContain(key);

    // Stage 2 — data becomes sufficient: the authoritative bridge stops emitting it; persist alone leaves it (the bug).
    const a2 = sufficient(bizA);
    expect(a2.routes.map((r) => r.taskKey)).not.toContain(key);
    await persistProcessExecutionRoutes(ws, a2, actor, deps);
    expect((await task(ws, bizA, key))?.status).toBe("PROPOSED");
    const r = await retireResolvedDataGapTasks(ws, bizA, a2, { cashProfitEvaluated: true, triggeredByUserId: actor }, deps);
    expect(r.cancelled).toBe(1);
    const after = await task(ws, bizA, key);
    expect(after?.id).toBe(before!.id); // same historical row
    expect(after?.status).toBe("CANCELLED");
    expect(await lifecycleKeys(bizA)).not.toContain(key); // no longer presented as active work
    const audits = await transitions(before!.id);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actorId: null, actorType: "system" });
    expect(audits[0].payload).toMatchObject({
      taskKey: key, sourceFindingKey: "PROFIT_DATA_INSUFFICIENT", businessId: bizA,
      fromStatus: "PROPOSED", toStatus: "CANCELLED", reason: "SOURCE_FINDING_NO_LONGER_ACTIVE", triggeredByUserId: actor,
    });

    // Stage 3 — idempotency: no duplicate task, no repeated mutation or audit.
    const again = await retireResolvedDataGapTasks(ws, bizA, a2, { cashProfitEvaluated: true }, deps);
    expect(again.cancelled).toBe(0);
    await persistProcessExecutionRoutes(ws, a2, actor, deps);
    expect(await db.processExecutionTask.count({ where: { workspaceId: ws, businessId: bizA, taskKey: key } })).toBe(1);
    expect((await task(ws, bizA, key))?.status).toBe("CANCELLED");
    expect(await transitions(before!.id)).toHaveLength(1);
  });

  it("does nothing while the route is still emitted, or when the cash/profit layer was not evaluated", async () => {
    const key = keyOf(bizB, "PROFIT_DATA_INSUFFICIENT");
    await persistProcessExecutionRoutes(ws, insufficient(bizB), actor, deps);
    expect((await retireResolvedDataGapTasks(ws, bizB, insufficient(bizB), { cashProfitEvaluated: true }, deps)).cancelled).toBe(0);
    expect((await retireResolvedDataGapTasks(ws, bizB, sufficient(bizB), { cashProfitEvaluated: false }, deps)).cancelled).toBe(0);
    expect((await retireResolvedDataGapTasks(ws, bizB, null, { cashProfitEvaluated: true }, deps)).cancelled).toBe(0);
    expect((await task(ws, bizB, key))?.status).toBe("PROPOSED");
  });

  it("Stage 4: business isolation — resolving A never touches B, another family, or a workspace-level task", async () => {
    const sameKeyA = keyOf(bizA, "MISSING_UNIT_ECONOMICS");
    const sameKeyB = keyOf(bizB, "MISSING_UNIT_ECONOMICS");
    // Both businesses hold an equivalent stale unit-economics data gap.
    await persistProcessExecutionRoutes(ws, bridgeFor(bizA, { hasUnitEconomics: false }), actor, deps);
    await persistProcessExecutionRoutes(ws, bridgeFor(bizB, { hasUnitEconomics: false }), actor, deps);
    // A different source family for A, and a workspace-level (null business) task with a look-alike key.
    const seed = (over: Record<string, unknown>) => db.processExecutionTask.create({
      data: {
        id: randomUUID(), workspaceId: ws, businessId: null, taskKey: `x:${randomUUID()}`, sourceFamily: "PROCESS_CORRECTION",
        sourceFindingKey: "PROFIT_DATA_INSUFFICIENT", executionRoute: "CREATE_MISSING_DATA_TASK", actionOwner: "STAFF",
        approvalLevel: "NEEDS_DATA", status: "PROPOSED", requiredEvidence: [], evidenceRefs: [], completionCriteria: "c",
        reassessmentTrigger: "t", riskIfIgnored: "r", ownerVisibleSummary: "s", severity: "LOW", priorityRank: 900,
        isFixtureRecord: false, updatedAt: new Date(), ...over,
      },
    });
    const otherFamily = await seed({ businessId: bizA });
    const workspaceLevel = await seed({ sourceFamily: "CASH_PROFIT", businessId: null });

    // Only A's data becomes sufficient.
    const r = await retireResolvedDataGapTasks(ws, bizA, sufficient(bizA), { cashProfitEvaluated: true }, deps);
    expect(r.cancelled).toBe(1); // A's MISSING_UNIT_ECONOMICS (its PROFIT gap was already retired above)
    expect((await task(ws, bizA, sameKeyA))?.status).toBe("CANCELLED");
    expect((await task(ws, bizB, sameKeyB))?.status).toBe("PROPOSED"); // B unchanged
    expect((await task(ws, bizB, keyOf(bizB, "PROFIT_DATA_INSUFFICIENT")))?.status).toBe("PROPOSED");
    expect((await db.processExecutionTask.findUnique({ where: { id: otherFamily.id } }))?.status).toBe("PROPOSED");
    expect((await db.processExecutionTask.findUnique({ where: { id: workspaceLevel.id } }))?.status).toBe("PROPOSED");
    // A workspace other than the task's is never reachable.
    expect((await retireResolvedDataGapTasks(randomUUID(), bizB, sufficient(bizB), { cashProfitEvaluated: true }, deps)).cancelled).toBe(0);
    expect((await task(ws, bizB, sameKeyB))?.status).toBe("PROPOSED");
  });

  it("Stage 5: owner-progressed tasks are never auto-cancelled or reset", async () => {
    const statuses = ["ACKNOWLEDGED", "IN_PROGRESS", "NEEDS_DATA", "BLOCKED", "COMPLETED", "REJECTED", "OUTCOME_RECORDED", "OUTCOME_VERIFIED", "APPROVED", "DELEGATED"];
    const bizP = randomUUID();
    await db.ownerBusiness.create({ data: { id: bizP, workspaceId: ws, name: "Gap Progressed", businessType: "generic_local_service", updatedAt: new Date() } });
    try {
      const ids: Record<string, string> = {};
      for (const st of statuses) {
        const id = randomUUID();
        ids[st] = id;
        await db.processExecutionTask.create({
          data: {
            id, workspaceId: ws, businessId: bizP, taskKey: `cp:${bizP}:PROFIT_DATA_INSUFFICIENT:${st}`, sourceFamily: "CASH_PROFIT",
            sourceFindingKey: "PROFIT_DATA_INSUFFICIENT", executionRoute: "CREATE_MISSING_DATA_TASK", actionOwner: "STAFF",
            approvalLevel: "NEEDS_DATA", status: st, requiredEvidence: [], evidenceRefs: [], completionCriteria: "c",
            reassessmentTrigger: "t", riskIfIgnored: "r", ownerVisibleSummary: "s", severity: "LOW", priorityRank: 900,
            isFixtureRecord: false, updatedAt: new Date(),
          },
        });
      }
      const r = await retireResolvedDataGapTasks(ws, bizP, sufficient(bizP), { cashProfitEvaluated: true }, deps);
      expect(r.cancelled).toBe(0);
      for (const st of statuses) {
        expect((await db.processExecutionTask.findUnique({ where: { id: ids[st] } }))?.status).toBe(st);
        expect(await transitions(ids[st])).toHaveLength(0);
      }
    } finally {
      await db.processExecutionTask.deleteMany({ where: { businessId: bizP } });
      await db.ownerBusiness.delete({ where: { id: bizP } });
    }
  });

  it("a task the owner advanced while reconciliation ran is never overridden (compare-and-set)", async () => {
    const key = `cp:${bizA}:PROFIT_DATA_INSUFFICIENT:race`;
    const id = randomUUID();
    await db.processExecutionTask.create({
      data: {
        id, workspaceId: ws, businessId: bizA, taskKey: key, sourceFamily: "CASH_PROFIT", sourceFindingKey: "PROFIT_DATA_INSUFFICIENT",
        executionRoute: "CREATE_MISSING_DATA_TASK", actionOwner: "STAFF", approvalLevel: "NEEDS_DATA", status: "PROPOSED",
        requiredEvidence: [], evidenceRefs: [], completionCriteria: "c", reassessmentTrigger: "t", riskIfIgnored: "r",
        ownerVisibleSummary: "s", severity: "LOW", priorityRank: 900, isFixtureRecord: false, updatedAt: new Date(),
      },
    });
    // The owner starts the task between the candidate read and the write.
    const racing: ProcessBridgeDeps = {
      ...deps,
      db: {
        ...(db as unknown as ProcessBridgeDb),
        processExecutionTask: {
          findMany: async (a: never) => { const rows = await (db.processExecutionTask as never as { findMany: (x: unknown) => Promise<never[]> }).findMany(a); await db.processExecutionTask.update({ where: { id }, data: { status: "IN_PROGRESS" } }); return rows; },
        },
        $transaction: (fn: never) => (db as unknown as ProcessBridgeDb).$transaction(fn),
      } as unknown as ProcessBridgeDb,
    };
    const r = await retireResolvedDataGapTasks(ws, bizA, sufficient(bizA), { cashProfitEvaluated: true }, racing);
    expect(r.cancelled).toBe(0);
    expect((await db.processExecutionTask.findUnique({ where: { id } }))?.status).toBe("IN_PROGRESS");
    expect(await transitions(id)).toHaveLength(0);
  });

  it("Stage 6: the real black-box numbers — no generic data gap is emitted and a stale persisted one is retired", async () => {
    const periodEnd = new Date(Date.now() - 10 * 86_400_000);
    const periodStart = new Date(periodEnd.getTime() - 30 * 86_400_000);
    const snap = await createFinancialSnapshot(bizFin, {
      periodStart: periodStart.toISOString().slice(0, 10), periodEnd: periodEnd.toISOString().slice(0, 10), currency: "INR",
      revenue: 180000, fixedCosts: 110000, variableCosts: 60000, cashOnHand: 40000,
    } as never, actor, ws);
    await runFinanceDiagnosis(bizFin, snap.id, actor, ws);

    // The pre-#556 world persisted this row while only the Finance diagnosis existed.
    const staleKey = keyOf(bizFin, "PROFIT_DATA_INSUFFICIENT");
    await persistProcessExecutionRoutes(ws, insufficient(bizFin), actor, deps);
    expect((await task(ws, bizFin, staleKey))?.status).toBe("PROPOSED");
    expect(await lifecycleKeys(bizFin)).toContain(staleKey);

    // The post-diagnosis reconciliation hook recomputes the REAL authoritative analysis and retires it.
    const { getOwnerNowView } = await import("@/services/owner-guidance/owner-now-view.service");
    const view = await getOwnerNowView(ws, bizFin);
    expect(view.cashProfitProtection!.signals.map((s) => s.signalType)).not.toContain("PROFIT_DATA_INSUFFICIENT");
    expect(view.processExecution!.routes.map((r) => r.taskKey)).not.toContain(staleKey);
    const hook = await reconcileDataGapTasksAfterDiagnosis(ws, bizFin, actor);
    expect(hook.cancelled).toBeGreaterThanOrEqual(1);
    expect((await task(ws, bizFin, staleKey))?.status).toBe("CANCELLED");
    expect(await lifecycleKeys(bizFin)).not.toContain(staleKey);
    const lifecycleText = JSON.stringify(await queryExecutionLifecycle(ws, db as unknown as GuidanceDeps["db"], bizFin, false));
    expect(lifecycleText).not.toMatch(/Not enough financial data to assess profit/);
  });
});
