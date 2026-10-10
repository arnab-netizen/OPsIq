/**
 * Scheduled QuickBooks read-only sync: producer idempotency, tenant isolation, no hammering of dead/backing-off
 * connections, and the registered handler — real PostgreSQL. The handler is exercised WITHOUT network (QuickBooks is
 * unconfigured in the test process, so it must fail closed instead of calling out).
 * Requires TEST_WITH_DB=true. Self-skips otherwise.
 */
import { describe, it, expect, vi, afterEach, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { enqueueDueQboReadSyncTasks as produce } from "@/services/scheduler/scheduler-producers";
import { DatabaseSchedulerProvider, type TaskHandler } from "@/infra/scheduler";
import { seedTenant } from "@/__tests__/owner-outcome/outcome-db-fixtures";
import { getProductionTaskHandlers } from "@/infra/scheduler-handlers";
import { TASK_NAME_QBO_READ_SYNC } from "@/infra/qbo-sync-tasks";
import { listSchedulableConnections } from "@/services/quickbooks/qbo-sync-store.service";
import { QBO_TEST_ENV, seedConnected, ownedQboTasks, ownedQboWorkspaceIds } from "@/__tests__/test-helpers/qbo-db-fixtures";
import * as webhookRoute from "@/app/api/integrations/quickbooks/webhook/route";
import { createHmac } from "node:crypto";

const SANDBOX = QBO_TEST_ENV("sandbox");
/** The producer scan is global by default; every call here is restricted to the workspaces THIS file seeded, so it never creates a task for a row it does not own. */
const enqueueDueQboReadSyncTasks = (env: Record<string, string | undefined>) => produce(env, { onlyWorkspaceIds: ownedQboWorkspaceIds() });
const tasksFor = (ws: string) => db.scheduledTask.findMany({ where: { workspaceId: ws, taskName: TASK_NAME_QBO_READ_SYNC } });

describe.skipIf(!SHOULD_RUN_DB_TESTS)("QBO scheduled sync (real Postgres)", () => {
  afterEach(() => vi.unstubAllEnvs());
  // These tests create durable qbo-read-sync ScheduledTasks. Left pending they would be claimed by the scheduler suites that
  // run processDue() over the whole table later in the same database, so they are removed when this file is done.
  const qboTasks = ownedQboTasks();
  afterAll(qboTasks.cleanup);


  it("enqueues one task per eligible ACTIVE connection per UTC day, idempotently, carrying only the connection id", async () => {
    const a = await seedConnected();
    const b = await seedConnected();
    const first = await enqueueDueQboReadSyncTasks(SANDBOX);
    expect(first.enqueued).toBeGreaterThanOrEqual(2);
    await enqueueDueQboReadSyncTasks(SANDBOX); // idempotent: the same keys replay, nothing new is created for these connections
    // (other test files seed connections concurrently in the shared database, so assert on OUR tenants, not on global counts)
    for (const x of [a, b]) {
      const tasks = await tasksFor(x.t.ws);
      expect(tasks).toHaveLength(1);
      expect(tasks[0].workspaceId).toBe(x.t.ws);
      expect(tasks[0].idempotencyKey).toMatch(new RegExp(`^qbo-read-sync:${x.connectionId}:\\d{4}-\\d{2}-\\d{2}$`));
      const payload = typeof tasks[0].payload === "string" ? JSON.parse(tasks[0].payload) : tasks[0].payload;
      expect(payload).toEqual({ connectionId: x.connectionId, trigger: "SCHEDULED" });
    }
  });

  it("skips REAUTH_REQUIRED, DISCONNECTED, archived-business, held-lease and backing-off connections, and other environments", async () => {
    const reauth = await seedConnected();
    const gone = await seedConnected();
    const archived = await seedConnected();
    const leased = await seedConnected();
    const backoff = await seedConnected();
    const prod = await seedConnected({ environment: "production" });
    const live = await seedConnected();
    await db.qboConnection.update({ where: { id: reauth.connectionId }, data: { status: "REAUTH_REQUIRED", reauthRequiredAt: new Date() } });
    await db.qboConnection.update({ where: { id: gone.connectionId }, data: { status: "DISCONNECTED", disconnectedAt: new Date() } });
    await db.ownerBusiness.update({ where: { id: archived.t.biz }, data: { isActive: false } });
    const sc = (c: typeof leased) => ({ connectionId: c.connectionId, workspaceId: c.t.ws, businessId: c.t.biz });
    await db.qboSyncState.create({ data: { ...sc(leased), leaseToken: randomUUID(), leaseRunId: randomUUID(), leaseExpiresAt: new Date(Date.now() + 300_000), leaseEpoch: 1 } });
    await db.qboSyncState.create({ data: { ...sc(backoff), nextAttemptNotBefore: new Date(Date.now() + 3_600_000), consecutiveFailures: 2 } });

    await enqueueDueQboReadSyncTasks(SANDBOX);
    for (const x of [reauth, gone, archived, leased, backoff, prod]) expect(await tasksFor(x.t.ws)).toHaveLength(0);
    expect(await tasksFor(live.t.ws)).toHaveLength(1);

    // An expired lease or an elapsed back-off makes a connection eligible again.
    await db.qboSyncState.update({ where: { connectionId: leased.connectionId }, data: { leaseExpiresAt: new Date(Date.now() - 1000) } });
    await db.qboSyncState.update({ where: { connectionId: backoff.connectionId }, data: { nextAttemptNotBefore: new Date(Date.now() - 1000) } });
    await enqueueDueQboReadSyncTasks(SANDBOX);
    expect(await tasksFor(leased.t.ws)).toHaveLength(1);
    expect(await tasksFor(backoff.t.ws)).toHaveLength(1);
    // The environment is decided by configuration: a production deployment would pick the production connection only.
    const prodList = await listSchedulableConnections({ environment: "production", limit: 500 });
    expect(prodList.some((c) => c.connectionId === prod.connectionId)).toBe(true);
    expect(prodList.some((c) => c.connectionId === live.connectionId)).toBe(false);
  });

  it("does nothing when QuickBooks is not configured", async () => {
    await seedConnected();
    expect(await enqueueDueQboReadSyncTasks({})).toEqual({ candidatesFound: 0, enqueued: 0, skippedOpenTask: 0, truncated: false, openTasks: 0 });
  });

  it("the handler is registered once, requires a claimed workspace and a connection id, and fails closed without QuickBooks configuration (no network)", async () => {
    const handlers = getProductionTaskHandlers();
    const handler = handlers.get(TASK_NAME_QBO_READ_SYNC);
    expect(handler).toBeTypeOf("function");
    const c = await seedConnected();
    const ctx = (workspaceId: string | null) => ({ taskId: randomUUID(), taskName: TASK_NAME_QBO_READ_SYNC, workspaceId, attempt: 1, signal: new AbortController().signal });
    await expect(handler!({ connectionId: c.connectionId }, ctx(null))).rejects.toThrow(/workspaceId/);
    await expect(handler!({}, ctx(c.t.ws))).rejects.toThrow(/connectionId/);
    await expect(handler!(null, ctx(c.t.ws))).rejects.toThrow(/connectionId/);

    const spy = vi.spyOn(globalThis, "fetch");
    const result = await handler!({ connectionId: c.connectionId, trigger: "SCHEDULED" }, ctx(c.t.ws));
    // The test process has no QUICKBOOKS_* configuration, so the sync refuses to start: reported, not retried, no network.
    expect(result).toMatchObject({ status: "PARTIAL_FAILURE", summary: expect.stringContaining("CONFIGURATION_UNAVAILABLE") });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("the handler never trusts a payload: a connection of another workspace is CONNECTION_NOT_FOUND", async () => {
    const a = await seedConnected();
    const b = await seedConnected();
    vi.stubEnv("QUICKBOOKS_CLIENT_ID", SANDBOX.QUICKBOOKS_CLIENT_ID);
    vi.stubEnv("QUICKBOOKS_CLIENT_SECRET", SANDBOX.QUICKBOOKS_CLIENT_SECRET);
    vi.stubEnv("QUICKBOOKS_REDIRECT_URI", SANDBOX.QUICKBOOKS_REDIRECT_URI);
    vi.stubEnv("QUICKBOOKS_ENVIRONMENT", "sandbox");
    const spy = vi.spyOn(globalThis, "fetch");
    const handler = getProductionTaskHandlers().get(TASK_NAME_QBO_READ_SYNC)!;
    const result = await handler({ connectionId: a.connectionId, businessId: a.t.biz, workspaceId: a.t.ws }, { taskId: randomUUID(), taskName: TASK_NAME_QBO_READ_SYNC, workspaceId: b.t.ws, attempt: 1, signal: new AbortController().signal });
    expect(result).toMatchObject({ status: "PARTIAL_FAILURE", summary: expect.stringContaining("CONNECTION_NOT_FOUND") });
    expect(spy).not.toHaveBeenCalled();
    expect(await db.qboSyncRun.count({ where: { connectionId: a.connectionId } })).toBe(0);
    spy.mockRestore();
  });

  describe("RC13 backlog and fairness", () => {
    const sched = new DatabaseSchedulerProvider();
    const stale = (connectionId: string) => `qbo-read-sync:${connectionId}:2000-01-01`;
    const seedOldTask = async (c: { t: { ws: string }; connectionId: string }, status: "pending" | "running" | "completed") => {
      const created = await sched.scheduleIdempotent({
        taskName: TASK_NAME_QBO_READ_SYNC, payload: { connectionId: c.connectionId, trigger: "SCHEDULED" }, scheduledFor: new Date("2000-01-01T00:00:00Z"),
        maxAttempts: 2, workspaceId: c.t.ws, idempotencyKey: stale(c.connectionId),
      });
      if (status !== "pending") await db.scheduledTask.update({ where: { id: created.id }, data: { status, ...(status === "running" ? { leaseExpiresAt: new Date(Date.now() + 600_000) } : { completedAt: new Date() }) } });
      return created.id;
    };

    it("a connection that already has a pending OR running task is not queued again, and the skip is reported", async () => {
      const a = await seedConnected(); const b = await seedConnected();
      await seedOldTask(a, "pending");
      await seedOldTask(b, "running");
      const r = await produce(SANDBOX, { onlyWorkspaceIds: [a.t.ws, b.t.ws] });
      expect(r.skippedOpenTask).toBe(2);
      expect(r.enqueued).toBe(0);
      expect(await tasksFor(a.t.ws)).toHaveLength(1);
      expect(await tasksFor(b.t.ws)).toHaveLength(1);
      expect(r.openTasks).toBe(2);
    });

    it("once the old task is finished the connection is queued again (a spent task never strands a connection)", async () => {
      const c = await seedConnected();
      await seedOldTask(c, "completed");
      const r = await produce(SANDBOX, { onlyWorkspaceIds: [c.t.ws] });
      expect(r.skippedOpenTask).toBe(0);
      expect(await tasksFor(c.t.ws)).toHaveLength(2);
    });

    it("a large QuickBooks backlog does not starve another task type: it is claimed first, then QuickBooks tasks oldest first (and foreign rows are never claimed)", async () => {
      const ours = await seedTenant(); const foreign = await seedTenant();
      const OTHER = `rc13-other-${randomUUID()}`;
      const ran: string[] = [];
      const handlers = new Map<string, TaskHandler>([
        [TASK_NAME_QBO_READ_SYNC, async (payload) => { ran.push(`qbo:${(payload as { n: number }).n}`); return { status: "SUCCESS" }; }],
        [OTHER, async () => { ran.push("other"); return { status: "SUCCESS" }; }],
      ]);
      for (let n = 1; n <= 3; n++) await sched.scheduleIdempotent({ taskName: TASK_NAME_QBO_READ_SYNC, payload: { n }, scheduledFor: new Date(`2000-01-0${n}T00:00:00Z`), maxAttempts: 2, workspaceId: ours.ws, idempotencyKey: `rc13:${randomUUID()}` });
      await sched.scheduleIdempotent({ taskName: OTHER, payload: {}, scheduledFor: new Date("2000-02-01T00:00:00Z"), maxAttempts: 2, workspaceId: ours.ws, idempotencyKey: `rc13:${randomUUID()}` });
      const foreignTask = await sched.scheduleIdempotent({ taskName: OTHER, payload: {}, scheduledFor: new Date("1999-01-01T00:00:00Z"), maxAttempts: 2, workspaceId: foreign.ws, idempotencyKey: `rc13:${randomUUID()}` });
      try {
        const scope = { onlyWorkspaceIds: [ours.ws] };
        // Control: plain oldest-first would run the QuickBooks task first.
        expect(await sched.processDue(handlers, { maxClaim: 1, ...scope })).toBe(1);
        expect(ran).toEqual(["qbo:1"]);
        ran.length = 0;
        // With QuickBooks deprioritised the OTHER task type runs first although it is NEWER than the whole QuickBooks backlog.
        expect(await sched.processDue(handlers, { maxClaim: 1, deprioritize: [TASK_NAME_QBO_READ_SYNC], ...scope })).toBe(1);
        expect(ran).toEqual(["other"]);
        // The rest of the backlog still progresses (oldest first).
        expect(await sched.processDue(handlers, { maxClaim: 5, deprioritize: [TASK_NAME_QBO_READ_SYNC], ...scope })).toBe(2);
        expect(ran).toEqual(["other", "qbo:2", "qbo:3"]);
        // A due row of a workspace this pass does not own was never claimed.
        expect(await db.scheduledTask.findUniqueOrThrow({ where: { id: foreignTask.id } })).toMatchObject({ status: "pending", attempts: 0 });
        // An empty scope claims nothing at all.
        expect(await sched.processDue(handlers, { onlyWorkspaceIds: [] })).toBe(0);
        expect(await sched.processDue(handlers, { onlyTaskNames: [] })).toBe(0);
      } finally {
        await db.scheduledTask.deleteMany({ where: { workspaceId: { in: [ours.ws, foreign.ws] } } });
      }
    });
  });

  describe("webhook route", () => {
    const TOKEN = "route-verifier-token-0123456789";
    const stubQbo = () => {
      for (const [k, v] of Object.entries(SANDBOX)) vi.stubEnv(k, v);
      vi.stubEnv("QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN", TOKEN);
    };
    const req = (body: string, signature: string | null) =>
      new Request("http://localhost/api/integrations/quickbooks/webhook", { method: "POST", body, headers: { "content-type": "application/json", ...(signature ? { "intuit-signature": signature } : {}) } });

    it("reads the raw body + intuit-signature header: unsigned 401, tampered 401, signed 200, unconfigured 503", async () => {
      const c = await seedConnected();
      const body = JSON.stringify({ eventNotifications: [{ realmId: c.realmId, dataChangeEvent: { entities: [{ name: "Invoice", id: "5", operation: "Create", lastUpdated: "2026-10-10T00:00:00Z" }] } }] });
      const good = createHmac("sha256", TOKEN).update(body).digest("base64");
      expect((await webhookRoute.POST(req(body, good))).status).toBe(503); // nothing configured yet
      stubQbo();
      expect((await webhookRoute.POST(req(body, null))).status).toBe(401);
      expect((await webhookRoute.POST(req(body + " ", good))).status).toBe(401);
      const ok = await webhookRoute.POST(req(body, good));
      expect(ok.status).toBe(200);
      expect(ok.headers.get("cache-control")).toBe("no-store");
      expect(await ok.json()).toEqual({ received: true, hints: 1, duplicates: 0, ignored: 0 });
      expect((await webhookRoute.POST(req(body, good))).status).toBe(200); // redelivery
      expect(await tasksFor(c.t.ws)).toHaveLength(1);
      expect(await db.qboWebhookEvent.count({ where: { realmId: c.realmId } })).toBe(1);
    });
  });
});
