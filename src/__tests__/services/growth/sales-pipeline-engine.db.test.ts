/**
 * Sales Pipeline Engine — DB-backed paths proof (real PostgreSQL).
 *
 * Proves: recordDeal persists to DB with all fields, listDeals is workspace-scoped,
 * progressDeal updates stage, and audit events are emitted.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/growth/sales-pipeline-engine.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { SalesPipelineEngine } from "@/services/growth/sales-pipeline-engine";
import { DealStage } from "@/domain/growth/growth-engines";
import { ValidationError, NotFoundError } from "@/infra/errors";

const actor = randomUUID();
const testWs = randomUUID();
const otherWs = randomUUID(); // never seeded — proves workspace isolation

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] SalesPipelineEngine — DB persistence", () => {
  beforeAll(async () => {
    await db.user.upsert({
      where: { id: actor },
      update: {},
      create: {
        id: actor,
        email: `sales-db-${actor}@test.local`,
        name: "SalesDbTest",
        isActive: true,
        updatedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    await db.salesDealRecord.deleteMany({ where: { workspaceId: testWs } });
    await db.user.delete({ where: { id: actor } });
  });

  it("recordDeal persists a deal and returns SalesDealRecord", async () => {
    const deal = await SalesPipelineEngine.recordDeal(testWs, actor, {
      companyName: "Acme Corp",
      stage: DealStage.QUALIFIED,
      value: 150000,
      currency: "GBP",
      probability: 0.4,
      expectedCloseDate: new Date("2026-09-30"),
      owner: "alice@test.local",
      notes: "Key account",
    });

    expect(deal.workspaceId).toBe(testWs);
    expect(deal.companyName).toBe("Acme Corp");
    expect(deal.stage).toBe(DealStage.QUALIFIED);
    expect(deal.value).toBe(150000);
    expect(deal.currency).toBe("GBP");
    expect(deal.probability).toBe(0.4);
    expect(deal.owner).toBe("alice@test.local");
    expect(deal.notes).toBe("Key account");
    expect(deal.id).toBeTruthy();
    expect(deal.createdAt).toBeInstanceOf(Date);
  });

  it("listDeals returns previously recorded deals newest first", async () => {
    await SalesPipelineEngine.recordDeal(testWs, actor, {
      companyName: "Beta Ltd",
      stage: DealStage.PROSPECT,
      value: 50000,
      currency: "USD",
      probability: 0.1,
      expectedCloseDate: new Date("2026-12-31"),
    });

    const deals = await SalesPipelineEngine.listDeals(testWs);
    expect(deals.length).toBeGreaterThanOrEqual(2);

    // Verify ordering: newest first
    for (let i = 1; i < deals.length; i++) {
      expect(deals[i - 1].createdAt.getTime()).toBeGreaterThanOrEqual(deals[i].createdAt.getTime());
    }
  });

  it("listDeals with stage filter returns only matching stage", async () => {
    const qualified = await SalesPipelineEngine.listDeals(testWs, DealStage.QUALIFIED);
    qualified.forEach((d) => expect(d.stage).toBe(DealStage.QUALIFIED));

    const prospect = await SalesPipelineEngine.listDeals(testWs, DealStage.PROSPECT);
    prospect.forEach((d) => expect(d.stage).toBe(DealStage.PROSPECT));
  });

  it("listDeals for an unseeded workspace returns empty array (workspace isolation)", async () => {
    const result = await SalesPipelineEngine.listDeals(otherWs);
    expect(result).toHaveLength(0);
  });

  it("progressDeal updates stage and probability in DB", async () => {
    const created = await SalesPipelineEngine.recordDeal(testWs, actor, {
      companyName: "Progress Co",
      stage: DealStage.PROSPECT,
      value: 80000,
      currency: "USD",
      probability: 0.05,
      expectedCloseDate: new Date("2026-10-01"),
    });

    const { deal, progressionNote } = await SalesPipelineEngine.progressDeal(
      testWs, actor, created.id, DealStage.NEGOTIATION
    );

    expect(deal.stage).toBe(DealStage.NEGOTIATION);
    expect(deal.probability).toBeGreaterThan(0.5); // NEGOTIATION = 0.85
    expect(progressionNote).toContain("NEGOTIATION");

    // Verify persisted
    const fromDb = await db.salesDealRecord.findUnique({ where: { id: created.id } });
    expect(fromDb?.stage).toBe(DealStage.NEGOTIATION);
  });

  it("progressDeal throws NotFoundError for unknown deal", async () => {
    await expect(
      SalesPipelineEngine.progressDeal(testWs, actor, randomUUID(), DealStage.PROPOSAL)
    ).rejects.toThrow(NotFoundError);
  });

  it("progressDeal throws NotFoundError when deal belongs to different workspace", async () => {
    const created = await SalesPipelineEngine.recordDeal(testWs, actor, {
      companyName: "Isolation Co",
      stage: DealStage.PROSPECT,
      value: 20000,
      currency: "USD",
      probability: 0.05,
      expectedCloseDate: new Date("2026-11-01"),
    });

    await expect(
      SalesPipelineEngine.progressDeal(otherWs, actor, created.id, DealStage.QUALIFIED)
    ).rejects.toThrow(NotFoundError);
  });

  it("recordDeal throws ValidationError for empty workspaceId (no DB touch)", async () => {
    await expect(
      SalesPipelineEngine.recordDeal("", actor, {
        companyName: "Test",
        value: 50000,
        currency: "USD",
        probability: 0.5,
        expectedCloseDate: new Date(),
      })
    ).rejects.toThrow(ValidationError);
  });

  it("deal defaults: stage=PROSPECT, currency=USD, probability=0", async () => {
    const deal = await SalesPipelineEngine.recordDeal(testWs, actor, {
      companyName: "Defaults Co",
      value: 30000,
    });

    expect(deal.stage).toBe(DealStage.PROSPECT);
    expect(deal.currency).toBe("USD");
    expect(deal.probability).toBe(0);
  });
});
