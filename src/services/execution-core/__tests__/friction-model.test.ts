import { describe, it, expect } from "vitest";
import { FrictionModel } from "../friction-model";
import { v4 as uuidv4 } from "uuid";

describe("FrictionModel", () => {
  const model = new FrictionModel();

  describe("calculateFriction", () => {
    it("should return 0 delay for 0 dependencies", () => {
      const result = model.calculateFriction(0);

      expect(result.dependency_count).toBe(0);
      expect(result.friction_delay_days).toBe(0);
      expect(result.adjustment_factor).toBe(1);
    });

    it("should return 5 days delay for 1-2 dependencies", () => {
      const result1 = model.calculateFriction(1);
      const result2 = model.calculateFriction(2);

      expect(result1.friction_delay_days).toBe(5);
      expect(result2.friction_delay_days).toBe(5);
    });

    it("should return 10 days delay for 3-5 dependencies", () => {
      const result3 = model.calculateFriction(3);
      const result4 = model.calculateFriction(4);
      const result5 = model.calculateFriction(5);

      expect(result3.friction_delay_days).toBe(10);
      expect(result4.friction_delay_days).toBe(10);
      expect(result5.friction_delay_days).toBe(10);
    });

    it("should return 20 days delay for 6+ dependencies", () => {
      const result6 = model.calculateFriction(6);
      const result10 = model.calculateFriction(10);
      const result50 = model.calculateFriction(50);

      expect(result6.friction_delay_days).toBe(20);
      expect(result10.friction_delay_days).toBe(20);
      expect(result50.friction_delay_days).toBe(20);
    });

    it("should calculate adjustment factor correctly", () => {
      const result0 = model.calculateFriction(0);
      const result5 = model.calculateFriction(5);
      const result10 = model.calculateFriction(10);

      expect(result0.adjustment_factor).toBe(1);
      expect(result5.adjustment_factor).toBe(2); // 1 + 10/10
      expect(result10.adjustment_factor).toBe(3); // 1 + 20/10
    });
  });

  describe("adjustDuration", () => {
    it("should adjust duration by adding friction delay", () => {
      const action_id = uuidv4();
      const result = model.adjustDuration(action_id, 8, 3);

      expect(result.action_id).toBe(action_id);
      expect(result.base_effort_hours).toBe(8);
      expect(result.friction_delay_days).toBe(10);
      expect(result.adjusted_duration).toBe(18);
    });

    it("should provide adjustment reason for low friction", () => {
      const result = model.adjustDuration(uuidv4(), 8, 0);

      expect(result.adjustment_reason).toContain("Minimal");
    });

    it("should provide adjustment reason for medium friction", () => {
      const result = model.adjustDuration(uuidv4(), 8, 3);

      expect(result.adjustment_reason).toContain("Moderate");
    });

    it("should provide adjustment reason for high friction", () => {
      const result = model.adjustDuration(uuidv4(), 8, 7);

      expect(result.adjustment_reason).toContain("High");
    });

    it("should provide adjustment reason for critical friction", () => {
      const result = model.adjustDuration(uuidv4(), 8, 10);

      expect(result.adjustment_reason).toContain("Critical");
    });

    it("should handle zero effort hours", () => {
      const result = model.adjustDuration(uuidv4(), 0, 2);

      expect(result.base_effort_hours).toBe(0);
      expect(result.adjusted_duration).toBe(5); // 0 + 5
    });

    it("should handle fractional effort hours", () => {
      const result = model.adjustDuration(uuidv4(), 2.5, 1);

      expect(result.base_effort_hours).toBe(2.5);
      expect(result.adjusted_duration).toBe(7.5); // 2.5 + 5
    });
  });

  describe("analyzeFrictionImpact", () => {
    it("should calculate timeline increase for low friction", () => {
      const result = model.analyzeFrictionImpact(uuidv4(), 10, 0);

      expect(result.base_timeline_days).toBe(10);
      expect(result.friction_timeline_days).toBe(10);
      expect(result.timeline_increase_percent).toBe(0);
    });

    it("should calculate timeline increase for medium friction", () => {
      const result = model.analyzeFrictionImpact(uuidv4(), 10, 3);

      expect(result.base_timeline_days).toBe(10);
      expect(result.friction_timeline_days).toBe(20); // 10 + 10
      expect(result.timeline_increase_percent).toBe(100);
    });

    it("should calculate timeline increase for high friction", () => {
      const result = model.analyzeFrictionImpact(uuidv4(), 10, 6);

      expect(result.friction_timeline_days).toBe(30); // 10 + 20
      expect(result.timeline_increase_percent).toBe(200);
    });

    it("should calculate downstream delay impact", () => {
      const result3 = model.analyzeFrictionImpact(uuidv4(), 10, 3);
      const result6 = model.analyzeFrictionImpact(uuidv4(), 10, 6);

      expect(result3.downstream_delay_impact).toBe(10);
      expect(result6.downstream_delay_impact).toBe(20);
    });

    it("should handle zero base timeline", () => {
      const result = model.analyzeFrictionImpact(uuidv4(), 0, 5);

      expect(result.base_timeline_days).toBe(0);
      expect(result.friction_timeline_days).toBe(10);
      expect(result.timeline_increase_percent).toBe(0); // 0/0 case
    });
  });

  describe("getFrictionCategory", () => {
    it("should categorize 0 dependencies as low", () => {
      expect(model.getFrictionCategory(0)).toBe("low");
    });

    it("should categorize 1-2 dependencies as low", () => {
      expect(model.getFrictionCategory(1)).toBe("low");
      expect(model.getFrictionCategory(2)).toBe("low");
    });

    it("should categorize 3-5 dependencies as medium", () => {
      expect(model.getFrictionCategory(3)).toBe("medium");
      expect(model.getFrictionCategory(4)).toBe("medium");
      expect(model.getFrictionCategory(5)).toBe("medium");
    });

    it("should categorize 6-8 dependencies as high", () => {
      expect(model.getFrictionCategory(6)).toBe("high");
      expect(model.getFrictionCategory(7)).toBe("high");
      expect(model.getFrictionCategory(8)).toBe("high");
    });

    it("should categorize 9+ dependencies as critical", () => {
      expect(model.getFrictionCategory(9)).toBe("critical");
      expect(model.getFrictionCategory(10)).toBe("critical");
      expect(model.getFrictionCategory(50)).toBe("critical");
    });
  });

  describe("calculateTotalFriction", () => {
    it("should sum friction across all actions", () => {
      const actions = [
        { action_id: "A", dependency_count: 0 }, // 0 days
        { action_id: "B", dependency_count: 2 }, // 5 days
        { action_id: "C", dependency_count: 4 }, // 10 days
      ];

      const result = model.calculateTotalFriction(actions);

      expect(result.total_friction_days).toBe(15); // 0 + 5 + 10
      expect(result.avg_friction_days).toBe(5); // 15 / 3
      expect(result.max_friction_days).toBe(10);
    });

    it("should identify actions with high friction", () => {
      const actions = [
        { action_id: "A", dependency_count: 0 },
        { action_id: "B", dependency_count: 3 },
        { action_id: "C", dependency_count: 6 },
      ];

      const result = model.calculateTotalFriction(actions);

      expect(result.actions_with_high_friction).toContain("B");
      expect(result.actions_with_high_friction).toContain("C");
    });

    it("should handle empty action list", () => {
      const result = model.calculateTotalFriction([]);

      expect(result.total_friction_days).toBe(0);
      expect(result.avg_friction_days).toBe(0);
      expect(result.max_friction_days).toBe(0);
    });

    it("should handle single action", () => {
      const actions = [{ action_id: "A", dependency_count: 5 }];

      const result = model.calculateTotalFriction(actions);

      expect(result.total_friction_days).toBe(10);
      expect(result.avg_friction_days).toBe(10);
      expect(result.max_friction_days).toBe(10);
    });
  });

  describe("validateFrictionCalculation", () => {
    it("should validate correct calculation", () => {
      const calc = model.calculateFriction(3);
      const isValid = model.validateFrictionCalculation(calc);

      expect(isValid).toBe(true);
    });

    it("should reject negative friction delay", () => {
      const calc = {
        dependency_count: 0,
        friction_delay_days: -5,
        adjustment_factor: 1,
      };

      const isValid = model.validateFrictionCalculation(calc);

      expect(isValid).toBe(false);
    });

    it("should reject adjustment factor < 1", () => {
      const calc = {
        dependency_count: 2,
        friction_delay_days: 5,
        adjustment_factor: 0.5,
      };

      const isValid = model.validateFrictionCalculation(calc);

      expect(isValid).toBe(false);
    });

    it("should warn on unusually high friction", () => {
      const calc = {
        dependency_count: 100,
        friction_delay_days: 50,
        adjustment_factor: 6,
      };

      const isValid = model.validateFrictionCalculation(calc);

      expect(isValid).toBe(true); // Warns but doesn't fail
    });
  });

  describe("getMitigationStrategies", () => {
    it("should return strategies for low friction", () => {
      const result = model.getMitigationStrategies(0);

      expect(result.friction_category).toBe("low");
      expect(result.recommended_strategies.length).toBeGreaterThan(0);
    });

    it("should return strategies for medium friction", () => {
      const result = model.getMitigationStrategies(4);

      expect(result.friction_category).toBe("medium");
      expect(result.recommended_strategies).toContain(
        "Establish clear communication channels"
      );
    });

    it("should return strategies for high friction", () => {
      const result = model.getMitigationStrategies(7);

      expect(result.friction_category).toBe("high");
      expect(result.recommended_strategies).toContain(
        "Assign dedicated coordination role"
      );
      expect(result.recommended_strategies.length).toBeGreaterThan(2);
    });

    it("should return comprehensive strategies for critical friction", () => {
      const result = model.getMitigationStrategies(10);

      expect(result.friction_category).toBe("critical");
      expect(result.recommended_strategies.length).toBeGreaterThan(4);
      expect(result.recommended_strategies).toContain(
        "Consider breaking into smaller sub-projects"
      );
    });
  });

  describe("edge cases", () => {
    it("should handle very large dependency counts", () => {
      const result = model.calculateFriction(1000);

      expect(result.friction_delay_days).toBe(20); // Max
      expect(result.adjustment_factor).toBeGreaterThan(1);
    });

    it("should maintain consistency across multiple calls", () => {
      const result1 = model.calculateFriction(5);
      const result2 = model.calculateFriction(5);

      expect(result1.friction_delay_days).toBe(result2.friction_delay_days);
      expect(result1.adjustment_factor).toBe(result2.adjustment_factor);
    });

    it("should handle fractional timeline days", () => {
      const result = model.analyzeFrictionImpact(uuidv4(), 2.5, 1);

      expect(result.base_timeline_days).toBe(2.5);
      expect(result.friction_timeline_days).toBe(7.5);
    });

    it("should provide sensible mitigation for unknown friction", () => {
      // Test that function doesn't crash on unknown category
      const result = model.getMitigationStrategies(-1);
      expect(result.recommended_strategies).toBeDefined();
    });

    it("should calculate total friction with mixed dependencies", () => {
      const actions = [
        { action_id: "A", dependency_count: 0 },
        { action_id: "B", dependency_count: 1 },
        { action_id: "C", dependency_count: 5 },
        { action_id: "D", dependency_count: 10 },
      ];

      const result = model.calculateTotalFriction(actions);

      expect(result.total_friction_days).toBe(35); // 0 + 5 + 10 + 20
      expect(result.max_friction_days).toBe(20);
    });
  });
});
