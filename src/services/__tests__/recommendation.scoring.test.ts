import { describe, it, expect } from "vitest";
import { calculateRecommendationScore } from "@/services/recommendation";

describe("Recommendation Scoring Engine", () => {
  describe("calculateRecommendationScore", () => {
    it("should return score between 0 and 1", () => {
      const input = {
        impact: 3,
        urgency: 3,
        confidence: 50,
        effort: 3,
        riskReduction: 50,
        timeToImpact: 30,
        cost: 3,
        reversibility: 50,
        dependency: 2,
        strategicAlignment: 3,
      };

      const score = calculateRecommendationScore(input);

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it("should give high score for high-value low-effort recommendations", () => {
      const highValue = {
        impact: 5,
        urgency: 5,
        confidence: 100,
        effort: 1,
        riskReduction: 100,
        timeToImpact: 1,
        cost: 1,
        reversibility: 100,
        dependency: 0,
        strategicAlignment: 5,
      };

      const score = calculateRecommendationScore(highValue);

      expect(score).toBeGreaterThan(0.8);
    });

    it("should give low score for low-value high-effort recommendations", () => {
      const lowValue = {
        impact: 1,
        urgency: 1,
        confidence: 10,
        effort: 5,
        riskReduction: 10,
        timeToImpact: 365,
        cost: 5,
        reversibility: 10,
        dependency: 10,
        strategicAlignment: 1,
      };

      const score = calculateRecommendationScore(lowValue);

      expect(score).toBeLessThan(0.3);
    });

    it("should apply weights correctly - impact has highest weight", () => {
      const baseInput = {
        impact: 1,
        urgency: 1,
        confidence: 0,
        effort: 3,
        riskReduction: 0,
        timeToImpact: 180,
        cost: 3,
        reversibility: 0,
        dependency: 5,
        strategicAlignment: 1,
      };

      const highImpact = {
        ...baseInput,
        impact: 5,
      };

      const baseScore = calculateRecommendationScore(baseInput);
      const highImpactScore = calculateRecommendationScore(highImpact);

      expect(highImpactScore).toBeGreaterThan(baseScore);
      const difference = highImpactScore - baseScore;
      expect(difference).toBeGreaterThan(0.15);
    });

    it("should inversely weight effort (lower effort is better)", () => {
      const lowEffortInput = {
        impact: 3,
        urgency: 3,
        confidence: 50,
        effort: 1,
        riskReduction: 50,
        timeToImpact: 180,
        cost: 3,
        reversibility: 50,
        dependency: 5,
        strategicAlignment: 3,
      };

      const highEffortInput = {
        ...lowEffortInput,
        effort: 5,
      };

      const lowEffortScore = calculateRecommendationScore(lowEffortInput);
      const highEffortScore = calculateRecommendationScore(highEffortInput);

      expect(lowEffortScore).toBeGreaterThan(highEffortScore);
    });

    it("should inversely weight cost (lower cost is better)", () => {
      const lowCostInput = {
        impact: 3,
        urgency: 3,
        confidence: 50,
        effort: 3,
        riskReduction: 50,
        timeToImpact: 180,
        cost: 1,
        reversibility: 50,
        dependency: 5,
        strategicAlignment: 3,
      };

      const highCostInput = {
        ...lowCostInput,
        cost: 5,
      };

      const lowCostScore = calculateRecommendationScore(lowCostInput);
      const highCostScore = calculateRecommendationScore(highCostInput);

      expect(lowCostScore).toBeGreaterThan(highCostScore);
    });

    it("should inversely weight timeToImpact (faster is better)", () => {
      const fastImpactInput = {
        impact: 3,
        urgency: 3,
        confidence: 50,
        effort: 3,
        riskReduction: 50,
        timeToImpact: 1,
        cost: 3,
        reversibility: 50,
        dependency: 5,
        strategicAlignment: 3,
      };

      const slowImpactInput = {
        ...fastImpactInput,
        timeToImpact: 365,
      };

      const fastScore = calculateRecommendationScore(fastImpactInput);
      const slowScore = calculateRecommendationScore(slowImpactInput);

      expect(fastScore).toBeGreaterThan(slowScore);
    });

    it("should inversely weight dependency (fewer dependencies is better)", () => {
      const lowDependencyInput = {
        impact: 3,
        urgency: 3,
        confidence: 50,
        effort: 3,
        riskReduction: 50,
        timeToImpact: 180,
        cost: 3,
        reversibility: 50,
        dependency: 0,
        strategicAlignment: 3,
      };

      const highDependencyInput = {
        ...lowDependencyInput,
        dependency: 10,
      };

      const lowDepScore = calculateRecommendationScore(lowDependencyInput);
      const highDepScore = calculateRecommendationScore(highDependencyInput);

      expect(lowDepScore).toBeGreaterThan(highDepScore);
    });

    it("should clamp score to valid range [0, 1]", () => {
      const extremeInput = {
        impact: 999,
        urgency: 999,
        confidence: 999,
        effort: -999,
        riskReduction: 999,
        timeToImpact: -999,
        cost: -999,
        reversibility: 999,
        dependency: -999,
        strategicAlignment: 999,
      };

      const score = calculateRecommendationScore(extremeInput);

      expect(score).toBeLessThanOrEqual(1);
      expect(score).toBeGreaterThanOrEqual(0);
    });

    it("should match expected formula weights", () => {
      const input = {
        impact: 5,
        urgency: 5,
        confidence: 100,
        effort: 1,
        riskReduction: 100,
        timeToImpact: 1,
        cost: 1,
        reversibility: 100,
        dependency: 0,
        strategicAlignment: 5,
      };

      const score = calculateRecommendationScore(input);

      expect(score).toBeCloseTo(1.0, 2);
    });

    it("should handle median values correctly", () => {
      const medianInput = {
        impact: 3,
        urgency: 3,
        confidence: 50,
        effort: 3,
        riskReduction: 50,
        timeToImpact: 180,
        cost: 3,
        reversibility: 50,
        dependency: 5,
        strategicAlignment: 3,
      };

      const score = calculateRecommendationScore(medianInput);

      expect(score).toBeGreaterThan(0.3);
      expect(score).toBeLessThan(0.7);
    });
  });
});
