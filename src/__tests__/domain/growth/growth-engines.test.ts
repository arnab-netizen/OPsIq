/**
 * Unit Tests: Growth Operating Engines Domain Contracts
 *
 * Validates: enums, type definitions, and validator functions
 * No service implementation or database calls in this slice.
 */

import { describe, it, expect } from "vitest";
import {
  RevenueModel,
  BillingCycle,
  PricingStrategy,
  AcquisitionChannel,
  DealStage,
  ChurnReason,
  validateRevenueStream,
  validatePriceTier,
  validateAcquisitionMetrics,
  validateRetentionMetrics,
  validateSalesDeal,
  validateOffer,
} from "@/domain/growth/growth-engines";

describe("Growth Operating Engines - Domain Contracts", () => {
  describe("Revenue Engine - Enums & Types", () => {
    it("should define RevenueModel enum with all strategies", () => {
      expect(RevenueModel.SUBSCRIPTION).toBeDefined();
      expect(RevenueModel.USAGE_BASED).toBeDefined();
      expect(RevenueModel.HYBRID).toBeDefined();
      expect(RevenueModel.ONE_TIME).toBeDefined();
      expect(RevenueModel.TIERED).toBeDefined();
    });

    it("should define BillingCycle enum", () => {
      expect(BillingCycle.MONTHLY).toBeDefined();
      expect(BillingCycle.QUARTERLY).toBeDefined();
      expect(BillingCycle.ANNUAL).toBeDefined();
      expect(BillingCycle.USAGE).toBeDefined();
    });

    it("should validate revenue stream with valid data", () => {
      const stream = {
        name: "SaaS Plan",
        model: RevenueModel.SUBSCRIPTION,
        billingCycle: BillingCycle.MONTHLY,
        basePrice: 99,
        currency: "USD",
        activationDate: new Date(),
        status: "ACTIVE" as const,
      };

      const result = validateRevenueStream(stream);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject revenue stream with missing name", () => {
      const stream = {
        model: RevenueModel.SUBSCRIPTION,
        basePrice: 99,
        currency: "USD",
      };

      const result = validateRevenueStream(stream);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Revenue stream name is required");
    });

    it("should reject revenue stream with invalid model", () => {
      const stream = {
        name: "Invalid Plan",
        model: "INVALID_MODEL" as any,
        basePrice: 99,
        currency: "USD",
      };

      const result = validateRevenueStream(stream);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Valid revenue model is required");
    });

    it("should reject revenue stream with negative price", () => {
      const stream = {
        name: "Negative Plan",
        model: RevenueModel.SUBSCRIPTION,
        basePrice: -50,
        currency: "USD",
      };

      const result = validateRevenueStream(stream);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Base price"))).toBe(true);
    });
  });

  describe("Pricing Engine - Validators", () => {
    it("should define PricingStrategy enum", () => {
      expect(PricingStrategy.COST_PLUS).toBeDefined();
      expect(PricingStrategy.VALUE_BASED).toBeDefined();
      expect(PricingStrategy.COMPETITIVE).toBeDefined();
      expect(PricingStrategy.PENETRATION).toBeDefined();
      expect(PricingStrategy.SKIMMING).toBeDefined();
    });

    it("should validate price tier with valid data", () => {
      const tier = {
        name: "Professional",
        entryPrice: 99,
        maxPrice: 299,
        targetMargin: 0.7,
        features: ["Feature1", "Feature2"],
        activationDate: new Date(),
        status: "ACTIVE" as const,
      };

      const result = validatePriceTier(tier);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject price tier with maxPrice < entryPrice", () => {
      const tier = {
        name: "Invalid Tier",
        entryPrice: 299,
        maxPrice: 99,
        targetMargin: 0.7,
        features: ["Feature1"],
      };

      const result = validatePriceTier(tier);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Max price"))).toBe(true);
    });

    it("should reject price tier with invalid margin", () => {
      const tier = {
        name: "Invalid Margin",
        entryPrice: 99,
        maxPrice: 299,
        targetMargin: 1.5,
        features: ["Feature1"],
      };

      const result = validatePriceTier(tier);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Target margin"))).toBe(true);
    });

    it("should reject price tier with no features", () => {
      const tier = {
        name: "No Features",
        entryPrice: 99,
        maxPrice: 299,
        targetMargin: 0.7,
        features: [],
      };

      const result = validatePriceTier(tier);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("feature"))).toBe(true);
    });
  });

  describe("Acquisition Engine - Validators", () => {
    it("should define AcquisitionChannel enum", () => {
      expect(AcquisitionChannel.DIRECT_SALES).toBeDefined();
      expect(AcquisitionChannel.SELF_SERVE).toBeDefined();
      expect(AcquisitionChannel.PARTNER).toBeDefined();
      expect(AcquisitionChannel.ORGANIC).toBeDefined();
      expect(AcquisitionChannel.PAID_SEARCH).toBeDefined();
    });

    it("should validate acquisition metrics with valid data", () => {
      const metrics = {
        channel: AcquisitionChannel.PAID_SEARCH,
        month: "2026-05",
        leads: 150,
        qualifiedLeads: 45,
        conversions: 10,
        costPerLead: 10,
        costPerAcquisition: 150,
        targetCPA: 200,
      };

      const result = validateAcquisitionMetrics(metrics);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject metrics with invalid month format", () => {
      const metrics = {
        channel: AcquisitionChannel.ORGANIC,
        month: "May 2026",
        leads: 100,
        costPerAcquisition: 0,
      };

      const result = validateAcquisitionMetrics(metrics);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("YYYY-MM"))).toBe(true);
    });

    it("should reject metrics with negative CPA", () => {
      const metrics = {
        channel: AcquisitionChannel.ORGANIC,
        month: "2026-05",
        leads: 100,
        costPerAcquisition: -50,
      };

      const result = validateAcquisitionMetrics(metrics);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Cost per acquisition"))).toBe(true);
    });
  });

  describe("Retention Engine - Validators", () => {
    it("should define ChurnReason enum", () => {
      expect(ChurnReason.PRODUCT_UNFIT).toBeDefined();
      expect(ChurnReason.PRICE_SENSITIVITY).toBeDefined();
      expect(ChurnReason.COMPETITION).toBeDefined();
      expect(ChurnReason.USAGE_DECLINE).toBeDefined();
      expect(ChurnReason.FEATURE_LACK).toBeDefined();
    });

    it("should validate retention metrics with valid data", () => {
      const metrics = {
        cohortMonth: "2025-01",
        cohortSize: 100,
        monthlyRetention: { 1: 0.95, 2: 0.92, 3: 0.88, 4: 0.85 },
        avgMonthlyChurn: 0.05,
      };

      const result = validateRetentionMetrics(metrics);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject metrics with invalid churn rate", () => {
      const metrics = {
        cohortMonth: "2025-01",
        monthlyRetention: { 1: 0.95 },
        avgMonthlyChurn: 1.5,
      };

      const result = validateRetentionMetrics(metrics);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("churn"))).toBe(true);
    });
  });

  describe("Sales Pipeline Engine - Validators", () => {
    it("should define DealStage enum", () => {
      expect(DealStage.PROSPECT).toBeDefined();
      expect(DealStage.QUALIFIED).toBeDefined();
      expect(DealStage.PROPOSAL).toBeDefined();
      expect(DealStage.NEGOTIATION).toBeDefined();
      expect(DealStage.CLOSED_WON).toBeDefined();
      expect(DealStage.CLOSED_LOST).toBeDefined();
    });

    it("should validate sales deal with valid data", () => {
      const deal = {
        companyName: "Acme Corp",
        stage: DealStage.NEGOTIATION,
        value: 50000,
        currency: "USD",
        probability: 0.75,
        expectedCloseDate: new Date(),
      };

      const result = validateSalesDeal(deal);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject deal with invalid probability", () => {
      const deal = {
        companyName: "Acme Corp",
        stage: DealStage.PROPOSAL,
        value: 50000,
        probability: 1.5,
      };

      const result = validateSalesDeal(deal);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Probability"))).toBe(true);
    });

    it("should reject deal with negative value", () => {
      const deal = {
        companyName: "Acme Corp",
        stage: DealStage.PROSPECT,
        value: -10000,
        probability: 0.5,
      };

      const result = validateSalesDeal(deal);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("value"))).toBe(true);
    });
  });

  describe("Offer Engine - Validators", () => {
    it("should validate offer with valid data", () => {
      const offer = {
        name: "Summer Special",
        basePrice: 299,
        discountPercent: 20,
        bundledFeatures: ["Feature1", "Feature2", "Feature3"],
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: "ACTIVE" as const,
      };

      const result = validateOffer(offer);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject offer with invalid discount", () => {
      const offer = {
        name: "Bad Discount",
        basePrice: 299,
        discountPercent: 150,
        bundledFeatures: ["Feature1"],
      };

      const result = validateOffer(offer);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Discount"))).toBe(true);
    });

    it("should reject offer with no bundled features", () => {
      const offer = {
        name: "Empty Offer",
        basePrice: 299,
        discountPercent: 10,
        bundledFeatures: [],
      };

      const result = validateOffer(offer);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("bundled feature"))).toBe(true);
    });

    it("should reject offer with negative base price", () => {
      const offer = {
        name: "Negative Price",
        basePrice: -99,
        discountPercent: 10,
        bundledFeatures: ["Feature1"],
      };

      const result = validateOffer(offer);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Base price"))).toBe(true);
    });
  });

  describe("Type Safety - All Enums and Validators Present", () => {
    it("should have comprehensive growth engine definitions", () => {
      // Revenue
      expect(Object.keys(RevenueModel).length).toBeGreaterThan(0);

      // Pricing
      expect(Object.keys(PricingStrategy).length).toBeGreaterThan(0);

      // Acquisition
      expect(Object.keys(AcquisitionChannel).length).toBeGreaterThan(3);

      // Retention
      expect(Object.keys(ChurnReason).length).toBeGreaterThan(0);

      // Sales
      expect(Object.keys(DealStage).length).toBeGreaterThan(0);
    });

    it("should have all validators defined", () => {
      expect(typeof validateRevenueStream).toBe("function");
      expect(typeof validatePriceTier).toBe("function");
      expect(typeof validateAcquisitionMetrics).toBe("function");
      expect(typeof validateRetentionMetrics).toBe("function");
      expect(typeof validateSalesDeal).toBe("function");
      expect(typeof validateOffer).toBe("function");
    });
  });
});
