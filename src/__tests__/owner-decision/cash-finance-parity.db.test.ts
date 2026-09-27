/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma rows, route handlers and service payloads are untyped */
/**
 * ONE current cash/finance survival reading — proven through every consumer on identical source records
 * (real services, real Postgres):
 *   Home (candidate supersession + cash card), Now View (cash status / issues), the owner action gate
 *   (a GROW action), and the recommendation cash gate (a growth recommendation).
 * Each consumer may differ only by its documented POLICY response to the same reading:
 *   - the owner action gate enforces nothing without any reading (never blocks on absent data);
 *   - the recommendation gate is FORMAL CONSULTING MODE: it keeps its pre-consolidation semantics — the
 *     WORSE of the two persisted states, a missing half AT_RISK — so it is never looser than the shared
 *     reading (a newer SAFE Finance reading never wipes out a CRITICAL cash reading there);
 *   - Now View's growth gate needs both readings current.
 *   /api/owner/dashboard health reads the shared reading too: CRITICAL cash is never "healthy".
 *
 * Also:
 *   - current-diagnosis-cycle ordering is SEMANTIC: the logical current diagnosis (latest evidence period,
 *     later run) wins even when its createdAt points the other way; history lists keep run order;
 *   - gate-block audits are business-scoped all the way to the Control Center.
 *
 * `[db]`-gated. Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-decision/cash-finance-parity.db.test.ts
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { randomUUID } from "crypto";

vi.mock("@/lib/canonical-route-enforcement", () => ({
  withCanonicalEnforcement:
    (handler: (ctx: unknown, params: Record<string, string>) => unknown) =>
    (ctx: unknown, params: Record<string, string>) =>
      handler(ctx, params),
}));

import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { createCashflowSnapshot } from "@/services/owner-cashflow/snapshot.service";
import { runCashflowDiagnosis } from "@/services/owner-cashflow/diagnosis.service";
import { getCashflowDashboard } from "@/services/owner-cashflow/dashboard.service";
import { createFinancialSnapshot, amendFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import { runFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import { getOwnerHome } from "@/services/owner-home/home.service";
import { getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";
import { getBusinessCondition } from "@/services/owner-condition/business-condition.service";
import { enforceOwnerActionGates } from "@/services/owner-mode/owner-action-gate.service";
import { enforceCashSafetyForPromotion } from "@/services/owner-finance/recommendation-cash-safety.service";
import { currentCashFinanceReading } from "@/services/owner-spine/current-cash-finance-reading";
import { CURRENT_DIAGNOSIS_CYCLE_ORDER } from "@/services/owner-spine/current-diagnosis-cycle";
import { GET as controlCenterGET } from "@/app/api/owner/control-center/route";
import { buildOwnerDashboardPayload } from "@/app/api/owner/dashboard/route";

const actor = randomUUID();

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `parity-${actor}@example.com`, name: "Parity QA", isActive: true, updatedAt: new Date() },
  });
});

const iso = (d: Date) => d.toISOString().slice(0, 10);
function period(endDaysAgo: number) {
  const end = new Date(Date.now() - endDaysAgo * 86_400_000);
  return { periodStart: iso(new Date(end.getTime() - 20 * 86_400_000)), periodEnd: iso(end) };
}
const CASH_FIGURES = { cashInHand: 50000, dailyCollections: 2000, receivables: 5000, receivablesOverdue: 1000, payables: 5000, upcomingEmi: 1000, rentDue: 2000, salaryDue: 5000, vendorDue: 1000, taxDue: 500, ownerWithdrawal: 500 };

async function business(workspaceId: string, name: string) {
  const b = await createBusiness({ name, businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false }, actor, workspaceId);
  return b.id as string;
}
/** A real Cash flow diagnosis of the given period, with its reading set to `state`. */
async function cash(workspaceId: string, businessId: string, endDaysAgo: number, state: string, dangerScore?: number) {
  const snap = await createCashflowSnapshot(businessId, { ...period(endDaysAgo), currency: "INR", ...CASH_FIGURES }, actor, workspaceId);
  const cycle = await runCashflowDiagnosis(businessId, snap.id, actor, workspaceId);
  await db.ownerCashflowCycle.update({ where: { id: cycle.id }, data: { cashflowState: state, ...(dangerScore !== undefined ? { dangerScore } : {}) } });
  return cycle;
}
/** A real Finance diagnosis of the given period, with its reading set to `state`. */
async function finance(workspaceId: string, businessId: string, endDaysAgo: number, state: string) {
  const snap = await createFinancialSnapshot(businessId, { ...period(endDaysAgo), currency: "INR", revenue: 500000, costOfGoods: 200000, fixedCosts: 100000, variableCosts: 50000, cashOnHand: 300000 } as any, actor, workspaceId);
  const cycle = await runFinanceDiagnosis(businessId, snap.id, actor, workspaceId);
  await db.ownerFinanceCycle.update({ where: { id: cycle.id }, data: { survivalState: state } });
  return { cycle, snapshotId: snap.id as string };
}

