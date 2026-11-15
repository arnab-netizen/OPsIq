/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma rows, seeded snapshot inputs and service payloads are untyped */
/**
 * The nine owner action services, each with a real seeding path (a diagnosis that plans an action) and a
 * uniform update adapter — shared by the concurrency/atomicity DB tests so every service is exercised the
 * same way (no service silently skipped). Recovery records its completion outcome as `actualOutcome`: the
 * adapter maps the uniform `completionEvidence` onto it so a "different payload" is different for every service.
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
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

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
function period(endDaysAgo: number, length = 20) {
  const end = new Date(Date.now() - endDaysAgo * DAY);
  return { periodStart: iso(new Date(end.getTime() - length * DAY)), periodEnd: iso(end) };
}
const UNSAFE = { cashInHand: 100, dailyCollections: 50, receivables: 20000, receivablesOverdue: 15000, payables: 40000, upcomingEmi: 15000, rentDue: 10000, salaryDue: 20000, vendorDue: 15000, taxDue: 5000, ownerWithdrawal: 4000 };

export const firstAction = async (model: string, where: Record<string, unknown>) =>
  (await (db as any)[model].findMany({ where, orderBy: { id: "asc" } }))[0].id as string;

export interface ActionServiceFixture {
  name: string;
  /** Seeds one action from a diagnosis of a period ending `endDaysAgo` days ago (a distinct period per call). */
  seed: (ws: string, b: string, actor: string, endDaysAgo?: number) => Promise<string>;
  update: (id: string, input: any, ws: string, actor: string) => Promise<any>;
  read: (id: string) => Promise<any>;
  /** The recorded completion evidence, in the uniform `completionEvidence` shape. */
  evidenceOf: (row: any) => string[];
  notesOf: (row: any) => string | null;
  /** Extra fields a completion of this service needs. */
  completionExtra: Record<string, unknown>;
}

const standard = (model: string, update: (id: string, i: any, actor: string, ws: string) => Promise<any>, seed: ActionServiceFixture["seed"], name: string): ActionServiceFixture => ({
  name,
  seed,
  update: (id, i, ws, actor) => update(id, i, actor, ws),
  read: (id) => (db as any)[model].findFirst({ where: { id } }),
  evidenceOf: (row) => (Array.isArray(row?.completionEvidence) ? row.completionEvidence : []),
  notesOf: (row) => row?.completionNotes ?? null,
  completionExtra: {},
});

