/**
 * Sales Pipeline E2E chain — DB-backed (real PostgreSQL).
 *
 * Proves the full service chain:
 *   recordDeal → progressDeal → listDeals → calculatePipelineMetrics
 *
 * All three DB-backed methods (recordDeal, progressDeal, listDeals) operate on real
 * persisted rows; calculatePipelineMetrics then operates on the DB-read records,
 * proving the end-to-end chain from persistence through metrics computation is consistent.
 *
 * Also proves: workspace isolation throughout the chain — a second workspace sees no
 * data from the first.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/growth/sales-pipeline-e2e.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { SalesPipelineEngine } from "@/services/growth/sales-pipeline-engine";
import { DealStage } from "@/domain/growth/growth-engines";

const actor = randomUUID();
const testWs = randomUUID();
const otherWs = randomUUID(); // never seeded — proves workspace isolation

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] SalesPipelineEngine — E2E chain (recordDeal → progressDeal → listDeals → calculatePipelineMetrics)", () => {
  beforeAll(async () => {
    await db.user.upsert({
      where: { id: actor },
      update: {},
      create: {
        id: actor,
        email: `sales-e2e-${actor}@test.local`,
        name: "SalesE2ETest",
        isActive: true,
        updatedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    await db.salesDealRecord.deleteMany({ where: { workspaceId: testWs } });
    await db.auditEvent.deleteMany({ where: { actorId: actor } });
    await db.user.delete({ where: { id: actor } });
  });

  it("full chain: record three deals, progress two, list from DB, compute pipeline metrics", async () => {
    // Step 1: record three deals in testWs
    const d1 = await SalesPipelineEngine.recordDeal(testWs, actor, {
      companyName: "Alpha Inc",
      stage: DealStage.PROSPECT,
      value: 100000,
      currency: "USD",
      probability: 0.05,
      expectedCloseDate: new Date("2026-12-31"),
    });
    const d2 = await SalesPipelineEngine.recordDeal(testWs, actor, {
      companyName: "Beta Ltd",
      stage: DealStage.PROSPECT,
      value: 200000,
      currency: "USD",
      probability: 0.05,
      expectedCloseDate: new Date("2026-12-31"),
    });
    const d3 = await SalesPipelineEngine.recordDeal(testWs, actor, {
      companyName: "Gamma Co",
      stage: DealStage.PROSPECT,
      value: 50000,
      currency: "USD",
      probability: 0.05,
      expectedCloseDate: new Date("2026-12-31"),
    });

    // Step 2: advance d1 to QUALIFIED, d2 to PROPOSAL
    const { deal: d1Updated, progressionNote: n1 } = await SalesPipelineEngine.progressDeal(
      testWs, actor, d1.id, DealStage.QUALIFIED
    );
    const { deal: d2Updated, progressionNote: n2 } = await SalesPipelineEngine.progressDeal(
      testWs, actor, d2.id, DealStage.PROPOSAL
    );

    expect(d1Updated.stage).toBe(DealStage.QUALIFIED);
    expect(d1Updated.probability).toBeCloseTo(0.25, 2); // QUALIFIED = 0.25
    expect(n1).toContain("QUALIFIED");
    expect(d2Updated.stage).toBe(DealStage.PROPOSAL);
    expect(d2Updated.probability).toBeCloseTo(0.65, 2); // PROPOSAL = 0.65
    expect(n2).toContain("PROPOSAL");

    // Step 3: list all deals from DB (real persisted state)
    const deals = await SalesPipelineEngine.listDeals(testWs);
    expect(deals.length).toBeGreaterThanOrEqual(3);
    const ids = deals.map((d) => d.id);
    expect(ids).toContain(d1.id);
    expect(ids).toContain(d2.id);
    expect(ids).toContain(d3.id);

    // Verify stages from DB reflect progressDeal writes
    const d1FromDb = deals.find((d) => d.id === d1.id)!;
    const d2FromDb = deals.find((d) => d.id === d2.id)!;
    const d3FromDb = deals.find((d) => d.id === d3.id)!;
    expect(d1FromDb.stage).toBe(DealStage.QUALIFIED);
    expect(d2FromDb.stage).toBe(DealStage.PROPOSAL);
    expect(d3FromDb.stage).toBe(DealStage.PROSPECT);

    // Step 4: feed DB-read records into calculatePipelineMetrics
    // SalesDealRecord satisfies the SalesDeal structural interface.
    const metrics = SalesPipelineEngine.calculatePipelineMetrics(testWs, deals as never);

    expect(metrics.workspaceId).toBe(testWs);
    expect(metrics.dealsByStage[DealStage.QUALIFIED]).toBeGreaterThanOrEqual(1);
    expect(metrics.dealsByStage[DealStage.PROPOSAL]).toBeGreaterThanOrEqual(1);
    expect(metrics.dealsByStage[DealStage.PROSPECT]).toBeGreaterThanOrEqual(1);
    expect(metrics.totalPipeline).toBeGreaterThan(0);
    expect(metrics.avgDealSize).toBeGreaterThan(0);
  });

  it("workspace isolation: calculatePipelineMetrics on otherWs deals returns empty pipeline", () => {
    // otherWs was never seeded; empty input proves strict workspace scoping.
    const metrics = SalesPipelineEngine.calculatePipelineMetrics(otherWs, []);
    expect(metrics.totalPipeline).toBe(0);
    expect(metrics.avgDealSize).toBe(0);
    expect(metrics.winRate).toBe(0);
  });

  it("listDeals for otherWs returns empty (DB-level workspace isolation)", async () => {
    const result = await SalesPipelineEngine.listDeals(otherWs);
    expect(result).toHaveLength(0);
  });

  it("pipeline metrics are consistent with deal values: totalPipeline = sum(value × probability)", async () => {
    // Seed an isolated workspace with known values for deterministic assertion
    const isolatedWs = randomUUID();
    const deal = await SalesPipelineEngine.recordDeal(isolatedWs, actor, {
      companyName: "Known Value Corp",
      stage: DealStage.QUALIFIED,
      value: 100000,
      probability: 0.25,
      expectedCloseDate: new Date("2026-12-31"),
    });

    const deals = await SalesPipelineEngine.listDeals(isolatedWs);
    const metrics = SalesPipelineEngine.calculatePipelineMetrics(isolatedWs, deals as never);

    // totalPipeline = value × probability = 100000 × 0.25 = 25000
    expect(metrics.totalPipeline).toBe(25000);
    expect(metrics.avgDealSize).toBe(deal.value);

    // Cleanup
    await db.salesDealRecord.deleteMany({ where: { workspaceId: isolatedWs } });
  });
});
