/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma rows, seeded snapshot inputs and service payloads are untyped */
/**
 * Round-6 remediation regressions, through the real services on real Postgres:
 *   - change chronology: re-diagnosing the SAME snapshot never re-dates history (no fabricated change);
 *     a back-filled older period entered after the newer one is never the baseline (no false
 *     appeared / resolved), in either direction;
 *   - future-dated periods: never trusted as current evidence (Finance and Cash flow), never win the
 *     cash/Finance arbitration, named as future-dated — never "out of date";
 *   - Policy 3: a business-less expired compliance item in a multi-business workspace is surfaced for
 *     attribution on every business and restricts none; with one real business it restricts that business;
 *   - Policy 1: every canonical executable step on real data is gate-compatible at resolve time; a step
 *     held by unsafe capacity is never the main target and the gate refuses it.
 *
 * `[db]`-gated. Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-decision/r6-remediation.db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { createCashflowSnapshot } from "@/services/owner-cashflow/snapshot.service";
import { runCashflowDiagnosis } from "@/services/owner-cashflow/diagnosis.service";
import { createFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import { runFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import { createSalesSnapshot } from "@/services/owner-sales/snapshot.service";
import { runSalesDiagnosis } from "@/services/owner-sales/diagnosis.service";
import { recordComplianceItem } from "@/services/owner-mode/compliance.service";
import { getOwnerHome } from "@/services/owner-home/home.service";
import { enforceOwnerActionGates } from "@/services/owner-mode/owner-action-gate.service";
import { currentCashFinanceReading } from "@/services/owner-spine/current-cash-finance-reading";
import { CURRENT_DIAGNOSIS_CYCLE_ORDER } from "@/services/owner-spine/current-diagnosis-cycle";
import { ownerTargetIntent } from "@/domain/owner-spine/owner-imperatives";

const actor = randomUUID();
const DAY = 86_400_000;

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `r6-${actor}@example.com`, name: "R6 QA", isActive: true, updatedAt: new Date() },
  });
});

const iso = (d: Date) => d.toISOString().slice(0, 10);
/** A period ending `endDaysAgo` days ago (negative: in the future), `length` days long. */
function period(endDaysAgo: number, length = 20) {
  const end = new Date(Date.now() - endDaysAgo * DAY);
  return { periodStart: iso(new Date(end.getTime() - length * DAY)), periodEnd: iso(end) };
}
const UNSAFE = { cashInHand: 100, dailyCollections: 50, receivables: 20000, receivablesOverdue: 15000, payables: 40000, upcomingEmi: 15000, rentDue: 10000, salaryDue: 20000, vendorDue: 15000, taxDue: 5000, ownerWithdrawal: 4000 };
const SAFE = { cashInHand: 5_000_000, dailyCollections: 50000, receivables: 1000, receivablesOverdue: 0, payables: 1000, upcomingEmi: 0, rentDue: 1000, salaryDue: 1000, vendorDue: 0, taxDue: 0, ownerWithdrawal: 0 };

async function business(workspaceId: string, name: string) {
  const b = await createBusiness({ name, businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false }, actor, workspaceId);
  return b.id as string;
}
async function cashSnap(workspaceId: string, businessId: string, p: { periodStart: string; periodEnd: string }, figures: typeof SAFE) {
  return createCashflowSnapshot(businessId, { ...p, currency: "INR", ...figures }, actor, workspaceId);
}
/** Move a cycle (and optionally its snapshot) back in time: the moment it was written. */
async function backdate(cycleId: string, snapshotId: string | null, daysAgo: number) {
  const at = new Date(Date.now() - daysAgo * DAY);
  await db.ownerCashflowCycle.update({ where: { id: cycleId }, data: { createdAt: at } });
  if (snapshotId) await db.ownerCashflowSnapshot.update({ where: { id: snapshotId }, data: { createdAt: at } });
}
const cashLines = (d: any) => (d.whatChanged as Array<{ kind: string; message: string }>).filter((c) => /Cash flow/.test(c.message));

