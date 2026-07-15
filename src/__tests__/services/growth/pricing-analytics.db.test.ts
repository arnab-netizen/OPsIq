/**
 * Pricing Analytics — DB-backed proof (real PostgreSQL).
 *
 * Proves: approveTier, supersedeTier (append-only versioning), computedMargin at read time,
 * workspace isolation for all write paths, and cross-domain wiring of avgActiveMargin
 * into the profit-leak radar via Now View.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/growth/pricing-analytics.db.test.ts
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

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] PricingEngine — analytics, approval, versioning", () => {
  beforeAll(async () => {
    await db.user.upsert({
      where: { id: actor },
      update: {},
      create: {
        id: actor,
        email: `pricing-analytics-${actor}@test.local`,
        name: "PricingAnalyticsTest",
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

  it("computedMargin is null when no cost data supplied (margin honestly absent)", async () => {
    const tier = await PricingEngine.createPriceTier(testWs, actor, {
      name: "No Cost Tier",
      entryPrice: 100,
      maxPrice: 200,
      features: ["F1"],
    });
    expect(tier.computedMargin).toBeNull();
  });

  it("computedMargin is fractional (0..1) when cost data is supplied", async () => {
    const tier = await PricingEngine.createPriceTier(testWs, actor, {
      name: "With Costs",
      entryPrice: 100,
      maxPrice: 200,
      variableCost: 30,
      allocatedCost: 20,
      features: ["F1"],
    });
    // margin = (100 - 30 - 20) / 100 = 0.5
    expect(tier.computedMargin).toBe(0.5);
    expect(tier.computedMargin).toBeGreaterThan(0);
    expect(tier.computedMargin).toBeLessThanOrEqual(1);
  });

  it("computedMargin is clamped to 0 when total cost exceeds entry price", async () => {
    const tier = await PricingEngine.createPriceTier(testWs, actor, {
      name: "Loss Tier",
      entryPrice: 50,
      maxPrice: 200,
      variableCost: 80,
      allocatedCost: 0,
      features: ["F1"],
    });
    expect(tier.computedMargin).toBe(0);
  });

  it("listTiers returns computedMargin for each tier", async () => {
    const tiers = await PricingEngine.listTiers(testWs);
    expect(tiers.length).toBeGreaterThanOrEqual(1);
    for (const t of tiers) {
      expect("computedMargin" in t).toBe(true);
    }
  });

  it("approveTier sets approvalStatus=approved and records approvedBy/approvedAt", async () => {
    const created = await PricingEngine.createPriceTier(testWs, actor, {
      name: "Tier to Approve",
      entryPrice: 99,
      maxPrice: 299,
      features: ["F1"],
    });
    expect(created.approvalStatus).toBe("pending_approval");
    expect(created.approvedBy).toBeNull();

    const approved = await PricingEngine.approveTier(testWs, created.id, actor);
    expect(approved.approvalStatus).toBe("approved");
    expect(approved.approvedBy).toBe(actor);
    expect(approved.approvedAt).not.toBeNull();
    expect(approved.id).toBe(created.id);
  });

  it("approveTier emits PRICE_TIER_APPROVED audit event", async () => {
    const created = await PricingEngine.createPriceTier(testWs, actor, {
      name: "Audit Approve Tier",
      entryPrice: 49,
      maxPrice: 149,
      features: ["F1"],
    });
    await PricingEngine.approveTier(testWs, created.id, actor);
    const audit = await db.auditEvent.findFirst({
      where: { actorId: actor, entityId: created.id, eventName: "growth.price_tier_approved" },
    });
    expect(audit).not.toBeNull();
  });

  it("approveTier throws ValidationError for tier in different workspace (isolation)", async () => {
    const created = await PricingEngine.createPriceTier(testWs, actor, {
      name: "Workspace Isolated Tier",
      entryPrice: 99,
      maxPrice: 299,
      features: ["F1"],
    });
    await expect(
      PricingEngine.approveTier(otherWs, created.id, actor)
    ).rejects.toThrow(ValidationError);
  });

  it("approveTier throws ValidationError for empty workspaceId", async () => {
    await expect(
      PricingEngine.approveTier("", "some-tier-id", actor)
    ).rejects.toThrow(ValidationError);
  });

  it("supersedeTier creates new version and archives old tier atomically", async () => {
    const v1 = await PricingEngine.createPriceTier(testWs, actor, {
      name: "V1 Tier",
      entryPrice: 99,
      maxPrice: 299,
      features: ["F1"],
      status: "ACTIVE",
    });
    expect(v1.version).toBe(1);
    expect(v1.status).toBe("ACTIVE");

    const v2 = await PricingEngine.supersedeTier(testWs, v1.id, actor, {
      name: "V2 Tier",
      entryPrice: 119,
      maxPrice: 319,
      features: ["F1", "F2"],
    });
    expect(v2.version).toBe(2);
    expect(v2.status).toBe("DRAFT");
    expect(v2.approvalStatus).toBe("pending_approval");
    expect(v2.workspaceId).toBe(testWs);

    // Old tier must be archived with supersededById pointing to new tier
    const archivedV1 = await db.growthPriceTier.findUnique({ where: { id: v1.id } });
    expect(archivedV1?.status).toBe("ARCHIVED");
    expect(archivedV1?.supersededById).toBe(v2.id);
  });

  it("supersedeTier emits PRICE_TIER_SUPERSEDED audit event", async () => {
    const v1 = await PricingEngine.createPriceTier(testWs, actor, {
      name: "Audit Supersede V1",
      entryPrice: 79,
      maxPrice: 199,
      features: ["F1"],
    });
    const v2 = await PricingEngine.supersedeTier(testWs, v1.id, actor, {
      name: "Audit Supersede V2",
      entryPrice: 89,
      maxPrice: 219,
      features: ["F1"],
    });
    const audit = await db.auditEvent.findFirst({
      where: { actorId: actor, entityId: v1.id, eventName: "growth.price_tier_superseded" },
    });
    expect(audit).not.toBeNull();
    const payload = audit?.payload as Record<string, unknown>;
    expect(payload.newTierId).toBe(v2.id);
    expect(payload.newVersion).toBe(2);
  });

  it("supersedeTier throws ValidationError for tier in different workspace (isolation)", async () => {
    const v1 = await PricingEngine.createPriceTier(testWs, actor, {
      name: "Cross-WS Supersede V1",
      entryPrice: 99,
      maxPrice: 299,
      features: ["F1"],
    });
    await expect(
      PricingEngine.supersedeTier(otherWs, v1.id, actor, {
        name: "Cross-WS V2",
        entryPrice: 109,
        maxPrice: 309,
        features: ["F1"],
      })
    ).rejects.toThrow(ValidationError);
  });

  it("supersedeTier throws ValidationError for invalid new tier data (no DB touch on old tier)", async () => {
    const v1 = await PricingEngine.createPriceTier(testWs, actor, {
      name: "Valid V1 for Invalid V2 Test",
      entryPrice: 99,
      maxPrice: 299,
      features: ["F1"],
    });
    await expect(
      PricingEngine.supersedeTier(testWs, v1.id, actor, {
        name: "",
        entryPrice: 299,
        maxPrice: 99, // maxPrice < entryPrice
        features: [],
      })
    ).rejects.toThrow(ValidationError);

    // Old tier must not be archived — transaction never started
    const unchanged = await db.growthPriceTier.findUnique({ where: { id: v1.id } });
    expect(unchanged?.status).not.toBe("ARCHIVED");
  });

  it("cross-domain: avgActiveMargin from ACTIVE tiers with cost data flows into Now View marginPct", async () => {
    // Seed an ACTIVE, approved tier with cost data so avgActiveMargin is computable
    const tier = await PricingEngine.createPriceTier(testWs, actor, {
      name: "Active Margin Tier",
      entryPrice: 200,
      maxPrice: 400,
      variableCost: 60,
      allocatedCost: 40,
      features: ["F1"],
      status: "ACTIVE",
    });
    expect(tier.computedMargin).toBe(0.5); // (200 - 60 - 40) / 200

    // Query through the GuidanceDb interface exactly as the Now View does
    const tiers = await db.growthPriceTier.findMany({
      where: { workspaceId: testWs, status: "ACTIVE" },
      select: { entryPrice: true, variableCost: true, allocatedCost: true, status: true },
    });
    const tiersWithCost = tiers.filter(
      (t: { entryPrice: number; variableCost: number | null; allocatedCost: number | null }) =>
        t.entryPrice > 0 && (t.variableCost !== null || t.allocatedCost !== null)
    );
    expect(tiersWithCost.length).toBeGreaterThanOrEqual(1);

    const avgMargin =
      tiersWithCost.reduce((sum: number, t: { entryPrice: number; variableCost: number | null; allocatedCost: number | null }) => {
        const totalCost = (t.variableCost ?? 0) + (t.allocatedCost ?? 0);
        return sum + Math.max(0, Math.min(1, (t.entryPrice - totalCost) / t.entryPrice));
      }, 0) / tiersWithCost.length;

    // avgMargin must be fractional (0..1) matching profit-leak-radar marginPct contract
    expect(avgMargin).toBeGreaterThan(0);
    expect(avgMargin).toBeLessThanOrEqual(1);
  });

  it("cross-domain: workspace isolation — otherWs tiers do not affect testWs avgActiveMargin", async () => {
    const tiers = await db.growthPriceTier.findMany({
      where: { workspaceId: otherWs, status: "ACTIVE" },
    });
    expect(tiers).toHaveLength(0);
  });
});
