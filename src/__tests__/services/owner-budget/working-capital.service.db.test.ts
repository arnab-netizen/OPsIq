/**
 * Working-Capital Ageing service — DB-backed proof.
 *
 * `[db]`-gated → runs only under TEST_WITH_DB=true against migrated PostgreSQL.
 * Proves: workspace-scoped persistence + isolation; cross-workspace reads/writes
 * blocked; and that ageing items feed the EXISTING Dynamic Budget reassessment
 * (overdue payables flip mode away from GROW + emit ageing signals; 90+ receivables
 * trigger collection-first; profitable-but-cash-negative is surfaced; missing due
 * dates downgrade confidence) WITHOUT a second reassessment engine. Includes a
 * regression case proving no working-capital items ⇒ unchanged behaviour.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/owner-budget/working-capital.service.db.test.ts
 */
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { createBudgetPeriod, addBudgetLine, reassessBudget } from "@/services/owner-budget/budget.service";
import { recordWorkingCapitalItem, listWorkingCapitalItems } from "@/services/owner-budget/working-capital.service";
import { seedKnownBank } from "../../test-helpers/seed-known-bank";

const actor = randomUUID();
const ws = () => randomUUID();
const businessIds: string[] = [];
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `wc-test-${actor}@example.com`, name: "WC Test", isActive: true, updatedAt: new Date() },
  });
});

afterEach(async () => {
  for (const id of businessIds.splice(0)) {
    await db.ownerBusiness.delete({ where: { id } }).catch(() => undefined);
  }
});

async function newBusiness(workspaceId: string) {
  const b = await createBusiness(
    { name: "WC Biz", businessType: "generic_local_service", currency: "INR", b2cSupported: true, b2bSupported: true },
    actor, workspaceId
  );
  businessIds.push(b.id);
  return b.id;
}

async function seedFinance(workspaceId: string, businessId: string, cashOnHand: number) {
  await db.ownerFinancialSnapshot.create({
    data: {
      id: randomUUID(), workspaceId, businessId,
      periodStart: new Date("2026-05-01"), periodEnd: new Date("2026-05-31"), currency: "INR",
      revenue: 500000, costOfGoods: 250000, fixedCosts: 150000, cashOnHand,
      dataConfidenceScore: 80, missingCriticalData: [], updatedAt: new Date(),
    },
  });
  await seedKnownBank(workspaceId, businessId);
}