describe("[db] change history follows evidence chronology, never insertion or re-diagnosis time", () => {
  it("[db] re-diagnosing the SAME snapshot (cycle N+1) reports no change: old transitions are never re-dated into the window", async () => {
    const ws = randomUUID();
    const b = await business(ws, "QA R6 Rediagnose");
    const s1 = await cashSnap(ws, b, period(40), UNSAFE);
    const c1 = await runCashflowDiagnosis(b, s1.id, actor, ws);
    await backdate(c1.id, s1.id, 35);
    const s2 = await cashSnap(ws, b, period(20), SAFE);
    const c2 = await runCashflowDiagnosis(b, s2.id, actor, ws);
    await backdate(c2.id, s2.id, 25);
    // Both diagnoses ran outside the 14-day window: nothing to report.
    const quiet = (await getOwnerHome(ws, b)).currentOwnerDecision!;
    expect(cashLines(quiet)).toEqual([]);
    // Cycle N+1 on the SAME snapshot (e.g. a re-diagnosis after an action) — same evidence, same business state.
    const c3 = await runCashflowDiagnosis(b, s2.id, actor, ws);
    expect(c3.snapshotId).toBe(s2.id);
    const after = (await getOwnerHome(ws, b)).currentOwnerDecision!;
    expect(cashLines(after)).toEqual([]);
    expect(after.whatChanged.map((c: any) => c.kind)).not.toContain("CRITICAL_ISSUE_RESOLVED");
    await teardownOwnerBusiness(b);
  });

  it("[db] a back-filled OLDER period entered after the newer one is never the baseline — no false 'new critical issue'", async () => {
    const ws = randomUUID();
    const b = await business(ws, "QA R6 Backfill A");
    const s1 = await cashSnap(ws, b, period(40), UNSAFE);
    const c1 = await runCashflowDiagnosis(b, s1.id, actor, ws);
    await backdate(c1.id, s1.id, 30);
    await runCashflowDiagnosis(b, (await cashSnap(ws, b, period(3), UNSAFE)).id, actor, ws); // current: still critical
    // The owner back-fills a SAFE period between the two, AFTER the current one was diagnosed.
    await runCashflowDiagnosis(b, (await cashSnap(ws, b, period(20), SAFE)).id, actor, ws);
    const d = (await getOwnerHome(ws, b)).currentOwnerDecision!;
    expect(cashLines(d).map((c) => c.kind)).not.toContain("CRITICAL_ISSUE_APPEARED");
    expect(cashLines(d)).toContainEqual({ kind: "EVIDENCE_UPDATED", message: "New Cash flow figures were analysed." });
    await teardownOwnerBusiness(b);
  });

  it("[db] …and in the other direction the real change is still reported (the back-filled period cannot hide it)", async () => {
    const ws = randomUUID();
    const b = await business(ws, "QA R6 Backfill B");
    const s1 = await cashSnap(ws, b, period(40), SAFE);
    const c1 = await runCashflowDiagnosis(b, s1.id, actor, ws);
    await backdate(c1.id, s1.id, 30);
    await runCashflowDiagnosis(b, (await cashSnap(ws, b, period(3), UNSAFE)).id, actor, ws); // current: newly critical
    await runCashflowDiagnosis(b, (await cashSnap(ws, b, period(20), UNSAFE)).id, actor, ws); // back-filled, critical
    const d = (await getOwnerHome(ws, b)).currentOwnerDecision!;
    expect(cashLines(d).map((c) => c.kind)).toContain("CRITICAL_ISSUE_APPEARED");
    await teardownOwnerBusiness(b);
  });
});

