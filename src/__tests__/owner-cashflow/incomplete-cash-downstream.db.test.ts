/**
 * P1-4 amendment — through the REAL persisted services (`[db]`, throwaway local Postgres only): a new incomplete Cashflow
 * position, a simulated PRE-FIX partial-cash cycle (old false state/finding/action), a complete measured WATCH control and a
 * complete healthy control, read through the action gate, Owner Home (canonical decision), Owner Now View, the Cashflow
 * dashboard and Business Condition. Business and workspace isolation included.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { createCashflowSnapshot } from "@/services/owner-cashflow/snapshot.service";
import { runCashflowDiagnosis } from "@/services/owner-cashflow/diagnosis.service";
import { getCashflowDashboard } from "@/services/owner-cashflow/dashboard.service";
import { createFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import { runFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import { enforceOwnerActionGates, loadOwnerGateConstraints } from "@/services/owner-mode/owner-action-gate.service";
import { assembleGuidanceContext, getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";
import { getOwnerHome } from "@/services/owner-home/home.service";
import { getBusinessCondition } from "@/services/owner-condition/business-condition.service";

const actor = randomUUID();
const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const created: string[] = [];
beforeAll(async () => {
  await db.user.upsert({ where: { id: actor }, update: {}, create: { id: actor, email: `p14-ds-${actor}@example.com`, name: "P1-4 downstream", isActive: true, updatedAt: new Date() } });
});
afterAll(async () => {
  for (const id of created) await teardownOwnerBusiness(id).catch(() => undefined);
});
async function biz(ws: string, name = "P1-4 DS") {
  const b = await createBusiness({ name, businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false }, actor, ws);
  created.push(b.id);
  return b.id;
}
const period = (endAgo: number) => { const e = new Date(Date.now() - endAgo * DAY); return { periodStart: iso(new Date(e.getTime() - 29 * DAY)), periodEnd: iso(e), currency: "INR" }; };
const burning = (endAgo: number, cash: object) => ({ ...period(endAgo), dailyCollections: 3000, receivables: 5000, receivablesOverdue: 0, payables: 20000, upcomingEmi: 10000, rentDue: 30000, salaryDue: 60000, vendorDue: 20000, ...cash });
const complete = (endAgo: number, over: object = {}) => ({ ...period(endAgo), cashInHand: 50000, bankBalance: 150000, dailyCollections: 8000, receivables: 5000, receivablesOverdue: 0, payables: 20000, upcomingEmi: 10000, rentDue: 15000, salaryDue: 40000, vendorDue: 10000, taxDue: 5000, ownerWithdrawal: 20000, ...over });
const completeWatch = (endAgo: number) => complete(endAgo, { cashInHand: 50000, bankBalance: 50000, dailyCollections: 5000, payables: 80000, upcomingEmi: 0, rentDue: 10000, salaryDue: 20000, vendorDue: 0, taxDue: 0, ownerWithdrawal: 0 });
async function cashCycle(ws: string, b: string, snapshot: object) {
  const s = await createCashflowSnapshot(b, snapshot as never, actor, ws);
  await runCashflowDiagnosis(b, s.id, actor, ws);
  return s;
}
async function financeSafe(ws: string, b: string, endAgo = 10) {
  const p = period(endAgo);
  const fs = await createFinancialSnapshot(b, { ...p, revenue: 100000, costOfGoodsOrServices: 40000, fixedCosts: 20000, variableCosts: 5000, salaryPayroll: 10000, cashOnHand: 0, receivables: 5000, payables: 1000, loanEmiDebtPayments: 0, totalDebtOutstanding: 0, ownerWithdrawals: 0, orderCount: 100, customerCount: 50, discountAmount: 0, refundAmount: 0 } as never, actor, ws);
  await runFinanceDiagnosis(b, fs.id, actor, ws);
}
const attempt = (ws: string, b: string, domain: string, findingCode: string) =>
  enforceOwnerActionGates({ workspaceId: ws, businessId: b, actionId: randomUUID(), domain, toStatus: "in_progress", findingCode }).then(() => "ALLOWED", (e: Error) => `BLOCKED:${e.message}`);
const growth = (ws: string, b: string) => attempt(ws, b, "sales", "SALES_OPP_WINBACK");
const guidanceDeps = { db: db as never, uuid: randomUUID, now: () => Date.now() } as never;

/** Rewrite a freshly written (current-engine) partial cycle as the PRE-FIX engine would have persisted it. */
async function makeLegacy(ws: string, b: string, snapshotId: string, extraFindings: Array<{ code: string; severity: string; sourceMetric: string; value: number | null }> = []) {
  await db.ownerCashflowSnapshot.update({ where: { id: snapshotId }, data: { missingCriticalData: [], dataConfidenceScore: 100 } });
  const cycle = (await db.ownerCashflowCycle.findFirst({ where: { snapshotId } }))!;
  await db.ownerCashflowAction.deleteMany({ where: { cycleId: cycle.id } });
  await db.ownerCashflowFinding.deleteMany({ where: { cycleId: cycle.id } });
  await db.ownerCashflowCycle.update({ where: { id: cycle.id }, data: { cashflowState: "INSOLVENT_RISK", dangerScore: 70, healthScore: 12, dataConfidenceScore: 100 } });
  for (const f of [{ code: "CF_INSOLVENT_RUNWAY", severity: "critical", sourceMetric: "cashRunwayDays", value: 0 }, ...extraFindings]) {
    const row = await db.ownerCashflowFinding.create({ data: { id: randomUUID(), workspaceId: ws, businessId: b, cycleId: cycle.id, findingType: "risk", code: f.code, title: f.code, summary: "pre-fix", sourceMetric: f.sourceMetric, sourceValue: f.value, threshold: 5, severity: f.severity, confidence: 1, impactScore: 95, urgencyScore: 100, evidence: [], missingData: [], verificationMetric: f.sourceMetric } });
    await db.ownerCashflowAction.create({ data: { id: randomUUID(), workspaceId: ws, businessId: b, cycleId: cycle.id, findingId: row.id, recommendationCode: "CF_REC_X", findingCode: f.code, title: `Act on ${f.code}`, description: "pre-fix", ownerRole: "owner", status: "proposed", priorityScore: 95, effortScore: 30, expectedImpactScore: 90, confidence: 0.9, verificationMetric: f.sourceMetric, verificationMethod: "m", expectedTimeframeDays: 7 } });
  }
}

