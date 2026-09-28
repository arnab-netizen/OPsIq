/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma rows, seeded snapshot inputs and service payloads are untyped */
/**
 * Round-9 regressions through the real services on real Postgres (each fails against 8c1d5762):
 *   - P1-1: completed held work never disappears and reappears as duplicate work — in every evidence domain and
 *     Recovery (Owner Home AND the domain dashboard agree); newer evidence re-raises it;
 *   - back-fill: an older period diagnosed later never becomes the current reading of Home or the dashboard;
 *   - P1-5: Budget outcome inputs are never dropped with "applied";
 *   - risks: a MITIGATING risk's residual drop below critical is a "what changed" fact; a reopened critical risk
 *     reactivates its alert; an old resolved alert is never counted as newly raised; closing resolves alerts in
 *     the same transaction;
 *   - Recovery: a back-filled older period gets no trend baseline and cycle numbers follow run order (restored).
 *
 * `[db]`-gated. Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-decision/r9-remediation.db.test.ts
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
import { createOperationsSnapshot } from "@/services/owner-operations/snapshot.service";
import { runOperationsDiagnosis } from "@/services/owner-operations/diagnosis.service";
import { createSopSnapshot } from "@/services/owner-sop/snapshot.service";
import { runSopDiagnosis } from "@/services/owner-sop/diagnosis.service";
import { createMarketingSnapshot } from "@/services/owner-marketing/snapshot.service";
import { runMarketingDiagnosis } from "@/services/owner-marketing/diagnosis.service";
import { createSnapshot as createRecoverySnapshot } from "@/services/founder-recovery/snapshot.service";
import { runCycle } from "@/services/founder-recovery/cycle.service";
import { getCashflowDashboard } from "@/services/owner-cashflow/dashboard.service";
import { getFinanceDashboard } from "@/services/owner-finance/dashboard.service";
import { getSalesDashboard } from "@/services/owner-sales/dashboard.service";
import { getOperationsDashboard } from "@/services/owner-operations/dashboard.service";
import { getSopDashboard } from "@/services/owner-sop/dashboard.service";
import { getMarketingDashboard } from "@/services/owner-marketing/dashboard.service";
import { getRecoveryDashboard } from "@/services/founder-recovery/dashboard.service";
import { getOwnerHome } from "@/services/owner-home/home.service";
import { createBusinessRisk, reviewRisk, evaluateOverdueRiskAlerts, updateBusinessRisk } from "@/services/owner-mode/business-risk.service";
import { gatherOwnerChangeFacts } from "@/services/owner-home/owner-change-facts";
import { SCHEDULER_SYSTEM_ACTOR } from "@/domain/owner-budget/system-actor";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { ConflictError, ValidationError } from "@/infra/errors";
import { ACTION_SERVICES } from "./action-services-fixture";

const actor = randomUUID();
const DAY = 86_400_000;

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `r9-${actor}@example.com`, name: "R9 QA", isActive: true, updatedAt: new Date() },
  });
});

const iso = (d: Date) => d.toISOString().slice(0, 10);
function period(endDaysAgo: number, length = 20) {
  const end = new Date(Date.now() - endDaysAgo * DAY);
  return { periodStart: iso(new Date(end.getTime() - length * DAY)), periodEnd: iso(end) };
}
const IN_PROGRESS = { periodStart: iso(new Date(Date.now() - 10 * DAY)), periodEnd: iso(new Date(Date.now() + 5 * DAY)) };
const UNSAFE = { cashInHand: 100, dailyCollections: 50, receivables: 20000, receivablesOverdue: 15000, payables: 40000, upcomingEmi: 15000, rentDue: 10000, salaryDue: 20000, vendorDue: 15000, taxDue: 5000, ownerWithdrawal: 4000 };

async function business(workspaceId: string, name: string) {
  const b = await createBusiness({ name, businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false }, actor, workspaceId);
  return b.id as string;
}

type Domain = {
  name: string;
  actionModel: string;
  cycleModel: string;
  snapshotModel: string;
  run: (ws: string, b: string, p: { periodStart: string; periodEnd: string }) => Promise<{ id: string }>;
  dashboard: (ws: string, b: string) => Promise<any>;
};
const DOMAINS: Domain[] = [
  { name: "cashflow", actionModel: "ownerCashflowAction", cycleModel: "ownerCashflowCycle", snapshotModel: "ownerCashflowSnapshot", run: async (ws, b, p) => runCashflowDiagnosis(b, (await createCashflowSnapshot(b, { ...p, currency: "INR", ...UNSAFE }, actor, ws)).id, actor, ws), dashboard: getCashflowDashboard },
  { name: "finance", actionModel: "ownerFinanceAction", cycleModel: "ownerFinanceCycle", snapshotModel: "ownerFinancialSnapshot", run: async (ws, b, p) => runFinanceDiagnosis(b, (await createFinancialSnapshot(b, { ...p, currency: "INR", revenue: 100000, fixedCosts: 40000, variableCosts: 40000, discountAmount: 15000, cashOnHand: 50000 } as any, actor, ws)).id, actor, ws), dashboard: getFinanceDashboard },
  { name: "sales", actionModel: "ownerSalesAction", cycleModel: "ownerSalesCycle", snapshotModel: "ownerSalesSnapshot", run: async (ws, b, p) => runSalesDiagnosis(b, (await createSalesSnapshot(b, { ...p, currency: "INR", leads: 1000, qualifiedLeads: 400, orders: 30, revenue: 60000, newCustomers: 12, repeatCustomers: 3, lostCustomers: 25, complaints: 6, discountAmount: 18000, refundAmount: 6000, b2bRevenue: 10000, b2cRevenue: 50000, b2bPipelineValue: 6000 } as any, actor, ws)).id, actor, ws), dashboard: getSalesDashboard },
  { name: "operations", actionModel: "ownerOperationsAction", cycleModel: "ownerOperationsCycle", snapshotModel: "ownerOperationsSnapshot", run: async (ws, b, p) => runOperationsDiagnosis(b, (await createOperationsSnapshot(b, { ...p, currency: "INR", ordersReceived: 1500, ordersCompleted: 900, ordersDelayed: 500, reworkCount: 180, complaints: 120, staffHours: 400, machineCapacityUnits: 1000, idleHours: 120, deliveryAttempts: 900, deliveryFailures: 200, inventoryShortages: 4, sopChecks: 100, sopMisses: 50 } as any, actor, ws)).id, actor, ws), dashboard: getOperationsDashboard },
  { name: "sop", actionModel: "ownerSopAction", cycleModel: "ownerSopCycle", snapshotModel: "ownerSopSnapshot", run: async (ws, b, p) => runSopDiagnosis(b, (await createSopSnapshot(b, { ...p, currency: "INR", actionsAssigned: 100, actionsCompleted: 50, actionsVerified: 10, actionsOverdue: 40, actionsDisputed: 8, actionsReassigned: 30, repeatedFailures: 30, proofRequired: 40, proofProvided: 10, recurringProcesses: 20, documentedSops: 5 } as any, actor, ws)).id, actor, ws), dashboard: getSopDashboard },
  { name: "marketing", actionModel: "ownerMarketingAction", cycleModel: "ownerMarketingCycle", snapshotModel: "ownerMarketingSnapshot", run: async (ws, b, p) => runMarketingDiagnosis(b, (await createMarketingSnapshot(b, { ...p, currency: "INR", marketingSpend: 100000, revenue: 30000, leads: 200, inquiries: 150, orders: 4, newCustomers: 4, paidLeads: 180, organicLeads: 20, campaignsRun: 10, campaignsWithFollowup: 2, contentPosted: 2, couponsRedeemed: 1, referrals: 0, walkIns: 5 } as any, actor, ws)).id, actor, ws), dashboard: getMarketingDashboard },
  { name: "recovery", actionModel: "recoveryAction", cycleModel: "recoveryCycle", snapshotModel: "ownerMetricSnapshot", run: async (ws, b, p) => runCycle(b, (await createRecoverySnapshot(b, { ...p, currency: "INR", revenue: 100000, totalCosts: 95000, orderCount: 1000, newCustomers: 70, repeatCustomers: 30, deliveryCost: 12000 } as any, actor, ws)).id, actor, ws), dashboard: getRecoveryDashboard },
];
const svcOf = (name: string) => ACTION_SERVICES.find((s) => s.name === name)!;

/** Complete one action of the cycle the gate lets through (assign → in progress → completed). */
async function completeOne(d: Domain, ws: string, cycleId: string): Promise<any> {
  const svc = svcOf(d.name);
  const rows = await (db as any)[d.actionModel].findMany({ where: { cycleId }, orderBy: [{ id: "asc" }] });
  for (const row of rows) {
    try {
      await svc.update(row.id, { status: "assigned" }, ws, actor);
      await svc.update(row.id, { status: "in_progress" }, ws, actor);
      await svc.update(row.id, { status: "completed", completionNotes: "Done and checked", completionEvidence: ["receipt.pdf"], ...svc.completionExtra }, ws, actor);
      return (db as any)[d.actionModel].findFirst({ where: { id: row.id } });
    } catch (e) {
      if (!(e instanceof ConflictError)) throw e; // held by the gate: try the next action
    }
  }
  throw new Error(`${d.name}: no action could be completed`);
}

