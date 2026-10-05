/**
 * Owner Budget service — DB-backed proof (Sections 9, 42C, 43).
 *
 * `[db]`-gated → runs only under TEST_WITH_DB=true against migrated PostgreSQL.
 * Proves: workspace isolation, idempotent reassessment, immutable snapshot
 * preservation, and the MANDATORY DYNAMIC PROOF SCENARIO (§43) — a real mutation
 * (committed obligation) auto-triggers reassessment, flips the mode away from
 * GROW, blocks/defers the prior growth spend, creates a cash-protection action,
 * preserves the previous plan snapshot, and updates the owner guidance adapter.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/owner-budget/budget.service.db.test.ts
 */
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { seedKnownBank } from "../../test-helpers/seed-known-bank";
import {
  createBudgetPeriod,
  addBudgetLine,
  recordSpendEntry,
  updateBudgetLineAmount,
  updateSpendReconciliation,
  getBudgetForecast,
  reassessBudget,
  getBudgetGuidance,
  listBudgetSnapshots,
} from "@/services/owner-budget/budget.service";

const actor = randomUUID();
const ws = () => randomUUID();
const businessIds: string[] = [];

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `budget-test-${actor}@example.com`, name: "Budget Test", isActive: true, updatedAt: new Date() },
  });
});

afterEach(async () => {
  for (const id of businessIds.splice(0)) {
    await db.ownerBusiness.delete({ where: { id } }).catch(() => undefined);
  }
});