/** Healthy finance + a growth line ⇒ baseline classifies GROW. */
async function seedGrowBaseline(workspaceId: string, businessId: string) {
  const period = await createBudgetPeriod(
    businessId,
    { label: "May", periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR", approvedBudget: 100000, statutoryReserveRequired: 50000, ownerGoal: "growth" },
    actor, workspaceId
  );
  const plan = await addBudgetLine(
    businessId,
    { periodId: period.id, label: "Referral campaign", category: "growth_roi", plannedAmount: 20000, ownerRole: "manager" },
    actor, workspaceId
  );
  return { period, plan };
}

describe("[db] Working-Capital Ageing service", () => {
  it("[db] persists items workspace-scoped and a foreign workspace cannot read them", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    await recordWorkingCapitalItem(businessId, { kind: "receivable", counterparty: "Acme", amount: 5000, dueDate: daysAgo(120) }, actor, workspaceId);

    const own = await listWorkingCapitalItems(workspaceId, businessId);
    expect(own.length).toBe(1);
    expect(own[0].workspaceId).toBe(workspaceId);

    // Foreign workspace cannot read this business's items (ownership guard throws).
    await expect(listWorkingCapitalItems(ws(), businessId)).rejects.toThrow();
    // And nothing leaks under a foreign workspace scope.
    expect(await db.ownerWorkingCapitalItem.findMany({ where: { workspaceId: ws() } })).toHaveLength(0);
  });

  it("[db] cross-workspace writes are blocked", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    await expect(
      recordWorkingCapitalItem(businessId, { kind: "payable", counterparty: "V", amount: 1000, dueDate: daysAgo(10) }, actor, ws())
    ).rejects.toThrow();
    expect(await db.ownerWorkingCapitalItem.findMany({ where: { businessId } })).toHaveLength(0);
  });

  it("[db] a recorded item emits an audit event and is labelled manual (never live-feed/verified)", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    const item = await recordWorkingCapitalItem(businessId, { kind: "receivable", counterparty: "Acme", amount: 5000, dueDate: daysAgo(10) }, actor, workspaceId);
    expect(item.sourceType).toBe("MANUAL");
    expect(item.confidenceState).toBe("unverified");
    const audit = await db.auditEvent.findMany({ where: { workspaceId, entityType: "OwnerWorkingCapitalItem" } });
    expect(audit.some((e) => e.eventName === "owner.budget_working_capital_item_recorded")).toBe(true);
  });

  it("[db] severe overdue payables flip GROW → defensive and emit ageing signals through real reassessment", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    await seedFinance(workspaceId, businessId, 400000);
    const { plan: growthPlan } = await seedGrowBaseline(workspaceId, businessId);
    expect(growthPlan.mode).toBe("GROW");

    // 90+ overdue payables that exceed free cash after reserve.
    await recordWorkingCapitalItem(businessId, { kind: "payable", counterparty: "Supplier", amount: 380000, dueDate: daysAgo(120) }, actor, workspaceId);
    // A 90+ overdue receivable → collection-first.
    await recordWorkingCapitalItem(businessId, { kind: "receivable", counterparty: "BigClient", amount: 120000, dueDate: daysAgo(100) }, actor, workspaceId);

    const updated = await reassessBudget(businessId, workspaceId, { actorId: actor, kind: "manual_review", triggerEventId: "wc-1" });

    expect(updated.mode).not.toBe("GROW"); // working-capital pressure shifted the mode
    const sigTypes = updated.signals.map((s) => s.type);
    expect(sigTypes).toContain("payables_ageing_risk");
    expect(sigTypes).toContain("vendor_pressure_risk");
    expect(sigTypes).toContain("receivables_ageing_risk");
    expect(sigTypes).toContain("collection_first_required");
    expect(sigTypes).toContain("growth_blocked_by_working_capital");
    // A collection-first / vendor-negotiation action is generated.
    expect(updated.generatedActions.some((a) => /collection-first/i.test(a.title))).toBe(true);
    expect(updated.generatedActions.some((a) => /payables/i.test(a.title))).toBe(true);
    // Restriction explains the block.
    expect(updated.spendRestrictions.some((r) => /growth/i.test(r) && /collection|reserve/i.test(r))).toBe(true);
  });

  it("[db] profitable but cash-trapped business surfaces profitable_but_cash_negative", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    await seedFinance(workspaceId, businessId, 40000); // low cash, below reserve target
    await createBudgetPeriod(
      businessId,
      { label: "May", periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR", approvedBudget: 50000, statutoryReserveRequired: 50000, ownerGoal: "growth" },
      actor, workspaceId
    );
    // Profitable on the books (revenue 500k > costs 400k) but cash trapped in overdue B2B receivable.
    await recordWorkingCapitalItem(businessId, { kind: "receivable", counterparty: "B2BClient", amount: 200000, dueDate: daysAgo(50) }, actor, workspaceId);

    const updated = await reassessBudget(businessId, workspaceId, { actorId: actor, kind: "manual_review", triggerEventId: "wc-2" });
    const sigTypes = updated.signals.map((s) => s.type);
    expect(sigTypes).toContain("profitable_but_cash_negative");
    expect(sigTypes).toContain("cash_conversion_risk");
    expect(updated.whatNotToDo.some((w) => /profit is not free cash|trapped/i.test(w))).toBe(true);
  });

  it("[db] missing due dates downgrade ageing confidence (data-insufficient signal)", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    await seedFinance(workspaceId, businessId, 400000);
    await seedGrowBaseline(workspaceId, businessId);
    await recordWorkingCapitalItem(businessId, { kind: "receivable", counterparty: "NoDate", amount: 100000, dueDate: null }, actor, workspaceId);

    const updated = await reassessBudget(businessId, workspaceId, { actorId: actor, kind: "manual_review", triggerEventId: "wc-3" });
    expect(updated.signals.map((s) => s.type)).toContain("working_capital_data_insufficient");
  });

  it("[db] REGRESSION: with no working-capital items, reassessment behaviour is unchanged (stays GROW, no ageing signals)", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    await seedFinance(workspaceId, businessId, 400000);
    await seedGrowBaseline(workspaceId, businessId);

    const updated = await reassessBudget(businessId, workspaceId, { actorId: actor, kind: "manual_review", triggerEventId: "wc-4" });
    expect(updated.mode).toBe("GROW");
    const sigTypes = updated.signals.map((s) => s.type);
    for (const ageingSig of [
      "receivables_ageing_risk", "payables_ageing_risk", "collection_first_required",
      "vendor_pressure_risk", "profitable_but_cash_negative", "growth_blocked_by_working_capital",
    ]) {
      expect(sigTypes).not.toContain(ageingSig);
    }
  });
});
