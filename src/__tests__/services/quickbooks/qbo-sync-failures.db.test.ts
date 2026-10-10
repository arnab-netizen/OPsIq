/**
 * QuickBooks sync failure matrix — real PostgreSQL, fake Intuit. Every provider failure ends as a closed, sanitized code,
 * releases the lease, applies bounded back-off, and writes nothing half-way.
 * Requires TEST_WITH_DB=true. Self-skips otherwise.
 */
import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { runQboReadSync } from "@/services/quickbooks/qbo-sync.service";
import { QboRealmRateLimiter } from "@/services/quickbooks/qbo-rate-limiter";
import { seedConnected, testDeps, scopeOf, type ConnectedTenant } from "@/__tests__/test-helpers/qbo-db-fixtures";
import { customer } from "@/__tests__/test-helpers/qbo-fake-intuit";

const NOW = new Date("2026-10-10T03:00:00Z");
const H = 3_600_000;
const run = (c: ConnectedTenant, extra = {}) => runQboReadSync({ ...scopeOf(c), trigger: "MANUAL", actorId: c.t.actor, requestId: randomUUID() }, testDeps(c, { now: () => NOW, ...extra }));
const info = (c: ConnectedTenant) => `companyinfo/${c.realmId}`;
/** Limiter stub: never delays, records every realm-wide penalty so tests can prove a 429 penalizes the realm. */
function stubLimiter() {
  const penalties: number[] = [];
  const limiter = { acquire: async () => ({ release: () => undefined }), penalize: (_realm: string, ms: number) => { penalties.push(ms); } } as unknown as QboRealmRateLimiter;
  return { limiter, penalties };
}
const SECRET_TEXT = "SECRET-PROVIDER-TEXT-do-not-store";

