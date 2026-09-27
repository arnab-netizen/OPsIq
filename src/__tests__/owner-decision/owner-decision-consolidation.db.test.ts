/* eslint-disable @typescript-eslint/no-explicit-any -- route handlers are invoked with a mocked enforcement wrapper and return untyped JSON bodies; Prisma rows are untyped */
/**
 * Owner decision consolidation — real-Postgres proof through the real services and route handlers.
 *
 *  1. Production QA scenario (mission §23): Strategy ₹50,000 funding gap + Finance with costs and
 *     cash missing + an already-verified (target reached) Minor Finance item that re-diagnosis
 *     re-attached as still in_progress. Before consolidation the Cockpit put that verified Finance
 *     item in its primary slot (Finance-first precedence, no status filter) while Home ranked the
 *     Strategy gap first. Now: the verified item is excluded, exactly one primary target exists,
 *     the Finance-vs-Strategy conflict is explained, and the Strategy item waits.
 *  2. Home = Cockpit (now-view) = Command Center = Priorities (now-view) primary, through the real
 *     route handlers.
 *  3. Business switch: two businesses in one workspace resolve independently, no leakage.
 *  4. No information loss from the retired Finance/domain Cockpit bridges: every domain
 *     dashboard's top open, unverified action is in the canonical attention order.
 *  5. Terminal work: a completed action never appears in the canonical order.
 *
 * `[db]`-gated. Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-decision/owner-decision-consolidation.db.test.ts
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
import { teardownOwnerBusiness } from "../test-helpers/owner-business-teardown";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { createFinancialSnapshot } from "@/services/owner-finance/snapshot.service";
import { runFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import { updateFinanceAction } from "@/services/owner-finance/action.service";
import { recordFinanceVerification } from "@/services/owner-finance/verification.service";
import { getFinanceDashboard } from "@/services/owner-finance/dashboard.service";
import { createStrategySnapshot } from "@/services/owner-strategy/snapshot.service";
import { runStrategyDiagnosis } from "@/services/owner-strategy/diagnosis.service";
import { createCashflowSnapshot } from "@/services/owner-cashflow/snapshot.service";
import { runCashflowDiagnosis } from "@/services/owner-cashflow/diagnosis.service";
import { createSalesSnapshot } from "@/services/owner-sales/snapshot.service";
import { runSalesDiagnosis } from "@/services/owner-sales/diagnosis.service";
import { updateSalesAction } from "@/services/owner-sales/action.service";
import { getOwnerHome } from "@/services/owner-home/home.service";
import { GET as nowViewGET } from "@/app/api/owner/now-view/route";
import { GET as homeGET } from "@/app/api/owner/home/route";
import { GET as commandCenterGET } from "@/app/api/owner/command-center/route";

const actor = randomUUID();

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `decision-${actor}@example.com`, name: "Decision QA", isActive: true, updatedAt: new Date() },
  });
});

function period() {
  const end = new Date();
  const start = new Date(end.getTime() - 29 * 86_400_000);
  return { periodStart: start.toISOString().slice(0, 10), periodEnd: end.toISOString().slice(0, 10) };
}

async function newBusiness(workspaceId: string, name: string) {
  const b = await createBusiness(
    { name, businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
    actor,
    workspaceId
  );
  return b.id;
}

/** §23 scenario: returns ids of the business and the verified Minor Finance item. */
async function seedProductionScenario(workspaceId: string, businessId: string) {
  // Finance: revenue known, costs and cash missing → missing-critical-data + data-quality actions.
  const fSnap = await createFinancialSnapshot(businessId, { ...period(), currency: "INR", revenue: 100000, discountAmount: 5000 }, actor, workspaceId);
  const c1 = await runFinanceDiagnosis(businessId, fSnap.id, actor, workspaceId);
  const minor = c1.actions.find((a: any) => a.findingCode === "FIN_OPP_DATA_QUALITY")!;
  expect(minor).toBeDefined();
  // The Minor item is worked and verified as reaching its target; re-diagnosis re-attaches it.
  await updateFinanceAction(minor.id, { status: "assigned" }, actor, workspaceId);
  await updateFinanceAction(minor.id, { status: "in_progress" }, actor, workspaceId);
  await recordFinanceVerification(minor.id, { beforeValue: 15, afterValue: 8, targetDirection: "down", targetValue: 10 }, actor, workspaceId);
  // Strategy: ₹50,000 funding gap on an otherwise positive plan.
  const sSnap = await createStrategySnapshot(businessId, {
    ...period(), currency: "INR", optionName: "New delivery van", currentRevenue: 100000, expectedRevenueChange: 30000,
    costChange: 5000, investmentRequired: 100000, timeToImpactMonths: 3, riskLevel: "medium", cashAvailable: 50000,
  } as any, actor, workspaceId);
  await runStrategyDiagnosis(businessId, sSnap.id, actor, workspaceId);
  return { minorId: minor.id as string };
}

