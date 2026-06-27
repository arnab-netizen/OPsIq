/**
 * Archetype Operational Metrics service — DB-backed proof.
 *
 * `[db]`-gated → runs only under TEST_WITH_DB=true against migrated PostgreSQL.
 * Proves: workspace-scoped persistence + isolation; cross-workspace reads/writes blocked;
 * malformed metric rejected; and that persisted metrics feed the archetype packs through
 * the REAL reassessment (laundry chemical/B2B/downtime guidance; housekeeping travel/
 * recurring guidance), with honest data-insufficient/stale fallbacks. No second engine.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/owner-budget/archetype-metrics.service.db.test.ts
 */
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { createBudgetPeriod, addBudgetLine, reassessBudget } from "@/services/owner-budget/budget.service";
import { recordArchetypeMetric, listArchetypeMetrics } from "@/services/owner-budget/archetype-metrics.service";

const actor = randomUUID();
const ws = () => randomUUID();
const businessIds: string[] = [];
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `am-test-${actor}@example.com`, name: "AM Test", isActive: true, updatedAt: new Date() },
  });
});

afterEach(async () => {
  for (const id of businessIds.splice(0)) {
    await db.ownerBusiness.delete({ where: { id } }).catch(() => undefined);
  }
});

async function newBusiness(workspaceId: string, businessType = "laundry_dry_cleaning") {
  const b = await createBusiness(
    { name: "AM Biz", businessType, currency: "INR", b2cSupported: true, b2bSupported: true },
    actor, workspaceId
  );
  businessIds.push(b.id);
  return b.id;
}

async function seedFinance(workspaceId: string, businessId: string, industryTemplate: string) {
  await db.ownerFinancialSnapshot.create({
    data: {
      id: randomUUID(), workspaceId, businessId,
      periodStart: new Date("2026-05-01"), periodEnd: new Date("2026-05-31"), currency: "INR",
      revenue: 800000, costOfGoods: 300000, fixedCosts: 200000, cashOnHand: 500000,
      industryTemplate, dataConfidenceScore: 80, missingCriticalData: [], updatedAt: new Date(),
    },
  });
}

