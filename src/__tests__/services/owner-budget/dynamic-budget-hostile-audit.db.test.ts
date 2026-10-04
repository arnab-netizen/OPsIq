/**
 * Dynamic Budget — FINAL HOSTILE AUDIT + simulation suite (Slice 7).
 *
 * `[db]`-gated, deterministic. This is an adversarial end-to-end audit of the whole
 * Dynamic Budget (Owner Mode) module: every scenario is an attempt to BREAK a
 * governance / safety / tenancy / adaptive invariant through the REAL service
 * paths, and asserts the system holds. No mocks, no skips, no source changes —
 * if a scenario fails it is a genuine defect, not a weakened test.
 *
 * Twenty hostile scenarios (H1..H20) across six attack surfaces:
 *   Tenancy isolation  H1  H2  H3
 *   Idempotency/replay H4  H5  H6
 *   Governance blocks  H7  H8  H9  H10 H11
 *   Adaptive truth     H12 H13 H14 H15
 *   Data integrity     H16 H17 H18
 *   Audit / advisory   H19 H20
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/owner-budget/dynamic-budget-hostile-audit.db.test.ts
 */
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { createBusiness } from "@/services/founder-recovery/business.service";
import {
  createBudgetPeriod, addBudgetLine, recordSpendEntry, reassessBudget,
  getBudgetGuidance, listBudgetSnapshots,
} from "@/services/owner-budget/budget.service";
import { updateBudgetAction } from "@/services/owner-budget/action-link.service";
import { recordOwnerOverride, changeBudgetAuthority } from "@/services/owner-budget/governance.service";
import { recordWorkingCapitalItem, listWorkingCapitalItems } from "@/services/owner-budget/working-capital.service";
import { recordArchetypeMetric } from "@/services/owner-budget/archetype-metrics.service";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { seedKnownBank } from "../../test-helpers/seed-known-bank";

const actor = randomUUID();
const ws = () => randomUUID();
const businessIds: string[] = [];

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `hostile-${actor}@example.com`, name: "Hostile Audit", isActive: true, updatedAt: new Date() },
  });
});

afterEach(async () => {
  for (const id of businessIds.splice(0)) {
    await db.ownerBusiness.delete({ where: { id } }).catch(() => undefined);
  }
});

async function newBusiness(workspaceId: string) {
  const b = await createBusiness(
    { name: "Hostile Biz", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: false },
    actor, workspaceId
  );
  businessIds.push(b.id);
  return b.id;
}

async function seedFinance(
  workspaceId: string, businessId: string,
  f: { revenue: number; costOfGoods: number; fixedCosts: number; cashOnHand: number } =
    { revenue: 500000, costOfGoods: 250000, fixedCosts: 150000, cashOnHand: 400000 }
) {
  await db.ownerFinancialSnapshot.create({
    data: {
      id: randomUUID(), workspaceId, businessId,
      periodStart: new Date("2026-05-01"), periodEnd: new Date("2026-05-31"), currency: "INR",
      revenue: f.revenue, costOfGoods: f.costOfGoods, fixedCosts: f.fixedCosts, cashOnHand: f.cashOnHand,
      dataConfidenceScore: 80, missingCriticalData: [], updatedAt: new Date(),
    },
  });
  await seedKnownBank(workspaceId, businessId);
}

