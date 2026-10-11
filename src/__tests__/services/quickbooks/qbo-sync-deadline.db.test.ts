/**
 * QuickBooks READ-ONLY sync — ONE invocation-level deadline (RC3), real PostgreSQL, fake Intuit.
 * The soft deadline and the hard abort are measured from the START of the invocation (token acquisition included) and the same abort
 * signal reaches the token claim wait, the token refresh, the forced refresh after a 401, entity/count/by-id reads and reports.
 * The grace is injectable (`hardAbortGraceMs`), so nothing here waits for the production 30 s.
 * Requires TEST_WITH_DB=true and a migrated PostgreSQL. Self-skips otherwise.
 */
import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { runQboReadSync, softDeadlineAt, type RunQboSyncInput } from "@/services/quickbooks/qbo-sync.service";
import { seedConnected, testDeps, scopeOf, grantOf, ownedQboTasks, type ConnectedTenant } from "@/__tests__/test-helpers/qbo-db-fixtures";
import { customer } from "@/__tests__/test-helpers/qbo-fake-intuit";
import {
  QBO_EXECUTION_DEADLINE_MS, QBO_EXECUTION_FINALIZE_ALLOWANCE_MS, QBO_EXECUTION_HARD_ABORT_GRACE_MS, QBO_EXECUTION_WORST_CASE_MS, parseContinuation,
} from "@/domain/quickbooks/qbo-sync-model";

const T0 = new Date("2026-10-10T03:00:00Z");
const hour = (n: number) => new Date(T0.getTime() + n * 3_600_000);
const manual = (c: ConnectedTenant, o: Partial<RunQboSyncInput> = {}): RunQboSyncInput => ({ ...scopeOf(c), trigger: "MANUAL", actorId: c.t.actor, requestId: randomUUID(), ...o });
const run = (c: ConnectedTenant, at: Date, extra: Parameters<typeof testDeps>[1] = {}, o: Partial<RunQboSyncInput> = {}) =>
  runQboReadSync(manual(c, o), testDeps(c, { now: () => at, ...extra }));
const stateOf = (c: ConnectedTenant) => db.qboSyncState.findUniqueOrThrow({ where: { connectionId: c.connectionId } });
const cpOf = async (c: ConnectedTenant) => parseContinuation((await stateOf(c)).continuation);
/**
 * Short but not racy: the hard abort fires 500 ms after the invocation starts (soft 250 + grace 250), long enough for the few database
 * steps that precede the first provider / token request, short enough that nothing waits for the production 75 s.
 */
const TINY = { deadlineMs: 250, hardAbortGraceMs: 250 } as const;
const ELAPSED_BOUND_MS = 4_000;
const DAY = 86_400_000;
/**
 * Deterministic token clock. The sync runs on the INJECTED clock (`now: () => T0`), so token expiry is expressed relative to T0, never to
 * the wall clock: "expired" is T0 - 1 s (a refresh MUST happen), "valid" is T0 + 30 days (no refresh may happen).
 */
const expiredAtT0 = (tag: string) => ({ ...grantOf({ tag }), accessTokenExpiresAt: new Date(T0.getTime() - 1_000) });
const validAtT0 = (tag: string) => ({ ...grantOf({ tag }), accessTokenExpiresAt: new Date(T0.getTime() + 30 * DAY) });

/** Records every request together with its abort signal, then delegates to the fake Intuit. Proves the intended path was ENTERED and that the in-flight request was really aborted. */
function spyFetch(c: ConnectedTenant) {
  const seen: Array<{ path: string; signal: AbortSignal | null }> = [];
  const fetchImpl = async (input: string, init?: RequestInit) => {
    seen.push({ path: new URL(input).pathname, signal: (init?.signal as AbortSignal | undefined) ?? null });
    return c.fake.fetchImpl(input, init);
  };
  const of = (suffix: string) => seen.filter((r) => r.path.endsWith(suffix));
  return { fetchImpl, seen, of };
}

const qboTasks = ownedQboTasks();

