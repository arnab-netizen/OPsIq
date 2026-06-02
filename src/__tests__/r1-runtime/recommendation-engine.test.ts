import { describe, it, expect } from "vitest";
import { generatePersonalizedRecommendations } from "@/services/recommendation/engine";

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
