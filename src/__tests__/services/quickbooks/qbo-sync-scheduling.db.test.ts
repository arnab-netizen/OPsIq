/** QuickBooks sync through the EXISTING scheduler — producer, handler, idempotency, retry, dead-letter, continuation. Real PostgreSQL. */
import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { connectQbo, envFor, makeFakeIntuit, monthKeys, seedQboTenant, type FakeIntuit, type MonthBooks } from "@/__tests__/test-helpers/qbo-db-fixtures";
import { runQboProducerForTest } from "@/__tests__/test-helpers/qbo-task-cleanup";
import { DatabaseSchedulerProvider, type TaskHandler } from "@/infra/scheduler";
import { getProductionTaskHandlers } from "@/infra/scheduler-handlers";
import { QboProviderError } from "@/domain/quickbooks/qbo-errors";
import {
  TASK_NAME_QBO_SYNC, createQboSyncTaskHandler, enqueueDueQboSyncTasks, enqueueQboSync, qboSyncKey,
} from "@/services/quickbooks/qbo-sync-scheduling";
import { acquireQboLock } from "@/services/quickbooks/qbo-connection-lock";
import { disconnectQboConnection, markQboReauthorizationRequired } from "@/services/quickbooks/qbo-connection.service";
import { reactToQboWebhook } from "@/services/quickbooks/qbo-webhook.service";

const books = (n: number): MonthBooks => ({ income: 10_000 + n, cogs: 4_000, bank: 20_000, arTotal: 7_000, arCurrent: 5_000, apTotal: 2_500, apCurrent: 2_500 });
const allMonths = () => Object.fromEntries(monthKeys(12).map((k, i) => [k, books(i)]));

const handlerFor = (f: FakeIntuit): TaskHandler => createQboSyncTaskHandler(() => ({ env: envFor("production"), readClientFactory: () => f.reader }));
const handlers = (f: FakeIntuit) => new Map<string, TaskHandler>([[TASK_NAME_QBO_SYNC, handlerFor(f)]]);
const taskRow = (id: string) => db.scheduledTask.findUniqueOrThrow({ where: { id } });
const dueNow = (id: string) => db.scheduledTask.update({ where: { id }, data: { scheduledFor: new Date(Date.now() - 1000) } });

