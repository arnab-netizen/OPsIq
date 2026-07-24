import { describe, it, expect } from "vitest";
import { generatePersonalizedRecommendations } from "@/services/recommendation/engine";

describe("recommendation engine — module contract assertions", () => {
  it("generatePersonalizedRecommendations is a function", () => {
    expect(typeof generatePersonalizedRecommendations).toBe("function");
  });
  it("returns an array for a retail assessment", () => {
    const result = generatePersonalizedRecommendations({ businessName: "Shop", businessType: "retail", revenue: 100000, costs: 80000, customers: 10 });
    expect(Array.isArray(result)).toBe(true);
  });
  it("returns an array for a saas assessment", () => {
    const result = generatePersonalizedRecommendations({ businessName: "SaaS", businessType: "saas", revenue: 5000000, costs: 2000000, customers: 500 });
    expect(Array.isArray(result)).toBe(true);
  });
  it("result.length is greater than 0 for a retail assessment", () => {
    const result = generatePersonalizedRecommendations({ businessName: "Shop", businessType: "retail", revenue: 100000, costs: 80000, customers: 10 });
    expect(result.length).toBeGreaterThan(0);
  });
  it("each recommendation has a recommendation field", () => {
    const result = generatePersonalizedRecommendations({ businessName: "Shop", businessType: "retail", revenue: 100000, costs: 80000, customers: 10 });
    for (const r of result) expect(r).toHaveProperty("recommendation");
  });
  it("each recommendation has a personalizationScore", () => {
    const result = generatePersonalizedRecommendations({ businessName: "Shop", businessType: "retail", revenue: 100000, costs: 80000, customers: 10 });
    for (const r of result) expect(r).toHaveProperty("personalizationScore");
  });
  it("personalizationScore is a number between 0 and 1", () => {
    const result = generatePersonalizedRecommendations({ businessName: "Shop", businessType: "retail", revenue: 100000, costs: 80000, customers: 10 });
    for (const r of result) {
      expect(r.personalizationScore).toBeGreaterThanOrEqual(0);
      expect(r.personalizationScore).toBeLessThanOrEqual(1);
    }
  });
  it("each recommendation has a suitabilityRationale array", () => {
    const result = generatePersonalizedRecommendations({ businessName: "Shop", businessType: "retail", revenue: 100000, costs: 80000, customers: 10 });
    for (const r of result) expect(Array.isArray(r.suitabilityRationale)).toBe(true);
  });
  it("first recommendation has highest or equal personalizationScore", () => {
    const result = generatePersonalizedRecommendations({ businessName: "Shop", businessType: "retail", revenue: 100000, costs: 80000, customers: 10 });
    if (result.length >= 2) expect(result[0].personalizationScore).toBeGreaterThanOrEqual(result[1].personalizationScore);
  });
  it("result is an array for any businessType string", () => {
    const result = generatePersonalizedRecommendations({ businessName: "X", businessType: "unknown", revenue: 1, costs: 1, customers: 1 });
    expect(Array.isArray(result)).toBe(true);
  });
  it("large-revenue saas returns recommendations", () => {
    const result = generatePersonalizedRecommendations({ businessName: "BigSaaS", businessType: "saas", revenue: 50000000, costs: 20000000, customers: 5000 });
    expect(result.length).toBeGreaterThan(0);
  });
  it("assessment with 0 customers still returns an array", () => {
    const result = generatePersonalizedRecommendations({ businessName: "X", businessType: "retail", revenue: 100000, costs: 80000, customers: 0 });
    expect(Array.isArray(result)).toBe(true);
  });
  it("assessment with equal revenue and costs returns an array", () => {
    const result = generatePersonalizedRecommendations({ businessName: "X", businessType: "retail", revenue: 100000, costs: 100000, customers: 10 });
    expect(Array.isArray(result)).toBe(true);
  });
  it("suitabilityRationale of first recommendation has length >= 0", () => {
    const result = generatePersonalizedRecommendations({ businessName: "Shop", businessType: "retail", revenue: 100000, costs: 80000, customers: 10 });
    expect(result[0].suitabilityRationale.length).toBeGreaterThanOrEqual(0);
  });
  it("personalizationScore of first recommendation is > 0 for retail with positive margin", () => {
    const result = generatePersonalizedRecommendations({ businessName: "Shop", businessType: "retail", revenue: 100000, costs: 80000, customers: 10 });
    expect(result[0].personalizationScore).toBeGreaterThan(0);
  });
  it("recommendation objects are plain objects", () => {
    const result = generatePersonalizedRecommendations({ businessName: "Shop", businessType: "retail", revenue: 100000, costs: 80000, customers: 10 });
    for (const r of result) expect(typeof r).toBe("object");
  });
});

describe("Phase R1: Recommendation Personalization Engine", () => {
  describe("generatePersonalizedRecommendations", () => {
    it("generates personalized recommendations for small business", () => {
      const assessment = {
        businessName: "Local Retail Store",
        businessType: "retail",
        revenue: 500000,
        costs: 400000,
        customers: 50,
      };

      const recommendations = generatePersonalizedRecommendations(assessment);

      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations[0].personalizationScore).toBeGreaterThan(0);
      expect(recommendations[0].suitabilityRationale.length).toBeGreaterThan(0);
    });

    it("generates different recommendations for large business", () => {
      const assessment = {
        businessName: "Enterprise SaaS",
        businessType: "saas",
        revenue: 50000000,
        costs: 20000000,
        customers: 5000,
      };

      const recommendations = generatePersonalizedRecommendations(assessment);

      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations[0].personalizationScore).toBeGreaterThan(0);
    });

    it("includes personalization rationale for each recommendation", () => {
      const assessment = {
        businessName: "Growing Startup",
        businessType: "saas",
        revenue: 2000000,
        costs: 1000000,
        customers: 100,
      };

      const recommendations = generatePersonalizedRecommendations(assessment);

      recommendations.forEach((rec) => {
        expect(rec.recommendation).toBeDefined();
        expect(rec.personalizationScore).toBeGreaterThanOrEqual(0);
        expect(rec.personalizationScore).toBeLessThanOrEqual(1);
        expect(rec.suitabilityRationale).toBeDefined();
        expect(Array.isArray(rec.suitabilityRationale)).toBe(true);
      });
    });

    it("sorts recommendations by personalization score descending", () => {
      const assessment = {
        businessName: "Test Business",
        businessType: "retail",
        revenue: 1000000,
        costs: 800000,
        customers: 200,
      };

      const recommendations = generatePersonalizedRecommendations(assessment);

      for (let i = 0; i < recommendations.length - 1; i++) {
        expect(recommendations[i].personalizationScore).toBeGreaterThanOrEqual(
          recommendations[i + 1].personalizationScore
        );
      }
    });
  });
});
