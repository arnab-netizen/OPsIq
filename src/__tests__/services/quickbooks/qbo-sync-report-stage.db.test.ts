/**
 * QuickBooks READ-ONLY sync — report-stage restart (RC1) and unseen-record verification progress (RC12), real PostgreSQL.
 *
 * RC1: when every entity is exhausted under a logical sync's fixed cutoff and the REPORT stage then fails, the durable watermarks stay
 * where they were (they advance only on full success) AND the exhausted sync must not stay resumable forever, or entity reads would be
 * pinned to that old cutoff. Permanent / repeating causes restart as a FRESH logical sync (new syncId + cutoff).
 * RC12: records already verification-attempted in THIS logical sync are not selected again, so reconciliation terminates.
 * Requires TEST_WITH_DB=true and a migrated PostgreSQL. Self-skips otherwise.
 */
import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { runQboReadSync, type RunQboSyncInput } from "@/services/quickbooks/qbo-sync.service";
import { seedConnected, testDeps, scopeOf, ownedQboTasks, type ConnectedTenant } from "@/__tests__/test-helpers/qbo-db-fixtures";
import { customer, invoice } from "@/__tests__/test-helpers/qbo-fake-intuit";
import { QBO_SYNC_REPORT_STAGE_MAX_RESUMES, parseContinuation, reportStageFailureDisposition } from "@/domain/quickbooks/qbo-sync-model";

const T0 = new Date("2026-10-10T03:00:00Z");
const hour = (n: number) => new Date(T0.getTime() + n * 3_600_000);
const manual = (c: ConnectedTenant, o: Partial<RunQboSyncInput> = {}): RunQboSyncInput => ({ ...scopeOf(c), trigger: "MANUAL", actorId: c.t.actor, requestId: randomUUID(), ...o });
const run = (c: ConnectedTenant, at: Date, extra: Parameters<typeof testDeps>[1] = {}, o: Partial<RunQboSyncInput> = {}) =>
  runQboReadSync(manual(c, o), testDeps(c, { now: () => at, ...extra }));
const stateOf = (c: ConnectedTenant) => db.qboSyncState.findUniqueOrThrow({ where: { connectionId: c.connectionId } });
const cpOf = async (c: ConnectedTenant) => parseContinuation((await stateOf(c)).continuation);
const entityQueries = (c: ConnectedTenant, from = 0) =>
  c.fake.requests.slice(from).filter((r) => r.path.endsWith("/query") && (r.url.searchParams.get("query") ?? "").startsWith("SELECT * FROM"));
const has = (c: ConnectedTenant, id: string) => db.qboSyncedRecord.count({ where: { connectionId: c.connectionId, providerEntityId: id } });
const BAD_REPORT = () => ({ Header: { ReportName: "ProfitAndLoss" }, Rows: "not-a-report" });

const qboTasks = ownedQboTasks();
afterAll(qboTasks.cleanup);

