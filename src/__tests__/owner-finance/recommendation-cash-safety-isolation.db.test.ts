/* eslint-disable @typescript-eslint/no-explicit-any -- the gate's DB contract is structural; real Prisma delegates are passed through */
/**
 * Decision 3 — Consulting multi-business cash, on real Postgres. A recommendation's engagement carries no
 * owner business, so with several real businesses the recommendation cash gate takes the WORST valid
 * current state across them (a temporary unscoped-Consulting fail-safe) — never the latest-written
 * business, never an average; with one attributable business, that business's own state (base rule).
 * Two businesses, adversarially ordered so that the OTHER business's diagnosis is always the most recent:
 *   World 1: A safe, then B unsafe → B's unsafe reading holds (worst valid state), whoever wrote last;
 *   World 2: A unsafe, then B safe → the later safe reading never clears A's unsafe one;
 *   World 3: B's unsafe figures are for a period that has not ended → they never count.
 * Real Cash flow diagnoses; the recommendation → finding link (engagement data) is supplied.
 *
 * `[db]`-gated. Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-finance/recommendation-cash-safety-isolation.db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { createCashflowSnapshot } from "@/services/owner-cashflow/snapshot.service";
import { runCashflowDiagnosis } from "@/services/owner-cashflow/diagnosis.service";
import { enforceCashSafetyForPromotion, type CashDeps } from "@/services/owner-finance/recommendation-cash-safety.service";
import { CashSafetyGateError } from "@/domain/owner-finance/cash-safety-gate";

const actor = randomUUID();

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `cash-iso-${actor}@example.com`, name: "Cash isolation QA", isActive: true, updatedAt: new Date() },
  });
});

function period(endDaysAgo = 0) {
  const end = new Date(Date.now() - endDaysAgo * 86_400_000);
  const start = new Date(end.getTime() - 29 * 86_400_000);
  return { periodStart: start.toISOString().slice(0, 10), periodEnd: end.toISOString().slice(0, 10) };
}

const UNSAFE = { cashInHand: 100, bankBalance: 0, dailyCollections: 50, receivables: 20000, receivablesOverdue: 15000, payables: 40000, upcomingEmi: 15000, rentDue: 10000, salaryDue: 20000, vendorDue: 15000, taxDue: 5000, ownerWithdrawal: 4000 };
const SAFE = { cashInHand: 5_000_000, bankBalance: 0, dailyCollections: 50000, receivables: 1000, receivablesOverdue: 0, payables: 1000, upcomingEmi: 0, rentDue: 1000, salaryDue: 1000, vendorDue: 0, taxDue: 0, ownerWithdrawal: 0 };

async function businessWithCash(workspaceId: string, name: string, cash: typeof SAFE, endDaysAgo = 0) {
  const b = await createBusiness({ name, businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false }, actor, workspaceId);
  const snap = await createCashflowSnapshot(b.id, { ...period(endDaysAgo), currency: "INR", ...cash }, actor, workspaceId);
  const cycle = await runCashflowDiagnosis(b.id, snap.id, actor, workspaceId);
  return { id: b.id as string, state: cycle.cashflowState as string };
}

/** Real cycle/business delegates; the recommendation's impact area decides its sensitivity. */
function deps(impactArea = "cash flow"): CashDeps & { reads: any[] } {
  const reads: any[] = [];
  const spy = (delegate: any) => ({ findFirst: async (args: any) => { reads.push(args); return delegate.findFirst(args); } });
  return {
    reads,
    db: {
      clientAccount: db.clientAccount,
      ownerBusiness: db.ownerBusiness,
      ownerCashflowCycle: spy(db.ownerCashflowCycle),
      ownerFinanceCycle: spy(db.ownerFinanceCycle),
      recommendation: { findUnique: async () => ({ findingId: "f1" }) },
      finding: { findFirst: async () => ({ impactArea }) },
    } as any,
  };
}

const outcome = (p: Promise<void>) => p.then(() => "allowed", (e) => (e instanceof CashSafetyGateError ? "blocked" : Promise.reject(e)));