describe("[db] incomplete cash position through downstream consumers", () => {
  it("[db] 1: a NEW incomplete position (#592-style): gate holds growth, allows the data request; Now View not cash-safe; dashboard names the gap", async () => {
    const ws = randomUUID(); const b = await biz(ws);
    await cashCycle(ws, b, burning(10, { cashInHand: 0 }));
    await financeSafe(ws, b);
    const c = await loadOwnerGateConstraints(ws, b);
    expect(c.cash.gateState === "SAFE" || c.cash.gateState === "WATCH").toBe(true); // state is NOT raised: unknown is not danger
    expect(c.cash.evidenceSufficient).toBe(false);
    const blocked = await growth(ws, b);
    expect(blocked).toMatch(/^BLOCKED:Total cash is not confirmed yet; enter the missing bank balance figure/);
    expect(blocked).not.toMatch(/at risk|critical|insolven/i);
    expect(await attempt(ws, b, "cashflow", "CF_MISSING_CRITICAL_DATA")).toBe("ALLOWED"); // protective EVIDENCE work
    const g = await assembleGuidanceContext(ws, b, guidanceDeps);
    expect(g.ctx.cashSafe).toBe(false);
    expect(g.ctx.missingCriticalData.join(" | ")).toMatch(/bank balance/);
    const dash = await getCashflowDashboard(ws, b);
    expect(dash.cashPosition).toEqual({ judged: true, complete: false, missing: ["bankBalance"] });
    expect(dash.missingCriticalData).toEqual(["bankBalance"]);
    expect(dash.domainScore?.cashflowState).toBe("WATCH");
  });

  it("[db] 2 (M,N,O): a PRE-FIX partial cycle with an old INSOLVENT_RISK + false cash finding/action never makes a current claim", async () => {
    const ws = randomUUID(); const b = await biz(ws);
    const s = await cashCycle(ws, b, burning(10, { cashInHand: 0 }));
    await makeLegacy(ws, b, s.id);
    const dash = await getCashflowDashboard(ws, b);
    expect(dash.domainScore?.cashflowState).toBe("WATCH");
    expect(dash.latestCycle?.findings.map((f: { code: string }) => f.code)).not.toContain("CF_INSOLVENT_RUNWAY");
    expect(dash.latestCycle?.actions.map((a: { findingCode: string }) => a.findingCode)).not.toContain("CF_INSOLVENT_RUNWAY");
    expect(dash.missingCriticalData).toEqual(["bankBalance"]); // judged by the CURRENT rule although the old snapshot persisted []
    const home = await getOwnerHome(ws, b);
    const d = home.currentOwnerDecision!;
    expect(d.primaryTarget?.findingCode).not.toBe("CF_INSOLVENT_RUNWAY");
    expect(d.primaryTarget?.priorityClass).not.toBe("SURVIVAL_CASH");
    expect(d.advicePolicy.mode).not.toBe("SUPPORTED"); // the gap is not read as "nothing open / all clear"
    expect(d.missingInformation.join(" ")).toMatch(/bankBalance|bank/i);
    const cond = await getBusinessCondition(ws, b);
    expect(cond.profile?.domainScores.find((x) => x.domain === "cashflow")?.riskScore).toBe(0);
    expect(cond.profile?.survivalRiskScore).toBe(0);
    const c = await loadOwnerGateConstraints(ws, b);
    expect(c.cash.gateState).toBe("WATCH");
    expect(c.cash.evidenceSufficient).toBe(false);
    const nv = await getOwnerNowView(ws, b);
    expect(nv.view.cashDangerStatus).not.toBe("CRITICAL");
  });

  it("[db] 3 (O): a pre-fix partial cycle with a REAL overdue-receivables risk keeps that risk and still drops the partial-total claim", async () => {
    const ws = randomUUID(); const b = await biz(ws);
    const s = await cashCycle(ws, b, { ...period(10), cashInHand: 0, dailyCollections: 100000, receivables: 100000, receivablesOverdue: 80000, rentDue: 1000 });
    await makeLegacy(ws, b, s.id, [{ code: "CF_HIGH_OVERDUE_RECEIVABLES", severity: "high", sourceMetric: "overdueReceivablesPct", value: 80 }]);
    const dash = await getCashflowDashboard(ws, b);
    const codes = dash.latestCycle?.findings.map((f: { code: string }) => f.code) ?? [];
    expect(codes).toContain("CF_HIGH_OVERDUE_RECEIVABLES");
    expect(codes).not.toContain("CF_INSOLVENT_RUNWAY");
    expect(dash.domainScore?.cashflowState).toBe("AT_RISK");
    const c = await loadOwnerGateConstraints(ws, b);
    expect(c.cash.gateState).toBe("AT_RISK");
  });

  it("[db] 4 (A, G/H): COMPLETE controls keep existing behaviour — a measured WATCH and a healthy position allow growth and report sufficient evidence", async () => {
    for (const make of [completeWatch, complete]) {
      const ws = randomUUID(); const b = await biz(ws);
      await cashCycle(ws, b, make(10));
      const c = await loadOwnerGateConstraints(ws, b);
      expect(c.cash.evidenceSufficient).toBe(true);
      expect(await growth(ws, b)).toBe("ALLOWED");
      const dash = await getCashflowDashboard(ws, b);
      expect(dash.cashPosition?.complete).toBe(true);
      expect(dash.missingCriticalData).toEqual([]);
    }
  });

  it("[db] 5 (F): the Now View never says 'Cash runway … 45 days' for an incomplete position, and still reports a MEASURED change", async () => {
    const ws = randomUUID(); const b = await biz(ws);
    await cashCycle(ws, b, complete(40, { cashInHand: 500000, bankBalance: 500000 }));
    await getOwnerNowView(ws, b); // records the prior (measured) guidance state
    await cashCycle(ws, b, burning(10, { cashInHand: 0 }));
    const after = await getOwnerNowView(ws, b);
    expect(after.whatChanged.map((x) => x.reason).join(" ")).not.toMatch(/runway/i);
    // a measured WATCH after a measured SAFE reading keeps the original behaviour
    const ws2 = randomUUID(); const b2 = await biz(ws2);
    await cashCycle(ws2, b2, complete(40, { cashInHand: 500000, bankBalance: 500000 }));
    await getOwnerNowView(ws2, b2);
    await cashCycle(ws2, b2, completeWatch(10));
    expect((await getOwnerNowView(ws2, b2)).whatChanged.map((x) => x.reason).join(" ")).toMatch(/Cash runway fell from 120 to 45 days/);
  });

  it("[db] 6 (J,K): incomplete Cashflow + Finance SAFE, and Finance liquidity unconfirmed alone, cannot clear growth", async () => {
    const ws = randomUUID(); const b = await biz(ws);
    await financeSafe(ws, b); // Finance cash recorded, bank unknown → liquidity unconfirmed, state SAFE
    const c = await loadOwnerGateConstraints(ws, b);
    expect(c.cash.gateState).toBe("SAFE");
    expect(c.cash.evidenceSufficient).toBe(false);
    expect(await growth(ws, b)).toMatch(/^BLOCKED:Total cash is not confirmed yet/);
    expect(await attempt(ws, b, "finance", "FIN_LIQUIDITY_UNCONFIRMED")).toBe("ALLOWED");
  });

  it("[db] 7 (S): Business A's incomplete position never holds Business B (same or another workspace)", async () => {
    const ws = randomUUID();
    const a = await biz(ws, "A incomplete"); const b = await biz(ws, "B complete");
    await cashCycle(ws, a, burning(10, { cashInHand: 0 }));
    await cashCycle(ws, b, complete(10));
    expect(await growth(ws, a)).toMatch(/^BLOCKED/);
    expect(await growth(ws, b)).toBe("ALLOWED");
    expect((await getCashflowDashboard(ws, b)).cashPosition?.complete).toBe(true);
    const ws2 = randomUUID(); const c = await biz(ws2, "C other workspace");
    await cashCycle(ws2, c, complete(10));
    expect(await growth(ws2, c)).toBe("ALLOWED");
  });
});