function ctx(workspaceId: string, path: string) {
  return { request: new Request(`http://localhost${path}`), verifiedWorkspaceId: workspaceId, verifiedActorId: actor } as any;
}

describe("[db] canonical owner decision — consolidation", () => {
  it("[db] §23 production scenario: verified item excluded, one primary, Finance-vs-Strategy resolved", async () => {
    const workspaceId = randomUUID();
    const businessId = await newBusiness(workspaceId, "QA Decision Scenario");
    const { minorId } = await seedProductionScenario(workspaceId, businessId);

    const home = await getOwnerHome(workspaceId, businessId);
    const d = home.currentOwnerDecision!;
    expect(d.state).toBe("TARGET");
    // The verified Minor item is not eligible (it was the Cockpit's pre-consolidation primary).
    expect(d.attention.some((t) => t.candidateId.endsWith(minorId))).toBe(false);
    expect(d.excluded).toEqual(expect.arrayContaining([expect.objectContaining({ reason: "verified_complete" })]));
    // Exactly one primary: missing costs/cash outranks the speculative funding decision.
    expect(d.primaryTarget?.findingCode).toBe("FIN_MISSING_CRITICAL_DATA");
    expect(d.attention.filter((t) => t.candidateId === d.primaryCandidateId)).toHaveLength(1);
    // The conflict is explained and the Strategy item waits (not hidden).
    expect(d.whyThisWins.join(" ")).toMatch(/funding gap/);
    expect(d.whatCanWait.map((t) => t.findingCode)).toContain("STR_UNAFFORDABLE");
    expect(d.whatNotToDo.join(" ")).toMatch(/New delivery van/);
    expect(d.missingInformation.length).toBeGreaterThan(0);

    await teardownOwnerBusiness(businessId);
  });

  it("[db] Home = Cockpit = Command Center = Priorities primary, through the real route handlers", async () => {
    const workspaceId = randomUUID();
    const businessId = await newBusiness(workspaceId, "QA Decision Invariant");
    await seedProductionScenario(workspaceId, businessId);
    const qs = `?businessId=${businessId}`;

    const home = (await homeGET(ctx(workspaceId, `/api/owner/home${qs}`), {})) as any;
    const cockpit = (await nowViewGET(ctx(workspaceId, `/api/owner/now-view${qs}&restrictExecutionToBusiness=true`), {})) as any;
    const priorities = (await nowViewGET(ctx(workspaceId, `/api/owner/now-view${qs}`), {})) as any;
    const commandCenter = (await commandCenterGET(ctx(workspaceId, `/api/owner/command-center${qs}`), {})) as any;

    const homeBody = typeof home?.json === "function" ? await home.json() : home;
    const primary = homeBody.currentOwnerDecision.primaryCandidateId;
    expect(primary).toBeTruthy();
    expect(cockpit.ownerDecision.primaryCandidateId).toBe(primary);
    expect(priorities.ownerDecision.primaryCandidateId).toBe(primary);
    expect(priorities.ownerDecision.attention[0].candidateId).toBe(primary);
    expect(commandCenter.currentOwnerDecision.primaryCandidateId).toBe(primary);
    // The retired bridges are gone from the payload: no second elector can reach the Cockpit.
    expect(cockpit).not.toHaveProperty("financeTopPriority");
    expect(cockpit).not.toHaveProperty("domainTopPriority");
    // Business Condition no longer carries its own next action.
    expect(commandCenter.profile).not.toHaveProperty("recommendedNextAction");

    await teardownOwnerBusiness(businessId);
  });

  it("[db] business switch: each business resolves its own decision with no cross-business leakage", async () => {
    const workspaceId = randomUUID();
    const a = await newBusiness(workspaceId, "QA Decision A");
    const b = await newBusiness(workspaceId, "QA Decision B");
    await seedProductionScenario(workspaceId, a);
    const cf = await createCashflowSnapshot(b, {
      ...period(), currency: "INR", cashInHand: 5000, dailyCollections: 200, receivables: 20000, receivablesOverdue: 15000,
      payables: 12000, upcomingEmi: 5000, rentDue: 4000, salaryDue: 5000, vendorDue: 3000, taxDue: 2000, ownerWithdrawal: 4000,
    }, actor, workspaceId);
    await runCashflowDiagnosis(b, cf.id, actor, workspaceId);

    const da = (await getOwnerHome(workspaceId, a)).currentOwnerDecision!;
    const dbz = (await getOwnerHome(workspaceId, b)).currentOwnerDecision!;
    expect(da.businessId).toBe(a);
    expect(dbz.businessId).toBe(b);
    expect(dbz.primaryDomain).toBe("cashflow");
    expect(dbz.primaryTarget?.priorityClass).toBe("SURVIVAL_CASH");
    const aIds = new Set(da.attention.map((t) => t.candidateId));
    expect(dbz.attention.some((t) => aIds.has(t.candidateId))).toBe(false);
    expect(da.attention.some((t) => t.domain === "cashflow")).toBe(false);
    expect(dbz.attention.some((t) => t.domain === "strategy" || t.domain === "finance")).toBe(false);
    // No business selected in a 2-business workspace → no guessed decision.
    expect((await getOwnerHome(workspaceId, null)).currentOwnerDecision).toBeNull();

    await teardownOwnerBusiness(a);
    await teardownOwnerBusiness(b);
  });

  it("[db] no information loss: every domain dashboard's top open, unverified action is in the canonical order", async () => {
    const workspaceId = randomUUID();
    const businessId = await newBusiness(workspaceId, "QA Decision Equivalence");
    const fSnap = await createFinancialSnapshot(businessId, {
      ...period(), currency: "INR", revenue: 100000, fixedCosts: 40000, variableCosts: 40000, discountAmount: 15000, cashOnHand: 50000,
    }, actor, workspaceId);
    await runFinanceDiagnosis(businessId, fSnap.id, actor, workspaceId);
    const sSnap = await createSalesSnapshot(businessId, {
      ...period(), currency: "INR", leads: 200, qualifiedLeads: 100, orders: 5, revenue: 50000, averageOrderValue: 10000,
      newCustomers: 5, repeatCustomers: 0, lostCustomers: 10, complaints: 20, discountAmount: 30000, refundAmount: 5000, staffCount: 2,
    } as any, actor, workspaceId);
    await runSalesDiagnosis(businessId, sSnap.id, actor, workspaceId);

    const d = (await getOwnerHome(workspaceId, businessId)).currentOwnerDecision!;
    const finance = await getFinanceDashboard(workspaceId, businessId);
    const financeTop = (finance as any).recommendedNextAction;
    expect(financeTop).toBeTruthy();
    // What the retired Finance bridge showed is still present in the canonical order.
    expect(d.attention.map((t) => t.title)).toContain(financeTop.title);
    // What the retired domain bridge showed (top open non-Finance action) is present too.
    const salesTop = await db.ownerSalesAction.findFirst({
      where: { businessId, workspaceId, status: { in: ["proposed", "assigned", "in_progress", "blocked"] } },
      orderBy: [{ priorityScore: "desc" }, { id: "asc" }],
    });
    expect(salesTop).toBeTruthy();
    expect(d.attention.map((t) => t.title)).toContain(salesTop!.title);

    await teardownOwnerBusiness(businessId);
  });

  it("[db] completed work never appears in the canonical order", async () => {
    const workspaceId = randomUUID();
    const businessId = await newBusiness(workspaceId, "QA Decision Completion");
    const sSnap = await createSalesSnapshot(businessId, {
      ...period(), currency: "INR", leads: 200, qualifiedLeads: 100, orders: 5, revenue: 50000, averageOrderValue: 10000,
      newCustomers: 5, repeatCustomers: 0, lostCustomers: 10, complaints: 20, discountAmount: 30000, refundAmount: 5000, staffCount: 2,
    } as any, actor, workspaceId);
    await runSalesDiagnosis(businessId, sSnap.id, actor, workspaceId);
    const before = (await getOwnerHome(workspaceId, businessId)).currentOwnerDecision!;
    const primaryRowId = before.primaryCandidateId!.split(":").pop()!;
    await updateSalesAction(primaryRowId, { status: "assigned" }, actor, workspaceId);
    await updateSalesAction(primaryRowId, { status: "in_progress" }, actor, workspaceId);
    await updateSalesAction(primaryRowId, { status: "completed", completionNotes: "done", completionEvidence: ["qa-ref"] } as any, actor, workspaceId);

    const after = (await getOwnerHome(workspaceId, businessId)).currentOwnerDecision!;
    expect(after.attention.some((t) => t.candidateId === before.primaryCandidateId)).toBe(false);
    expect(after.primaryCandidateId).not.toBe(before.primaryCandidateId);

    await teardownOwnerBusiness(businessId);
  });
});
