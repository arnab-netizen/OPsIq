/**
 * Hostile disconnect / reconnect sequencing on real PostgreSQL (fake Intuit): work already queued or running when the owner
 * disconnects, and webhooks naming a company that is no longer (or never again) this connection's company.
 */
import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { connectQbo, envFor, makeFakeIntuit, monthKeys, seedQboTenant, type MonthBooks } from "@/__tests__/test-helpers/qbo-db-fixtures";
import { DatabaseSchedulerProvider, type TaskHandler } from "@/infra/scheduler";
import { TASK_NAME_QBO_SYNC, createQboSyncTaskHandler, enqueueQboSync, qboSyncKey } from "@/services/quickbooks/qbo-sync-scheduling";
import { runQboSync } from "@/services/quickbooks/qbo-sync.service";
import { disconnectQboConnection } from "@/services/quickbooks/qbo-connection.service";
import { reactToQboWebhook } from "@/services/quickbooks/qbo-webhook.service";

const books: MonthBooks = { income: 10_000, cogs: 4_000, bank: 20_000, arTotal: 7_000, arCurrent: 5_000, apTotal: 2_500, apCurrent: 2_500 };
const allMonths = () => Object.fromEntries(monthKeys(12).map((k) => [k, books]));
const env = envFor("production");

describe.skipIf(!SHOULD_RUN_DB_TESTS)("QBO lifecycle — hostile sequencing (real Postgres)", () => {
  it("a task queued BEFORE disconnect finds the connection inactive: no provider call, no evidence, task not retried", async () => {
    const t = await seedQboTenant();
    const { connectionId } = await connectQbo(t);
    const f = makeFakeIntuit(allMonths());
    const { taskId } = await enqueueQboSync({ workspaceId: t.ws, connectionId, trigger: "SCHEDULED", key: qboSyncKey(connectionId, "daily", new Date()) });
    await disconnectQboConnection({ workspaceId: t.ws, actorId: t.actor, connectionId });
    await db.scheduledTask.update({ where: { id: taskId }, data: { scheduledFor: new Date(Date.now() - 1000) } });
    const handlers = new Map<string, TaskHandler>([[TASK_NAME_QBO_SYNC, createQboSyncTaskHandler(() => ({ env, readClientFactory: () => f.reader }))]]);
    await new DatabaseSchedulerProvider().processTaskById(taskId, handlers);
    expect(f.calls).toHaveLength(0);
    expect(await db.qboReportSnapshot.count({ where: { connectionId } })).toBe(0);
    expect(await db.ownerFinancialSnapshot.count({ where: { workspaceId: t.ws } })).toBe(0);
    const row = await db.scheduledTask.findUniqueOrThrow({ where: { id: taskId } });
    expect(row.status).toBe("completed"); // NO_WORK is a completed no-op, never a retry storm
  });

  it("disconnecting WHILE a sync is reading: nothing is materialized after the connection stops being active", async () => {
    const t = await seedQboTenant();
    const { connectionId } = await connectQbo(t);
    const f = makeFakeIntuit(allMonths());
    let cut = false;
    const inner = f.reader.reportWithMeta.bind(f.reader);
    f.reader.reportWithMeta = (async (name: never, params: never) => {
      if (!cut) { cut = true; await disconnectQboConnection({ workspaceId: t.ws, actorId: t.actor, connectionId }); }
      return inner(name, params);
    }) as never;
    await runQboSync({ workspaceId: t.ws, connectionId, trigger: "SCHEDULED" }, { env, readClientFactory: () => f.reader });
    expect(await db.ownerFinancialSnapshot.count({ where: { workspaceId: t.ws } })).toBe(0);
    expect(await db.ownerCashflowSnapshot.count({ where: { workspaceId: t.ws } })).toBe(0);
    expect(await db.qboCanonicalProvenance.count({ where: { workspaceId: t.ws } })).toBe(0);
    expect((await db.qboConnection.findUniqueOrThrow({ where: { id: connectionId } })).status).toBe("DISCONNECTED");
  });

  it("after a DIFFERENT-realm reconnect an old webhook triggers nothing; the new realm's webhook triggers only the new connection; history stays with the old realm", async () => {
    const t = await seedQboTenant();
    const first = await connectQbo(t);
    const f = makeFakeIntuit(allMonths());
    for (let i = 0; i < 4; i++) await runQboSync({ workspaceId: t.ws, connectionId: first.connectionId, trigger: "SCHEDULED" }, { env, readClientFactory: () => f.reader });
    const historic = await db.qboReportSnapshot.count({ where: { connectionId: first.connectionId } });
    expect(historic).toBe(48);

    await disconnectQboConnection({ workspaceId: t.ws, actorId: t.actor, connectionId: first.connectionId });
    const second = await connectQbo(t);
    expect(second.realmId).not.toBe(first.realmId);

    const old = await reactToQboWebhook({ realmIds: [first.realmId] }, { env });
    expect(old).toEqual({ realmsReceived: 1, connectionsTriggered: 0 });
    expect(await db.scheduledTask.count({ where: { idempotencyKey: { startsWith: `qbo-sync:${second.connectionId}:wh:` } } })).toBe(0);
    expect(await db.scheduledTask.count({ where: { idempotencyKey: { startsWith: `qbo-sync:${first.connectionId}:wh:` } } })).toBe(0);

    const fresh = await reactToQboWebhook({ realmIds: [second.realmId] }, { env });
    expect(fresh.connectionsTriggered).toBe(1);
    expect(await db.scheduledTask.count({ where: { idempotencyKey: { startsWith: `qbo-sync:${second.connectionId}:wh:` } } })).toBe(1);

    // the old company's evidence was never relabelled or moved to the new connection / realm
    expect(await db.qboReportSnapshot.count({ where: { connectionId: first.connectionId, realmId: first.realmId } })).toBe(historic);
    expect(await db.qboReportSnapshot.count({ where: { connectionId: second.connectionId } })).toBe(0);
    expect(await db.qboCanonicalProvenance.count({ where: { connectionId: first.connectionId, realmId: { not: first.realmId } } })).toBe(0);
  });

  it("an old task for a previous connection id of the same business, run after a different-realm reconnect, writes nothing", async () => {
    const t = await seedQboTenant();
    const first = await connectQbo(t);
    const { taskId } = await enqueueQboSync({ workspaceId: t.ws, connectionId: first.connectionId, trigger: "WEBHOOK", key: qboSyncKey(first.connectionId, "wh", new Date()) });
    await disconnectQboConnection({ workspaceId: t.ws, actorId: t.actor, connectionId: first.connectionId });
    const second = await connectQbo(t);
    const f = makeFakeIntuit(allMonths());
    await db.scheduledTask.update({ where: { id: taskId }, data: { scheduledFor: new Date(Date.now() - 1000) } });
    await new DatabaseSchedulerProvider().processTaskById(taskId, new Map<string, TaskHandler>([[TASK_NAME_QBO_SYNC, createQboSyncTaskHandler(() => ({ env, readClientFactory: () => f.reader }))]]));
    expect(f.calls).toHaveLength(0);
    expect(await db.qboReportSnapshot.count({ where: { businessId: t.biz } })).toBe(0);
    expect((await db.qboConnection.findUniqueOrThrow({ where: { id: second.connectionId } })).status).toBe("ACTIVE");
  });
});
