import { describe, it, expect } from "vitest";
import { calculateRecommendationScoreBreakdown, calculateRecommendationScore } from "@/services/recommendation";

describe("Recommendation Scoring Explainability", () => {
  const baseMetrics = {
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

  describe("calculateRecommendationScoreBreakdown", () => {
    it("should return complete breakdown structure", () => {
      const breakdown = calculateRecommendationScoreBreakdown(baseMetrics);

      expect(breakdown).toHaveProperty("class");
      expect(breakdown).toHaveProperty("weights");
      expect(breakdown).toHaveProperty("normalizedInputs");
      expect(breakdown).toHaveProperty("contributions");
      expect(breakdown).toHaveProperty("finalScore");
    });

    it("should normalize all inputs to [0, 1]", () => {
      const breakdown = calculateRecommendationScoreBreakdown(baseMetrics);

      Object.values(breakdown.normalizedInputs).forEach((value) => {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      });
    });

    it("should calculate contributions matching weights and normalized inputs", () => {
      const breakdown = calculateRecommendationScoreBreakdown(baseMetrics);

      expect(breakdown.contributions.impact).toBeCloseTo(
        breakdown.normalizedInputs.impact * breakdown.weights.impact,
        5
      );
      expect(breakdown.contributions.urgency).toBeCloseTo(
        breakdown.normalizedInputs.urgency * breakdown.weights.urgency,
        5
      );
      expect(breakdown.contributions.confidence).toBeCloseTo(
        breakdown.normalizedInputs.confidence * breakdown.weights.confidence,
        5
      );
    });

    it("should handle inverse weights for effort, cost, timeToImpact, dependency", () => {
      const breakdown = calculateRecommendationScoreBreakdown(baseMetrics);

      expect(breakdown.contributions.effort).toBeCloseTo(
        (1 - breakdown.normalizedInputs.effort) * breakdown.weights.effort,
        5
      );
      expect(breakdown.contributions.cost).toBeCloseTo(
        (1 - breakdown.normalizedInputs.cost) * breakdown.weights.cost,
        5
      );
      expect(breakdown.contributions.timeToImpact).toBeCloseTo(
        (1 - breakdown.normalizedInputs.timeToImpact) * breakdown.weights.timeToImpact,
        5
      );
      expect(breakdown.contributions.dependency).toBeCloseTo(
        (1 - breakdown.normalizedInputs.dependency) * breakdown.weights.dependency,
        5
      );
    });

    it("final score should match sum of contributions", () => {
      const breakdown = calculateRecommendationScoreBreakdown(baseMetrics);

      const sumOfContributions = Object.values(breakdown.contributions).reduce((a, b) => a + b, 0);

      expect(breakdown.finalScore).toBeCloseTo(Math.min(Math.max(sumOfContributions, 0), 1), 5);
    });

    it("should match calculateRecommendationScore result", () => {
      const breakdown = calculateRecommendationScoreBreakdown(baseMetrics);
      const score = calculateRecommendationScore(baseMetrics);

      expect(breakdown.finalScore).toEqual(score);
    });

    it("should include class when provided", () => {
      const breakdown = calculateRecommendationScoreBreakdown(baseMetrics, "containment");

      expect(breakdown.class).toBe("containment");
    });

    it("should adjust weights based on class", () => {
      const baseBreakdown = calculateRecommendationScoreBreakdown(baseMetrics);
      const containmentBreakdown = calculateRecommendationScoreBreakdown(baseMetrics, "containment");
      const growthBreakdown = calculateRecommendationScoreBreakdown(baseMetrics, "growth");

      expect(containmentBreakdown.weights.urgency).not.toEqual(baseBreakdown.weights.urgency);
      expect(growthBreakdown.weights.impact).not.toEqual(baseBreakdown.weights.impact);
    });

    it("weights should sum to 1.0", () => {
      const breakdown = calculateRecommendationScoreBreakdown(baseMetrics);

      const weightSum = Object.values(breakdown.weights).reduce((a, b) => a + b, 0);

      expect(weightSum).toBeCloseTo(1.0, 5);
    });

    it("should handle extreme inputs gracefully", () => {
      const extremeMetrics = {
        impact: 999,
        urgency: -999,
        confidence: 0,
        effort: 100,
        riskReduction: -100,
        timeToImpact: 10000,
        cost: 0.001,
        reversibility: 200,
        dependency: -50,
        strategicAlignment: 50,
      };

      const breakdown = calculateRecommendationScoreBreakdown(extremeMetrics);

      expect(breakdown.finalScore).toBeGreaterThanOrEqual(0);
      expect(breakdown.finalScore).toBeLessThanOrEqual(1);
    });

    it("should be serializable to JSON", () => {
      const breakdown = calculateRecommendationScoreBreakdown(baseMetrics);
      const json = JSON.stringify(breakdown);
      const parsed = JSON.parse(json);

      expect(parsed.finalScore).toEqual(breakdown.finalScore);
      expect(parsed.class).toEqual(breakdown.class);
      expect(Object.keys(parsed.contributions).length).toBe(Object.keys(breakdown.contributions).length);
    });
  });

  describe("Audit trail consistency", () => {
    it("should produce reproducible breakdown for same inputs", () => {
      const breakdown1 = calculateRecommendationScoreBreakdown(baseMetrics, "growth");
      const breakdown2 = calculateRecommendationScoreBreakdown(baseMetrics, "growth");

      expect(JSON.stringify(breakdown1)).toEqual(JSON.stringify(breakdown2));
    });

    it("different classes should produce different contributions", () => {
      const containment = calculateRecommendationScoreBreakdown(baseMetrics, "containment");
      const stabilization = calculateRecommendationScoreBreakdown(baseMetrics, "stabilization");
      const growth = calculateRecommendationScoreBreakdown(baseMetrics, "growth");

      expect(containment.contributions).not.toEqual(stabilization.contributions);
      expect(stabilization.contributions).not.toEqual(growth.contributions);
    });

    it("breakdown should match scoring logic exactly", () => {
      const metrics = {
        impact: 4,
        urgency: 2,
        confidence: 75,
        effort: 2,
        riskReduction: 60,
        timeToImpact: 90,
        cost: 2,
        reversibility: 80,
        dependency: 3,
        strategicAlignment: 4,
      };

      const breakdown = calculateRecommendationScoreBreakdown(metrics, "growth");
      const directScore = calculateRecommendationScore(metrics, "growth");

      expect(breakdown.finalScore).toEqual(directScore);

      const manualSum = Object.values(breakdown.contributions).reduce((a, b) => a + b, 0);
      expect(Math.min(Math.max(manualSum, 0), 1)).toEqual(directScore);
    });
  });

  describe("Transparency and auditability", () => {
    it("should show exact normalized value for each input", () => {
      const breakdown = calculateRecommendationScoreBreakdown({
        ...baseMetrics,
        impact: 5,
        urgency: 1,
      });

      expect(breakdown.normalizedInputs.impact).toBe(1.0);
      expect(breakdown.normalizedInputs.urgency).toBe(0.0);
    });

    it("should clearly show contribution of each factor", () => {
      const breakdown = calculateRecommendationScoreBreakdown(baseMetrics, "containment");

      expect(breakdown.contributions.urgency).toBeGreaterThan(0);
      expect(breakdown.contributions.riskReduction).toBeGreaterThan(0);

      const urgencyPercentage = (breakdown.contributions.urgency / breakdown.finalScore) * 100;
      const riskReductionPercentage = (breakdown.contributions.riskReduction / breakdown.finalScore) * 100;

      expect(urgencyPercentage).toBeGreaterThan(0);
      expect(riskReductionPercentage).toBeGreaterThan(0);
    });

    it("should show which metrics help vs hurt the score", () => {
      const breakdown = calculateRecommendationScoreBreakdown({
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
      });

      expect(breakdown.contributions.impact).toBeLessThan(0.1);
      expect(breakdown.contributions.effort).toBeLessThan(0.1);
      expect(breakdown.contributions.cost).toBeLessThan(0.05);
    });
  });
});