export const ACTION_SERVICES: ActionServiceFixture[] = [
  standard("ownerFinanceAction", updateFinanceAction, async (ws, b, actor, endDaysAgo = 10) => { await createCashflowSnapshot(b, { ...period(endDaysAgo), currency: "INR", bankBalance: 0 } as any, actor, ws); /* total liquidity known: cash 50000 + bank 0 */ const s = await createFinancialSnapshot(b, { ...period(endDaysAgo), currency: "INR", revenue: 100000, fixedCosts: 40000, variableCosts: 40000, discountAmount: 15000, cashOnHand: 50000 } as any, actor, ws); const c = await runFinanceDiagnosis(b, s.id, actor, ws); return firstAction("ownerFinanceAction", { cycleId: c.id }); }, "finance"),
  standard("ownerCashflowAction", updateCashflowAction, async (ws, b, actor, endDaysAgo = 10) => { const c = await runCashflowDiagnosis(b, (await createCashflowSnapshot(b, { ...period(endDaysAgo), currency: "INR", ...UNSAFE }, actor, ws)).id, actor, ws); return firstAction("ownerCashflowAction", { cycleId: c.id }); }, "cashflow"),
  standard("ownerSalesAction", updateSalesAction, async (ws, b, actor, endDaysAgo = 10) => { const s = await createSalesSnapshot(b, { ...period(endDaysAgo), currency: "INR", leads: 1000, qualifiedLeads: 400, orders: 30, revenue: 60000, newCustomers: 12, repeatCustomers: 3, lostCustomers: 25, complaints: 6, discountAmount: 18000, refundAmount: 6000, b2bRevenue: 10000, b2cRevenue: 50000, b2bPipelineValue: 6000 } as any, actor, ws); const c = await runSalesDiagnosis(b, s.id, actor, ws); return firstAction("ownerSalesAction", { cycleId: c.id }); }, "sales"),
  standard("ownerOperationsAction", updateOperationsAction, async (ws, b, actor, endDaysAgo = 10) => { const s = await createOperationsSnapshot(b, { ...period(endDaysAgo), currency: "INR", ordersReceived: 1500, ordersCompleted: 900, ordersDelayed: 500, reworkCount: 180, complaints: 120, staffHours: 400, machineCapacityUnits: 1000, idleHours: 120, deliveryAttempts: 900, deliveryFailures: 200, inventoryShortages: 4, sopChecks: 100, sopMisses: 50 } as any, actor, ws); const c = await runOperationsDiagnosis(b, s.id, actor, ws); return firstAction("ownerOperationsAction", { cycleId: c.id }); }, "operations"),
  standard("ownerSopAction", updateSopAction, async (ws, b, actor, endDaysAgo = 10) => { const s = await createSopSnapshot(b, { ...period(endDaysAgo), currency: "INR", actionsAssigned: 100, actionsCompleted: 50, actionsVerified: 10, actionsOverdue: 40, actionsDisputed: 8, actionsReassigned: 30, repeatedFailures: 30, proofRequired: 40, proofProvided: 10, recurringProcesses: 20, documentedSops: 5 } as any, actor, ws); const c = await runSopDiagnosis(b, s.id, actor, ws); return firstAction("ownerSopAction", { cycleId: c.id }); }, "sop"),
  standard("ownerMarketingAction", updateMarketingAction, async (ws, b, actor, endDaysAgo = 10) => { const s = await createMarketingSnapshot(b, { ...period(endDaysAgo), currency: "INR", marketingSpend: 100000, revenue: 30000, leads: 200, inquiries: 150, orders: 4, newCustomers: 4, paidLeads: 180, organicLeads: 20, campaignsRun: 10, campaignsWithFollowup: 2, contentPosted: 2, couponsRedeemed: 1, referrals: 0, walkIns: 5 } as any, actor, ws); const c = await runMarketingDiagnosis(b, s.id, actor, ws); return firstAction("ownerMarketingAction", { cycleId: c.id }); }, "marketing"),
  standard("ownerStrategyAction", updateStrategyAction, async (ws, b, actor, endDaysAgo = 10) => { const s = await createStrategySnapshot(b, { ...period(endDaysAgo), currency: "INR", optionName: "Open a second branch", currentRevenue: 500000, expectedRevenueChange: 20000, costChange: 60000, investmentRequired: 800000, timeToImpactMonths: 12, riskLevel: "high", cashAvailable: 100000, capacityImpactPct: 80, staffImpact: 4 } as any, actor, ws); const c = await runStrategyDiagnosis(b, s.id, actor, ws); return (await db.ownerStrategyAction.findMany({ where: { cycleId: c.id, status: "proposed" }, orderBy: { id: "asc" } }))[0].id; }, "strategy"),
  {
    name: "recovery",
    seed: async (ws, b, actor, endDaysAgo = 10) => { const c = await runCycle(b, (await createRecoverySnapshot(b, { ...period(endDaysAgo, 29), currency: "INR", revenue: 100000, totalCosts: 95000, orderCount: 1000, newCustomers: 70, repeatCustomers: 30, deliveryCost: 12000 } as any, actor, ws)).id, actor, ws); return firstAction("recoveryAction", { cycleId: c.id }); },
    update: async (id, i, ws, actor) => {
      const { completionEvidence, ...rest } = i;
      const actualOutcome = Array.isArray(completionEvidence) ? completionEvidence.join(",") : undefined;
      return updateRecoveryAction(id, { ...rest, ...(actualOutcome !== undefined ? { actualOutcome } : {}), version: (await db.recoveryAction.findFirst({ where: { id } }))!.version }, actor, ws);
    },
    read: (id) => db.recoveryAction.findFirst({ where: { id } }),
    evidenceOf: (row) => (typeof row?.actualOutcome === "string" && row.actualOutcome ? row.actualOutcome.split(",") : []),
    notesOf: (row) => row?.completionNotes ?? null,
    completionExtra: {},
  },
  {
    name: "budget",
    seed: async (ws, b, actor, endDaysAgo = 10) => {
      const label = `Period ${randomUUID().slice(0, 6)}`;
      const p = await createBudgetPeriod(b, { label, periodStart: period(endDaysAgo).periodStart, periodEnd: period(endDaysAgo).periodEnd, currency: "INR", approvedBudget: 100000, statutoryReserveRequired: 50000, ownerGoal: "growth" } as any, actor, ws);
      await recordSpendEntry(b, { periodId: p.id, label: "Payroll (committed)", category: "statutory_payroll_tax", amount: 420000, state: "committed", obligationKind: "payroll", dueInDays: 5, requestedByUserId: actor, ownerApprovalThreshold: 50000 } as any, actor, ws);
      const proposed = (await listBudgetActions(ws, b)).filter((a: any) => a.status === "proposed");
      if (proposed.length === 0) throw new Error("budget seed produced no proposed action");
      return proposed[0].id;
    },
    update: (id, i, ws, actor) => updateBudgetAction(id, i, actor, ws),
    read: (id) => db.ownerBudgetAction.findFirst({ where: { id } }),
    evidenceOf: (row) => (Array.isArray(row?.completionEvidence) ? row.completionEvidence : []),
    notesOf: (row) => row?.completionNotes ?? null,
    completionExtra: {},
  },
];
