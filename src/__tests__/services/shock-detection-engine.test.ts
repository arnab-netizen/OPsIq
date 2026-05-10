import { ShockDetectionEngine, ShockSeverity, ShockCategory } from "@/services/shock-detection-engine";
import { SurvivalFactorHealth, SurvivalFactorAssessment } from "@/domain/reality/survival-factors";

describe("ShockDetectionEngine", () => {
  const workspaceId = "ws-test-123";

  describe("detectShock", () => {
    it("should return no shock when no critical factors", () => {
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
      ];

      const signal = ShockDetectionEngine.detectShock(assessments, workspaceId);

      expect(signal.shockDetected).toBe(false);
      expect(signal.severity).toBe(ShockSeverity.MEDIUM);
      expect(signal.triggeringFactors).toHaveLength(0);
    });

    it("should detect shock with one critical factor", () => {
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
      ];

      const signal = ShockDetectionEngine.detectShock(assessments, workspaceId);

      expect(signal.shockDetected).toBe(true);
      expect(signal.severity).toBe(ShockSeverity.CRITICAL);
      expect(signal.triggeringFactors).toContain("cash_runway_months");
      expect(signal.category).toBe(ShockCategory.FINANCIAL);
    });

    it("should elevate to CRITICAL with multiple critical factors", () => {
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
      ];

      const signal = ShockDetectionEngine.detectShock(assessments, workspaceId);

      expect(signal.shockDetected).toBe(true);
      expect(signal.severity).toBe(ShockSeverity.CRITICAL);
      expect(signal.triggeringFactors).toHaveLength(2);
    });

    it("should categorize shock by majority critical factor category", () => {
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
          health: SurvivalFactorHealth.CRITICAL,
          current_value: 35,
          threshold_critical: 30,
          threshold_warning: 20,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
        {
          factor: "infrastructure_stability",
          category: "operational",
          health: SurvivalFactorHealth.CRITICAL,
          current_value: 0.94,
          threshold_critical: 0.95,
          threshold_warning: 0.98,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
      ];

      const signal = ShockDetectionEngine.detectShock(assessments, workspaceId);

      expect(signal.category).toBe(ShockCategory.OPERATIONAL); // 2 operational, 1 financial
    });

    it("should require workspaceId for tenant scoping", () => {
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
      ];

      expect(() => {
        ShockDetectionEngine.detectShock(assessments, "");
      }).toThrow("workspaceId");
    });

    it("should generate unique shock IDs", () => {
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
      ];

      const signal1 = ShockDetectionEngine.detectShock(assessments, workspaceId);
      const signal2 = ShockDetectionEngine.detectShock(assessments, workspaceId);

      expect(signal1.id).not.toBe(signal2.id);
    });
  });

  describe("isInSurvivalMode", () => {
    it("should return true when any critical factors present", () => {
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
      ];

      expect(ShockDetectionEngine.isInSurvivalMode(assessments)).toBe(true);
    });

    it("should return false when no critical factors", () => {
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
      ];

      expect(ShockDetectionEngine.isInSurvivalMode(assessments)).toBe(false);
    });
  });

  describe("criticalFactorsByCategory", () => {
    it("should count critical factors by category", () => {
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
        {
          factor: "revenue_stability_coefficient",
          category: "financial",
          health: SurvivalFactorHealth.HEALTHY,
          current_value: 0.8,
          threshold_critical: 0.3,
          threshold_warning: 0.5,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
      ];

      const counts = ShockDetectionEngine.criticalFactorsByCategory(assessments);

      expect(counts.financial).toBe(2);
      expect(counts.operational).toBe(1);
      expect(counts.market).toBe(0);
      expect(counts.strategic).toBe(0);
    });
  });

  describe("recommendation logic", () => {
    it("should recommend financial action for financial shock", () => {
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
      ];

      const signal = ShockDetectionEngine.detectShock(assessments, workspaceId);

      expect(signal.recommendedAction).toContain("financial");
      expect(signal.recommendedAction).toContain("runway");
    });

    it("should recommend operational action for operational shock", () => {
      const assessments: SurvivalFactorAssessment[] = [
        {
          factor: "key_person_dependency",
          category: "operational",
          health: SurvivalFactorHealth.CRITICAL,
          current_value: 0.95,
          threshold_critical: 0.7,
          threshold_warning: 0.5,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
      ];

      const signal = ShockDetectionEngine.detectShock(assessments, workspaceId);

      expect(signal.recommendedAction).toContain("operational");
      expect(signal.recommendedAction).toContain("dependencies");
    });
  });
});