describe("[db] future-dated periods are never trusted current evidence", () => {
  async function financeCycle(ws: string, b: string, p: { periodStart: string; periodEnd: string }, state: string) {
    const snap = await createFinancialSnapshot(b, { ...p, currency: "INR", revenue: 500000, costOfGoods: 200000, fixedCosts: 100000, variableCosts: 50000, cashOnHand: 300000 } as any, actor, ws);
    const cycle = await runFinanceDiagnosis(b, snap.id, actor, ws);
    await db.ownerFinanceCycle.update({ where: { id: cycle.id }, data: { survivalState: state } });
    return cycle;
  }
  async function reading(ws: string, b: string) {
    const [c, f] = await Promise.all([
      db.ownerCashflowCycle.findFirst({ where: { workspaceId: ws, businessId: b }, orderBy: CURRENT_DIAGNOSIS_CYCLE_ORDER, select: { cashflowState: true, snapshot: { select: { periodEnd: true } } } }),
      db.ownerFinanceCycle.findFirst({ where: { workspaceId: ws, businessId: b }, orderBy: CURRENT_DIAGNOSIS_CYCLE_ORDER, select: { survivalState: true, snapshot: { select: { periodEnd: true, supersededById: true } } } }),
    ]);
    return currentCashFinanceReading(c ? { state: c.cashflowState, snapshot: c.snapshot } : null, f ? { state: f.survivalState, snapshot: f.snapshot } : null, Date.now());
  }
  const growthGate = (ws: string, b: string) =>
    enforceOwnerActionGates({ workspaceId: ws, businessId: b, actionId: randomUUID(), domain: "marketing", toStatus: "in_progress", findingCode: "MKT_OPP_SCALE_WINNER" }).then(() => "allowed", () => "blocked");

  it("[db] Finance: a SAFE Finance period ending in the future never supersedes a CRITICAL cash reading", async () => {
    const ws = randomUUID();
    const b = await business(ws, "QA R6 Future Finance");
    await runCashflowDiagnosis(b, (await cashSnap(ws, b, period(5), UNSAFE)).id, actor, ws);
    await financeCycle(ws, b, period(-30), "SAFE");
    const r = await reading(ws, b);
    expect(r.supersededSource).not.toBe("cash");
    expect(["CRITICAL", "INSOLVENT_RISK"]).toContain(r.gateState);
    expect(await growthGate(ws, b)).toBe("blocked");
    const d = (await getOwnerHome(ws, b)).currentOwnerDecision!;
    // Future-dated figures are not current evidence at all (never read as current, never "out of date"):
    // the decision says they are not used, and nothing is built on them.
    expect(d.missingInformation.join(" ")).toMatch(/Finance figures entered for a period that has not ended yet are not used — OpsIQ advises on the latest period that has ended/);
    expect(d.missingInformation.join(" ")).not.toMatch(/Current figures for Finance — the latest ones are out of date/);
    expect(d.attention.some((t: any) => t.candidateId === "evidence_refresh:finance")).toBe(false);
    await teardownOwnerBusiness(b);
  });

  it("[db] Cash flow: a SAFE cash period ending in the future never supersedes a CRITICAL Finance reading, and is not 'out of date'", async () => {
    const ws = randomUUID();
    const b = await business(ws, "QA R6 Future Cash");
    await financeCycle(ws, b, period(5), "CRITICAL");
    await runCashflowDiagnosis(b, (await cashSnap(ws, b, period(-30), SAFE)).id, actor, ws);
    const r = await reading(ws, b);
    expect(r.supersededSource).not.toBe("finance");
    expect(r.gateState).toBe("CRITICAL");
    expect(await growthGate(ws, b)).toBe("blocked");
    const d = (await getOwnerHome(ws, b)).currentOwnerDecision!;
    expect(d.missingInformation.join(" ")).toMatch(/Cash flow figures entered for a period that has not ended yet are not used/);
    expect(d.missingInformation.join(" ")).not.toMatch(/Current figures for Cash flow — the latest ones are out of date/);
    await teardownOwnerBusiness(b);
  });
});

describe("[db] Policy 3 — a business-less compliance item is not automatically every business's", () => {
  async function expiredUnassigned(ws: string) {
    return recordComplianceItem({ workspaceId: ws, businessId: null, kind: "licence", name: "Shared trade licence", expiresAt: new Date(Date.now() - 10 * DAY), actorId: actor });
  }
  const opsGate = (ws: string, b: string) =>
    enforceOwnerActionGates({ workspaceId: ws, businessId: b, actionId: randomUUID(), domain: "operations", toStatus: "completed", findingCode: "OPS_HIGH_DELAY" }).then(() => "allowed", (e) => String(e.message));

  it("[db] two real businesses: surfaced on both for attribution, restricting neither A nor B", async () => {
    const ws = randomUUID();
    await db.workspace.create({ data: { id: ws, name: "R6 Compliance", slug: `r6-c-${ws}`, isActive: true, updatedAt: new Date() } });
    const a = await business(ws, "QA R6 Comp A");
    const bb = await business(ws, "QA R6 Comp B");
    const itemId = await expiredUnassigned(ws);
    for (const b of [a, bb]) {
      const d = (await getOwnerHome(ws, b)).currentOwnerDecision!;
      const t = d.attention.find((x: any) => x.candidateId === `compliance_item:${itemId}`);
      expect(t, b).toBeDefined();
      expect(t!.title).toBe('Assign "Shared trade licence" to the business it affects');
      expect(t!.explanation).toMatch(/has not been assigned to an affected business, so OpsIQ cannot safely determine which business actions it restricts/);
      expect(t!.explanation).toMatch(/It is not resolved/);
      expect(await opsGate(ws, b)).toBe("allowed");
    }
    await db.ownerComplianceItem.deleteMany({ where: { workspaceId: ws } });
    await teardownOwnerBusiness(a);
    await teardownOwnerBusiness(bb);
  });

  it("[db] one real business: the unscoped item is that business's — renew-first target and a gate hard stop", async () => {
    const ws = randomUUID();
    await db.workspace.create({ data: { id: ws, name: "R6 Compliance 1", slug: `r6-c1-${ws}`, isActive: true, updatedAt: new Date() } });
    const a = await business(ws, "QA R6 Comp Solo");
    const itemId = await expiredUnassigned(ws);
    const d = (await getOwnerHome(ws, a)).currentOwnerDecision!;
    expect(d.primaryTarget?.candidateId).toBe(`compliance_item:${itemId}`);
    expect(d.primaryTarget?.title).toMatch(/^Renew "Shared trade licence"/);
    expect(await opsGate(ws, a)).toMatch(/Professional review required: "Shared trade licence"/);
    await db.ownerComplianceItem.deleteMany({ where: { workspaceId: ws } });
    await teardownOwnerBusiness(a);
  });
});

