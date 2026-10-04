/**
 * A1 — liquidity contract through the real services (`[db]`-gated, throwaway local Postgres only).
 * Finance snapshot holds cash in hand; the bank balance lives on a Cashflow snapshot and is enriched
 * ONCE through loadUsableBankBalance → selectUsableBankBalance.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { createFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import { runFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import { createCashflowSnapshot } from "@/services/owner-cashflow/snapshot.service";
import { getBudgetForecast } from "@/services/owner-budget/budget.service";

const actor = randomUUID();
const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `a1-liquidity-${actor}@example.com`, name: "A1 Liquidity", isActive: true, updatedAt: new Date() },
  });
});

async function scenario(cashOnHand: number | undefined) {
  const workspaceId = randomUUID();
  const b = await createBusiness(
    { name: "A1 Liquidity Test", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
    actor, workspaceId
  );
  const periodEnd = new Date(Date.now() - 10 * DAY);
  const snap = await createFinancialSnapshot(
    b.id,
    { periodStart: iso(new Date(periodEnd.getTime() - 30 * DAY)), periodEnd: iso(periodEnd), currency: "INR", revenue: 100000, fixedCosts: 130000, cashOnHand },
    actor, workspaceId
  );
  return { workspaceId, businessId: b.id, snap, periodEnd };
}
const codesOf = (d: { findings: Array<{ code: string }> }) => d.findings.map((f) => f.code);

describe("[db] A1 liquidity contract — services", () => {
  it("[db] audit repro: cash in hand 0, no bank recorded → no insolvency, bank balance requested", async () => {
    const s = await scenario(0);
    const d = await runFinanceDiagnosis(s.businessId, s.snap.id, actor, s.workspaceId);
    expect(d.survivalState).not.toBe("INSOLVENT_RISK");
    expect(codesOf(d)).not.toContain("FIN_INSOLVENT_RUNWAY");
    expect(codesOf(d)).toContain("FIN_LIQUIDITY_UNCONFIRMED");
    await teardownOwnerBusiness(s.businessId);
  });

  it("[db] guided-setup shape: cash in hand 0 + bank 120000 on a Cashflow snapshot for the same period → counted, no false survival state", async () => {
    const s = await scenario(0);
    await createCashflowSnapshot(
      s.businessId,
      { periodStart: iso(new Date(s.periodEnd.getTime() - 30 * DAY)), periodEnd: iso(s.periodEnd), currency: "INR", bankBalance: 120000 },
      actor, s.workspaceId
    );
    const d = await runFinanceDiagnosis(s.businessId, s.snap.id, actor, s.workspaceId);
    expect(d.survivalState).not.toBe("INSOLVENT_RISK");
    expect(codesOf(d)).not.toContain("FIN_INSOLVENT_RUNWAY");
    expect(codesOf(d)).not.toContain("FIN_LIQUIDITY_UNCONFIRMED");
    await teardownOwnerBusiness(s.businessId);
  });

  it("[db] true zero: cash 0 + bank 0 recorded → the insolvency warning still fires", async () => {
    const s = await scenario(0);
    await createCashflowSnapshot(
      s.businessId,
      { periodStart: iso(new Date(s.periodEnd.getTime() - 30 * DAY)), periodEnd: iso(s.periodEnd), currency: "INR", bankBalance: 0 },
      actor, s.workspaceId
    );
    const d = await runFinanceDiagnosis(s.businessId, s.snap.id, actor, s.workspaceId);
    expect(codesOf(d)).toContain("FIN_INSOLVENT_RUNWAY");
    await teardownOwnerBusiness(s.businessId);
  });

  it("[db] stale bank (older than the window) is rejected, not treated as 0", async () => {
    const s = await scenario(0);
    const staleEnd = new Date(s.periodEnd.getTime() - 120 * DAY);
    await createCashflowSnapshot(
      s.businessId,
      { periodStart: iso(new Date(staleEnd.getTime() - 30 * DAY)), periodEnd: iso(staleEnd), currency: "INR", bankBalance: 900000 },
      actor, s.workspaceId
    );
    const d = await runFinanceDiagnosis(s.businessId, s.snap.id, actor, s.workspaceId);
    expect(codesOf(d)).toContain("FIN_LIQUIDITY_UNCONFIRMED");
    expect(codesOf(d)).not.toContain("FIN_INSOLVENT_RUNWAY");
    await teardownOwnerBusiness(s.businessId);
  });

  it("[db] future bank (after the Finance period) is rejected", async () => {
    const s = await scenario(0);
    const futureEnd = new Date(s.periodEnd.getTime() + 20 * DAY);
    await createCashflowSnapshot(
      s.businessId,
      { periodStart: iso(new Date(futureEnd.getTime() - 30 * DAY)), periodEnd: iso(futureEnd), currency: "INR", bankBalance: 900000 },
      actor, s.workspaceId
    );
    const d = await runFinanceDiagnosis(s.businessId, s.snap.id, actor, s.workspaceId);
    expect(codesOf(d)).toContain("FIN_LIQUIDITY_UNCONFIRMED");
    await teardownOwnerBusiness(s.businessId);
  });

  it("[db] Budget forecast starts from total liquid funds and says when the position is incomplete", async () => {
    const s = await scenario(10000);
    const before = await getBudgetForecast(s.workspaceId, s.businessId);
    expect(before.liquidityComplete).toBe(false);
    await createCashflowSnapshot(
      s.businessId,
      { periodStart: iso(new Date(s.periodEnd.getTime() - 30 * DAY)), periodEnd: iso(s.periodEnd), currency: "INR", bankBalance: 120000 },
      actor, s.workspaceId
    );
    const after = await getBudgetForecast(s.workspaceId, s.businessId);
    expect(after.liquidityComplete).toBe(true);
    expect(JSON.stringify(after)).toContain("130000");
    await teardownOwnerBusiness(s.businessId);
  });
});