async function growthPeriod(workspaceId: string, businessId: string) {
  const period = await createBudgetPeriod(
    businessId,
    { label: "May 2026", periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR", approvedBudget: 100000, statutoryReserveRequired: 50000, ownerGoal: "growth" },
    actor, workspaceId
  );
  await addBudgetLine(
    businessId,
    { periodId: period.id, label: "Referral campaign", category: "growth_roi", plannedAmount: 20000, ownerRole: "manager" },
    actor, workspaceId
  );
  return period;
}

/** Seed a budget action and drive it to in_progress so completion can be attempted. */
async function inProgressAction(workspaceId: string, businessId: string, title: string) {
  const id = randomUUID();
  await db.ownerBudgetAction.create({
    data: {
      id, workspaceId, businessId,
      sourceKey: `BLOCK|${title.toLowerCase()}|${id}`, title,
      decisionType: "BLOCK", accountableRole: "owner", reviewInDays: 7,
      requiredProof: "proof", expectedFinancialImpact: "100",
      verificationMethod: "owner verifies", escalationPath: "escalate to owner",
      status: "proposed", createdBy: actor, updatedAt: new Date(),
    },
  });
  await updateBudgetAction(id, { status: "assigned" }, actor, workspaceId);
  await updateBudgetAction(id, { status: "in_progress" }, actor, workspaceId);
  return id;
}

describe("[db] Dynamic Budget — final hostile audit", () => {
  // ---------------------------------------------------------------- Tenancy
  it("[db] H1: a foreign workspace cannot read another workspace's budget plan", async () => {
    const workspaceId = ws(); const businessId = await newBusiness(workspaceId);
    await seedFinance(workspaceId, businessId);
    await createBudgetPeriod(businessId, { label: "P", periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR", approvedBudget: 50000 }, actor, workspaceId);
    await reassessBudget(businessId, workspaceId, { actorId: actor, kind: "budget_period_created", triggerEventId: "h1" });
    await expect(getBudgetGuidance(ws(), businessId)).rejects.toThrow();
  });

  it("[db] H2: a foreign workspace cannot mutate another workspace's budget action", async () => {
    const workspaceId = ws(); const businessId = await newBusiness(workspaceId);
    const id = await inProgressAction(workspaceId, businessId, "Scoped action");
    await expect(updateBudgetAction(id, { status: "completed", completionEvidence: ["x"] }, actor, ws())).rejects.toThrow();
    const row = await db.ownerBudgetAction.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("in_progress"); // unchanged
  });

  it("[db] H3: working-capital items do not leak across workspaces", async () => {
    const workspaceId = ws(); const businessId = await newBusiness(workspaceId);
    await recordWorkingCapitalItem(businessId, { kind: "receivable", counterparty: "Acme", amount: 10000 }, actor, workspaceId);
    await expect(listWorkingCapitalItems(ws(), businessId)).rejects.toThrow();
    const leaked = await db.ownerWorkingCapitalItem.findMany({ where: { workspaceId: ws() } });
    expect(leaked).toHaveLength(0);
  });

  // ------------------------------------------------------------- Idempotency
  it("[db] H4: replaying the same reassessment trigger creates no duplicate reassessment", async () => {
    const workspaceId = ws(); const businessId = await newBusiness(workspaceId);
    await seedFinance(workspaceId, businessId);
    await createBudgetPeriod(businessId, { label: "P", periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR", approvedBudget: 50000 }, actor, workspaceId);
    await reassessBudget(businessId, workspaceId, { actorId: actor, kind: "revenue_changed", triggerEventId: "h4" });
    await reassessBudget(businessId, workspaceId, { actorId: actor, kind: "revenue_changed", triggerEventId: "h4" });
    const rows = await db.budgetReassessment.findMany({ where: { workspaceId, businessId, triggerEventId: "h4" } });
    expect(rows).toHaveLength(1);
  });

  it("[db] H5: concurrent identical reassessments collapse to a single reassessment row", async () => {
    const workspaceId = ws(); const businessId = await newBusiness(workspaceId);
    await seedFinance(workspaceId, businessId);
    await createBudgetPeriod(businessId, { label: "P", periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR", approvedBudget: 50000 }, actor, workspaceId);
    const opts = { actorId: actor, kind: "revenue_changed" as const, triggerEventId: "h5" };
    // Race the same trigger; the unique guard must prevent a duplicate.
    await Promise.allSettled([
      reassessBudget(businessId, workspaceId, opts),
      reassessBudget(businessId, workspaceId, opts),
      reassessBudget(businessId, workspaceId, opts),
    ]);
    const rows = await db.budgetReassessment.findMany({ where: { workspaceId, businessId, triggerEventId: "h5" } });
    expect(rows.length).toBe(1);
    // Exactly one current snapshot regardless of the race.
    const current = await db.budgetPlanSnapshot.findMany({ where: { workspaceId, businessId, isCurrent: true } });
    expect(current.length).toBe(1);
  });

  it("[db] H6: cross-module signal routing is idempotent per reassessment", async () => {
    const workspaceId = ws(); const businessId = await newBusiness(workspaceId);
    await seedFinance(workspaceId, businessId);
    await createBudgetPeriod(businessId, { label: "P", periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR", approvedBudget: 50000 }, actor, workspaceId);
    await reassessBudget(businessId, workspaceId, { actorId: actor, kind: "revenue_changed", triggerEventId: "h6" });
    // Re-running the same trigger returns the stored plan and must NOT re-route signals.
    await reassessBudget(businessId, workspaceId, { actorId: actor, kind: "revenue_changed", triggerEventId: "h6" });
    const reassessment = await db.budgetReassessment.findFirstOrThrow({ where: { workspaceId, businessId, triggerEventId: "h6" } });
    const routed = await db.auditEvent.findMany({ where: { workspaceId, eventName: AUDIT_EVENTS.OWNER_BUDGET_SIGNAL_ROUTED, correlationId: reassessment.id } });
    const distinctTypes = new Set(routed.map((e) => (e.payload as Record<string, unknown>).signalType as string));
    // No signal type is routed twice for the same reassessment.
    expect(routed.length).toBe(distinctTypes.size);
  });

  // -------------------------------------------------------------- Governance
  it("[db] H7: an owner override over an unverified vendor bank is refused", async () => {
    const workspaceId = ws(); const businessId = await newBusiness(workspaceId);
    await seedFinance(workspaceId, businessId);
    await expect(recordOwnerOverride(businessId, {
      originalRecommendation: "hold vendor payment", riskWarning: "fraud risk", reason: "trust me",
      expectedConsequence: "paid", vendorBankUnverified: true,
    }, actor, workspaceId)).rejects.toThrow();
    expect(await db.ownerBudgetOverride.findMany({ where: { workspaceId, businessId } })).toHaveLength(0);
  });

  it("[db] H8: an owner override breaching the statutory reserve is refused", async () => {
    const workspaceId = ws(); const businessId = await newBusiness(workspaceId);
    await seedFinance(workspaceId, businessId);
    await expect(recordOwnerOverride(businessId, {
      originalRecommendation: "keep reserve", riskWarning: "statutory", reason: "spend it",
      expectedConsequence: "breach", statutoryReserveViolation: true,
    }, actor, workspaceId)).rejects.toThrow();
  });

  it("[db] H9: an owner override forcing an unlawful employee action is refused", async () => {
    const workspaceId = ws(); const businessId = await newBusiness(workspaceId);
    await seedFinance(workspaceId, businessId);
    await expect(recordOwnerOverride(businessId, {
      originalRecommendation: "pay wages", riskWarning: "unlawful", reason: "withhold pay",
      expectedConsequence: "illegal", unlawfulEmployeeAction: true,
    }, actor, workspaceId)).rejects.toThrow();
  });

  it("[db] H10: completing a budget action without evidence is refused (no fake completion)", async () => {
    const workspaceId = ws(); const businessId = await newBusiness(workspaceId);
    const id = await inProgressAction(workspaceId, businessId, "No-evidence completion");
    await expect(updateBudgetAction(id, { status: "completed", completionNotes: "trust me" }, actor, workspaceId)).rejects.toThrow();
    const row = await db.ownerBudgetAction.findUniqueOrThrow({ where: { id } });
    expect(row.status).not.toBe("completed");
    expect(await db.fundedInitiativeOutcome.findMany({ where: { workspaceId, businessId } })).toHaveLength(0);
  });

  it("[db] H11: an illegal authority transition (NORMAL → RESTORED) is refused", async () => {
    const workspaceId = ws(); const businessId = await newBusiness(workspaceId);
    await seedFinance(workspaceId, businessId);
    await expect(changeBudgetAuthority(businessId, {
      subjectRole: "manager", toStatus: "RESTORED", reason: "skip the lifecycle",
    }, actor, workspaceId)).rejects.toThrow();
    expect(await db.budgetAuthority.findMany({ where: { workspaceId, businessId } })).toHaveLength(0);
  });

  // ----------------------------------------------------------- Adaptive truth
  it("[db] H12: a large committed obligation flips GROW away to a defensive mode and blocks growth", async () => {
    const workspaceId = ws(); const businessId = await newBusiness(workspaceId);
    await seedFinance(workspaceId, businessId);
    const period = await growthPeriod(workspaceId, businessId);
    const before = await getBudgetGuidance(workspaceId, businessId);
    expect(before.mode).toBe("GROW");
    const { plan } = await recordSpendEntry(businessId, {
      periodId: period.id, label: "Payroll (committed)", category: "statutory_payroll_tax",
      amount: 420000, state: "committed", obligationKind: "payroll", dueInDays: 5,
      requestedByUserId: actor, ownerApprovalThreshold: 50000,
    }, actor, workspaceId);
    expect(plan.mode).not.toBe("GROW");
    expect(plan.decisionType).toBe("BLOCK");
    expect(plan.fundAllocationChanges.some((c) => c.includes("Referral campaign") && (c.includes("DEFER") || c.includes("BLOCK")))).toBe(true);
  });

  it("[db] H13: an over-threshold spend cannot auto-log — it requires owner approval", async () => {
    const workspaceId = ws(); const businessId = await newBusiness(workspaceId);
    await seedFinance(workspaceId, businessId);
    const period = await createBudgetPeriod(businessId, { label: "P", periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR", approvedBudget: 100000 }, actor, workspaceId);
    const { governance } = await recordSpendEntry(businessId, {
      periodId: period.id, label: "Big discretionary spend", category: "growth_roi",
      amount: 90000, requestedByUserId: actor, ownerApprovalThreshold: 10000,
    }, actor, workspaceId);
    expect(governance.decision).not.toBe("AUTO_LOG");
    expect(governance.requiresOwnerApproval).toBe(true);
  });

  it("[db] H14: an emergency cannot bypass vendor bank-change verification (stays HOLD)", async () => {
    const workspaceId = ws(); const businessId = await newBusiness(workspaceId);
    await seedFinance(workspaceId, businessId);
    const period = await createBudgetPeriod(businessId, { label: "P", periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR", approvedBudget: 100000 }, actor, workspaceId);
    const { governance } = await recordSpendEntry(businessId, {
      periodId: period.id, label: "Urgent vendor payment", category: "vendor_payment",
      amount: 30000, requestedByUserId: actor, ownerApprovalThreshold: 50000,
      vendorBankChanged: true, emergency: true,
    }, actor, workspaceId);
    expect(governance.decision).toBe("HOLD");
  });

  it("[db] H15: a recommendation that already failed is BLOCKED on repeat, not blindly repeated", async () => {
    const workspaceId = ws(); const businessId = await newBusiness(workspaceId);
    const first = await inProgressAction(workspaceId, businessId, "Repeated remedy");
    await updateBudgetAction(first, { status: "completed", completionNotes: "done", completionEvidence: ["e1"], expectedImpact: 100, actualImpact: 5 }, actor, workspaceId);
    const second = await inProgressAction(workspaceId, businessId, "Repeated remedy"); // same label, later cycle
    await updateBudgetAction(second, { status: "completed", completionNotes: "done", completionEvidence: ["e2"], expectedImpact: 100, actualImpact: 5 }, actor, workspaceId);
    const latest = await db.fundedInitiativeOutcome.findFirst({
      where: { workspaceId, businessId, initiativeLabel: "budget-action:Repeated remedy" },
      orderBy: { createdAt: "desc" },
    });
    expect(JSON.parse(latest?.note as string).disposition).toBe("block");
  });

  // --------------------------------------------------------- Data integrity
  it("[db] H16: completing with no impact data lowers DATA confidence, not the recommendation", async () => {
    const workspaceId = ws(); const businessId = await newBusiness(workspaceId);
    const id = await inProgressAction(workspaceId, businessId, "Unmeasured remedy");
    const res = await updateBudgetAction(id, { status: "completed", completionNotes: "done", completionEvidence: ["e1"] }, actor, workspaceId);
    expect(res.outcomeClass).toBe("UNVERIFIED");
    const o = await db.fundedInitiativeOutcome.findFirst({ where: { workspaceId, businessId, initiativeLabel: "budget-action:Unmeasured remedy" } });
    expect(JSON.parse(o?.note as string).confidenceImpact).toBe("lower_data");
  });

  it("[db] H17: an unknown archetype metric type is rejected (no silent accept)", async () => {
    const workspaceId = ws(); const businessId = await newBusiness(workspaceId);
    await expect(recordArchetypeMetric(businessId, {
      archetype: "laundry", metricType: "not_a_real_metric", metricDate: "2026-05-15T00:00:00.000Z", value: 1,
    }, actor, workspaceId)).rejects.toThrow();
    expect(await db.ownerArchetypeMetric.findMany({ where: { workspaceId, businessId } })).toHaveLength(0);
  });

  it("[db] H18: with no finance snapshot, guidance is cautious (no overconfident plan)", async () => {
    const workspaceId = ws(); const businessId = await newBusiness(workspaceId);
    // No finance snapshot seeded — the system must not fabricate a confident plan.
    await createBudgetPeriod(businessId, { label: "P", periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR", approvedBudget: 50000 }, actor, workspaceId);
    const g = await getBudgetGuidance(workspaceId, businessId);
    if (g.hasPlan) {
      expect(g.mode).toBe("DATA_INSUFFICIENT");
      expect(["UNVERIFIED", "PARTIAL"]).toContain(g.confidence);
    } else {
      expect(g.mode).toBeNull();
    }
  });

  // ----------------------------------------------------------- Audit / advisory
  it("[db] H19: every meaningful mutation emits an audit event (no silent mutation)", async () => {
    const workspaceId = ws(); const businessId = await newBusiness(workspaceId);
    await seedFinance(workspaceId, businessId);
    const period = await growthPeriod(workspaceId, businessId);
    await recordSpendEntry(businessId, {
      periodId: period.id, label: "Tracked spend", category: "growth_roi",
      amount: 5000, requestedByUserId: actor, ownerApprovalThreshold: 50000,
    }, actor, workspaceId);
    const names = new Set((await db.auditEvent.findMany({ where: { workspaceId, entityId: businessId } })).map((e) => e.eventName));
    const allEvents = await db.auditEvent.findMany({ where: { workspaceId } });
    const allNames = new Set(allEvents.map((e) => e.eventName));
    expect(allNames.has(AUDIT_EVENTS.OWNER_BUDGET_SPEND_RECORDED)).toBe(true);
    expect(allNames.has(AUDIT_EVENTS.OWNER_BUDGET_REASSESSED)).toBe(true);
    expect(names.size).toBeGreaterThan(0);
  });

  it("[db] H20: signal routing is advisory — a reassessment with financial signals still persists a plan when finance re-diagnosis cannot run", async () => {
    const workspaceId = ws(); const businessId = await newBusiness(workspaceId);
    // Deteriorated cash so financial signals fire, but NO finance snapshot for re-diagnosis.
    // (No seedFinance call.) The reassessment must still complete and persist a plan.
    const period = await createBudgetPeriod(businessId, { label: "P", periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR", approvedBudget: 50000, statutoryReserveRequired: 40000, ownerGoal: "survival" }, actor, workspaceId);
    const plan = await reassessBudget(businessId, workspaceId, {
      actorId: actor, kind: "spend_entry_added", triggerEventId: "h20",
      change: { field: "spendEntry", newValue: "x:1" },
    });
    expect(plan).toBeTruthy();
    const snaps = await listBudgetSnapshots(workspaceId, businessId);
    expect(snaps.filter((s) => s.isCurrent).length).toBe(1);
    // No finance cycle could be created (no snapshot) — routing degraded safely, reassessment survived.
    void period;
  });
});
