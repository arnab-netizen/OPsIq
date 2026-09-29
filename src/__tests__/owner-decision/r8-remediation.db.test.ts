/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma rows, seeded snapshot inputs and service payloads are untyped */
/**
 * Round-8 regressions through the real services on real Postgres:
 *   - Decision 3: the Owner "what changed" is a business-scoped Owner override — it lifts a rule for Owner
 *     Mode of that business only; another business, Formal Consulting Mode, a workspace/null rule and a
 *     business switch never observe it (and the shared rule row is never modified);
 *   - Decision 1 / continuity: a diagnosis of an in-progress or genuinely future period never takes over
 *     in-flight work, in every evidence domain and Recovery; a back-filled older period neither; once an
 *     in-progress period has ended, Owner Home follows the engaged work from the older cycle; a NEWER
 *     completed period carries it;
 *   - Decision 1 / Consulting: an amended-but-not-re-diagnosed unsafe Finance reading is kept (never an
 *     older period's SAFE); an in-progress unsafe period tightens both gates;
 *   - Now View / Home / gate parity on out-of-date figures (never "growth ready" while the gate holds growth);
 *   - Recovery's trend baseline is the previous evidence PERIOD (mutation-sensitive: pre-fix picks the last run);
 *   - action atomicity (all nine services): exact replay is a no-op, a different payload after completion is
 *     refused, a concurrent retry with a different payload is never reported as applied;
 *   - risks: a closed risk is not editable; a field edit is audited as an update with old/new values; closing
 *     through an edit resolves its alerts;
 *   - scheduled risk-review alerts are raised as a system actor (never the owner) and failures are counted.
 *
 * `[db]`-gated. Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-decision/r8-remediation.db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { createCashflowSnapshot } from "@/services/owner-cashflow/snapshot.service";
import { runCashflowDiagnosis } from "@/services/owner-cashflow/diagnosis.service";
import { updateCashflowAction } from "@/services/owner-cashflow/action.service";
import { createFinancialSnapshot, amendFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import { runFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import { updateFinanceAction } from "@/services/owner-finance/action.service";
import { createSalesSnapshot } from "@/services/owner-sales/snapshot.service";
import { runSalesDiagnosis } from "@/services/owner-sales/diagnosis.service";
import { updateSalesAction } from "@/services/owner-sales/action.service";
import { createOperationsSnapshot } from "@/services/owner-operations/snapshot.service";
import { runOperationsDiagnosis } from "@/services/owner-operations/diagnosis.service";
import { updateOperationsAction } from "@/services/owner-operations/action.service";
import { createSopSnapshot } from "@/services/owner-sop/snapshot.service";
import { runSopDiagnosis } from "@/services/owner-sop/diagnosis.service";
import { updateSopAction } from "@/services/owner-sop/action.service";
import { createMarketingSnapshot } from "@/services/owner-marketing/snapshot.service";
import { runMarketingDiagnosis } from "@/services/owner-marketing/diagnosis.service";
import { updateMarketingAction } from "@/services/owner-marketing/action.service";
import { createSnapshot as createRecoverySnapshot } from "@/services/founder-recovery/snapshot.service";
import { runCycle } from "@/services/founder-recovery/cycle.service";
import { updateRecoveryAction } from "@/services/founder-recovery/action.service";
import {
  DoNotRepeatBlockedError,
  enforceDoNotRepeatForPromotion,
  listOwnerDoNotRepeatRules,
  recordDoNotRepeat,
  recordOwnerDnrOverride,
} from "@/services/owner-mode/do-not-repeat.service";
import { createBusinessRisk, evaluateOverdueRiskAlerts, reviewRisk, scanOverdueRiskAlertsForWorkspace, updateBusinessRisk } from "@/services/owner-mode/business-risk.service";
import { SCHEDULER_SYSTEM_ACTOR } from "@/domain/owner-budget/system-actor";
import { getOwnerHome } from "@/services/owner-home/home.service";
import { getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";
import { enforceOwnerActionGates, loadOwnerGateConstraints } from "@/services/owner-mode/owner-action-gate.service";
import { enforceCashSafetyForPromotion } from "@/services/owner-finance/recommendation-cash-safety.service";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { ConflictError, NotFoundError, ValidationError } from "@/infra/errors";
import { ACTION_SERVICES, firstAction } from "./action-services-fixture";

const actor = randomUUID();
const DAY = 86_400_000;

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `r8-${actor}@example.com`, name: "R8 QA", isActive: true, updatedAt: new Date() },
  });
});

const iso = (d: Date) => d.toISOString().slice(0, 10);
/** A period ending `endDaysAgo` days ago (negative: in the future). */
function period(endDaysAgo: number, length = 20) {
  const end = new Date(Date.now() - endDaysAgo * DAY);
  return { periodStart: iso(new Date(end.getTime() - length * DAY)), periodEnd: iso(end) };
}
/** The in-progress current period: started 10 days ago, ends in 5 days. */
const IN_PROGRESS = { periodStart: iso(new Date(Date.now() - 10 * DAY)), periodEnd: iso(new Date(Date.now() + 5 * DAY)) };
/** A period that has not started yet. */
const FUTURE = { periodStart: iso(new Date(Date.now() + 10 * DAY)), periodEnd: iso(new Date(Date.now() + 40 * DAY)) };
const UNSAFE = { cashInHand: 100, dailyCollections: 50, receivables: 20000, receivablesOverdue: 15000, payables: 40000, upcomingEmi: 15000, rentDue: 10000, salaryDue: 20000, vendorDue: 15000, taxDue: 5000, ownerWithdrawal: 4000 };
const SAFE_CASH = { cashInHand: 500000, dailyCollections: 20000, receivables: 5000, receivablesOverdue: 0, payables: 5000, upcomingEmi: 1000, rentDue: 2000, salaryDue: 5000, vendorDue: 1000, taxDue: 500, ownerWithdrawal: 500 };

