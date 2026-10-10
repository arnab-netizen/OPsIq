/**
 * Intuit webhook receiver (event hints only) — real PostgreSQL. No Intuit configuration is touched; payloads are
 * generated and signed locally with a test verifier token. Requires TEST_WITH_DB=true. Self-skips otherwise.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createHmac } from "node:crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { handleQboWebhook } from "@/services/quickbooks/qbo-webhook.service";
import { QBO_TEST_ENV, seedConnected, type ConnectedTenant } from "@/__tests__/test-helpers/qbo-db-fixtures";

const TOKEN = "test-verifier-token-0123456789";
const ENV = { ...QBO_TEST_ENV("sandbox"), QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN: TOKEN };
const sign = (body: string, token = TOKEN) => createHmac("sha256", token).update(body).digest("base64");
const legacy = (realmId: string, entities: unknown[]) => JSON.stringify({ eventNotifications: [{ realmId, dataChangeEvent: { entities } }] });
const ent = (id: string, o: Record<string, unknown> = {}) => ({ name: "Invoice", id, operation: "Update", lastUpdated: "2026-10-10T00:00:00Z", ...o });
const NOW = new Date("2026-10-10T03:07:00Z");

function recorder() {
  const keys = new Set<string>();
  const calls: Array<{ workspaceId: string; connectionId: string; idempotencyKey: string }> = [];
  return { calls, enqueue: async (t: { workspaceId: string; connectionId: string; idempotencyKey: string }) => { calls.push(t); const created = !keys.has(t.idempotencyKey); keys.add(t.idempotencyKey); return created; } };
}
const deliver = (body: string, o: { signature?: string | null; env?: Record<string, string | undefined>; enqueue?: ReturnType<typeof recorder>["enqueue"]; declaredLength?: number | null } = {}) =>
  handleQboWebhook(
    { rawBody: new TextEncoder().encode(body), signature: o.signature === undefined ? sign(body) : o.signature, declaredLength: o.declaredLength ?? null },
    { env: o.env ?? ENV, now: () => NOW, enqueue: o.enqueue ?? recorder().enqueue },
  );

describe.skipIf(!SHOULD_RUN_DB_TESTS)("QBO webhook receiver (real Postgres)", () => {
  // These tests create durable qbo-read-sync ScheduledTasks. Left pending they would be claimed by the scheduler suites that
  // run processDue() over the whole table later in the same database, so they are removed when this file is done.
  afterAll(async () => { await db.scheduledTask.deleteMany({ where: { taskName: "qbo-read-sync" } }); });

  let A: ConnectedTenant;
  let B: ConnectedTenant;
  beforeAll(async () => { A = await seedConnected(); B = await seedConnected(); });

  it("fails closed when the verifier token or QuickBooks configuration is missing", async () => {
    const body = legacy(A.realmId, [ent("1")]);
    expect(await deliver(body, { env: QBO_TEST_ENV("sandbox") })).toEqual({ httpStatus: 503, body: { error: "NOT_CONFIGURED" } });
    expect(await deliver(body, { env: { QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN: TOKEN } })).toEqual({ httpStatus: 503, body: { error: "NOT_CONFIGURED" } });
  });

  it("an invalid, missing or wrong-token signature is 401 and NOTHING is parsed, recorded or scheduled", async () => {
    const rec = recorder();
    const body = legacy(A.realmId, [ent("1")]);
    for (const signature of [null, "", "AAAA", sign(body, "some-other-verifier-token-xx"), sign(body + " ")]) {
      expect(await deliver(body, { signature, enqueue: rec.enqueue })).toEqual({ httpStatus: 401, body: { error: "UNAUTHORIZED" } });
    }
    // A forged body with a signature for a different body.
    expect((await deliver(legacy(A.realmId, [ent("2")]), { signature: sign(body), enqueue: rec.enqueue })).httpStatus).toBe(401);
    expect(rec.calls).toHaveLength(0);
    expect(await db.qboWebhookEvent.count({ where: { realmId: A.realmId } })).toBe(0);
    // Even an unparsable body is 401 before any parsing when unsigned.
    expect((await deliver("<not json>", { signature: null })).httpStatus).toBe(401);
  });

  it("a valid delivery for a known realm records the hint, flags the sync state and schedules ONE read-only sync — and writes no financial data", async () => {
    const rec = recorder();
    const body = legacy(A.realmId, [ent("1"), ent("2", { name: "Customer" })]);
    const res = await deliver(body, { enqueue: rec.enqueue });
    expect(res).toEqual({ httpStatus: 200, body: { received: true, hints: 2, duplicates: 0, ignored: 0 } });
    expect(rec.calls).toEqual([{ workspaceId: A.t.ws, connectionId: A.connectionId, idempotencyKey: expect.stringMatching(/^qbo-read-sync:webhook:.+:0:\d+$/) }]);
    const rows = await db.qboWebhookEvent.findMany({ where: { realmId: A.realmId } });
    expect(rows).toHaveLength(2);
    expect(rows.every((r: { disposition: string; workspaceId: string; businessId: string; connectionId: string }) => r.disposition === "HINT_RECORDED" && r.workspaceId === A.t.ws && r.businessId === A.t.biz && r.connectionId === A.connectionId)).toBe(true);
    expect((await db.qboSyncState.findUniqueOrThrow({ where: { connectionId: A.connectionId } })).webhookHintAt?.toISOString()).toBe(NOW.toISOString());
    // The webhook is a hint: no mirrored records, no observations, no runs.
    expect(await db.qboSyncedRecord.count({ where: { connectionId: A.connectionId } })).toBe(0);
    expect(await db.qboReportObservation.count({ where: { connectionId: A.connectionId } })).toBe(0);
    expect(await db.qboSyncRun.count({ where: { connectionId: A.connectionId } })).toBe(0);
    const audit = await db.auditEvent.findMany({ where: { workspaceId: A.t.ws, eventName: "qbo.webhook_hint_recorded" } });
    expect(audit).toHaveLength(1);
    expect(audit[0].payload).toMatchObject({ businessId: A.t.biz, events: 2, syncEnqueued: true });
    expect(JSON.stringify(audit)).not.toContain(A.realmId);
  });

  it("duplicate deliveries (at-least-once) are absorbed: no second hint, no second task", async () => {
    const rec = recorder();
    const body = legacy(A.realmId, [ent("1"), ent("2", { name: "Customer" })]);
    const res = await deliver(body, { enqueue: rec.enqueue });
    expect(res).toEqual({ httpStatus: 200, body: { received: true, hints: 0, duplicates: 2, ignored: 0 } });
    expect(rec.calls).toHaveLength(0);
    expect(await db.qboWebhookEvent.count({ where: { realmId: A.realmId } })).toBe(2);
  });

  it("out-of-order events are all recorded, never regress anything, and still coalesce into one task per bucket", async () => {
    const rec = recorder();
    const newer = ent("7", { lastUpdated: "2026-10-10T02:59:00Z" });
    const older = ent("7", { lastUpdated: "2026-10-10T02:00:00Z" });
    const a = await deliver(legacy(A.realmId, [newer]), { enqueue: rec.enqueue });
    const b = await deliver(legacy(A.realmId, [older]), { enqueue: rec.enqueue });
    expect([a.body, b.body].map((x) => (x as { hints: number }).hints)).toEqual([1, 1]);
    expect(rec.calls).toHaveLength(2);
    expect(new Set(rec.calls.map((c) => c.idempotencyKey)).size).toBe(1); // same lease epoch -> the scheduler coalesces them
  });

  it("a delivery that crashed after recording the hint but before serving it is finished by the redelivery (a hint is never lost)", async () => {
    const c = await seedConnected();
    const body = legacy(c.realmId, [ent("321")]);
    const failing = async () => { throw new Error("scheduler down"); };
    await expect(deliver(body, { enqueue: failing })).rejects.toThrow("scheduler down");
    const stuck = await db.qboWebhookEvent.findFirstOrThrow({ where: { realmId: c.realmId } });
    expect(stuck).toMatchObject({ disposition: "HINT_RECORDED", processedAt: null });
    const rec = recorder();
    const again = await deliver(body, { enqueue: rec.enqueue });
    expect(again.body).toMatchObject({ hints: 1, duplicates: 0 });
    expect(rec.calls).toHaveLength(1);
    expect((await db.qboWebhookEvent.findFirstOrThrow({ where: { realmId: c.realmId } })).processedAt).not.toBeNull();
    // Now it is a plain duplicate.
    expect((await deliver(body, { enqueue: rec.enqueue })).body).toMatchObject({ hints: 0, duplicates: 1 });
    expect(rec.calls).toHaveLength(1);
  });

  it("tenant isolation: a realm resolves only to its own connection; one tenant's event never touches another's state", async () => {
    const rec = recorder();
    const beforeB = await db.qboSyncState.findUnique({ where: { connectionId: B.connectionId } });
    await deliver(legacy(A.realmId, [ent("55")]), { enqueue: rec.enqueue });
    expect(rec.calls.every((c) => c.workspaceId === A.t.ws && c.connectionId === A.connectionId)).toBe(true);
    expect(await db.qboSyncState.findUnique({ where: { connectionId: B.connectionId } })).toEqual(beforeB);
    const rows = await db.qboWebhookEvent.findMany({ where: { realmId: B.realmId } });
    expect(rows).toHaveLength(0);
    // The payload cannot name a workspace or business: even if it tries, nothing is read from it.
    const sneaky = JSON.stringify({ eventNotifications: [{ realmId: A.realmId, workspaceId: B.t.ws, businessId: B.t.biz, dataChangeEvent: { entities: [{ ...ent("56"), workspaceId: B.t.ws }] } }] });
    const rec2 = recorder();
    await deliver(sneaky, { enqueue: rec2.enqueue });
    expect(rec2.calls.every((c) => c.workspaceId === A.t.ws)).toBe(true);
  });

  it("an unknown realm is counted as ignored and schedules NOTHING; the ledger does not grow for it", async () => {
    const rec = recorder();
    const unknownRealm = `9${String(Date.now())}${Math.floor(Math.random() * 1e4)}`;
    const res = await deliver(legacy(unknownRealm, [ent("1"), ent("2")]), { enqueue: rec.enqueue });
    expect(res).toEqual({ httpStatus: 200, body: { received: true, hints: 0, duplicates: 0, ignored: 2 } });
    expect(rec.calls).toHaveLength(0);
    expect(await db.qboWebhookEvent.count({ where: { realmId: unknownRealm } })).toBe(0);
  });

  it("a non-ACTIVE connection's events are ignored (counted, not stored); a production realm is unknown to a sandbox deployment", async () => {
    const reauth = await seedConnected();
    await db.qboConnection.update({ where: { id: reauth.connectionId }, data: { status: "REAUTH_REQUIRED", reauthRequiredAt: new Date() } });
    const prod = await seedConnected({ environment: "production" });
    const rec = recorder();
    expect((await deliver(legacy(reauth.realmId, [ent("1")]), { enqueue: rec.enqueue })).body).toMatchObject({ hints: 0, ignored: 1 });
    expect((await deliver(legacy(prod.realmId, [ent("1")]), { enqueue: rec.enqueue })).body).toMatchObject({ hints: 0, ignored: 1 });
    expect(rec.calls).toHaveLength(0);
    expect(await db.qboWebhookEvent.count({ where: { realmId: { in: [reauth.realmId, prod.realmId] } } })).toBe(0);
    expect(await db.qboSyncState.count({ where: { connectionId: { in: [reauth.connectionId, prod.connectionId] } } })).toBe(0);
  });

  it("an event with no provider id and no time is keyed by its receive window: a later identical change is not swallowed forever", async () => {
    const c = await seedConnected();
    const body = legacy(c.realmId, [{ name: "Invoice", id: "77", operation: "Update" }]);
    const at = (ms: number) => ({ env: ENV, now: () => new Date(NOW.getTime() + ms), enqueue: recorder().enqueue });
    const post = (ms: number) => handleQboWebhook({ rawBody: new TextEncoder().encode(body), signature: sign(body), declaredLength: null }, at(ms));
    expect((await post(0)).body).toMatchObject({ hints: 1 });
    expect((await post(60_000)).body).toMatchObject({ hints: 0, duplicates: 1 }); // redelivery in the same window
    expect((await post(40 * 60_000)).body).toMatchObject({ hints: 1 }); // a genuinely later change
  });

  it("a hint that arrives after a sync has started gets a NEW task (the task key carries the lease epoch)", async () => {
    const c = await seedConnected();
    const rec = recorder();
    await deliver(legacy(c.realmId, [ent("1")]), { enqueue: rec.enqueue });
    // A sync takes the lease (epoch 0 -> 1) and completes; a later hint must not be swallowed by the earlier task.
    await db.qboSyncState.update({ where: { connectionId: c.connectionId }, data: { leaseEpoch: 1 } });
    await deliver(legacy(c.realmId, [ent("2")]), { enqueue: rec.enqueue });
    expect(rec.calls.map((x) => x.idempotencyKey.split(":").slice(-2)[0])).toEqual(["0", "1"]);
  });

  it("unsupported entities are ignored without a ledger row; malformed events are counted and dropped", async () => {
    const rec = recorder();
    const res = await deliver(legacy(A.realmId, [ent("1", { name: "Employee" }), { name: "Invoice" }, ent("88")]), { enqueue: rec.enqueue });
    expect(res.body).toMatchObject({ received: true, hints: 1, ignored: 2 });
    expect(await db.qboWebhookEvent.count({ where: { entityName: "Employee" } })).toBe(0);
  });

  it("CloudEvents deliveries work the same way", async () => {
    const rec = recorder();
    const body = JSON.stringify([{ specversion: "1.0", id: "ce-1", source: "intuit.qbo", type: "qbo.bill.updated.v1", time: "2026-10-10T02:00:00Z", intuitentityid: "31", intuitaccountid: A.realmId, data: {} }]);
    expect((await deliver(body, { enqueue: rec.enqueue })).body).toMatchObject({ hints: 1 });
    expect((await deliver(body, { enqueue: rec.enqueue })).body).toMatchObject({ hints: 0, duplicates: 1 });
    expect(await db.qboWebhookEvent.count({ where: { realmId: A.realmId, format: "CLOUDEVENTS" } })).toBe(1);
  });

  it("bad bodies: signed-but-malformed is 400, oversized is 413 (checked before the signature)", async () => {
    expect((await deliver("not json")).httpStatus).toBe(400);
    expect((await deliver(JSON.stringify({ hello: 1 }))).httpStatus).toBe(400);
    expect((await deliver("{}", { declaredLength: 2 * 1024 * 1024 })).httpStatus).toBe(413);
    expect((await deliver("x".repeat(1024 * 1024 + 1))).httpStatus).toBe(413);
  });

  it("the default enqueue is a durable, idempotent ScheduledTask carrying only the connection id", async () => {
    const fresh = await seedConnected();
    const body = legacy(fresh.realmId, [ent("1")]);
    await handleQboWebhook({ rawBody: new TextEncoder().encode(body), signature: sign(body), declaredLength: null }, { env: ENV, now: () => NOW });
    const body2 = legacy(fresh.realmId, [ent("2")]);
    await handleQboWebhook({ rawBody: new TextEncoder().encode(body2), signature: sign(body2), declaredLength: null }, { env: ENV, now: () => new Date(NOW.getTime() + 60_000) });
    const tasks = await db.scheduledTask.findMany({ where: { workspaceId: fresh.t.ws } });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ taskName: "qbo-read-sync", workspaceId: fresh.t.ws });
    expect(JSON.parse(typeof tasks[0].payload === "string" ? tasks[0].payload : JSON.stringify(tasks[0].payload))).toEqual({ connectionId: fresh.connectionId, trigger: "WEBHOOK" });
  });

  it("the webhook path never touches the network or Intuit", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    await deliver(legacy(A.realmId, [ent("900")]));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
