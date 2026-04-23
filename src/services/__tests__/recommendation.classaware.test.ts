import { describe, it, expect } from "vitest";
import { calculateRecommendationScore } from "@/services/recommendation";

describe("Recommendation Class-Aware Scoring", () => {
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

  const highUrgencyMetrics = {
    impact: 2,
    urgency: 5,
    confidence: 40,
    effort: 4,
    riskReduction: 70,
    timeToImpact: 10,
    cost: 4,
    reversibility: 60,
    dependency: 8,
    strategicAlignment: 1,
  };

  const lowEffortMetrics = {
    impact: 2,
    urgency: 2,
    confidence: 40,
    effort: 1,
    riskReduction: 30,
    timeToImpact: 180,
    cost: 1,
    reversibility: 50,
    dependency: 2,
    strategicAlignment: 2,
  };

  const highImpactMetrics = {
    impact: 5,
    urgency: 2,
    confidence: 80,
    effort: 4,
    riskReduction: 40,
    timeToImpact: 200,
    cost: 4,
    reversibility: 70,
    dependency: 8,
    strategicAlignment: 5,
  };

  describe("CONTAINMENT class", () => {
    it("should boost urgency and risk reduction weights", () => {
      const baseScore = calculateRecommendationScore(baseMetrics);
      const containmentScore = calculateRecommendationScore(baseMetrics, "containment");

      expect(containmentScore).not.toEqual(baseScore);
    });

    it("should score high urgency/risk reduction metrics well", () => {
      const score = calculateRecommendationScore(highUrgencyMetrics, "containment");

      expect(score).toBeGreaterThan(0.5);
    });

    it("should prioritize urgency in containment vs growth", () => {
      const urgentMetrics = {
        impact: 1,
        urgency: 5,
        confidence: 80,
        effort: 4,
        riskReduction: 80,
        timeToImpact: 10,
        cost: 4,
        reversibility: 60,
        dependency: 8,
        strategicAlignment: 1,
      };

      const containmentScore = calculateRecommendationScore(urgentMetrics, "containment");
      const growthScore = calculateRecommendationScore(urgentMetrics, "growth");

      expect(containmentScore).toBeGreaterThan(growthScore);
    });

    it("should prioritize urgency over impact", () => {
      const urgentMetrics = {
        ...baseMetrics,
        urgency: 5,
        impact: 1,
      };

      const score = calculateRecommendationScore(urgentMetrics, "containment");

      expect(score).toBeGreaterThan(0.45);
    });
  });

  describe("STABILIZATION class", () => {
    it("should boost effort efficiency and low dependency", () => {
      const stabMetrics = {
        impact: 2,
        urgency: 2,
        confidence: 50,
        effort: 1,
        riskReduction: 40,
        timeToImpact: 180,
        cost: 1,
        reversibility: 50,
        dependency: 1,
        strategicAlignment: 2,
      };

      const score = calculateRecommendationScore(stabMetrics, "stabilization");

      expect(score).toBeGreaterThan(0.5);
    });

    it("should score low effort metrics better in stabilization", () => {
      const stabMetrics = {
        impact: 2,
        urgency: 2,
        confidence: 50,
        effort: 1,
        riskReduction: 40,
        timeToImpact: 180,
        cost: 1,
        reversibility: 50,
        dependency: 1,
        strategicAlignment: 2,
      };

      const stabScore = calculateRecommendationScore(stabMetrics, "stabilization");
      const growthScore = calculateRecommendationScore(stabMetrics, "growth");

      expect(stabScore).toBeGreaterThan(growthScore);
    });

    it("should prefer lower dependency", () => {
      const lowDepMetrics = {
        ...baseMetrics,
        dependency: 1,
        effort: 2,
      };

      const highDepMetrics = {
        ...baseMetrics,
        dependency: 9,
        effort: 2,
      };

      const lowDepScore = calculateRecommendationScore(lowDepMetrics, "stabilization");
      const highDepScore = calculateRecommendationScore(highDepMetrics, "stabilization");

      expect(lowDepScore).toBeGreaterThan(highDepScore);
    });
  });

  describe("GROWTH class", () => {
    it("should emphasize impact and strategic alignment", () => {
      const growthMetrics = {
        impact: 5,
        strategicAlignment: 5,
        urgency: 1,
        confidence: 80,
        effort: 4,
        riskReduction: 40,
        timeToImpact: 200,
        cost: 4,
        reversibility: 70,
        dependency: 8,
      };

      const growthScore = calculateRecommendationScore(growthMetrics, "growth");

      expect(growthScore).toBeGreaterThan(0.7);
    });

    it("should score high impact metrics highly", () => {
      const score = calculateRecommendationScore(highImpactMetrics, "growth");

      expect(score).toBeGreaterThan(0.7);
    });

    it("should score low impact metrics lower than containment", () => {
      const lowImpactMetrics = {
        ...baseMetrics,
        impact: 1,
        strategicAlignment: 1,
      };

      const growthScore = calculateRecommendationScore(lowImpactMetrics, "growth");
      const containmentScore = calculateRecommendationScore(lowImpactMetrics, "containment");

      expect(growthScore).toBeLessThan(containmentScore);
    });

    it("should prioritize impact and strategic alignment", () => {
      const metrics = {
        ...baseMetrics,
        impact: 5,
        strategicAlignment: 5,
        urgency: 1,
      };

      const score = calculateRecommendationScore(metrics, "growth");

      expect(score).toBeGreaterThan(0.7);
    });
  });

  describe("No class (default behavior)", () => {
    it("should use base weights when no class provided", () => {
      const score1 = calculateRecommendationScore(baseMetrics);
      const score2 = calculateRecommendationScore(baseMetrics, undefined);

      expect(score1).toEqual(score2);
    });

    it("should score balanced metrics in middle range", () => {
      const score = calculateRecommendationScore(baseMetrics);

      expect(score).toBeGreaterThan(0.3);
      expect(score).toBeLessThan(0.7);
    });
  });

  describe("Class-specific emphasis", () => {
    it("CONTAINMENT should emphasize urgency more than GROWTH", () => {
      const urgentMetrics = {
        ...baseMetrics,
        urgency: 5,
        impact: 1,
      };

      const containmentScore = calculateRecommendationScore(urgentMetrics, "containment");
      const growthScore = calculateRecommendationScore(urgentMetrics, "growth");

      expect(containmentScore).toBeGreaterThan(growthScore);
    });

    it("STABILIZATION should emphasize effort efficiency more than GROWTH", () => {
      const easyMetrics = {
        ...baseMetrics,
        effort: 1,
        impact: 1,
      };

      const stabScore = calculateRecommendationScore(easyMetrics, "stabilization");
      const growthScore = calculateRecommendationScore(easyMetrics, "growth");

      expect(stabScore).toBeGreaterThan(growthScore);
    });

    it("GROWTH should emphasize impact more than CONTAINMENT", () => {
      const impactMetrics = {
        ...baseMetrics,
        impact: 5,
        strategicAlignment: 5,
        urgency: 1,
      };

      const growthScore = calculateRecommendationScore(impactMetrics, "growth");
      const containmentScore = calculateRecommendationScore(impactMetrics, "containment");

      expect(growthScore).toBeGreaterThan(containmentScore);
    });
  });

  describe("Weight consistency", () => {
    it("all classes should return scores in [0, 1] range", () => {
      const classes = ["containment", "stabilization", "growth"] as const;

      classes.forEach((cls) => {
        const score = calculateRecommendationScore(baseMetrics, cls);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      });
    });

    it("extreme values should still stay in bounds", () => {
      const extremeMetrics = {
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

      const classes = ["containment", "stabilization", "growth"] as const;

      classes.forEach((cls) => {
        const score = calculateRecommendationScore(extremeMetrics, cls);
        expect(score).toBeLessThanOrEqual(1);
        expect(score).toBeGreaterThanOrEqual(0);
      });
    });
  });
});
