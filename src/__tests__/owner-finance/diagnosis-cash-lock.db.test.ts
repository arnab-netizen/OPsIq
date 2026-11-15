/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows */
/**
 * Diagnosis vs Cashflow bank-balance writes — DB-backed proof (`[db]`, local throwaway Postgres, separate connections).
 *
 * Invariant: a diagnosis never commits as "current" if a bank-balance mutation committed during its window and it did not
 * observe it. Mechanism: the diagnosis holds the cash-position advisory lock SHARED from before its authoritative balance read
 * and evidence stamp THROUGH the commit that persists the cycle; Cashflow create/amend hold it EXCLUSIVE. Orderings use the
 * DATABASE clock on both sides (never an application clock). Pauses are barriers inside the lock span, not sleeps.
 *
 * Run: OPSIQ_DB_TARGET=local TEST_WITH_DB=true DATABASE_URL=<loopback throwaway> npx vitest run src/__tests__/owner-finance/diagnosis-cash-lock.db.test.ts
 */
import { describe, it, expect, vi, afterEach, afterAll } from "vitest";
import { spawn } from "child_process";
import path from "path";
import { Client } from "pg";
import { randomUUID } from "crypto";

const hooks = vi.hoisted(() => ({ afterBalanceRead: null as null | (() => Promise<void>), banksUsed: [] as Array<number | undefined> }));
vi.mock("@/services/owner-cashflow/effective-cashflow.service", async (importOriginal) => {
  const mod: any = await importOriginal();
  return {
    ...mod,
    // The authoritative (locked, transaction-bound) balance read of a diagnosis passes `client`; pause right after it, once.
    loadEffectiveCashflowCandidates: async (ws: string, biz: string, asOf: any, opts: any = {}) => {
      const rows = await mod.loadEffectiveCashflowCandidates(ws, biz, asOf, opts);
      const hook = opts.client ? hooks.afterBalanceRead : null;
      if (hook) {
        hooks.afterBalanceRead = null;
        await hook();
      }
      return rows;
    },
  };
});

vi.mock("@/domain/owner-finance/diagnosis", async (importOriginal) => {
  const mod: any = await importOriginal();
  return {
    ...mod,
    // What bank balance each diagnosis computation actually used (a retry shows up as a second computation).
    diagnoseFinanceSnapshot: (input: any) => { hooks.banksUsed.push(input.bankBalance); return mod.diagnoseFinanceSnapshot(input); },
  };
});

