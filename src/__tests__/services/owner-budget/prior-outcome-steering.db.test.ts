/**
 * Wave 3 S2 — DB proof: persisted funded-initiative outcomes steer the next reassessment.
 *
 * `[db]`-gated. Drives the REAL write path (`updateBudgetAction` completion → FundedInitiativeOutcome with a
 * disposition in `note` + expected/actual variance columns) and then the REAL read path (`reassessBudget`), and
 * proves: a verified FAILED outcome steers the next plan with the expected-vs-actual variance surfaced to the
 * owner; a missing actual result stays UNVERIFIED (no success/steer); a verified SUCCESS does not steer; and the
 * steer is strictly workspace- and business-scoped (no cross-tenant leakage). No new engine, no schema change.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/owner-budget/prior-outcome-steering.db.test.ts
 */
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { createBudgetPeriod, reassessBudget } from "@/services/owner-budget/budget.service";
import { updateBudgetAction } from "@/services/owner-budget/action-link.service";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

const actor = randomUUID();
const businessIds: string[] = [];
const ws = () => randomUUID();

async function newBusiness(workspaceId: string) {
  const b = await createBusiness({ name: "S2 Biz", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false }, actor, workspaceId);
  businessIds.push(b.id);
  return b.id;
}

async function seedHealthyFinance(workspaceId: string, businessId: string) {
  await db.ownerFinancialSnapshot.create({
    data: {
      id: randomUUID(), workspaceId, businessId,
      periodStart: new Date("2026-05-01"), periodEnd: new Date("2026-05-31"), currency: "INR",
      revenue: 500000, costOfGoods: 250000, fixedCosts: 150000, cashOnHand: 400000,
      dataConfidenceScore: 80, missingCriticalData: [], updatedAt: new Date(),
    },
  });
}