/** The shared reading, computed from the stored current cycles (what every consumer must agree with). */
async function sharedReading(workspaceId: string, businessId: string) {
  const [c, f] = await Promise.all([
    db.ownerCashflowCycle.findFirst({ where: { workspaceId, businessId }, orderBy: CURRENT_DIAGNOSIS_CYCLE_ORDER, select: { cashflowState: true, snapshot: { select: { periodEnd: true } } } }),
    db.ownerFinanceCycle.findFirst({ where: { workspaceId, businessId }, orderBy: CURRENT_DIAGNOSIS_CYCLE_ORDER, select: { survivalState: true, snapshot: { select: { periodEnd: true, supersededById: true } } } }),
  ]);
  return currentCashFinanceReading(c ? { state: c.cashflowState, snapshot: c.snapshot } : null, f ? { state: f.survivalState, snapshot: f.snapshot } : null, Date.now());
}

const UNSAFE_FOR_GROWTH = new Set(["AT_RISK", "CRITICAL", "INSOLVENT_RISK"]);

async function consumers(workspaceId: string, businessId: string, impactArea = "growth") {
  const home = await getOwnerHome(workspaceId, businessId);
  const now: any = await getOwnerNowView(workspaceId, businessId);
  const gate = await enforceOwnerActionGates(
    { workspaceId, businessId, actionId: randomUUID(), domain: "marketing", toStatus: "in_progress", findingCode: "MKT_OPP_SCALE_WINNER" }
  ).then(() => "allowed", () => "blocked");
  const recDeps: any = {
    db: {
      clientAccount: db.clientAccount,
      ownerBusiness: db.ownerBusiness,
      ownerCashflowCycle: db.ownerCashflowCycle,
      ownerFinanceCycle: db.ownerFinanceCycle,
      recommendation: { findUnique: async () => ({ findingId: "f1" }) },
      finding: { findFirst: async () => ({ impactArea }) },
    },
  };
  const rec = await enforceCashSafetyForPromotion("rec-parity", workspaceId, recDeps).then(() => "allowed", () => "blocked");
  return { cashCard: home.summary!.cashDanger, nowCash: now.view.cashDangerStatus as string, nowMissing: now.view.missingDataRequests as string[], gate, rec };
}

