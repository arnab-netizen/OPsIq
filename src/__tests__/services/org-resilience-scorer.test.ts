import { OrgResilienceScorer, ResilienceLevel } from "@/services/org-resilience-scorer";
import { SurvivalFactorHealth, SurvivalFactorAssessment } from "@/domain/reality/survival-factors";

describe("OrgResilienceScorer", () => {
  const workspaceId = "ws-test-456";

  describe("scoreResilience", () => {
    it("should return highly resilient score with all healthy factors", () => {
      const assessments: SurvivalFactorAssessment[] = [
        {
          factor: "cash_runway_months",
          category: "financial",
          health: SurvivalFactorHealth.HEALTHY,
          current_value: 15,
          threshold_critical: 3,
          threshold_warning: 6,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
        {
          factor: "margin_health_pct",
          category: "financial",
          health: SurvivalFactorHealth.HEALTHY,
          current_value: 40,
          threshold_critical: 10,
          threshold_warning: 20,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
        {
          factor: "team_churn_rate",
          category: "operational",
          health: SurvivalFactorHealth.HEALTHY,
          current_value: 8,
          threshold_critical: 30,
          threshold_warning: 20,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
      ];

      const score = OrgResilienceScorer.scoreResilience(assessments, workspaceId);

      expect(score.level).toBe(ResilienceLevel.HIGHLY_RESILIENT);
      expect(score.overallScore).toBeGreaterThanOrEqual(80);
      expect(score.shockAbsorptionCapacity).toBe(3);
    });

    it("should return at-risk score with multiple critical factors", () => {
      const assessments: SurvivalFactorAssessment[] = [
        {
          factor: "cash_runway_months",
          category: "financial",
          health: SurvivalFactorHealth.CRITICAL,
          current_value: 2,
          threshold_critical: 3,
          threshold_warning: 6,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
        {
          factor: "margin_health_pct",
          category: "financial",
          health: SurvivalFactorHealth.CRITICAL,
          current_value: 5,
          threshold_critical: 10,
          threshold_warning: 20,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
        {
          factor: "team_churn_rate",
          category: "operational",
          health: SurvivalFactorHealth.CRITICAL,
          current_value: 35,
          threshold_critical: 30,
          threshold_warning: 20,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
      ];

      const score = OrgResilienceScorer.scoreResilience(assessments, workspaceId);

      expect(score.level).toBe(ResilienceLevel.AT_RISK);
      expect(score.overallScore).toBeLessThan(40);
      expect(score.shockAbsorptionCapacity).toBe(0);
    });

    it("should return fragile score with mixed healthy and warning factors", () => {
      const assessments: SurvivalFactorAssessment[] = [
        {
          factor: "cash_runway_months",
          category: "financial",
          health: SurvivalFactorHealth.HEALTHY,
          current_value: 15,
          threshold_critical: 3,
          threshold_warning: 6,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
        {
          factor: "margin_health_pct",
          category: "financial",
          health: SurvivalFactorHealth.WARNING,
          current_value: 22,
          threshold_critical: 10,
          threshold_warning: 20,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
        {
          factor: "team_churn_rate",
          category: "operational",
          health: SurvivalFactorHealth.WARNING,
          current_value: 22,
          threshold_critical: 30,
          threshold_warning: 20,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
      ];

      const score = OrgResilienceScorer.scoreResilience(assessments, workspaceId);

      expect(score.level).toBe(ResilienceLevel.FRAGILE);
      expect(score.overallScore).toBeGreaterThanOrEqual(40);
      expect(score.overallScore).toBeLessThan(60);
      expect(score.shockAbsorptionCapacity).toBe(1);
    });

    it("should require workspaceId for tenant scoping", () => {
      const assessments: SurvivalFactorAssessment[] = [];

      expect(() => {
        OrgResilienceScorer.scoreResilience(assessments, "");
      }).toThrow("workspaceId");
    });

    it("should identify critical gaps (low-scoring categories)", () => {
      const assessments: SurvivalFactorAssessment[] = [
        {
          factor: "cash_runway_months",
          category: "financial",
          health: SurvivalFactorHealth.CRITICAL,
          current_value: 2,
          threshold_critical: 3,
          threshold_warning: 6,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
        {
          factor: "team_churn_rate",
          category: "operational",
          health: SurvivalFactorHealth.HEALTHY,
          current_value: 8,
          threshold_critical: 30,
          threshold_warning: 20,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
      ];

      const score = OrgResilienceScorer.scoreResilience(assessments, workspaceId);

      expect(score.criticalGaps.length).toBeGreaterThan(0);
      expect(score.criticalGaps[0]).toContain("financial");
    });

    it("should identify strength areas (high-scoring categories)", () => {
      const assessments: SurvivalFactorAssessment[] = [
        {
          factor: "team_churn_rate",
          category: "operational",
          health: SurvivalFactorHealth.HEALTHY,
          current_value: 8,
          threshold_critical: 30,
          threshold_warning: 20,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
        {
          factor: "infrastructure_stability",
          category: "operational",
          health: SurvivalFactorHealth.HEALTHY,
          current_value: 0.995,
          threshold_critical: 0.95,
          threshold_warning: 0.98,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
      ];

      const score = OrgResilienceScorer.scoreResilience(assessments, workspaceId);

      expect(score.strengthAreas.length).toBeGreaterThan(0);
      expect(score.strengthAreas[0]).toContain("operational");
    });

    it("should estimate recovery timeline based on resilience", () => {
      const healthyAssessments: SurvivalFactorAssessment[] = [
        {
          factor: "cash_runway_months",
          category: "financial",
          health: SurvivalFactorHealth.HEALTHY,
          current_value: 15,
          threshold_critical: 3,
          threshold_warning: 6,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
      ];

      const criticalAssessments: SurvivalFactorAssessment[] = [
        {
          factor: "cash_runway_months",
          category: "financial",
          health: SurvivalFactorHealth.CRITICAL,
          current_value: 2,
          threshold_critical: 3,
          threshold_warning: 6,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
      ];

      const healthyScore = OrgResilienceScorer.scoreResilience(
        healthyAssessments,
        workspaceId
      );
      const criticalScore = OrgResilienceScorer.scoreResilience(
        criticalAssessments,
        workspaceId
      );

      // Critical factors should have longer recovery timeline
      expect(criticalScore.recoveryTimelineDays).toBeGreaterThan(
        healthyScore.recoveryTimelineDays
      );
    });
  });

  describe("isInResilienceCrisis", () => {
    it("should return true when >50% factors are unhealthy", () => {
      const assessments: SurvivalFactorAssessment[] = [
        {
          factor: "cash_runway_months",
          category: "financial",
          health: SurvivalFactorHealth.CRITICAL,
          current_value: 2,
          threshold_critical: 3,
          threshold_warning: 6,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
        {
          factor: "margin_health_pct",
          category: "financial",
          health: SurvivalFactorHealth.WARNING,
          current_value: 22,
          threshold_critical: 10,
          threshold_warning: 20,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
        {
          factor: "team_churn_rate",
          category: "operational",
          health: SurvivalFactorHealth.HEALTHY,
          current_value: 8,
          threshold_critical: 30,
          threshold_warning: 20,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
      ];

      expect(OrgResilienceScorer.isInResilienceCrisis(assessments)).toBe(true);
    });

    it("should return false when <50% factors are unhealthy", () => {
      const assessments: SurvivalFactorAssessment[] = [
        {
          factor: "cash_runway_months",
          category: "financial",
          health: SurvivalFactorHealth.WARNING,
          current_value: 5,
          threshold_critical: 3,
          threshold_warning: 6,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
        {
          factor: "margin_health_pct",
          category: "financial",
          health: SurvivalFactorHealth.HEALTHY,
          current_value: 40,
          threshold_critical: 10,
          threshold_warning: 20,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
        {
          factor: "team_churn_rate",
          category: "operational",
          health: SurvivalFactorHealth.HEALTHY,
          current_value: 8,
          threshold_critical: 30,
          threshold_warning: 20,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
      ];

      expect(OrgResilienceScorer.isInResilienceCrisis(assessments)).toBe(false);
    });
  });

  describe("getDetailedBreakdown", () => {
    it("should return category-level resilience scores", () => {
      const assessments: SurvivalFactorAssessment[] = [
        {
          factor: "cash_runway_months",
          category: "financial",
          health: SurvivalFactorHealth.HEALTHY,
          current_value: 15,
          threshold_critical: 3,
          threshold_warning: 6,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
        {
          factor: "team_churn_rate",
          category: "operational",
          health: SurvivalFactorHealth.CRITICAL,
          current_value: 35,
          threshold_critical: 30,
          threshold_warning: 20,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
      ];

      const breakdown = OrgResilienceScorer.getDetailedBreakdown(
        assessments,
        workspaceId
      );

      expect(breakdown.financial).toBeDefined();
      expect(breakdown.operational).toBeDefined();
      expect(breakdown.financial.score).toBeGreaterThan(breakdown.operational.score);
    });
  });
});