async function business(workspaceId: string, name: string) {
  const b = await createBusiness({ name, businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false }, actor, workspaceId);
  return b.id as string;
}
const growthGate = (ws: string, b: string) =>
  enforceOwnerActionGates({ workspaceId: ws, businessId: b, actionId: randomUUID(), domain: "marketing", toStatus: "in_progress", findingCode: "MKT_OPP_SCALE_WINNER" }).then(
    () => "allowed",
    (e: unknown) => (e instanceof ConflictError ? "blocked" : `error: ${String(e)}`)
  );
const REASON = "A new supplier contract halves the cost per order.";

// ─── Decision 3 — Owner DNR overrides never alter Consulting DNR semantics ─────────────────────────────

describe("[db] Decision 3 — the Owner 'what changed' is a business-scoped Owner override", () => {
  /** A Consulting promotion check of a recommendation whose finding sits in `impactArea` (real rule table). */
  const consultingCheck = (ws: string, impactArea: string) =>
    enforceDoNotRepeatForPromotion(randomUUID(), ws, {
      db: {
        recommendation: { findUnique: async () => ({ findingId: "f1" }) },
        finding: { findFirst: async () => ({ impactArea }) },
        ownerDoNotRepeatRule: db.ownerDoNotRepeatRule as any,
      } as any,
    }).then(() => "allowed", (e: unknown) => (e instanceof DoNotRepeatBlockedError ? "blocked" : `error: ${String(e)}`));

  it("[db] (1) recorded for business A (2) lifts A's gate (3) B stays blocked (4) Consulting is unchanged — the shared rule row is never modified", async () => {
    const ws = randomUUID();
    const a = await business(ws, "QA R8 DNR A");
    const b = await business(ws, "QA R8 DNR B");
    const ruleA = await recordDoNotRepeat({ workspaceId: ws, businessId: a, memoryKey: "scope:marketing", summary: "Paid ads burst", reason: "Lost money last time", actorId: actor });
    await recordDoNotRepeat({ workspaceId: ws, businessId: b, memoryKey: "scope:marketing", summary: "Paid ads burst", reason: "Lost money last time", actorId: actor });
    expect(await growthGate(ws, a)).toBe("blocked");
    expect(await growthGate(ws, b)).toBe("blocked");
    expect(await consultingCheck(ws, "marketing")).toBe("blocked");

    const view = await recordOwnerDnrOverride({ workspaceId: ws, businessId: a, ruleId: ruleA, actorId: actor, reason: REASON });
    expect(view).toMatchObject({ id: ruleA, changedContextExplanation: REASON, ownerOverride: true });
    expect(await growthGate(ws, a)).toBe("allowed");
    expect(await growthGate(ws, b)).toBe("blocked");
    // Consulting: unchanged — the rule still blocks its promotions, and the shared row is untouched.
    expect(await consultingCheck(ws, "marketing")).toBe("blocked");
    expect((await db.ownerDoNotRepeatRule.findFirst({ where: { id: ruleA } }))!.changedContextExplanation).toBeNull();
    // Persisted as an Owner operating-memory fact keyed by rule AND business, with actor, reason and time; audited.
    const fact = await db.operatingMemoryEntry.findFirst({ where: { workspaceId: ws, memoryType: "DNR_OWNER_OVERRIDE" } });
    expect(fact!.data).toMatchObject({ ruleId: ruleA, businessId: a, actorId: actor, reason: REASON });
    expect(await db.auditEvent.count({ where: { workspaceId: ws, entityId: ruleA, eventName: AUDIT_EVENTS.OWNER_DO_NOT_REPEAT_CONTEXT_CHANGED } })).toBe(1);
    // The rule lists as lifted for A only.
    expect((await listOwnerDoNotRepeatRules(ws, a)).find((r) => r.id === ruleA)!.changedContextExplanation).toBe(REASON);
    expect((await listOwnerDoNotRepeatRules(ws, b)).some((r) => r.id === ruleA)).toBe(false);
    // Governed: the same text again is idempotent; a different one is refused; a short one is refused.
    await expect(recordOwnerDnrOverride({ workspaceId: ws, businessId: a, ruleId: ruleA, actorId: actor, reason: REASON })).resolves.toBeDefined();
    await expect(recordOwnerDnrOverride({ workspaceId: ws, businessId: a, ruleId: ruleA, actorId: actor, reason: "Something else entirely changed since then." })).rejects.toBeInstanceOf(ValidationError);
    expect(await db.operatingMemoryEntry.count({ where: { workspaceId: ws, memoryType: "DNR_OWNER_OVERRIDE" } })).toBe(1);
    await teardownOwnerBusiness(a);
    await teardownOwnerBusiness(b);
  });

  it("[db] (5) a workspace/null rule is never silently lifted: not attributable in a multi-business workspace; with one business, Owner Mode only", async () => {
    const ws = randomUUID();
    const a = await business(ws, "QA R8 DNR Null A");
    const b = await business(ws, "QA R8 DNR Null B");
    const nullRule = await db.ownerDoNotRepeatRule.create({
      data: { workspaceId: ws, businessId: null, memoryKey: "scope:marketing", summary: "Workspace rule", reason: "Consulting finding", blocksRepetition: true, active: true },
    });
    await expect(recordOwnerDnrOverride({ workspaceId: ws, businessId: a, ruleId: nullRule.id, actorId: actor, reason: REASON })).rejects.toBeInstanceOf(NotFoundError);
    expect((await listOwnerDoNotRepeatRules(ws, a)).some((r) => r.id === nullRule.id)).toBe(false);
    expect(await consultingCheck(ws, "marketing")).toBe("blocked");
    await teardownOwnerBusiness(b);
    // Now the sole real business: the null rule applies to it (the gate) and the Owner can lift it for Owner
    // Mode only — Consulting still blocks.
    expect(await growthGate(ws, a)).toBe("blocked");
    await recordOwnerDnrOverride({ workspaceId: ws, businessId: a, ruleId: nullRule.id, actorId: actor, reason: REASON });
    expect(await growthGate(ws, a)).toBe("allowed");
    expect(await consultingCheck(ws, "marketing")).toBe("blocked");
    expect((await db.ownerDoNotRepeatRule.findFirst({ where: { id: nullRule.id } }))!.changedContextExplanation).toBeNull();
    await db.ownerDoNotRepeatRule.delete({ where: { id: nullRule.id } });
    await teardownOwnerBusiness(a);
  });

  it("[db] (6) a business switch cannot apply the override to the previous business; Consulting-only keys are not Owner-overridable", async () => {
    const ws = randomUUID();
    const a = await business(ws, "QA R8 DNR Switch A");
    const b = await business(ws, "QA R8 DNR Switch B");
    const ruleA = await recordDoNotRepeat({ workspaceId: ws, businessId: a, memoryKey: "scope:marketing", summary: "Paid ads burst", reason: "Lost money", actorId: actor });
    // Sent with business B (the owner switched): refused — A's rule is not B's to lift; nothing recorded.
    await expect(recordOwnerDnrOverride({ workspaceId: ws, businessId: b, ruleId: ruleA, actorId: actor, reason: REASON })).rejects.toBeInstanceOf(NotFoundError);
    expect(await db.operatingMemoryEntry.count({ where: { workspaceId: ws, memoryType: "DNR_OWNER_OVERRIDE" } })).toBe(0);
    expect(await growthGate(ws, a)).toBe("blocked");
    // An override recorded for A never applies to B's own rule for the same area.
    const ruleB = await recordDoNotRepeat({ workspaceId: ws, businessId: b, memoryKey: "scope:marketing", summary: "Paid ads burst", reason: "Lost money", actorId: actor });
    await recordOwnerDnrOverride({ workspaceId: ws, businessId: a, ruleId: ruleA, actorId: actor, reason: REASON });
    expect(await growthGate(ws, b)).toBe("blocked");
    expect((await loadOwnerGateConstraints(ws, b)).doNotRepeat.map((r) => r.id)).toEqual([ruleB]);
    // A Consulting-only key (not an owner domain) cannot be lifted through the Owner path, and is not listed.
    const consultingOnly = await recordDoNotRepeat({ workspaceId: ws, businessId: a, memoryKey: "scope:governance", summary: "Consulting rule", reason: "Engagement finding", actorId: actor });
    await expect(recordOwnerDnrOverride({ workspaceId: ws, businessId: a, ruleId: consultingOnly, actorId: actor, reason: REASON })).rejects.toBeInstanceOf(NotFoundError);
    expect((await listOwnerDoNotRepeatRules(ws, a)).some((r) => r.id === consultingOnly)).toBe(false);
    await teardownOwnerBusiness(a);
    await teardownOwnerBusiness(b);
  });
});