describe("[db] the ONE cash/finance reading — parity across Home, Now View, the action gate and the recommendation gate", () => {
  it("[db] 1 — Cash unsafe (older) / Finance safe (newer): the newer Finance reading is current everywhere", async () => {
    const ws = randomUUID();
    const b = await business(ws, "QA Parity 1");
    await cash(ws, b, 25, "CRITICAL");
    await finance(ws, b, 3, "SAFE");
    const s = await sharedReading(ws, b);
    expect(s).toMatchObject({ effectiveState: "SAFE", supersededSource: "cash", conflicting: false, gateState: "SAFE" });
    const r = await consumers(ws, b);
    expect(r.cashCard).toMatchObject({ status: "last_known", drivenBy: "Superseded by newer Finance figures" });
    expect(r.nowCash).toBe("OK");
    expect(r.gate).toBe("allowed");
    // Formal Consulting Mode keeps the base worst-of semantics: the CRITICAL cash reading still holds a
    // growth recommendation (the consulting gate is never looser than before consolidation).
    expect(r.rec).toBe("blocked");
    await teardownOwnerBusiness(b);
  });

  it("[db] 2 — Finance unsafe (newer) / Cash safe (older): the unsafe Finance reading is current everywhere", async () => {
    const ws = randomUUID();
    const b = await business(ws, "QA Parity 2");
    await cash(ws, b, 25, "SAFE");
    await finance(ws, b, 3, "CRITICAL");
    const s = await sharedReading(ws, b);
    expect(s).toMatchObject({ effectiveState: "CRITICAL", supersededSource: "cash", gateState: "CRITICAL" });
    const r = await consumers(ws, b);
    expect(r.cashCard.status).toBe("last_known");
    expect(r.nowCash).not.toBe("OK");
    expect(r.gate).toBe("blocked");
    expect(r.rec).toBe("blocked");
    await teardownOwnerBusiness(b);
  });

  it("[db] 3 — Finance snapshot amended since its (unsafe) diagnosis: never current, never dropped — fails safe everywhere", async () => {
    const ws = randomUUID();
    const b = await business(ws, "QA Parity 3");
    await cash(ws, b, 3, "SAFE");
    const f = await finance(ws, b, 3, "CRITICAL");
    await amendFinancialSnapshot(f.snapshotId, { amendmentReason: "corrected COGS", costOfGoodsOrServices: 210000 } as any, actor, ws);
    const s = await sharedReading(ws, b);
    expect(s).toMatchObject({ financeState: null, financeAmendedLastKnown: "CRITICAL", gateState: "CRITICAL", conflicting: false });
    const r = await consumers(ws, b);
    expect(r.cashCard.status).not.toBe("conflicting");
    expect(r.nowCash).not.toBe("OK");
    expect(r.nowMissing).toContain("a Finance diagnosis of your amended figures (re-run the Finance diagnosis)");
    expect(r.gate).toBe("blocked");
    expect(r.rec).toBe("blocked");
    await teardownOwnerBusiness(b);
  });

  it("[db] 4 — only a Cash reading (unsafe): it is the reading everywhere", async () => {
    const ws = randomUUID();
    const b = await business(ws, "QA Parity 4");
    await cash(ws, b, 3, "CRITICAL");
    const s = await sharedReading(ws, b);
    expect(s).toMatchObject({ cashState: "CRITICAL", financeState: null, gateState: "CRITICAL" });
    const r = await consumers(ws, b);
    expect(r.cashCard.status).toBe("current");
    expect(r.nowCash).not.toBe("OK");
    expect(r.gate).toBe("blocked");
    expect(r.rec).toBe("blocked");
    await teardownOwnerBusiness(b);
  });

  it("[db] 5 — only a Finance reading (safe): SAFE everywhere; the recommendation gate's documented policy holds growth on the missing half", async () => {
    const ws = randomUUID();
    const b = await business(ws, "QA Parity 5");
    await finance(ws, b, 3, "SAFE");
    const s = await sharedReading(ws, b);
    expect(s).toMatchObject({ cashState: null, financeState: "SAFE", gateState: "SAFE" });
    const r = await consumers(ws, b);
    // Now View's documented policy: with one reading missing, cash safety is unmeasured — a caution, never
    // OK, never danger (its growth gate needs both readings).
    expect(r.nowCash).toBe("WATCH");
    expect(r.nowMissing).toContain("latest cash position (cash on hand + obligations)");
    expect(r.gate).toBe("allowed");
    expect(r.rec).toBe("blocked"); // policy: the missing Cash half is AT_RISK for a growth recommendation
    expect((await consumers(ws, b, "cash flow")).rec).toBe("allowed"); // …which permits spend
    await teardownOwnerBusiness(b);
  });

  it("[db] 6 — both missing: no reading anywhere; each consumer's documented policy", async () => {
    const ws = randomUUID();
    const b = await business(ws, "QA Parity 6");
    const s = await sharedReading(ws, b);
    expect(s.gateState).toBeNull();
    const now: any = await getOwnerNowView(ws, b);
    expect(now.view.cashDangerStatus).toBe("OK");
    expect(now.view.missingDataRequests).toEqual(expect.arrayContaining(["latest cash position (cash on hand + obligations)", "latest profit/margin figures"]));
    const gate = await enforceOwnerActionGates({ workspaceId: ws, businessId: b, actionId: randomUUID(), domain: "marketing", toStatus: "in_progress", findingCode: "MKT_OPP_SCALE_WINNER" }).then(() => "allowed", () => "blocked");
    expect(gate).toBe("allowed"); // the owner gate never blocks on absent data
    await teardownOwnerBusiness(b);
  });

  it("[db] 7 — both current, disagreeing, incomparable freshness (same period): an explicit conflict everywhere, never resolved by picking a side", async () => {
    const ws = randomUUID();
    const b = await business(ws, "QA Parity 7");
    await cash(ws, b, 3, "SAFE");
    await finance(ws, b, 3, "CRITICAL");
    const s = await sharedReading(ws, b);
    expect(s).toMatchObject({ conflicting: true, effectiveState: null, gateState: "CRITICAL" });
    const r = await consumers(ws, b);
    expect(r.cashCard).toMatchObject({ status: "conflicting", riskScore: null, level: "unknown" });
    expect(r.cashCard.drivenBy).toBe("Cash and Finance signals currently disagree (Cash flow: SAFE, Finance: CRITICAL). Confirm the latest figures before relying on the survival assessment.");
    expect(r.nowCash).not.toBe("OK");
    expect(r.gate).toBe("blocked");
    expect(r.rec).toBe("blocked");
    await teardownOwnerBusiness(b);
  });

  it("[db] 8 — two businesses with opposite states: each business's consumers see only its own reading", async () => {
    const ws = randomUUID();
    const a = await business(ws, "QA Parity 8A");
    const bb = await business(ws, "QA Parity 8B");
    await cash(ws, a, 3, "CRITICAL");
    await finance(ws, a, 3, "CRITICAL");
    await cash(ws, bb, 3, "SAFE");
    await finance(ws, bb, 3, "SAFE");
    expect((await sharedReading(ws, a)).gateState).toBe("CRITICAL");
    expect((await sharedReading(ws, bb)).gateState).toBe("SAFE");
    const ra = await consumers(ws, a);
    const rb = await consumers(ws, bb);
    expect(ra.nowCash).not.toBe("OK");
    expect(rb.nowCash).toBe("OK");
    expect(ra.gate).toBe("blocked");
    expect(rb.gate).toBe("allowed");
    // A recommendation carries no business: with two, neither reading is used (AT_RISK policy: growth held, spend allowed).
    expect(ra.rec).toBe("blocked");
    expect((await consumers(ws, bb, "cash flow")).rec).toBe("allowed");
    await teardownOwnerBusiness(a);
    await teardownOwnerBusiness(bb);
  });
});

