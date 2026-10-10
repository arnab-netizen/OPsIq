/**
 * QuickBooks sync — lease-loss, stale-finish and marker-persistence paths (RC6), real PostgreSQL, fake Intuit.
 *  - a worker taken over MID-RUN ends LEASE_LOST and writes nothing after the takeover;
 *  - a stale worker cannot finish a PARTIAL run it no longer owns;
 *  - a marker-persistence failure that is NOT a lost lease is never swallowed;
 *  - a changed record with no checkpoint to carry the re-evaluation marker fails loudly and commits nothing.
 * Requires TEST_WITH_DB=true and a migrated PostgreSQL. Self-skips otherwise.
 */
import { describe, it, expect, vi, afterEach, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { runQboReadSync, type RunQboSyncInput } from "@/services/quickbooks/qbo-sync.service";
import * as store from "@/services/quickbooks/qbo-sync-store.service";
import { QboLeaseLostError, beginSyncRun, finishSyncRunPartial, persistRecordsPageWithCheckpoint, saveContinuation, type SyncLease } from "@/services/quickbooks/qbo-sync-store.service";
import { normalizeInvoice } from "@/domain/quickbooks/qbo-normalize";
import { emptySyncCounts, QBO_SYNC_LEASE_MS } from "@/domain/quickbooks/qbo-sync-model";
import { seedConnected, testDeps, scopeOf, ownedQboTasks, type ConnectedTenant } from "@/__tests__/test-helpers/qbo-db-fixtures";
import { customer, invoice } from "@/__tests__/test-helpers/qbo-fake-intuit";

const NOW = new Date("2026-10-10T03:00:00Z");
const LATER = new Date(NOW.getTime() + QBO_SYNC_LEASE_MS + 60_000); // the first worker's lease has expired by then
const manual = (c: ConnectedTenant, o: Partial<RunQboSyncInput> = {}): RunQboSyncInput => ({ ...scopeOf(c), trigger: "MANUAL", actorId: c.t.actor, requestId: randomUUID(), ...o });
const stateOf = (c: ConnectedTenant) => db.qboSyncState.findUniqueOrThrow({ where: { connectionId: c.connectionId } });
const begin = async (c: ConnectedTenant, now: Date): Promise<SyncLease> => {
  const r = await beginSyncRun({ ...scopeOf(c), trigger: "MANUAL", mode: "FULL", idempotencyKey: `manual:${randomUUID()}`, requestedById: c.t.actor }, { now: () => now });
  if (!r.ok) throw new Error(`begin ${r.reason}`);
  return r.lease;
};
const ckpt = (l: SyncLease) => ({ v: 1 as const, syncId: l.syncId, mode: "FULL" as const, cutoff: NOW.toISOString(), entityIndex: 0, cursor: null, tie: null, reconciled: [] as string[], seq: 1, changed: false, restart: false, reportFailures: 0 });

const owned = ownedQboTasks();
afterAll(owned.cleanup);
afterEach(() => vi.restoreAllMocks());

describe.skipIf(!SHOULD_RUN_DB_TESTS)("lease-loss, stale finish and marker paths (real Postgres)", () => {
  it("a worker taken over MID-RUN ends LEASE_LOST, writes no page after the takeover, and leaves the new owner's lease intact", async () => {
    const c = await seedConnected();
    for (let i = 1; i <= 3; i++) c.fake.data.Customer.push(customer(`l${i}`, `2026-09-1${i}T10:00:00Z`));
    let takenOver: SyncLease | null = null;
    const realFetch = c.fake.fetchImpl;
    const takeoverOnFirstPage = async (input: string, init?: RequestInit) => {
      if (takenOver === null && (new URL(input).searchParams.get("query") ?? "").startsWith("SELECT * FROM")) takenOver = await begin(c, LATER); // worker B acquires the (expired) lease
      return realFetch(input, init);
    };
    const out = await runQboReadSync(manual(c), testDeps(c, { now: () => NOW, fetchImpl: takeoverOnFirstPage }));
    expect(out).toMatchObject({ status: "FAILED", code: "LEASE_LOST" });
    expect(takenOver).not.toBeNull();
    expect(await db.qboSyncedRecord.count({ where: { connectionId: c.connectionId, entityType: "Customer" } })).toBe(0); // nothing after the takeover
    const st = await stateOf(c);
    expect(st.leaseToken).toBe((takenOver as unknown as SyncLease).token); // B still owns the lease
    expect(st.lastOutcome).not.toBe("FAILED");
  });

  it("a STALE worker cannot finish a PARTIAL run: finishSyncRunPartial rejects with the lost-lease error and changes nothing", async () => {
    const c = await seedConnected();
    const a = await begin(c, NOW);
    const b = await begin(c, LATER); // takes over A's expired lease: a new epoch
    expect(b.epoch).toBeGreaterThan(a.epoch);
    await expect(finishSyncRunPartial({ lease: a, mode: "FULL", counts: emptySyncCounts(), changed: false, actorId: c.t.actor })).rejects.toBeInstanceOf(QboLeaseLostError);
    const st = await stateOf(c);
    expect(st.leaseToken).toBe(b.token);
    expect(st.lastOutcome).not.toBe("PARTIAL");
    expect(await db.qboSyncRun.findUniqueOrThrow({ where: { id: a.runId } })).toMatchObject({ status: expect.not.stringMatching(/^PARTIAL$/) });
    expect(await db.auditEvent.count({ where: { workspaceId: c.t.ws, eventName: "qbo.sync_continued" } })).toBe(0);
    // The current owner CAN finish it.
    await expect(finishSyncRunPartial({ lease: b, mode: "FULL", counts: emptySyncCounts(), changed: false, actorId: c.t.actor })).resolves.toBeUndefined();
  });

  it("a marker-persistence failure that is NOT a lost lease propagates (the restart / re-evaluation flags are never silently dropped); a lost lease there is tolerated", async () => {
    const make = async () => {
      const c = await seedConnected();
      c.fake.data.Customer.push(customer("m1", "2026-09-01T10:00:00Z"));
      c.fake.reports.ProfitAndLoss = () => ({ Header: { ReportName: "ProfitAndLoss" }, Rows: "not-a-report" }); // permanent report failure => restart patch
      return c;
    };
    const realSave = store.saveContinuation;
    const failRestartWrite = (error: Error) =>
      vi.spyOn(store, "saveContinuation").mockImplementation(async (lease, next, deps) => {
        if (next.restart) throw error; // only the failure-path marker write
        return realSave(lease, next, deps);
      });

    const c1 = await make();
    failRestartWrite(new Error("database unavailable"));
    await expect(runQboReadSync(manual(c1), testDeps(c1, { now: () => NOW }))).rejects.toThrow("database unavailable");
    vi.restoreAllMocks();

    const c2 = await make();
    failRestartWrite(new QboLeaseLostError());
    const tolerated = await runQboReadSync(manual(c2), testDeps(c2, { now: () => NOW }));
    expect(tolerated).toMatchObject({ status: "FAILED", code: "PROVIDER_MALFORMED" }); // another worker owning the state is not an error here
  });

  it("a changed record with NO checkpoint to carry the re-evaluation marker fails loudly and commits nothing; with a checkpoint it succeeds and sets the marker", async () => {
    const c = await seedConnected();
    const lease = await begin(c, NOW);
    const n = normalizeInvoice(invoice("x1", "2026-09-01T10:00:00Z"));
    if (!n.ok) throw new Error("fixture");
    const deps = { now: () => NOW };
    await expect(persistRecordsPageWithCheckpoint(lease, [n.record], undefined, deps)).rejects.toBeInstanceOf(QboLeaseLostError);
    expect(await db.qboSyncedRecord.count({ where: { connectionId: c.connectionId } })).toBe(0); // the insert rolled back with it
    expect((await stateOf(c)).continuation).toBeNull();

    await saveContinuation(lease, ckpt(lease), deps); // positive control: a checkpoint now exists
    const r = await persistRecordsPageWithCheckpoint(lease, [n.record], undefined, deps);
    expect(r.inserted).toBe(1);
    expect(await db.qboSyncedRecord.count({ where: { connectionId: c.connectionId } })).toBe(1);
    expect(((await stateOf(c)).continuation as { changed: boolean }).changed).toBe(true);
  });
});