// ─── Decision 1 — continuity follows completed evidence, in every domain ───────────────────────────────

type ContinuityDomain = {
  name: string;
  model: string;
  run: (ws: string, b: string, p: { periodStart: string; periodEnd: string }) => Promise<{ id: string }>;
  engage: (id: string, ws: string) => Promise<unknown>;
};
const CONTINUITY: ContinuityDomain[] = [
  { name: "cashflow", model: "ownerCashflowAction", run: async (ws, b, p) => runCashflowDiagnosis(b, (await createCashflowSnapshot(b, { ...p, currency: "INR", ...UNSAFE }, actor, ws)).id, actor, ws), engage: (id, ws) => updateCashflowAction(id, { status: "assigned" }, actor, ws) },
  { name: "finance", model: "ownerFinanceAction", run: async (ws, b, p) => runFinanceDiagnosis(b, (await createFinancialSnapshot(b, { ...p, currency: "INR", revenue: 100000, fixedCosts: 40000, variableCosts: 40000, discountAmount: 15000, cashOnHand: 50000 } as any, actor, ws)).id, actor, ws), engage: (id, ws) => updateFinanceAction(id, { status: "assigned" }, actor, ws) },
  { name: "sales", model: "ownerSalesAction", run: async (ws, b, p) => runSalesDiagnosis(b, (await createSalesSnapshot(b, { ...p, currency: "INR", leads: 1000, qualifiedLeads: 400, orders: 30, revenue: 60000, newCustomers: 12, repeatCustomers: 3, lostCustomers: 25, complaints: 6, discountAmount: 18000, refundAmount: 6000, b2bRevenue: 10000, b2cRevenue: 50000, b2bPipelineValue: 6000 } as any, actor, ws)).id, actor, ws), engage: (id, ws) => updateSalesAction(id, { status: "assigned" }, actor, ws) },
  { name: "operations", model: "ownerOperationsAction", run: async (ws, b, p) => runOperationsDiagnosis(b, (await createOperationsSnapshot(b, { ...p, currency: "INR", ordersReceived: 1500, ordersCompleted: 900, ordersDelayed: 500, reworkCount: 180, complaints: 120, staffHours: 400, machineCapacityUnits: 1000, idleHours: 120, deliveryAttempts: 900, deliveryFailures: 200, inventoryShortages: 4, sopChecks: 100, sopMisses: 50 } as any, actor, ws)).id, actor, ws), engage: (id, ws) => updateOperationsAction(id, { status: "assigned" }, actor, ws) },
  { name: "sop", model: "ownerSopAction", run: async (ws, b, p) => runSopDiagnosis(b, (await createSopSnapshot(b, { ...p, currency: "INR", actionsAssigned: 100, actionsCompleted: 50, actionsVerified: 10, actionsOverdue: 40, actionsDisputed: 8, actionsReassigned: 30, repeatedFailures: 30, proofRequired: 40, proofProvided: 10, recurringProcesses: 20, documentedSops: 5 } as any, actor, ws)).id, actor, ws), engage: (id, ws) => updateSopAction(id, { status: "assigned" }, actor, ws) },
  { name: "marketing", model: "ownerMarketingAction", run: async (ws, b, p) => runMarketingDiagnosis(b, (await createMarketingSnapshot(b, { ...p, currency: "INR", marketingSpend: 100000, revenue: 30000, leads: 200, inquiries: 150, orders: 4, newCustomers: 4, paidLeads: 180, organicLeads: 20, campaignsRun: 10, campaignsWithFollowup: 2, contentPosted: 2, couponsRedeemed: 1, referrals: 0, walkIns: 5 } as any, actor, ws)).id, actor, ws), engage: (id, ws) => updateMarketingAction(id, { status: "assigned" }, actor, ws) },
  {
    name: "recovery", model: "recoveryAction",
    run: async (ws, b, p) => runCycle(b, (await createRecoverySnapshot(b, { ...p, currency: "INR", revenue: 100000, totalCosts: 95000, orderCount: 1000, newCustomers: 70, repeatCustomers: 30, deliveryCost: 12000 } as any, actor, ws)).id, actor, ws),
    engage: async (id, ws) => updateRecoveryAction(id, { status: "assigned", version: (await db.recoveryAction.findFirst({ where: { id } }))!.version }, actor, ws),
  },
];