/** The newer cycle's never-engaged proposal of the same step (continuity key: finding code + recommendation). */
async function duplicateOf(d: Domain, cycleId: string, done: any): Promise<any> {
  if (d.name === "recovery") {
    const code = (await db.recoveryAction.findFirst({ where: { id: done.id }, include: { finding: { select: { code: true } } } }))!.finding?.code ?? null;
    const rows = await db.recoveryAction.findMany({ where: { cycleId, status: "proposed" }, include: { finding: { select: { code: true } } } });
    return rows.find((a: any) => a.finding?.code === code && (a.recommendationCode ?? null) === (done.recommendationCode ?? null)) ?? null;
  }
  return (db as any)[d.actionModel].findFirst({ where: { cycleId, status: "proposed", findingCode: done.findingCode, recommendationCode: done.recommendationCode } });
}

async function endPeriod(d: Domain, cycleId: string) {
  const c = await (db as any)[d.cycleModel].findFirst({ where: { id: cycleId }, select: { snapshotId: true } });
  await (db as any)[d.snapshotModel].update({ where: { id: c.snapshotId }, data: { periodStart: new Date(Date.now() - 6 * DAY), periodEnd: new Date(Date.now() - DAY) } });
}

describe("[db] P1-1 — completed held work never reappears as duplicate work (every domain; Home and dashboard agree)", () => {
  for (const d of DOMAINS) {
    it(`[db] ${d.name}: engage on August → diagnose in-progress September (duplicate proposal) → complete → September ends: the duplicate is not live work; the completion stays in view`, async () => {
      const ws = randomUUID();
      const b = await business(ws, `QA R9 Terminal ${d.name}`);
      const aug = await d.run(ws, b, period(12));
      const sept = await d.run(ws, b, IN_PROGRESS);
      const done = await completeOne(d, ws, aug.id);
      expect(done.status).toBe("completed");
      const dupRow = await duplicateOf(d, sept.id, done);
      expect(dupRow, `${d.name}: the in-progress diagnosis proposed the same step again`).toBeTruthy();
      await endPeriod(d, sept.id);

      // Owner Home: the duplicate is never an eligible step.
      const decision = (await getOwnerHome(ws, b)).currentOwnerDecision!;
      const ids = [decision.primaryTarget, ...decision.attention].filter(Boolean).map((t: any) => String(t.candidateId));
      expect(ids.some((id) => id.endsWith(`:${dupRow.id}`)), `${d.name}: Home never re-elects the duplicate`).toBe(false);
      // Domain dashboard: the duplicate is not listed as live work; the completion is listed as completed history.
      const dash = await d.dashboard(ws, b);
      expect(dash.latestCycle.id).toBe(sept.id);
      const rows = dash.latestCycle.actions as any[];
      expect(rows.some((a) => a.id === dupRow.id), `${d.name}: dashboard never lists the duplicate beside the completion`).toBe(false);
      expect(rows.find((a) => a.id === done.id)).toMatchObject({ status: "completed", completedEarlier: true });
      await teardownOwnerBusiness(b);
    });
  }

  it("[db] genuinely newer evidence (a period STARTING after the completion) re-raises the same step", async () => {
    const d = DOMAINS[0];
    const ws = randomUUID();
    const b = await business(ws, "QA R9 Terminal newer evidence");
    const aug = await d.run(ws, b, period(40));
    const done = await completeOne(d, ws, aug.id);
    // The work was completed 20 days ago (a completion is always stamped "now" by the service; the clock is
    // moved back so a later period can exist). R10 P2-3: the newer period must START after the completion,
    // not merely END after it — period(2, 10) starts 12 days ago (after the 20-days-ago completion) and
    // ends 2 days ago, so it genuinely covers only time after the work was done.
    await db.ownerCashflowAction.update({ where: { id: done.id }, data: { completedAt: new Date(Date.now() - 20 * DAY) } });
    const oct = await d.run(ws, b, period(2, 10));
    const again = await db.ownerCashflowAction.findFirst({ where: { cycleId: oct.id, findingCode: done.findingCode, recommendationCode: done.recommendationCode } });
    expect(again).toBeTruthy();
    const dash = await d.dashboard(ws, b);
    expect((dash.latestCycle.actions as any[]).some((a) => a.id === again!.id)).toBe(true);
    await teardownOwnerBusiness(b);
  });

  // R10 P2-3: a period that merely ENDS after the completion but STARTS before/during it (overlapping) must
  // NOT be able to revive the same completed step — this is the exact defect the test above used to miss.
  it("[db] R10 P2-3: a period that only ENDS after the completion (but starts before it) does NOT re-raise the same step", async () => {
    const d = DOMAINS[0];
    const ws = randomUUID();
    const b = await business(ws, "QA R10 P2-3 overlapping period");
    const aug = await d.run(ws, b, period(40));
    const done = await completeOne(d, ws, aug.id);
    await db.ownerCashflowAction.update({ where: { id: done.id }, data: { completedAt: new Date(Date.now() - 20 * DAY) } });
    // period(2) with the default length (20) starts 22 days ago — BEFORE the 20-days-ago completion —
    // and ends 2 days ago. It overlaps the completion; it must not prove recurrence.
    const oct = await d.run(ws, b, period(2));
    const again = await db.ownerCashflowAction.findFirst({ where: { cycleId: oct.id, findingCode: done.findingCode, recommendationCode: done.recommendationCode } });
    expect(again, "the overlapping period still proposes the same step (it is not suppressed at diagnosis time)").toBeTruthy();
    const dash = await d.dashboard(ws, b);
    // It must not appear as a current, live step: continuity holds it back as a duplicate of the completed work.
    expect((dash.latestCycle.actions as any[]).some((a) => a.id === again!.id && !a.completedEarlier)).toBe(false);
    await teardownOwnerBusiness(b);
  });

  // R10 P2-4: a hidden duplicate proposal (suppressed from latestCycle.actions by continuity) must never
  // inflate the Recovery dashboard's overdue count/list — overdue is derived from the SAME canonical live
  // set the page displays, never an independent raw query.
  it("[db] R10 P2-4: a suppressed duplicate proposal with a past due date never inflates Recovery's overdue count", async () => {
    const d = DOMAINS.find((x) => x.name === "recovery")!;
    const ws = randomUUID();
    const b = await business(ws, "QA R10 Recovery overdue dedupe");
    const aug = await d.run(ws, b, period(12));
    const sept = await d.run(ws, b, IN_PROGRESS);
    const done = await completeOne(d, ws, aug.id);
    const dupRow = await duplicateOf(d, sept.id, done);
    expect(dupRow, "the in-progress diagnosis proposed the same step again").toBeTruthy();
    // Back-date the duplicate's due date so it would count as overdue if it were counted independently.
    await db.recoveryAction.update({ where: { id: dupRow.id }, data: { dueAt: new Date(Date.now() - 5 * DAY) } });
    await endPeriod(d, sept.id);

    const dash = await d.dashboard(ws, b);
    expect(dash.latestCycle.id).toBe(sept.id);
    const overdueIds = (dash.overdueActions as any[]).map((a) => a.id);
    expect(overdueIds, "the suppressed duplicate must not appear in the overdue list").not.toContain(dupRow.id);
    // Sanity: overdueActions is genuinely derived from latestCycle.actions, not merely empty by accident —
    // make a DIFFERENT, non-duplicate action overdue and confirm it DOES appear.
    const liveRows = (dash.latestCycle.actions as any[]).filter((a) => a.status === "proposed" && a.id !== dupRow.id);
    expect(liveRows.length, "there is other live work to test against").toBeGreaterThan(0);
    await db.recoveryAction.update({ where: { id: liveRows[0].id }, data: { dueAt: new Date(Date.now() - 5 * DAY) } });
    const dash2 = await d.dashboard(ws, b);
    expect((dash2.overdueActions as any[]).map((a) => a.id)).toContain(liveRows[0].id);
    expect((dash2.overdueActions as any[]).map((a) => a.id)).not.toContain(dupRow.id);
    await teardownOwnerBusiness(b);
  });
});

