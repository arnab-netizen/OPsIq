/**
 * P1-4 second amendment — through the REAL persisted services (`[db]`, throwaway local Postgres only):
 *  F1: Now View's Cashflow runway proxy is "measured" only for a CURRENT, evidence-complete Cashflow reading — a stale,
 *      absent, future-dated or incomplete reading never yields a runway change message (no synthetic 0 / 45 / 120).
 *  F2: an evidence gap on the owner dashboard is "needs data" — never healthy, at-risk, critical or improving — while a
 *      genuinely measured at-risk / critical business still drives the workspace status.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "crypto";

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement:
    (handler: (ctx: unknown, params: Record<string, string>) => unknown) =>
    (ctx: unknown, params: Record<string, string>) =>
      handler(ctx, params),
}));

import { db } from "@/lib/db";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { createCashflowSnapshot } from "@/services/owner-cashflow/snapshot.service";
import { runCashflowDiagnosis } from "@/services/owner-cashflow/diagnosis.service";
import { createFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import { runFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import { enforceOwnerActionGates } from "@/services/owner-mode/owner-action-gate.service";
import { getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";
import { buildOwnerDashboardPayload } from "@/app/api/owner/dashboard/route";

const actor = randomUUID();
const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const created: string[] = [];
beforeAll(async () => {
  await db.user.upsert({ where: { id: actor }, update: {}, create: { id: actor, email: `p14-f12-${actor}@example.com`, name: "P1-4 F1F2", isActive: true, updatedAt: new Date() } });
});
afterAll(async () => {
  for (const id of created) await teardownOwnerBusiness(id).catch(() => undefined);
});
async function biz(ws: string, name = "P1-4 F12") {
  const b = await createBusiness({ name, businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false }, actor, ws);
  created.push(b.id);
  return b.id;
}
const period = (endAgo: number) => { const e = new Date(Date.now() - endAgo * DAY); return { periodStart: iso(new Date(e.getTime() - 29 * DAY)), periodEnd: iso(e), currency: "INR" }; };
const complete = (endAgo: number, over: object = {}) => ({ ...period(endAgo), cashInHand: 500000, bankBalance: 500000, dailyCollections: 8000, receivables: 5000, receivablesOverdue: 0, payables: 20000, upcomingEmi: 10000, rentDue: 15000, salaryDue: 40000, vendorDue: 10000, taxDue: 5000, ownerWithdrawal: 20000, ...over });
const completeWatch = (endAgo: number) => complete(endAgo, { cashInHand: 50000, bankBalance: 50000, dailyCollections: 5000, payables: 80000, upcomingEmi: 0, rentDue: 10000, salaryDue: 20000, vendorDue: 0, taxDue: 0, ownerWithdrawal: 0 });
const incomplete = (endAgo: number) => ({ ...period(endAgo), cashInHand: 0, dailyCollections: 3000, receivables: 5000, receivablesOverdue: 0, payables: 20000, upcomingEmi: 10000, rentDue: 30000, salaryDue: 60000, vendorDue: 20000 });
async function cashCycle(ws: string, b: string, snapshot: object) {
  const s = await createCashflowSnapshot(b, snapshot as never, actor, ws);
  await runCashflowDiagnosis(b, s.id, actor, ws);
  return s;
}
const runwayText = async (ws: string, b: string) => (await getOwnerNowView(ws, b)).whatChanged.map((x) => x.reason).filter((r) => /runway/i.test(r)).join(" | ");
const dash = async (ws: string): Promise<any> => buildOwnerDashboardPayload({ request: new Request("http://localhost/api/owner/dashboard") } as any, ws, actor);

describe("[db] F1: Cashflow runway proxy is comparable only for a current, evidence-complete reading", () => {
  it("[db] F1-A: a Cashflow cycle that went STALE after a measured 120-day reading yields no 'fell to 0 days'", async () => {
    const ws = randomUUID(); const b = await biz(ws);
    const s = await cashCycle(ws, b, complete(5));
    await getOwnerNowView(ws, b); // records the prior MEASURED state (SAFE → 120)
    await db.ownerCashflowSnapshot.update({ where: { id: s.id }, data: { periodStart: new Date(Date.now() - 260 * DAY), periodEnd: new Date(Date.now() - 230 * DAY) } });
    const text = await runwayText(ws, b);
    expect(text).toBe("");
  });
  it("[db] F1-B: no Cashflow cycle at all after a measured reading yields no runway message", async () => {
    const ws = randomUUID(); const b = await biz(ws);
    const s = await cashCycle(ws, b, complete(5));
    await getOwnerNowView(ws, b);
    const cyc = await db.ownerCashflowCycle.findFirst({ where: { snapshotId: s.id } });
    await db.ownerCashflowAction.deleteMany({ where: { cycleId: cyc!.id } });
    await db.ownerCashflowFinding.deleteMany({ where: { cycleId: cyc!.id } });
    await db.ownerCashflowCycle.delete({ where: { id: cyc!.id } });
    const text = await runwayText(ws, b);
    expect(text).toBe("");
  });
  it("[db] F1-C: a current but INCOMPLETE reading yields no runway message (measured → unmeasured, then unmeasured → measured)", async () => {
    const ws = randomUUID(); const b = await biz(ws);
    await cashCycle(ws, b, complete(40));
    await getOwnerNowView(ws, b);
    await cashCycle(ws, b, incomplete(10));
    expect(await runwayText(ws, b)).toBe("");
    await cashCycle(ws, b, complete(3));
    expect(await runwayText(ws, b)).toBe("");
  });
  it("[db] F1-D control: a current, complete measured SAFE → WATCH change keeps 'fell from 120 to 45 days'", async () => {
    const ws = randomUUID(); const b = await biz(ws);
    await cashCycle(ws, b, complete(40));
    await getOwnerNowView(ws, b);
    await cashCycle(ws, b, completeWatch(10));
    expect(await runwayText(ws, b)).toMatch(/Cash runway fell from 120 to 45 days/);
  });
});

describe("[db] F2: an evidence gap on the owner dashboard is needs-data, not risk", () => {
  it("[db] F2: an incomplete current Cashflow position is not healthy / at-risk / critical / improving, and names the gap", async () => {
    const ws = randomUUID(); const b = await biz(ws);
    await cashCycle(ws, b, incomplete(5));
    const p = await dash(ws);
    expect(p.atRiskEngagements).toBe(0);
    expect(p.criticalEngagements).toBe(0);
    expect(p.healthyEngagements).toBe(0);
    expect(p.overallStatus).toBe("needs_data");
    expect(p.needsDataEngagements).toBe(1);
    expect(JSON.stringify(p.topRisks)).not.toMatch(/at risk/i);
    expect(p.needsDataItems.join(" ")).toMatch(/bank balance/i);
  });
  it("[db] F2: a complete healthy business is still healthy (control)", async () => {
    const ws = randomUUID(); const b = await biz(ws);
    await cashCycle(ws, b, complete(5));
    const p = await dash(ws);
    expect(p.needsDataEngagements).toBe(0);
    expect(p.healthyEngagements).toBe(1);
    expect(["healthy", "improving"]).toContain(p.overallStatus);
  });
  it("[db] F2: unknown A + genuine at-risk / critical B — B still drives the status; A is never counted as measured risk", async () => {
    const ws = randomUUID(); const a = await biz(ws, "A"); const b = await biz(ws, "B");
    await cashCycle(ws, a, incomplete(5));
    const burning = { ...period(5), cashInHand: 20000, bankBalance: 20000, dailyCollections: 3000, receivables: 5000, receivablesOverdue: 0, payables: 20000, upcomingEmi: 10000, rentDue: 30000, salaryDue: 60000, vendorDue: 20000 };
    await cashCycle(ws, b, burning);
    const p = await dash(ws);
    expect(p.needsDataEngagements).toBe(1);
    expect(p.atRiskEngagements + p.criticalEngagements).toBe(1);
    expect(["at_risk", "critical"]).toContain(p.overallStatus);
  });
  it("[db] F2: Finance SAFE + FIN_LIQUIDITY_UNCONFIRMED alone is needs-data (not at-risk), still holds growth, and creates no Cashflow runway", async () => {
    const ws = randomUUID(); const b = await biz(ws);
    const p = period(10);
    const fs = await createFinancialSnapshot(b, { ...p, revenue: 100000, costOfGoodsOrServices: 40000, fixedCosts: 20000, variableCosts: 5000, salaryPayroll: 10000, cashOnHand: 0, receivables: 5000, payables: 1000, loanEmiDebtPayments: 0, totalDebtOutstanding: 0, ownerWithdrawals: 0, orderCount: 100, customerCount: 50, discountAmount: 0, refundAmount: 0 } as never, actor, ws);
    await runFinanceDiagnosis(b, fs.id, actor, ws);
    const d = await dash(ws);
    expect([d.atRiskEngagements, d.criticalEngagements, d.healthyEngagements, d.needsDataEngagements]).toEqual([0, 0, 0, 1]);
    const gate = await enforceOwnerActionGates({ workspaceId: ws, businessId: b, actionId: randomUUID(), domain: "sales", toStatus: "in_progress", findingCode: "SALES_OPP_WINBACK" }).then(() => "ALLOWED", (e: Error) => `BLOCKED:${e.message}`);
    expect(gate).toMatch(/^BLOCKED:/);
    await getOwnerNowView(ws, b);
    expect(await runwayText(ws, b)).toBe("");
  });
  it("[db] F2: a real measured Cashflow AT_RISK/CRITICAL position stays a true danger (not needs-data)", async () => {
    const ws = randomUUID(); const b = await biz(ws);
    await cashCycle(ws, b, { ...period(5), cashInHand: 1000, bankBalance: 1000, dailyCollections: 1000, receivables: 5000, receivablesOverdue: 0, payables: 20000, upcomingEmi: 10000, rentDue: 30000, salaryDue: 60000, vendorDue: 20000 });
    const d = await dash(ws);
    expect(d.needsDataEngagements).toBe(0);
    expect(d.atRiskEngagements + d.criticalEngagements).toBe(1);
    expect(["at_risk", "critical"]).toContain(d.overallStatus);
  });
});