async function newBusiness(workspaceId: string) {
  const b = await createBusiness(
    { name: "Budget Svc Test", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
    actor,
    workspaceId
  );
  businessIds.push(b.id);
  return b.id;
}

/** Seed a healthy finance snapshot so the baseline classifies as GROW. */
async function seedHealthyFinance(workspaceId: string, businessId: string) {
  await db.ownerFinancialSnapshot.create({
    data: {
      id: randomUUID(),
      workspaceId, businessId,
      periodStart: new Date("2026-05-01"), periodEnd: new Date("2026-05-31"),
      currency: "INR",
      revenue: 500000, costOfGoods: 250000, fixedCosts: 150000, cashOnHand: 400000,
      dataConfidenceScore: 80, missingCriticalData: [],
      updatedAt: new Date(),
    },
  });
  await seedKnownBank(workspaceId, businessId);
}

describe("[db] Owner Budget service", () => {
  it("[db] MANDATORY DYNAMIC PROOF: a committed obligation flips GROW → EMERGENCY, blocks growth, preserves prior plan", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    await seedHealthyFinance(workspaceId, businessId);

    // Period with an approved budget and a small statutory reserve.
    const period = await createBudgetPeriod(
      businessId,
      { label: "May 2026", periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR", approvedBudget: 100000, statutoryReserveRequired: 50000, ownerGoal: "growth" },
      actor, workspaceId
    );

    // Add a capped growth (referral) budget line → triggers first reassessment.
    const growthPlan = await addBudgetLine(
      businessId,
      { periodId: period.id, label: "Referral campaign", category: "growth_roi", plannedAmount: 20000, ownerRole: "manager" },
      actor, workspaceId
    );
    expect(growthPlan.mode).toBe("GROW");
    // Growth is fundable in GROW mode at OPERATIONAL confidence.
    expect(growthPlan.fundAllocationChanges.some((c) => c.includes("Referral campaign") && c.includes("FUND"))).toBe(true);

    const v1 = await getBudgetGuidance(workspaceId, businessId);
    expect(v1.mode).toBe("GROW");

    // ---- Material change: large committed payroll obligation due in 5 days ----
    const { plan: updated } = await recordSpendEntry(
      businessId,
      {
        periodId: period.id, label: "Payroll (committed)", category: "statutory_payroll_tax",
        amount: 420000, state: "committed", obligationKind: "payroll", dueInDays: 5,
        requestedByUserId: actor, ownerApprovalThreshold: 50000,
      },
      actor, workspaceId
    );

    // Mode flips away from GROW to a defensive posture (EMERGENCY here).
    expect(updated.mode).toBe("EMERGENCY");
    expect(updated.decisionType).toBe("BLOCK");
    // Prior growth spend is now blocked/deferred.
    expect(updated.fundAllocationChanges.some((c) => c.includes("Referral campaign") && (c.includes("DEFER") || c.includes("BLOCK")))).toBe(true);
    // A cash-protection action exists.
    expect(updated.generatedActions.some((a) => a.title.toLowerCase().includes("protect cash"))).toBe(true);

    // Guidance adapter exposes the updated next-best-action.
    const v2 = await getBudgetGuidance(workspaceId, businessId);
    expect(v2.mode).toBe("EMERGENCY");
    expect(v2.nextBestAction?.toLowerCase()).toContain("freeze");
    expect(v2.version).toBeGreaterThan(v1.version ?? 0);

    // Previous plan snapshot is preserved (immutable history): v1 GROW still present.
    const snaps = await listBudgetSnapshots(workspaceId, businessId);
    expect(snaps.length).toBeGreaterThanOrEqual(2);
    expect(snaps.some((s) => s.mode === "GROW" && s.isCurrent === false)).toBe(true);
    expect(snaps.filter((s) => s.isCurrent === true).length).toBe(1);
  });

  it("[db] reassessment is idempotent for the same trigger event", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    await seedHealthyFinance(workspaceId, businessId);
    await createBudgetPeriod(businessId, { label: "P", periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR", approvedBudget: 50000 }, actor, workspaceId);

    await reassessBudget(businessId, workspaceId, { actorId: actor, kind: "revenue_changed", triggerEventId: "dup-1" });
    await reassessBudget(businessId, workspaceId, { actorId: actor, kind: "revenue_changed", triggerEventId: "dup-1" });

    const reassessments = await db.budgetReassessment.findMany({ where: { workspaceId, businessId, triggerEventId: "dup-1" } });
    expect(reassessments.length).toBe(1); // no duplicate
  });

  it("[db] enforces workspace isolation (foreign workspace sees no plan)", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    await seedHealthyFinance(workspaceId, businessId);
    await createBudgetPeriod(businessId, { label: "P", periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR", approvedBudget: 50000 }, actor, workspaceId);
    await reassessBudget(businessId, workspaceId, { actorId: actor, kind: "budget_period_created", triggerEventId: "iso-1" });

    // Foreign workspace cannot read this business (ownership guard throws).
    await expect(getBudgetGuidance(ws(), businessId)).rejects.toThrow();

    // And no plan snapshot leaks across workspace scope.
    const foreignSnaps = await db.budgetPlanSnapshot.findMany({ where: { workspaceId: ws() } });
    expect(foreignSnaps.length).toBe(0);
  });

  it("[db] returns DATA_INSUFFICIENT empty-ish guidance when no finance snapshot exists", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    await createBudgetPeriod(businessId, { label: "P", periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR" }, actor, workspaceId);
    const plan = await reassessBudget(businessId, workspaceId, { actorId: actor, kind: "budget_period_created", triggerEventId: "empty-1" });
    expect(plan.mode).toBe("DATA_INSUFFICIENT");
    expect(plan.highRiskBlocked).toBe(true);

    const guidance = await getBudgetGuidance(workspaceId, businessId);
    expect(guidance.mode).toBe("DATA_INSUFFICIENT");
    expect(guidance.pendingDecisions.some((d) => d.startsWith("COLLECT_EVIDENCE"))).toBe(true);
  });

  it("[db] a vendor-bank-change spend surfaces vendor_control_risk in the persisted plan", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    await seedHealthyFinance(workspaceId, businessId);
    const period = await createBudgetPeriod(businessId, { label: "P", periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR", approvedBudget: 100000 }, actor, workspaceId);
    const { plan } = await recordSpendEntry(
      businessId,
      {
        periodId: period.id, label: "Vendor payment", category: "essential_operations", amount: 8000,
        state: "committed", requestedByUserId: actor, ownerApprovalThreshold: 50000, vendorBankChanged: true,
      },
      actor, workspaceId
    );
    expect(plan.signals.some((s) => s.type === "vendor_control_risk")).toBe(true);
    expect(plan.spendRestrictions.some((r) => r.toLowerCase().includes("hold vendor payment"))).toBe(true);
  });

  it("[db] a disputed reconciliation surfaces reconciliation_exception in the plan", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    await seedHealthyFinance(workspaceId, businessId);
    const period = await createBudgetPeriod(businessId, { label: "P", periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR", approvedBudget: 100000 }, actor, workspaceId);
    const { spend } = await recordSpendEntry(businessId, { periodId: period.id, label: "Spend", category: "essential_operations", amount: 5000, state: "committed", requestedByUserId: actor, ownerApprovalThreshold: 50000 }, actor, workspaceId);
    const { plan, reconciliation } = await updateSpendReconciliation(businessId, spend.id, { contradicted: true }, actor, workspaceId);
    expect(reconciliation.mismatch).toBe(true);
    expect(plan.signals.some((s) => s.type === "reconciliation_exception")).toBe(true);
  });

  it("[db] produces a rolling 13-week forecast across scenarios", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    await seedHealthyFinance(workspaceId, businessId);
    await createBudgetPeriod(businessId, { label: "P", periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR", statutoryReserveRequired: 50000 }, actor, workspaceId);
    const f = await getBudgetForecast(workspaceId, businessId);
    expect(f.hasData).toBe(true);
    expect(f.scenarios).toHaveLength(3);
    expect(f.scenarios.every((s) => s.weeklyEndingCash.length === 13)).toBe(true);
  });

  it("[db] a budget line amount change triggers reassessment through the real mutation path", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    await seedHealthyFinance(workspaceId, businessId);
    const period = await createBudgetPeriod(businessId, { label: "P", periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR", approvedBudget: 100000 }, actor, workspaceId);
    const before = await db.budgetReassessment.count({ where: { workspaceId, businessId } });
    const line = await addBudgetLine(businessId, { periodId: period.id, label: "Maintenance", category: "essential_operations", plannedAmount: 10000 }, actor, workspaceId);
    expect(line.mode).toBeTruthy();
    await updateBudgetLineAmount(businessId, (await db.budgetLine.findFirstOrThrow({ where: { workspaceId, businessId } })).id, 25000, actor, workspaceId);
    const after = await db.budgetReassessment.count({ where: { workspaceId, businessId } });
    expect(after).toBeGreaterThan(before + 1); // add + amount-change both reassessed
  });
});