describe("[db] back-fill — an older period diagnosed later never becomes the current reading (every domain)", () => {
  for (const d of DOMAINS) {
    it(`[db] ${d.name}: Home and the dashboard stay on the newer period after a back-filled older one is diagnosed`, async () => {
      const ws = randomUUID();
      const b = await business(ws, `QA R9 Backfill ${d.name}`);
      const current = await d.run(ws, b, period(12));
      const old = await d.run(ws, b, period(80));
      const dash = await d.dashboard(ws, b);
      expect(dash.latestCycle.id, `${d.name}: dashboard current cycle`).toBe(current.id);
      const oldActionIds = new Set(((await (db as any)[d.actionModel].findMany({ where: { cycleId: old.id }, select: { id: true } })) as any[]).map((a) => a.id));
      const decision = (await getOwnerHome(ws, b)).currentOwnerDecision!;
      const ids = [decision.primaryTarget, ...decision.attention].filter(Boolean).map((t: any) => String(t.candidateId).split(":").pop());
      expect(ids.some((id) => oldActionIds.has(id!)), `${d.name}: Home never elects the back-filled period's work`).toBe(false);
      await teardownOwnerBusiness(b);
    });
  }
});

describe("[db] P1-5 — Budget outcome inputs are never dropped with 'applied'", () => {
  const svc = ACTION_SERVICES.find((s) => s.name === "budget")!;
  const done = { status: "completed", completionNotes: "Freeze applied", completionEvidence: ["memo.pdf"] };
  const outcomes = (ws: string) => db.fundedInitiativeOutcome.findMany({ where: { workspaceId: ws }, select: { expectedImpact: true, actualImpact: true } });

  it("[db] outcome-only and outcome + a non-completion transition are refused (no write, no audit); with the completion they are recorded", async () => {
    const ws = randomUUID();
    const b = await business(ws, "QA R9 Budget outcome");
    const id = await svc.seed(ws, b, actor);
    await svc.update(id, { status: "assigned" }, ws, actor);
    const auditsBefore = await db.auditEvent.count({ where: { workspaceId: ws, entityId: id } });
    await expect(svc.update(id, { expectedImpact: 50000 }, ws, actor)).rejects.toBeInstanceOf(ValidationError);
    await expect(svc.update(id, { status: "in_progress", expectedImpact: 50000, actualImpact: 0 }, ws, actor)).rejects.toBeInstanceOf(ValidationError);
    expect((await svc.read(id)).status).toBe("assigned");
    expect(await db.auditEvent.count({ where: { workspaceId: ws, entityId: id } })).toBe(auditsBefore);
    await svc.update(id, { status: "in_progress" }, ws, actor);
    await svc.update(id, { ...done, expectedImpact: 50000, actualImpact: 40000 }, ws, actor);
    expect(await outcomes(ws)).toEqual([{ expectedImpact: 50000, actualImpact: 40000 }]);
    // Duplicate (exact replay): a no-op — one outcome, one completion audit.
    await svc.update(id, { ...done, expectedImpact: 50000, actualImpact: 40000 }, ws, actor);
    expect(await outcomes(ws)).toHaveLength(1);
    expect(await db.auditEvent.count({ where: { workspaceId: ws, entityId: id, eventName: AUDIT_EVENTS.OWNER_BUDGET_INITIATIVE_CLOSED } })).toBe(1);
    // Conflicting retry on the terminal action: refused, the recorded outcome unchanged.
    await expect(svc.update(id, { ...done, expectedImpact: 50000, actualImpact: 90000 }, ws, actor)).rejects.toBeInstanceOf(ValidationError);
    await expect(svc.update(id, { completionNotes: "Rewritten" }, ws, actor)).rejects.toBeInstanceOf(ValidationError);
    expect(await outcomes(ws)).toEqual([{ expectedImpact: 50000, actualImpact: 40000 }]);
    await teardownOwnerBusiness(b);
  });

  it("[db] two concurrent completions with different outcome figures: exactly one applies; the other is refused, never 'applied'", async () => {
    const ws = randomUUID();
    const b = await business(ws, "QA R9 Budget race");
    const id = await svc.seed(ws, b, actor);
    await svc.update(id, { status: "assigned" }, ws, actor);
    await svc.update(id, { status: "in_progress" }, ws, actor);
    const race = await Promise.allSettled([
      svc.update(id, { ...done, actualImpact: 10000 }, ws, actor),
      svc.update(id, { ...done, actualImpact: 20000 }, ws, actor),
    ]);
    expect(race.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of race) if (r.status === "rejected") expect(r.reason instanceof ConflictError || r.reason instanceof ValidationError).toBe(true);
    expect(await outcomes(ws)).toHaveLength(1);
    await teardownOwnerBusiness(b);
  });
});

