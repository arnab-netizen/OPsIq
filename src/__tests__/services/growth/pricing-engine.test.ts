/**
 * Unit Tests: Pricing Engine Service
 *
 * Tests price tier creation, optimization, and strategy recommendations.
 * Validates workspace scoping and fail-closed behavior.
 */

import { describe, it, expect } from "vitest";
import { PricingEngine } from "@/services/growth/pricing-engine";
import { PricingStrategy } from "@/domain/growth/growth-engines";

describe("Pricing Engine Service", () => {
  const workspaceId = "ws-test-1";
  const otherWorkspaceId = "ws-other";

  describe("Create Price Tier", () => {
    it("should create a valid price tier with workspace scoping", () => {
      const data = {
        name: "Professional",
        entryPrice: 99,
        maxPrice: 299,
        targetMargin: 0.7,
        features: ["Feature1", "Feature2"],
      };

      const result = PricingEngine.createPriceTier(workspaceId, data);

      expect(result.error).toBeNull();
      expect(result.tier).toBeDefined();
      expect(result.tier?.workspaceId).toBe(workspaceId);
      expect(result.tier?.name).toBe("Professional");
      expect(result.tier?.entryPrice).toBe(99);
      expect(result.tier?.maxPrice).toBe(299);
    });

    it("should fail without workspace ID", () => {
      const data = {
        name: "Invalid Tier",
        entryPrice: 99,
        maxPrice: 299,
        targetMargin: 0.7,
        features: ["Feature1"],
      };

      const result = PricingEngine.createPriceTier("", data);

      expect(result.error).toBeDefined();
      expect(result.tier).toBeNull();
      expect(result.error).toContain("Workspace ID");
    });

    it("should fail with invalid tier data", () => {
      const data = {
        name: "",
        entryPrice: 299,
        maxPrice: 99, // maxPrice < entryPrice
        targetMargin: 0.7,
        features: ["Feature1"],
      };

      const result = PricingEngine.createPriceTier(workspaceId, data);

      expect(result.error).toBeDefined();
      expect(result.tier).toBeNull();
    });

    it("should set default values for optional fields", () => {
      const data = {
        name: "Basic",
        entryPrice: 49,
        maxPrice: 99,
        targetMargin: 0.5,
        features: ["Feature1"],
      };

      const result = PricingEngine.createPriceTier(workspaceId, data);

      expect(result.tier?.status).toBe("DRAFT");
      expect(result.tier?.activationDate).toBeDefined();
    });
  });

  describe("Optimize Price", () => {
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

    it("should recommend price increase with positive elasticity", () => {
      const result = PricingEngine.optimizePrice(workspaceId, tier, 100, -0.3);

      expect(result.recommendedPrice).toBeGreaterThanOrEqual(100);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it("should recommend price decrease with high negative elasticity", () => {
      const result = PricingEngine.optimizePrice(workspaceId, tier, 100, -1.0);

      expect(result.recommendedPrice).toBeLessThanOrEqual(100);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it("should respect tier bounds when optimizing", () => {
      const result = PricingEngine.optimizePrice(workspaceId, tier, 290, -0.3);

      expect(result.recommendedPrice).toBeLessThanOrEqual(tier.maxPrice);
      expect(result.recommendedPrice).toBeGreaterThanOrEqual(tier.entryPrice);
    });

    it("should fail-closed without workspace ID", () => {
      const result = PricingEngine.optimizePrice("", tier, 100, -0.5);

      expect(result.recommendedPrice).toBe(100);
      expect(result.confidence).toBe(0);
    });

    it("should reject workspace mismatch", () => {
      const result = PricingEngine.optimizePrice(otherWorkspaceId, tier, 100, -0.5);

      expect(result.recommendedPrice).toBe(100);
      expect(result.confidence).toBe(0);
    });
  });

  describe("Analyze Gaps", () => {
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

    it("should detect price gaps between tiers", () => {
      const result = PricingEngine.analyzeGaps(workspaceId, tiers);

      expect(result.gaps.length).toBeGreaterThan(0);
      expect(result.gaps[0].minPrice).toBe(49);
      expect(result.gaps[0].maxPrice).toBe(99);
    });

    it("should filter to workspace scope only", () => {
      const result = PricingEngine.analyzeGaps(workspaceId, tiers);

      // Should only analyze workspace tiers, ignore otherWorkspaceId tier
      expect(result.gaps.length).toBe(1);
    });

    it("should detect overlapping tier ranges", () => {
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

    it("should exclude non-ACTIVE tiers", () => {
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

      // Draft tier should be excluded
      expect(result.gaps.length).toBe(1); // Only gap between Starter and Professional
    });
  });

  describe("Estimate Margin Impact", () => {
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

    it("should calculate margin impact of price increase", () => {
      const result = PricingEngine.estimateMarginImpact(workspaceId, tier, 120, 30);

      expect(result.newMargin).toBeGreaterThan(result.currentMargin);
      expect(result.marginChange).toBeGreaterThan(0);
    });

    it("should calculate margin impact of price decrease", () => {
      const result = PricingEngine.estimateMarginImpact(workspaceId, tier, 80, 30);

      expect(result.newMargin).toBeLessThan(result.currentMargin);
      expect(result.marginChange).toBeLessThan(0);
    });

    it("should clamp margins between 0 and 1", () => {
      const result = PricingEngine.estimateMarginImpact(workspaceId, tier, 100, 200); // COGS > price

      expect(result.currentMargin).toBeGreaterThanOrEqual(0);
      expect(result.currentMargin).toBeLessThanOrEqual(1);
      expect(result.newMargin).toBeGreaterThanOrEqual(0);
      expect(result.newMargin).toBeLessThanOrEqual(1);
    });

    it("should fail-closed without workspace ID", () => {
      const result = PricingEngine.estimateMarginImpact("", tier, 120, 30);

      expect(result.currentMargin).toBe(0);
      expect(result.newMargin).toBe(0);
    });
  });

  describe("Recommend Strategy", () => {
    it("should recommend PENETRATION when cost exceeds market price", () => {
      const strategy = PricingEngine.recommendStrategy(workspaceId, 100, 0.5, 80);

      expect(strategy).toBe(PricingStrategy.PENETRATION);
    });

    it("should recommend SKIMMING when market price is low", () => {
      const strategy = PricingEngine.recommendStrategy(workspaceId, 200, 0.5, 50);

      expect(strategy).toBe(PricingStrategy.SKIMMING);
    });

    it("should recommend VALUE_BASED with high margin target", () => {
      const strategy = PricingEngine.recommendStrategy(workspaceId, 150, 0.7, 50);

      expect(strategy).toBe(PricingStrategy.VALUE_BASED);
    });

    it("should recommend COMPETITIVE as default", () => {
      const strategy = PricingEngine.recommendStrategy(workspaceId, 100, 0.4, 40);

      expect(strategy).toBe(PricingStrategy.COMPETITIVE);
    });

    it("should fail-closed without workspace ID", () => {
      const strategy = PricingEngine.recommendStrategy("", 100, 0.5, 40);

      expect(strategy).toBe(PricingStrategy.COMPETITIVE);
    });
  });

  describe("Calculate Bundle Value", () => {
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

    const featurePrices = {
      Analytics: 50,
      Support: 30,
      API: 40,
    };

    it("should calculate bundled value discount", () => {
      const result = PricingEngine.calculateBundleValue(tier, featurePrices);

      expect(result.bundledValue).toBe(120); // 50 + 30 + 40
      expect(result.discount).toBeGreaterThan(0);
      expect(result.discount).toBeLessThan(100);
    });

    it("should handle empty feature list", () => {
      const emptyTier = { ...tier, features: [] };

      const result = PricingEngine.calculateBundleValue(emptyTier, featurePrices);

      expect(result.bundledValue).toBe(0);
      expect(result.discount).toBe(0);
    });

    it("should handle missing feature prices", () => {
      const result = PricingEngine.calculateBundleValue(tier, {});

      expect(result.bundledValue).toBe(0);
      expect(result.discount).toBe(0);
    });
  });

  describe("Tenant Safety", () => {
    it("should prevent cross-workspace optimization", () => {
      const tier = {
        id: "pt-1",
        workspaceId,
        name: "Standard",
        entryPrice: 99,
        maxPrice: 299,
        targetMargin: 0.6,
        features: ["F1"],
        activationDate: new Date(),
        status: "ACTIVE" as const,
      };

      const correctWs = PricingEngine.optimizePrice(workspaceId, tier, 100, -0.5);
      const wrongWs = PricingEngine.optimizePrice(otherWorkspaceId, tier, 100, -0.5);

      expect(correctWs.confidence).toBeGreaterThan(0);
      expect(wrongWs.confidence).toBe(0);
    });

    it("should enforce workspace in margin estimation", () => {
      const tier = {
        id: "pt-1",
        workspaceId,
        name: "Standard",
        entryPrice: 99,
        maxPrice: 299,
        targetMargin: 0.6,
        features: ["F1"],
        activationDate: new Date(),
        status: "ACTIVE" as const,
      };

      const correctWs = PricingEngine.estimateMarginImpact(workspaceId, tier, 120, 30);
      const wrongWs = PricingEngine.estimateMarginImpact(otherWorkspaceId, tier, 120, 30);

      expect(correctWs.currentMargin).toBeGreaterThan(0);
      expect(wrongWs.currentMargin).toBe(0);
    });
  });
});