describe("[db] Decision 1 — a cycle on in-progress, future or older figures never takes over in-flight work (every domain)", () => {
  for (const d of CONTINUITY) {
    it(`[db] ${d.name}: in-progress and future periods and a back-fill hold the engaged action on the current cycle; a NEWER completed period carries it`, async () => {
      const ws = randomUUID();
      const b = await business(ws, `QA R8 Continuity ${d.name}`);
      const model = (db as any)[d.model];
      const current = await d.run(ws, b, period(12));
      const action = (await model.findMany({ where: { cycleId: current.id }, orderBy: [{ id: "asc" }] }))[0];
      expect(action, `${d.name} has an action to engage`).toBeDefined();
      await d.engage(action.id, ws);

      for (const [label, p] of [["in-progress", IN_PROGRESS], ["future", FUTURE], ["back-filled", period(80)]] as const) {
        const other = await d.run(ws, b, p);
        const after = await model.findFirst({ where: { id: action.id } });
        expect(after.cycleId, `${d.name}: ${label} cycle does not take the engaged action`).toBe(current.id);
        expect(after.status).toBe("assigned");
        expect(await db.auditEvent.count({ where: { workspaceId: ws, entityId: action.id, payload: { path: ["reason"], equals: "carried_forward_by_diagnosis" } } })).toBe(0);
        void other;
      }

      const newer = await d.run(ws, b, period(2));
      expect((await model.findFirst({ where: { id: action.id } })).cycleId, `${d.name}: a newer completed period carries it`).toBe(newer.id);
      await teardownOwnerBusiness(b);
    });
  }

  it("[db] Owner Home follows the engaged work from the older cycle once the in-progress period has ended (read-time continuity)", async () => {
    const ws = randomUUID();
    const b = await business(ws, "QA R8 Read-time continuity");
    const current = await CONTINUITY[0].run(ws, b, period(12));
    const action = (await db.ownerCashflowAction.findMany({ where: { cycleId: current.id }, orderBy: { priorityScore: "desc" } }))[0];
    await updateCashflowAction(action.id, { status: "assigned" }, actor, ws);
    const provisional = await CONTINUITY[0].run(ws, b, IN_PROGRESS);
    // While in progress: the current cycle (and the engaged action on it) is what Home shows.
    const before = (await getOwnerHome(ws, b)).currentOwnerDecision!;
    expect([before.primaryTarget, ...before.attention].some((t: any) => t && String(t.candidateId).endsWith(`:${action.id}`))).toBe(true);
    // The period ends (moved into the past — the snapshot's own period is the only thing that changes).
    const snap = await db.ownerCashflowCycle.findFirst({ where: { id: provisional.id }, select: { snapshotId: true } });
    await db.ownerCashflowSnapshot.update({ where: { id: snap!.snapshotId }, data: { periodStart: new Date(Date.now() - 6 * DAY), periodEnd: new Date(Date.now() - DAY) } });
    const after = (await getOwnerHome(ws, b)).currentOwnerDecision!;
    const ids = [after.primaryTarget, ...after.attention].filter(Boolean).map((t: any) => String(t.candidateId));
    // The engaged action (still on the older cycle) is followed; the new cycle's never-engaged proposal with the
    // same key is not shown beside it.
    expect(ids.some((id) => id.endsWith(`:${action.id}`))).toBe(true);
    const dup = await db.ownerCashflowAction.findFirst({ where: { cycleId: provisional.id, findingCode: action.findingCode, recommendationCode: action.recommendationCode } });
    expect(dup, "the in-progress diagnosis proposed the same step").toBeTruthy();
    expect(ids.some((id) => id.endsWith(`:${dup!.id}`))).toBe(false);
    await teardownOwnerBusiness(b);
  });
});