describe("[db] risks: audit facts, lifecycle and alert reconciliation", () => {
  async function workspace(name: string) {
    const ws = randomUUID();
    await db.workspace.create({ data: { id: ws, name, slug: `r9-${ws.substring(0, 8)}` } });
    return ws;
  }
  const activeAlert = (ws: string, key: string) => db.alert.findFirst({ where: { workspaceId: ws, idempotencyKey: key } });

  it("[db] a MITIGATING risk whose residual risk is lowered below critical by an edit is a 'no longer critical' fact", async () => {
    const ws = await workspace("R9 Risk facts");
    const b = await business(ws, "QA R9 Risk facts");
    const risk = await createBusinessRisk({ workspaceId: ws, actorId: actor, riskCode: "R9-1", title: "Key supplier", category: "OPERATIONAL" as any, likelihood: 95, impact: 95 });
    await reviewRisk({ workspaceId: ws, riskId: risk.id, actorId: actor, newStatus: "MITIGATING" as any, residualRisk: 85 });
    await updateBusinessRisk({ workspaceId: ws, riskId: risk.id, actorId: actor, residualRisk: 40 });
    const facts = await gatherOwnerChangeFacts({
      workspaceId: ws, businessId: b, now: new Date(), events: [], currentDiagnoses: {}, evidencePeriodEnds: {},
      businesses: [{ id: b, createdAt: new Date(Date.now() - 60 * DAY) }], workspaceIssuesAttributable: true, fixtureTaintedStartupSessionIds: [], openWorkspaceCriticalCount: 1,
    });
    expect(facts.recordIssues.map((r) => r.change)).toContain("no_longer_critical");
    // A title-only edit is an UPDATED event too, but proves no transition.
    await updateBusinessRisk({ workspaceId: ws, riskId: risk.id, actorId: actor, title: "Key supplier dependency" });
    const upd = await db.auditEvent.findMany({ where: { workspaceId: ws, entityId: risk.id, eventName: AUDIT_EVENTS.OWNER_BUSINESS_RISK_UPDATED }, orderBy: { occurredAt: "asc" } });
    expect(upd).toHaveLength(2);
    expect(upd[0].payload).toMatchObject({ previousResidualRisk: 85, residualRisk: 40, previousSeverity: expect.any(Number) });
    // A no-op edit writes and audits nothing.
    await updateBusinessRisk({ workspaceId: ws, riskId: risk.id, actorId: actor, title: "Key supplier dependency" });
    expect(await db.auditEvent.count({ where: { workspaceId: ws, entityId: risk.id, eventName: AUDIT_EVENTS.OWNER_BUSINESS_RISK_UPDATED } })).toBe(2);
    await db.alert.deleteMany({ where: { workspaceId: ws } });
    await teardownOwnerBusiness(b);
  });

  it("[db] closing resolves the critical alert with the risk; reopening reactivates it (never a stale resolved alert)", async () => {
    const ws = await workspace("R9 Risk reopen");
    const b = await business(ws, "QA R9 Risk reopen");
    const risk = await createBusinessRisk({ workspaceId: ws, actorId: actor, riskCode: "R9-2", title: "Fire safety", category: "OPERATIONAL" as any, likelihood: 95, impact: 95 });
    const key = `risk_critical_${risk.id}`;
    expect((await activeAlert(ws, key))!.resolvedAt).toBeNull();
    await reviewRisk({ workspaceId: ws, riskId: risk.id, actorId: actor, newStatus: "MITIGATING" as any });
    await reviewRisk({ workspaceId: ws, riskId: risk.id, actorId: actor, newStatus: "RESOLVED" as any });
    expect((await activeAlert(ws, key))!.resolvedAt).not.toBeNull();
    await reviewRisk({ workspaceId: ws, riskId: risk.id, actorId: actor, newStatus: "IDENTIFIED" as any });
    const reopened = await activeAlert(ws, key);
    expect(reopened!.resolvedAt).toBeNull();
    expect(await db.alert.count({ where: { workspaceId: ws, idempotencyKey: key } })).toBe(1);
    expect(await db.auditEvent.count({ where: { workspaceId: ws, entityId: reopened!.id, eventName: AUDIT_EVENTS.ALERT_UPDATED, payload: { path: ["reason"], equals: "condition_returned" } } })).toBe(1);
    await db.alert.deleteMany({ where: { workspaceId: ws } });
    await teardownOwnerBusiness(b);
  });

  it("[db] the overdue scan counts honestly: created, then already active, and a resolved alert whose risk is overdue again is REACTIVATED (never 'raised' while nothing shows)", async () => {
    const ws = await workspace("R9 Risk scan");
    const b = await business(ws, "QA R9 Risk scan");
    const risk = await createBusinessRisk({ workspaceId: ws, actorId: actor, riskCode: "R9-3", title: "Lease renewal", category: "OPERATIONAL" as any, likelihood: 30, impact: 30 });
    await db.businessRiskEntry.update({ where: { id: risk.id }, data: { reviewDueDate: new Date(Date.now() - 3 * DAY) } });
    const first = await evaluateOverdueRiskAlerts(ws, actor, new Date(), SCHEDULER_SYSTEM_ACTOR);
    expect(first).toMatchObject({ attempted: 1, created: 1, reactivated: 0, alreadyActive: 0, failed: 0 });
    const second = await evaluateOverdueRiskAlerts(ws, actor, new Date(), SCHEDULER_SYSTEM_ACTOR);
    expect(second).toMatchObject({ attempted: 1, created: 0, alreadyActive: 1 });
    const key = `risk_overdue_${risk.id}`;
    // Resolved → reopened (RESOLVED → IDENTIFIED), still overdue: the scan reactivates the SAME alert.
    await reviewRisk({ workspaceId: ws, riskId: risk.id, actorId: actor, newStatus: "MITIGATING" as any });
    await reviewRisk({ workspaceId: ws, riskId: risk.id, actorId: actor, newStatus: "RESOLVED" as any });
    expect((await activeAlert(ws, key))!.resolvedAt).not.toBeNull();
    await reviewRisk({ workspaceId: ws, riskId: risk.id, actorId: actor, newStatus: "IDENTIFIED" as any, reviewDueDate: new Date(Date.now() - DAY) });
    await db.alert.updateMany({ where: { workspaceId: ws, idempotencyKey: key }, data: { resolvedAt: new Date() } });
    const third = await evaluateOverdueRiskAlerts(ws, actor, new Date(), SCHEDULER_SYSTEM_ACTOR);
    expect(third).toMatchObject({ attempted: 1, created: 0, reactivated: 1, failed: 0 });
    expect((await activeAlert(ws, key))!.resolvedAt).toBeNull();
    // The scheduler raised it as a system actor.
    const created = await db.auditEvent.findFirst({ where: { workspaceId: ws, eventName: AUDIT_EVENTS.ALERT_CREATED } });
    expect(created!.actorType).toBe("system");
    await db.alert.deleteMany({ where: { workspaceId: ws } });
    await teardownOwnerBusiness(b);
  });
});

