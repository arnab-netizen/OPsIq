/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy returns untyped rows */
/**
 * Cashflow bank-balance EDIT path + deterministic current-row selection — DB-backed proof (`[db]`, local throwaway Postgres).
 *
 * Proves, through the real services and independent connections:
 *   - the owner can add a missing balance and change/clear a recorded one, with the current value visible first;
 *   - freshness (expectedUpdatedAt) and replacement consent (confirmReplace) are INDEPENDENT guards;
 *   - concurrent writers are serialised: exactly one wins, the others get CASHFLOW_STALE;
 *   - a no-op writes nothing; a foreign tenant's id is the same not-found as an unknown id;
 *   - every change is audited with before/after in the same transaction, append-only;
 *   - tied rows (same periodEnd, different periodStart / updatedAt / null balance) resolve by ONE deterministic rule;
 *   - a read's staleness follows the effective balance (add, edit, tied sibling, other period, out of window).
 *
 * Run: OPSIQ_DB_TARGET=local TEST_WITH_DB=true DATABASE_URL=<loopback throwaway> npx vitest run src/__tests__/owner-cashflow/amend.db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { Client } from "pg";
import { db } from "@/lib/db";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { amendCashflowSnapshot, createCashflowSnapshot, getCashflowSnapshot } from "@/services/owner-cashflow/snapshot.service";
import { CashflowConflictError } from "@/services/owner-cashflow/cashflow-conflict";
import { loadEffectiveCashflowRow, loadEffectiveCashflowCandidates } from "@/services/owner-cashflow/effective-cashflow.service";
import { cashPositionChangedSince, loadUsableBankBalance } from "@/services/owner-finance/liquidity.service";
import { NotFoundError } from "@/infra/errors";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { calculateDataConfidence } from "@/domain/owner-cashflow/data-confidence";
import { rowToCashflowInput } from "@/domain/owner-cashflow/row-input";

const actor = randomUUID();
const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const AMENDED = AUDIT_EVENTS.CASHFLOW_SNAPSHOT_AMENDED;

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `cashflow-amend-${actor}@example.com`, name: "Cashflow Amend", isActive: true, updatedAt: new Date() },
  });
});

async function tenant() {
  const workspaceId = randomUUID();
  const b = await createBusiness(
    { name: "Cashflow Amend Test", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
    actor,
    workspaceId
  );
  return { workspaceId, businessId: b.id };
}

const SEPT = { periodStart: "2026-09-01", periodEnd: "2026-09-30", currency: "INR" };
const mk = (t: { workspaceId: string; businessId: string }, over: Record<string, unknown> = {}) =>
  createCashflowSnapshot(t.businessId, { ...SEPT, ...over } as any, actor, t.workspaceId);
const stamp = (r: { updatedAt: Date }) => r.updatedAt.toISOString();
const events = (t: { workspaceId: string }, id: string) =>
  db.auditEvent.findMany({ where: { workspaceId: t.workspaceId, eventName: AMENDED, entityId: id }, orderBy: { occurredAt: "asc" } });
async function conflictOf(p: Promise<unknown>): Promise<CashflowConflictError> {
  try { await p; } catch (e) { if (e instanceof CashflowConflictError) return e; throw e; }
  throw new Error("expected a CashflowConflictError");
}

describe("[db] adding a missing bank balance", () => {
  it("[db] fills a blank balance without confirmation, keeps period and currency, recomputes confidence and audits before/after", async () => {
    const t = await tenant();
    // Obligations and collections are known, so the cash position is the only critical gap and the score moves with it.
    const row: any = await mk(t, { cashInHand: 500, dailyCollections: 100, rentDue: 10, receivables: 1, receivablesOverdue: 0, payables: 1, payablesOverdue: 0 });
    expect(row.bankBalance).toBeNull();
    expect(row.missingCriticalData).toContain("bankBalance");

    const res = await amendCashflowSnapshot(row.id, { expectedUpdatedAt: stamp(row), bankBalance: 2500 }, actor, t.workspaceId);
    expect(res.changed).toBe(true);
    expect(res.snapshot.bankBalance).toBe(2500);
    expect(res.snapshot.cashInHand).toBe(500); // untouched figure
    expect(res.snapshot.periodStart.toISOString()).toBe(row.periodStart.toISOString());
    expect(res.snapshot.periodEnd.toISOString()).toBe(row.periodEnd.toISOString());
    expect(res.snapshot.currency).toBe("INR");
    expect(res.snapshot.updatedAt.getTime()).toBeGreaterThan(row.updatedAt.getTime());
    expect(res.snapshot.missingCriticalData).not.toContain("bankBalance");
    expect(res.snapshot.dataConfidenceScore).toBeGreaterThan(row.dataConfidenceScore);
    expect(res.snapshot.dataConfidenceScore).toBe(calculateDataConfidence(rowToCashflowInput(res.snapshot)).dataConfidenceScore); // the existing helper, not a second formula

    const ev = await events(t, row.id);
    expect(ev).toHaveLength(1);
    expect(ev[0].payload).toMatchObject({ snapshotId: row.id, businessId: t.businessId, changedFields: { bankBalance: { before: null, after: 2500 } } });
    expect(ev[0].actorId).toBe(actor);
    await teardownOwnerBusiness(t.businessId);
  });

  it("[db] a recorded ZERO is a value: filling a blank with 0 needs no confirmation, replacing that 0 does", async () => {
    const t = await tenant();
    const row: any = await mk(t);
    const zero = await amendCashflowSnapshot(row.id, { expectedUpdatedAt: stamp(row), bankBalance: 0 }, actor, t.workspaceId);
    expect(zero.snapshot.bankBalance).toBe(0);
    const c = await conflictOf(amendCashflowSnapshot(row.id, { expectedUpdatedAt: stamp(zero.snapshot), bankBalance: 10 }, actor, t.workspaceId));
    expect(c.body.code).toBe("CASHFLOW_REPLACEMENT_CONFIRMATION_REQUIRED");
    await teardownOwnerBusiness(t.businessId);
  });
});

describe("[db] replacing a recorded balance", () => {
  it("[db] needs explicit confirmation, shows current + proposed, and leaves the row untouched until confirmed", async () => {
    const t = await tenant();
    const row: any = await mk(t, { bankBalance: 1000 });
    const c = await conflictOf(amendCashflowSnapshot(row.id, { expectedUpdatedAt: stamp(row), bankBalance: 4000 }, actor, t.workspaceId));
    expect(c.body).toMatchObject({
      code: "CASHFLOW_REPLACEMENT_CONFIRMATION_REQUIRED",
      snapshotId: row.id,
      updatedAt: stamp(row),
      current: { bankBalance: 1000, cashInHand: null },
      proposed: { bankBalance: 4000 },
    });
    const same: any = await getCashflowSnapshot(row.id, t.workspaceId);
    expect(same.bankBalance).toBe(1000);
    expect(stamp(same)).toBe(stamp(row));
    expect(await events(t, row.id)).toHaveLength(0);

    const ok = await amendCashflowSnapshot(row.id, { expectedUpdatedAt: stamp(row), bankBalance: 4000, confirmReplace: true }, actor, t.workspaceId);
    expect(ok.snapshot.bankBalance).toBe(4000);
    const ev = await events(t, row.id);
    expect(ev).toHaveLength(1);
    expect(ev[0].payload).toMatchObject({ changedFields: { bankBalance: { before: 1000, after: 4000 } } });
    await teardownOwnerBusiness(t.businessId);
  });

  it("[db] clearing a recorded balance is a replacement too (confirmation required; the audit keeps the old value)", async () => {
    const t = await tenant();
    const row: any = await mk(t, { bankBalance: 1000 });
    const c = await conflictOf(amendCashflowSnapshot(row.id, { expectedUpdatedAt: stamp(row), bankBalance: null }, actor, t.workspaceId));
    expect(c.body.code).toBe("CASHFLOW_REPLACEMENT_CONFIRMATION_REQUIRED");
    const ok = await amendCashflowSnapshot(row.id, { expectedUpdatedAt: stamp(row), bankBalance: null, confirmReplace: true }, actor, t.workspaceId);
    expect(ok.snapshot.bankBalance).toBeNull();
    expect(ok.snapshot.missingCriticalData).toContain("bankBalance");
    expect((await events(t, row.id))[0].payload).toMatchObject({ changedFields: { bankBalance: { before: 1000, after: null } } });
    await teardownOwnerBusiness(t.businessId);
  });
});

describe("[db] freshness and consent are independent", () => {
  it("[db] confirmReplace WITHOUT a fresh expectedUpdatedAt is still CASHFLOW_STALE (consent never bypasses freshness)", async () => {
    const t = await tenant();
    const row: any = await mk(t, { bankBalance: 1000 });
    const first = await amendCashflowSnapshot(row.id, { expectedUpdatedAt: stamp(row), bankBalance: 1200, confirmReplace: true }, actor, t.workspaceId);
    const c = await conflictOf(amendCashflowSnapshot(row.id, { expectedUpdatedAt: stamp(row), bankBalance: 9999, confirmReplace: true }, actor, t.workspaceId));
    expect(c.body.code).toBe("CASHFLOW_STALE");
    expect(c.body).toMatchObject({ snapshotId: row.id, updatedAt: stamp(first.snapshot), current: { bankBalance: 1200, cashInHand: null } });
    expect(((await getCashflowSnapshot(row.id, t.workspaceId)) as any).bankBalance).toBe(1200);
    await teardownOwnerBusiness(t.businessId);
  });

  it("[db] a FRESH expectedUpdatedAt WITHOUT confirmReplace is still CONFIRMATION_REQUIRED (freshness never implies consent)", async () => {
    const t = await tenant();
    const row: any = await mk(t, { bankBalance: 1000 });
    const c = await conflictOf(amendCashflowSnapshot(row.id, { expectedUpdatedAt: stamp(row), bankBalance: 1, confirmReplace: false }, actor, t.workspaceId));
    expect(c.body.code).toBe("CASHFLOW_REPLACEMENT_CONFIRMATION_REQUIRED");
    await teardownOwnerBusiness(t.businessId);
  });

  it("[db] a stale token is refused for a blank-filling edit too, with the current values to review", async () => {
    const t = await tenant();
    const row: any = await mk(t, { cashInHand: 5 });
    await amendCashflowSnapshot(row.id, { expectedUpdatedAt: stamp(row), cashInHand: 6, confirmReplace: true }, actor, t.workspaceId);
    const c = await conflictOf(amendCashflowSnapshot(row.id, { expectedUpdatedAt: stamp(row), bankBalance: 77 }, actor, t.workspaceId));
    expect(c.body).toMatchObject({ code: "CASHFLOW_STALE", current: { bankBalance: null, cashInHand: 6 } });
    expect(((await getCashflowSnapshot(row.id, t.workspaceId)) as any).bankBalance).toBeNull();
    await teardownOwnerBusiness(t.businessId);
  });

  it("[db] a stale token is checked BEFORE the no-op shortcut (a screen showing old figures is never told 'nothing changed')", async () => {
    const t = await tenant();
    const row: any = await mk(t, { bankBalance: 100 });
    await amendCashflowSnapshot(row.id, { expectedUpdatedAt: stamp(row), bankBalance: 200, confirmReplace: true }, actor, t.workspaceId);
    const c = await conflictOf(amendCashflowSnapshot(row.id, { expectedUpdatedAt: stamp(row), bankBalance: 100 }, actor, t.workspaceId));
    expect(c.body.code).toBe("CASHFLOW_STALE");
    await teardownOwnerBusiness(t.businessId);
  });
});

describe("[db] concurrent writers", () => {
  it("[db] N simultaneous amendments from the same view: exactly one wins, every other gets CASHFLOW_STALE", async () => {
    for (const writers of [2, 4]) {
      const t = await tenant();
      const row: any = await mk(t, { cashInHand: 1 });
      const results = await Promise.allSettled(
        Array.from({ length: writers }, (_, i) => amendCashflowSnapshot(row.id, { expectedUpdatedAt: stamp(row), bankBalance: 1000 + i }, actor, t.workspaceId))
      );
      const won = results.filter((r) => r.status === "fulfilled");
      const lost = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      expect(won).toHaveLength(1);
      expect(lost).toHaveLength(writers - 1);
      for (const l of lost) {
        expect(l.reason).toBeInstanceOf(CashflowConflictError);
        expect((l.reason as CashflowConflictError).body.code).toBe("CASHFLOW_STALE");
      }
      const final: any = await getCashflowSnapshot(row.id, t.workspaceId);
      expect(final.bankBalance).toBe((won[0] as PromiseFulfilledResult<any>).value.snapshot.bankBalance);
      expect(await events(t, row.id)).toHaveLength(1); // the losers wrote nothing
      await teardownOwnerBusiness(t.businessId);
    }
  });

  it("[db] an amendment WAITS on a writer holding the row (separate connection) and then refuses the stale view", async () => {
    const t = await tenant();
    const row: any = await mk(t, { cashInHand: 1 });
    const other = new Client({ connectionString: process.env.DATABASE_URL });
    await other.connect();
    try {
      await other.query("BEGIN");
      await other.query("SELECT id FROM owner_cashflow_snapshots WHERE id = $1 FOR UPDATE", [row.id]);
      let settled = false;
      const pending = amendCashflowSnapshot(row.id, { expectedUpdatedAt: stamp(row), bankBalance: 50 }, actor, t.workspaceId).then(
        () => { settled = true; return "ok" as const; },
        (e) => { settled = true; return e as unknown; }
      );
      await new Promise((r) => setTimeout(r, 400));
      expect(settled, "the amendment must be blocked by the other connection's row lock").toBe(false);
      // The other writer changes the entry and commits.
      await other.query("UPDATE owner_cashflow_snapshots SET bank_balance = 999, updated_at = $2 WHERE id = $1", [row.id, new Date(row.updatedAt.getTime() + 5000)]);
      await other.query("COMMIT");
      const outcome = await pending;
      expect(outcome).toBeInstanceOf(CashflowConflictError);
      expect((outcome as CashflowConflictError).body).toMatchObject({ code: "CASHFLOW_STALE", current: { bankBalance: 999 } });
    } finally {
      await other.end();
    }
    await teardownOwnerBusiness(t.businessId);
  });
});

describe("[db] no-op, tenancy, validation", () => {
  it("[db] a no-op returns changed:false, does NOT bump updatedAt and writes no audit event", async () => {
    const t = await tenant();
    const row: any = await mk(t, { bankBalance: 321, cashInHand: 12 });
    const res = await amendCashflowSnapshot(row.id, { expectedUpdatedAt: stamp(row), bankBalance: 321, cashInHand: 12 }, actor, t.workspaceId);
    expect(res.changed).toBe(false);
    expect(res.changedFields).toEqual({});
    expect(stamp(res.snapshot)).toBe(stamp(row));
    expect(stamp((await getCashflowSnapshot(row.id, t.workspaceId)) as any)).toBe(stamp(row));
    expect(await events(t, row.id)).toHaveLength(0);
    await teardownOwnerBusiness(t.businessId);
  });

  it("[db] a foreign tenant's amend is the same NotFoundError as an unknown id — and changes nothing", async () => {
    const a = await tenant();
    const b = await tenant();
    const row: any = await mk(a, { bankBalance: 10 });
    const foreign = await amendCashflowSnapshot(row.id, { expectedUpdatedAt: stamp(row), bankBalance: 99, confirmReplace: true }, actor, b.workspaceId).catch((e) => e);
    const unknownId = randomUUID();
    const unknown = await amendCashflowSnapshot(unknownId, { expectedUpdatedAt: stamp(row), bankBalance: 99, confirmReplace: true }, actor, b.workspaceId).catch((e) => e);
    expect(foreign).toBeInstanceOf(NotFoundError);
    expect(unknown).toBeInstanceOf(NotFoundError);
    expect((foreign as NotFoundError).statusCode).toBe(404);
    expect((foreign as NotFoundError).message.replace(row.id, "<id>")).toBe((unknown as NotFoundError).message.replace(unknownId, "<id>"));
    expect(((await getCashflowSnapshot(row.id, a.workspaceId)) as any).bankBalance).toBe(10);
    expect(await events(a, row.id)).toHaveLength(0);
    await teardownOwnerBusiness(a.businessId);
    await teardownOwnerBusiness(b.businessId);
  });
});

describe("[db] audit history", () => {
  it("[db] every change is its own event with before/after; earlier events never change; the sequence replays to the current value", async () => {
    const t = await tenant();
    const row: any = await mk(t);
    let cur: any = row;
    const steps: Array<{ value: number | null; confirm: boolean }> = [{ value: 100, confirm: false }, { value: 250, confirm: true }, { value: null, confirm: true }];
    const snapshots: string[] = [];
    for (const s of steps) {
      const r = await amendCashflowSnapshot(row.id, { expectedUpdatedAt: stamp(cur), bankBalance: s.value, confirmReplace: s.confirm }, actor, t.workspaceId);
      cur = r.snapshot;
      snapshots.push(JSON.stringify((await events(t, row.id)).map((e: any) => [e.id, e.payload])));
    }
    const ev: any[] = await events(t, row.id);
    expect(ev.map((e) => (e.payload as any).changedFields.bankBalance)).toEqual([
      { before: null, after: 100 },
      { before: 100, after: 250 },
      { before: 250, after: null },
    ]);
    // Append-only: each earlier prefix is byte-identical in every later read.
    expect(JSON.parse(snapshots[2]).slice(0, 2)).toEqual(JSON.parse(snapshots[1]));
    expect(JSON.parse(snapshots[1]).slice(0, 1)).toEqual(JSON.parse(snapshots[0]));
    expect(cur.bankBalance).toBeNull();
    // The workspace audit chain stays linked (each event hashes its predecessor).
    expect(ev.slice(1).every((e) => typeof e.previousHash === "string" && e.previousHash.length > 0)).toBe(true);
    await teardownOwnerBusiness(t.businessId);
  });
});

describe("[db] creating a second entry for the same period", () => {
  it("[db] is refused with CASHFLOW_PERIOD_EXISTS carrying the existing entry's id + updatedAt and a truthful message", async () => {
    const t = await tenant();
    const row: any = await mk(t, { cashInHand: 5 });
    const c = await conflictOf(mk(t, { bankBalance: 9 }));
    expect(c.body).toMatchObject({ code: "CASHFLOW_PERIOD_EXISTS", snapshotId: row.id, updatedAt: stamp(row) });
    expect(c.message).toBe("You already have a cashflow entry for this period. Open it to edit.");
    expect(c.message).not.toMatch(/instead/i);
    await teardownOwnerBusiness(t.businessId);
  });

  it("[db] two simultaneous creates of one period: one entry exists, the loser gets the same machine answer (not a 500)", async () => {
    const t = await tenant();
    const results = await Promise.allSettled([mk(t, { bankBalance: 1 }), mk(t, { bankBalance: 2 }), mk(t, { bankBalance: 3 })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results.filter((r): r is PromiseRejectedResult => r.status === "rejected")) {
      expect(r.reason).toBeInstanceOf(CashflowConflictError);
      expect((r.reason as CashflowConflictError).body.code).toBe("CASHFLOW_PERIOD_EXISTS");
      expect((r.reason as CashflowConflictError).body.snapshotId).toBeTruthy();
    }
    expect(await db.ownerCashflowSnapshot.count({ where: { businessId: t.businessId } })).toBe(1);
    await teardownOwnerBusiness(t.businessId);
  });
});

describe("[db] deterministic current-row selection (ties)", () => {
  // Finance period ends 2026-09-30; Cashflow rows share that periodEnd with different periodStart.
  const E = new Date("2026-09-30T00:00:00.000Z");
  const tied = (t: { workspaceId: string; businessId: string }, start: string, over: Record<string, unknown> = {}) =>
    mk(t, { periodStart: start, periodEnd: "2026-09-30", ...over });

  it("[db] a same-end row with a NULL balance never shadows a sibling that has one — in either creation order", async () => {
    for (const emptyFirst of [true, false]) {
      const t = await tenant();
      if (emptyFirst) { await tied(t, "2026-09-10", { cashInHand: 1 }); await tied(t, "2026-09-01", { bankBalance: 700 }); }
      else { await tied(t, "2026-09-01", { bankBalance: 700 }); await tied(t, "2026-09-10", { cashInHand: 1 }); }
      expect(await loadUsableBankBalance(t.workspaceId, t.businessId, E)).toBe(700);
      expect((await loadEffectiveCashflowRow(t.workspaceId, t.businessId, E))?.bankBalance).toBe(700);
      await teardownOwnerBusiness(t.businessId);
    }
  });

  it("[db] both have a balance: the owner's MOST RECENT statement (latest updatedAt) wins, and an edit makes the edited row the latest", async () => {
    const t = await tenant();
    const a: any = await tied(t, "2026-09-01", { bankBalance: 100 });
    await new Promise((r) => setTimeout(r, 15));
    const b: any = await tied(t, "2026-09-10", { bankBalance: 200 });
    expect(await loadUsableBankBalance(t.workspaceId, t.businessId, E)).toBe(200);
    await new Promise((r) => setTimeout(r, 15));
    await amendCashflowSnapshot(a.id, { expectedUpdatedAt: stamp(a), bankBalance: 300, confirmReplace: true }, actor, t.workspaceId);
    expect(await loadUsableBankBalance(t.workspaceId, t.businessId, E)).toBe(300);
    // Clearing the latest statement hands the selection to the sibling that still has a balance (not to "unknown").
    const aNow: any = await getCashflowSnapshot(a.id, t.workspaceId);
    await amendCashflowSnapshot(a.id, { expectedUpdatedAt: stamp(aNow), bankBalance: null, confirmReplace: true }, actor, t.workspaceId);
    expect(await loadUsableBankBalance(t.workspaceId, t.businessId, E)).toBe(200);
    expect(b.id).toBeTruthy();
    await teardownOwnerBusiness(t.businessId);
  });

  it("[db] identical updatedAt: the later periodStart wins; the result never depends on database row order", async () => {
    const t = await tenant();
    const a: any = await tied(t, "2026-09-01", { bankBalance: 111 });
    const b: any = await tied(t, "2026-09-20", { bankBalance: 222 });
    const same = new Date("2026-10-02T09:00:00.000Z");
    await db.ownerCashflowSnapshot.updateMany({ where: { id: { in: [a.id, b.id] } }, data: { updatedAt: same } });
    for (let i = 0; i < 3; i++) {
      expect(await loadUsableBankBalance(t.workspaceId, t.businessId, E)).toBe(222);
      // Touch the physical order (a no-change rewrite moves the tuple) — selection must not care.
      await db.$executeRaw`UPDATE owner_cashflow_snapshots SET notes = notes WHERE business_id = ${t.businessId}::uuid`;
    }
    await teardownOwnerBusiness(t.businessId);
  });

  it("[db] a wide tie (more rows than one page) is still resolved exactly", async () => {
    const t = await tenant();
    // 30 rows share periodEnd; the winner (has a balance) is the OLDEST updatedAt and the EARLIEST start — i.e. the last
    // row a page ordered by recency would reach. It must still beat 29 empty rows.
    const winner: any = await tied(t, "2026-08-02", { bankBalance: 4242 });
    await db.ownerCashflowSnapshot.update({ where: { id: winner.id }, data: { updatedAt: new Date("2026-01-01T00:00:00.000Z") } });
    for (let i = 0; i < 29; i++) {
      const start = new Date(Date.UTC(2026, 8, 1) - (i + 3) * DAY);
      if (start.getTime() <= new Date("2026-08-02T00:00:00Z").getTime()) start.setTime(Date.UTC(2026, 7, 3) + i * DAY);
      await tied(t, iso(start), { cashInHand: i + 1 }).catch(() => undefined);
    }
    const n = await db.ownerCashflowSnapshot.count({ where: { businessId: t.businessId } });
    expect(n).toBeGreaterThan(25);
    expect((await loadEffectiveCashflowCandidates(t.workspaceId, t.businessId, E)).length).toBe(n);
    expect(await loadUsableBankBalance(t.workspaceId, t.businessId, E)).toBe(4242);
    await teardownOwnerBusiness(t.businessId);
  });

  it("[db] later-period and stale rows do not alter an earlier read (selection ≤ the Finance period end; freshness unchanged)", async () => {
    const t = await tenant();
    await mk(t, { periodStart: "2026-10-01", periodEnd: "2026-10-31", bankBalance: 9999 }); // after the Finance period
    expect(await loadUsableBankBalance(t.workspaceId, t.businessId, E)).toBeUndefined();
    await mk(t, { periodStart: "2026-06-01", periodEnd: "2026-06-30", bankBalance: 5 }); // outside the 45-day window
    expect(await loadUsableBankBalance(t.workspaceId, t.businessId, E)).toBeUndefined();
    await mk(t, { periodStart: "2026-08-15", periodEnd: "2026-09-15", bankBalance: 8 }); // inside the window
    expect(await loadUsableBankBalance(t.workspaceId, t.businessId, E)).toBe(8);
    await teardownOwnerBusiness(t.businessId);
  });
});

describe("[db] cashPositionChangedSince — what makes a read stale", () => {
  const E = new Date("2026-09-30T00:00:00.000Z");
  it("[db] a new balance for the read's period, and an edit of it, both flag a read made before them; neither flags a read made after", async () => {
    const t = await tenant();
    const readMade = new Date(Date.now() - 1);
    await new Promise((r) => setTimeout(r, 20));
    expect(await cashPositionChangedSince(t.workspaceId, t.businessId, E, readMade)).toBe(false); // nothing recorded yet
    const row: any = await mk(t, { bankBalance: 100 });
    expect(await cashPositionChangedSince(t.workspaceId, t.businessId, E, readMade)).toBe(true); // added after the read
    const readAgain = new Date();
    await new Promise((r) => setTimeout(r, 20));
    expect(await cashPositionChangedSince(t.workspaceId, t.businessId, E, readAgain)).toBe(false); // the read already includes it
    await amendCashflowSnapshot(row.id, { expectedUpdatedAt: stamp(row), bankBalance: 150, confirmReplace: true }, actor, t.workspaceId);
    expect(await cashPositionChangedSince(t.workspaceId, t.businessId, E, readAgain)).toBe(true); // edited after the read
    await teardownOwnerBusiness(t.businessId);
  });

  it("[db] an edit that hands the selection to a TIED sibling still flags the read (the winner's own row may look unchanged)", async () => {
    const t = await tenant();
    const a: any = await mk(t, { periodStart: "2026-09-01", periodEnd: "2026-09-30", bankBalance: 100 });
    await new Promise((r) => setTimeout(r, 15));
    await mk(t, { periodStart: "2026-09-10", periodEnd: "2026-09-30", bankBalance: 50 });
    const readMade = new Date();
    await new Promise((r) => setTimeout(r, 20));
    expect(await cashPositionChangedSince(t.workspaceId, t.businessId, E, readMade)).toBe(false);
    await amendCashflowSnapshot(a.id, { expectedUpdatedAt: stamp(a), bankBalance: null, confirmReplace: true }, actor, t.workspaceId);
    expect(await cashPositionChangedSince(t.workspaceId, t.businessId, E, readMade)).toBe(true);
    await teardownOwnerBusiness(t.businessId);
  });

  it("[db] changes the read cannot use do not flag it: a LATER period, and a balance outside the freshness window", async () => {
    const t = await tenant();
    const readMade = new Date(Date.now() - 1);
    await new Promise((r) => setTimeout(r, 20));
    await mk(t, { periodStart: "2026-10-01", periodEnd: "2026-10-31", bankBalance: 1 });
    expect(await cashPositionChangedSince(t.workspaceId, t.businessId, E, readMade)).toBe(false);
    await mk(t, { periodStart: "2026-05-01", periodEnd: "2026-05-31", bankBalance: 1 });
    expect(await cashPositionChangedSince(t.workspaceId, t.businessId, E, readMade)).toBe(false);
    await teardownOwnerBusiness(t.businessId);
  });

  it("[db] is scoped: another business's balance never flags this one", async () => {
    const a = await tenant();
    const b = await tenant();
    const readMade = new Date(Date.now() - 1);
    await new Promise((r) => setTimeout(r, 20));
    await mk(b, { bankBalance: 1 });
    expect(await cashPositionChangedSince(a.workspaceId, a.businessId, E, readMade)).toBe(false);
    await teardownOwnerBusiness(a.businessId);
    await teardownOwnerBusiness(b.businessId);
  });
});