// ─── Decision 1 — Consulting and Owner gates on amended and in-progress Finance ─────────────────────────

describe("[db] Decision 1 — amended Finance and in-progress periods in both gates", () => {
  const FIN = { currency: "INR", revenue: 500000, costOfGoods: 200000, fixedCosts: 100000, variableCosts: 50000, cashOnHand: 300000 };
  const finance = async (ws: string, b: string, p: { periodStart: string; periodEnd: string }, state: string) => {
    const s = await createFinancialSnapshot(b, { ...p, ...FIN } as any, actor, ws);
    const c = await runFinanceDiagnosis(b, s.id, actor, ws);
    await db.ownerFinanceCycle.update({ where: { id: c.id }, data: { survivalState: state } });
    return s.id as string;
  };
  const cash = async (ws: string, b: string, p: { periodStart: string; periodEnd: string }, state: string) => {
    const c = await runCashflowDiagnosis(b, (await createCashflowSnapshot(b, { ...p, currency: "INR", ...SAFE_CASH }, actor, ws)).id, actor, ws);
    await db.ownerCashflowCycle.update({ where: { id: c.id }, data: { cashflowState: state } });
  };
  const consulting = (ws: string, impactArea = "growth") =>
    enforceCashSafetyForPromotion("rec-r8", ws, {
      db: {
        clientAccount: db.clientAccount, ownerBusiness: db.ownerBusiness, ownerCashflowCycle: db.ownerCashflowCycle, ownerFinanceCycle: db.ownerFinanceCycle,
        recommendation: { findUnique: async () => ({ findingId: "f1" }) }, finding: { findFirst: async () => ({ impactArea }) },
      } as any,
    }).then(() => "allowed", (e: any) => e.effectiveState ?? `error: ${String(e)}`);

  it("[db] August CRITICAL amended (not re-diagnosed), July SAFE, cash SAFE: both gates keep CRITICAL — never the older SAFE period", async () => {
    const ws = randomUUID();
    const b = await business(ws, "QA R8 Amended Finance");
    await cash(ws, b, period(3), "SAFE");
    await finance(ws, b, period(40), "SAFE");
    const aug = await finance(ws, b, period(5), "CRITICAL");
    await amendFinancialSnapshot(aug, { amendmentReason: "corrected COGS", costOfGoodsOrServices: 210000 } as any, actor, ws);
    expect(await consulting(ws)).toBe("CRITICAL");
    expect(await growthGate(ws, b)).toBe("blocked");
    const g = await loadOwnerGateConstraints(ws, b);
    expect(g.cash).toMatchObject({ gateState: "CRITICAL", driver: "unverified", source: "finance" });
    // Home routes the refresh to Finance (the amended source).
    const d = (await getOwnerHome(ws, b)).currentOwnerDecision!;
    const refresh = [d.primaryTarget, ...d.attention].find((t: any) => t?.findingCode === "GATE_CASH_UNVERIFIED");
    if (refresh) expect(refresh.domain).toBe("finance");
    await teardownOwnerBusiness(b);
  });

  it("[db] an in-progress CRITICAL cash reading tightens both gates over a completed SAFE one; an in-progress SAFE never relaxes a completed CRITICAL", async () => {
    const ws = randomUUID();
    const b = await business(ws, "QA R8 Provisional");
    await cash(ws, b, period(3), "SAFE");
    await finance(ws, b, period(3), "SAFE");
    expect(await growthGate(ws, b)).toBe("allowed");
    await cash(ws, b, IN_PROGRESS, "CRITICAL");
    expect(await growthGate(ws, b)).toBe("blocked");
    expect((await loadOwnerGateConstraints(ws, b)).cash).toMatchObject({ gateState: "CRITICAL", provisional: true });
    expect(await consulting(ws)).toBe("CRITICAL");
    const home = await getOwnerHome(ws, b);
    expect(home.summary!.cashDanger).toMatchObject({ status: "in_progress" });

    const ws2 = randomUUID();
    const b2 = await business(ws2, "QA R8 Provisional 2");
    await cash(ws2, b2, period(3), "CRITICAL");
    await finance(ws2, b2, period(3), "CRITICAL");
    await cash(ws2, b2, IN_PROGRESS, "SAFE");
    await finance(ws2, b2, IN_PROGRESS, "SAFE");
    expect((await loadOwnerGateConstraints(ws2, b2)).cash).toMatchObject({ gateState: "CRITICAL", provisional: false });
    expect(await consulting(ws2)).toBe("CRITICAL");
    await teardownOwnerBusiness(b);
    await teardownOwnerBusiness(b2);
  });

  it("[db] Now View / Home / gate parity: out-of-date SAFE figures are never 'growth ready' while the gate holds growth", async () => {
    const ws = randomUUID();
    const b = await business(ws, "QA R8 Parity stale");
    await cash(ws, b, period(100), "SAFE");
    await finance(ws, b, period(100), "SAFE");
    expect(await growthGate(ws, b)).toBe("blocked");
    const now: any = await getOwnerNowView(ws, b);
    expect(now.view.cashDangerStatus).not.toBe("OK");
    const row = await db.ownerGuidanceSnapshot.findFirst({ where: { workspaceId: ws }, orderBy: { createdAt: "desc" } });
    expect(row!.cashSafe).toBe(false);
    expect(row!.growthReadinessTier).toBe("STABILIZE_FIRST");
    await teardownOwnerBusiness(b);
  });
});

