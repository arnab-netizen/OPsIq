/**
 * QuickBooks sync lease, replay and stale-worker safety — real PostgreSQL, fake Intuit.
 * Requires TEST_WITH_DB=true. Self-skips otherwise.
 */
import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { runQboReadSync, runScheduledQboSync, type RunQboSyncInput } from "@/services/quickbooks/qbo-sync.service";
import {
  QboLeaseLostError, beginSyncRun, extendSyncLease, markWebhookHint, persistRecordsPage, finishSyncRunSuccess, finishSyncRunFailure, persistReportObservation,
  type SyncLease,
} from "@/services/quickbooks/qbo-sync-store.service";
import { normalizeInvoice, type NormalizedRecord } from "@/domain/quickbooks/qbo-normalize";
import { emptySyncCounts, QBO_SYNC_LEASE_MS } from "@/domain/quickbooks/qbo-sync-model";
import { seedConnected, testDeps, scopeOf, countRows, type ConnectedTenant } from "@/__tests__/test-helpers/qbo-db-fixtures";
import { customer, invoice } from "@/__tests__/test-helpers/qbo-fake-intuit";

const NOW = new Date("2026-10-10T03:00:00Z");
const manual = (c: ConnectedTenant, o: Partial<RunQboSyncInput> = {}): RunQboSyncInput => ({ ...scopeOf(c), trigger: "MANUAL", actorId: c.t.actor, requestId: randomUUID(), ...o });

/** Wrap fetch so the FIRST accounting request parks until released — lets a test hold a sync mid-flight deterministically. */
function gated(c: ConnectedTenant) {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  let entered!: () => void;
  const inFlight = new Promise<void>((r) => { entered = r; });
  let first = true;
  const fetchImpl = async (input: string, init?: RequestInit) => {
    if (first) { first = false; entered(); await gate; }
    return c.fake.fetchImpl(input, init);
  };
  return { fetchImpl, release, inFlight };
}

function lease(c: ConnectedTenant, r: Awaited<ReturnType<typeof beginSyncRun>>): SyncLease {
  if (!r.ok) throw new Error(`begin ${r.reason}`);
  return r.lease;
}
const inv = (id: string, at: string): NormalizedRecord => {
  const n = normalizeInvoice(invoice(id, at));
  if (!n.ok) throw new Error("fixture");
  return n.record;
};

