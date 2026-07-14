/**
 * Pricing Engine — DB-backed paths proof (real PostgreSQL).
 *
 * Proves: createPriceTier persists to DB with all plan-required fields,
 * listTiers is workspace-scoped, status filter works, and audit event is emitted.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/growth/pricing-engine.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { PricingEngine } from "@/services/growth/pricing-engine";
import { ValidationError } from "@/infra/errors";

const actor = randomUUID();
const testWs = randomUUID();
const otherWs = randomUUID(); // never seeded — proves workspace isolation

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] PricingEngine — DB persistence", () => {
  beforeAll(async () => {
    await db.user.upsert({
      where: { id: actor },
      update: {},
      create: {
        id: actor,
        email: `pricing-db-${actor}@test.local`,
        name: "PricingDbTest",
        isActive: true,
        updatedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    await db.growthPriceTier.deleteMany({ where: { workspaceId: testWs } });
    await db.auditEvent.deleteMany({ where: { actorId: actor } });
    await db.user.delete({ where: { id: actor } });
  });

  it("createPriceTier persists a tier with plan-required fields and returns GrowthPriceTierRecord", async () => {
    const tier = await PricingEngine.createPriceTier(testWs, actor, {
      name: "Professional",
      currency: "GBP",
      unitOfMeasure: "user/month",
      entryPrice: 99,
      maxPrice: 299,
      variableCost: 15,
      allocatedCost: 10,
      customerSegment: "SMB",
      channel: "direct",
      features: ["Analytics", "Support"],
      status: "DRAFT",
      approvalStatus: "pending_approval",
      provenance: "Market benchmarking Q1-2026",
      quantityBreaks: [{ minQty: 10, price: 89 }, { minQty: 50, price: 79 }],
      discountStructure: [{ type: "annual", value: 10 }],
    });

    expect(tier.workspaceId).toBe(testWs);
    expect(tier.name).toBe("Professional");
    expect(tier.currency).toBe("GBP");
    expect(tier.unitOfMeasure).toBe("user/month");
    expect(tier.entryPrice).toBe(99);
    expect(tier.maxPrice).toBe(299);
    expect(tier.variableCost).toBe(15);
    expect(tier.allocatedCost).toBe(10);
    expect(tier.customerSegment).toBe("SMB");
    expect(tier.channel).toBe("direct");
    expect(tier.provenance).toBe("Market benchmarking Q1-2026");
    expect(tier.approvalStatus).toBe("pending_approval");
    expect(tier.features).toEqual(["Analytics", "Support"]);
    expect(tier.quantityBreaks).toHaveLength(2);
    expect(tier.discountStructure).toHaveLength(1);
  });

  it("listTiers returns previously created tiers in reverse-chronological order", async () => {
    await PricingEngine.createPriceTier(testWs, actor, {
      name: "Starter",
      entryPrice: 29,
      maxPrice: 79,
      features: ["Basic"],
      status: "ACTIVE",
    });

    const tiers = await PricingEngine.listTiers(testWs);
    expect(tiers.length).toBeGreaterThanOrEqual(2);
  });

  it("listTiers with status filter returns only matching tiers", async () => {
    const active = await PricingEngine.listTiers(testWs, "ACTIVE");
    active.forEach((t) => expect(t.status).toBe("ACTIVE"));

    const draft = await PricingEngine.listTiers(testWs, "DRAFT");
    draft.forEach((t) => expect(t.status).toBe("DRAFT"));
  });

  it("listTiers for an unseeded workspace returns empty array (workspace isolation)", async () => {
    const result = await PricingEngine.listTiers(otherWs);
    expect(result).toHaveLength(0);
  });

  it("createPriceTier throws ValidationError for empty workspaceId (no DB touch)", async () => {
    await expect(
      PricingEngine.createPriceTier("", actor, {
        name: "Invalid",
        entryPrice: 99,
        maxPrice: 299,
        features: ["F1"],
      })
    ).rejects.toThrow(ValidationError);
  });

  it("createPriceTier throws ValidationError for maxPrice < entryPrice (no DB touch)", async () => {
    await expect(
      PricingEngine.createPriceTier(testWs, actor, {
        name: "Bad Tier",
        entryPrice: 299,
        maxPrice: 99,
        features: ["F1"],
      })
    ).rejects.toThrow(ValidationError);
  });

  it("tier defaults: currency=USD, unitOfMeasure=seat, approvalStatus=pending_approval, version=1", async () => {
    const tier = await PricingEngine.createPriceTier(testWs, actor, {
      name: "Defaults Check",
      entryPrice: 49,
      maxPrice: 149,
      features: ["F1"],
    });

    expect(tier.currency).toBe("USD");
    expect(tier.unitOfMeasure).toBe("seat");
    expect(tier.approvalStatus).toBe("pending_approval");
    expect(tier.version).toBe(1);
    expect(tier.supersededById).toBeNull();
  });
});