const readBusinesses = (reads: any[]) => [...new Set(reads.map((r) => r.where.businessId))].sort();

describe("[db] Decision 3 — Consulting multi-business cash takes the worst valid current state", () => {
  it("[db] World 1: A safe, B unsafe (diagnosed last) — the unsafe reading holds for every recommendation of the workspace", async () => {
    const workspaceId = randomUUID();
    const a = await businessWithCash(workspaceId, "QA Cash A (safe)", SAFE);
    const b = await businessWithCash(workspaceId, "QA Cash B (unsafe)", UNSAFE);
    expect(["SAFE", "WATCH"]).toContain(a.state);
    expect(["CRITICAL", "INSOLVENT_RISK"]).toContain(b.state);

    const growth = deps("growth");
    expect(await outcome(enforceCashSafetyForPromotion("rec-1", workspaceId, growth))).toBe("blocked");
    expect(readBusinesses(growth.reads)).toEqual([a.id, b.id].sort());
    expect(await outcome(enforceCashSafetyForPromotion("rec-1", workspaceId, deps()))).toBe("blocked");
    // Non-growth, non-spend work is never held by cash below existential risk.
    expect(await outcome(enforceCashSafetyForPromotion("rec-1", workspaceId, deps("customer experience")))).toBe(b.state === "INSOLVENT_RISK" ? "blocked" : "allowed");

    // Only A is a real active business: A's own (safe) state decides; B's reading is never read.
    await db.ownerBusiness.update({ where: { id: b.id }, data: { isActive: false } });
    const onlyA = deps();
    expect(await outcome(enforceCashSafetyForPromotion("rec-1", workspaceId, onlyA))).toBe("allowed");
    expect(readBusinesses(onlyA.reads)).toEqual([a.id]);

    await teardownOwnerBusiness(a.id);
    await teardownOwnerBusiness(b.id);
  });

  it("[db] World 2 (inverse): A unsafe, B safe (diagnosed last) — the later safe reading never clears A (never 'last written wins')", async () => {
    const workspaceId = randomUUID();
    const a = await businessWithCash(workspaceId, "QA Cash A (unsafe)", UNSAFE);
    const b = await businessWithCash(workspaceId, "QA Cash B (safe)", SAFE);
    expect(["CRITICAL", "INSOLVENT_RISK"]).toContain(a.state);
    expect(["SAFE", "WATCH"]).toContain(b.state);

    expect(await outcome(enforceCashSafetyForPromotion("rec-1", workspaceId, deps("growth")))).toBe("blocked");
    expect(await outcome(enforceCashSafetyForPromotion("rec-1", workspaceId, deps()))).toBe("blocked");

    await db.ownerBusiness.update({ where: { id: b.id }, data: { isActive: false } });
    const onlyA = deps();
    expect(await outcome(enforceCashSafetyForPromotion("rec-1", workspaceId, onlyA))).toBe("blocked");
    expect(readBusinesses(onlyA.reads)).toEqual([a.id]);

    await teardownOwnerBusiness(a.id);
    await teardownOwnerBusiness(b.id);
  });

  it("[db] World 3: a business whose only (unsafe) figures are for a period that has not ended contributes nothing", async () => {
    const workspaceId = randomUUID();
    const a = await businessWithCash(workspaceId, "QA Cash A (safe)", SAFE, 5);
    const b = await businessWithCash(workspaceId, "QA Cash B (future, unsafe)", UNSAFE, -30);
    expect(["CRITICAL", "INSOLVENT_RISK"]).toContain(b.state);
    // A's cash is SAFE and it has no Finance half (AT_RISK, the base missing-half rule): growth held, spend allowed —
    // B's future-dated CRITICAL never silently decides.
    expect(await outcome(enforceCashSafetyForPromotion("rec-1", workspaceId, deps("growth")))).toBe("blocked");
    expect(await outcome(enforceCashSafetyForPromotion("rec-1", workspaceId, deps()))).toBe("allowed");
    await teardownOwnerBusiness(a.id);
    await teardownOwnerBusiness(b.id);
  });
});