describe("[db] Policy 1 — on real data, every canonical executable step is gate-compatible at resolve time", () => {
  it("[db] with capacity down, growth steps are held (never canonical, refused by the gate); every canonical step passes the gate", async () => {
    const ws = randomUUID();
    const b = await business(ws, "QA R6 Canonical Gate");
    const p = period(3);
    const snap = await createSalesSnapshot(b, {
      ...p, currency: "INR", leads: 200, qualifiedLeads: 100, orders: 60, revenue: 900000, averageOrderValue: 15000,
      newCustomers: 40, repeatCustomers: 5, lostCustomers: 30, complaints: 2, discountAmount: 10000, refundAmount: 1000, staffCount: 4,
    } as any, actor, ws);
    await runSalesDiagnosis(b, snap.id, actor, ws);
    await db.ownerEquipment.create({ data: { workspaceId: ws, businessId: b, equipmentType: "oven", name: "Main oven", status: "operational", downtimeState: "down", utilization: 0.5 } });

    const home = await getOwnerHome(ws, b);
    const d = home.currentOwnerDecision!;
    const actions = await db.ownerSalesAction.findMany({ where: { workspaceId: ws, businessId: b } });
    const byCandidate = new Map(actions.map((a: any) => [`domain_action:sales:${a.id}`, a]));
    const steps = [d.primaryTarget, ...d.supportingSteps].filter((t: any) => t && t.source === "domain_action");
    for (const t of steps as any[]) {
      const row: any = byCandidate.get(t.candidateId);
      expect(row, t.title).toBeDefined();
      const verdict = await enforceOwnerActionGates({ workspaceId: ws, businessId: b, actionId: row.id, domain: "sales", toStatus: "in_progress", findingCode: row.findingCode, findingId: row.findingId }).then(() => "allowed", (e) => String(e.message));
      expect(verdict, t.title).toBe("allowed");
    }
    // Held growth steps: excluded with the gate's reason; the gate itself refuses each of them.
    const held = d.excluded.filter((e: any) => e.reason === "held_by_safety_gate");
    expect(held.length, "capacity down holds at least one growth step (non-vacuous)").toBeGreaterThan(0);
    expect(d.primaryTarget).not.toBeNull();
    for (const h of held) {
      const row: any = byCandidate.get(h.candidateId);
      expect(ownerTargetIntent({ source: "domain_action", priorityClass: "GROWTH_OPPORTUNITY", findingCode: row.findingCode })).not.toBe("REPAIR");
      const verdict = await enforceOwnerActionGates({ workspaceId: ws, businessId: b, actionId: row.id, domain: "sales", toStatus: "in_progress", findingCode: row.findingCode, findingId: row.findingId }).then(() => "allowed", () => "blocked");
      expect(verdict, h.title).toBe("blocked");
      expect(d.primaryCandidateId).not.toBe(h.candidateId);
    }
    await db.ownerEquipment.deleteMany({ where: { workspaceId: ws } });
    await teardownOwnerBusiness(b);
  });
});