async function expectClean(c: ConnectedTenant, code: string, nextMs: number | null) {
  const state = await db.qboSyncState.findUniqueOrThrow({ where: { connectionId: c.connectionId } });
  expect(state).toMatchObject({ leaseToken: null, leaseRunId: null, leaseExpiresAt: null, lastOutcome: "FAILED", lastErrorCode: code, consecutiveFailures: 1 });
  expect(state.nextAttemptNotBefore?.getTime() ?? null).toBe(nextMs === null ? null : NOW.getTime() + nextMs);
  const runRow = await db.qboSyncRun.findFirstOrThrow({ where: { connectionId: c.connectionId } });
  expect(runRow).toMatchObject({ status: "FAILED", errorCode: code });
  expect(runRow.finishedAt).not.toBeNull();
  const everything = JSON.stringify([state, runRow, await db.auditEvent.findMany({ where: { workspaceId: c.t.ws, eventName: { startsWith: "qbo.sync" } } })]);
  expect(everything).not.toContain(SECRET_TEXT);
  expect(everything).not.toMatch(/ACCESS-|REFRESH-|csecret/);
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("QBO sync failure matrix (real Postgres)", () => {
  it("HTTP 403 is PROVIDER_FORBIDDEN: not retried, owner action, persistent 6h back-off", async () => {
    const c = await seedConnected();
    c.fake.inject(info(c), { status: 403, body: { Fault: { Error: [{ code: "403", Message: SECRET_TEXT }] } } });
    const out = await run(c);
    expect(out).toMatchObject({ status: "FAILED", code: "PROVIDER_FORBIDDEN", terminal: false });
    expect(c.fake.requests.filter((r) => r.path.endsWith(info(c)))).toHaveLength(1);
    await expectClean(c, "PROVIDER_FORBIDDEN", 6 * H);
  });

  it("HTTP 429 with Retry-After is retried inside the client's budget and the run then succeeds", async () => {
    const c = await seedConnected();
    c.fake.data.Customer.push(customer("1", "2026-09-01T00:00:00Z"));
    c.fake.inject("query", { status: 429, headers: { "retry-after": "2" } }, { status: 429, headers: { "retry-after": "2" } });
    const sleeps: number[] = [];
    const { limiter, penalties } = stubLimiter();
    const out = await run(c, { sleep: async (ms: number) => { sleeps.push(ms); }, limiter });
    expect(out.status).toBe("SUCCEEDED");
    expect(sleeps.length).toBe(2);
    expect(sleeps.every((ms) => ms >= 2000)).toBe(true); // Retry-After honoured
    expect(penalties).toEqual([2000, 2000]); // the whole realm is penalized, not just this request
  });

  it("persistent 429 ends as PROVIDER_RATE_LIMITED whose back-off honours Retry-After (capped at 6h)", async () => {
    const c = await seedConnected();
    c.fake.inject(info(c), ...Array.from({ length: 4 }, () => ({ status: 429, headers: { "retry-after": "7200" } })));
    const out = await run(c, { limiter: stubLimiter().limiter });
    expect(out).toMatchObject({ status: "FAILED", code: "PROVIDER_RATE_LIMITED", terminal: false });
    await expectClean(c, "PROVIDER_RATE_LIMITED", 2 * H);
  });

  it("HTTP 5xx and network loss exhaust the retry budget and back off 15 minutes", async () => {
    const five = await seedConnected();
    five.fake.inject(info(five), ...Array.from({ length: 4 }, () => ({ status: 503, body: { Fault: { Error: [{ Message: SECRET_TEXT }] } } })));
    expect(await run(five)).toMatchObject({ status: "FAILED", code: "PROVIDER_UNAVAILABLE" });
    expect(five.fake.requests.filter((r) => r.path.endsWith(info(five)))).toHaveLength(4);
    await expectClean(five, "PROVIDER_UNAVAILABLE", 15 * 60_000);

    const net = await seedConnected();
    net.fake.inject(info(net), "NETWORK", "NETWORK", "NETWORK", "NETWORK");
    expect(await run(net)).toMatchObject({ status: "FAILED", code: "PROVIDER_UNAVAILABLE" });
    await expectClean(net, "PROVIDER_UNAVAILABLE", 15 * 60_000);
  });

  it("a request timeout is PROVIDER_TIMEOUT", async () => {
    const c = await seedConnected();
    c.fake.inject(info(c), "TIMEOUT");
    const out = await run(c, { clientOptions: { timeoutMs: 25, maxRetries: 0 } });
    expect(out).toMatchObject({ status: "FAILED", code: "PROVIDER_TIMEOUT" });
    await expectClean(c, "PROVIDER_TIMEOUT", 15 * 60_000);
  });

  it("malformed provider responses (non-JSON body, wrong shape) are PROVIDER_MALFORMED with a 6h back-off and write nothing", async () => {
    const html = await seedConnected();
    html.fake.inject(info(html), "MALFORMED_JSON");
    expect(await run(html)).toMatchObject({ status: "FAILED", code: "PROVIDER_MALFORMED" });
    await expectClean(html, "PROVIDER_MALFORMED", 6 * H);
    expect(await db.qboSyncedRecord.count({ where: { connectionId: html.connectionId } })).toBe(0);

    const shape = await seedConnected();
    shape.fake.inject("query", { status: 200, body: { QueryResponse: { Customer: "not-an-array" } } });
    expect(await run(shape)).toMatchObject({ status: "FAILED", code: "PROVIDER_MALFORMED" });
  });

  it("a 400 from the query endpoint is PROVIDER_REJECTED (OpsIQ asked something Intuit refused)", async () => {
    const c = await seedConnected();
    c.fake.inject("query", { status: 400, body: { Fault: { Error: [{ code: "4000", Message: SECRET_TEXT }] } } });
    const out = await run(c);
    expect(out).toMatchObject({ status: "FAILED", code: "PROVIDER_REJECTED" });
    await expectClean(c, "PROVIDER_REJECTED", 6 * H);
  });

  it("cancellation (lost scheduler lease / shutdown) stops the run with CANCELLED and releases the sync lease", async () => {
    const c = await seedConnected();
    const ac = new AbortController();
    ac.abort();
    const out = await run(c, { signal: ac.signal });
    expect(out).toMatchObject({ status: "FAILED", code: "CANCELLED" });
    expect(c.fake.accountingRequests()).toHaveLength(0);
    expect(await db.qboSyncState.findUniqueOrThrow({ where: { connectionId: c.connectionId } })).toMatchObject({ leaseToken: null, lastErrorCode: "CANCELLED" });
  });

  it("back-off grows with consecutive failures and resets after a success; the ceiling is bounded", async () => {
    const c = await seedConnected();
    const t = (n: number) => new Date(NOW.getTime() + n * 7 * H); // > the 6h ceiling apart, well inside the refresh-token lifetime
    const expected = [15, 30, 60, 120, 240, 360, 360].map((m) => m * 60_000);
    for (let i = 0; i < expected.length; i++) {
      c.fake.inject(info(c), ...Array.from({ length: 4 }, () => ({ status: 503 })));
      await runQboReadSync({ ...scopeOf(c), trigger: "MANUAL", actorId: c.t.actor, requestId: randomUUID() }, testDeps(c, { now: () => t(i) }));
      const s = await db.qboSyncState.findUniqueOrThrow({ where: { connectionId: c.connectionId } });
      expect(s.consecutiveFailures).toBe(i + 1);
      expect((s.nextAttemptNotBefore as Date).getTime() - t(i).getTime()).toBe(expected[i]);
    }
    const recovered = await run(c, { now: () => t(20) });
    expect(recovered).toMatchObject({ status: "SUCCEEDED" });
    expect(await db.qboSyncState.findUniqueOrThrow({ where: { connectionId: c.connectionId } })).toMatchObject({ consecutiveFailures: 0, nextAttemptNotBefore: null, lastErrorCode: null });
  });
});
