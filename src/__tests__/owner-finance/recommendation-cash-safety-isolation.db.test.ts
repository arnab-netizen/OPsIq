/* eslint-disable @typescript-eslint/no-explicit-any -- the gate's DB contract is structural; real Prisma delegates are passed through */
/**
 * P2 — cross-business cash safety (sibling of the margin gate). The recommendation cash-safety gate
 * reads the cash/finance state of the ONE business a recommendation is attributable to — never the
 * workspace-wide "latest cycle", which may belong to another business. Two businesses in one
 * workspace, adversarially ordered so that the OTHER business's diagnosis is always the most recent:
 *   World 1: A safe, then B unsafe → B never blocks A's recommendation;
 *   World 2: A unsafe, then B safe → B never clears A once A is attributable.
 * Real Postgres, real Cash flow diagnoses; the recommendation → finding link (engagement data) is
 * supplied as a finance-sensitive recommendation.
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

function period() {
  const end = new Date();
  const start = new Date(end.getTime() - 29 * 86_400_000);
  return { periodStart: start.toISOString().slice(0, 10), periodEnd: end.toISOString().slice(0, 10) };
}

const UNSAFE = { cashInHand: 100, dailyCollections: 50, receivables: 20000, receivablesOverdue: 15000, payables: 40000, upcomingEmi: 15000, rentDue: 10000, salaryDue: 20000, vendorDue: 15000, taxDue: 5000, ownerWithdrawal: 4000 };
const SAFE = { cashInHand: 5_000_000, dailyCollections: 50000, receivables: 1000, receivablesOverdue: 0, payables: 1000, upcomingEmi: 0, rentDue: 1000, salaryDue: 1000, vendorDue: 0, taxDue: 0, ownerWithdrawal: 0 };

async function businessWithCash(workspaceId: string, name: string, cash: typeof SAFE) {
  const b = await createBusiness({ name, businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false }, actor, workspaceId);
  const snap = await createCashflowSnapshot(b.id, { ...period(), currency: "INR", ...cash }, actor, workspaceId);
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

describe("[db] P2 — recommendation cash safety has zero cross-business influence", () => {
  it("[db] World 1: A safe, B unsafe (diagnosed last) — B never blocks A", async () => {
    const workspaceId = randomUUID();
    const a = await businessWithCash(workspaceId, "QA Cash A (safe)", SAFE);
    const b = await businessWithCash(workspaceId, "QA Cash B (unsafe)", UNSAFE);
    expect(["SAFE", "WATCH"]).toContain(a.state);
    expect(["CRITICAL", "INSOLVENT_RISK"]).toContain(b.state);

    // Two real businesses: the recommendation is not attributable — no business's cycle is read. Unknown
    // cash is AT_RISK: a growth recommendation ABSTAINS (never "safe enough"), spend proceeds unassessed —
    // B's unsafe reading plays no part either way, nor would a safe one.
    const both = deps("growth");
    expect(await outcome(enforceCashSafetyForPromotion("rec-1", workspaceId, both))).toBe("blocked");
    expect(both.reads).toEqual([]);
    const spend = deps();
    expect(await outcome(enforceCashSafetyForPromotion("rec-1", workspaceId, spend))).toBe("allowed");
    expect(spend.reads).toEqual([]);

    // Only A is attributable: A's own (safe) state decides — B's newer unsafe reading has no influence.
    await db.ownerBusiness.update({ where: { id: b.id }, data: { isActive: false } });
    const onlyA = deps();
    expect(await outcome(enforceCashSafetyForPromotion("rec-1", workspaceId, onlyA))).toBe("allowed");
    expect(onlyA.reads.map((r) => r.where)).toEqual([{ workspaceId, businessId: a.id }, { workspaceId, businessId: a.id }]);

    await teardownOwnerBusiness(a.id);
    await teardownOwnerBusiness(b.id);
  });

  it("[db] World 2 (inverse): A unsafe, B safe (diagnosed last) — B never clears A", async () => {
    const workspaceId = randomUUID();
    const a = await businessWithCash(workspaceId, "QA Cash A (unsafe)", UNSAFE);
    const b = await businessWithCash(workspaceId, "QA Cash B (safe)", SAFE);
    expect(["CRITICAL", "INSOLVENT_RISK"]).toContain(a.state);
    expect(["SAFE", "WATCH"]).toContain(b.state);

    // Identical to World 1: with two businesses the outcome does not depend on either business's reading.
    const both = deps("growth");
    expect(await outcome(enforceCashSafetyForPromotion("rec-1", workspaceId, both))).toBe("blocked");
    expect(both.reads).toEqual([]);
    expect(await outcome(enforceCashSafetyForPromotion("rec-1", workspaceId, deps()))).toBe("allowed");

    await db.ownerBusiness.update({ where: { id: b.id }, data: { isActive: false } });
    const onlyA = deps();
    // A's own unsafe reading blocks the finance-sensitive recommendation, although B's safe reading is newer.
    expect(await outcome(enforceCashSafetyForPromotion("rec-1", workspaceId, onlyA))).toBe("blocked");
    expect(onlyA.reads.map((r) => r.where)).toEqual([{ workspaceId, businessId: a.id }, { workspaceId, businessId: a.id }]);

    await teardownOwnerBusiness(a.id);
    await teardownOwnerBusiness(b.id);
  });
});