async function growPeriod(workspaceId: string, businessId: string) {
  const period = await createBudgetPeriod(
    businessId,
    { label: "May", periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR", approvedBudget: 100000, statutoryReserveRequired: 50000, ownerGoal: "growth" },
    actor, workspaceId
  );
  await addBudgetLine(businessId, { periodId: period.id, label: "Referral campaign", category: "growth_roi", plannedAmount: 20000, ownerRole: "manager" }, actor, workspaceId);
}

describe("[db] Archetype Operational Metrics service", () => {
  it("[db] persists metrics workspace-scoped; foreign workspace cannot read them", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    await recordArchetypeMetric(businessId, { archetype: "laundry", metricType: "chemical_cost", metricDate: daysAgo(1), value: 60000 }, actor, workspaceId);
    expect((await listArchetypeMetrics(workspaceId, businessId)).length).toBe(1);
    await expect(listArchetypeMetrics(ws(), businessId)).rejects.toThrow();
    expect(await db.ownerArchetypeMetric.findMany({ where: { workspaceId: ws() } })).toHaveLength(0);
  });

  it("[db] cross-workspace writes are blocked", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    await expect(
      recordArchetypeMetric(businessId, { archetype: "laundry", metricType: "chemical_cost", metricDate: daysAgo(1), value: 1 }, actor, ws())
    ).rejects.toThrow();
    expect(await db.ownerArchetypeMetric.findMany({ where: { businessId } })).toHaveLength(0);
  });

  it("[db] malformed metric type is rejected; recorded metric is audited + manual-labelled", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId);
    await expect(
      recordArchetypeMetric(businessId, { archetype: "laundry", metricType: "totally_made_up", metricDate: daysAgo(1), value: 1 }, actor, workspaceId)
    ).rejects.toThrow();
    const m = await recordArchetypeMetric(businessId, { archetype: "laundry", metricType: "machine_downtime_hours", metricDate: daysAgo(1), value: 12 }, actor, workspaceId);
    expect(m.sourceType).toBe("MANUAL");
    expect(m.confidenceState).toBe("unverified");
    const audit = await db.auditEvent.findMany({ where: { workspaceId, entityType: "OwnerArchetypeMetric" } });
    expect(audit.some((e) => e.eventName === "owner.budget_archetype_metric_recorded")).toBe(true);
  });

  it("[db] persisted laundry chemical/load + B2B + downtime metrics drive archetype guidance through reassessment", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId, "laundry_dry_cleaning");
    await seedFinance(workspaceId, businessId, "laundry");
    await growPeriod(workspaceId, businessId);
    await recordArchetypeMetric(businessId, { archetype: "laundry", metricType: "chemical_cost", metricDate: daysAgo(1), value: 60000 }, actor, workspaceId);
    await recordArchetypeMetric(businessId, { archetype: "laundry", metricType: "order_count", metricDate: daysAgo(1), value: 1000 }, actor, workspaceId);
    await recordArchetypeMetric(businessId, { archetype: "laundry", metricType: "chemical_cost_baseline_per_order", metricDate: daysAgo(1), value: 40 }, actor, workspaceId);
    await recordArchetypeMetric(businessId, { archetype: "laundry", metricType: "b2b_contribution_margin_pct", metricDate: daysAgo(1), value: 4 }, actor, workspaceId);
    await recordArchetypeMetric(businessId, { archetype: "laundry", metricType: "machine_downtime_hours", metricDate: daysAgo(1), value: 12 }, actor, workspaceId);

    const plan = await reassessBudget(businessId, workspaceId, { actorId: actor, kind: "manual_review", triggerEventId: "am-1" });
    const sigs = plan.signals.map((s) => s.type);
    expect(sigs).toContain("laundry_consumable_leakage");     // chemical cost per order > baseline
    expect(sigs).toContain("laundry_b2b_margin_risk");        // B2B margin < 10
    expect(sigs).toContain("laundry_machine_downtime_risk");  // downtime > 0
    expect(sigs).not.toContain("archetype_data_insufficient"); // metrics present
  });

  it("[db] persisted housekeeping travel + recurring metrics drive route/repricing guidance through reassessment", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId, "housekeeping");
    await seedFinance(workspaceId, businessId, "housekeeping");
    await growPeriod(workspaceId, businessId);
    await recordArchetypeMetric(businessId, { archetype: "housekeeping", metricType: "travel_time_share_pct", metricDate: daysAgo(1), value: 35 }, actor, workspaceId);
    await recordArchetypeMetric(businessId, { archetype: "housekeeping", metricType: "recurring_contract_margin_pct", metricDate: daysAgo(1), value: 6 }, actor, workspaceId);

    const plan = await reassessBudget(businessId, workspaceId, { actorId: actor, kind: "manual_review", triggerEventId: "am-2" });
    const sigs = plan.signals.map((s) => s.type);
    expect(sigs).toContain("housekeeping_travel_inefficiency");
    expect(sigs).toContain("housekeeping_contract_underpriced");
  });

  it("[db] missing metrics ⇒ honest archetype_data_insufficient (working-capital risk not suppressed)", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId, "laundry_dry_cleaning");
    await seedFinance(workspaceId, businessId, "laundry");
    await growPeriod(workspaceId, businessId);
    const plan = await reassessBudget(businessId, workspaceId, { actorId: actor, kind: "manual_review", triggerEventId: "am-3" });
    expect(plan.signals.map((s) => s.type)).toContain("archetype_data_insufficient");
  });

  it("[db] stale metrics are excluded ⇒ archetype_data_insufficient (confidence not inflated)", async () => {
    const workspaceId = ws();
    const businessId = await newBusiness(workspaceId, "laundry_dry_cleaning");
    await seedFinance(workspaceId, businessId, "laundry");
    await growPeriod(workspaceId, businessId);
    await recordArchetypeMetric(businessId, { archetype: "laundry", metricType: "machine_downtime_hours", metricDate: daysAgo(120), value: 12 }, actor, workspaceId);
    const plan = await reassessBudget(businessId, workspaceId, { actorId: actor, kind: "manual_review", triggerEventId: "am-4" });
    const sigs = plan.signals.map((s) => s.type);
    expect(sigs).toContain("archetype_data_insufficient");
    expect(sigs).not.toContain("laundry_machine_downtime_risk"); // stale value excluded
  });
});
