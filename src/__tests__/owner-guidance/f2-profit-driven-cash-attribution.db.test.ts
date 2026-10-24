/**
 * F2 — a profit-driven Finance risk must never be narrated as a cash danger, through the REAL Now View adapter
 * (`[db]`, throwaway local Postgres only): Finance findings → financeSurvivalDriver → currentCashFinanceReading →
 * getOwnerNowView → buildCashProfitProtection signals.
 *
 * Production observation ("PR592 Smoke Risk"): revenue 30,000, fixed 20,000, variable 6,000, cash 4,000, bank unknown →
 * Finance AT_RISK driven by fixed-cost burden (+ FIN_LIQUIDITY_UNCONFIRMED); Home said "Cash survival state is at risk" /
 * "The cashflow signals put the business in an at-risk survival state" with no cash flow data and no measured cash danger.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { createFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import { runFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import { createCashflowSnapshot } from "@/services/owner-cashflow/snapshot.service";
import { runCashflowDiagnosis } from "@/services/owner-cashflow/diagnosis.service";
import { getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";
import { seedKnownBank } from "../test-helpers/seed-known-bank";

const actor = randomUUID();
const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const per = { periodStart: iso(new Date(Date.now() - 35 * DAY)), periodEnd: iso(new Date(Date.now() - 5 * DAY)), currency: "INR" };

beforeAll(async () => {
  await db.user.upsert({ where: { id: actor }, update: {}, create: { id: actor, email: `f2-attr-${actor}@example.com`, name: "F2 Attribution", isActive: true, updatedAt: new Date() } });
});

async function biz() {
  const ws = randomUUID();
  const b = await createBusiness({ name: "F2 Attribution", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false }, actor, ws);
  return { ws, b: b.id };
}
async function signals(ws: string, b: string) {
  const nv = await getOwnerNowView(ws, b);
  return nv.cashProfitProtection?.signals ?? [];
}
const cashSignal = (s: Awaited<ReturnType<typeof signals>>) => s.find((x) => x.signalType === "CASH_SAFETY_RISK");
const marginSignal = (s: Awaited<ReturnType<typeof signals>>) => s.find((x) => x.signalType === "LOW_MARGIN_WORK_RISK");

describe("[db] F2: cash/profit protection attribution through the real Now View path", () => {
  it("[db] F2-A: profit-driven Finance AT_RISK + liquidity unconfirmed, no Cashflow → margin signal only; no cash signal; the gap stays explicit", async () => {
    const { ws, b } = await biz();
    const snap = await createFinancialSnapshot(b, { ...per, revenue: 30000, fixedCosts: 20000, variableCosts: 6000, cashOnHand: 4000 }, actor, ws);
    const cycle = await runFinanceDiagnosis(b, snap.id, actor, ws);
    const codes = cycle.findings.map((f: { code: string }) => f.code);
    expect(cycle.survivalState).toBe("AT_RISK");
    expect(codes).toContain("FIN_HIGH_FIXED_COST_BURDEN");
    expect(codes).toContain("FIN_LIQUIDITY_UNCONFIRMED");
    expect(codes).not.toContain("FIN_LOW_ABSOLUTE_CASH");
    const s = await signals(ws, b);
    expect(cashSignal(s)).toBeUndefined();
    expect(marginSignal(s)?.title).toBe("Margin state is at risk"); // severity of the real (profit) risk is kept
    expect(marginSignal(s)?.severity).toBe("MEDIUM");
    expect(JSON.stringify(s)).not.toMatch(/cashflow signals|Cash survival state/i);
    await teardownOwnerBusiness(b);
  });

  it("[db] F2-B: genuine cash-driven Finance AT_RISK with a complete position → the cash signal is allowed, with the measured days", async () => {
    const { ws, b } = await biz();
    await seedKnownBank(ws, b, 0, { start: per.periodStart, end: per.periodEnd });
    const snap = await createFinancialSnapshot(b, { ...per, revenue: 180000, fixedCosts: 110000, variableCosts: 60000, cashOnHand: 40000 }, actor, ws);
    const cycle = await runFinanceDiagnosis(b, snap.id, actor, ws);
    expect(cycle.findings.map((f: { code: string }) => f.code)).toContain("FIN_LOW_ABSOLUTE_CASH");
    const c = cashSignal(await signals(ws, b));
    expect(c?.title).toBe("Cash survival state is at risk");
    expect(c?.ownerExplanation).toMatch(/cash on hand covers about 7\.\d days of total costs/);
    await teardownOwnerBusiness(b);
  });

  it("[db] F2-C: genuine Cash flow danger drives a cash signal at its own severity", async () => {
    const { ws, b } = await biz();
    const s = await createCashflowSnapshot(b, { ...per, cashInHand: 3000, bankBalance: 2000, dailyCollections: 1000, receivables: 5000, receivablesOverdue: 0, payables: 40000, upcomingEmi: 10000, rentDue: 30000, salaryDue: 60000, vendorDue: 20000 } as never, actor, ws);
    const cf: { cashflowState: string } = await runCashflowDiagnosis(b, s.id, actor, ws) as never;
    expect(cf.cashflowState).toBe("INSOLVENT_RISK");
    const c = cashSignal(await signals(ws, b));
    expect(c?.severity).toBe("CRITICAL");
    expect(c?.title).toBe("Cash survival state is insolvent risk");
    await teardownOwnerBusiness(b);
  });

  it("[db] F2-D: profit-driven CRITICAL (negative margin) with ample, fully-known cash → still critical, attributed to margin; never a cash survival claim", async () => {
    const { ws, b } = await biz();
    await seedKnownBank(ws, b, 500000, { start: per.periodStart, end: per.periodEnd });
    const snap = await createFinancialSnapshot(b, { ...per, revenue: 20000, fixedCosts: 30000, variableCosts: 10000, cashOnHand: 400000 }, actor, ws);
    const cycle = await runFinanceDiagnosis(b, snap.id, actor, ws);
    expect(cycle.survivalState).toBe("CRITICAL");
    expect(cycle.findings.map((f: { code: string }) => f.code)).toContain("FIN_NEGATIVE_NET_MARGIN");
    const s = await signals(ws, b);
    expect(cashSignal(s)).toBeUndefined();
    expect(marginSignal(s)?.severity).toBe("HIGH"); // genuine severity not downgraded
    expect(JSON.stringify(s)).not.toMatch(/cashflow signals|Cash survival state/i);
    await teardownOwnerBusiness(b);
  });

  it("[db] F2-E: both cash and profit findings → the deciding (cash) driver keeps the cash signal; margin signal also present", async () => {
    const { ws, b } = await biz();
    await seedKnownBank(ws, b, 0, { start: per.periodStart, end: per.periodEnd });
    const snap = await createFinancialSnapshot(b, { ...per, revenue: 100000, fixedCosts: 70000, variableCosts: 20000, cashOnHand: 8000 }, actor, ws);
    const cycle = await runFinanceDiagnosis(b, snap.id, actor, ws);
    const codes = cycle.findings.map((f: { code: string }) => f.code);
    expect(codes).toContain("FIN_LOW_ABSOLUTE_CASH");
    expect(codes).toContain("FIN_HIGH_FIXED_COST_BURDEN");
    const s = await signals(ws, b);
    expect(cashSignal(s)?.ownerExplanation).toMatch(/2\.\d days of total costs/);
    expect(marginSignal(s)).toBeDefined();
    await teardownOwnerBusiness(b);
  });
});
