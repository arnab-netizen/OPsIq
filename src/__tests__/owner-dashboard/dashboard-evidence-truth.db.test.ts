/**
 * Owner dashboard truth: absence of evidence is never healthy, safe, measured or zero — through the REAL
 * `buildOwnerDashboardPayload()` (business evidence → currentCashFinanceReading → health status → workspace counts).
 *
 * `[db]`-gated, throwaway local Postgres only:
 *   TEST_WITH_DB=true npx vitest run src/__tests__/owner-dashboard/dashboard-evidence-truth.db.test.ts
 *
 * Production reproduction (PR #592 smoke): creating an EMPTY business moved the workspace from
 * healthy=0/atRisk=4/needsData=0 to healthy=1/atRisk=4/needsData=0, because `gateEvidenceSufficient` ("no gaps in a
 * PRESENT reading") was read as "evidence exists".
 *
 * Where a case needs a specific persisted survival state, a real diagnosis is run and its `survivalState` is then set
 * explicitly, so the case pins the dashboard's translation of that state rather than the engine's thresholds.
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
import { buildOwnerDashboardPayload } from "@/app/api/owner/dashboard/route";

const actor = randomUUID();
const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const created: string[] = [];

beforeAll(async () => {
  await db.user.upsert({ where: { id: actor }, update: {}, create: { id: actor, email: `dash-truth-${actor}@example.com`, name: "Dash Truth", isActive: true, updatedAt: new Date() } });
});
afterAll(async () => {
  for (const id of created) await teardownOwnerBusiness(id).catch(() => undefined);
});

async function biz(ws: string, name = "Dash Truth Biz") {
  const b = await createBusiness({ name, businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false }, actor, ws);
  created.push(b.id);
  return b.id;
}
const dash = async (ws: string) =>
  buildOwnerDashboardPayload({ request: new Request("http://localhost/api/owner/dashboard") } as unknown as Parameters<typeof buildOwnerDashboardPayload>[0], ws, actor);
const counts = (p: Awaited<ReturnType<typeof dash>>) => ({
  engagements: p.engagementCount, healthy: p.healthyEngagements, atRisk: p.atRiskEngagements, critical: p.criticalEngagements, needsData: p.needsDataEngagements,
});

// Cashflow fixtures (same shapes as stale-runway-and-needs-data.db.test.ts).
const period = (endAgo: number) => { const e = new Date(Date.now() - endAgo * DAY); return { periodStart: iso(new Date(e.getTime() - 29 * DAY)), periodEnd: iso(e), currency: "INR" }; };
const cashComplete = (endAgo: number) => ({ ...period(endAgo), cashInHand: 500000, bankBalance: 500000, dailyCollections: 8000, receivables: 5000, receivablesOverdue: 0, payables: 20000, upcomingEmi: 10000, rentDue: 15000, salaryDue: 40000, vendorDue: 10000, taxDue: 5000, ownerWithdrawal: 20000 });
const cashIncomplete = (endAgo: number) => ({ ...period(endAgo), cashInHand: 0, dailyCollections: 3000, receivables: 5000, receivablesOverdue: 0, payables: 20000, upcomingEmi: 10000, rentDue: 30000, salaryDue: 60000, vendorDue: 20000 });
async function cashCycle(ws: string, b: string, snapshot: object) {
  const s = await createCashflowSnapshot(b, snapshot as never, actor, ws);
  await runCashflowDiagnosis(b, s.id, actor, ws);
  return s;
}

// Finance fixtures: completed (period ended 5 days ago) or provisional (in progress now).
const finFigures = { revenue: 200000, fixedCosts: 40000, variableCosts: 40000, cashOnHand: 60000 };
const completedFin = { periodStart: iso(new Date(Date.now() - 35 * DAY)), periodEnd: iso(new Date(Date.now() - 5 * DAY)), currency: "INR", ...finFigures };
const provisionalFin = { periodStart: iso(new Date(Date.now() - 5 * DAY)), periodEnd: iso(new Date(Date.now() + 20 * DAY)), currency: "INR", ...finFigures };
const futureFin = { periodStart: iso(new Date(Date.now() + 40 * DAY)), periodEnd: iso(new Date(Date.now() + 70 * DAY)), currency: "INR", ...finFigures };
async function finCycle(ws: string, b: string, snapshot: object, state: string) {
  const s = await createFinancialSnapshot(b, snapshot as never, actor, ws);
  const cycle = await runFinanceDiagnosis(b, s.id, actor, ws);
  await db.ownerFinanceCycle.update({ where: { id: cycle.id }, data: { survivalState: state } });
  return cycle;
}
async function financeAction(ws: string, b: string, cycleId: string, status: string) {
  await db.ownerFinanceAction.create({
    data: {
      id: randomUUID(), workspaceId: ws, businessId: b, cycleId, recommendationCode: `REC_${status}`, findingCode: `FIND_${status}`, title: `Action ${status}`, description: "d",
      ownerRole: "owner", status, priorityScore: 50, effortScore: 30, expectedImpactScore: 50, confidence: 0.7, verificationMetric: "cashReserve",
      verificationMethod: "before/after", expectedTimeframeDays: 30, updatedAt: new Date(),
    },
  });
}

describe("[db] owner dashboard: per-business evidence state → health status (Cases A–H)", () => {
  it("[db] Case A: a completely empty business is needs_data — never healthy — with a truthful first-figures reason", async () => {
    const ws = randomUUID(); await biz(ws, "Empty Biz");
    const p = await dash(ws);
    expect(counts(p)).toEqual({ engagements: 1, healthy: 0, atRisk: 0, critical: 0, needsData: 1 });
    expect(p.overallStatus).toBe("needs_data");
    expect(p.needsDataItems.join(" ")).toMatch(/first financial figures/i);
    expect(p.needsDataItems.join(" ")).not.toMatch(/bank balance/i);
  });

  it("[db] Case B: provisional-only WATCH (no completed reading) is needs_data — a provisional WATCH proves neither health nor measured risk", async () => {
    const ws = randomUUID(); const b = await biz(ws);
    await finCycle(ws, b, provisionalFin, "WATCH");
    const p = await dash(ws);
    expect(counts(p)).toEqual({ engagements: 1, healthy: 0, atRisk: 0, critical: 0, needsData: 1 });
    expect(p.overallStatus).toBe("needs_data");
    expect(p.needsDataItems.join(" ")).toMatch(/in progress/i);
  });

  it("[db] Case B2: provisional-only SAFE behaves like WATCH (needs_data)", async () => {
    const ws = randomUUID(); const b = await biz(ws);
    await finCycle(ws, b, provisionalFin, "SAFE");
    expect(counts(await dash(ws))).toEqual({ engagements: 1, healthy: 0, atRisk: 0, critical: 0, needsData: 1 });
  });

  it("[db] Case C: provisional genuine danger (AT_RISK / CRITICAL) with no completed reading is still surfaced", async () => {
    const wsA = randomUUID(); const bA = await biz(wsA);
    await finCycle(wsA, bA, provisionalFin, "AT_RISK");
    expect(counts(await dash(wsA))).toEqual({ engagements: 1, healthy: 0, atRisk: 1, critical: 0, needsData: 0 });
    const wsC = randomUUID(); const bC = await biz(wsC);
    await finCycle(wsC, bC, provisionalFin, "CRITICAL");
    const pc = await dash(wsC);
    expect(counts(pc)).toEqual({ engagements: 1, healthy: 0, atRisk: 0, critical: 1, needsData: 0 });
    expect(pc.overallStatus).toBe("critical");
  });

  it("[db] Case D: completed, complete, safe evidence is the only path to healthy", async () => {
    const ws = randomUUID(); const b = await biz(ws);
    await cashCycle(ws, b, cashComplete(5));
    const p = await dash(ws);
    expect(counts(p)).toEqual({ engagements: 1, healthy: 1, atRisk: 0, critical: 0, needsData: 0 });
    expect(["healthy", "improving"]).toContain(p.overallStatus);
  });

  it("[db] Case E: completed but cash-incomplete evidence is needs_data with the specific bank-balance wording", async () => {
    const ws = randomUUID(); const b = await biz(ws);
    await cashCycle(ws, b, cashIncomplete(5));
    const p = await dash(ws);
    expect(counts(p)).toEqual({ engagements: 1, healthy: 0, atRisk: 0, critical: 0, needsData: 1 });
    expect(p.needsDataItems.join(" ")).toMatch(/bank balance/i);
  });

  it("[db] Case F: completed measured AT_RISK stays at_risk", async () => {
    const ws = randomUUID(); const b = await biz(ws);
    await finCycle(ws, b, completedFin, "AT_RISK");
    expect(counts(await dash(ws))).toEqual({ engagements: 1, healthy: 0, atRisk: 1, critical: 0, needsData: 0 });
  });

  it("[db] Case G: completed measured CRITICAL / INSOLVENT_RISK stay critical", async () => {
    const wsA = randomUUID(); const bA = await biz(wsA);
    await finCycle(wsA, bA, completedFin, "CRITICAL");
    const pa = await dash(wsA);
    expect(counts(pa)).toEqual({ engagements: 1, healthy: 0, atRisk: 0, critical: 1, needsData: 0 });
    expect(pa.overallStatus).toBe("critical");
    const wsB = randomUUID(); const bB = await biz(wsB);
    await finCycle(wsB, bB, completedFin, "INSOLVENT_RISK");
    expect(counts(await dash(wsB)).critical).toBe(1);
  });

  it("[db] Case H: execution risk surfaces independently of cash evidence; healthy execution does not create health", async () => {
    // A cycle on a FUTURE-dated snapshot is neither current nor provisional evidence, so there is no cash/finance reading.
    const wsBlocked = randomUUID(); const b1 = await biz(wsBlocked);
    const c1 = await finCycle(wsBlocked, b1, futureFin, "SAFE");
    await financeAction(wsBlocked, b1, c1.id, "blocked");
    expect(counts(await dash(wsBlocked))).toEqual({ engagements: 1, healthy: 0, atRisk: 0, critical: 1, needsData: 0 });

    const wsRisk = randomUUID(); const b2 = await biz(wsRisk);
    const c2 = await finCycle(wsRisk, b2, futureFin, "SAFE");
    await financeAction(wsRisk, b2, c2.id, "open");
    expect(counts(await dash(wsRisk))).toEqual({ engagements: 1, healthy: 0, atRisk: 1, critical: 0, needsData: 0 });

    const wsOk = randomUUID(); const b3 = await biz(wsOk);
    const c3 = await finCycle(wsOk, b3, futureFin, "SAFE");
    await financeAction(wsOk, b3, c3.id, "completed");
    expect(counts(await dash(wsOk))).toEqual({ engagements: 1, healthy: 0, atRisk: 0, critical: 0, needsData: 1 });
  });
});

describe("[db] owner dashboard: workspace roll-up with unassessed businesses", () => {
  it("[db] empty only → needs_data overall", async () => {
    const ws = randomUUID(); await biz(ws, "Empty");
    const p = await dash(ws);
    expect(counts(p)).toEqual({ engagements: 1, healthy: 0, atRisk: 0, critical: 0, needsData: 1 });
    expect(p.overallStatus).toBe("needs_data");
  });

  it("[db] measured at-risk + empty → at_risk overall; the empty business does not dilute it", async () => {
    const ws = randomUUID(); const b = await biz(ws, "Risky"); await biz(ws, "Empty");
    await finCycle(ws, b, completedFin, "AT_RISK");
    const p = await dash(ws);
    expect(counts(p)).toEqual({ engagements: 2, healthy: 0, atRisk: 1, critical: 0, needsData: 1 });
    expect(p.overallStatus).toBe("at_risk");
  });

  it("[db] healthy + empty → not claimed healthy/improving overall", async () => {
    const ws = randomUUID(); const b = await biz(ws, "Fine"); await biz(ws, "Empty");
    await cashCycle(ws, b, cashComplete(5));
    const p = await dash(ws);
    expect(counts(p)).toEqual({ engagements: 2, healthy: 1, atRisk: 0, critical: 0, needsData: 1 });
    expect(p.overallStatus).toBe("needs_data");
  });

  it("[db] critical + empty → critical overall", async () => {
    const ws = randomUUID(); const b = await biz(ws, "Dire"); await biz(ws, "Empty");
    await finCycle(ws, b, completedFin, "CRITICAL");
    const p = await dash(ws);
    expect(counts(p)).toEqual({ engagements: 2, healthy: 0, atRisk: 0, critical: 1, needsData: 1 });
    expect(p.overallStatus).toBe("critical");
  });

  it("[db] provisional-only WATCH + empty → both needs_data, none healthy or at-risk", async () => {
    const ws = randomUUID(); const b = await biz(ws, "Prov"); await biz(ws, "Empty");
    await finCycle(ws, b, provisionalFin, "WATCH");
    const p = await dash(ws);
    expect(counts(p)).toEqual({ engagements: 2, healthy: 0, atRisk: 0, critical: 0, needsData: 2 });
    expect(p.overallStatus).toBe("needs_data");
  });

  it("[db] workspace isolation: another workspace's evidence never changes this workspace's counts", async () => {
    const wsA = randomUUID(); await biz(wsA, "Empty A");
    const wsB = randomUUID(); const b = await biz(wsB, "Fine B");
    await cashCycle(wsB, b, cashComplete(5));
    expect(counts(await dash(wsA))).toEqual({ engagements: 1, healthy: 0, atRisk: 0, critical: 0, needsData: 1 });
  });
});