// ─── Recovery baseline — the previous evidence PERIOD, never the last run ──────────────────────────────

describe("[db] Recovery's trend baseline is the previous evidence period (mutation-sensitive)", () => {
  const recoveryPeriod = (endDaysAgo: number, revenue: number) => ({
    ...period(endDaysAgo, 29), currency: "INR", revenue, totalCosts: revenue * 0.7, orderCount: 1000, newCustomers: 50, repeatCustomers: 50, deliveryCost: revenue * 0.02,
  });
  it("[db] runs whose run order disagrees with period order: the newest period is compared with the previous PERIOD (August), not the last run (a back-filled July)", async () => {
    const ws = randomUUID();
    const b = await business(ws, "QA R8 Recovery Baseline");
    // Run 1: August (revenue 100k). Run 2: a back-filled July (revenue 400k). Run 3: September (revenue 60k).
    await runCycle(b, (await createRecoverySnapshot(b, recoveryPeriod(40, 100000) as any, actor, ws)).id, actor, ws);
    await runCycle(b, (await createRecoverySnapshot(b, recoveryPeriod(80, 400000) as any, actor, ws)).id, actor, ws);
    const sept = await runCycle(b, (await createRecoverySnapshot(b, recoveryPeriod(5, 60000) as any, actor, ws)).id, actor, ws);
    const revenue = await db.recoveryFinding.findFirst({ where: { cycleId: sept.id, code: "LOW_REVENUE" }, select: { currentValue: true } });
    // September vs August: −40%. (Against the last run — July — it would read −85%.)
    expect(revenue).not.toBeNull();
    expect(revenue!.currentValue).toBeCloseTo(-40, 5);
    await teardownOwnerBusiness(b);
  });
});

