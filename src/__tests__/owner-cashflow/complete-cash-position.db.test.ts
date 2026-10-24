/**
 * P1-4 — Cashflow complete-cash-position truth through the REAL persisted services (`[db]`, throwaway local Postgres only).
 * Snapshot creation, diagnosis, the persisted cycle, and Owner Home's survival-evidence assessment (the Portfolio input)
 * must all agree on whether the cash position is established.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { createCashflowSnapshot, getCashflowSnapshot } from "@/services/owner-cashflow/snapshot.service";
import { runCashflowDiagnosis } from "@/services/owner-cashflow/diagnosis.service";
import { resolveOwnerHome } from "@/services/owner-home/home.service";

const actor = randomUUID();
const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const created: string[] = [];
const CASH_FINDINGS = ["CF_INSOLVENT_RUNWAY", "CF_LOW_RUNWAY", "CF_URGENT_PAYMENT_RISK", "CF_VENDOR_CUTOFF_RISK", "CF_DEBT_DEFAULT_RISK", "CF_OWNER_WITHDRAWAL_PRESSURE"];

beforeAll(async () => {
  await db.user.upsert({ where: { id: actor }, update: {}, create: { id: actor, email: `p14-cash-${actor}@example.com`, name: "P1-4", isActive: true, updatedAt: new Date() } });
});
afterAll(async () => {
  for (const id of created) await teardownOwnerBusiness(id).catch(() => undefined);
});

async function business(ws: string, name = "P1-4 Cash") {
  const b = await createBusiness({ name, businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false }, actor, ws);
  created.push(b.id);
  return b.id;
}
/** A burning business: obligations well above collections over a ~30 day period ending `endAgoDays` ago. */
function burning(endAgoDays: number, cash: { cashInHand?: number; bankBalance?: number }) {
  const end = new Date(Date.now() - endAgoDays * DAY);
  return { periodStart: iso(new Date(end.getTime() - 29 * DAY)), periodEnd: iso(end), currency: "INR", dailyCollections: 3000, receivables: 5000, receivablesOverdue: 0, payables: 20000, upcomingEmi: 10000, rentDue: 30000, salaryDue: 60000, vendorDue: 20000, ...cash };
}
async function cycleOf(snapshotId: string) {
  return db.ownerCashflowCycle.findFirst({ where: { snapshotId }, include: { findings: true } });
}

describe("[db] P1-4 complete cash position — persisted snapshot, diagnosis, cycle, Owner Home", () => {
  it("[db] DB-1: cash 0 + bank omitted with real burn → no false insolvency; the gap is named; WATCH; Portfolio's flag agrees", async () => {
    const ws = randomUUID();
    const biz = await business(ws);
    const snap = await createCashflowSnapshot(biz, burning(10, { cashInHand: 0 }) as never, actor, ws);
    expect((await getCashflowSnapshot(snap.id, ws)).missingCriticalData).toEqual(["bankBalance"]);
    await runCashflowDiagnosis(biz, snap.id, actor, ws);
    const cycle = (await cycleOf(snap.id))!;
    expect(cycle.cashflowState).toBe("WATCH");
    const codes = cycle.findings.map((f) => f.code);
    expect(codes).toContain("CF_MISSING_CRITICAL_DATA");
    for (const c of CASH_FINDINGS) expect(codes).not.toContain(c);
    expect(cycle.dangerScore).toBe(0); // missing evidence is not danger
    expect(cycle.healthScore).toBeLessThanOrEqual(50); // and not health either
    const home = await resolveOwnerHome(ws, biz);
    expect(home.survivalEvidence?.cashflowPositionIncomplete).toBe(true);
  });

  it("[db] DB-2: a complete current snapshot makes the position measurable and clears the gap", async () => {
    const ws = randomUUID();
    const biz = await business(ws);
    const partial = await createCashflowSnapshot(biz, burning(40, { cashInHand: 0 }) as never, actor, ws);
    await runCashflowDiagnosis(biz, partial.id, actor, ws);
    expect((await resolveOwnerHome(ws, biz)).survivalEvidence?.cashflowPositionIncomplete).toBe(true);
    const complete = await createCashflowSnapshot(biz, burning(10, { cashInHand: 0, bankBalance: 900000 }) as never, actor, ws);
    expect((await getCashflowSnapshot(complete.id, ws)).missingCriticalData).toEqual([]);
    await runCashflowDiagnosis(biz, complete.id, actor, ws);
    const cycle = (await cycleOf(complete.id))!;
    expect(cycle.findings.map((f) => f.code)).not.toContain("CF_MISSING_CRITICAL_DATA");
    expect(["SAFE", "WATCH"]).toContain(cycle.cashflowState); // measured: ample cash covers the burn
    expect((await resolveOwnerHome(ws, biz)).survivalEvidence?.cashflowPositionIncomplete).toBe(false);
  });

  it("[db] DB-3: cash 0 + bank 0 is a measured zero — not listed missing, legitimately severe with real burn", async () => {
    const ws = randomUUID();
    const biz = await business(ws);
    const snap = await createCashflowSnapshot(biz, burning(10, { cashInHand: 0, bankBalance: 0 }) as never, actor, ws);
    expect((await getCashflowSnapshot(snap.id, ws)).missingCriticalData).toEqual([]);
    await runCashflowDiagnosis(biz, snap.id, actor, ws);
    const cycle = (await cycleOf(snap.id))!;
    expect(cycle.cashflowState).toBe("INSOLVENT_RISK");
    expect(cycle.findings.map((f) => f.code)).toContain("CF_INSOLVENT_RUNWAY");
    expect((await resolveOwnerHome(ws, biz)).survivalEvidence?.cashflowPositionIncomplete).toBe(false);
  });

  it("[db] DB-4: Business A's partial position never affects Business B, in the same workspace or another", async () => {
    const ws = randomUUID();
    const a = await business(ws, "A partial");
    const b = await business(ws, "B complete");
    const sa = await createCashflowSnapshot(a, burning(10, { cashInHand: 0 }) as never, actor, ws);
    await runCashflowDiagnosis(a, sa.id, actor, ws);
    const sb = await createCashflowSnapshot(b, burning(10, { cashInHand: 100000, bankBalance: 800000 }) as never, actor, ws);
    await runCashflowDiagnosis(b, sb.id, actor, ws);
    expect((await resolveOwnerHome(ws, a)).survivalEvidence?.cashflowPositionIncomplete).toBe(true);
    expect((await resolveOwnerHome(ws, b)).survivalEvidence?.cashflowPositionIncomplete).toBe(false);
    expect((await cycleOf(sb.id))!.findings.map((f) => f.code)).not.toContain("CF_MISSING_CRITICAL_DATA");
    // Another workspace's complete business is unaffected, and cannot read A's snapshot.
    const ws2 = randomUUID();
    const c = await business(ws2, "C other workspace");
    const sc = await createCashflowSnapshot(c, burning(10, { cashInHand: 50000, bankBalance: 500000 }) as never, actor, ws2);
    await runCashflowDiagnosis(c, sc.id, actor, ws2);
    expect((await resolveOwnerHome(ws2, c)).survivalEvidence?.cashflowPositionIncomplete).toBe(false);
    await expect(getCashflowSnapshot(sa.id, ws2)).rejects.toThrow();
  });
});
