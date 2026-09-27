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
    // Exactly one primary. Strategy resolved NOT_YET because the plan is unaffordable: committing would
    // put money at risk, which OpsIQ handles before the (still reported) missing Finance data.
    expect(d.primaryTarget?.findingCode).toBe("STR_UNAFFORDABLE");
    expect(d.primaryTarget?.priorityClass).toBe("PROFIT_LOSS");
    expect(d.attention.filter((t) => t.candidateId === d.primaryCandidateId)).toHaveLength(1);
    // The Finance-vs-Strategy conflict is explained, and the Finance data request waits (not hidden).
    expect(d.whyThisWins.join(" ")).toMatch(/would put at risk/);
    expect(d.whyThisWins.join(" ")).toMatch(/Finance/);
    expect(d.whatCanWait.map((t) => t.findingCode)).toContain("FIN_MISSING_CRITICAL_DATA");
    expect(d.whatNotToDo.join(" ")).toMatch(/New delivery van/);
    // Missing costs/cash are carried from the diagnosed snapshot and cap confidence.
    expect(d.missingInformation.length).toBeGreaterThan(0);
    expect(d.confidence.capped).toBe(true);
    expect(d.confidence.level).not.toBe("high");

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
    // /owner/now's plain-language block names the SAME target first — never Now View's own #1.
    const { toPlainLanguage } = await import("@/domain/owner-guidance/beginner-mode");
    const title = homeBody.currentOwnerDecision.primaryTarget.title;
    for (const nv of [cockpit, priorities]) {
      expect(nv.beginnerExplanation.plainReason).toBe(toPlainLanguage(`Your main target: ${title}`));
      expect(nv.beginnerExplanation.whatToDoFirst[0]).toBe(toPlainLanguage(title));
    }
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

  it("[db] Finance missing data comes from the DIAGNOSED snapshot, not a later-period undiagnosed one", async () => {
    const workspaceId = randomUUID();
    const businessId = await newBusiness(workspaceId, "QA Decision Snapshot");
    const p = period();
    // Snapshot A (diagnosed): revenue only — costs and cash missing.
    const a = await createFinancialSnapshot(businessId, { ...p, currency: "INR", revenue: 100000 }, actor, workspaceId);
    await runFinanceDiagnosis(businessId, a.id, actor, workspaceId);
    // Snapshot B (NOT diagnosed): a later period with complete data.
    const later = new Date(Date.parse(p.periodEnd) + 31 * 86_400_000).toISOString().slice(0, 10);
    const bStart = new Date(Date.parse(p.periodEnd) + 86_400_000).toISOString().slice(0, 10);
    await createFinancialSnapshot(businessId, {
      periodStart: bStart, periodEnd: later, currency: "INR", revenue: 120000, fixedCosts: 40000, variableCosts: 30000, cashOnHand: 90000,
    }, actor, workspaceId);
    const aRow = await db.ownerFinancialSnapshot.findUnique({ where: { id: a.id }, select: { missingCriticalData: true } });
    const expected = (aRow!.missingCriticalData as string[]);
    expect(expected.length).toBeGreaterThan(0);

    const d = (await getOwnerHome(workspaceId, businessId)).currentOwnerDecision!;
    for (const m of expected) expect(d.missingInformation).toContain(m);
    // The Business Condition rollup and Finance dashboard read the same diagnosed snapshot.
    const { getBusinessCondition } = await import("@/services/owner-condition/business-condition.service");
    const cond = await getBusinessCondition(workspaceId, businessId);
    expect(cond.profile!.missingCriticalData).toEqual(expected);
    const dash = await getFinanceDashboard(workspaceId, businessId);
    expect((dash as any).missingCriticalData).toEqual(expected);

    await teardownOwnerBusiness(businessId);
  });

  it("[db] a superseded unsafe cash reading never wins over a NEWER safe Finance diagnosis", async () => {
    const workspaceId = randomUUID();
    const businessId = await newBusiness(workspaceId, "QA Decision Cash Supersession");
    // Older cash triage: critical.
    const cf = await createCashflowSnapshot(businessId, {
      ...period(), currency: "INR", cashInHand: 5000, dailyCollections: 200, receivables: 20000, receivablesOverdue: 15000,
      payables: 12000, upcomingEmi: 5000, rentDue: 4000, salaryDue: 5000, vendorDue: 3000, taxDue: 2000, ownerWithdrawal: 4000,
    }, actor, workspaceId);
    const cashCycle = await runCashflowDiagnosis(businessId, cf.id, actor, workspaceId);
    expect(["AT_RISK", "CRITICAL", "INSOLVENT_RISK"]).toContain(cashCycle.cashflowState);
    const cashOnly = (await getOwnerHome(workspaceId, businessId)).currentOwnerDecision!;
    expect(cashOnly.primaryTarget?.domain).toBe("cashflow");
    expect(cashOnly.primaryTarget?.priorityClass).toBe("SURVIVAL_CASH");
    // Newer Finance diagnosis: healthy and safe.
    const fSnap = await createFinancialSnapshot(businessId, {
      ...period(), currency: "INR", revenue: 500000, fixedCosts: 60000, variableCosts: 120000, cashOnHand: 900000,
    } as any, actor, workspaceId);
    const finCycle = await runFinanceDiagnosis(businessId, fSnap.id, actor, workspaceId);
    expect(["SAFE", "WATCH"]).toContain(finCycle.survivalState);

    const d = (await getOwnerHome(workspaceId, businessId)).currentOwnerDecision!;
    expect(d.attention.some((t) => t.domain === "cashflow" && t.priorityClass === "SURVIVAL_CASH")).toBe(false);
    expect(d.excluded).toEqual(expect.arrayContaining([expect.objectContaining({ reason: "superseded" })]));

    await teardownOwnerBusiness(businessId);
  });

  it("[db] a stale diagnosis becomes an explicit refresh-evidence target, not a 'do this now'", async () => {
    const workspaceId = randomUUID();
    const businessId = await newBusiness(workspaceId, "QA Decision Stale");
    const cf = await createCashflowSnapshot(businessId, {
      periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR", cashInHand: 5000, dailyCollections: 200, receivables: 20000,
      receivablesOverdue: 15000, payables: 12000, upcomingEmi: 5000, rentDue: 4000, salaryDue: 5000, vendorDue: 3000, taxDue: 2000, ownerWithdrawal: 4000,
    }, actor, workspaceId);
    await runCashflowDiagnosis(businessId, cf.id, actor, workspaceId);
    const d = (await getOwnerHome(workspaceId, businessId, { now: new Date("2026-09-27T10:00:00Z") })).currentOwnerDecision!;
    expect(d.primaryTarget?.source).toBe("evidence_refresh");
    expect(d.primaryTarget?.domain).toBe("cashflow");
    expect(d.attention.every((t) => t.source !== "domain_action" || t.domain !== "cashflow")).toBe(true);
    expect(d.excluded.some((e) => e.reason === "stale_evidence")).toBe(true);

    await teardownOwnerBusiness(businessId);
  });

  it("[db] 'what changed' does not depend on which route was visited (Home only, no Now View visit)", async () => {
    const workspaceId = randomUUID();
    const businessId = await newBusiness(workspaceId, "QA Decision Memory");
    const sSnap = await createSalesSnapshot(businessId, {
      ...period(), currency: "INR", leads: 200, qualifiedLeads: 100, orders: 5, revenue: 50000, averageOrderValue: 10000,
      newCustomers: 5, repeatCustomers: 0, lostCustomers: 10, complaints: 20, discountAmount: 30000, refundAmount: 5000, staffCount: 2,
    } as any, actor, workspaceId);
    await runSalesDiagnosis(businessId, sSnap.id, actor, workspaceId);
    // First Home read: no history, nothing invented.
    const first = (await getOwnerHome(workspaceId, businessId)).currentOwnerDecision!;
    expect(first.whatChanged).toEqual([]);
    // A critical cash danger appears; the owner only ever opens Home.
    const cf = await createCashflowSnapshot(businessId, {
      ...period(), currency: "INR", cashInHand: 5000, dailyCollections: 200, receivables: 20000, receivablesOverdue: 15000,
      payables: 12000, upcomingEmi: 5000, rentDue: 4000, salaryDue: 5000, vendorDue: 3000, taxDue: 2000, ownerWithdrawal: 4000,
    }, actor, workspaceId);
    await runCashflowDiagnosis(businessId, cf.id, actor, workspaceId);
    const second = (await getOwnerHome(workspaceId, businessId)).currentOwnerDecision!;
    expect(second.primaryDomain).toBe("cashflow");
    expect(second.whatChanged.map((c) => c.kind)).toContain("MAIN_TARGET_CHANGED");
    // Re-reading (any route) keeps reporting the same change relative to the previous distinct decision.
    const again = (await getOwnerHome(workspaceId, businessId)).currentOwnerDecision!;
    expect(again.whatChanged.map((c) => c.kind)).toContain("MAIN_TARGET_CHANGED");

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
