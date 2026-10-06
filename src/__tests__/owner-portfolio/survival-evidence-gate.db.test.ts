/**
 * P1 remediation — survival-evidence gate through the REAL persisted services (`[db]`, throwaway local Postgres only).
 * Finance, Cashflow and Sales evidence are written and diagnosed through the production services; Owner Home resolves the
 * canonical decision, staleDomains and survival evidence; getPortfolio assembles the view.
 * The ONLY shaped value is the persisted Sales cycle's opportunity score (so a growth signal above the Portfolio minimum
 * exists); everything the gate reads is real.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { createFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import { runFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import { createCashflowSnapshot } from "@/services/owner-cashflow/snapshot.service";
import { createSalesSnapshot } from "@/services/owner-sales/snapshot.service";
import { runSalesDiagnosis } from "@/services/owner-sales/diagnosis.service";
import { getPortfolio } from "@/services/owner-portfolio/portfolio.service";

const actor = randomUUID();
const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const created: string[] = [];

beforeAll(async () => {
  await db.user.upsert({ where: { id: actor }, update: {}, create: { id: actor, email: `p1-survival-${actor}@example.com`, name: "P1 Survival", isActive: true, updatedAt: new Date() } });
});

interface Seed { ws: string; name?: string; financeAgeDays?: number; bankBalance?: number }
/** A business with a current Finance diagnosis (cash recorded), an optional compatible bank balance, and fresh Sales growth evidence. */
async function seed(o: Seed) {
  const b = await createBusiness({ name: o.name ?? "P1 Survival", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false }, actor, o.ws);
  created.push(b.id);
  const fe = new Date(Date.now() - (o.financeAgeDays ?? 10) * DAY);
  const fs = new Date(fe.getTime() - 29 * DAY);
  const fin = await createFinancialSnapshot(b.id, { periodStart: iso(fs), periodEnd: iso(fe), currency: "INR", revenue: 100000, costOfGoodsOrServices: 40000, fixedCosts: 20000, variableCosts: 5000, salaryPayroll: 10000, cashOnHand: 0, receivables: 5000, payables: 1000, loanEmiDebtPayments: 0, totalDebtOutstanding: 0, ownerWithdrawals: 0, orderCount: 100, customerCount: 50, discountAmount: 0, refundAmount: 0 } as never, actor, o.ws);
  if (o.bankBalance !== undefined) {
    await createCashflowSnapshot(b.id, { periodStart: iso(fs), periodEnd: iso(fe), currency: "INR", bankBalance: o.bankBalance } as never, actor, o.ws);
  }
  await runFinanceDiagnosis(b.id, fin.id, actor, o.ws);
  const se = new Date(Date.now() - 10 * DAY);
  const ss = await createSalesSnapshot(b.id, { periodStart: iso(new Date(se.getTime() - 29 * DAY)), periodEnd: iso(se), currency: "INR", leads: 500, qualifiedLeads: 300, orders: 150, revenue: 100000, newCustomers: 60, repeatCustomers: 40, lostCustomers: 2, complaints: 0, discountAmount: 0, refundAmount: 0, b2bRevenue: 0, b2cRevenue: 100000, b2bPipelineValue: 0 } as never, actor, o.ws);
  const sc = await runSalesDiagnosis(b.id, ss.id, actor, o.ws);
  await db.ownerSalesCycle.update({ where: { id: (sc as { id: string }).id }, data: { opportunityScore: 60 } });
  return { businessId: b.id, finance: fin, financeEnd: fe, financeStart: fs };
}
const rowFor = (view: Awaited<ReturnType<typeof getPortfolio>>, id: string) => view.investmentAssessment.held.find((h) => h.businessId === id);

describe("[db] survival-evidence gate — persisted evidence through getPortfolio", () => {
  it("[db] 1: Finance cash recorded, bank unknown, fresh growth → HELD with a bank-balance next step; numeric survival risk stays 0", async () => {
    const ws = randomUUID();
    const a = await seed({ ws });
    const v = await getPortfolio(ws);
    expect(v.businesses.find((x) => x.businessId === a.businessId)!.survivalRiskScore).toBe(0);
    expect(v.investmentRecommendation).toBeNull();
    expect(v.investmentAssessment.status).toBe("HELD");
    const h = rowFor(v, a.businessId)!;
    // Held either by the survival-evidence gate ("bank balance is not confirmed") or — since the action gate now holds
    // growth on incomplete cash evidence — by the canonical decision's own evidence request. Never recommended either way.
    expect(h.ownerStatement).toMatch(/bank balance is not confirmed|cannot support this decision yet/);
    expect(h.nextStep.length).toBeGreaterThan(0);
  });

  it("[db] 2: once the bank balance is supplied and Finance re-diagnosed, the hold clears (every other gate passes)", async () => {
    const ws = randomUUID();
    const a = await seed({ ws });
    expect((await getPortfolio(ws)).investmentRecommendation).toBeNull();
    await createCashflowSnapshot(a.businessId, { periodStart: iso(a.financeStart), periodEnd: iso(a.financeEnd), currency: "INR", bankBalance: 300000 } as never, actor, ws);
    await runFinanceDiagnosis(a.businessId, a.finance.id, actor, ws);
    const v = await getPortfolio(ws);
    expect(v.investmentRecommendation?.businessId).toBe(a.businessId);
    expect(v.investmentAssessment.status).toBe("RECOMMENDED");
  });

  it("[db] 3: stale Finance (with a compatible bank) cannot clear investment while Sales growth is fresh", async () => {
    const ws = randomUUID();
    const a = await seed({ ws, financeAgeDays: 70, bankBalance: 300000 });
    const v = await getPortfolio(ws);
    expect(v.investmentRecommendation).toBeNull();
    expect(v.investmentAssessment.status).toBe("HELD");
    // Held either by the canonical refresh target (when stale Finance still has open work) or by the survival-evidence gate
    // (when it has none — covered with the real resolver in survival-evidence-gate.test.ts); both say the figures are out of date.
    expect(rowFor(v, a.businessId)!.ownerStatement).toMatch(/out of date/);
    expect(rowFor(v, a.businessId)!.nextStep.length).toBeGreaterThan(0);
  });

  it("[db] 4: Business A's incomplete evidence never affects Business B, in the same workspace or another", async () => {
    const ws = randomUUID();
    const a = await seed({ ws, name: "A incomplete" });
    const b = await seed({ ws, name: "B complete", bankBalance: 300000 });
    const v = await getPortfolio(ws);
    expect(v.investmentRecommendation?.businessId).toBe(b.businessId);
    expect(v.investmentAssessment.held.map((h) => h.businessId)).toEqual([a.businessId]);
    // A separate workspace with a complete business is unaffected by the first workspace's held business.
    const ws2 = randomUUID();
    const c = await seed({ ws: ws2, name: "C complete", bankBalance: 300000 });
    const v2 = await getPortfolio(ws2);
    expect(v2.investmentRecommendation?.businessId).toBe(c.businessId);
    expect(v2.investmentAssessment.held).toEqual([]);
    expect(v2.businesses.map((x) => x.businessId)).toEqual([c.businessId]);
  });
});

afterAll(async () => {
  for (const id of created) await teardownOwnerBusiness(id).catch(() => undefined);
});