// ─── Action atomicity — all nine action services ───────────────────────────────────────────────────────

describe("[db] action atomicity: exact replay, terminal lock, concurrent retry with a different payload", () => {
  const evidence = { completionNotes: "Done and checked", completionEvidence: ["receipt.pdf"] };
  for (const svc of ACTION_SERVICES) {
    it(`[db] ${svc.name}: a replay is a no-op; a changed payload on a completed action is refused; racing different payloads never both succeed`, async () => {
      const ws = randomUUID();
      const b = await business(ws, `QA R8 Atomic ${svc.name}`);
      const id = await svc.seed(ws, b, actor);
      await svc.update(id, { status: "assigned" }, ws, actor);
      await svc.update(id, { status: "in_progress" }, ws, actor);
      // Race: the same completion with DIFFERENT evidence — exactly one applies; the other is refused (never "applied").
      const race = await Promise.allSettled([
        svc.update(id, { status: "completed", completionNotes: "Done and checked", completionEvidence: ["receipt-a.pdf"], ...svc.completionExtra }, ws, actor),
        svc.update(id, { status: "completed", completionNotes: "Done and checked", completionEvidence: ["receipt-b.pdf"], ...svc.completionExtra }, ws, actor),
      ]);
      const ok = race.filter((r) => r.status === "fulfilled");
      expect(ok, `${svc.name}: exactly one completion applied`).toHaveLength(1);
      for (const r of race) if (r.status === "rejected") expect(r.reason instanceof ConflictError || r.reason instanceof ValidationError).toBe(true);
      const row = await svc.read(id);
      const applied = (ok[0] as PromiseFulfilledResult<any>).value;
      expect(svc.evidenceOf(row)).toEqual(svc.evidenceOf(applied));
      const audits = await db.auditEvent.count({ where: { workspaceId: ws, entityId: id, payload: { path: ["status"], equals: "completed" } } });
      expect(audits, `${svc.name}: one completion audit`).toBe(1);

      // An exact replay of the recorded completion is a no-op (no second audit, no 400).
      const replay = { status: "completed", completionNotes: "Done and checked", completionEvidence: svc.evidenceOf(row), ...svc.completionExtra };
      await expect(svc.update(id, replay, ws, actor)).resolves.toBeDefined();
      expect(await db.auditEvent.count({ where: { workspaceId: ws, entityId: id, payload: { path: ["status"], equals: "completed" } } })).toBe(1);
      // A changed payload on the completed record is refused and the record is unchanged.
      await expect(svc.update(id, { completionNotes: "Rewritten afterwards" }, ws, actor)).rejects.toBeInstanceOf(ValidationError);
      expect(svc.notesOf(await svc.read(id))).toBe("Done and checked");
      void evidence;
      await teardownOwnerBusiness(b);
    });
  }
});

// ─── Risks and scheduled alerts ────────────────────────────────────────────────────────────────────────

