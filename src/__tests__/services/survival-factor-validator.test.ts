import { SurvivalFactorValidator } from "@/services/survival-factor-validator";
import {
  SurvivalFactorHealth,
  SurvivalFactorAssessment,
} from "@/domain/reality/survival-factors";

describe("SurvivalFactorValidator", () => {
  describe("validateAssessment", () => {
    it("should reject assessment with missing factor", () => {
      expect(() => {
        SurvivalFactorValidator.validateAssessment({
          current_value: 5,
          last_measured_at: new Date(),
        });
      }).toThrow("missing required field: factor");
    });

    it("should reject assessment with unknown factor", () => {
      expect(() => {
        SurvivalFactorValidator.validateAssessment({
          factor: "unknown_factor" as any,
          current_value: 5,
          last_measured_at: new Date(),
        });
      }).toThrow("Unknown survival factor");
    });

    it("should reject assessment with missing current_value", () => {
      expect(() => {
        SurvivalFactorValidator.validateAssessment({
          factor: "cash_runway_months",
          last_measured_at: new Date(),
        });
      }).toThrow("missing current_value");
    });

    it("should reject assessment with non-numeric current_value", () => {
      expect(() => {
        SurvivalFactorValidator.validateAssessment({
          factor: "cash_runway_months",
          current_value: "five" as any,
          last_measured_at: new Date(),
        });
      }).toThrow("must be number");
    });

    it("should reject assessment with missing last_measured_at", () => {
      expect(() => {
        SurvivalFactorValidator.validateAssessment({
          factor: "cash_runway_months",
          current_value: 5,
        });
      }).toThrow("missing last_measured_at");
    });

    it("should reject assessment with invalid measurement_confidence", () => {
      expect(() => {
        SurvivalFactorValidator.validateAssessment({
          factor: "cash_runway_months",
          current_value: 5,
          last_measured_at: new Date(),
          measurement_confidence: "invalid" as any,
        });
      }).toThrow("Invalid measurement_confidence");
    });

    it("should accept valid assessment with all required fields", () => {
      expect(() => {
        SurvivalFactorValidator.validateAssessment({
          factor: "cash_runway_months",
          category: "financial",
          current_value: 8,
          last_measured_at: new Date(),
          health: SurvivalFactorHealth.HEALTHY,
          measurement_confidence: "high",
          threshold_critical: 3,
          threshold_warning: 6,
        });
      }).not.toThrow();
    });
  });

  describe("classifyHealth", () => {
    it("should classify cash_runway_months as CRITICAL when below 3", () => {
      const health = SurvivalFactorValidator.classifyHealth(
        "cash_runway_months",
        2
      );
      expect(health).toBe(SurvivalFactorHealth.CRITICAL);
    });

    it("should classify cash_runway_months as WARNING when below 6 but above 3", () => {
      const health = SurvivalFactorValidator.classifyHealth(
        "cash_runway_months",
        4
      );
      expect(health).toBe(SurvivalFactorHealth.WARNING);
    });

    it("should classify cash_runway_months as HEALTHY when above 12", () => {
      const health = SurvivalFactorValidator.classifyHealth(
        "cash_runway_months",
        15
      );
      expect(health).toBe(SurvivalFactorHealth.HEALTHY);
    });

    it("should classify margin_health_pct as CRITICAL when below 10", () => {
      const health = SurvivalFactorValidator.classifyHealth("margin_health_pct", 5);
      expect(health).toBe(SurvivalFactorHealth.CRITICAL);
    });

    it("should classify infrastructure_stability as HEALTHY when above threshold", () => {
      const health = SurvivalFactorValidator.classifyHealth(
        "infrastructure_stability",
        0.995
      );
      expect(health).toBe(SurvivalFactorHealth.HEALTHY);
    });
  });

  describe("getCategory", () => {
    it("should return financial for financial factors", () => {
      expect(SurvivalFactorValidator.getCategory("cash_runway_months")).toBe(
        "financial"
      );
      expect(SurvivalFactorValidator.getCategory("margin_health_pct")).toBe(
        "financial"
      );
    });

    it("should return operational for operational factors", () => {
      expect(SurvivalFactorValidator.getCategory("team_churn_rate")).toBe(
        "operational"
      );
      expect(SurvivalFactorValidator.getCategory("key_person_dependency")).toBe(
        "operational"
      );
    });

    it("should return market for market factors", () => {
      expect(
        SurvivalFactorValidator.getCategory("customer_concentration_ratio")
      ).toBe("market");
    });

    it("should return strategic for strategic factors", () => {
      expect(
        SurvivalFactorValidator.getCategory("technology_debt_burden")
      ).toBe("strategic");
    });
  });

  describe("getThresholds", () => {
    it("should return thresholds for known factor", () => {
      const thresholds = SurvivalFactorValidator.getThresholds(
        "cash_runway_months"
      );
      expect(thresholds).toBeDefined();
      expect(thresholds.critical_below).toBe(3);
      expect(thresholds.warning_below).toBe(6);
      expect(thresholds.healthy_above).toBe(12);
      expect(thresholds.unit).toBe("months");
    });
  });

  describe("validateTenantContext", () => {
    it("should reject assessment without workspaceId", () => {
      expect(() => {
        SurvivalFactorValidator.validateTenantContext(undefined, "user-id");
      }).toThrow("workspaceId");
    });

    it("should reject assessment without userId", () => {
      expect(() => {
        SurvivalFactorValidator.validateTenantContext("workspace-id", undefined);
      }).toThrow("userId");
    });

    it("should accept assessment with both workspaceId and userId", () => {
      expect(() => {
        SurvivalFactorValidator.validateTenantContext("workspace-id", "user-id");
      }).not.toThrow();
    });
  });

  describe("hasCriticalFactors", () => {
    it("should detect critical assessments", () => {
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
      expect(SurvivalFactorValidator.hasCriticalFactors(assessments)).toBe(true);
    });

    it("should return false when no critical assessments", () => {
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
      expect(SurvivalFactorValidator.hasCriticalFactors(assessments)).toBe(false);
    });
  });

  describe("hasWarningFactors", () => {
    it("should detect warning assessments", () => {
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
      ];
      expect(SurvivalFactorValidator.hasWarningFactors(assessments)).toBe(true);
    });
  });

  describe("groupByCategory", () => {
    it("should group assessments by category", () => {
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
          health: SurvivalFactorHealth.HEALTHY,
          current_value: 8,
          threshold_critical: 30,
          threshold_warning: 20,
          last_measured_at: new Date(),
          measurement_confidence: "high",
        },
      ];
      const grouped = SurvivalFactorValidator.groupByCategory(assessments);
      expect(grouped.financial).toHaveLength(1);
      expect(grouped.operational).toHaveLength(1);
      expect(grouped.financial[0].factor).toBe("cash_runway_months");
    });
  });

  describe("validateMeasurementRecency", () => {
    it("should accept recent measurements (< 30 days)", () => {
      const recent = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      expect(SurvivalFactorValidator.validateMeasurementRecency(recent)).toBe(true);
    });

    it("should reject stale measurements (> 30 days)", () => {
      const stale = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
      expect(SurvivalFactorValidator.validateMeasurementRecency(stale)).toBe(false);
    });

    it("should respect custom maxAgeDays parameter", () => {
      const measurement = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
      expect(SurvivalFactorValidator.validateMeasurementRecency(measurement, 20)).toBe(
        true
      );
      expect(SurvivalFactorValidator.validateMeasurementRecency(measurement, 10)).toBe(
        false
      );
    });
  });
});