describe.skipIf(!SHOULD_RUN_DB_TESTS)("QBO sync lease / concurrency (real Postgres)", () => {
  it("duplicate manual runs cannot race: exactly one runs, the rest get a typed BUSY, and the provider is read once", async () => {
    const c = await seedConnected();
    c.fake.data.Customer.push(customer("1", "2026-09-01T00:00:00Z"));
    const g = gated(c);
    const first = runQboReadSync(manual(c), testDeps(c, { now: () => NOW, fetchImpl: g.fetchImpl }));
    await g.inFlight; // the winner holds the lease and is parked at its first provider call
    const losers = await Promise.all(Array.from({ length: 7 }, () => runQboReadSync(manual(c), testDeps(c, { now: () => NOW }))));
    expect(losers.every((o) => o.status === "BUSY")).toBe(true);
    const busy = losers[0];
    expect(busy.status === "BUSY" && busy.runId).toBeTruthy();
    expect(busy.status === "BUSY" && busy.leaseExpiresAt instanceof Date).toBe(true);
    g.release();
    expect((await first).status).toBe("SUCCEEDED");
    expect(await db.qboSyncRun.count({ where: { connectionId: c.connectionId } })).toBe(1);
    expect(c.fake.requests.filter((r) => r.path.endsWith("/companyinfo/" + c.realmId))).toHaveLength(1);
  });

  it("truly simultaneous starts: one SUCCEEDED, the others BUSY or (if the winner already finished) a fresh sequential run — never two overlapping", async () => {
    const c = await seedConnected();
    const outs = await Promise.all(Array.from({ length: 6 }, () => runQboReadSync(manual(c), testDeps(c, { now: () => NOW }))));
    expect(outs.some((o) => o.status === "SUCCEEDED")).toBe(true);
    expect(outs.every((o) => o.status === "SUCCEEDED" || o.status === "BUSY")).toBe(true);
    const runs = await db.qboSyncRun.findMany({ where: { connectionId: c.connectionId } });
    expect(runs.every((r: { status: string }) => r.status === "SUCCEEDED")).toBe(true);
    // No run ever overlapped another: every run's lease epoch is distinct and increasing.
    const epochs = runs.map((r: { leaseEpoch: number }) => r.leaseEpoch).sort((a: number, b: number) => a - b);
    expect(new Set(epochs).size).toBe(epochs.length);
    expect(await db.qboSyncState.findUniqueOrThrow({ where: { connectionId: c.connectionId } })).toMatchObject({ leaseToken: null, leaseRunId: null });
  });

  it("repeating a request id replays the finished run: no new run, no provider traffic", async () => {
    const c = await seedConnected();
    const requestId = randomUUID();
    const a = await runQboReadSync(manual(c, { requestId }), testDeps(c, { now: () => NOW }));
    expect(a.status).toBe("SUCCEEDED");
    const requests = c.fake.requests.length;
    const b = await runQboReadSync(manual(c, { requestId }), testDeps(c, { now: () => new Date(NOW.getTime() + 1000) }));
    expect(b).toEqual({ status: "ALREADY_COMPLETED", runId: a.status === "SUCCEEDED" ? a.runId : "", runStatus: "SUCCEEDED" });
    expect(c.fake.requests.length).toBe(requests);
    expect(await db.qboSyncRun.count({ where: { connectionId: c.connectionId } })).toBe(1);
  });

  it("concurrent duplicates of the SAME request id still produce exactly one run row", async () => {
    const c = await seedConnected();
    const requestId = randomUUID();
    const outs = await Promise.all(Array.from({ length: 6 }, () => runQboReadSync(manual(c, { requestId }), testDeps(c, { now: () => NOW }))));
    expect(outs.filter((o) => o.status === "SUCCEEDED")).toHaveLength(1);
    expect(outs.every((o) => ["SUCCEEDED", "BUSY", "ALREADY_COMPLETED"].includes(o.status))).toBe(true);
    expect(await db.qboSyncRun.count({ where: { connectionId: c.connectionId } })).toBe(1);
  });

  it("a scheduled/webhook run overlapping a manual run is refused (BUSY) and reads nothing", async () => {
    const c = await seedConnected();
    const g = gated(c);
    const manualRun = runQboReadSync(manual(c), testDeps(c, { now: () => NOW, fetchImpl: g.fetchImpl }));
    await g.inFlight;
    const before = c.fake.requests.length;
    const sched = await runScheduledQboSync({ workspaceId: c.t.ws, connectionId: c.connectionId, trigger: "SCHEDULED" }, testDeps(c, { now: () => NOW }));
    await markWebhookHint(scopeOf(c), { now: () => NOW }); // an unserved hint exists, so the webhook-triggered run is due
    const hook = await runScheduledQboSync({ workspaceId: c.t.ws, connectionId: c.connectionId, trigger: "WEBHOOK" }, testDeps(c, { now: () => NOW }));
    expect(sched.status).toBe("BUSY");
    expect(hook.status).toBe("BUSY");
    expect(c.fake.requests.length).toBe(before);
    g.release();
    expect((await manualRun).status).toBe("SUCCEEDED");
  });

  it("the scheduler entry resolves the business from the connection and refuses a foreign workspace", async () => {
    const a = await seedConnected();
    const b = await seedConnected();
    expect(await runScheduledQboSync({ workspaceId: b.t.ws, connectionId: a.connectionId, trigger: "SCHEDULED" }, testDeps(a, { now: () => NOW }))).toMatchObject({ status: "FAILED", code: "CONNECTION_NOT_FOUND" });
    expect(a.fake.requests).toHaveLength(0);
    const ok = await runScheduledQboSync({ workspaceId: a.t.ws, connectionId: a.connectionId, trigger: "SCHEDULED" }, testDeps(a, { now: () => NOW }));
    expect(ok.status).toBe("SUCCEEDED");
    const row = await db.qboSyncRun.findFirstOrThrow({ where: { connectionId: a.connectionId } });
    expect(row).toMatchObject({ trigger: "SCHEDULED", businessId: a.t.biz, requestedById: null });
  });

  it("scheduled cadence is one SUCCESSFUL run per UTC day: a same-day repeat is NOT_DUE, the next day runs", async () => {
    const c = await seedConnected();
    const args = { workspaceId: c.t.ws, connectionId: c.connectionId, trigger: "SCHEDULED" as const };
    const a = await runScheduledQboSync(args, testDeps(c, { now: () => NOW }));
    const requests = c.fake.requests.length;
    const b = await runScheduledQboSync(args, testDeps(c, { now: () => new Date(NOW.getTime() + 3_600_000) }));
    expect(a.status).toBe("SUCCEEDED");
    expect(b).toEqual({ status: "NOT_DUE", nextAttemptNotBefore: new Date("2026-10-11T00:00:00Z") });
    expect(c.fake.requests.length).toBe(requests);
    const next = await runScheduledQboSync(args, testDeps(c, { now: () => new Date(NOW.getTime() + 86_400_000) }));
    expect(next.status).toBe("SUCCEEDED");
    expect(await db.qboSyncRun.count({ where: { connectionId: c.connectionId } })).toBe(2);
  });

  it("a crashed scheduled run does not swallow the day: once its lease expires the retry runs under a fresh key and recovers it", async () => {
    const c = await seedConnected();
    const crashed = lease(c, await beginSyncRun({ ...scopeOf(c), trigger: "SCHEDULED", mode: "FULL", idempotencyKey: "scheduled:2026-10-10:0", requestedById: null }, { now: () => NOW }));
    // The process died; nobody finished the run. While the lease is live the retry is BUSY, not a bogus "already completed".
    const early = await runScheduledQboSync({ workspaceId: c.t.ws, connectionId: c.connectionId, trigger: "SCHEDULED" }, testDeps(c, { now: () => new Date(NOW.getTime() + 60_000) }));
    expect(early).toMatchObject({ status: "BUSY", runId: crashed.runId });
    const later = new Date(NOW.getTime() + QBO_SYNC_LEASE_MS + 5000);
    const retry = await runScheduledQboSync({ workspaceId: c.t.ws, connectionId: c.connectionId, trigger: "SCHEDULED" }, testDeps(c, { now: () => later }));
    expect(retry.status).toBe("SUCCEEDED");
    expect(await db.qboSyncRun.findUniqueOrThrow({ where: { id: crashed.runId } })).toMatchObject({ status: "ABANDONED" });
  });

  it("a failed scheduled attempt is retried after its back-off under a fresh key (the day is not swallowed)", async () => {
    const c = await seedConnected();
    const args = { workspaceId: c.t.ws, connectionId: c.connectionId, trigger: "SCHEDULED" as const };
    c.fake.inject(`companyinfo/${c.realmId}`, ...Array.from({ length: 4 }, () => ({ status: 503 })));
    expect((await runScheduledQboSync(args, testDeps(c, { now: () => NOW }))).status).toBe("FAILED");
    // A manual success in between resets the failure counter; the next scheduled attempt must still not be blocked by the old key.
    expect((await runQboReadSync(manual(c), testDeps(c, { now: () => new Date(NOW.getTime() + 60_000) }))).status).toBe("SUCCEEDED");
    const keys = (await db.qboSyncRun.findMany({ where: { connectionId: c.connectionId } })).map((r: { idempotencyKey: string }) => r.idempotencyKey);
    expect(keys.filter((k: string) => k.startsWith("scheduled:"))).toHaveLength(1);
    const next = await runScheduledQboSync(args, testDeps(c, { now: () => new Date(NOW.getTime() + 86_400_000 + 1000) }));
    expect(next.status).toBe("SUCCEEDED");
  });

  it("a webhook-triggered run only happens while an unserved hint exists: coalesced tasks do not each sync", async () => {
    const c = await seedConnected();
    const args = { workspaceId: c.t.ws, connectionId: c.connectionId, trigger: "WEBHOOK" as const };
    expect(await runScheduledQboSync(args, testDeps(c, { now: () => NOW }))).toMatchObject({ status: "NOT_DUE" }); // no hint at all
    await markWebhookHint(scopeOf(c), { now: () => new Date(NOW.getTime() - 60_000) });
    expect((await runScheduledQboSync(args, testDeps(c, { now: () => NOW }))).status).toBe("SUCCEEDED");
    const requests = c.fake.requests.length;
    // Ninety-five more tasks for the same burst arrive later: the hint was served, so they do nothing.
    expect(await runScheduledQboSync(args, testDeps(c, { now: () => new Date(NOW.getTime() + 20 * 60_000) }))).toMatchObject({ status: "NOT_DUE" });
    expect(c.fake.requests.length).toBe(requests);
    // A hint that lands DURING a sync is not cleared by that sync and is served by the next one.
    await markWebhookHint(scopeOf(c), { now: () => new Date(NOW.getTime() + 25 * 60_000) });
    expect((await db.qboSyncState.findUniqueOrThrow({ where: { connectionId: c.connectionId } })).webhookHintAt).not.toBeNull();
    expect((await runScheduledQboSync(args, testDeps(c, { now: () => new Date(NOW.getTime() + 30 * 60_000) }))).status).toBe("SUCCEEDED");
    expect((await db.qboSyncState.findUniqueOrThrow({ where: { connectionId: c.connectionId } })).webhookHintAt).toBeNull();
  });

  it("the due gate is re-checked INSIDE the lease transaction: a trigger that lost a race gets NOT_DUE and leaves no lease, run or epoch behind", async () => {
    const c = await seedConnected();
    const args = { workspaceId: c.t.ws, connectionId: c.connectionId, trigger: "SCHEDULED" as const };
    expect((await runScheduledQboSync(args, testDeps(c, { now: () => NOW }))).status).toBe("SUCCEEDED");
    const before = await db.qboSyncState.findUniqueOrThrow({ where: { connectionId: c.connectionId } });
    // What a racer that passed the pre-check (it read the state before the first run finished) would now do:
    const raced = await beginSyncRun(
      { ...scopeOf(c), trigger: "SCHEDULED", mode: "INCREMENTAL", idempotencyKey: "scheduled:2026-10-10:racer", requestedById: null, dueGate: { now: new Date(NOW.getTime() + 60_000), cooldownMs: 0 } },
      { now: () => new Date(NOW.getTime() + 60_000) },
    );
    expect(raced).toEqual({ ok: false, reason: "NOT_DUE", nextAttemptNotBefore: new Date("2026-10-11T00:00:00Z") });
    const after = await db.qboSyncState.findUniqueOrThrow({ where: { connectionId: c.connectionId } });
    expect({ epoch: after.leaseEpoch, token: after.leaseToken, attempted: after.lastAttemptedAt }).toEqual({ epoch: before.leaseEpoch, token: null, attempted: before.lastAttemptedAt });
    expect(await db.qboSyncRun.count({ where: { connectionId: c.connectionId } })).toBe(1);
  });

  it("an unserved webhook hint lifts the same-day gate for the SCHEDULED run (a hint no task could serve is not stranded)", async () => {
    const c = await seedConnected();
    const args = { workspaceId: c.t.ws, connectionId: c.connectionId, trigger: "SCHEDULED" as const };
    await runScheduledQboSync(args, testDeps(c, { now: () => NOW }));
    expect((await runScheduledQboSync(args, testDeps(c, { now: () => new Date(NOW.getTime() + 3_600_000) }))).status).toBe("NOT_DUE");
    await markWebhookHint(scopeOf(c), { now: () => new Date(NOW.getTime() + 3_700_000) });
    expect((await runScheduledQboSync(args, testDeps(c, { now: () => new Date(NOW.getTime() + 7_200_000) }))).status).toBe("SUCCEEDED");
  });

  it("MANUAL runs have a cooldown so a loop of fresh request ids cannot burn the realm's quota", async () => {
    const c = await seedConnected();
    const deps = (at: number) => testDeps(c, { now: () => new Date(NOW.getTime() + at), manualCooldownMs: 60_000 });
    expect((await runQboReadSync(manual(c), deps(0))).status).toBe("SUCCEEDED");
    const requests = c.fake.requests.length;
    expect(await runQboReadSync(manual(c), deps(10_000))).toEqual({ status: "NOT_DUE", nextAttemptNotBefore: new Date(NOW.getTime() + 60_000) });
    expect(c.fake.requests.length).toBe(requests);
    expect((await runQboReadSync(manual(c), deps(61_000))).status).toBe("SUCCEEDED");
  });

  describe("expired lease recovery and stale workers", () => {
    it("an expired lease is recovered: the next run takes over, the abandoned run is ABANDONED and audited", async () => {
      const c = await seedConnected();
      const dead = lease(c, await beginSyncRun({ ...scopeOf(c), trigger: "MANUAL", mode: "FULL", idempotencyKey: "manual:dead", requestedById: c.t.actor }, { now: () => NOW }));
      // Within the lease TTL a second starter is refused...
      const refused = await beginSyncRun({ ...scopeOf(c), trigger: "MANUAL", mode: "FULL", idempotencyKey: "manual:x", requestedById: c.t.actor }, { now: () => new Date(NOW.getTime() + QBO_SYNC_LEASE_MS - 1000) });
      expect(refused).toMatchObject({ ok: false, reason: "BUSY", runId: dead.runId });
      // ...after expiry it is recovered.
      const later = new Date(NOW.getTime() + QBO_SYNC_LEASE_MS + 1000);
      const out = await runQboReadSync(manual(c), testDeps(c, { now: () => later }));
      expect(out.status).toBe("SUCCEEDED");
      expect(await db.qboSyncRun.findUniqueOrThrow({ where: { id: dead.runId } })).toMatchObject({ status: "ABANDONED", errorCode: "LEASE_LOST" });
      const ev = await db.auditEvent.findMany({ where: { workspaceId: c.t.ws, eventName: "qbo.sync_lease_recovered" } });
      expect(ev).toHaveLength(1);
      expect((ev[0].payload as { abandonedRunId: string }).abandonedRunId).toBe(dead.runId);
    });

    it("a stale worker can neither write records/reports nor finish a run once its lease was taken over", async () => {
      const c = await seedConnected();
      const stale = lease(c, await beginSyncRun({ ...scopeOf(c), trigger: "MANUAL", mode: "FULL", idempotencyKey: "manual:stale", requestedById: c.t.actor }, { now: () => NOW }));
      const later = new Date(NOW.getTime() + QBO_SYNC_LEASE_MS + 5000);
      const fresh = lease(c, await beginSyncRun({ ...scopeOf(c), trigger: "MANUAL", mode: "FULL", idempotencyKey: "manual:fresh", requestedById: c.t.actor }, { now: () => later }));
      expect(fresh.epoch).toBe(stale.epoch + 1);

      // The new owner writes a result.
      await persistRecordsPage(fresh, [inv("1", "2026-10-01T00:00:00Z")], { now: () => later });
      await finishSyncRunSuccess({ lease: fresh, mode: "FULL", startedAt: later, counts: emptySyncCounts(), changed: true, watermarks: { Invoice: later.toISOString() }, actorId: c.t.actor }, { now: () => later });

      // The stale worker wakes up and tries everything.
      const staleNow = { now: () => new Date(later.getTime() + 1000) };
      await expect(persistRecordsPage(stale, [inv("2", "2026-10-02T00:00:00Z")], staleNow)).rejects.toBeInstanceOf(QboLeaseLostError);
      await expect(extendSyncLease(stale, staleNow)).rejects.toBeInstanceOf(QboLeaseLostError);
      await expect(persistReportObservation(stale, { reportName: "ProfitAndLoss", periodStart: new Date("2026-09-01"), periodEnd: new Date("2026-09-30"), basis: "Accrual", currency: "USD", metrics: {}, inconsistencies: [], contentHash: "a".repeat(64), providerGeneratedAt: null }, staleNow)).rejects.toBeInstanceOf(QboLeaseLostError);
      await expect(finishSyncRunSuccess({ lease: stale, mode: "FULL", startedAt: NOW, counts: emptySyncCounts(), changed: true, watermarks: { Invoice: "1999-01-01T00:00:00.000Z" }, actorId: null }, staleNow)).rejects.toBeInstanceOf(QboLeaseLostError);
      await expect(finishSyncRunFailure({ lease: stale, code: "PROVIDER_UNAVAILABLE", counts: emptySyncCounts(), retryAfterMs: null, actorId: null }, staleNow)).rejects.toBeInstanceOf(QboLeaseLostError);

      // Nothing the stale worker attempted is visible.
      expect(await db.qboSyncedRecord.count({ where: { connectionId: c.connectionId } })).toBe(1);
      expect(await db.qboReportObservation.count({ where: { connectionId: c.connectionId } })).toBe(0);
      const state = await db.qboSyncState.findUniqueOrThrow({ where: { connectionId: c.connectionId } });
      expect(state).toMatchObject({ lastOutcome: "SUCCEEDED", consecutiveFailures: 0 });
      expect((state.watermarks as { Invoice: string }).Invoice).toBe(later.toISOString());
      expect(await db.qboSyncRun.findUniqueOrThrow({ where: { id: fresh.runId } })).toMatchObject({ status: "SUCCEEDED" });
    });

    it("an owner whose lease EXPIRED but was never taken over can still finish (work is not thrown away); a takeover is the only thing that fences it", async () => {
      const c = await seedConnected();
      const slow = lease(c, await beginSyncRun({ ...scopeOf(c), trigger: "MANUAL", mode: "FULL", idempotencyKey: "manual:slow", requestedById: c.t.actor }, { now: () => NOW }));
      const wellPastExpiry = new Date(NOW.getTime() + QBO_SYNC_LEASE_MS * 3);
      await persistRecordsPage(slow, [inv("1", "2026-10-01T00:00:00Z")], { now: () => wellPastExpiry });
      await finishSyncRunSuccess({ lease: slow, mode: "FULL", startedAt: NOW, counts: emptySyncCounts(), changed: true, watermarks: { Invoice: NOW.toISOString() }, actorId: c.t.actor }, { now: () => wellPastExpiry });
      expect(await db.qboSyncRun.findUniqueOrThrow({ where: { id: slow.runId } })).toMatchObject({ status: "SUCCEEDED" });
      expect(await db.qboSyncedRecord.count({ where: { connectionId: c.connectionId } })).toBe(1);
    });

    it("the lease is extended before every provider call, so a slow call cannot outlive it", async () => {
      const c = await seedConnected();
      const expiries: number[] = [];
      const spy = async (input: string, init?: RequestInit) => {
        const st = await db.qboSyncState.findUniqueOrThrow({ where: { connectionId: c.connectionId } });
        if (st.leaseExpiresAt) expiries.push(st.leaseExpiresAt.getTime());
        return c.fake.fetchImpl(input, init);
      };
      let t = NOW.getTime();
      const out = await runQboReadSync(manual(c), testDeps(c, { now: () => new Date((t += 1000)), fetchImpl: spy }));
      expect(out.status).toBe("SUCCEEDED");
      expect(expiries.length).toBeGreaterThan(8);
      for (let i = 1; i < expiries.length; i++) expect(expiries[i]).toBeGreaterThan(expiries[i - 1]); // monotonically re-armed before each call
    });

    it("each persisted page extends the lease, so a long sync is not recovered out from under its owner", async () => {
      const c = await seedConnected();
      const l = lease(c, await beginSyncRun({ ...scopeOf(c), trigger: "MANUAL", mode: "FULL", idempotencyKey: "manual:long", requestedById: c.t.actor }, { now: () => NOW }));
      const t1 = new Date(NOW.getTime() + QBO_SYNC_LEASE_MS - 10_000);
      await persistRecordsPage(l, [inv("1", "2026-10-01T00:00:00Z")], { now: () => t1 });
      // Past the ORIGINAL expiry but inside the extended one: still BUSY.
      const t2 = new Date(NOW.getTime() + QBO_SYNC_LEASE_MS + 60_000);
      expect(await beginSyncRun({ ...scopeOf(c), trigger: "MANUAL", mode: "FULL", idempotencyKey: "manual:other", requestedById: c.t.actor }, { now: () => t2 })).toMatchObject({ ok: false, reason: "BUSY" });
    });
  });

  it("a failure releases the lease, records a sanitized code and back-off; scheduled runs honour it, manual runs do not", async () => {
    const c = await seedConnected();
    c.fake.inject(`companyinfo/${c.realmId}`, { status: 500 }, { status: 500 }, { status: 500 }, { status: 500 });
    const failed = await runScheduledQboSync({ workspaceId: c.t.ws, connectionId: c.connectionId, trigger: "SCHEDULED" }, testDeps(c, { now: () => NOW }));
    expect(failed).toMatchObject({ status: "FAILED", code: "PROVIDER_UNAVAILABLE", terminal: false });
    const state = await db.qboSyncState.findUniqueOrThrow({ where: { connectionId: c.connectionId } });
    expect(state).toMatchObject({ leaseToken: null, lastOutcome: "FAILED", lastErrorCode: "PROVIDER_UNAVAILABLE", consecutiveFailures: 1 });
    expect(state.nextAttemptNotBefore?.toISOString()).toBe(new Date(NOW.getTime() + 15 * 60_000).toISOString());
    // Inside the window a scheduled/webhook trigger is NOT_DUE and issues no request.
    const requests = c.fake.requests.length;
    const early = await runScheduledQboSync({ workspaceId: c.t.ws, connectionId: c.connectionId, trigger: "SCHEDULED" }, testDeps(c, { now: () => new Date(NOW.getTime() + 60_000) }));
    expect(early).toMatchObject({ status: "NOT_DUE" });
    expect(c.fake.requests.length).toBe(requests);
    // A manual run is a deliberate human act and ignores the window; success clears the back-off.
    const ok = await runQboReadSync(manual(c), testDeps(c, { now: () => new Date(NOW.getTime() + 120_000) }));
    expect(ok.status).toBe("SUCCEEDED");
    expect(await db.qboSyncState.findUniqueOrThrow({ where: { connectionId: c.connectionId } })).toMatchObject({ consecutiveFailures: 0, nextAttemptNotBefore: null });
    expect(await db.qboSyncedRecord.count({ where: { connectionId: c.connectionId } })).toBe(1);
    expect((await countRows(c)).runs).toBe(2);
  });
});
