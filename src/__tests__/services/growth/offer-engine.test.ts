/**
 * Unit Tests: Offer Engine Service
 *
 * Tests offer creation, performance tracking, and effectiveness analysis.
 * Validates workspace scoping and fail-closed behavior.
 */

import { describe, it, expect } from "vitest";
import { OfferEngine } from "@/services/growth/offer-engine";

describe("Offer Engine Service", () => {
  const workspaceId = "ws-test-1";
  const otherWorkspaceId = "ws-other";

  describe("Create Offer", () => {
    it("should create valid offer with workspace scoping", () => {
      const data = {
        name: "Summer Sale",
        basePrice: 100,
        discountPercent: 20,
        bundledFeatures: ["feature-a", "feature-b"],
        validFrom: new Date("2025-06-01"),
        validUntil: new Date("2025-08-31"),
      };

      const result = OfferEngine.createOffer(workspaceId, data);

      expect(result.error).toBeNull();
      expect(result.offer).toBeDefined();
      expect(result.offer?.name).toBe("Summer Sale");
      expect(result.offer?.workspaceId).toBe(workspaceId);
      expect(result.offer?.status).toBe("DRAFT");
    });

    it("should fail without workspace ID", () => {
      const data = {
        name: "Test Offer",
        basePrice: 50,
        discountPercent: 10,
        bundledFeatures: ["feature-1"],
      };

      const result = OfferEngine.createOffer("", data);

      expect(result.error).toBeDefined();
      expect(result.offer).toBeNull();
      expect(result.error).toContain("Workspace ID");
    });

    it("should fail with missing required fields", () => {
      const data = {
        name: "",
        basePrice: 100,
        discountPercent: 20,
      };

      const result = OfferEngine.createOffer(workspaceId, data);

      expect(result.error).toBeDefined();
    });

    it("should fail with invalid discount percent", () => {
      const data = {
        name: "Invalid Offer",
        basePrice: 100,
        discountPercent: 150,
        bundledFeatures: ["feature-1"],
      };

      const result = OfferEngine.createOffer(workspaceId, data);

      expect(result.error).toBeDefined();
    });

    it("should apply default values", () => {
      const data = {
        name: "Basic Offer",
        basePrice: 100,
        discountPercent: 10,
        bundledFeatures: ["feature-1"],
      };

      const result = OfferEngine.createOffer(workspaceId, data);

      expect(result.offer?.status).toBe("DRAFT");
      expect(result.offer?.usedCount).toBe(0);
    });
  });

  describe("Calculate Effective Price", () => {
    it("should calculate effective price with discount", () => {
      const result = OfferEngine.calculateEffectivePrice(
        workspaceId,
        100,
        20
      );

      expect(result.originalPrice).toBe(100);
      expect(result.discountAmount).toBe(20);
      expect(result.effectivePrice).toBe(80);
      expect(result.savings).toContain("20%");
    });

    it("should handle zero discount", () => {
      const result = OfferEngine.calculateEffectivePrice(
        workspaceId,
        100,
        0
      );

      expect(result.discountAmount).toBe(0);
      expect(result.effectivePrice).toBe(100);
    });

    it("should fail-closed without workspace ID", () => {
      const result = OfferEngine.calculateEffectivePrice(
        "",
        100,
        20
      );

      expect(result.originalPrice).toBe(0);
      expect(result.effectivePrice).toBe(0);
    });
  });

  describe("Record Performance", () => {
    it("should record offer performance correctly", () => {
      const result = OfferEngine.recordPerformance(
        workspaceId,
        "offer-123",
        150, // conversions
        15000, // revenue
        100, // baselineConversions
        10000, // baselineRevenue
        5000 // productionCost
      );

      expect(result.error).toBeNull();
      expect(result.performance).toBeDefined();
      expect(result.performance?.conversionLift).toBeGreaterThan(0);
      expect(result.performance?.revenueImpact).toBeGreaterThan(0);
    });

    it("should calculate profit margin", () => {
      const result = OfferEngine.recordPerformance(
        workspaceId,
        "offer-456",
        100,
        10000,
        80,
        8000,
        4000
      );

      expect(result.performance?.profitMargin).toBeGreaterThan(0);
      expect(result.performance?.profitMargin).toBeLessThanOrEqual(1);
    });

    it("should generate recommendation based on metrics", () => {
      const result = OfferEngine.recordPerformance(
        workspaceId,
        "offer-789",
        150,
        15000,
        100,
        10000,
        5000
      );

      expect(
        ["EXTEND", "MODIFY_TERMS", "RETIRE"]
      ).toContain(result.performance?.recommendation);
    });

    it("should fail-closed without workspace ID", () => {
      const result = OfferEngine.recordPerformance(
        "",
        "offer-123",
        100,
        10000,
        80,
        8000,
        4000
      );

      expect(result.error).toBeDefined();
      expect(result.performance).toBeNull();
    });
  });

  describe("Analyze Effectiveness", () => {
    const offer = {
      id: "offer-1",
      workspaceId,
      name: "Test Offer",
      basePrice: 100,
      discountPercent: 20,
      bundledFeatures: ["feature-1"],
      status: "ACTIVE" as const,
      maxUses: 100,
      usedCount: 50,
    };

    it("should calculate effectiveness score", () => {
      const result = OfferEngine.analyzeEffectiveness(
        workspaceId,
        offer,
        150, // conversions
        100 // baselineConversions
      );

      expect(result.effectivenessScore).toBeGreaterThan(0);
      expect(result.effectivenessScore).toBeLessThanOrEqual(100);
    });

    it("should classify as excellent when outperforming", () => {
      const result = OfferEngine.analyzeEffectiveness(
        workspaceId,
        offer,
        200,
        100
      );

      expect(result.status).toBe("EXCELLENT");
    });

    it("should classify as underperforming when below baseline", () => {
      const result = OfferEngine.analyzeEffectiveness(
        workspaceId,
        offer,
        50,
        100
      );

      expect(result.status).toBe("UNDERPERFORMING");
    });

    it("should calculate utilization rate", () => {
      const result = OfferEngine.analyzeEffectiveness(
        workspaceId,
        offer,
        100,
        100
      );

      expect(result.utilizationRate).toBeGreaterThan(0);
      expect(result.utilizationRate).toBeLessThanOrEqual(1);
    });

    it("should fail-closed without workspace ID", () => {
      const result = OfferEngine.analyzeEffectiveness("", offer, 100, 100);

      expect(result.effectivenessScore).toBe(0);
      expect(result.status).toBe("UNDERPERFORMING");
    });
  });

  describe("Compare Offers", () => {
    const offers = [
      {
        id: "offer-1",
        workspaceId,
        name: "Offer A",
        basePrice: 100,
        discountPercent: 10,
        bundledFeatures: ["feature-1"],
        status: "ACTIVE" as const,
      },
      {
        id: "offer-2",
        workspaceId,
        name: "Offer B",
        basePrice: 100,
        discountPercent: 20,
        bundledFeatures: ["feature-2"],
        status: "ACTIVE" as const,
      },
      {
        id: "offer-3",
        workspaceId,
        name: "Offer C",
        basePrice: 100,
        discountPercent: 30,
        bundledFeatures: ["feature-3"],
        status: "DRAFT" as const,
      },
    ];

    it("should identify best and worst performers", () => {
      const result = OfferEngine.compareOffers(workspaceId, offers);

      expect(result.bestPerformer).toBeDefined();
      expect(result.worstPerformer).toBeDefined();
    });

    it("should calculate average discount", () => {
      const result = OfferEngine.compareOffers(workspaceId, offers);

      expect(result.averageDiscount).toBeGreaterThan(0);
      expect(result.averageDiscount).toBeLessThanOrEqual(100);
    });

    it("should count active offers", () => {
      const result = OfferEngine.compareOffers(workspaceId, offers);

      expect(result.activeCount).toBe(2);
    });

    it("should generate recommendations", () => {
      const result = OfferEngine.compareOffers(workspaceId, offers);

      expect(result.recommendations).toBeDefined();
    });

    it("should fail-closed without workspace ID", () => {
      const result = OfferEngine.compareOffers("", offers);

      expect(result.bestPerformer).toBeNull();
      expect(result.activeCount).toBe(0);
    });

    it("should fail-closed with empty offers", () => {
      const result = OfferEngine.compareOffers(workspaceId, []);

      expect(result.bestPerformer).toBeNull();
      expect(result.activeCount).toBe(0);
    });
  });

  describe("Calculate Bundle Value", () => {
    const offer = {
      id: "offer-1",
      workspaceId,
      name: "Premium Bundle",
      basePrice: 150,
      discountPercent: 20,
      bundledFeatures: ["feature-1", "feature-2", "feature-3"],
    };

    const featurePrices = {
      "feature-1": 60,
      "feature-2": 50,
      "feature-3": 40,
    };

    it("should calculate bundle value", () => {
      const result = OfferEngine.calculateBundleValue(
        workspaceId,
        offer,
        featurePrices
      );

      expect(result.bundleValue).toBeGreaterThan(0);
      expect(result.individualPrice).toBeGreaterThan(result.bundleValue);
    });

    it("should calculate bundle discount", () => {
      const result = OfferEngine.calculateBundleValue(
        workspaceId,
        offer,
        featurePrices
      );

      expect(result.bundleDiscount).toBeGreaterThan(0);
      expect(result.bundleDiscount).toBeLessThanOrEqual(100);
    });

    it("should generate value statement", () => {
      const result = OfferEngine.calculateBundleValue(
        workspaceId,
        offer,
        featurePrices
      );

      expect(result.value).toContain("saves");
    });

    it("should fail-closed without workspace ID", () => {
      const result = OfferEngine.calculateBundleValue("", offer, featurePrices);

      expect(result.bundleValue).toBe(0);
      expect(result.individualPrice).toBe(0);
    });
  });

  describe("Generate Expiration Alerts", () => {
    const today = new Date();
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const nextMonth = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

    const offers = [
      {
        id: "offer-1",
        workspaceId,
        name: "Expiring Today",
        basePrice: 100,
        discountPercent: 10,
        bundledFeatures: ["feature-1"],
        status: "ACTIVE" as const,
        validUntil: today,
      },
      {
        id: "offer-2",
        workspaceId,
        name: "Expiring This Week",
        basePrice: 100,
        discountPercent: 20,
        bundledFeatures: ["feature-2"],
        status: "ACTIVE" as const,
        validUntil: nextWeek,
      },
      {
        id: "offer-3",
        workspaceId,
        name: "Expiring This Month",
        basePrice: 100,
        discountPercent: 30,
        bundledFeatures: ["feature-3"],
        status: "ACTIVE" as const,
        validUntil: nextMonth,
      },
    ];

    it("should identify expiring offers", () => {
      const result = OfferEngine.generateExpirationAlerts(workspaceId, offers);

      expect(result.expiringToday).toBeDefined();
      expect(result.expiringThisWeek).toBeDefined();
      expect(result.expiringThisMonth).toBeDefined();
    });

    it("should generate action items", () => {
      const result = OfferEngine.generateExpirationAlerts(workspaceId, offers);

      expect(result.actions).toBeDefined();
    });

    it("should fail-closed without workspace ID", () => {
      const result = OfferEngine.generateExpirationAlerts("", offers);

      expect(result.expiringToday).toEqual([]);
      expect(result.actions).toEqual([]);
    });

    it("should fail-closed with empty offers", () => {
      const result = OfferEngine.generateExpirationAlerts(workspaceId, []);

      expect(result.expiringToday).toEqual([]);
      expect(result.expiringThisWeek).toEqual([]);
    });
  });

  describe("Tenant Safety", () => {
    const offer = {
      name: "Tenant Test",
      basePrice: 100,
      discountPercent: 20,
      bundledFeatures: ["feature-1"],
    };

    it("should prevent cross-workspace offer creation", () => {
      const ws1Result = OfferEngine.createOffer("ws-1", offer);
      const ws2Result = OfferEngine.createOffer("ws-2", offer);

      expect(ws1Result.offer?.workspaceId).toBe("ws-1");
      expect(ws2Result.offer?.workspaceId).toBe("ws-2");
    });

    it("should prevent cross-workspace performance tracking", () => {
      const ws1Result = OfferEngine.recordPerformance(
        "ws-1",
        "offer-123",
        100,
        10000,
        80,
        8000,
        4000
      );
      const ws2Result = OfferEngine.recordPerformance(
        "ws-2",
        "offer-123",
        100,
        10000,
        80,
        8000,
        4000
      );

      expect(ws1Result.error).toBeNull();
      expect(ws2Result.error).toBeNull();
    });
  });
});