import { db } from "@/lib/db";
import { createFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import { runFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import { cashPositionChangedSince } from "@/services/owner-finance/liquidity.service";
import { createCashflowSnapshot } from "@/services/owner-cashflow/snapshot.service";
import { acceptFirstResultAction } from "@/services/owner-first-run/first-run-actions.service";
import { createFirstBusiness, getFirstMoneyRead } from "@/services/owner-first-run/first-run.service";
import { ConflictError } from "@/infra/errors";
import { READ_STALE_MESSAGE } from "@/domain/owner-first-run/read-staleness";

const period = () => {
  const end = new Date();
  end.setUTCDate(0);
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  return { periodStart: start.toISOString().slice(0, 10), periodEnd: end.toISOString().slice(0, 10) };
};

async function setup() {
  const workspaceId = randomUUID();
  const userId = randomUUID();
  await db.user.create({ data: { id: userId, email: `${userId}@cashlock.test`, emailVerifiedAt: new Date(Date.now() - 120_000), requiresEmailVerification: true, updatedAt: new Date() } });
  await db.workspace.create({ data: { id: workspaceId, name: "Cash Lock Co", slug: `ws-${workspaceId.slice(0, 8)}`, createdBy: userId } });
  const { business } = await createFirstBusiness(workspaceId, userId, { businessType: "laundry_local_service", currency: "gbp" });
  const p = period();
  const snap: any = await createFinancialSnapshot(business.id, { ...p, currency: "GBP", revenue: 12000, fixedCosts: 7000, variableCosts: 4000, cashOnHand: 1500 } as any, userId, workspaceId);
  const cash: any = await createCashflowSnapshot(business.id, { ...p, currency: "GBP", cashInHand: 1500 } as any, userId, workspaceId);
  return { workspaceId, userId, businessId: business.id, snap, cash, p };
}
type T = Awaited<ReturnType<typeof setup>>;

const diagnose = (t: T) => runFinanceDiagnosis(t.businessId, t.snap.id, t.userId, t.workspaceId);
const latestCycle = (t: T): Promise<any> => db.ownerFinanceCycle.findFirst({ where: { businessId: t.businessId, snapshotId: t.snap.id }, orderBy: { sequenceNumber: "desc" } });
const changedSince = (t: T, cycle: any) => cashPositionChangedSince(t.workspaceId, t.businessId, new Date(t.p.periodEnd), cycle.generatedAt);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Second sessions ─────────────────────────────────────────────────────────────────────────────────────────────────
// The app pool is max:1 per process, so a concurrent writer is its OWN process (own pool/connection); mid-test inspection of
// the database uses a raw pg connection, never the (possibly occupied) app pool.
const observer = new Client({ connectionString: process.env.DATABASE_URL });
let observerConnected = false;
async function obs(): Promise<Client> {
  if (!observerConnected) { observerConnected = true; await observer.connect(); }
  return observer;
}
afterAll(async () => { if (observerConnected) await observer.end(); });

const TSX = path.resolve(process.cwd(), "node_modules/.bin/tsx");
const CHILD = path.resolve(process.cwd(), "src/__tests__/test-helpers/cashflow-writer-child.ts");
interface ChildResult { ok: boolean; name?: string; code?: string; message?: string }
function writerProcess(spec: Record<string, unknown>): { done: Promise<ChildResult>; state: { done: boolean } } {
  const env = { ...process.env } as Record<string, string | undefined>;
  delete env.VITEST; delete env.VITEST_WORKER_ID; delete env.VITEST_POOL_ID;
  const child = spawn(TSX, [CHILD, JSON.stringify(spec)], { env: env as NodeJS.ProcessEnv, stdio: ["ignore", "pipe", "pipe"] });
  let out = ""; let err = "";
  child.stdout.on("data", (d) => (out += d)); child.stderr.on("data", (d) => (err += d));
  const state = { done: false };
  const done = new Promise<ChildResult>((resolve, reject) => {
    child.on("close", () => {
      state.done = true;
      const line = out.split("\n").find((l) => l.startsWith("RESULT:"));
      if (!line) return reject(new Error(`writer process produced no result: ${err.slice(-800)}`));
      resolve(JSON.parse(line.slice("RESULT:".length)));
    });
  });
  return { done, state };
}
const amendProc = (t: T, updatedAt: Date, bankBalance: number, extra: Record<string, unknown> = {}) =>
  writerProcess({ op: "amend", workspaceId: t.workspaceId, actorId: t.userId, snapshotId: t.cash.id, input: { expectedUpdatedAt: updatedAt.toISOString(), bankBalance }, ...extra });

/** Wait (bounded, polled — not a fixed sleep) until some session is WAITING for an advisory lock. */
async function waitForAdvisoryWaiter(timeoutMs = 60_000): Promise<void> {
  const c = await obs();
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const r = await c.query("SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND NOT granted");
    if (r.rowCount && r.rowCount > 0) return;
    await sleep(50);
  }
  throw new Error("no session is waiting for the cash-position lock");
}

function barrier() {
  let open!: () => void;
  const gate = new Promise<void>((r) => (open = r));
  let reached!: () => void;
  const atBarrier = new Promise<void>((r) => (reached = r));
  return { open, gate, reached, atBarrier };
}
const settled = <V,>(p: Promise<V>) => { const s = { done: false }; void p.then(() => (s.done = true), () => (s.done = true)); return s; };
const lockKey = (businessId: string) => `owner_cash_position:${businessId}`;

afterEach(() => { hooks.afterBalanceRead = null; hooks.banksUsed.length = 0; });

describe("[db] diagnosis holds the cash-position lock shared from the balance read through its commit", () => {
  it("[db] T1 an amend (second session) that starts while a diagnosis is paused inside its lock span BLOCKS; the read is then stale, Accept is refused, Update makes it acceptable", async () => {
    const t = await setup();
    const b = barrier();
    hooks.afterBalanceRead = async () => { b.reached(); await b.gate; };
    const a = diagnose(t);
    await b.atBarrier; // A has read the balance (none) inside its lock span and is paused

    const writer = amendProc(t, t.cash.updatedAt, 90000);
    await waitForAdvisoryWaiter(); // B is queued behind A's shared lock
    expect(writer.state.done).toBe(false);

    b.open();
    await a;
    expect(await writer.done).toEqual({ ok: true }); // B commits only after A has committed
    expect(hooks.banksUsed).toEqual([undefined]); // A did not observe B's balance
    const cycle = await latestCycle(t);
    expect(await changedSince(t, cycle)).toBe(true); // by construction newer, so A is flagged stale

    const view: any = await getFirstMoneyRead(t.workspaceId, t.businessId);
    expect(view.staleReason).toBe("CASH_POSITION_CHANGED");
    const refused = await acceptFirstResultAction(t.workspaceId, t.userId, t.businessId, randomUUID(), view.cycleId).catch((e) => e);
    expect(refused).toBeInstanceOf(ConflictError);
    expect((refused as Error).message).toBe(READ_STALE_MESSAGE);

    await diagnose(t); // "Update my read"
    expect(hooks.banksUsed.at(-1)).toBe(90000);
    const fresh: any = await getFirstMoneyRead(t.workspaceId, t.businessId);
    expect(fresh.staleReason ?? null).toBeNull();
    const accepted = await acceptFirstResultAction(t.workspaceId, t.userId, t.businessId, randomUUID(), fresh.cycleId);
    expect(accepted.replayed).toBe(false);
  }, 180_000);

  it("[db] T2 a write that committed first is OBSERVED by the diagnosis, which is current", async () => {
    const t = await setup();
    expect(await amendProc(t, t.cash.updatedAt, 90000).done).toEqual({ ok: true });
    await diagnose(t);
    expect(hooks.banksUsed).toEqual([90000]);
    const cycle = await latestCycle(t);
    expect(await changedSince(t, cycle)).toBe(false);
    const view: any = await getFirstMoneyRead(t.workspaceId, t.businessId);
    expect(view.staleReason ?? null).toBeNull();
  }, 180_000);

  it("[db] T3 a writer holding the exclusive lock while a diagnosis starts: the diagnosis WAITS, notices the change, recomputes and observes the committed balance", async () => {
    const t = await setup();
    const w = await obs();
    await w.query("BEGIN");
    await w.query("SELECT pg_advisory_xact_lock(hashtext($1))", [lockKey(t.businessId)]);
    await w.query("UPDATE owner_cashflow_snapshots SET bank_balance = 90000, updated_at = (clock_timestamp() AT TIME ZONE 'UTC') WHERE id = $1", [t.cash.id]);
    const a = diagnose(t);
    const aState = settled(a);
    await waitForAdvisoryWaiter();
    expect(aState.done).toBe(false);
    await w.query("COMMIT");
    await a;
    expect(hooks.banksUsed).toEqual([undefined, 90000]); // first computation predated the commit; the locked check forced a second
    const cycle = await latestCycle(t);
    expect(await changedSince(t, cycle)).toBe(false);
  }, 180_000);

  it("[db] T4 stale detection survives a writer application clock 5s BEHIND the diagnosis (the database clock orders both)", async () => {
    const t = await setup();
    const b = barrier();
    hooks.afterBalanceRead = async () => { b.reached(); await b.gate; };
    const a = diagnose(t);
    await b.atBarrier;
    const writer = amendProc(t, t.cash.updatedAt, 90000, { skewMs: 5000 });
    await waitForAdvisoryWaiter();
    b.open();
    await a;
    expect(await writer.done).toEqual({ ok: true });
    const cycle = await latestCycle(t);
    const row: any = await db.ownerCashflowSnapshot.findFirst({ where: { id: t.cash.id } });
    expect(row.updatedAt.getTime()).toBeGreaterThanOrEqual(cycle.generatedAt.getTime());
    expect(await changedSince(t, cycle)).toBe(true);
  }, 180_000);

  it("[db] T5 concurrent diagnoses, amends, creates and accepts across sessions: no deadlock, everything finishes", async () => {
    const t = await setup();
    await diagnose(t);
    const N = 3;
    const writers: Array<Promise<ChildResult>> = [];
    for (let i = 0; i < N; i++) {
      writers.push(amendProc(t, t.cash.updatedAt, 1000 + i).done);
      const end = new Date(Date.UTC(2025, i, 28));
      writers.push(writerProcess({
        op: "create", workspaceId: t.workspaceId, actorId: t.userId, businessId: t.businessId,
        input: { periodStart: new Date(Date.UTC(2025, i, 1)).toISOString().slice(0, 10), periodEnd: end.toISOString().slice(0, 10), currency: "GBP", bankBalance: 500 + i },
      }).done);
    }
    const local: Array<Promise<unknown>> = [];
    // Diagnoses of ONE business run back to back here: two simultaneous diagnoses race on the cycle sequence number (a separate,
    // pre-existing unique-index race that this lock does not and need not serialise); the subject is diagnosis vs writers vs accept.
    local.push((async () => { for (let i = 0; i < N; i++) await diagnose(t); })());
    for (let i = 0; i < N; i++) {
      local.push((async () => {
        const v: any = await getFirstMoneyRead(t.workspaceId, t.businessId);
        return acceptFirstResultAction(t.workspaceId, t.userId, t.businessId, randomUUID(), v.cycleId);
      })());
    }
    const [remote, here] = await Promise.all([Promise.all(writers), Promise.allSettled(local)]);
    for (const r of remote) {
      if (!r.ok) {
        expect(r.message).not.toMatch(/deadlock|40P01/i);
        expect(r.code === "CASHFLOW_STALE" || r.name === "CashflowConflictError").toBe(true); // lost the compare-and-set, nothing else
      }
    }
    expect(remote.filter((r) => r.ok).length).toBeGreaterThanOrEqual(N + 1); // all creates + exactly one amend winner
    for (const r of here) {
      if (r.status === "rejected") {
        expect(String((r.reason as Error)?.message ?? r.reason)).not.toMatch(/deadlock|40P01/i);
        expect(r.reason).toBeInstanceOf(ConflictError); // stale read / retry exhausted — never an unhandled failure
      }
    }
    expect(here.filter((r) => r.status === "fulfilled").length).toBeGreaterThan(0);
  }, 240_000);
});