async function seedPeriod(workspaceId: string, businessId: string) {
  return createBudgetPeriod(businessId, { label: "May", periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR", approvedBudget: 100000, ownerGoal: "growth" }, actor, workspaceId);
}

async function seedAction(workspaceId: string, businessId: string, title: string) {
  const id = randomUUID();
  await db.ownerBudgetAction.create({
    data: {
      id, workspaceId, businessId, sourceKey: `BLOCK|${title.toLowerCase()}|${id}`, title,
      decisionType: "BLOCK", accountableRole: "owner", reviewInDays: 7, requiredProof: "proof",
      expectedFinancialImpact: "100", verificationMethod: "owner verifies", escalationPath: "escalate",
      status: "proposed", createdBy: actor, updatedAt: new Date(),
    },
  });
  return id;
}

async function complete(actionId: string, workspaceId: string, outcome: Record<string, unknown>) {
  await updateBudgetAction(actionId, { status: "assigned" }, actor, workspaceId);
  await updateBudgetAction(actionId, { status: "in_progress" }, actor, workspaceId);
  return updateBudgetAction(actionId, { status: "completed", completionNotes: "done", completionEvidence: ["ev-1"], ...outcome }, actor, workspaceId);
}

/** Complete `title` with the given impact, then reassess and return the fresh plan. */
async function completeAndReassess(workspaceId: string, businessId: string, title: string, outcome: Record<string, unknown>, trigger: string) {
  const id = await seedAction(workspaceId, businessId, title);
  await complete(id, workspaceId, outcome);
  return reassessBudget(businessId, workspaceId, { actorId: actor, kind: "manual_review", triggerEventId: trigger });
}

const priorFailureSignals = (plan: { signals: { type: string; message: string }[] }, label: string) =>
  plan.signals.filter((s) => s.type === "prior_initiative_failure" && s.message.includes(label));

beforeAll(async () => {
  await db.user.upsert({ where: { id: actor }, update: {}, create: { id: actor, email: `s2-${actor}@example.com`, name: "S2", isActive: true, updatedAt: new Date() } });
});
afterEach(async () => {
  for (const id of businessIds.splice(0)) await db.ownerBusiness.delete({ where: { id } }).catch(() => undefined);
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Wave 3 S2 — persisted outcomes steer the next reassessment", () => {
  it("[db] a verified FAILED outcome steers the next plan and surfaces the expected-vs-actual variance", async () => {
    const workspaceId = ws(); const businessId = await newBusiness(workspaceId);
    await seedHealthyFinance(workspaceId, businessId);
    await seedPeriod(workspaceId, businessId);
    const plan = await completeAndReassess(workspaceId, businessId, "Referral campaign", { expectedImpact: 100, actualImpact: 5 }, "s2-failed-1");
    const sigs = priorFailureSignals(plan, "Referral campaign");
    expect(sigs.length).toBeGreaterThan(0);
    // Expected 100 vs actual 5 ≈ 5% of target — the variance is read from the persisted columns, not invented.
    expect(sigs[0].message).toMatch(/5% of target/);
    expect(plan.whatNotToDo.some((w) => /Referral campaign/.test(w))).toBe(true);
  });

  it("[db] a missing actual result stays UNVERIFIED — no success and no steer", async () => {
    const workspaceId = ws(); const businessId = await newBusiness(workspaceId);
    await seedHealthyFinance(workspaceId, businessId);
    await seedPeriod(workspaceId, businessId);
    const plan = await completeAndReassess(workspaceId, businessId, "No impact yet", {}, "s2-unver-1");
    expect(priorFailureSignals(plan, "No impact yet")).toHaveLength(0);
    const o = await db.fundedInitiativeOutcome.findFirst({ where: { workspaceId, businessId, initiativeLabel: "budget-action:No impact yet" } });
    expect(o?.outcome).toBe("UNVERIFIED");
    expect(o?.safeForLearning).toBe(false);
  });

  it("[db] a verified SUCCESS does not steer the next plan (repeat, not defer)", async () => {
    const workspaceId = ws(); const businessId = await newBusiness(workspaceId);
    await seedHealthyFinance(workspaceId, businessId);
    await seedPeriod(workspaceId, businessId);
    const plan = await completeAndReassess(workspaceId, businessId, "Winning move", { expectedImpact: 100, actualImpact: 120 }, "s2-success-1");
    expect(priorFailureSignals(plan, "Winning move")).toHaveLength(0);
  });

  it("[db] steering is business-scoped — a FAILED outcome in one business does not steer another", async () => {
    const workspaceId = ws();
    const bizA = await newBusiness(workspaceId);
    await seedHealthyFinance(workspaceId, bizA); await seedPeriod(workspaceId, bizA);
    await completeAndReassess(workspaceId, bizA, "Cross biz initiative", { expectedImpact: 100, actualImpact: 5 }, "s2-bizA-1");
    const bizB = await newBusiness(workspaceId);
    await seedHealthyFinance(workspaceId, bizB); await seedPeriod(workspaceId, bizB);
    const planB = await reassessBudget(bizB, workspaceId, { actorId: actor, kind: "manual_review", triggerEventId: "s2-bizB-1" });
    expect(priorFailureSignals(planB, "Cross biz initiative")).toHaveLength(0);
  });

  it("[db] steering is workspace-scoped — a FAILED outcome in one workspace does not steer another", async () => {
    const wsA = ws(); const bizA = await newBusiness(wsA);
    await seedHealthyFinance(wsA, bizA); await seedPeriod(wsA, bizA);
    await completeAndReassess(wsA, bizA, "Cross ws initiative", { expectedImpact: 100, actualImpact: 5 }, "s2-wsA-1");
    const wsB = ws(); const bizB = await newBusiness(wsB);
    await seedHealthyFinance(wsB, bizB); await seedPeriod(wsB, bizB);
    const planB = await reassessBudget(bizB, wsB, { actorId: actor, kind: "manual_review", triggerEventId: "s2-wsB-1" });
    expect(priorFailureSignals(planB, "Cross ws initiative")).toHaveLength(0);
  });
});
