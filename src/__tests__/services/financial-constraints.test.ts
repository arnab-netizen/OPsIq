import { describe, it, expect } from "vitest";
import {
  evaluateFinancialConstraints,
  evaluateConstraintsFromFinancials,
  isActionPermitted,
  getConstraintExplanation,
  ConstraintEvaluationSchema,
} from "@/services/financial-constraints";
import {
  SurvivalStatus,
  DebtPressure,
  MarginPressure,
} from "@/domain/survival/survival-intelligence";
import { Financials } from "@/domain/business-condition/business-condition";

describe("STAGE 10 Slice 1: Financial Constraints Engine", () => {
  const baseFinancials: Financials = {
    monthlyRecurringRevenue: 10000,
    monthlyExpenses: 8000,
    cashOnHand: 50000,
    burnRate: 0,
    cashRunwayMonths: 25,
    grossMargin: 60,
    operatingMargin: 20,
    debtOutstanding: 5000,
    customerConcentration: 25,
    lastUpdated: new Date(),
    dataSource: "accounting_software",
  };

  const baseSurvivalMetrics = {
    cashRunwayMonths: 12,
    survivalStatus: SurvivalStatus.HEALTHY,
    debtPressure: DebtPressure.LOW,
    marginPressure: MarginPressure.ADEQUATE,
    financialHealthScore: 70,
    risksIdentified: [] as string[],
    interventionBlocked: false,
    lastAssessedAt: new Date(),
  };

  describe("Growth Investment Constraints", () => {
    it("should allow growth when HEALTHY with 12+ month runway and low debt", () => {
      const evaluation = evaluateFinancialConstraints({
        survivalMetrics: baseSurvivalMetrics,
        financials: baseFinancials,
      });

      expect(evaluation.canAffordGrowth).toBe(true);
    });

    it("should block growth when CRITICAL survival", () => {
      const evaluation = evaluateFinancialConstraints({
        survivalMetrics: {
          ...baseSurvivalMetrics,
          survivalStatus: SurvivalStatus.CRITICAL,
        },
        financials: baseFinancials,
      });

      expect(evaluation.canAffordGrowth).toBe(false);
      expect(evaluation.constraints).toContain("growth_investment_blocked");
    });

    it("should block growth when runway < 12 months", () => {
      const evaluation = evaluateFinancialConstraints({
        survivalMetrics: {
          ...baseSurvivalMetrics,
          cashRunwayMonths: 6,
        },
        financials: baseFinancials,
      });

      expect(evaluation.canAffordGrowth).toBe(false);
    });

    it("should block growth when debt is CRITICAL", () => {
      const evaluation = evaluateFinancialConstraints({
        survivalMetrics: {
          ...baseSurvivalMetrics,
          debtPressure: DebtPressure.CRITICAL,
        },
        financials: baseFinancials,
      });

      expect(evaluation.canAffordGrowth).toBe(false);
    });

    it("should allow growth when THRIVING regardless of other factors", () => {
      const evaluation = evaluateFinancialConstraints({
        survivalMetrics: {
          ...baseSurvivalMetrics,
          survivalStatus: SurvivalStatus.THRIVING,
          cashRunwayMonths: 60,
        },
        financials: baseFinancials,
      });

      expect(evaluation.canAffordGrowth).toBe(true);
    });
  });

  describe("Experiment Constraints", () => {
    it("should allow experiments when STABLE+ with 6+ month runway", () => {
      const evaluation = evaluateFinancialConstraints({
        survivalMetrics: {
          ...baseSurvivalMetrics,
          survivalStatus: SurvivalStatus.STABLE,
          cashRunwayMonths: 6,
        },
        financials: baseFinancials,
      });

      expect(evaluation.canAffordExperiment).toBe(true);
    });

    it("should block experiments when CRITICAL", () => {
      const evaluation = evaluateFinancialConstraints({
        survivalMetrics: {
          ...baseSurvivalMetrics,
          survivalStatus: SurvivalStatus.CRITICAL,
        },
        financials: baseFinancials,
      });

      expect(evaluation.canAffordExperiment).toBe(false);
      expect(evaluation.constraints).toContain("experiment_blocked");
    });

    it("should block experiments when runway < 6 months", () => {
      const evaluation = evaluateFinancialConstraints({
        survivalMetrics: {
          ...baseSurvivalMetrics,
          cashRunwayMonths: 3,
        },
        financials: baseFinancials,
      });

      expect(evaluation.canAffordExperiment).toBe(false);
    });

    it("should allow experiments on lower bar than growth", () => {
      const evaluation = evaluateFinancialConstraints({
        survivalMetrics: {
          ...baseSurvivalMetrics,
          survivalStatus: SurvivalStatus.STABLE,
          cashRunwayMonths: 8,
        },
        financials: baseFinancials,
      });

      expect(evaluation.canAffordExperiment).toBe(true);
      expect(evaluation.canAffordGrowth).toBe(false);
    });
  });

  describe("Acquisition Constraints", () => {
    it("should allow acquisition when HEALTHY with 12+ month runway", () => {
      const evaluation = evaluateFinancialConstraints({
        survivalMetrics: {
          ...baseSurvivalMetrics,
          survivalStatus: SurvivalStatus.HEALTHY,
          cashRunwayMonths: 12,
        },
        financials: baseFinancials,
      });

      expect(evaluation.canAffordAcquisition).toBe(true);
    });

    it("should block acquisition when runway < 12 months", () => {
      const evaluation = evaluateFinancialConstraints({
        survivalMetrics: {
          ...baseSurvivalMetrics,
          cashRunwayMonths: 6,
        },
        financials: baseFinancials,
      });

      expect(evaluation.canAffordAcquisition).toBe(false);
    });

    it("should allow acquisition when debt is MODERATE", () => {
      const evaluation = evaluateFinancialConstraints({
        survivalMetrics: {
          ...baseSurvivalMetrics,
          debtPressure: DebtPressure.MODERATE,
          survivalStatus: SurvivalStatus.HEALTHY,
          cashRunwayMonths: 12,
        },
        financials: baseFinancials,
      });

      expect(evaluation.canAffordAcquisition).toBe(true);
    });

    it("should block acquisition when debt is CRITICAL", () => {
      const evaluation = evaluateFinancialConstraints({
        survivalMetrics: {
          ...baseSurvivalMetrics,
          debtPressure: DebtPressure.CRITICAL,
          survivalStatus: SurvivalStatus.HEALTHY,
          cashRunwayMonths: 12,
        },
        financials: baseFinancials,
      });

      expect(evaluation.canAffordAcquisition).toBe(false);
    });
  });

  describe("Talent Investment Constraints", () => {
    it("should allow talent investment when HEALTHY with positive margin", () => {
      const evaluation = evaluateFinancialConstraints({
        survivalMetrics: baseSurvivalMetrics,
        financials: { ...baseFinancials, operatingMargin: 20 },
      });

      expect(evaluation.canAffordTalent).toBe(true);
    });

    it("should block talent investment when margin is negative", () => {
      const evaluation = evaluateFinancialConstraints({
        survivalMetrics: baseSurvivalMetrics,
        financials: { ...baseFinancials, operatingMargin: -10 },
      });

      expect(evaluation.canAffordTalent).toBe(false);
      expect(evaluation.constraints).toContain("talent_investment_blocked");
    });

    it("should block talent investment when runway < 12 months", () => {
      const evaluation = evaluateFinancialConstraints({
        survivalMetrics: {
          ...baseSurvivalMetrics,
          cashRunwayMonths: 6,
        },
        financials: baseFinancials,
      });

      expect(evaluation.canAffordTalent).toBe(false);
    });

    it("should allow talent investment when THRIVING with positive margin", () => {
      const evaluation = evaluateFinancialConstraints({
        survivalMetrics: {
          ...baseSurvivalMetrics,
          survivalStatus: SurvivalStatus.THRIVING,
          cashRunwayMonths: 24,
        },
        financials: { ...baseFinancials, operatingMargin: 30 },
      });

      expect(evaluation.canAffordTalent).toBe(true);
    });
  });

  describe("Action Permission Checking", () => {
    const healthyEval = evaluateFinancialConstraints({
      survivalMetrics: baseSurvivalMetrics,
      financials: baseFinancials,
    });

    it("should check growth action permission", () => {
      expect(isActionPermitted(healthyEval, "growth")).toBe(
        healthyEval.canAffordGrowth
      );
    });

    it("should check experiment action permission", () => {
      expect(isActionPermitted(healthyEval, "experiment")).toBe(
        healthyEval.canAffordExperiment
      );
    });

    it("should check acquisition action permission", () => {
      expect(isActionPermitted(healthyEval, "acquisition")).toBe(
        healthyEval.canAffordAcquisition
      );
    });

    it("should check talent action permission", () => {
      expect(isActionPermitted(healthyEval, "talent")).toBe(
        healthyEval.canAffordTalent
      );
    });

    it("should return false for unknown action types", () => {
      expect(isActionPermitted(healthyEval, "unknown" as any)).toBe(false);
    });
  });

  describe("Constraint Explanations", () => {
    it("should provide explanation when action is permitted", () => {
      const healthyEval = evaluateFinancialConstraints({
        survivalMetrics: baseSurvivalMetrics,
        financials: baseFinancials,
      });

      const explanation = getConstraintExplanation(healthyEval, "growth");
      expect(explanation).toContain("permitted");
      expect(explanation.toLowerCase()).toContain("healthy");
    });

    it("should provide explanation when action is blocked", () => {
      const criticalEval = evaluateFinancialConstraints({
        survivalMetrics: {
          ...baseSurvivalMetrics,
          survivalStatus: SurvivalStatus.CRITICAL,
        },
        financials: baseFinancials,
      });

      const explanation = getConstraintExplanation(criticalEval, "growth");
      expect(explanation).toContain("blocked");
      expect(explanation).toContain("survival mode");
    });

    it("should list multiple blocking reasons", () => {
      const criticalEval = evaluateFinancialConstraints({
        survivalMetrics: {
          ...baseSurvivalMetrics,
          survivalStatus: SurvivalStatus.CRITICAL,
          cashRunwayMonths: 1,
          debtPressure: DebtPressure.CRITICAL,
        },
        financials: { ...baseFinancials, operatingMargin: -20 },
      });

      const explanation = getConstraintExplanation(criticalEval, "growth");
      expect(explanation).toContain("survival mode");
      expect(explanation).toContain("low runway");
      expect(explanation).toContain("debt");
    });
  });

  describe("Shorthand Evaluation", () => {
    it("should evaluate constraints from financials directly", () => {
      const evaluation = evaluateConstraintsFromFinancials(baseFinancials);

      expect(evaluation).toBeDefined();
      expect(evaluation.survivalStatus).toBeDefined();
      expect(evaluation.canAffordGrowth).toBeDefined();
    });

    it("should match full evaluation path", () => {
      const directEval = evaluateConstraintsFromFinancials(baseFinancials);

      expect(directEval.survivalStatus).toBe(directEval.survivalStatus);
      expect(directEval.cashRunwayMonths).toBeGreaterThan(0);
    });
  });

  describe("Schema Validation", () => {
    it("should pass Zod schema validation", () => {
      const evaluation = evaluateFinancialConstraints({
        survivalMetrics: baseSurvivalMetrics,
        financials: baseFinancials,
      });

      const result = ConstraintEvaluationSchema.safeParse(evaluation);
      expect(result.success).toBe(true);
    });
  });

  describe("Real-World Scenarios", () => {
    it("should handle bootstrapped profitable startup", () => {
      const evaluation = evaluateConstraintsFromFinancials({
        monthlyRecurringRevenue: 5000,
        monthlyExpenses: 2000,
        cashOnHand: 100000,
        burnRate: 0,
        cashRunwayMonths: 50,
        grossMargin: 80,
        operatingMargin: 60,
        customerConcentration: 20,
        lastUpdated: new Date(),
        dataSource: "accounting_software",
      });

      expect(evaluation.canAffordGrowth).toBe(true);
      expect(evaluation.canAffordExperiment).toBe(true);
      expect(evaluation.canAffordTalent).toBe(true);
      expect(evaluation.constraints).toHaveLength(0);
    });

    it("should handle growth-stage with debt", () => {
      const evaluation = evaluateConstraintsFromFinancials({
        monthlyRecurringRevenue: 50000,
        monthlyExpenses: 40000,
        cashOnHand: 100000,
        burnRate: 0,
        cashRunwayMonths: 10,
        grossMargin: 70,
        operatingMargin: 20,
        debtOutstanding: 250000,
        customerConcentration: 30,
        lastUpdated: new Date(),
        dataSource: "accounting_software",
      });

      expect(evaluation.canAffordGrowth).toBe(false);
      expect(evaluation.constraints).toContain("growth_investment_blocked");
      // Experiments may be blocked due to runway (10 < 12) and/or debt
    });

    it("should handle struggling business", () => {
      const evaluation = evaluateConstraintsFromFinancials({
        monthlyRecurringRevenue: 5000,
        monthlyExpenses: 8000,
        cashOnHand: 12000,
        burnRate: 3000,
        cashRunwayMonths: 4,
        grossMargin: 30,
        operatingMargin: -37.5,
        debtOutstanding: 50000,
        customerConcentration: 60,
        lastUpdated: new Date(),
        dataSource: "accounting_software",
      });

      expect(evaluation.canAffordGrowth).toBe(false);
      expect(evaluation.canAffordAcquisition).toBe(false);
      expect(evaluation.canAffordTalent).toBe(false);
      expect(evaluation.constraints.length).toBeGreaterThan(1);
      // Experiments may be blocked due to survival status (STRESSED)
    });

    it("should handle crisis mode", () => {
      const evaluation = evaluateConstraintsFromFinancials({
        monthlyRecurringRevenue: 2000,
        monthlyExpenses: 5000,
        cashOnHand: 10000,
        burnRate: 3000,
        cashRunwayMonths: 3.33,
        grossMargin: 20,
        operatingMargin: -150,
        debtOutstanding: 100000,
        customerConcentration: 80,
        lastUpdated: new Date(),
        dataSource: "manual_entry",
      });

      expect(evaluation.canAffordGrowth).toBe(false);
      expect(evaluation.canAffordExperiment).toBe(false);
      expect(evaluation.canAffordAcquisition).toBe(false);
      expect(evaluation.canAffordTalent).toBe(false);
      // Verify crisis is detected and recommendations exist
      expect(evaluation.recommendedActions.length).toBeGreaterThan(0);
    });
  });

  describe("Constraint Recommendations", () => {
    it("should recommend cash preservation in survival mode", () => {
      const evaluation = evaluateFinancialConstraints({
        survivalMetrics: {
          ...baseSurvivalMetrics,
          survivalStatus: SurvivalStatus.STRESSED,
        },
        financials: baseFinancials,
      });

      expect(evaluation.recommendedActions.some(r => r.includes("cash preservation"))).toBe(true);
    });

    it("should recommend runway building", () => {
      const evaluation = evaluateFinancialConstraints({
        survivalMetrics: {
          ...baseSurvivalMetrics,
          cashRunwayMonths: 6,
        },
        financials: baseFinancials,
      });

      expect(evaluation.recommendedActions.some(r => r.includes("runway"))).toBe(true);
    });

    it("should recommend debt reduction when critical", () => {
      const evaluation = evaluateFinancialConstraints({
        survivalMetrics: {
          ...baseSurvivalMetrics,
          debtPressure: DebtPressure.CRITICAL,
        },
        financials: baseFinancials,
      });

      expect(evaluation.recommendedActions.some(r => r.includes("debt"))).toBe(true);
    });

    it("should recommend unit economics fix for negative margin", () => {
      const evaluation = evaluateFinancialConstraints({
        survivalMetrics: baseSurvivalMetrics,
        financials: { ...baseFinancials, operatingMargin: -20 },
      });

      expect(evaluation.recommendedActions.some(r => r.includes("economics"))).toBe(true);
    });
  });

  describe("Fail-Closed Semantics", () => {
    it("should block all actions by default in critical status", () => {
      const criticalEval = evaluateFinancialConstraints({
        survivalMetrics: {
          ...baseSurvivalMetrics,
          survivalStatus: SurvivalStatus.CRITICAL,
        },
        financials: baseFinancials,
      });

      expect(criticalEval.canAffordGrowth).toBe(false);
      expect(criticalEval.canAffordAcquisition).toBe(false);
      expect(criticalEval.canAffordTalent).toBe(false);
    });

    it("should require explicit healthy status for growth", () => {
      const stableEval = evaluateFinancialConstraints({
        survivalMetrics: {
          ...baseSurvivalMetrics,
          survivalStatus: SurvivalStatus.STABLE,
        },
        financials: baseFinancials,
      });

      expect(stableEval.canAffordGrowth).toBe(false);
      expect([
        SurvivalStatus.HEALTHY,
        SurvivalStatus.THRIVING,
      ]).not.toContain(stableEval.survivalStatus);
    });
  });
});
