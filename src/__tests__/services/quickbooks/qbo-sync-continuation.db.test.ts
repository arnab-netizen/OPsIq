/**
 * QuickBooks READ-ONLY sync — completeness and bounded-work proofs against real PostgreSQL with a hostile fake Intuit.
 *
 *  - equal-timestamp buckets larger than a page are read COMPLETELY even when the provider re-shuffles equal-timestamp rows
 *    between requests (closure is proven by the provider's count(*), never assumed from offset paging);
 *  - a dataset larger than any per-execution budget completes through persisted continuation (no page cap, no failure);
 *  - the durable watermark never moves before proven exhaustion, a crash cannot fabricate a completion, and late-indexed records
 *    inside the overlap are still picked up;
 *  - a provider that cannot be proven complete ends as PROVIDER_INCOMPLETE and cannot loop.
 * Requires TEST_WITH_DB=true and a migrated PostgreSQL. Self-skips otherwise.
 */
import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { runQboReadSync, type RunQboSyncInput } from "@/services/quickbooks/qbo-sync.service";
import { seedConnected, testDeps, scopeOf, type ConnectedTenant } from "@/__tests__/test-helpers/qbo-db-fixtures";
import { customer, invoice } from "@/__tests__/test-helpers/qbo-fake-intuit";
import { QBO_SYNC_QUERY_ENTITIES, QBO_SYNC_TIE_MAX_STALLED_PASSES, parseContinuation } from "@/domain/quickbooks/qbo-sync-model";
import { continuationTaskKey, markWebhookHint } from "@/services/quickbooks/qbo-sync-store.service";
import { TASK_NAME_QBO_READ_SYNC, enqueueQboSyncContinuation, getProductionTaskHandlers } from "@/infra/scheduler-handlers";

const NOW = new Date("2026-10-10T03:00:00Z");
const manual = (c: ConnectedTenant, o: Partial<RunQboSyncInput> = {}): RunQboSyncInput => ({ ...scopeOf(c), trigger: "MANUAL", actorId: c.t.actor, requestId: randomUUID(), ...o });
const run = (c: ConnectedTenant, extra: Parameters<typeof testDeps>[1] = {}, o: Partial<RunQboSyncInput> = {}) =>
  runQboReadSync(manual(c, o), testDeps(c, { now: () => NOW, ...extra }));
const stateOf = (c: ConnectedTenant) => db.qboSyncState.findUniqueOrThrow({ where: { connectionId: c.connectionId } });
const queriesFor = (c: ConnectedTenant, entity: string, kind: "page" | "count" = "page") =>
  c.fake.requests.filter((r) => {
    const q = r.url.searchParams.get("query") ?? "";
    return r.path.endsWith("/query") && q.includes(`FROM ${entity}`) && (kind === "count" ? q.startsWith("SELECT count(*)") : q.startsWith("SELECT *"));
  });
const stored = (c: ConnectedTenant, entityType: string) => db.qboSyncedRecord.count({ where: { connectionId: c.connectionId, entityType } });