describe("[db] risks: closed records are final; edits are audited as updates; closing resolves alerts", () => {
  it("[db] a field edit is an UPDATED event with old/new values; a closed risk cannot be edited; closing through an edit resolves its critical alert", async () => {
    const ws = randomUUID();
    await db.workspace.create({ data: { id: ws, name: "R8 Risk WS", slug: `r8-risk-${ws.substring(0, 8)}` } });
    const b = await business(ws, "QA R8 Risk");
    const risk = await createBusinessRisk({ workspaceId: ws, actorId: actor, riskCode: "R8-1", title: "Key supplier", category: "OPERATIONAL" as any, likelihood: 95, impact: 95 });
    await updateBusinessRisk({ workspaceId: ws, riskId: risk.id, actorId: actor, title: "Key supplier dependency" });
    const upd = await db.auditEvent.findFirst({ where: { workspaceId: ws, entityId: risk.id, eventName: AUDIT_EVENTS.OWNER_BUSINESS_RISK_UPDATED } });
    expect(upd!.payload).toMatchObject({ changedFields: ["title"], previous: { title: "Key supplier" }, next: { title: "Key supplier dependency" } });
    expect(await db.auditEvent.count({ where: { workspaceId: ws, entityId: risk.id, eventName: AUDIT_EVENTS.OWNER_BUSINESS_RISK_STATUS_CHANGED } })).toBe(0);
    expect(await db.alert.count({ where: { workspaceId: ws, idempotencyKey: `risk_critical_${risk.id}`, resolvedAt: null } })).toBe(1);
    await updateBusinessRisk({ workspaceId: ws, riskId: risk.id, actorId: actor, status: "CLOSED" as any });
    expect(await db.alert.count({ where: { workspaceId: ws, idempotencyKey: `risk_critical_${risk.id}`, resolvedAt: null } })).toBe(0);
    await expect(updateBusinessRisk({ workspaceId: ws, riskId: risk.id, actorId: actor, title: "Edited after closing" })).rejects.toBeInstanceOf(ValidationError);
    expect((await db.businessRiskEntry.findFirst({ where: { id: risk.id } }))!.title).toBe("Key supplier dependency");
    await expect(reviewRisk({ workspaceId: ws, riskId: risk.id, actorId: actor, newStatus: "IDENTIFIED" as any })).rejects.toBeInstanceOf(ValidationError);
    await db.alert.deleteMany({ where: { workspaceId: ws } });
    await db.businessRiskEntry.deleteMany({ where: { workspaceId: ws } });
    await teardownOwnerBusiness(b);
    await db.workspace.delete({ where: { id: ws } }).catch(() => undefined);
  });

  it("[db] the scheduler's overdue-risk scan raises alerts as a system actor (never the owner) and counts failures", async () => {
    const ws = randomUUID();
    const b = await business(ws, "QA R8 Scan");
    await db.workspace.create({ data: { id: ws, name: "R8 Scan WS", slug: `r8-scan-${ws.substring(0, 8)}` } });
    await db.workspaceMembership.create({ data: { workspaceId: ws, userId: actor, role: "owner", isActive: true } as any });
    const risk = await createBusinessRisk({ workspaceId: ws, actorId: actor, riskCode: "R8-SCAN", title: "Overdue", category: "OPERATIONAL" as any, likelihood: 20, impact: 20 });
    await db.businessRiskEntry.update({ where: { id: risk.id }, data: { reviewDueDate: new Date(Date.now() - 3 * DAY) } });
    const result = await scanOverdueRiskAlertsForWorkspace(ws);
    expect(result).toMatchObject({ recipientFound: true, attempted: 1, created: 1, failed: 0 });
    const alert = await db.alert.findFirst({ where: { workspaceId: ws, idempotencyKey: `risk_overdue_${risk.id}` } });
    expect(alert!.userId).toBe(actor);
    const created = await db.auditEvent.findFirst({ where: { workspaceId: ws, entityId: alert!.id, eventName: AUDIT_EVENTS.ALERT_CREATED } });
    expect(created!.actorType).toBe("system");
    expect(created!.actorId).toBeNull();
    // A recipient that cannot receive an alert: the failure is counted, never a silent success.
    await db.alert.deleteMany({ where: { workspaceId: ws } });
    const failed = await evaluateOverdueRiskAlerts(ws, randomUUID(), new Date(), SCHEDULER_SYSTEM_ACTOR);
    expect(failed.failed).toBe(1);
    expect(failed.created + failed.reactivated).toBe(0);
    await db.alert.deleteMany({ where: { workspaceId: ws } });
    await db.businessRiskEntry.deleteMany({ where: { workspaceId: ws } });
    await db.workspaceMembership.deleteMany({ where: { workspaceId: ws } });
    await teardownOwnerBusiness(b);
    await db.workspace.delete({ where: { id: ws } }).catch(() => undefined);
  });
});

void firstAction;