describe("[db] /api/owner/dashboard health reads the ONE shared survival reading", () => {
  const dashboardHealth = async (ws: string) => {
    const payload: any = await buildOwnerDashboardPayload({ request: new Request("http://localhost/api/owner/dashboard") } as any, ws, actor);
    return { critical: payload.criticalEngagements as number, atRisk: payload.atRiskEngagements as number };
  };
  it("[db] CRITICAL Cash flow with no Finance diagnosis is critical, never healthy (Finance alone never decides)", async () => {
    const ws = randomUUID();
    const b = await business(ws, "QA Dash 1");
    await cash(ws, b, 3, "CRITICAL");
    expect((await dashboardHealth(ws)).critical).toBe(1);
    await teardownOwnerBusiness(b);
  });
  it("[db] CRITICAL cash vs SAFE Finance on the same period (incomparable): the worse reading — critical", async () => {
    const ws = randomUUID();
    const b = await business(ws, "QA Dash 2");
    await cash(ws, b, 3, "CRITICAL");
    await finance(ws, b, 3, "SAFE");
    expect((await sharedReading(ws, b)).gateState).toBe("CRITICAL");
    expect((await dashboardHealth(ws)).critical).toBe(1);
    await teardownOwnerBusiness(b);
  });
});

describe("[db] current-diagnosis-cycle order is semantic (not whichever timestamp sorts later)", () => {
  it("[db] the later-period, later-run diagnosis is current for every advice/gating reader even when its createdAt is OLDER; history keeps run order", async () => {
    const ws = randomUUID();
    const b = await business(ws, "QA Cycle Order");
    const older = await cash(ws, b, 25, "SAFE", 10);
    const current = await cash(ws, b, 3, "CRITICAL", 90);
    expect(current.sequenceNumber).toBeGreaterThan(older.sequenceNumber);
    // createdAt deliberately points the other way.
    await db.ownerCashflowCycle.update({ where: { id: current.id }, data: { createdAt: new Date(Date.now() - 400 * 86_400_000) } });
    await db.ownerCashflowCycle.update({ where: { id: older.id }, data: { createdAt: new Date() } });

    const dash: any = await getCashflowDashboard(ws, b);
    expect(dash.latestCycle.id).toBe(current.id);
    // The history list is display ordering (every run, newest run first) — not a current-state selector.
    expect(dash.cycleHistory.map((c: any) => c.id)).toEqual([current.id, older.id]);
    const home = await getOwnerHome(ws, b);
    expect(home.summary!.cashDanger).toMatchObject({ status: "current", riskScore: 90 });
    const condition: any = await getBusinessCondition(ws, b);
    expect(condition.profile.domainScores.find((d: any) => d.domain === "cashflow").riskScore).toBe(90);
    const now: any = await getOwnerNowView(ws, b);
    expect(now.view.cashDangerStatus).not.toBe("OK");
    const gate = await enforceOwnerActionGates({ workspaceId: ws, businessId: b, actionId: randomUUID(), domain: "marketing", toStatus: "in_progress", findingCode: "MKT_OPP_SCALE_WINNER" }).then(() => "allowed", () => "blocked");
    expect(gate).toBe("blocked");
    await teardownOwnerBusiness(b);
  });
});