describe("[db] Recovery — a back-filled older period gets no trend baseline; cycle numbers follow run order (restored)", () => {
  const recoveryPeriod = (endDaysAgo: number, revenue: number) => ({
    ...period(endDaysAgo, 29), currency: "INR", revenue, totalCosts: revenue * 0.7, orderCount: 1000, newCustomers: 50, repeatCustomers: 50, deliveryCost: revenue * 0.02,
  });
  const trendFindings = async (cycleId: string) =>
    (await db.recoveryFinding.findMany({ where: { cycleId }, select: { code: true, comparisonValue: true } })).filter((f: any) => f.comparisonValue !== null);

  it("[db] the back-fill is compared with nothing newer; the next newer period never with the back-fill's figures", async () => {
    const ws = randomUUID();
    const b = await business(ws, "QA R9 Recovery Backfill");
    const mid = await runCycle(b, (await createRecoverySnapshot(b, recoveryPeriod(40, 100000) as any, actor, ws)).id, actor, ws);
    const old = await runCycle(b, (await createRecoverySnapshot(b, recoveryPeriod(80, 400000) as any, actor, ws)).id, actor, ws);
    expect(await trendFindings(old.id)).toEqual([]);
    const latest = await runCycle(b, (await createRecoverySnapshot(b, recoveryPeriod(5, 100000) as any, actor, ws)).id, actor, ws);
    for (const f of await trendFindings(latest.id)) expect(f.comparisonValue).not.toBe(400000);
    expect([mid.cycleNumber, old.cycleNumber, latest.cycleNumber]).toEqual([1, 2, 3]);
    await teardownOwnerBusiness(b);
  });
});