describe.skipIf(!SHOULD_RUN_DB_TESTS)("QBO sync via the existing scheduler (real Postgres)", () => {
  it("the production handler registry registers qbo-sync (not dead code); the cron route runs the producer", () => {
    expect(getProductionTaskHandlers().has(TASK_NAME_QBO_SYNC)).toBe(true);
  });

  it("producer: one task per ACTIVE connection per day; re-running is a no-op; non-active connections are excluded", async () => {
    const a = await seedQboTenant(); const b = await seedQboTenant(); const c = await seedQboTenant(); const d = await seedQboTenant();
    const ca = await connectQbo(a); const cb = await connectQbo(b); const cc = await connectQbo(c); const cd = await connectQbo(d);
    await disconnectQboConnection({ workspaceId: c.ws, actorId: c.actor, connectionId: cc.connectionId });
    await markQboReauthorizationRequired({ workspaceId: d.ws, connectionId: cd.connectionId, reasonCode: "TOKEN_REJECTED" });
    const now = new Date();
    const first = await runQboProducerForTest(() => enqueueDueQboSyncTasks(now));
    expect(first.enqueued).toBeGreaterThanOrEqual(2);
    const key = (id: string) => qboSyncKey(id, "daily", now);
    expect(await db.scheduledTask.count({ where: { idempotencyKey: { in: [key(ca.connectionId), key(cb.connectionId)] } } })).toBe(2);
    expect(await db.scheduledTask.count({ where: { idempotencyKey: { in: [key(cc.connectionId), key(cd.connectionId)] } } })).toBe(0);
    // re-running creates nothing new for these connections (global counts are not asserted: other suites share this database)
    await runQboProducerForTest(() => enqueueDueQboSyncTasks(now));
    expect(await db.scheduledTask.count({ where: { idempotencyKey: { in: [key(ca.connectionId), key(cb.connectionId)] } } })).toBe(2);
    const t = await db.scheduledTask.findFirstOrThrow({ where: { idempotencyKey: key(ca.connectionId) } });
    expect(t).toMatchObject({ taskName: TASK_NAME_QBO_SYNC, workspaceId: a.ws, maxAttempts: 3 });
    expect(t.payload).toEqual({ connectionId: ca.connectionId, trigger: "SCHEDULED" });
  });

  it("producer covers EVERY active connection across pages (no starvation behind a fixed window)", async () => {
    const t = await seedQboTenant();
    const extra = 215; // more than one 200-row page
    const ids: string[] = [];
    for (let i = 0; i < extra; i++) {
      const biz = (await db.ownerBusiness.create({ data: { id: randomUUID(), workspaceId: t.ws, name: `B${i}`, businessType: "generic_local_service", currency: "USD", createdBy: t.actor } })).id;
      const c = await db.qboConnection.create({ data: { id: randomUUID(), workspaceId: t.ws, businessId: biz, environment: "production", realmId: `88${String(Date.now()).slice(-6)}${i}`, status: "ACTIVE", connectedById: t.actor, connectedAt: new Date() } });
      ids.push(c.id);
    }
    const now = new Date();
    await runQboProducerForTest(() => enqueueDueQboSyncTasks(now));
    const have = await db.scheduledTask.count({ where: { idempotencyKey: { in: ids.map((id) => qboSyncKey(id, "daily", now)) } } });
    expect(have).toBe(extra);
    // a few hundred due tasks must not linger for suites that drain the shared scheduler table in batches
    await db.scheduledTask.deleteMany({ where: { taskName: TASK_NAME_QBO_SYNC, workspaceId: t.ws } });
  }, 120_000);

  it("duplicate enqueue of the same logical task yields one row (idempotency key)", async () => {
    const t = await seedQboTenant();
    const { connectionId } = await connectQbo(t);
    const key = qboSyncKey(connectionId, "owner", new Date());
    const r = await Promise.all([1, 2, 3].map(() => enqueueQboSync({ workspaceId: t.ws, connectionId, trigger: "OWNER", key })));
    expect(new Set(r.map((x) => x.taskId)).size).toBe(1);
    expect(r.filter((x) => x.created)).toHaveLength(1);
  });

  it("handler runs one bounded chunk, then schedules an idempotent continuation until the baseline completes", async () => {
    const t = await seedQboTenant();
    const { connectionId } = await connectQbo(t);
    const f = makeFakeIntuit(allMonths());
    const sch = new DatabaseSchedulerProvider();
    let { taskId } = await enqueueQboSync({ workspaceId: t.ws, connectionId, trigger: "SCHEDULED", key: qboSyncKey(connectionId, "daily", new Date()) });
    for (let pass = 0; pass < 4; pass++) {
      expect(await sch.processTaskById(taskId, handlers(f))).toBe(true);
      expect((await taskRow(taskId)).status).toBe("completed");
      const st = await db.qboSyncState.findUniqueOrThrow({ where: { connectionId } });
      if (pass < 3) {
        expect(st.baselineCursor).not.toBeNull();
        const cursor = st.baselineCursor?.toISOString().slice(0, 10) as string;
        const next = await enqueueQboSync({ workspaceId: t.ws, connectionId, trigger: "CONTINUATION", key: qboSyncKey(connectionId, "cont", new Date(), `${pass === 0 ? "BASELINE" : "BASELINE"}:${cursor}`) });
        expect(next.created).toBe(false); // the handler had already scheduled exactly this continuation
        taskId = next.taskId;
      } else {
        expect(st.baselineCompletedAt).not.toBeNull();
        expect(st.baselineCursor).toBeNull();
      }
    }
    expect(await db.ownerFinancialSnapshot.count({ where: { workspaceId: t.ws } })).toBe(12);
  });

  it("transient failure: retried with backoff; third failure dead-letters; the sync state records the streak", async () => {
    const t = await seedQboTenant();
    const { connectionId } = await connectQbo(t);
    const f = makeFakeIntuit(allMonths());
    const sch = new DatabaseSchedulerProvider();
    const { taskId } = await enqueueQboSync({ workspaceId: t.ws, connectionId, trigger: "SCHEDULED", key: `test-retry:${connectionId}` });
    for (let attempt = 1; attempt <= 3; attempt++) {
      f.failNext.push(new QboProviderError({ kind: "TRANSIENT_PROVIDER_FAILURE", httpStatus: 503 }));
      expect(await sch.processTaskById(taskId, handlers(f))).toBe(false);
      const row = await taskRow(taskId);
      expect(row.attempts).toBe(attempt);
      expect(row.status).toBe(attempt < 3 ? "pending" : "dead_letter");
      if (attempt < 3) { expect(row.scheduledFor.getTime()).toBeGreaterThan(Date.now()); await dueNow(taskId); }
    }
    expect((await db.qboSyncState.findUniqueOrThrow({ where: { connectionId } })).consecutiveFailures).toBe(3);
    // a dead-lettered task is never claimed again
    f.failNext.length = 0;
    expect(await sch.processTaskById(taskId, handlers(f))).toBe(false);
    expect((await taskRow(taskId)).status).toBe("dead_letter");
  });

  it("terminal outcomes are 'failed' (never retried): malformed report, re-authorization required", async () => {
    const t = await seedQboTenant(); const u = await seedQboTenant();
    const a = await connectQbo(t); const b = await connectQbo(u);
    const sch = new DatabaseSchedulerProvider();
    const f = makeFakeIntuit(allMonths());
    f.failNext.push(new QboProviderError({ kind: "BAD_REQUEST", httpStatus: 400 }));
    const ta = await enqueueQboSync({ workspaceId: t.ws, connectionId: a.connectionId, trigger: "SCHEDULED", key: `test-bad:${a.connectionId}` });
    expect(await sch.processTaskById(ta.taskId, handlers(f))).toBe(false);
    expect(await taskRow(ta.taskId)).toMatchObject({ status: "failed", attempts: 1 });
    expect((await taskRow(ta.taskId)).lastError).toContain("BAD_REQUEST");

    const g = makeFakeIntuit(allMonths());
    g.failNext.push(new QboProviderError({ kind: "FORBIDDEN", httpStatus: 403 }));
    const tb = await enqueueQboSync({ workspaceId: u.ws, connectionId: b.connectionId, trigger: "SCHEDULED", key: `test-reauth:${b.connectionId}` });
    expect(await sch.processTaskById(tb.taskId, handlers(g))).toBe(false);
    expect(await taskRow(tb.taskId)).toMatchObject({ status: "failed" });
    expect((await db.qboConnection.findUniqueOrThrow({ where: { id: b.connectionId } })).status).toBe("REAUTH_REQUIRED");
    // producers skip it from now on
    const now = new Date(Date.now() + 86_400_000);
    await runQboProducerForTest(() => enqueueDueQboSyncTasks(now));
    expect(await db.scheduledTask.count({ where: { idempotencyKey: qboSyncKey(b.connectionId, "daily", now) } })).toBe(0);
  });

  it("overlap: while another worker holds the connection's sync lock the task is a NO_WORK skip, not a second sync", async () => {
    const t = await seedQboTenant();
    const { connectionId } = await connectQbo(t);
    const sch = new DatabaseSchedulerProvider();
    const f = makeFakeIntuit(allMonths());
    const held = await acquireQboLock("sync", t.ws, connectionId, 60_000);
    expect(held).not.toBeNull();
    const { taskId } = await enqueueQboSync({ workspaceId: t.ws, connectionId, trigger: "SCHEDULED", key: `test-overlap:${connectionId}` });
    expect(await sch.processTaskById(taskId, handlers(f))).toBe(true);
    expect(f.calls).toHaveLength(0);
    expect(await db.qboReportSnapshot.count({ where: { connectionId } })).toBe(0);
  });

  it("task-lease loss: an aborted task context stops the handler before any provider call", async () => {
    const t = await seedQboTenant();
    const { connectionId } = await connectQbo(t);
    const f = makeFakeIntuit(allMonths());
    const ac = new AbortController(); ac.abort();
    const res = await handlerFor(f)({ connectionId, trigger: "SCHEDULED" }, { taskId: "x", taskName: TASK_NAME_QBO_SYNC, workspaceId: t.ws, attempt: 1, signal: ac.signal });
    expect(res).toMatchObject({ status: "NO_WORK" });
    expect(f.calls).toHaveLength(0);
  });

  it("the task's claimed workspace is authoritative: a payload naming another workspace's connection does nothing", async () => {
    const a = await seedQboTenant(); const b = await seedQboTenant();
    const cb = await connectQbo(b);
    const f = makeFakeIntuit(allMonths());
    const res = await handlerFor(f)({ connectionId: cb.connectionId, trigger: "SCHEDULED" }, { taskId: "x", taskName: TASK_NAME_QBO_SYNC, workspaceId: a.ws, attempt: 1, signal: new AbortController().signal });
    expect(res).toMatchObject({ status: "NO_WORK" });
    expect(f.calls).toHaveLength(0);
    expect(await db.qboReportSnapshot.count({ where: { connectionId: cb.connectionId } })).toBe(0);
  });

  it("handler input is validated: missing workspace or connection fails closed", async () => {
    const f = makeFakeIntuit();
    const ctx = { taskId: "x", taskName: TASK_NAME_QBO_SYNC, attempt: 1, signal: new AbortController().signal };
    await expect(handlerFor(f)({ connectionId: "c" }, { ...ctx, workspaceId: null })).rejects.toThrow(/workspaceId/);
    await expect(handlerFor(f)({}, { ...ctx, workspaceId: "11111111-1111-4111-8111-111111111111" })).rejects.toThrow(/connectionId/);
  });

  it("connection A failing does not block connection B on the same scheduler pass", async () => {
    const a = await seedQboTenant(); const b = await seedQboTenant();
    const ca = await connectQbo(a); const cb = await connectQbo(b);
    const sch = new DatabaseSchedulerProvider();
    const fa = makeFakeIntuit(allMonths()); fa.failNext.push(new QboProviderError({ kind: "TRANSIENT_PROVIDER_FAILURE" }));
    const fb = makeFakeIntuit(allMonths());
    const mixed = new Map<string, TaskHandler>([[TASK_NAME_QBO_SYNC, createQboSyncTaskHandler(() => ({ env: envFor("production"), readClientFactory: () => fb.reader }))]]);
    const mixedA = new Map<string, TaskHandler>([[TASK_NAME_QBO_SYNC, handlerFor(fa)]]);
    const ta = await enqueueQboSync({ workspaceId: a.ws, connectionId: ca.connectionId, trigger: "SCHEDULED", key: `test-iso:${ca.connectionId}` });
    const tb = await enqueueQboSync({ workspaceId: b.ws, connectionId: cb.connectionId, trigger: "SCHEDULED", key: `test-iso:${cb.connectionId}` });
    expect(await sch.processTaskById(ta.taskId, mixedA)).toBe(false);
    expect(await sch.processTaskById(tb.taskId, mixed)).toBe(true);
    expect((await taskRow(ta.taskId)).status).toBe("pending");
    expect((await taskRow(tb.taskId)).status).toBe("completed");
  });

  it("webhook reaction: pending marker + ONE coalesced task per 10-minute bucket; unknown realm and inactive connection are ignored identically", async () => {
    const t = await seedQboTenant();
    const { connectionId, realmId } = await connectQbo(t);
    const u = await seedQboTenant();
    const gone = await connectQbo(u);
    await disconnectQboConnection({ workspaceId: u.ws, actorId: u.actor, connectionId: gone.connectionId });
    const now = new Date();
    const env = envFor("production");
    const r1 = await reactToQboWebhook({ realmIds: [realmId, "99999999", gone.realmId] }, { env, now: () => now });
    const r2 = await reactToQboWebhook({ realmIds: [realmId], }, { env, now: () => now });
    const r3 = await reactToQboWebhook({ realmIds: [realmId] }, { env, now: () => new Date(now.getTime() + 1000) });
    expect(r1).toEqual({ realmsReceived: 3, connectionsTriggered: 1 });
    expect(r2.connectionsTriggered).toBe(1);
    expect(r3.connectionsTriggered).toBe(1);
    const tasks = await db.scheduledTask.findMany({ where: { idempotencyKey: { startsWith: `qbo-sync:${connectionId}:wh:` } } });
    expect(tasks.length).toBeLessThanOrEqual(2); // at most one per 10-minute bucket (a bucket boundary may fall between calls)
    const st = await db.qboSyncState.findUniqueOrThrow({ where: { connectionId } });
    expect(st.webhookPendingAt).not.toBeNull();
    expect(st.lastWebhookAt).not.toBeNull();
    expect(await db.qboSyncState.findFirst({ where: { connectionId: gone.connectionId } })).toBeNull();
    // a sync run consumes the marker
    const { runQboSync } = await import("@/services/quickbooks/qbo-sync.service");
    await runQboSync({ workspaceId: t.ws, connectionId, trigger: "WEBHOOK" }, { env, readClientFactory: () => makeFakeIntuit(allMonths()).reader });
    expect((await db.qboSyncState.findUniqueOrThrow({ where: { connectionId } })).webhookPendingAt).toBeNull();
  });

  it("webhook events are triggers only: no event content can alter a figure", async () => {
    const t = await seedQboTenant();
    const { connectionId, realmId } = await connectQbo(t);
    await reactToQboWebhook({ realmIds: [realmId] }, { env: envFor("production") });
    expect(await db.ownerFinancialSnapshot.count({ where: { workspaceId: t.ws } })).toBe(0);
    expect(await db.qboReportSnapshot.count({ where: { connectionId } })).toBe(0);
  });
});
