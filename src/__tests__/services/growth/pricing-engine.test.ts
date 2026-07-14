/**
 * Unit Tests: Pricing Engine Service (non-DB paths)
 *
 * Tests validation errors, price optimization, gap analysis, margin estimation,
 * strategy recommendations, and bundle value.
 * Validates workspace scoping and fail-closed behavior.
 *
 * DB-backed paths (createPriceTier success, listTiers) are covered in the DB test file.
 * Validation-only paths for createPriceTier (errors thrown before DB touch) are tested here.
 */

import { describe, it, expect } from "vitest";
import { PricingEngine } from "@/services/growth/pricing-engine";
import { PricingStrategy } from "@/domain/growth/growth-engines";
import { ValidationError } from "@/infra/errors";

describe("Pricing Engine Service", () => {
  const workspaceId = "ws-test-1";
  const otherWorkspaceId = "ws-other";

  describe("createPriceTier — validation paths (no DB required)", () => {
    it("rejects empty workspaceId with ValidationError", async () => {
      await expect(
        PricingEngine.createPriceTier("", "actor-1", {
          name: "Pro",
          entryPrice: 99,
          maxPrice: 299,
          features: ["Feature1"],
        })
      ).rejects.toThrow(ValidationError);
    });

    it("rejects maxPrice < entryPrice with ValidationError", async () => {
      await expect(
        PricingEngine.createPriceTier(workspaceId, "actor-1", {
          name: "Invalid",
          entryPrice: 299,
          maxPrice: 99,
          features: ["Feature1"],
        })
      ).rejects.toThrow(ValidationError);
    });

    it("rejects empty name with ValidationError", async () => {
      await expect(
        PricingEngine.createPriceTier(workspaceId, "actor-1", {
          name: "",
          entryPrice: 99,
          maxPrice: 299,
          features: ["Feature1"],
        })
      ).rejects.toThrow(ValidationError);
    });

    it("rejects empty features array with ValidationError", async () => {
      await expect(
        PricingEngine.createPriceTier(workspaceId, "actor-1", {
          name: "Pro",
          entryPrice: 99,
          maxPrice: 299,
          features: [],
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("optimizePrice", () => {
    const tier = {
      id: "pt-1",
      workspaceId,
      name: "Standard",
      entryPrice: 99,
      maxPrice: 299,
      targetMargin: 0.6,
      features: ["Feature1"],
      activationDate: new Date(),
      status: "ACTIVE" as const,
    };

    it("recommends a price increase with low-elasticity (revenue impact positive)", () => {
      const result = PricingEngine.optimizePrice(workspaceId, tier, 100, -0.3);
      expect(result.recommendedPrice).toBeGreaterThanOrEqual(100);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it("recommends a price decrease with high elasticity", () => {
      const result = PricingEngine.optimizePrice(workspaceId, tier, 100, -1.0);
      expect(result.recommendedPrice).toBeLessThanOrEqual(100);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it("respects tier bounds when recommending price", () => {
      const result = PricingEngine.optimizePrice(workspaceId, tier, 290, -0.3);
      expect(result.recommendedPrice).toBeLessThanOrEqual(tier.maxPrice);
      expect(result.recommendedPrice).toBeGreaterThanOrEqual(tier.entryPrice);
    });

    it("returns fail-closed (no change, zero confidence) for missing workspaceId", () => {
      const result = PricingEngine.optimizePrice("", tier, 100, -0.5);
      expect(result.recommendedPrice).toBe(100);
      expect(result.confidence).toBe(0);
    });

    it("returns fail-closed for workspace mismatch (cross-workspace block)", () => {
      const result = PricingEngine.optimizePrice(otherWorkspaceId, tier, 100, -0.5);
      expect(result.recommendedPrice).toBe(100);
      expect(result.confidence).toBe(0);
    });
  });

  describe("analyzeGaps", () => {
    const tiers = [
      {
        id: "pt-1",
        workspaceId,
        name: "Starter",
        entryPrice: 10,
        maxPrice: 49,
        targetMargin: 0.5,
        features: ["F1"],
        activationDate: new Date(),
        status: "ACTIVE" as const,
      },
      {
        id: "pt-2",
        workspaceId,
        name: "Professional",
        entryPrice: 99,
        maxPrice: 299,
        targetMargin: 0.7,
        features: ["F1", "F2"],
        activationDate: new Date(),
        status: "ACTIVE" as const,
      },
      {
        id: "pt-3",
        workspaceId: otherWorkspaceId,
        name: "Enterprise",
        entryPrice: 500,
        maxPrice: 2000,
        targetMargin: 0.8,
        features: ["F1", "F2", "F3"],
        activationDate: new Date(),
        status: "ACTIVE" as const,
      },
    ];

    it("detects price gap between Starter and Professional tiers", () => {
      const result = PricingEngine.analyzeGaps(workspaceId, tiers);
      expect(result.gaps.length).toBeGreaterThan(0);
      expect(result.gaps[0].minPrice).toBe(49);
      expect(result.gaps[0].maxPrice).toBe(99);
    });

    it("filters to workspace scope — ignores otherWorkspaceId tiers", () => {
      const result = PricingEngine.analyzeGaps(workspaceId, tiers);
      expect(result.gaps.length).toBe(1);
    });

    it("detects overlapping tier price ranges", () => {
      const overlappingTiers = [
        {
          id: "pt-1",
          workspaceId,
          name: "Basic",
          entryPrice: 50,
          maxPrice: 150,
          targetMargin: 0.5,
          features: ["F1"],
          activationDate: new Date(),
          status: "ACTIVE" as const,
        },
        {
          id: "pt-2",
          workspaceId,
          name: "Plus",
          entryPrice: 100,
          maxPrice: 200,
          targetMargin: 0.6,
          features: ["F1", "F2"],
          activationDate: new Date(),
          status: "ACTIVE" as const,
        },
      ];
      const result = PricingEngine.analyzeGaps(workspaceId, overlappingTiers);
      expect(result.overlaps.length).toBeGreaterThan(0);
    });

    it("excludes non-ACTIVE tiers from gap analysis", () => {
      const mixedTiers = [
        ...tiers,
        {
          id: "pt-draft",
          workspaceId,
          name: "Draft Tier",
          entryPrice: 350,
          maxPrice: 450,
          targetMargin: 0.6,
          features: ["F1"],
          activationDate: new Date(),
          status: "DRAFT" as const,
        },
      ];
      const result = PricingEngine.analyzeGaps(workspaceId, mixedTiers);
      expect(result.gaps.length).toBe(1); // Only gap between Starter and Professional
    });
  });

  describe("estimateMarginImpact", () => {
    const tier = {
      id: "pt-1",
      workspaceId,
      name: "Standard",
      entryPrice: 100,
      maxPrice: 300,
      targetMargin: 0.6,
      features: ["Feature1"],
      activationDate: new Date(),
      status: "ACTIVE" as const,
    };

    it("shows margin improves with price increase (same cost)", () => {
      const result = PricingEngine.estimateMarginImpact(workspaceId, tier, 120, 30);
      expect(result.newMargin).toBeGreaterThan(result.currentMargin);
      expect(result.marginChange).toBeGreaterThan(0);
    });

    it("shows margin declines with price decrease (same cost)", () => {
      const result = PricingEngine.estimateMarginImpact(workspaceId, tier, 80, 30);
      expect(result.newMargin).toBeLessThan(result.currentMargin);
      expect(result.marginChange).toBeLessThan(0);
    });

    it("clamps margins between 0 and 1 when COGS exceeds price", () => {
      const result = PricingEngine.estimateMarginImpact(workspaceId, tier, 100, 200);
      expect(result.currentMargin).toBeGreaterThanOrEqual(0);
      expect(result.currentMargin).toBeLessThanOrEqual(1);
      expect(result.newMargin).toBeGreaterThanOrEqual(0);
      expect(result.newMargin).toBeLessThanOrEqual(1);
    });

    it("returns fail-closed zeros for missing workspaceId", () => {
      const result = PricingEngine.estimateMarginImpact("", tier, 120, 30);
      expect(result.currentMargin).toBe(0);
      expect(result.newMargin).toBe(0);
    });

    it("returns fail-closed zeros for workspace mismatch (cross-workspace block)", () => {
      const result = PricingEngine.estimateMarginImpact(otherWorkspaceId, tier, 120, 30);
      expect(result.currentMargin).toBe(0);
      expect(result.newMargin).toBe(0);
    });
  });

  describe("recommendStrategy", () => {
    it("recommends PENETRATION when cost-plus exceeds competitor price", () => {
      expect(PricingEngine.recommendStrategy(workspaceId, 100, 0.5, 80)).toBe(PricingStrategy.PENETRATION);
    });

    it("recommends SKIMMING when market price >> cost with moderate margin target", () => {
      expect(PricingEngine.recommendStrategy(workspaceId, 200, 0.5, 50)).toBe(PricingStrategy.SKIMMING);
    });

    it("recommends VALUE_BASED with high margin target (≥50%)", () => {
      expect(PricingEngine.recommendStrategy(workspaceId, 150, 0.7, 50)).toBe(PricingStrategy.VALUE_BASED);
    });

    it("recommends COMPETITIVE as default", () => {
      expect(PricingEngine.recommendStrategy(workspaceId, 100, 0.4, 40)).toBe(PricingStrategy.COMPETITIVE);
    });

    it("returns COMPETITIVE as fail-closed default for missing workspaceId", () => {
      expect(PricingEngine.recommendStrategy("", 100, 0.5, 40)).toBe(PricingStrategy.COMPETITIVE);
    });
  });

  describe("calculateBundleValue", () => {
    const tier = {
      id: "pt-1",
      workspaceId,
      name: "Bundle",
      entryPrice: 100,
      maxPrice: 200,
      targetMargin: 0.6,
      features: ["Analytics", "Support", "API"],
      activationDate: new Date(),
      status: "ACTIVE" as const,
    };

    const featurePrices = { Analytics: 50, Support: 30, API: 40 };

    it("calculates total bundle value and discount vs tier entry price", () => {
      const result = PricingEngine.calculateBundleValue(tier, featurePrices);
      expect(result.bundledValue).toBe(120); // 50 + 30 + 40
      expect(result.discount).toBeGreaterThan(0);
      expect(result.discount).toBeLessThan(100);
    });

    it("returns zero for empty feature list", () => {
      const result = PricingEngine.calculateBundleValue({ ...tier, features: [] }, featurePrices);
      expect(result.bundledValue).toBe(0);
      expect(result.discount).toBe(0);
    });

    it("returns zero when feature prices are all missing", () => {
      const result = PricingEngine.calculateBundleValue(tier, {});
      expect(result.bundledValue).toBe(0);
      expect(result.discount).toBe(0);
    });
  });
});
