/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma rows and service payloads are untyped in DB fixtures */
/**
 * Owner decisions on the real services, real Postgres:
 *  - ONE free diagnosis per workspace, SHARED between the owner diagnosis domains and Startup Mode, race-safe;
 *  - budget spend: capture free, reassessment paid, controlled machine-readable result, OFF unchanged.
 *
 * `[db]`-gated. Run: TEST_WITH_DB=true npx vitest run src/__tests__/billing/commercial-shared-allowance.db.test.ts
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
import { seedKnownBank } from "../test-helpers/seed-known-bank";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { createCashflowSnapshot } from "@/services/owner-cashflow/snapshot.service";
import { runCashflowDiagnosis } from "@/services/owner-cashflow/diagnosis.service";
import { createBudgetPeriod, recordSpendEntry } from "@/services/owner-budget/budget.service";
import { createStartupSession, generateAndPersistHypotheses, screenIdeaRecord } from "@/services/owner-strategy/startup-session.service";
import { workspaceHasDiagnosis } from "@/services/billing/commercial-policy.service";

const actor = randomUUID();
const DAY = 86_400_000;
const CASH = { cashInHand: 100, bankBalance: 0, dailyCollections: 50, receivables: 20000, receivablesOverdue: 15000, payables: 40000, upcomingEmi: 15000, rentDue: 10000, salaryDue: 20000, vendorDue: 15000, taxDue: 5000, ownerWithdrawal: 4000 };
const PROFILE = { capitalAvailableCents: null, ownerHoursPerWeek: null, riskTolerance: null, location: null, cashRunwayMonthsAvailable: null, minimumMonthlyIncomeNeededCents: null, priorIndustryExperience: null, regulatoryExperience: null, existingNetworkStrength: null };
const INTAKE: any = { capitalAvailable: 10000, monthlySurvivalNeed: 2000, hoursPerWeekAvailable: 40, riskTolerance: "medium", targetMonthlyIncome: 4000, canSell: true, canOperateDaily: true, fastCashVsScale: "fast_cash" };
const IDEA = (name: string): any => ({
  name, industry: "Automotive services",
  structural: { grossMarginPct: 65, netMarginPct: 30, monthlyRevenue: 5000, revenueFrequency: "recurring", repeatCustomerPct: 0.6, customerAcquisitionDifficulty: "low", demandValidated: true, ownerIsPrimaryOperator: true, differentiation: "moderate", pricingPower: "moderate", capitalIntensity: "low", downsideRisk: "low" },
  estimatedStartupCost: 3000, estimatedMonthlyRevenue: 5000, estimatedMonthlyCost: 1800, timeToFirstRevenueMonths: 1,
});
const iso = (d: Date) => d.toISOString().slice(0, 10);
const period = (endDaysAgo: number, length = 20) => { const end = new Date(Date.now() - endDaysAgo * DAY); return { periodStart: iso(new Date(end.getTime() - length * DAY)), periodEnd: iso(end) }; };
const businesses: string[] = [];
const subs: Array<{ plan: string; ba: string; sub: string }> = [];
const wsIds: string[] = [];
const denied = (p: Promise<unknown>) => expect(p).rejects.toMatchObject({ statusCode: 402, code: "PLAN_LIMIT_EXCEEDED" });

async function biz(ws: string, name: string) {
  const b = await createBusiness({ name, businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false }, actor, ws);
  businesses.push(b.id as string);
  return b.id as string;
}
async function cash(ws: string, b: string, endDaysAgo = 3) {
  const snap = await createCashflowSnapshot(b, { ...period(endDaysAgo), currency: "INR", ...CASH }, actor, ws);
  return runCashflowDiagnosis(b, snap.id, actor, ws);
}
async function startup(ws: string, ideas = 2) {
  const sessionId = await createStartupSession({ workspaceId: ws, actorId: actor, intake: INTAKE, ideas: Array.from({ length: ideas }, (_, i) => IDEA(`Gate idea ${i} ${ws.slice(0, 4)}`)) });
  const rows = await db.startupIdeaRecord.findMany({ where: { sessionId }, orderBy: { createdAt: "asc" } });
  return { sessionId, ideaIds: rows.map((r: any) => r.id as string) };
}
async function subscribe(ws: string) {
  await db.workspace.create({ data: { id: ws, name: `Shared ${ws.slice(0, 6)}`, slug: `shared-${ws.slice(0, 12)}` } });
  wsIds.push(ws);
  const plan = randomUUID(), ba = randomUUID(), sub = randomUUID(), now = new Date();
  await db.plan.create({ data: { id: plan, name: `Shared plan ${plan.slice(0, 8)}`, priceMonthly: 0, priceYearly: 0, updatedAt: now } });
  await db.billingAccount.create({ data: { id: ba, workspaceId: ws, providerCustomerId: `cus_${ba}`, updatedAt: now } });
  await db.subscription.create({ data: { id: sub, billingAccountId: ba, planId: plan, status: "active", currentPeriodStart: new Date(now.getTime() - 30 * DAY), currentPeriodEnd: new Date(now.getTime() + 20 * DAY), updatedAt: now } });
  subs.push({ plan, ba, sub });
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] shared one-per-workspace allowance and the spend capture/reassessment split", () => {
  const prev = process.env.BILLING_PAYWALL_ENFORCEMENT;
  beforeAll(async () => {
    await db.user.upsert({ where: { id: actor }, update: {}, create: { id: actor, email: `shared-${actor}@example.com`, name: "Shared QA", isActive: true, updatedAt: new Date() } });
  });
  beforeEach(() => { process.env.BILLING_PAYWALL_ENFORCEMENT = "on"; });
  afterEach(() => { if (prev === undefined) delete process.env.BILLING_PAYWALL_ENFORCEMENT; else process.env.BILLING_PAYWALL_ENFORCEMENT = prev; });
  afterAll(async () => {
    for (const b of businesses) {
      await db.spendEntry.deleteMany({ where: { businessId: b } }).catch(() => undefined);
      await teardownOwnerBusiness(b).catch(() => undefined);
    }
    for (const f of subs) {
      await db.subscription.deleteMany({ where: { id: f.sub } });
      await db.billingAccount.deleteMany({ where: { id: f.ba } });
      await db.plan.deleteMany({ where: { id: f.plan } });
    }
  });

  describe("Startup Mode shares the workspace's single free diagnosis", () => {
    it("the first startup analysis is free; every later qualifying startup analysis is a 402; reads and capture stay open", async () => {
      const ws = randomUUID();
      const { sessionId, ideaIds } = await startup(ws);
      expect(await workspaceHasDiagnosis(db as any, ws)).toBe(false);
      await expect(screenIdeaRecord(ws, sessionId, ideaIds[0], actor, PROFILE as any)).resolves.toBeTruthy();
      expect(await workspaceHasDiagnosis(db as any, ws)).toBe(true);
      await denied(screenIdeaRecord(ws, sessionId, ideaIds[1], actor, PROFILE as any));
      await denied(generateAndPersistHypotheses(ws, sessionId, ideaIds[0], actor));
      const firstRow = await db.startupIdeaRecord.findFirst({ where: { id: ideaIds[0] } });
      expect(firstRow?.screeningData).not.toBeNull(); // the free analysis stays readable
      const secondRow = await db.startupIdeaRecord.findFirst({ where: { id: ideaIds[1] } });
      expect(secondRow?.screeningData).toBeNull(); // the denied attempt wrote nothing
    });

    it("a startup analysis consumed the allowance, so an owner-domain diagnosis in the same workspace is a subsequent (paid) one", async () => {
      const ws = randomUUID();
      const { sessionId, ideaIds } = await startup(ws, 1);
      const b = await biz(ws, "Shared startup-first");
      await screenIdeaRecord(ws, sessionId, ideaIds[0], actor, PROFILE as any);
      await denied(cash(ws, b));
    });

    it("an owner-domain diagnosis consumed the allowance, so a startup analysis is a subsequent (paid) one", async () => {
      const ws = randomUUID();
      const b = await biz(ws, "Shared cycle-first");
      const { sessionId, ideaIds } = await startup(ws, 1);
      await cash(ws, b);
      await denied(screenIdeaRecord(ws, sessionId, ideaIds[0], actor, PROFILE as any));
    });

    it("race: a startup analysis and an owner diagnosis started together mint exactly one free diagnosis", async () => {
      const ws = randomUUID();
      const b = await biz(ws, "Shared race");
      const { sessionId, ideaIds } = await startup(ws, 1);
      const snap = await createCashflowSnapshot(b, { ...period(3), currency: "INR", ...CASH }, actor, ws);
      const results = await Promise.allSettled([screenIdeaRecord(ws, sessionId, ideaIds[0], actor, PROFILE as any), runCashflowDiagnosis(b, snap.id, actor, ws)]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ statusCode: 402 });
    });

    it("race: concurrent screenings of different ideas in one workspace mint exactly one", async () => {
      const ws = randomUUID();
      const { sessionId, ideaIds } = await startup(ws, 3);
      const results = await Promise.allSettled(ideaIds.map((id) => screenIdeaRecord(ws, sessionId, id, actor, PROFILE as any)));
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(await db.startupIdeaRecord.count({ where: { sessionId, NOT: { screeningStatus: "UNSCREENED" } } })).toBe(1);
    });

    it("a subscribed workspace analyses without limit; OFF changes nothing", async () => {
      const wsPaid = randomUUID();
      await subscribe(wsPaid);
      const paid = await startup(wsPaid, 2);
      await screenIdeaRecord(wsPaid, paid.sessionId, paid.ideaIds[0], actor, PROFILE as any);
      await expect(screenIdeaRecord(wsPaid, paid.sessionId, paid.ideaIds[1], actor, PROFILE as any)).resolves.toBeTruthy();

      process.env.BILLING_PAYWALL_ENFORCEMENT = "off";
      const wsOff = randomUUID();
      const off = await startup(wsOff, 2);
      await screenIdeaRecord(wsOff, off.sessionId, off.ideaIds[0], actor, PROFILE as any);
      await expect(screenIdeaRecord(wsOff, off.sessionId, off.ideaIds[1], actor, PROFILE as any)).resolves.toBeTruthy();
    });
  });

  describe("budget spend: data capture free, reassessment paid", () => {
    async function budgetBusiness(ws: string) {
      const b = await biz(ws, "Shared spend");
      await db.ownerFinancialSnapshot.create({
        data: { id: randomUUID(), workspaceId: ws, businessId: b, periodStart: new Date("2026-05-01"), periodEnd: new Date("2026-05-31"), currency: "INR", revenue: 500000, costOfGoods: 250000, fixedCosts: 150000, cashOnHand: 400000, dataConfidenceScore: 80, missingCriticalData: [], updatedAt: new Date() },
      });
      await seedKnownBank(ws, b);
      const p = await createBudgetPeriod(b, { label: "P", periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR", approvedBudget: 100000 }, actor, ws);
      return { businessId: b, periodId: p.id };
    }
    const spendInput = (periodId: string, label: string) => ({ periodId, label, category: "essential_operations", amount: 5000, state: "committed" as const, requestedByUserId: actor, ownerApprovalThreshold: 50000 });

    it("enforcement ON, unpaid: the entry is persisted, nothing is reassessed, and the result says so in a machine-readable way", async () => {
      process.env.BILLING_PAYWALL_ENFORCEMENT = "off";
      const ws = randomUUID();
      const { businessId, periodId } = await budgetBusiness(ws);
      process.env.BILLING_PAYWALL_ENFORCEMENT = "on";
      const snapsBefore = await db.budgetPlanSnapshot.count({ where: { businessId } });
      const actionsBefore = await db.ownerBudgetAction.count({ where: { businessId } });
      const r: any = await recordSpendEntry(businessId, spendInput(periodId, "Unpaid capture"), actor, ws);
      expect(r.spend.id).toBeTruthy();
      expect(r.plan).toBeNull();
      expect(r.reassessment).toEqual({ status: "REQUIRES_SUBSCRIPTION", capability: "reassessment", reason: "subscription_required" });
      expect(await db.spendEntry.count({ where: { businessId, label: "Unpaid capture" } })).toBe(1);
      expect(await db.budgetPlanSnapshot.count({ where: { businessId } })).toBe(snapsBefore);
      expect(await db.ownerBudgetAction.count({ where: { businessId } })).toBe(actionsBefore);
    });

    it("enforcement OFF: identical to before (a plan is returned and there is no deferral marker)", async () => {
      process.env.BILLING_PAYWALL_ENFORCEMENT = "off";
      const ws = randomUUID();
      const { businessId, periodId } = await budgetBusiness(ws);
      const r: any = await recordSpendEntry(businessId, spendInput(periodId, "Off capture"), actor, ws);
      expect(r.plan).toBeTruthy();
      expect("reassessment" in r).toBe(false);
    });

    it("enforcement ON, subscribed: capture and reassessment both happen", async () => {
      process.env.BILLING_PAYWALL_ENFORCEMENT = "off";
      const ws = randomUUID();
      await subscribe(ws);
      const { businessId, periodId } = await budgetBusiness(ws);
      process.env.BILLING_PAYWALL_ENFORCEMENT = "on";
      const r: any = await recordSpendEntry(businessId, spendInput(periodId, "Paid capture"), actor, ws);
      expect(r.plan).toBeTruthy();
      expect("reassessment" in r).toBe(false);
    });
  });
});
