/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma rows, seeded snapshot inputs and service payloads are untyped */
/**
 * Round-7 remediation regressions, through the real services on real Postgres:
 *   - Decision 1: an unassigned compliance item in a multi-business workspace is surfaced (routed to its
 *     assignment control) and restricts no business; the governed assignment (null → business only, same
 *     workspace, real active business, compare-and-set, audited previous/new) then attributes it — the next
 *     read of the canonical decision and the gate enforce it for that business only;
 *   - Decision 2: the do-not-repeat changed-context write (exact rule, ownership, active rule, meaningful
 *     reason, compare-and-set, audited old/new) lifts that rule's hold on the next read and at the gate;
 *   - Decision 5A: a back-filled older period never takes over in-flight work;
 *   - Decision 5B: Recovery's trend baseline is the previous evidence PERIOD, never the largest run number;
 *   - Decision 5C: all nine action services apply a transition once under concurrent submission;
 *   - Decision 5D: Now View reads raise no alert and write nothing on a steady-state read, repeated or concurrent;
 *   - Now View reads one business's evidence (never an aggregate of several).
 *
 * `[db]`-gated. Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-decision/r7-remediation.db.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { createCashflowSnapshot } from "@/services/owner-cashflow/snapshot.service";
import { runCashflowDiagnosis } from "@/services/owner-cashflow/diagnosis.service";
import { updateCashflowAction } from "@/services/owner-cashflow/action.service";
import { createFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
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
import { createStrategySnapshot } from "@/services/owner-strategy/snapshot.service";
import { runStrategyDiagnosis } from "@/services/owner-strategy/diagnosis.service";
import { updateStrategyAction } from "@/services/owner-strategy/action.service";
import { createSnapshot as createRecoverySnapshot } from "@/services/founder-recovery/snapshot.service";
import { runCycle } from "@/services/founder-recovery/cycle.service";
import { updateRecoveryAction } from "@/services/founder-recovery/action.service";
import { createBudgetPeriod, recordSpendEntry } from "@/services/owner-budget/budget.service";
import { listBudgetActions, updateBudgetAction } from "@/services/owner-budget/action-link.service";
import { recordComplianceItem, assignComplianceItemBusiness } from "@/services/owner-mode/compliance.service";
import { recordDoNotRepeat, recordDoNotRepeatChangedContext } from "@/services/owner-mode/do-not-repeat.service";
import { createBusinessRisk } from "@/services/owner-mode/business-risk.service";
import { getOwnerHome } from "@/services/owner-home/home.service";
import { getOwnerNowView } from "@/services/owner-guidance/owner-now-view.service";
import { enforceOwnerActionGates } from "@/services/owner-mode/owner-action-gate.service";
import { ConflictError, NotFoundError, ValidationError } from "@/infra/errors";

const actor = randomUUID();
const DAY = 86_400_000;

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `r7-${actor}@example.com`, name: "R7 QA", isActive: true, updatedAt: new Date() },
  });
});

const iso = (d: Date) => d.toISOString().slice(0, 10);
function period(endDaysAgo: number, length = 20) {
  const end = new Date(Date.now() - endDaysAgo * DAY);
  return { periodStart: iso(new Date(end.getTime() - length * DAY)), periodEnd: iso(end) };
}
const UNSAFE = { cashInHand: 100, dailyCollections: 50, receivables: 20000, receivablesOverdue: 15000, payables: 40000, upcomingEmi: 15000, rentDue: 10000, salaryDue: 20000, vendorDue: 15000, taxDue: 5000, ownerWithdrawal: 4000 };

async function business(workspaceId: string, name: string) {
  const b = await createBusiness({ name, businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false }, actor, workspaceId);
  return b.id as string;
}
const growthGate = (ws: string, b: string) =>
  enforceOwnerActionGates({ workspaceId: ws, businessId: b, actionId: randomUUID(), domain: "marketing", toStatus: "in_progress", findingCode: "MKT_OPP_SCALE_WINNER" }).then(
    () => "allowed",
    (e: unknown) => (e instanceof ConflictError ? e.message : `error: ${String(e)}`)
  );
const expired = () => new Date(Date.now() - 5 * DAY);

describe("[db] Decision 1 — assigning an unattributed compliance item to the business it affects", () => {
  it("[db] unassigned in a multi-business workspace: surfaced and routed to its assignment control, restricts no business; once assigned, it restricts exactly that business", async () => {
    const ws = randomUUID();
    const a = await business(ws, "QA R7 Compliance A");
    const b = await business(ws, "QA R7 Compliance B");
    const itemId = await recordComplianceItem({ workspaceId: ws, businessId: null, kind: "licence", name: "Trade licence", expiresAt: expired(), actorId: actor });

    for (const biz of [a, b]) {
      const d = (await getOwnerHome(ws, biz)).currentOwnerDecision!;
      const t = d.attention.find((x: any) => x.candidateId === `compliance_item:${itemId}`)!;
      expect(t.title).toBe('Assign "Trade licence" to the business it affects');
      expect(t.targetRoute).toBe(`/owner/compliance/${itemId}#assign-business`);
      expect(await growthGate(ws, biz)).toBe("allowed");
    }

    const assigned = await assignComplianceItemBusiness({ workspaceId: ws, itemId, actorId: actor, businessId: a });
    expect(assigned.businessId).toBe(a);
    const audit = await db.auditEvent.findMany({ where: { workspaceId: ws, entityId: itemId, eventName: "owner.compliance_business_assigned" } });
    expect(audit).toHaveLength(1);
    expect(audit[0].payload).toMatchObject({ previousBusinessId: null, newBusinessId: a });

    // The next read of the canonical decision: A's own obligation (renew it); B no longer sees it.
    const dA = (await getOwnerHome(ws, a)).currentOwnerDecision!;
    expect(dA.primaryTarget).toMatchObject({ candidateId: `compliance_item:${itemId}`, source: "compliance_item" });
    expect(dA.primaryTarget!.title).toMatch(/^Renew "Trade licence"/);
    const dB = (await getOwnerHome(ws, b)).currentOwnerDecision!;
    expect(dB.attention.some((x: any) => x.candidateId === `compliance_item:${itemId}`)).toBe(false);
    expect(await growthGate(ws, a)).toMatch(/Professional review required: "Trade licence"/);
    expect(await growthGate(ws, b)).toBe("allowed");
    await db.ownerComplianceItem.deleteMany({ where: { workspaceId: ws } });
    await teardownOwnerBusiness(a);
    await teardownOwnerBusiness(b);
  });

  it("[db] governed: only null → business; the business must be a real, active business of the same workspace; concurrent assignments apply once", async () => {
    const ws = randomUUID();
    const other = randomUUID();
    const a = await business(ws, "QA R7 Assign A");
    const b = await business(ws, "QA R7 Assign B");
    const foreign = await business(other, "QA R7 Assign Foreign");
    const archived = await business(ws, "QA R7 Assign Archived");
    await db.ownerBusiness.update({ where: { id: archived }, data: { isActive: false } });
    const itemId = await recordComplianceItem({ workspaceId: ws, businessId: null, kind: "permit", name: "Fire permit", expiresAt: expired(), actorId: actor });

    await expect(assignComplianceItemBusiness({ workspaceId: ws, itemId, actorId: actor, businessId: foreign })).rejects.toBeInstanceOf(ValidationError);
    await expect(assignComplianceItemBusiness({ workspaceId: ws, itemId, actorId: actor, businessId: archived })).rejects.toBeInstanceOf(ValidationError);
    await expect(assignComplianceItemBusiness({ workspaceId: other, itemId, actorId: actor, businessId: foreign })).rejects.toBeInstanceOf(NotFoundError);

    const results = await Promise.allSettled([
      assignComplianceItemBusiness({ workspaceId: ws, itemId, actorId: actor, businessId: a }),
      assignComplianceItemBusiness({ workspaceId: ws, itemId, actorId: actor, businessId: b }),
    ]);
    const won = results.filter((r) => r.status === "fulfilled");
    expect(won).toHaveLength(1);
    for (const r of results) if (r.status === "rejected") expect(r.reason instanceof ConflictError || r.reason instanceof ValidationError).toBe(true);
    expect(await db.auditEvent.count({ where: { workspaceId: ws, entityId: itemId, eventName: "owner.compliance_business_assigned" } })).toBe(1);
    const row = await db.ownerComplianceItem.findFirst({ where: { id: itemId } });
    // Reassigning an already-assigned item is refused (a recorded restriction is never silently moved).
    const loser = row!.businessId === a ? b : a;
    await expect(assignComplianceItemBusiness({ workspaceId: ws, itemId, actorId: actor, businessId: loser })).rejects.toBeInstanceOf(ValidationError);
    // The same assignment again is idempotent.
    await expect(assignComplianceItemBusiness({ workspaceId: ws, itemId, actorId: actor, businessId: row!.businessId! })).resolves.toMatchObject({ businessId: row!.businessId });
    expect(await db.auditEvent.count({ where: { workspaceId: ws, entityId: itemId, eventName: "owner.compliance_business_assigned" } })).toBe(1);
    await db.ownerComplianceItem.deleteMany({ where: { workspaceId: ws } });
    for (const id of [a, b, archived]) await teardownOwnerBusiness(id);
    await teardownOwnerBusiness(foreign);
  });
});

describe("[db] Decision 2 — recording what has changed on a do-not-repeat rule", () => {
  it("[db] the rule holds growth work (the decision routes to the rule); a governed changed-context record lifts it at the gate and on the next read", async () => {
    const ws = randomUUID();
    const b = await business(ws, "QA R7 DNR");
    const ruleId = await recordDoNotRepeat({ workspaceId: ws, businessId: b, memoryKey: "scope:marketing", summary: "Paid social push", reason: "Burned budget with no orders", actorId: actor });
    expect(await growthGate(ws, b)).toMatch(/do-not-repeat/);

    await expect(recordDoNotRepeatChangedContext({ workspaceId: ws, ruleId, actorId: actor, explanation: "  new offer  " })).rejects.toBeInstanceOf(ValidationError);
    await expect(recordDoNotRepeatChangedContext({ workspaceId: randomUUID(), ruleId, actorId: actor, explanation: "A new supplier contract halves the cost per order." })).rejects.toBeInstanceOf(NotFoundError);

    const view = await recordDoNotRepeatChangedContext({ workspaceId: ws, ruleId, actorId: actor, explanation: "A new supplier contract halves the cost per order." });
    expect(view.changedContextExplanation).toBe("A new supplier contract halves the cost per order.");
    const audit = await db.auditEvent.findMany({ where: { workspaceId: ws, entityId: ruleId, eventName: "owner.do_not_repeat_context_changed" } });
    expect(audit).toHaveLength(1);
    expect(audit[0].payload).toMatchObject({ ruleId, previousChangedContextExplanation: null, changedContextExplanation: "A new supplier contract halves the cost per order." });
    expect(await growthGate(ws, b)).toBe("allowed");

    // Idempotent for the same text; a different text is refused (never silently replaced).
    await expect(recordDoNotRepeatChangedContext({ workspaceId: ws, ruleId, actorId: actor, explanation: "A new supplier contract halves the cost per order." })).resolves.toBeDefined();
    await expect(recordDoNotRepeatChangedContext({ workspaceId: ws, ruleId, actorId: actor, explanation: "Something else entirely changed since then." })).rejects.toBeInstanceOf(ValidationError);
    expect(await db.auditEvent.count({ where: { workspaceId: ws, entityId: ruleId, eventName: "owner.do_not_repeat_context_changed" } })).toBe(1);
    await db.ownerDoNotRepeatRule.deleteMany({ where: { workspaceId: ws } });
    await teardownOwnerBusiness(b);
  });

  it("[db] an inactive rule is refused; concurrent records apply once", async () => {
    const ws = randomUUID();
    const b = await business(ws, "QA R7 DNR Concurrency");
    const inactive = await recordDoNotRepeat({ workspaceId: ws, businessId: b, memoryKey: "scope:sales", summary: "s", reason: "r", actorId: actor });
    await db.ownerDoNotRepeatRule.update({ where: { id: inactive }, data: { active: false } });
    await expect(recordDoNotRepeatChangedContext({ workspaceId: ws, ruleId: inactive, actorId: actor, explanation: "The market has changed since this was set." })).rejects.toBeInstanceOf(ValidationError);

    const ruleId = await recordDoNotRepeat({ workspaceId: ws, businessId: b, memoryKey: "scope:marketing", summary: "s", reason: "r", actorId: actor });
    const results = await Promise.allSettled([
      recordDoNotRepeatChangedContext({ workspaceId: ws, ruleId, actorId: actor, explanation: "First account of what changed since then." }),
      recordDoNotRepeatChangedContext({ workspaceId: ws, ruleId, actorId: actor, explanation: "Second account of what changed since then." }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.auditEvent.count({ where: { workspaceId: ws, entityId: ruleId, eventName: "owner.do_not_repeat_context_changed" } })).toBe(1);
    await db.ownerDoNotRepeatRule.deleteMany({ where: { workspaceId: ws } });
    await teardownOwnerBusiness(b);
  });
});

describe("[db] Decision 5A — a back-filled period never takes over in-flight work", () => {
  it("[db] Cash flow: the in-progress action stays on the current period's cycle; the back-filled diagnosis neither moves nor duplicates it; a NEWER period carries it", async () => {
    const ws = randomUUID();
    const b = await business(ws, "QA R7 Backfill");
    const current = await runCashflowDiagnosis(b, (await createCashflowSnapshot(b, { ...period(3), currency: "INR", ...UNSAFE }, actor, ws)).id, actor, ws);
    const action = (await db.ownerCashflowAction.findMany({ where: { cycleId: current.id }, orderBy: { priorityScore: "desc" } }))[0];
    await updateCashflowAction(action.id, { status: "assigned" }, actor, ws);
    await updateCashflowAction(action.id, { status: "in_progress" }, actor, ws);

    const backfill = await runCashflowDiagnosis(b, (await createCashflowSnapshot(b, { ...period(30), currency: "INR", ...UNSAFE }, actor, ws)).id, actor, ws);
    const after = await db.ownerCashflowAction.findFirst({ where: { id: action.id } });
    expect(after!.cycleId).toBe(current.id);
    expect(after!.status).toBe("in_progress");
    expect(await db.ownerCashflowAction.count({ where: { cycleId: backfill.id, findingCode: action.findingCode, recommendationCode: action.recommendationCode } })).toBe(0);
    expect(await db.auditEvent.count({ where: { workspaceId: ws, entityId: action.id, payload: { path: ["reason"], equals: "carried_forward_by_diagnosis" } } })).toBe(0);
    // The owner's in-flight work is still what the decision shows for Cash flow.
    const d = (await getOwnerHome(ws, b)).currentOwnerDecision!;
    expect(d.attention.some((t: any) => String(t.candidateId).endsWith(`:${action.id}`) && t.status === "in_progress")).toBe(true);

    const newer = await runCashflowDiagnosis(b, (await createCashflowSnapshot(b, { ...period(1), currency: "INR", ...UNSAFE }, actor, ws)).id, actor, ws);
    expect((await db.ownerCashflowAction.findFirst({ where: { id: action.id } }))!.cycleId).toBe(newer.id);
    await teardownOwnerBusiness(b);
  });
});

describe("[db] Decision 5B — Recovery's trend baseline is the previous evidence period", () => {
  const recoveryPeriod = (endDaysAgo: number, revenue: number) => ({
    ...period(endDaysAgo, 29), currency: "INR", revenue, totalCosts: revenue * 0.7, orderCount: 1000, newCustomers: 50, repeatCustomers: 50, deliveryCost: revenue * 0.02,
  });
  const trendFindings = async (cycleId: string) =>
    (await db.recoveryFinding.findMany({ where: { cycleId }, select: { code: true, comparisonValue: true } })).filter((f: any) => f.comparisonValue !== null);

  it("[db] a back-filled OLDER period is compared with nothing newer; the next NEWER period is compared with the latest earlier period — never with the last run", async () => {
    const ws = randomUUID();
    const b = await business(ws, "QA R7 Recovery Baseline");
    const mid = await runCycle(b, (await createRecoverySnapshot(b, recoveryPeriod(40, 100000) as any, actor, ws)).id, actor, ws);
    // Back-fill an OLDER period with much HIGHER revenue after it: it has no earlier period, so no trend.
    const old = await runCycle(b, (await createRecoverySnapshot(b, recoveryPeriod(80, 400000) as any, actor, ws)).id, actor, ws);
    expect(await trendFindings(old.id)).toEqual([]);
    // The next NEWER period (same revenue as the mid period): its baseline is the mid period, not the back-fill
    // run — so no false revenue collapse is reported.
    const latest = await runCycle(b, (await createRecoverySnapshot(b, recoveryPeriod(5, 100000) as any, actor, ws)).id, actor, ws);
    const trends = await trendFindings(latest.id);
    for (const f of trends) expect(f.comparisonValue).not.toBe(400000);
    expect(latest.cycleNumber).toBe(3);
    expect(mid.cycleNumber).toBe(1);
    await teardownOwnerBusiness(b);
  });
});

describe("[db] Decision 5C — all nine action services apply a transition exactly once under concurrent submission", () => {
  const evidence = { completionNotes: "Done and checked", completionEvidence: ["receipt.pdf"] };
  type Svc = { name: string; seed: (ws: string, b: string) => Promise<string>; update: (id: string, input: any, ws: string) => Promise<any>; version?: (id: string) => Promise<number> };
  const firstAction = async (model: string, where: Record<string, unknown>) => (await (db as any)[model].findMany({ where, orderBy: { id: "asc" } }))[0].id as string;
  const SERVICES: Svc[] = [
    { name: "finance", seed: async (ws, b) => { const s = await createFinancialSnapshot(b, { ...period(10), currency: "INR", revenue: 100000, fixedCosts: 40000, variableCosts: 40000, discountAmount: 15000, cashOnHand: 50000 } as any, actor, ws); const c = await runFinanceDiagnosis(b, s.id, actor, ws); return firstAction("ownerFinanceAction", { cycleId: c.id }); }, update: (id, i, ws) => updateFinanceAction(id, i, actor, ws) },
    { name: "cashflow", seed: async (ws, b) => { const c = await runCashflowDiagnosis(b, (await createCashflowSnapshot(b, { ...period(10), currency: "INR", ...UNSAFE }, actor, ws)).id, actor, ws); return firstAction("ownerCashflowAction", { cycleId: c.id }); }, update: (id, i, ws) => updateCashflowAction(id, i, actor, ws) },
    { name: "sales", seed: async (ws, b) => { const s = await createSalesSnapshot(b, { ...period(10), currency: "INR", leads: 1000, qualifiedLeads: 400, orders: 30, revenue: 60000, newCustomers: 12, repeatCustomers: 3, lostCustomers: 25, complaints: 6, discountAmount: 18000, refundAmount: 6000, b2bRevenue: 10000, b2cRevenue: 50000, b2bPipelineValue: 6000 } as any, actor, ws); const c = await runSalesDiagnosis(b, s.id, actor, ws); return firstAction("ownerSalesAction", { cycleId: c.id }); }, update: (id, i, ws) => updateSalesAction(id, i, actor, ws) },
    { name: "operations", seed: async (ws, b) => { const s = await createOperationsSnapshot(b, { ...period(10), currency: "INR", ordersReceived: 1500, ordersCompleted: 900, ordersDelayed: 500, reworkCount: 180, complaints: 120, staffHours: 400, machineCapacityUnits: 1000, idleHours: 120, deliveryAttempts: 900, deliveryFailures: 200, inventoryShortages: 4, sopChecks: 100, sopMisses: 50 } as any, actor, ws); const c = await runOperationsDiagnosis(b, s.id, actor, ws); return firstAction("ownerOperationsAction", { cycleId: c.id }); }, update: (id, i, ws) => updateOperationsAction(id, i, actor, ws) },
    { name: "sop", seed: async (ws, b) => { const s = await createSopSnapshot(b, { ...period(10), currency: "INR", actionsAssigned: 100, actionsCompleted: 50, actionsVerified: 10, actionsOverdue: 40, actionsDisputed: 8, actionsReassigned: 30, repeatedFailures: 30, proofRequired: 40, proofProvided: 10, recurringProcesses: 20, documentedSops: 5 } as any, actor, ws); const c = await runSopDiagnosis(b, s.id, actor, ws); return firstAction("ownerSopAction", { cycleId: c.id }); }, update: (id, i, ws) => updateSopAction(id, i, actor, ws) },
    { name: "marketing", seed: async (ws, b) => { const s = await createMarketingSnapshot(b, { ...period(10), currency: "INR", marketingSpend: 100000, revenue: 30000, leads: 200, inquiries: 150, orders: 4, newCustomers: 4, paidLeads: 180, organicLeads: 20, campaignsRun: 10, campaignsWithFollowup: 2, contentPosted: 2, couponsRedeemed: 1, referrals: 0, walkIns: 5 } as any, actor, ws); const c = await runMarketingDiagnosis(b, s.id, actor, ws); return firstAction("ownerMarketingAction", { cycleId: c.id }); }, update: (id, i, ws) => updateMarketingAction(id, i, actor, ws) },
    { name: "strategy", seed: async (ws, b) => { const s = await createStrategySnapshot(b, { ...period(10), currency: "INR", optionName: "Open a second branch", currentRevenue: 500000, expectedRevenueChange: 20000, costChange: 60000, investmentRequired: 800000, timeToImpactMonths: 12, riskLevel: "high", cashAvailable: 100000, capacityImpactPct: 80, staffImpact: 4 } as any, actor, ws); const c = await runStrategyDiagnosis(b, s.id, actor, ws); return (await db.ownerStrategyAction.findMany({ where: { cycleId: c.id, status: "proposed" } }))[0].id; }, update: (id, i, ws) => updateStrategyAction(id, i, actor, ws) },
    {
      name: "recovery",
      seed: async (ws, b) => { const c = await runCycle(b, (await createRecoverySnapshot(b, { ...period(10, 29), currency: "INR", revenue: 100000, totalCosts: 95000, orderCount: 1000, newCustomers: 70, repeatCustomers: 30, deliveryCost: 12000 } as any, actor, ws)).id, actor, ws); return firstAction("recoveryAction", { cycleId: c.id }); },
      update: async (id, i, ws) => updateRecoveryAction(id, { ...i, ...(i.status === "completed" ? { actualOutcome: "Margin restored" } : {}), version: (await db.recoveryAction.findFirst({ where: { id } }))!.version }, actor, ws),
    },
    {
      name: "budget",
      seed: async (ws, b) => {
        const p = await createBudgetPeriod(b, { label: "Period", periodStart: period(10).periodStart, periodEnd: period(10).periodEnd, currency: "INR", approvedBudget: 100000, statutoryReserveRequired: 50000, ownerGoal: "growth" } as any, actor, ws);
        await recordSpendEntry(b, { periodId: p.id, label: "Payroll (committed)", category: "statutory_payroll_tax", amount: 420000, state: "committed", obligationKind: "payroll", dueInDays: 5, requestedByUserId: actor, ownerApprovalThreshold: 50000 } as any, actor, ws);
        return (await listBudgetActions(ws, b))[0].id;
      },
      update: (id, i, ws) => updateBudgetAction(id, i, actor, ws),
    },
  ];

  for (const svc of SERVICES) {
    it(`[db] ${svc.name}: a double-submitted completion applies once (one audit, one completedAt); a conflicting concurrent transition is refused`, async () => {
      const ws = randomUUID();
      const b = await business(ws, `QA R7 CAS ${svc.name}`);
      const id = await svc.seed(ws, b);
      await svc.update(id, { status: "assigned" }, ws);
      await svc.update(id, { status: "in_progress" }, ws);
      const results = await Promise.allSettled([
        svc.update(id, { status: "completed", ...evidence }, ws),
        svc.update(id, { status: "completed", ...evidence }, ws),
      ]);
      expect(results.filter((r) => r.status === "fulfilled").length).toBeGreaterThanOrEqual(1);
      for (const r of results) if (r.status === "rejected") expect(r.reason).toBeInstanceOf(ConflictError);
      const completedAudits = await db.auditEvent.findMany({ where: { workspaceId: ws, entityId: id, payload: { path: ["status"], equals: "completed" } } });
      expect(completedAudits, `${svc.name} completion audited once`).toHaveLength(1);

      // A second action: completed vs cancelled at once — exactly one transition applies, the other is refused.
      const id2 = await svc.seed(ws, b).catch(() => null);
      if (id2 && id2 !== id) {
        await svc.update(id2, { status: "assigned" }, ws);
        await svc.update(id2, { status: "in_progress" }, ws);
        const race = await Promise.allSettled([
          svc.update(id2, { status: "completed", ...evidence }, ws),
          svc.update(id2, { status: "cancelled" }, ws),
        ]);
        expect(race.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        for (const r of race) if (r.status === "rejected") expect(r.reason instanceof ConflictError || r.reason instanceof ValidationError).toBe(true);
        const terminal = await db.auditEvent.count({ where: { workspaceId: ws, entityId: id2, OR: [{ payload: { path: ["status"], equals: "completed" } }, { payload: { path: ["status"], equals: "cancelled" } }] } });
        expect(terminal).toBe(1);
      }
      await teardownOwnerBusiness(b);
    });
  }
});

describe("[db] Decision 5D / Now View — read-only and scoped to one business", () => {
  it("[db] an overdue risk review raises no alert on a Now View read; repeated and concurrent steady-state reads write nothing", async () => {
    const ws = randomUUID();
    await db.workspace.create({ data: { id: ws, name: "R7 Now View", slug: `r7-${ws}`, isActive: true, updatedAt: new Date() } });
    const b = await business(ws, "QA R7 Now View");
    await runCashflowDiagnosis(b, (await createCashflowSnapshot(b, { ...period(5), currency: "INR", ...UNSAFE }, actor, ws)).id, actor, ws);
    const risk = await createBusinessRisk({ workspaceId: ws, actorId: actor, riskCode: "R7_OVERDUE", title: "Supplier contract lapse", category: "OPERATIONAL" as any, likelihood: 40, impact: 40 });
    await db.businessRiskEntry.update({ where: { id: risk.id }, data: { reviewDueDate: new Date(Date.now() - 3 * DAY) } });
    const alertsBefore = await db.alert.count({ where: { workspaceId: ws } });

    await getOwnerNowView(ws, b, undefined, actor); // first read: records the guidance baseline
    const snapshotsAfterFirst = await db.ownerGuidanceSnapshot.count({ where: { workspaceId: ws } });
    const auditAfterFirst = await db.auditEvent.count({ where: { workspaceId: ws } });
    await getOwnerNowView(ws, b, undefined, actor);
    await Promise.all(Array.from({ length: 4 }, () => getOwnerNowView(ws, b, undefined, actor)));
    // Give any stray fire-and-forget work a chance to land before counting.
    await new Promise((r) => setTimeout(r, 300));

    expect(await db.alert.count({ where: { workspaceId: ws } })).toBe(alertsBefore);
    expect(await db.alert.count({ where: { workspaceId: ws, idempotencyKey: `risk_overdue_${risk.id}` } })).toBe(0);
    expect(await db.ownerGuidanceSnapshot.count({ where: { workspaceId: ws } })).toBe(snapshotsAfterFirst);
    expect(await db.auditEvent.count({ where: { workspaceId: ws } })).toBe(auditAfterFirst);
    await db.businessRiskEntry.deleteMany({ where: { workspaceId: ws } });
    await db.ownerGuidanceSnapshot.deleteMany({ where: { workspaceId: ws } });
    await teardownOwnerBusiness(b);
  });

  it("[db] with no business given in a two-business workspace, no business's cash or Finance evidence is read (never an aggregate); with the business given, only its own", async () => {
    const ws = randomUUID();
    const safe = await business(ws, "QA R7 Scope Safe");
    const unsafe = await business(ws, "QA R7 Scope Unsafe");
    await runCashflowDiagnosis(unsafe, (await createCashflowSnapshot(unsafe, { ...period(5), currency: "INR", ...UNSAFE }, actor, ws)).id, actor, ws);
    const none = await getOwnerNowView(ws, null);
    expect(none.view.topOwnerActions.some((a: any) => a.category === "CASH_DANGER")).toBe(false);
    const own = await getOwnerNowView(ws, safe);
    expect(own.view.topOwnerActions.some((a: any) => a.category === "CASH_DANGER")).toBe(false);
    const theirs = await getOwnerNowView(ws, unsafe);
    expect(theirs.view.topOwnerActions.some((a: any) => a.category === "CASH_DANGER")).toBe(true);
    await db.ownerGuidanceSnapshot.deleteMany({ where: { workspaceId: ws } });
    await teardownOwnerBusiness(safe);
    await teardownOwnerBusiness(unsafe);
  });
});
