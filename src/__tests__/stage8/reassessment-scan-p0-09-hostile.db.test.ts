/**
 * P0-09 — hostile real-Postgres proof for the governed-reassessment scheduler wiring.
 *
 * Covers what is NEW in P0-09: the reassessment-scan producer/handler and the
 * system-actor audit fix (src/domain/owner-budget/system-actor.ts) that makes
 * the scheduled path actually persist a reassessment instead of silently
 * rolling back on a ghost-actor FK violation.
 *
 * Generic claim/lease/retry/backoff/dead-letter/unknown-task-type/concurrent-
 * invocation/restart-survival mechanics are proven task-type-agnostically by
 * scheduler-p0-08-hostile.db.test.ts against the SAME unmodified
 * DatabaseSchedulerProvider.processDue() this task type runs through — they
 * are not re-proven here for this specific taskName; only what P0-09 actually
 * changed is covered below:
 *   1/2. producer creates exactly one durable task per due workspace; a
 *        duplicate same-day producer run does not duplicate it.
 *   6.   the claimed handler receives the correct workspace/task payload.
 *   7.   workspace isolation — a task claimed for workspace A cannot reach
 *        workspace B's overdue actions.
 *   15.  scanDueReassessments's existing per-day idempotency survives being
 *        driven through the scheduler instead of the standalone route.
 *   18.  audit lifecycle — the reassessment's own OWNER_BUDGET_REASSESSED
 *        audit event is now actually persisted (actorType: "system",
 *        actorId: null) instead of rolling back the transaction.
 *   19.  owner-visible result — a real BudgetPlanSnapshot appears via the
 *        same read path the owner's budget UI/API uses.
 *   20.  zero-due-work producer + drain run succeeds honestly.
 *   21.  a failing business does not prevent an unrelated workspace's
 *        reassessment from succeeding.
 *
 * Requires: TEST_WITH_DB=true and a migrated local PostgreSQL instance.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { DatabaseSchedulerProvider } from "@/infra/scheduler";
import { getProductionTaskHandlers, TASK_NAME_REASSESSMENT_SCAN } from "@/infra/scheduler-handlers";
import { enqueueDueReassessmentScanTasks } from "@/services/scheduler/scheduler-producers";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { listBudgetSnapshots } from "@/services/owner-budget/budget.service";
import { SCHEDULER_SYSTEM_ACTOR } from "@/domain/owner-budget/system-actor";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";

const SKIP = !SHOULD_RUN_DB_TESTS;
const DAY = 86_400_000;

function assertLocalUrl(): void {
  const url = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? "";
  let hostname = "";
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw new Error("[reassessment-scan-p0-09-hostile-db] DATABASE_URL is not a valid URL");
  }
  const isLocal = hostname === "localhost" || hostname === "::1" || /^127(\.\d+){3}$/.test(hostname);
  if (!isLocal) {
    throw new Error(
      `[reassessment-scan-p0-09-hostile-db] SAFETY GATE: DATABASE_URL resolves to a non-local host ("${hostname}"). Aborting.`
    );
  }
}

const businessIds: string[] = [];

async function newBusiness(workspaceId: string): Promise<string> {
  const b = await createBusiness(
    { name: "P0-09 Hostile Test", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
    randomUUID(),
    workspaceId,
  );
  businessIds.push(b.id);
  return b.id;
}

async function seedFinance(workspaceId: string, businessId: string) {
  await db.ownerFinancialSnapshot.create({
    data: {
      id: randomUUID(), workspaceId, businessId,
      periodStart: new Date("2026-05-01"), periodEnd: new Date("2026-05-31"), currency: "INR",
      revenue: 500000, costOfGoods: 250000, fixedCosts: 150000, cashOnHand: 400000,
      dataConfidenceScore: 80, missingCriticalData: [], updatedAt: new Date(),
    },
  });
}

async function seedOverdueBudgetAction(workspaceId: string, businessId: string) {
  await db.ownerBudgetAction.create({
    data: {
      id: randomUUID(), workspaceId, businessId,
      sourceKey: `sk-${randomUUID()}`,
      title: "Review cash protection", accountableRole: "owner", decisionType: "INVESTIGATE",
      requiredProof: "Updated cash position", reviewInDays: 7,
      dueAt: new Date(Date.now() - 2 * DAY), status: "proposed",
      expectedFinancialImpact: "Protect reserve before due-date default",
      verificationMethod: "owner_review", escalationPath: "owner",
      updatedAt: new Date(),
    },
  });
}

async function cleanScheduledTasks() {
  await db.scheduledTask.deleteMany({ where: { taskName: TASK_NAME_REASSESSMENT_SCAN } });
}

describe.skipIf(SKIP)("[db] P0-09 reassessment-scan scheduler — hostile proof", () => {
  beforeEach(async () => {
    assertLocalUrl();
  });

  afterEach(async () => {
    await cleanScheduledTasks();
    for (const id of businessIds.splice(0)) {
      await db.ownerBusiness.delete({ where: { id } }).catch(() => undefined);
    }
  });

  // ── 1/2. Producer: exactly one task per due workspace; no duplicate on re-run ──
  it("1/2. producer enqueues exactly one task per due workspace and a same-day re-run does not duplicate it", async () => {
    const workspaceId = randomUUID();
    const businessId = await newBusiness(workspaceId);
    await seedFinance(workspaceId, businessId);
    await seedOverdueBudgetAction(workspaceId, businessId);

    const first = await enqueueDueReassessmentScanTasks();
    expect(first.candidatesFound).toBeGreaterThanOrEqual(1);
    expect(first.enqueued).toBeGreaterThanOrEqual(1);

    const tasksAfterFirst = await db.scheduledTask.count({
      where: { taskName: TASK_NAME_REASSESSMENT_SCAN, workspaceId },
    });
    expect(tasksAfterFirst).toBe(1);

    await enqueueDueReassessmentScanTasks(); // second same-day run
    const tasksAfterSecond = await db.scheduledTask.count({
      where: { taskName: TASK_NAME_REASSESSMENT_SCAN, workspaceId },
    });
    expect(tasksAfterSecond).toBe(1); // idempotent — no duplicate row
  });

  // ── 6/18/19. Claimed handler runs the real reassessment: correct payload, audit persists, owner-visible result ──
  it("6/18/19. claimed handler reassesses the correct workspace, persists the audit event, and produces an owner-visible snapshot", async () => {
    const workspaceId = randomUUID();
    const businessId = await newBusiness(workspaceId);
    await seedFinance(workspaceId, businessId);
    await seedOverdueBudgetAction(workspaceId, businessId);

    const before = await listBudgetSnapshots(workspaceId, businessId);

    const { enqueued } = await enqueueDueReassessmentScanTasks();
    expect(enqueued).toBeGreaterThanOrEqual(1);

    const scheduler = new DatabaseSchedulerProvider();
    const processed = await scheduler.processDue(getProductionTaskHandlers());
    expect(processed).toBeGreaterThanOrEqual(1);

    const task = await db.scheduledTask.findFirst({ where: { taskName: TASK_NAME_REASSESSMENT_SCAN, workspaceId } });
    expect(task?.status).toBe("completed"); // handler did not throw — the FK-fail regression would have dead-lettered/retried it

    // Owner-visible result: a real new BudgetPlanSnapshot exists via the same read path the owner UI/API uses.
    const after = await listBudgetSnapshots(workspaceId, businessId);
    expect(after.length).toBeGreaterThan(before.length);

    // Audit lifecycle: OWNER_BUDGET_REASSESSED was actually persisted (proves the transaction did NOT roll back),
    // with the correct system-actor representation — not the raw non-existent SCHEDULER_SYSTEM_ACTOR UUID.
    const auditEvent = await db.auditEvent.findFirst({
      where: { workspaceId, eventName: AUDIT_EVENTS.OWNER_BUDGET_REASSESSED },
      orderBy: { occurredAt: "desc" },
    });
    expect(auditEvent).not.toBeNull();
    expect(auditEvent?.actorType).toBe("system");
    expect(auditEvent?.actorId).toBeNull();
    expect(auditEvent?.actorId).not.toBe(SCHEDULER_SYSTEM_ACTOR);
  });

  // ── 7. Workspace isolation — a claimed task cannot reach another workspace's overdue actions ──
  it("7. a workspace-scoped task only reassesses its own workspace's overdue business, never another's", async () => {
    const workspaceA = randomUUID();
    const workspaceB = randomUUID();
    const businessA = await newBusiness(workspaceA);
    const businessB = await newBusiness(workspaceB);
    await seedFinance(workspaceA, businessA);
    await seedFinance(workspaceB, businessB);
    await seedOverdueBudgetAction(workspaceA, businessA);
    await seedOverdueBudgetAction(workspaceB, businessB);

    await enqueueDueReassessmentScanTasks();
    expect(await db.scheduledTask.count({ where: { taskName: TASK_NAME_REASSESSMENT_SCAN, workspaceId: workspaceA } })).toBe(1);
    expect(await db.scheduledTask.count({ where: { taskName: TASK_NAME_REASSESSMENT_SCAN, workspaceId: workspaceB } })).toBe(1);

    // Claim and run ONLY workspace A's task directly (bypass processDue's batch claim so this test controls exactly one task).
    const taskA = await db.scheduledTask.findFirstOrThrow({ where: { taskName: TASK_NAME_REASSESSMENT_SCAN, workspaceId: workspaceA } });
    const handler = getProductionTaskHandlers().get(TASK_NAME_REASSESSMENT_SCAN)!;
    await handler(null, { taskId: taskA.id, taskName: TASK_NAME_REASSESSMENT_SCAN, workspaceId: workspaceA, attempt: 1 });

    const snapsA = await listBudgetSnapshots(workspaceA, businessA);
    const snapsB = await listBudgetSnapshots(workspaceB, businessB);
    expect(snapsA.length).toBeGreaterThan(0); // A's own business WAS reassessed
    expect(snapsB.length).toBe(0); // B's business was NOT touched by A's task
  });

  // ── 15. Existing per-day idempotency survives being driven through the scheduler ──
  it("15. re-running the claimed handler the same day does not create a duplicate snapshot (existing reassessBudget idempotency intact)", async () => {
    const workspaceId = randomUUID();
    const businessId = await newBusiness(workspaceId);
    await seedFinance(workspaceId, businessId);
    await seedOverdueBudgetAction(workspaceId, businessId);

    const handler = getProductionTaskHandlers().get(TASK_NAME_REASSESSMENT_SCAN)!;
    const ctx = { taskId: randomUUID(), taskName: TASK_NAME_REASSESSMENT_SCAN, workspaceId, attempt: 1 };

    await handler(null, ctx);
    const afterFirst = await listBudgetSnapshots(workspaceId, businessId);
    await handler(null, ctx); // same UTC day → same triggerEventId inside scanDueReassessments/reassessBudget
    const afterSecond = await listBudgetSnapshots(workspaceId, businessId);

    expect(afterSecond.length).toBe(afterFirst.length);
  });

  // ── 20. Zero-due-work run succeeds honestly ──
  it("20. a zero-due-work producer and drain run succeeds honestly (no fabricated work)", async () => {
    const result = await enqueueDueReassessmentScanTasks();
    // No overdue action seeded for any workspace in this isolated test — a
    // real-world non-zero count from other concurrent tests is fine; the
    // honest-zero contract is that the call completes without throwing and
    // enqueues exactly one task per genuinely-due workspace, never more.
    expect(result.enqueued).toBe(result.candidatesFound);

    const scheduler = new DatabaseSchedulerProvider();
    await expect(scheduler.processDue(getProductionTaskHandlers())).resolves.toEqual(expect.any(Number));
  });

  // ── 21. A failing business does not prevent an unrelated workspace's reassessment ──
  it("21. a business missing required finance data does not prevent an unrelated workspace's task from succeeding", async () => {
    const workspaceFail = randomUUID();
    const workspaceOk = randomUUID();
    const businessFail = await newBusiness(workspaceFail); // no seedFinance — assembleAssessment will fail for this one
    const businessOk = await newBusiness(workspaceOk);
    await seedFinance(workspaceOk, businessOk);
    await seedOverdueBudgetAction(workspaceFail, businessFail);
    await seedOverdueBudgetAction(workspaceOk, businessOk);

    await enqueueDueReassessmentScanTasks();
    const handler = getProductionTaskHandlers().get(TASK_NAME_REASSESSMENT_SCAN)!;

    const taskFail = await db.scheduledTask.findFirstOrThrow({ where: { taskName: TASK_NAME_REASSESSMENT_SCAN, workspaceId: workspaceFail } });
    const taskOk = await db.scheduledTask.findFirstOrThrow({ where: { taskName: TASK_NAME_REASSESSMENT_SCAN, workspaceId: workspaceOk } });

    // scanDueReassessments isolates per-business failure internally (try/catch, `skipped++`) — the
    // handler itself does not throw for a single bad business, so both claimed tasks complete.
    await expect(handler(null, { taskId: taskFail.id, taskName: TASK_NAME_REASSESSMENT_SCAN, workspaceId: workspaceFail, attempt: 1 })).resolves.toBeUndefined();
    await expect(handler(null, { taskId: taskOk.id, taskName: TASK_NAME_REASSESSMENT_SCAN, workspaceId: workspaceOk, attempt: 1 })).resolves.toBeUndefined();

    expect((await listBudgetSnapshots(workspaceFail, businessFail)).length).toBe(0); // genuinely failed — no finance data
    expect((await listBudgetSnapshots(workspaceOk, businessOk)).length).toBeGreaterThan(0); // unaffected by the other workspace's failure
  });
});

describe.skipIf(!SKIP)("[db] P0-09 reassessment-scan — DB unavailable", () => {
  it("DB_BLOCKED_ENVIRONMENT — set TEST_WITH_DB=true to run PostgreSQL-backed scheduler tests", () => {
    expect(true).toBe(true);
  });
});