describe("documented bound is derived from the exported constants (no hand-copied numbers)", () => {
  it("worst case = soft deadline + hard-abort grace + finalisation allowance", () => {
    expect(QBO_EXECUTION_WORST_CASE_MS).toBe(QBO_EXECUTION_DEADLINE_MS + QBO_EXECUTION_HARD_ABORT_GRACE_MS + QBO_EXECUTION_FINALIZE_ALLOWANCE_MS);
  });
  it("the cron route's pass arithmetic ends inside maxDuration: drain budget + claims x worst case, and the invocation deadline", () => {
    const src = readFileSync(join(process.cwd(), "src/app/api/internal/cron/scheduler/route.ts"), "utf8");
    const num = (re: RegExp) => Number((re.exec(src)?.[1] ?? "NaN").replace(/_/g, ""));
    const budget = num(/DRAIN_BUDGET_MS\s*=\s*([\d_]+)/);
    const claims = num(/DRAIN_CLAIM_PER_PASS\s*=\s*(\d+)/);
    const maxDurationMs = num(/maxDuration\s*=\s*(\d+)/) * 1000;
    const invocation = num(/INVOCATION_DEADLINE_MS\s*=\s*([\d_]+)/);
    expect(Number.isFinite(budget + claims + maxDurationMs + invocation)).toBe(true);
    expect(budget + claims * QBO_EXECUTION_WORST_CASE_MS).toBeLessThanOrEqual(invocation);
    expect(invocation).toBeLessThan(maxDurationMs);
  });
  it("an outer invocation deadline pulls the soft deadline in so soft + grace + finalisation still ends before it", () => {
    const start = 1_000_000;
    expect(softDeadlineAt({ env: {}, deadlineMs: 45_000 }, start)).toBe(start + 45_000);
    expect(softDeadlineAt({ env: {}, deadlineMs: 45_000, hardAbortGraceMs: 30_000, invocationDeadlineAt: start + 60_000 }, start)).toBe(start + 60_000 - 30_000 - QBO_EXECUTION_FINALIZE_ALLOWANCE_MS);
    expect(softDeadlineAt({ env: {}, deadlineMs: 45_000, invocationDeadlineAt: start + 600_000 }, start)).toBe(start + 45_000);
    expect(softDeadlineAt({ env: {} }, start)).toBeNull();
  });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("invocation-level deadline reaches every provider-work path (real Postgres)", () => {
  // DB-owned cleanup is registered ONLY inside the DB-gated suite: in a non-DB run no hook executes and nothing touches Prisma (a failing cleanup still fails loudly - it is never swallowed).
  afterAll(qboTasks.cleanup);

  it("a STALLED token refresh hits the hard abort: the refresh request WAS made, its signal WAS aborted, the run ends CANCELLED, connection ACTIVE, lease released, nothing partially written", async () => {
    const c = await seedConnected({ grant: expiredAtT0("stall") });
    c.fake.inject("tokens/bearer", "TIMEOUT");
    const spy = spyFetch(c);
    const t = Date.now();
    const out = await run(c, T0, { ...TINY, fetchImpl: spy.fetchImpl });
    expect(Date.now() - t).toBeLessThan(ELAPSED_BOUND_MS);
    expect(spy.of("/tokens/bearer")).toHaveLength(1); // the refresh path was entered (the stored token is expired at T0)
    expect(spy.of("/tokens/bearer")[0].signal?.aborted).toBe(true); // ...and the in-flight request received the abort
    expect(spy.seen.filter((r) => !r.path.endsWith("/tokens/bearer"))).toHaveLength(0); // nothing else ran before the refresh gave up
    expect(out).toMatchObject({ status: "FAILED", code: "CANCELLED" });
    expect((await db.qboConnection.findUniqueOrThrow({ where: { id: c.connectionId } })).status).toBe("ACTIVE");
    const st = await stateOf(c);
    expect(st).toMatchObject({ leaseToken: null, refreshClaimToken: null, lastErrorCode: "CANCELLED" });
    expect(st.continuation).toBeNull(); // no provider data was read: the next attempt starts a fresh logical sync
    expect(await db.qboSyncedRecord.count({ where: { connectionId: c.connectionId } })).toBe(0);
  });

  it("a refresh CLAIM WAIT is cut short by the same deadline: the wait loop WAS entered (sleeps), Intuit was never called, CANCELLED", async () => {
    const c = await seedConnected({ grant: expiredAtT0("wait") });
    await db.qboSyncState.upsert({
      where: { connectionId: c.connectionId },
      update: { refreshClaimToken: randomUUID(), refreshClaimExpiresAt: new Date(T0.getTime() + 60 * DAY) },
      create: { connectionId: c.connectionId, workspaceId: c.t.ws, businessId: c.t.biz, refreshClaimToken: randomUUID(), refreshClaimExpiresAt: new Date(T0.getTime() + 60 * DAY) },
    });
    const spy = spyFetch(c);
    let sleeps = 0;
    const sleep = async () => { sleeps++; await new Promise((r) => setTimeout(r, 5)); }; // a real (tiny) pause: the loop must not spin hot
    const t = Date.now();
    const out = await run(c, T0, { ...TINY, fetchImpl: spy.fetchImpl, sleep });
    expect(Date.now() - t).toBeLessThan(ELAPSED_BOUND_MS); // the real wait would have been 30 s
    expect(sleeps).toBeGreaterThanOrEqual(1); // the claim-wait path was entered
    expect(spy.seen).toHaveLength(0); // the token endpoint and the API were never reached
    expect(out).toMatchObject({ status: "FAILED", code: "CANCELLED" });
    expect((await stateOf(c)).leaseToken).toBeNull();
  });

  it("a HANGING in-flight provider query is aborted (its signal WAS aborted): CANCELLED, lease released, checkpoint intact, and the next execution resumes and succeeds", async () => {
    const c = await seedConnected({ grant: validAtT0("hang") });
    for (let i = 1; i <= 3; i++) c.fake.data.Customer.push(customer(`h${i}`, `2026-09-1${i}T10:00:00Z`));
    c.fake.inject("query", "TIMEOUT");
    const spy = spyFetch(c);
    const t = Date.now();
    const out = await run(c, T0, { ...TINY, fetchImpl: spy.fetchImpl });
    expect(Date.now() - t).toBeLessThan(ELAPSED_BOUND_MS);
    expect(spy.of("/tokens/bearer")).toHaveLength(0); // the token was valid: no refresh path
    const queries = spy.of("/query");
    expect(queries.length).toBeGreaterThanOrEqual(1); // the query path was entered...
    expect(queries[0].signal?.aborted).toBe(true); // ...and the hanging request was aborted
    expect(out).toMatchObject({ status: "FAILED", code: "CANCELLED" });
    const st = await stateOf(c);
    expect(st).toMatchObject({ leaseToken: null, lastErrorCode: "CANCELLED" });
    expect(st.watermarks).toEqual({});
    expect(await cpOf(c)).toMatchObject({ restart: false, entityIndex: 0 }); // resumable, cutoff fixed
    const next = await run(c, hour(1));
    expect(next.status).toBe("SUCCEEDED");
    expect(await db.qboSyncedRecord.count({ where: { connectionId: c.connectionId, entityType: "Customer" } })).toBe(3);
  });

  it("a HANGING by-id verification read is aborted (its signal WAS aborted); the entity is not marked reconciled and the next execution carries on", async () => {
    const c = await seedConnected({ grant: validAtT0("byid") });
    c.fake.data.Customer.push(customer("v1", "2026-09-01T10:00:00Z"));
    expect((await run(c, T0)).status).toBe("SUCCEEDED");
    c.fake.data.Customer.length = 0;
    c.fake.inject("/customer/v1", "TIMEOUT");
    const spy = spyFetch(c);
    const out = await run(c, hour(1), { ...TINY, fetchImpl: spy.fetchImpl }, { modeOverride: "FULL" });
    const byId = spy.of("/customer/v1");
    expect(byId).toHaveLength(1); // the verification path was entered
    expect(byId[0].signal?.aborted).toBe(true);
    expect(out).toMatchObject({ status: "FAILED", code: "CANCELLED" });
    const cp = await cpOf(c);
    expect(cp?.reconciled).not.toContain("Customer");
    expect(cp?.restart).toBe(false);
    expect((await stateOf(c)).leaseToken).toBeNull();
    const again = await run(c, hour(2), {}, { modeOverride: "FULL" });
    expect(again.status).toBe("SUCCEEDED");
    expect(await db.qboSyncedRecord.count({ where: { connectionId: c.connectionId, entityType: "Customer" } })).toBe(1); // unresolved, never deleted
  });

  it("verifyUnseen deadline path: with an already-expired soft deadline each execution advances the checkpoint and verifies at most one candidate, ends CONTINUING, and the sync still completes", async () => {
    const c = await seedConnected({ grant: validAtT0("verify") });
    for (let i = 1; i <= 4; i++) c.fake.data.Customer.push(customer(`p${i}`, `2026-09-0${i}T10:00:00Z`));
    expect((await run(c, T0)).status).toBe("SUCCEEDED");
    c.fake.data.Customer.length = 0;
    const reads = () => c.fake.requests.filter((r) => /\/customer\/p\d$/.test(r.path)).length;
    let prev = 0;
    let prevSeq = -1;
    let last: Awaited<ReturnType<typeof run>> | null = null;
    for (let n = 0; n < 40; n++) {
      last = await run(c, new Date(hour(1).getTime() + n * 1000), { deadlineMs: 0 }, { modeOverride: "FULL" });
      if (last.status === "SUCCEEDED") break;
      expect(last.status).toBe("CONTINUING");
      expect(reads() - prev).toBeLessThanOrEqual(1); // the deadline stops verification after the first candidate
      const seq = (await cpOf(c))?.seq ?? -1;
      expect(reads() > prev || seq > prevSeq).toBe(true); // every execution made forward progress: a candidate verified or the checkpoint advanced
      prev = reads();
      prevSeq = seq;
    }
    expect(last?.status).toBe("SUCCEEDED");
    expect(reads()).toBe(4); // each candidate was read exactly once in this logical sync
  });

  it("the forced refresh after an API 401 obeys the same deadline: the 401 happened, the refresh request WAS made and aborted, CANCELLED, never REAUTH_REQUIRED", async () => {
    const c = await seedConnected({ grant: validAtT0("force") });
    c.fake.validAccessTokens = new Set(["not-the-stored-token"]); // every API call answers 401
    c.fake.inject("tokens/bearer", "TIMEOUT");
    const spy = spyFetch(c);
    const t = Date.now();
    const out = await run(c, T0, { ...TINY, fetchImpl: spy.fetchImpl });
    expect(Date.now() - t).toBeLessThan(ELAPSED_BOUND_MS);
    const order = spy.seen.map((r) => (r.path.endsWith("/tokens/bearer") ? "TOKEN" : "API"));
    expect(order[0]).toBe("API"); // the API rejected the stored token first (401) ...
    expect(order).toContain("TOKEN"); // ... which triggered the forced refresh
    expect(spy.of("/tokens/bearer")[0].signal?.aborted).toBe(true); // the in-flight refresh received the abort
    expect(out).toMatchObject({ status: "FAILED", code: "CANCELLED" });
    expect((await db.qboConnection.findUniqueOrThrow({ where: { id: c.connectionId } })).status).toBe("ACTIVE");
  });

  it("without any deadline configured nothing is aborted (the soft/hard timers exist only when a deadline is given)", async () => {
    const c = await seedConnected({ grant: validAtT0("none") });
    c.fake.data.Customer.push(customer("n1", "2026-09-01T10:00:00Z"));
    expect((await run(c, T0)).status).toBe("SUCCEEDED");
  });
});
