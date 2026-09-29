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
import { updateCashflowAction } from "@/services/owner-cashflow/action.service";
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
    // Exactly one primary: the MEASURED money leak (₹5,000 of discounts on ₹100,000 revenue) comes
    // first. Strategy resolved NOT_YET because the van is unaffordable — a risk only if the owner
    // commits (PLAN_COMMITMENT_RISK) — so its funding step follows present losses, and the
    // "don't commit yet" warning stays visible.
    expect(d.primaryTarget?.domain).toBe("finance");
    expect(d.primaryTarget?.priorityClass).toBe("PROFIT_LOSS");
    expect(d.attention.filter((t) => t.candidateId === d.primaryCandidateId)).toHaveLength(1);
    const strategyStep = d.attention.find((t) => t.findingCode === "STR_UNAFFORDABLE");
    expect(strategyStep?.priorityClass).toBe("PLAN_COMMITMENT_RISK");
    const idx = (code: string) => d.attention.findIndex((t) => t.findingCode === code);
    expect(idx("STR_UNAFFORDABLE")).toBeGreaterThan(0);
    expect(idx("STR_UNAFFORDABLE")).toBeLessThan(idx("FIN_MISSING_CRITICAL_DATA"));
    // The Finance data request is still reported (it waits; it is not hidden).
    expect(d.whatCanWait.map((t) => t.findingCode).concat(d.supportingSteps.map((t) => t.findingCode))).toContain("FIN_MISSING_CRITICAL_DATA");
    expect(d.whatNotToDo.join(" ")).toMatch(/Don't commit to "New delivery van" yet/);
    // Missing costs/cash are carried from the diagnosed snapshot; confidence is held at or under the
    // data-sufficiency cap and the reason is always stated (also when the score was already below it).
    expect(d.missingInformation.length).toBeGreaterThan(0);
    expect(d.confidence.reasons.join(" ")).toMatch(/provisional|caution/);
    expect(d.confidence.score).toBeLessThanOrEqual(70);
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
    // One review cadence on the Command Center: the one the canonical decision states.
    expect(commandCenter.reassessmentCadenceDays).toBe(homeBody.reassessment.days);
    expect(commandCenter.reassessmentReason).toBe(homeBody.reassessment.reason);
    expect(commandCenter.currentOwnerDecision.reassessmentTrigger).toContain(`within ${homeBody.reassessment.days} days`);
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
    // Older cash triage (its evidence period ended 20 days before the Finance one): critical.
    const cfEnd = new Date(Date.now() - 20 * 86_400_000);
    const cfStart = new Date(cfEnd.getTime() - 29 * 86_400_000);
    const cf = await createCashflowSnapshot(businessId, {
      periodStart: cfStart.toISOString().slice(0, 10), periodEnd: cfEnd.toISOString().slice(0, 10), currency: "INR", cashInHand: 5000, dailyCollections: 200, receivables: 20000, receivablesOverdue: 15000,
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
    // First Home read: only what was persisted — the first Sales figures were analysed; nothing invented.
    const first = (await getOwnerHome(workspaceId, businessId)).currentOwnerDecision!;
    expect(first.whatChanged).toEqual([{ kind: "EVIDENCE_UPDATED", message: "New Sales figures were analysed." }]);
    // A critical cash danger appears; the owner only ever opens Home.
    const cf = await createCashflowSnapshot(businessId, {
      ...period(), currency: "INR", cashInHand: 5000, dailyCollections: 200, receivables: 20000, receivablesOverdue: 15000,
      payables: 12000, upcomingEmi: 5000, rentDue: 4000, salaryDue: 5000, vendorDue: 3000, taxDue: 2000, ownerWithdrawal: 4000,
    }, actor, workspaceId);
    await runCashflowDiagnosis(businessId, cf.id, actor, workspaceId);
    const second = (await getOwnerHome(workspaceId, businessId)).currentOwnerDecision!;
    expect(second.primaryDomain).toBe("cashflow");
    // Built from persisted facts (the new Cash flow diagnosis), never from a read-time memory: no
    // "main target changed" claim (not reconstructible truthfully), and the same answer on every route.
    expect(second.whatChanged).toEqual(expect.arrayContaining([{ kind: "EVIDENCE_UPDATED", message: "New Cash flow figures were analysed." }]));
    expect(second.whatChanged.map((c) => c.kind)).not.toContain("MAIN_TARGET_CHANGED");
    const again = (await getOwnerHome(workspaceId, businessId)).currentOwnerDecision!;
    expect(again.whatChanged).toEqual(second.whatChanged);
    const viaNowView: any = await nowViewGET(ctx(workspaceId, `/api/owner/now-view?businessId=${businessId}`), {});
    expect(viaNowView.ownerDecision.whatChanged).toEqual(second.whatChanged);
    expect(await db.auditEvent.count({ where: { workspaceId, eventName: "owner.decision_changed" } })).toBe(0);

    await teardownOwnerBusiness(businessId);
  });

  it("[db] concurrent reads record NO decision event: the read path persists nothing", async () => {
    const workspaceId = randomUUID();
    const businessId = await newBusiness(workspaceId, "QA Decision Concurrency");
    const sSnap = await createSalesSnapshot(businessId, {
      ...period(), currency: "INR", leads: 200, qualifiedLeads: 100, orders: 5, revenue: 50000, averageOrderValue: 10000,
      newCustomers: 5, repeatCustomers: 0, lostCustomers: 10, complaints: 20, discountAmount: 30000, refundAmount: 5000, staffCount: 2,
    } as any, actor, workspaceId);
    await runSalesDiagnosis(businessId, sSnap.id, actor, workspaceId);
    // Five simultaneous reads of a decision nobody has recorded yet (two tabs, Portfolio fan-out, ...).
    await Promise.all(Array.from({ length: 5 }, () => getOwnerHome(workspaceId, businessId)));
    expect(await db.auditEvent.count({ where: { workspaceId, eventName: "owner.decision_changed" } })).toBe(0);
    expect(await db.auditEvent.count({ where: { workspaceId, entityType: "OwnerDecision" } })).toBe(0);

    await teardownOwnerBusiness(businessId);
  });

  it("[db] reproduction: a CURRENT unsafe cash reading whose actions all await new evidence never lets a lower class win silently", async () => {
    const workspaceId = randomUUID();
    const businessId = await newBusiness(workspaceId, "QA Decision Cash Confirm");
    const cf = await createCashflowSnapshot(businessId, {
      ...period(), currency: "INR", cashInHand: 5000, dailyCollections: 200, receivables: 20000, receivablesOverdue: 15000,
      payables: 12000, upcomingEmi: 5000, rentDue: 4000, salaryDue: 5000, vendorDue: 3000, taxDue: 2000, ownerWithdrawal: 4000,
    }, actor, workspaceId);
    const cycle = await runCashflowDiagnosis(businessId, cf.id, actor, workspaceId);
    expect(["AT_RISK", "CRITICAL", "INSOLVENT_RISK"]).toContain(cycle.cashflowState);
    // The owner cancels every survival action (always allowed — the action gate only blocks ADVANCING
    // finance-sensitive work while cash is unsafe). The cycle's cash reading is unchanged and unsafe.
    const home0 = await getOwnerHome(workspaceId, businessId);
    const survival = home0.currentOwnerDecision!.attention.filter((a) => a.domain === "cashflow" && a.priorityClass === "SURVIVAL_CASH");
    expect(survival.length).toBeGreaterThan(0);
    for (const t of survival) {
      await updateCashflowAction(t.candidateId.split(":").pop()!, { status: "cancelled" }, actor, workspaceId);
    }
    const latest = await db.ownerCashflowCycle.findFirst({ where: { businessId }, orderBy: { sequenceNumber: "desc" } });
    expect(["AT_RISK", "CRITICAL", "INSOLVENT_RISK"]).toContain(latest!.cashflowState);
    const d = (await getOwnerHome(workspaceId, businessId)).currentOwnerDecision!;
    // No open survival action remains, yet the current reading is unsafe: the canonical decision
    // makes that explicit — confirm the cash position with current figures — instead of electing
    // lower-class work beside a cash-danger signal.
    expect(d.primaryTarget?.priorityClass).toBe("SURVIVAL_CASH");
    // The issue stays open and carries the cancelled action's own title (the owner's response to it).
    expect(survival.map((t) => t.title)).toContain(d.primaryTarget?.title);
    expect(d.primaryTarget?.explanation).toMatch(/was cancelled, but your Cash flow figures .* still show/);
    // A CURRENT reading: never presented as out-of-date figures, and it carries the diagnosed
    // survival finding's own identity (one of the cancelled actions' findings).
    expect(d.primaryTarget?.source).toBe("survival_reading");
    expect(survival.map((t) => t.findingCode)).toContain(d.primaryTarget?.findingCode);
    // Cancelling the actions without new figures did not resolve the danger: never reported as resolved.
    expect(d.whatChanged.map((c) => c.kind)).not.toContain("CRITICAL_ISSUE_RESOLVED");
    expect(d.whatChanged.map((c) => c.kind)).not.toContain("EVIDENCE_OUT_OF_DATE");

    await teardownOwnerBusiness(businessId);
  });

  it("[db] P1: an open LOWER survival action never hides a more severe survival issue whose action was cancelled", async () => {
    const workspaceId = randomUUID();
    const businessId = await newBusiness(workspaceId, "QA Decision Issue vs Action");
    const cf = await createCashflowSnapshot(businessId, {
      ...period(), currency: "INR", cashInHand: 5000, dailyCollections: 200, receivables: 20000, receivablesOverdue: 15000,
      payables: 12000, upcomingEmi: 5000, rentDue: 4000, salaryDue: 5000, vendorDue: 3000, taxDue: 2000, ownerWithdrawal: 4000,
    }, actor, workspaceId);
    await runCashflowDiagnosis(businessId, cf.id, actor, workspaceId);
    const home0 = await getOwnerHome(workspaceId, businessId);
    const survival = home0.currentOwnerDecision!.attention.filter((a) => a.domain === "cashflow" && a.priorityClass === "SURVIVAL_CASH");
    // Needs two survival issues of different severity from the same evidence.
    const sevRank = (s: string | null) => ["low", "medium", "high", "critical"].indexOf(s ?? "");
    const ordered = [...survival].sort((a, b) => sevRank(b.severity) - sevRank(a.severity));
    expect(ordered.length).toBeGreaterThan(1);
    const worst = ordered[0];
    expect(sevRank(worst.severity)).toBeGreaterThan(sevRank(ordered[ordered.length - 1].severity));
    // Cancel ONLY the most severe issue's action; a less severe survival action stays open.
    await updateCashflowAction(worst.candidateId.split(":").pop()!, { status: "cancelled" }, actor, workspaceId);
    const d = (await getOwnerHome(workspaceId, businessId)).currentOwnerDecision!;
    expect(d.primaryTarget?.findingCode).toBe(worst.findingCode);
    expect(d.primaryTarget?.severity).toBe(worst.severity);
    expect(d.primaryTarget?.source).toBe("survival_reading");
    // One issue, never a duplicate of its (closed) action or of the open lower action.
    expect(d.attention.filter((t) => t.findingCode === worst.findingCode)).toHaveLength(1);

    await teardownOwnerBusiness(businessId);
  });

  it("[db] P1: stale unsafe cash evidence whose action was cancelled becomes a refresh target — lower-class work never wins", async () => {
    const workspaceId = randomUUID();
    const businessId = await newBusiness(workspaceId, "QA Decision Stale Survival");
    // Cash flow figures for a period ~100 days ago: out of date (45-day window), still unsafe.
    const end = new Date(Date.now() - 100 * 86_400_000);
    const start = new Date(end.getTime() - 29 * 86_400_000);
    const cf = await createCashflowSnapshot(businessId, {
      periodStart: start.toISOString().slice(0, 10), periodEnd: end.toISOString().slice(0, 10), currency: "INR",
      cashInHand: 5000, dailyCollections: 200, receivables: 20000, receivablesOverdue: 15000,
      payables: 12000, upcomingEmi: 5000, rentDue: 4000, salaryDue: 5000, vendorDue: 3000, taxDue: 2000, ownerWithdrawal: 4000,
    }, actor, workspaceId);
    await runCashflowDiagnosis(businessId, cf.id, actor, workspaceId);
    // Current Sales figures with open (lower-class) work.
    const sSnap = await createSalesSnapshot(businessId, {
      ...period(), currency: "INR", leads: 200, qualifiedLeads: 100, orders: 5, revenue: 50000, averageOrderValue: 10000,
      newCustomers: 5, repeatCustomers: 0, lostCustomers: 10, complaints: 20, discountAmount: 30000, refundAmount: 5000, staffCount: 2,
    } as any, actor, workspaceId);
    await runSalesDiagnosis(businessId, sSnap.id, actor, workspaceId);
    // The owner cancels every cash action while the (old) figures still read unsafe.
    const cfCycle = await db.ownerCashflowCycle.findFirst({ where: { businessId }, orderBy: { sequenceNumber: "desc" }, include: { actions: true } });
    for (const a of cfCycle!.actions.filter((x: { status: string }) => x.status !== "completed" && x.status !== "cancelled")) {
      await updateCashflowAction(a.id, { status: "cancelled" }, actor, workspaceId);
    }
    const d = (await getOwnerHome(workspaceId, businessId)).currentOwnerDecision!;
    // The last-known cash danger is an explicit "confirm it" target — never silently dropped, never current.
    expect(d.primaryTarget?.source).toBe("evidence_refresh");
    expect(d.primaryTarget?.domain).toBe("cashflow");
    expect(d.primaryTarget?.priorityClass).toBe("SURVIVAL_CASH");
    expect(d.primaryTarget?.domain).not.toBe("sales");
    expect(d.confidence.level).not.toBe("high");

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