describe("reportStageFailureDisposition (pure policy)", () => {
  it("permanent causes restart at once; transient causes resume until the bound, then restart; terminal causes keep the checkpoint", () => {
    for (const code of ["PROVIDER_MALFORMED", "PROVIDER_REJECTED", "PROVIDER_FORBIDDEN", "PROVIDER_INCOMPLETE"] as const) {
      expect(reportStageFailureDisposition(code, 0)).toEqual({ restart: true, reportFailures: 1 });
    }
    expect(reportStageFailureDisposition("PROVIDER_UNAVAILABLE", 0)).toEqual({ restart: false, reportFailures: 1 });
    expect(reportStageFailureDisposition("PROVIDER_TIMEOUT", QBO_SYNC_REPORT_STAGE_MAX_RESUMES - 2)).toEqual({ restart: false, reportFailures: QBO_SYNC_REPORT_STAGE_MAX_RESUMES - 1 });
    expect(reportStageFailureDisposition("PROVIDER_TIMEOUT", QBO_SYNC_REPORT_STAGE_MAX_RESUMES - 1)).toEqual({ restart: true, reportFailures: QBO_SYNC_REPORT_STAGE_MAX_RESUMES });
    expect(reportStageFailureDisposition("REAUTH_REQUIRED", 0)).toEqual({ restart: false, reportFailures: 0 });
  });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("RC1 report-stage failure never freezes entity reads at an old cutoff (real Postgres)", () => {
  async function seeded(): Promise<ConnectedTenant> {
    const c = await seedConnected();
    for (let i = 1; i <= 3; i++) c.fake.data.Customer.push(customer(`c${i}`, `2026-09-1${i}T10:00:00Z`));
    c.fake.data.Invoice.push(invoice("i1", "2026-09-12T10:00:00Z"));
    return c;
  }

  it("MALFORMED report: entities complete, watermark unchanged, next attempt is a FRESH logical sync that re-reads entities and sees a post-cutoff change; a later good report succeeds and advances the watermark", async () => {
    const c = await seeded();
    c.fake.reports.ProfitAndLoss = BAD_REPORT;

    const a = await run(c, hour(0));
    expect(a).toMatchObject({ status: "FAILED", code: "PROVIDER_MALFORMED" });
    const s1 = await stateOf(c);
    expect(s1.watermarks).toEqual({});
    const cp1 = await cpOf(c);
    expect(cp1).toMatchObject({ restart: true, entityIndex: 3 });

    // An entity changes AFTER the failed logical sync's cutoff.
    c.fake.data.Customer.push(customer("late", new Date(hour(0).getTime() + 600_000).toISOString()));
    expect(await has(c, "late")).toBe(0);

    const mark = c.fake.requests.length;
    const b = await run(c, hour(1));
    expect(b).toMatchObject({ status: "FAILED", code: "PROVIDER_MALFORMED" });
    const cp2 = await cpOf(c);
    expect(cp2?.syncId).not.toBe(cp1?.syncId);
    expect(cp2?.cutoff).not.toBe(cp1?.cutoff);
    expect(entityQueries(c, mark).length).toBeGreaterThan(0); // entities were enumerated again, not skipped
    expect(await has(c, "late")).toBe(1); // the post-cutoff change was observed by the fresh sync
    expect((await stateOf(c)).watermarks).toEqual({}); // still no watermark: nothing has fully succeeded

    // Several more eligible attempts: each one restarts, none is pinned to an old cutoff.
    const seenCutoffs = new Set<string | undefined>([cp1?.cutoff, cp2?.cutoff]);
    for (let n = 2; n <= 4; n++) {
      expect((await run(c, hour(n))).status).toBe("FAILED");
      seenCutoffs.add((await cpOf(c))?.cutoff);
    }
    expect(seenCutoffs.size).toBe(5); // attempts at hour 0..4, each with its own fresh cutoff

    // The report recovers: the complete logical sync succeeds and ONLY now do the watermarks advance, to that sync's cutoff.
    delete c.fake.reports.ProfitAndLoss;
    const ok = await run(c, hour(9));
    expect(ok.status).toBe("SUCCEEDED");
    const done = await stateOf(c);
    const cutoff = new Date(hour(9).getTime()).toISOString();
    expect(done.watermarks).toMatchObject({ Customer: cutoff, Invoice: cutoff, Bill: cutoff });
    expect(done.continuation).toBeNull();
  });

  it("FORBIDDEN report: same invariant (watermark unchanged, fresh logical sync on the next attempt)", async () => {
    const c = await seeded();
    c.fake.inject("reports/ProfitAndLoss", { status: 403 });
    const a = await run(c, hour(0));
    expect(a).toMatchObject({ status: "FAILED", code: "PROVIDER_FORBIDDEN" });
    expect((await stateOf(c)).watermarks).toEqual({});
    const cp1 = await cpOf(c);
    expect(cp1?.restart).toBe(true);
    const b = await run(c, hour(1)); // the 403 was consumed: the report now succeeds
    expect(b.status).toBe("SUCCEEDED");
    expect((await stateOf(c)).watermarks).toMatchObject({ Customer: hour(1).toISOString() });
  });

  it("REJECTED report (HTTP 400 without a recognised fault): same invariant", async () => {
    const c = await seeded();
    c.fake.inject("reports/ProfitAndLoss", { status: 400, body: { Fault: { Error: [{ code: "2020" }], type: "ValidationFault" } } });
    const a = await run(c, hour(0));
    expect(a).toMatchObject({ status: "FAILED", code: "PROVIDER_REJECTED" });
    expect((await cpOf(c))?.restart).toBe(true);
    expect((await stateOf(c)).watermarks).toEqual({});
    expect((await run(c, hour(1))).status).toBe("SUCCEEDED");
  });

  it("TRANSIENT report failure: resumes (reports only, entities not re-read, same syncId) up to the bound, then restarts as a fresh logical sync", async () => {
    const c = await seeded();
    const five00 = () => { for (let i = 0; i < 4; i++) c.fake.inject("reports/ProfitAndLoss", { status: 500 }); }; // 1 call + 3 client retries
    five00();
    const a = await run(c, hour(0));
    expect(a).toMatchObject({ status: "FAILED", code: "PROVIDER_UNAVAILABLE" });
    const cp1 = await cpOf(c);
    expect(cp1).toMatchObject({ restart: false, entityIndex: 3, reportFailures: 1 });

    five00();
    const mark = c.fake.requests.length;
    const b = await run(c, hour(1));
    expect(b).toMatchObject({ status: "FAILED", code: "PROVIDER_UNAVAILABLE" });
    const cp2 = await cpOf(c);
    expect(cp2?.syncId).toBe(cp1?.syncId); // resumed
    expect(entityQueries(c, mark).length).toBe(0); // no entity re-read while resuming the report stage
    expect(cp2).toMatchObject({ restart: false, reportFailures: 2 });

    five00();
    const third = await run(c, hour(2));
    expect(third).toMatchObject({ status: "FAILED", code: "PROVIDER_UNAVAILABLE" });
    const cp3 = await cpOf(c);
    expect(cp3).toMatchObject({ restart: true, reportFailures: QBO_SYNC_REPORT_STAGE_MAX_RESUMES });
    expect((await stateOf(c)).watermarks).toEqual({}); // never advanced

    const mark2 = c.fake.requests.length;
    const fresh = await run(c, hour(3)); // injected failures consumed -> everything succeeds
    expect(fresh.status).toBe("SUCCEEDED");
    expect(entityQueries(c, mark2).length).toBeGreaterThan(0); // a fresh logical sync re-read the entities
  });

  it("a transient report failure followed by a good attempt resumes and completes without re-reading entities", async () => {
    const c = await seeded();
    for (let i = 0; i < 4; i++) c.fake.inject("reports/ProfitAndLoss", { status: 503 });
    expect((await run(c, hour(0))).status).toBe("FAILED");
    const mark = c.fake.requests.length;
    const ok = await run(c, hour(1));
    expect(ok.status).toBe("SUCCEEDED");
    expect(entityQueries(c, mark).length).toBe(0);
    // The watermark is the cutoff of the logical sync that STARTED at hour(0): the sync spanned both attempts.
    expect((await stateOf(c)).watermarks).toMatchObject({ Customer: hour(0).toISOString() });
  });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("RC12 unseen-record verification terminates and never reads an id twice in one logical sync (real Postgres)", () => {
  it("150 unresolved ids, a tiny wall-clock deadline and a slow provider: bounded forward progress, completion, no false deletion", async () => {
    const c = await seedConnected();
    for (let i = 1; i <= 150; i++) c.fake.data.Customer.push(customer(`u${String(i).padStart(3, "0")}`, new Date(Date.UTC(2026, 8, 1) + i * 1000).toISOString()));
    expect((await run(c, hour(0))).status).toBe("SUCCEEDED");
    expect(await db.qboSyncedRecord.count({ where: { connectionId: c.connectionId, entityType: "Customer" } })).toBe(150);

    // Every one of the 150 is now unresolvable at Intuit (query omits them, a read by id answers fault 610).
    c.fake.data.Customer.length = 0;
    const realFetch = c.fake.fetchImpl;
    const slow = async (input: string, init?: RequestInit) => {
      if (/\/customer\/u\d+$/.test(new URL(input).pathname)) await new Promise((r) => setTimeout(r, 6));
      return realFetch(input, init);
    };

    const byIdReads = () => c.fake.requests.filter((r) => /\/customer\/u\d+$/.test(r.path)).length;
    let executions = 0;
    let last: Awaited<ReturnType<typeof run>> | null = null;
    let prevReads = 0;
    for (; executions < 120; executions++) {
      last = await run(c, new Date(hour(1).getTime() + executions * 1000), { deadlineMs: 300, fetchImpl: slow }, { modeOverride: "FULL" });
      if (last.status === "SUCCEEDED") break;
      expect(last.status).toBe("CONTINUING");
      const reads = byIdReads();
      expect(reads).toBeGreaterThan(prevReads); // every execution makes forward progress
      expect(reads - prevReads).toBeLessThan(150); // ...within its own bound, not the whole set at once
      prevReads = reads;
    }
    expect(last?.status).toBe("SUCCEEDED");
    expect(executions).toBeGreaterThan(1); // the deadline really forced continuation
    expect(executions).toBeLessThan(120);

    // Each id was read exactly ONCE in this logical sync (attempted ids were not selected again).
    const perId = new Map<string, number>();
    for (const r of c.fake.requests) { const m = /\/customer\/(u\d+)$/.exec(r.path); if (m) perId.set(m[1], (perId.get(m[1]) ?? 0) + 1); }
    expect(perId.size).toBe(150);
    expect([...perId.values()].every((n) => n === 1)).toBe(true);

    // Unresolved rows stay stored and untouched: nothing was deleted or marked.
    expect(await db.qboSyncedRecord.count({ where: { connectionId: c.connectionId, entityType: "Customer" } })).toBe(150);
    const st = await stateOf(c);
    expect(st.lastOutcome).toBe("SUCCEEDED");
    expect(st.continuation).toBeNull();
  }, 120_000);

  it("a record attempted in an EARLIER logical sync is verified again in a later one", async () => {
    const c = await seedConnected();
    c.fake.data.Customer.push(customer("g1", "2026-09-01T10:00:00Z"));
    expect((await run(c, hour(0))).status).toBe("SUCCEEDED");
    c.fake.data.Customer.length = 0;
    for (let n = 1; n <= 2; n++) expect((await run(c, hour(n), {}, { modeOverride: "FULL" })).status).toBe("SUCCEEDED");
    expect(c.fake.requests.filter((r) => /\/customer\/g1$/.test(r.path)).length).toBe(2);
  });
});