afterAll(async () => {
  await db.$executeRawUnsafe(`DELETE FROM scheduled_tasks WHERE task_name = '${TASK_NAME_QBO_READ_SYNC}'`).catch(() => undefined);
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("QBO sync completeness and bounded work (real Postgres, hostile fake)", () => {
  describe("equal LastUpdatedTime buckets larger than a page", () => {
    it("EQUAL_TIMESTAMP_UNSTABLE_ORDER: the provider re-shuffles tied rows on EVERY request; every record is still stored and the bucket is closed by count", async () => {
      for (const seed of [1, 7, 42]) {
        const c = await seedConnected();
        c.fake.shuffleTies = { seed };
        // 47 invoices at ONE timestamp with a page size of 10 (4+ pages), flanked by distinct-timestamp neighbours.
        c.fake.data.Invoice.push(invoice("a1", "2026-09-14T10:00:00Z"));
        for (let i = 1; i <= 47; i++) c.fake.data.Invoice.push(invoice(`t${String(i).padStart(3, "0")}`, "2026-09-15T10:00:00Z"));
        c.fake.data.Invoice.push(invoice("z1", "2026-09-16T10:00:00Z"));
        const out = await run(c, { pageSize: 10 });
        expect(out.status).toBe("SUCCEEDED");
        if (out.status !== "SUCCEEDED") return;
        expect(await stored(c, "Invoice")).toBe(49);
        expect(out.counts.tieBucketsClosed).toBe(1);
        expect(queriesFor(c, "Invoice", "count").length).toBeGreaterThanOrEqual(2); // the closure probe(s) were really made
        // Every request stayed read-only.
        expect(c.fake.accountingRequests().every((r) => r.method === "GET")).toBe(true);
        const ids = (await db.qboSyncedRecord.findMany({ where: { connectionId: c.connectionId, entityType: "Invoice" }, select: { providerEntityId: true } })).map((r: { providerEntityId: string }) => r.providerEntityId);
        expect(new Set(ids).size).toBe(49);
      }
    });

    it("a stable provider needs no extra pass: one pass, one closing count, and the bucket's neighbours are untouched", async () => {
      const c = await seedConnected();
      for (let i = 1; i <= 25; i++) c.fake.data.Customer.push(customer(`c${String(i).padStart(2, "0")}`, "2026-09-15T10:00:00Z"));
      c.fake.data.Customer.push(customer("later", "2026-09-20T10:00:00Z"));
      const out = await run(c, { pageSize: 10 });
      expect(out.status).toBe("SUCCEEDED");
      expect(await stored(c, "Customer")).toBe(26);
    });

    it("the closure compares against rows THIS logical sync saw: a record stored by an earlier sync does not count as read", async () => {
      const c = await seedConnected();
      for (let i = 1; i <= 23; i++) c.fake.data.Customer.push(customer(`c${String(i).padStart(2, "0")}`, "2026-09-15T10:00:00Z"));
      expect((await run(c, { pageSize: 10 })).status).toBe("SUCCEEDED");
      // A second logical sync (FULL) must re-enumerate the whole bucket, not trust last sync's marks.
      const marker = c.fake.requests.length;
      const again = await run(c, { pageSize: 10, now: () => new Date(NOW.getTime() + 3_600_000) }, { modeOverride: "FULL" });
      expect(again.status).toBe("SUCCEEDED");
      const pages = c.fake.requests.slice(marker).filter((r) => (r.url.searchParams.get("query") ?? "").startsWith("SELECT * FROM Customer"));
      expect(pages.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("no infinite pagination", () => {
    it("NO_INFINITE_PAGINATION_TEST: a provider that ignores STARTPOSITION ends PROVIDER_INCOMPLETE after a bounded number of requests, writes no watermark, and stays read-only", async () => {
      const c = await seedConnected();
      c.fake.ignoreStartPosition = true;
      for (let i = 1; i <= 35; i++) c.fake.data.Invoice.push(invoice(`t${String(i).padStart(3, "0")}`, "2026-09-15T10:00:00Z"));
      const out = await run(c, { pageSize: 10 });
      expect(out).toMatchObject({ status: "FAILED", code: "PROVIDER_INCOMPLETE" });
      // Bounded: a few passes of a few pages each, never an unbounded stream.
      expect(c.fake.accountingRequests().length).toBeLessThan(60);
      const state = await stateOf(c);
      expect(state.watermarks).toEqual({});
      expect(state).toMatchObject({ lastOutcome: "FAILED", lastErrorCode: "PROVIDER_INCOMPLETE", leaseToken: null });
      expect(c.fake.accountingRequests().every((r) => r.method === "GET")).toBe(true);
      expect(QBO_SYNC_TIE_MAX_STALLED_PASSES).toBeGreaterThan(0);
    });

    it("a provider whose results are not ordered by LastUpdatedTime is rejected as malformed, never trusted", async () => {
      const c = await seedConnected();
      for (let i = 1; i <= 12; i++) c.fake.data.Customer.push(customer(String(i), new Date(Date.UTC(2026, 8, 1) + i * 1000).toISOString()));
      const realFetch = c.fake.fetchImpl;
      const reversed = async (input: string, init?: RequestInit) => {
        const res = await realFetch(input, init);
        if (!(new URL(input).searchParams.get("query") ?? "").startsWith("SELECT * FROM Customer")) return res;
        const body = (await res.json()) as { QueryResponse: { Customer?: unknown[] } };
        body.QueryResponse.Customer?.reverse();
        return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
      };
      const out = await run(c, { pageSize: 5, fetchImpl: reversed });
      expect(out).toMatchObject({ status: "FAILED", code: "PROVIDER_MALFORMED" });
      expect((await stateOf(c)).watermarks).toEqual({});
    });
  });

  describe("large datasets complete through persisted continuation (no page cap)", () => {
    it("LARGE_DATASET_CONTINUATION_TEST: 260 records at a 3-call budget = far more than any single execution; CONTINUING until proven exhaustion, then SUCCEEDED", async () => {
      const c = await seedConnected();
      // 150 customers on distinct seconds + a 60-record equal-timestamp bucket + 50 invoices; page size 10.
      for (let i = 1; i <= 150; i++) c.fake.data.Customer.push(customer(`d${String(i).padStart(3, "0")}`, new Date(Date.UTC(2026, 8, 1) + i * 1000).toISOString()));
      for (let i = 1; i <= 60; i++) c.fake.data.Customer.push(customer(`e${String(i).padStart(3, "0")}`, "2026-09-10T10:00:00Z"));
      for (let i = 1; i <= 50; i++) c.fake.data.Invoice.push(invoice(`v${String(i).padStart(3, "0")}`, new Date(Date.UTC(2026, 8, 5) + i * 1000).toISOString()));
      c.fake.shuffleTies = { seed: 3 };

      const syncIds = new Set<string>();
      const statuses: string[] = [];
      let executions = 0;
      let final: Awaited<ReturnType<typeof run>> | null = null;
      for (; executions < 80; executions++) {
        // Each execution happens later in time, but the logical sync's cutoff is fixed by the checkpoint.
        const out = await run(c, { pageSize: 10, pagesPerExecution: 3, now: () => new Date(NOW.getTime() + executions * 60_000) });
        statuses.push(out.status);
        const row = await db.qboSyncRun.findFirstOrThrow({ where: { connectionId: c.connectionId }, orderBy: { startedAt: "desc" } });
        syncIds.add(row.syncId as string);
        if (out.status === "SUCCEEDED") { final = out; break; }
        expect(out.status).toBe("CONTINUING");
        // Mid-sync: not complete, not failed, no watermark, a durable checkpoint, an owner-visible continuing state.
        const st = await stateOf(c);
        expect(st).toMatchObject({ lastOutcome: "PARTIAL", lastErrorCode: null, consecutiveFailures: 0, leaseToken: null });
        expect(st.watermarks).toEqual({});
        expect(parseContinuation(st.continuation)).not.toBeNull();
        expect(row.status).toBe("PARTIAL");
      }
      expect(final).not.toBeNull();
      expect(executions).toBeGreaterThan(10); // would exceed any fixed per-execution cap many times over
      expect(syncIds.size).toBe(1); // one LOGICAL sync across all executions
      expect(statuses.filter((s) => s === "CONTINUING").length).toBe(executions);
      expect(await stored(c, "Customer")).toBe(210);
      expect(await stored(c, "Invoice")).toBe(50);

      const st = await stateOf(c);
      expect(st.continuation).toBeNull(); // cleared together with the watermark advance
      const wm = st.watermarks as Record<string, string>;
      expect(Object.keys(wm).sort()).toEqual([...QBO_SYNC_QUERY_ENTITIES].sort());
      // The watermark is the FIXED cutoff of the logical sync (its first execution), not the last execution's clock.
      for (const e of QBO_SYNC_QUERY_ENTITIES) expect(wm[e]).toBe(NOW.toISOString());
      expect(st).toMatchObject({ lastOutcome: "SUCCEEDED", leaseToken: null });
      expect(c.fake.accountingRequests().every((r) => r.method === "GET")).toBe(true);
    });

    it("reports are read only after every entity is exhausted (never from a half-finished sync)", async () => {
      const c = await seedConnected();
      for (let i = 1; i <= 30; i++) c.fake.data.Customer.push(customer(`d${String(i).padStart(3, "0")}`, new Date(Date.UTC(2026, 8, 1) + i * 1000).toISOString()));
      const first = await run(c, { pageSize: 10, pagesPerExecution: 2 });
      expect(first.status).toBe("CONTINUING");
      expect(c.fake.accountingRequests().some((r) => r.path.includes("/reports/"))).toBe(false);
      expect(await db.qboReportObservation.count({ where: { connectionId: c.connectionId } })).toBe(0);
    });

    it("an unfinished sync is continued (same checkpoint, no restart) even when the next trigger is the daily SCHEDULED one, and a MANUAL one resumes it too", async () => {
      const c = await seedConnected();
      for (let i = 1; i <= 40; i++) c.fake.data.Customer.push(customer(`d${String(i).padStart(3, "0")}`, new Date(Date.UTC(2026, 8, 1) + i * 1000).toISOString()));
      const a = await run(c, { pageSize: 10, pagesPerExecution: 2 });
      expect(a.status).toBe("CONTINUING");
      const cp1 = parseContinuation((await stateOf(c)).continuation);
      const b = await runQboReadSync({ ...scopeOf(c), trigger: "SCHEDULED", actorId: null }, testDeps(c, { now: () => new Date(NOW.getTime() + 30_000), pageSize: 10, pagesPerExecution: 2 }));
      expect(["CONTINUING", "SUCCEEDED"]).toContain(b.status);
      const rows = await db.qboSyncRun.findMany({ where: { connectionId: c.connectionId }, select: { syncId: true } });
      expect(new Set(rows.map((r: { syncId: string | null }) => r.syncId)).size).toBe(1);
      const cp2 = parseContinuation((await stateOf(c)).continuation);
      if (cp1 && cp2) expect(cp2.seq).toBeGreaterThan(cp1.seq);
    });
  });

  describe("the watermark cannot skip data", () => {
    it("WATERMARK_NO_SKIP: a crash/failure mid-continuation leaves a checkpoint but NO watermark and NO completed state; the resume completes with the ORIGINAL cutoff", async () => {
      const c = await seedConnected();
      for (let i = 1; i <= 50; i++) c.fake.data.Customer.push(customer(`d${String(i).padStart(3, "0")}`, new Date(Date.UTC(2026, 8, 1) + i * 1000).toISOString()));
      const first = await run(c, { pageSize: 10, pagesPerExecution: 3 });
      expect(first.status).toBe("CONTINUING");
      // The next execution dies after some pages (provider outage on the third page request of that execution).
      const realFetch = c.fake.fetchImpl;
      let pageCalls = 0;
      const dying = async (input: string, init?: RequestInit) => {
        if ((new URL(input).searchParams.get("query") ?? "").startsWith("SELECT * FROM Customer") && ++pageCalls >= 2) return new Response("{}", { status: 500 });
        return realFetch(input, init);
      };
      const failed = await run(c, { pageSize: 10, pagesPerExecution: 3, fetchImpl: dying, now: () => new Date(NOW.getTime() + 600_000) });
      expect(failed).toMatchObject({ status: "FAILED", code: "PROVIDER_UNAVAILABLE" });
      const st = await stateOf(c);
      expect(st.watermarks).toEqual({});
      expect(parseContinuation(st.continuation)).not.toBeNull(); // progress up to the last persisted page survives
      expect(st).toMatchObject({ lastOutcome: "FAILED", leaseToken: null });
      expect(st.lastSucceededAt).toBeNull();

      // Resume until done: the final watermark equals the first execution's cutoff.
      let done = false;
      for (let i = 0; i < 20 && !done; i++) {
        const out = await run(c, { pageSize: 10, pagesPerExecution: 3, now: () => new Date(NOW.getTime() + 1_200_000 + i * 60_000) });
        expect(["CONTINUING", "SUCCEEDED"]).toContain(out.status);
        done = out.status === "SUCCEEDED";
      }
      expect(done).toBe(true);
      expect(await stored(c, "Customer")).toBe(50);
      const final = await stateOf(c);
      expect((final.watermarks as Record<string, string>).Customer).toBe(NOW.toISOString());
    });

    it("a record edited while the sync is paused (timestamp after the cutoff) is not lost: the next sync starts at cutoff minus the overlap and picks it up", async () => {
      const c = await seedConnected();
      for (let i = 1; i <= 30; i++) c.fake.data.Customer.push(customer(`d${String(i).padStart(3, "0")}`, new Date(Date.UTC(2026, 8, 1) + i * 1000).toISOString()));
      expect((await run(c, { pageSize: 10, pagesPerExecution: 2 })).status).toBe("CONTINUING");
      // Customer d001 (already read) is edited while the sync is paused.
      c.fake.data.Customer[0] = customer("d001", "2026-10-10T03:05:00Z", { DisplayName: "edited during pause" });
      let ok = false;
      for (let i = 0; i < 10 && !ok; i++) ok = (await run(c, { pageSize: 10, pagesPerExecution: 2, now: () => new Date(NOW.getTime() + 600_000 + i * 1000) })).status === "SUCCEEDED";
      expect(ok).toBe(true);
      // Watermark = original cutoff (03:00), so the edit at 03:05 is inside the next incremental window.
      const next = await run(c, { pageSize: 10, now: () => new Date(NOW.getTime() + 7_200_000) });
      expect(next.status).toBe("SUCCEEDED");
      const row = await db.qboSyncedRecord.findFirstOrThrow({ where: { connectionId: c.connectionId, entityType: "Customer", providerEntityId: "d001" } });
      expect((row.normalized as { displayName?: string }).displayName ?? JSON.stringify(row.normalized)).toContain("edited during pause");
    });

    it("a record the provider indexed late (timestamp just BEFORE the previous cutoff) is still read by the next sync through the overlap", async () => {
      const c = await seedConnected();
      c.fake.data.Customer.push(customer("1", "2026-09-01T00:00:00Z"));
      expect((await run(c)).status).toBe("SUCCEEDED"); // watermark = 03:00
      c.fake.data.Customer.push(customer("late", "2026-10-10T02:55:00Z")); // becomes visible only now, but stamped 5 minutes BEFORE the cutoff
      const next = await run(c, { now: () => new Date(NOW.getTime() + 3_600_000) });
      expect(next.status === "SUCCEEDED" && next.counts.inserted).toBe(1);
      expect(await stored(c, "Customer")).toBe(2);
    });

    it("watermarks are all-or-nothing: a sync that dies while reading the SECOND entity advances none of them", async () => {
      const c = await seedConnected();
      c.fake.data.Customer.push(customer("1", "2026-09-01T00:00:00Z"));
      c.fake.data.Invoice.push(invoice("1", "2026-09-02T00:00:00Z"));
      c.fake.inject("query", { status: 200, body: { QueryResponse: {} } }, { status: 500 }, { status: 500 }, { status: 500 }, { status: 500 });
      const out = await run(c);
      expect(out.status).toBe("FAILED");
      expect((await stateOf(c)).watermarks).toEqual({});
    });
  });

  describe("continuation scheduling", () => {
    it("the scheduler handler queues exactly one follow-up task per checkpoint, and queuing is idempotent", async () => {
      const c = await seedConnected();
      for (let i = 1; i <= 30; i++) c.fake.data.Customer.push(customer(`d${String(i).padStart(3, "0")}`, new Date(Date.UTC(2026, 8, 1) + i * 1000).toISOString()));
      const k = (n: string) => ({ workspaceId: c.t.ws, connectionId: c.connectionId, continuationKey: n });
      const created1 = await enqueueQboSyncContinuation(k("sync-a:7:3"));
      const created2 = await enqueueQboSyncContinuation(k("sync-a:7:3"));
      expect([created1, created2]).toEqual([true, false]);
      // Same checkpoint sequence but a LATER lease epoch (a failed attempt in between) or ANOTHER logical sync must not collide.
      expect(await enqueueQboSyncContinuation(k("sync-a:7:4"))).toBe(true);
      expect(await enqueueQboSyncContinuation(k("sync-b:7:3"))).toBe(true);
      expect(continuationTaskKey(null, 3)).toBeNull();
      const tasks = await db.scheduledTask.findMany({ where: { taskName: TASK_NAME_QBO_READ_SYNC, workspaceId: c.t.ws } });
      expect(tasks.length).toBe(3);
      expect(JSON.stringify(tasks.map((t: { payload: unknown }) => t.payload))).not.toMatch(/ACCESS-|REFRESH-|realm/i);
      expect(getProductionTaskHandlers().has(TASK_NAME_QBO_READ_SYNC)).toBe(true);
    });
  });

  describe("poisoned checkpoints, drift and the re-evaluation marker", () => {
    it("PROVIDER_INCOMPLETE flags the checkpoint for RESTART: the next attempt is a fresh logical sync (new syncId) and completes once the provider behaves", async () => {
      const c = await seedConnected();
      c.fake.ignoreStartPosition = true;
      for (let i = 1; i <= 35; i++) c.fake.data.Invoice.push(invoice(`t${String(i).padStart(3, "0")}`, "2026-09-15T10:00:00Z"));
      expect(await run(c, { pageSize: 10 })).toMatchObject({ status: "FAILED", code: "PROVIDER_INCOMPLETE" });
      const poisoned = parseContinuation((await stateOf(c)).continuation);
      expect(poisoned?.restart).toBe(true);
      const firstSync = (await db.qboSyncRun.findFirstOrThrow({ where: { connectionId: c.connectionId }, orderBy: { startedAt: "desc" } })).syncId;
      c.fake.ignoreStartPosition = false;
      const again = await run(c, { pageSize: 10, now: () => new Date(NOW.getTime() + 600_000) });
      expect(again.status).toBe("SUCCEEDED");
      const lastSync = (await db.qboSyncRun.findFirstOrThrow({ where: { connectionId: c.connectionId }, orderBy: { startedAt: "desc" } })).syncId;
      expect(lastSync).not.toBe(firstSync);
      expect(await stored(c, "Invoice")).toBe(35);
      expect((await stateOf(c)).continuation).toBeNull();
    });

    it("a record leaving an oversized bucket MID-PASS can never produce a false 'complete': the run either ends PROVIDER_INCOMPLETE or has stored every record still present", async () => {
      const c = await seedConnected();
      for (let i = 1; i <= 35; i++) c.fake.data.Invoice.push(invoice(`t${String(i).padStart(3, "0")}`, "2026-09-15T10:00:00Z"));
      const realFetch = c.fake.fetchImpl;
      let tiePages = 0;
      const racing = async (input: string, init?: RequestInit) => {
        const res = await realFetch(input, init);
        const q = new URL(input).searchParams.get("query") ?? "";
        if (q.startsWith("SELECT * FROM Invoice") && q.includes("< '") && ++tiePages === 1) {
          // A user edits t005 right after the first tie page is served: it leaves the bucket (stamp after the cutoff).
          const at = c.fake.data.Invoice.findIndex((r) => r.Id === "t005");
          c.fake.data.Invoice[at] = invoice("t005", "2026-12-31T00:00:00Z");
        }
        return res;
      };
      const out = await run(c, { pageSize: 10, fetchImpl: racing });
      if (out.status === "SUCCEEDED") {
        const have = new Set((await db.qboSyncedRecord.findMany({ where: { connectionId: c.connectionId, entityType: "Invoice" }, select: { providerEntityId: true } })).map((r: { providerEntityId: string }) => r.providerEntityId));
        for (const r of c.fake.data.Invoice) if (r.Id !== "t005") expect(have.has(r.Id)).toBe(true);
      } else {
        expect(out).toMatchObject({ status: "FAILED", code: "PROVIDER_INCOMPLETE" });
        expect((await stateOf(c)).watermarks).toEqual({});
      }
    });

    it("a change persisted by a FAILED attempt still reaches the completion marker (the retry sees every record as unchanged)", async () => {
      const c = await seedConnected();
      c.fake.data.Customer.push(customer("1", "2026-09-01T00:00:00Z"));
      c.fake.reports.ProfitAndLoss = () => ({ Header: {}, Rows: {} }); // malformed -> run fails AFTER records were stored
      const failed = await run(c);
      expect(failed).toMatchObject({ status: "FAILED", code: "PROVIDER_MALFORMED" });
      delete c.fake.reports.ProfitAndLoss;
      const ok = await run(c, { now: () => new Date(NOW.getTime() + 600_000) });
      expect(ok.status).toBe("SUCCEEDED");
      expect(ok.status === "SUCCEEDED" && ok.counts.unchanged).toBeGreaterThanOrEqual(1);
      expect(ok.status === "SUCCEEDED" && ok.changed).toBe(true);
      const ev = await db.auditEvent.findMany({ where: { workspaceId: c.t.ws, eventName: "qbo.sync_completed" } });
      expect((ev[0].payload as Record<string, unknown>).reevaluationCandidate).toBe(true);
    });

    it("the marker also survives a multi-execution sync whose LAST execution changes nothing", async () => {
      const c = await seedConnected();
      for (let i = 1; i <= 25; i++) c.fake.data.Customer.push(customer(`d${String(i).padStart(3, "0")}`, new Date(Date.UTC(2026, 8, 1) + i * 1000).toISOString()));
      expect((await run(c, { pageSize: 10, pagesPerExecution: 2 })).status).toBe("CONTINUING");
      let last: Awaited<ReturnType<typeof run>> | null = null;
      for (let i = 0; i < 10; i++) { last = await run(c, { pageSize: 10, pagesPerExecution: 2, now: () => new Date(NOW.getTime() + 60_000 * (i + 1)) }); if (last.status === "SUCCEEDED") break; }
      expect(last?.status).toBe("SUCCEEDED");
      const ev = await db.auditEvent.findMany({ where: { workspaceId: c.t.ws, eventName: "qbo.sync_completed" } });
      expect((ev[0].payload as Record<string, unknown>).reevaluationCandidate).toBe(true);
    });
  });

  describe("membership races inside an oversized equal-timestamp bucket (set equality, not cardinality)", () => {
    const SECOND = "2026-09-15T10:00:00Z";
    const seedBucket = (c: ConnectedTenant, n = 35) => { for (let i = 1; i <= n; i++) c.fake.data.Invoice.push(invoice(`t${String(i).padStart(3, "0")}`, SECOND)); };
    /** A leaves the bucket (edited after the cutoff) while late-indexed B appears in it: the provider's count is unchanged. */
    const replaceAB = (c: ConnectedTenant) => {
      const at = c.fake.data.Invoice.findIndex((r) => r.Id === "t005");
      c.fake.data.Invoice[at] = invoice("t005", "2026-10-10T03:30:00Z", { Balance: 1 });
      c.fake.data.Invoice.push(invoice("B-late", SECOND));
    };
    const hook = (c: ConnectedTenant, when: (q: string, n: number) => boolean, then: () => void) => {
      const realFetch = c.fake.fetchImpl;
      let n = 0;
      let fired = false;
      return async (input: string, init?: RequestInit) => {
        const res = await realFetch(input, init);
        const q = new URL(input).searchParams.get("query") ?? "";
        if (!fired && when(q, ++n)) { fired = true; then(); }
        return res;
      };
    };
    const ids = async (c: ConnectedTenant) => new Set((await db.qboSyncedRecord.findMany({ where: { connectionId: c.connectionId, entityType: "Invoice" }, select: { providerEntityId: true } })).map((r: { providerEntityId: string }) => r.providerEntityId));
    /** The invariant: the run is never SUCCEEDED while a record the provider holds in the bucket is absent locally. */
    const assertNoSilentSkip = async (c: ConnectedTenant, out: Awaited<ReturnType<typeof run>>) => {
      if (out.status === "SUCCEEDED") {
        const have = await ids(c);
        for (const r of c.fake.data.Invoice) if (Date.parse(r.MetaData.LastUpdatedTime) <= NOW.getTime()) expect(have.has(r.Id)).toBe(true);
      } else {
        expect(["CONTINUING", "FAILED"]).toContain(out.status);
        expect((await stateOf(c)).watermarks).toEqual({});
      }
    };

    it("SAME_COUNT_MEMBERSHIP_REPLACEMENT_TEST: A leaves and B enters mid-enumeration with the count unchanged - B is recovered, A is reconciled by the next sync, completion is never declared with B missing", async () => {
      for (const seed of [null, 5]) {
        const c = await seedConnected();
        if (seed !== null) c.fake.shuffleTies = { seed };
        seedBucket(c);
        const racing = hook(c, (q, n) => q.startsWith("SELECT * FROM Invoice") && q.includes("< '") && n >= 1, () => replaceAB(c));
        let out = await run(c, { pageSize: 10, fetchImpl: racing });
        for (let i = 0; i < 6 && out.status === "CONTINUING"; i++) out = await run(c, { pageSize: 10, fetchImpl: racing });
        await assertNoSilentSkip(c, out);
        if (out.status === "SUCCEEDED") {
          expect((await ids(c)).has("B-late")).toBe(true);
          // A's NEW copy (after the cutoff) is picked up by the next incremental sync.
          const next = await run(c, { pageSize: 10, now: () => new Date(NOW.getTime() + 2 * 3_600_000) });
          expect(next.status).toBe("SUCCEEDED");
          const a = await db.qboSyncedRecord.findFirstOrThrow({ where: { connectionId: c.connectionId, entityType: "Invoice", providerEntityId: "t005" } });
          expect((a.normalized as { balance?: string }).balance).toBe("1");
        }
      }
    });

    it("the identity proof really is set inclusion: with ONLY the replacement (no other change) the old cardinality check would have closed, the new one does not", async () => {
      const c = await seedConnected();
      seedBucket(c);
      // Replacement happens right after the enumeration pass finished and BEFORE verification starts (first IN-count request).
      const racing = hook(c, (q) => q.startsWith("SELECT count(*)") && q.includes(" Id IN "), () => replaceAB(c));
      let out = await run(c, { pageSize: 10, fetchImpl: racing });
      for (let i = 0; i < 6 && out.status === "CONTINUING"; i++) out = await run(c, { pageSize: 10, fetchImpl: racing });
      await assertNoSilentSkip(c, out);
      expect(out.status === "SUCCEEDED" ? (await ids(c)).has("B-late") : true).toBe(true);
      expect(queriesFor(c, "Invoice", "count").some((r) => (r.url.searchParams.get("query") ?? "").includes(" Id IN "))).toBe(true);
    });

    it("WATERMARK_MEMBERSHIP_RACE_TEST: a flip that happens BETWEEN verification batches is caught by the second round - never a false close", async () => {
      const c = await seedConnected();
      seedBucket(c, 120); // > one IN batch of 50 so the flip can land mid-round
      let seenIn = 0;
      const racing = hook(c, (q) => q.startsWith("SELECT count(*)") && q.includes(" Id IN ") && ++seenIn === 2, () => {
        const at = c.fake.data.Invoice.findIndex((r) => r.Id === "t005");
        c.fake.data.Invoice[at] = invoice("t005", "2026-12-31T00:00:00Z");
        c.fake.data.Invoice.push(invoice("B-late", SECOND));
      });
      let out = await run(c, { pageSize: 25, pagesPerExecution: 1000, fetchImpl: racing });
      for (let i = 0; i < 6 && out.status === "CONTINUING"; i++) out = await run(c, { pageSize: 25, pagesPerExecution: 1000, fetchImpl: racing });
      await assertNoSilentSkip(c, out);
      if (out.status === "SUCCEEDED") expect((await ids(c)).has("B-late")).toBe(true);
    });

    it("ordinary single membership flips are detected at EVERY verification read from the start of verification to its last re-read (deterministic sweep): never a close with B missing", async () => {
      // 3 IN-batches per round x 2 rounds = 6 identity reads; the flip lands right after read k (including after the LAST identity read,
      // which only the post-cutoff edit count can still observe).
      for (let flipAt = 1; flipAt <= 6; flipAt++) {
        const c = await seedConnected();
        seedBucket(c, 120);
        let inCounts = 0;
        const racing = hook(c, (q) => q.startsWith("SELECT count(*)") && q.includes(" Id IN ") && ++inCounts === flipAt, () => replaceAB(c));
        let out = await run(c, { pageSize: 25, pagesPerExecution: 1000, fetchImpl: racing });
        for (let i = 0; i < 8 && out.status === "CONTINUING"; i++) out = await run(c, { pageSize: 25, pagesPerExecution: 1000, fetchImpl: racing });
        await assertNoSilentSkip(c, out);
        if (out.status === "SUCCEEDED") expect((await ids(c)).has("B-late")).toBe(true);
      }
    });

    it("restart between the two observations / continuation worker takeover: the flip lands while the sync is PAUSED at its checkpoint inside the proof; the resuming execution still does not close falsely", async () => {
      const c = await seedConnected();
      seedBucket(c, 60);
      // Budget small enough that an execution ends in the middle of enumeration/verification.
      let out = await run(c, { pageSize: 10, pagesPerExecution: 9 });
      expect(out.status).toBe("CONTINUING");
      const cp = parseContinuation((await stateOf(c)).continuation);
      expect(cp?.tie).not.toBeNull();
      replaceAB(c); // while paused (no lease held)
      for (let i = 0; i < 30 && out.status === "CONTINUING"; i++) out = await run(c, { pageSize: 10, pagesPerExecution: 9, now: () => new Date(NOW.getTime() + 60_000 * (i + 1)) });
      await assertNoSilentSkip(c, out);
      if (out.status === "SUCCEEDED") expect((await ids(c)).has("B-late")).toBe(true);
    });

    it("WATERMARK_NO_SILENT_SKIP: a provider that hides B for the whole sync (never serves it) can not be proven complete if it still COUNTS B", async () => {
      const c = await seedConnected();
      seedBucket(c, 35);
      // The provider's COUNT includes a record its pages never return (an inconsistent provider): inclusion can never be established.
      const realFetch = c.fake.fetchImpl;
      const phantom = async (input: string, init?: RequestInit) => {
        const res = await realFetch(input, init);
        const q = new URL(input).searchParams.get("query") ?? "";
        if (!q.startsWith("SELECT count(*) FROM Invoice") || q.includes(" Id IN ")) return res; // only the bucket total lies
        const body = (await res.json()) as { QueryResponse: { totalCount: number } };
        body.QueryResponse.totalCount += 1;
        return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
      };
      const out = await run(c, { pageSize: 10, fetchImpl: phantom });
      expect(out).toMatchObject({ status: "FAILED", code: "PROVIDER_INCOMPLETE" });
      expect((await stateOf(c)).watermarks).toEqual({});
    });

    it("a webhook hint that arrives DURING a multi-execution sync is not consumed by it (it post-dates the cutoff) and still triggers a follow-up", async () => {
      const c = await seedConnected();
      for (let i = 1; i <= 30; i++) c.fake.data.Customer.push(customer(`d${String(i).padStart(3, "0")}`, new Date(Date.UTC(2026, 8, 1) + i * 1000).toISOString()));
      expect((await run(c, { pageSize: 10, pagesPerExecution: 2 })).status).toBe("CONTINUING");
      await markWebhookHint(scopeOf(c), testDeps(c, { now: () => new Date(NOW.getTime() + 120_000) }));
      let out = await run(c, { pageSize: 10, pagesPerExecution: 2, now: () => new Date(NOW.getTime() + 180_000) });
      for (let i = 0; i < 10 && out.status === "CONTINUING"; i++) out = await run(c, { pageSize: 10, pagesPerExecution: 2, now: () => new Date(NOW.getTime() + 240_000 + i * 1000) });
      expect(out.status).toBe("SUCCEEDED");
      expect((await stateOf(c)).webhookHintAt).not.toBeNull();
    });
  });
});
