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
import {
  assessAndPersistReadiness, buildAndPersistEconomicModel, createStartupSession, createSystemRecommendation,
  generateAndPersistHypotheses, recordHypothesisResult, runIdeaArbitration, screenIdeaRecord,
} from "@/services/owner-strategy/startup-session.service";
import { createPurchaseOrder, transitionPurchaseOrder } from "@/services/owner-procurement/purchase-order.service";
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
const ECON: any = { startupCostCents: 300000n, fixedMonthlyCostCents: 100000n, variableUnitCostCents: 2000n, pricePerUnitCents: 5000n, cacCents: 1000n, workingCapitalCents: 50000n, paymentDelayDays: 7, ownerLabourHoursPerWeek: 20, capitalAvailableCents: 1000000n, cashRunwayMonthsAvailable: 6 };
const READY: any = { problemEvidenceCount: 2, customerEvidenceCount: 2, wtpEvidenceCount: 1, deliveryTrialCompleted: false, acquisitionChannelTested: false, economicClassification: "VIABLE", cashRunwayMonths: 6, breakEvenMonths: 4, supplierQuoteObtained: false, regulatoryCheckCompleted: true, licenceRequired: false, licenceObtained: null, ownerHoursAvailable: 20, capitalAvailableCents: 1000000n, startupCostCents: 300000n, criticalHypothesesPassed: 1, criticalHypothesesFailed: 0 };
const REC: any = { recommendation: "GO", rationale: "free first journey", confidence: 0.7, inputSnapshot: {} };
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

  describe("Startup Mode: the first complete diagnostic session is the workspace's one free diagnosis", () => {
    /** Whole free journey in one session: screen, hypotheses, economic model, readiness, arbitration, first system recommendation. */
    async function freeJourney(ws: string, sessionId: string, ideaId: string) {
      await screenIdeaRecord(ws, sessionId, ideaId, actor, PROFILE as any);
      const hyps = await generateAndPersistHypotheses(ws, sessionId, ideaId, actor);
      await buildAndPersistEconomicModel(ws, sessionId, ideaId, actor, ECON);
      await assessAndPersistReadiness(ws, sessionId, ideaId, actor, READY);
      await runIdeaArbitration(ws, sessionId, actor);
      const recId = await createSystemRecommendation(ws, sessionId, actor, { ...REC, ideaId });
      return { hyps, recId };
    }

    it("enforcement ON, unpaid: every stage of the first session through the first system recommendation is free", async () => {
      const ws = randomUUID();
      const { sessionId, ideaIds } = await startup(ws, 2);
      const { recId } = await freeJourney(ws, sessionId, ideaIds[0]);
      expect(await db.startupSystemRecommendation.count({ where: { id: recId } })).toBe(1);
      expect(await workspaceHasDiagnosis(db as any, ws)).toBe(true);
    });

    it("after the first recommendation, further analysis, rebuilds, arbitration and recommendations in that session are paid (402) and write nothing", async () => {
      const ws = randomUUID();
      const { sessionId, ideaIds } = await startup(ws, 2);
      const { hyps } = await freeJourney(ws, sessionId, ideaIds[0]);
      const before = { econ: await db.startupEconomicModel.count({ where: { sessionId } }), rec: await db.startupSystemRecommendation.count({ where: { sessionId } }), arb: await db.goalArbitrationRecord.count({ where: { workspaceId: ws } }) };
      await denied(screenIdeaRecord(ws, sessionId, ideaIds[1], actor, PROFILE as any));
      await denied(generateAndPersistHypotheses(ws, sessionId, ideaIds[1], actor));
      await denied(buildAndPersistEconomicModel(ws, sessionId, ideaIds[0], actor, ECON));
      await denied(assessAndPersistReadiness(ws, sessionId, ideaIds[0], actor, READY));
      await denied(runIdeaArbitration(ws, sessionId, actor));
      await denied(createSystemRecommendation(ws, sessionId, actor, { ...REC, ideaId: ideaIds[0] }));
      expect(await db.startupEconomicModel.count({ where: { sessionId } })).toBe(before.econ);
      expect(await db.startupSystemRecommendation.count({ where: { sessionId } })).toBe(before.rec);
      expect(await db.goalArbitrationRecord.count({ where: { workspaceId: ws } })).toBe(before.arb);
      // the first diagnosis stays readable, and raw evidence capture is not a paid step
      expect((await db.startupIdeaRecord.findFirst({ where: { id: ideaIds[0] } }))?.screeningData).not.toBeNull();
      await expect(recordHypothesisResult(ws, hyps[0], actor, "CONFIRMED", "customers said yes")).resolves.toBeUndefined();
    });

    it("a second Startup session cannot mint another free diagnosis, even after the first completed", async () => {
      const ws = randomUUID();
      const s1 = await startup(ws, 1);
      await freeJourney(ws, s1.sessionId, s1.ideaIds[0]);
      const s2 = await startup(ws, 1);
      await denied(screenIdeaRecord(ws, s2.sessionId, s2.ideaIds[0], actor, PROFILE as any));
      await denied(createSystemRecommendation(ws, s2.sessionId, actor, { ...REC, ideaId: s2.ideaIds[0] }));
    });

    it("an abandoned first session stays THE free session: a new session is paid, resuming the first still completes free", async () => {
      const ws = randomUUID();
      const s1 = await startup(ws, 1);
      await screenIdeaRecord(ws, s1.sessionId, s1.ideaIds[0], actor, PROFILE as any); // started, then abandoned
      const s2 = await startup(ws, 1);
      await denied(screenIdeaRecord(ws, s2.sessionId, s2.ideaIds[0], actor, PROFILE as any));
      await expect(generateAndPersistHypotheses(ws, s1.sessionId, s1.ideaIds[0], actor)).resolves.toBeTruthy();
      await expect(createSystemRecommendation(ws, s1.sessionId, actor, { ...REC, ideaId: s1.ideaIds[0] })).resolves.toBeTruthy();
    });

    it("Case A: a normal owner diagnosis already consumed the allowance, so Startup is paid from the very first step", async () => {
      const ws = randomUUID();
      const b = await biz(ws, "Shared cycle-first");
      const { sessionId, ideaIds } = await startup(ws, 1);
      await cash(ws, b);
      await denied(screenIdeaRecord(ws, sessionId, ideaIds[0], actor, PROFILE as any));
    });

    it("Case B/C: a Startup journey holds the allowance, so a normal diagnosis is paid both while it is in progress and after it completes", async () => {
      const ws = randomUUID();
      const b = await biz(ws, "Shared startup-first");
      const { sessionId, ideaIds } = await startup(ws, 1);
      await screenIdeaRecord(ws, sessionId, ideaIds[0], actor, PROFILE as any);
      await denied(cash(ws, b)); // journey in progress
      await createSystemRecommendation(ws, sessionId, actor, { ...REC, ideaId: ideaIds[0] });
      await denied(cash(ws, b, 5)); // journey delivered
    });

    it("race: two Startup sessions started together become exactly one free journey", async () => {
      const ws = randomUUID();
      const s1 = await startup(ws, 1);
      const s2 = await startup(ws, 1);
      const results = await Promise.allSettled([
        screenIdeaRecord(ws, s1.sessionId, s1.ideaIds[0], actor, PROFILE as any),
        screenIdeaRecord(ws, s2.sessionId, s2.ideaIds[0], actor, PROFILE as any),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ statusCode: 402 });
      expect(await db.startupIdeaRecord.count({ where: { workspaceId: ws, NOT: { screeningStatus: "UNSCREENED" } } })).toBe(1);
    });

    it("race: a Startup session and an owner diagnosis started together mint exactly one free diagnosis", async () => {
      const ws = randomUUID();
      const b = await biz(ws, "Shared race");
      const { sessionId, ideaIds } = await startup(ws, 1);
      const snap = await createCashflowSnapshot(b, { ...period(3), currency: "INR", ...CASH }, actor, ws);
      const results = await Promise.allSettled([screenIdeaRecord(ws, sessionId, ideaIds[0], actor, PROFILE as any), runCashflowDiagnosis(b, snap.id, actor, ws)]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ statusCode: 402 });
    });

    it("race: concurrent steps inside the one free session do not block each other", async () => {
      const ws = randomUUID();
      const { sessionId, ideaIds } = await startup(ws, 3);
      const results = await Promise.allSettled(ideaIds.map((id) => screenIdeaRecord(ws, sessionId, id, actor, PROFILE as any)));
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    });

    it("a subscribed workspace runs unlimited sessions; enforcement OFF is unchanged", async () => {
      const wsPaid = randomUUID();
      await subscribe(wsPaid);
      const a = await startup(wsPaid, 1);
      const b2 = await startup(wsPaid, 1);
      await freeJourney(wsPaid, a.sessionId, a.ideaIds[0]);
      await expect(screenIdeaRecord(wsPaid, b2.sessionId, b2.ideaIds[0], actor, PROFILE as any)).resolves.toBeTruthy();

      process.env.BILLING_PAYWALL_ENFORCEMENT = "off";
      const wsOff = randomUUID();
      const o1 = await startup(wsOff, 1);
      const o2 = await startup(wsOff, 1);
      await freeJourney(wsOff, o1.sessionId, o1.ideaIds[0]);
      await expect(freeJourney(wsOff, o2.sessionId, o2.ideaIds[0])).resolves.toBeTruthy();
      await expect(createSystemRecommendation(wsOff, o1.sessionId, actor, { ...REC, ideaId: o1.ideaIds[0] })).resolves.toBeTruthy();
    });
  });

  describe("purchase orders: cancelling is a free safety action, forward progression is paid", () => {
    async function po(ws: string) {
      const b = await biz(ws, "PO biz");
      const order = await createPurchaseOrder({ businessId: b, poNumber: `PO-${randomUUID().slice(0, 8)}`, vendorName: "Acme", lineItems: [{ description: "x", quantity: 1, unitPrice: 10 }], totalAmount: 10, currency: "INR" } as any, actor, ws);
      return order.id as string;
    }
    it("service transitions are unchanged (the commercial split lives at the route, proven in the route DB suite)", async () => {
      const ws = randomUUID();
      const id = await po(ws);
      await expect(transitionPurchaseOrder(ws, id, "CANCELLED", actor)).resolves.toMatchObject({ status: "CANCELLED" });
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