describe("[db] gate-block audits are business-scoped through the Control Center", () => {
  it("[db] business A's block counts for A only; a business-less (consulting) block in a two-business workspace counts for neither", async () => {
    const ws = randomUUID();
    await db.workspace.create({ data: { id: ws, name: "Scope QA", slug: `scope-qa-${ws}`, isActive: true, updatedAt: new Date() } });
    const a = await business(ws, "QA Scope A");
    const bb = await business(ws, "QA Scope B");
    await cash(ws, a, 3, "CRITICAL");
    await cash(ws, bb, 3, "SAFE");
    const blocked = await enforceOwnerActionGates({ workspaceId: ws, businessId: a, actionId: randomUUID(), domain: "marketing", toStatus: "in_progress", findingCode: "MKT_OPP_SCALE_WINNER" }).then(() => false, () => true);
    expect(blocked).toBe(true);
    const audit = await db.auditEvent.findFirst({ where: { workspaceId: ws, eventName: AUDIT_EVENTS.OWNER_GATE_PROMOTION_BLOCKED }, orderBy: { occurredAt: "desc" } });
    expect((audit?.payload as any)?.businessId).toBe(a);
    // A consulting recommendation's promotion block carries no business.
    await emitAuditEvent({ workspaceId: ws, eventName: AUDIT_EVENTS.OWNER_GATE_PROMOTION_BLOCKED, actorType: "system", entityType: "recommendation", entityId: randomUUID(), payload: { errorName: "CashSafetyGateError" } });

    const panel = async (businessId: string) => {
      const res: any = await controlCenterGET({ request: new Request(`http://localhost/api/owner/control-center?businessId=${businessId}`), verifiedWorkspaceId: ws, verifiedActorId: actor } as any, {});
      const body = res?.__canonicalJsonResponse ? res.body : typeof res?.json === "function" ? await res.json() : res;
      return body.sections.financeBlocked as number;
    };
    expect(await panel(a)).toBe(1);
    expect(await panel(bb)).toBe(0);
    await teardownOwnerBusiness(a);
    await teardownOwnerBusiness(bb);
  });
});
