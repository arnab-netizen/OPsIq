import { describe, it, expect } from "vitest";
import {
  SurvivalStatus,
  DebtPressure,
  MarginPressure,
  SurvivalMetricsSchema,
  assessSurvivalIntelligence,
  calculateCashRunway,
  classifySurvivalStatus,
  classifyDebtPressure,
  classifyMarginPressure,
  calculateFinancialHealthScore,
  identifyFinancialRisks,
  shouldBlockIntervention,
  validateSurvivalInput,
} from "@/domain/survival/survival-intelligence";

describe("STAGE 9 Slice 1: Survival Intelligence Domain", () => {
  const baseFinancials = {
    monthlyRecurringRevenue: 10000,
    monthlyExpenses: 8000,
    cashOnHand: 50000,
    burnRate: 0,
    cashRunwayMonths: 6,
    grossMargin: 60,
    operatingMargin: 20,
    debtOutstanding: 5000,
    customerConcentration: 25,
  };

  describe("Cash Runway Calculation", () => {
    it("should calculate runway for profitable business", () => {
      const runway = calculateCashRunway(10000, 8000, 50000);
      expect(runway).toBeGreaterThan(6);
    });

    it("should calculate runway for loss-making business", () => {
      const runway = calculateCashRunway(5000, 8000, 50000);
      expect(runway).toBeGreaterThan(0);
      expect(runway).toBeLessThan(20);
    });

    it("should calculate runway for no-revenue business", () => {
      const runway = calculateCashRunway(0, 8000, 50000);
      expect(runway).toBeCloseTo(6.25, 1);
    });

    it("should return 0 for negative cash and expenses", () => {
      const runway = calculateCashRunway(0, 8000, -5000);
      expect(runway).toBe(0);
    });

    it("should clamp runway to max 120 months", () => {
      const runway = calculateCashRunway(100000, 1000, 500000);
      expect(runway).toBeLessThanOrEqual(120);
    });

    it("should handle zero or negative expenses safely", () => {
      const runway1 = calculateCashRunway(10000, 0, 50000);
      expect(runway1).toBe(120);

      const runway2 = calculateCashRunway(10000, -1000, 50000);
      expect(runway2).toBe(120);
    });
  });

  describe("Survival Status Classification", () => {
    it("should classify CRITICAL: negative cash", () => {
      const status = classifySurvivalStatus(6, -5000);
      expect(status).toBe(SurvivalStatus.CRITICAL);
    });

    it("should classify CRITICAL: <1 month runway", () => {
      const status = classifySurvivalStatus(0.5, 10000);
      expect(status).toBe(SurvivalStatus.CRITICAL);
    });

    it("should classify STRESSED: 1-3 months runway", () => {
      const status = classifySurvivalStatus(2, 10000);
      expect(status).toBe(SurvivalStatus.STRESSED);
    });

    it("should classify STABLE: 3-6 months runway", () => {
      const status = classifySurvivalStatus(4, 10000);
      expect(status).toBe(SurvivalStatus.STABLE);
    });

    it("should classify HEALTHY: 6-12 months runway", () => {
      const status = classifySurvivalStatus(9, 10000);
      expect(status).toBe(SurvivalStatus.HEALTHY);
    });

    it("should classify THRIVING: 12+ months runway", () => {
      const status = classifySurvivalStatus(24, 10000);
      expect(status).toBe(SurvivalStatus.THRIVING);
    });
  });

  describe("Debt Pressure Classification", () => {
    it("should classify NONE: no debt", () => {
      const pressure = classifyDebtPressure(undefined, 10000);
      expect(pressure).toBe(DebtPressure.NONE);
    });

    it("should classify NONE: debt < 10% of MRR", () => {
      const pressure = classifyDebtPressure(500, 10000);
      expect(pressure).toBe(DebtPressure.NONE);
    });

    it("should classify LOW: debt 10-25% of MRR", () => {
      const pressure = classifyDebtPressure(1500, 10000);
      expect(pressure).toBe(DebtPressure.LOW);
    });

    it("should classify MODERATE: debt 25-50% of MRR", () => {
      const pressure = classifyDebtPressure(3500, 10000);
      expect(pressure).toBe(DebtPressure.MODERATE);
    });

    it("should classify HIGH: debt 50-100% of MRR", () => {
      const pressure = classifyDebtPressure(7500, 10000);
      expect(pressure).toBe(DebtPressure.HIGH);
    });

    it("should classify CRITICAL: debt > 100% of MRR", () => {
      const pressure = classifyDebtPressure(15000, 10000);
      expect(pressure).toBe(DebtPressure.CRITICAL);
    });

    it("should handle zero MRR safely", () => {
      const pressure = classifyDebtPressure(5000, 0);
      expect(pressure).toBe(DebtPressure.CRITICAL);
    });
  });

  describe("Margin Pressure Classification", () => {
    it("should classify HEALTHY: >20% margin", () => {
      const pressure = classifyMarginPressure(30);
      expect(pressure).toBe(MarginPressure.HEALTHY);
    });

    it("should classify ADEQUATE: 10-20% margin", () => {
      const pressure = classifyMarginPressure(15);
      expect(pressure).toBe(MarginPressure.ADEQUATE);
    });

    it("should classify CONCERNING: 0-10% margin", () => {
      const pressure = classifyMarginPressure(5);
      expect(pressure).toBe(MarginPressure.CONCERNING);
    });

    it("should classify NEGATIVE: -20 to 0% margin", () => {
      const pressure = classifyMarginPressure(-10);
      expect(pressure).toBe(MarginPressure.NEGATIVE);
    });

    it("should classify CRITICAL: <-20% margin", () => {
      const pressure = classifyMarginPressure(-30);
      expect(pressure).toBe(MarginPressure.CRITICAL);
    });
  });

  describe("Financial Health Score Calculation", () => {
    it("should calculate score for healthy business", () => {
      const score = calculateFinancialHealthScore(
        12,
        20,
        DebtPressure.LOW,
        50000
      );
      expect(score).toBeGreaterThan(70);
    });

    it("should calculate score for stressed business", () => {
      const score = calculateFinancialHealthScore(
        2,
        -10,
        DebtPressure.HIGH,
        5000
      );
      expect(score).toBeLessThan(40);
    });

    it("should calculate score for critical business", () => {
      const score = calculateFinancialHealthScore(
        0.5,
        -30,
        DebtPressure.CRITICAL,
        -5000
      );
      expect(score).toBeLessThanOrEqual(5);
    });

    it("should clamp score to 0-100 range", () => {
      const score = calculateFinancialHealthScore(120, 100, DebtPressure.NONE, 100000);
      expect(score).toBeLessThanOrEqual(100);
      expect(score).toBeGreaterThanOrEqual(0);
    });

    it("should weight runway heavily", () => {
      const healthyRunway = calculateFinancialHealthScore(
        12,
        0,
        DebtPressure.NONE,
        0
      );
      const poorRunway = calculateFinancialHealthScore(
        1,
        0,
        DebtPressure.NONE,
        0
      );
      expect(healthyRunway).toBeGreaterThan(poorRunway);
    });
  });

  describe("Financial Risk Identification", () => {
    it("should identify negative cash risk", () => {
      const risks = identifyFinancialRisks(-5000, 6, 20, DebtPressure.NONE);
      expect(risks).toContain("negative_cash");
    });

    it("should identify low runway risk", () => {
      const risks = identifyFinancialRisks(50000, 2, 20, DebtPressure.NONE);
      expect(risks).toContain("low_runway");
    });

    it("should identify negative margin risk", () => {
      const risks = identifyFinancialRisks(50000, 6, -10, DebtPressure.NONE);
      expect(risks).toContain("negative_margin");
    });

    it("should identify high debt risk", () => {
      const risks = identifyFinancialRisks(50000, 6, 20, DebtPressure.CRITICAL);
      expect(risks).toContain("high_debt");
    });

    it("should identify multiple risks", () => {
      const risks = identifyFinancialRisks(-5000, 1, -20, DebtPressure.HIGH);
      expect(risks.length).toBeGreaterThan(1);
    });
  });

  describe("Intervention Blocking Decision", () => {
    it("should block interventions when CRITICAL", () => {
      const shouldBlock = shouldBlockIntervention(
        SurvivalStatus.CRITICAL,
        50000,
        6
      );
      expect(shouldBlock).toBe(true);
    });

    it("should block interventions when STRESSED", () => {
      const shouldBlock = shouldBlockIntervention(
        SurvivalStatus.STRESSED,
        50000,
        6
      );
      expect(shouldBlock).toBe(true);
    });

    it("should block interventions when negative cash", () => {
      const shouldBlock = shouldBlockIntervention(
        SurvivalStatus.HEALTHY,
        -5000,
        6
      );
      expect(shouldBlock).toBe(true);
    });

    it("should block interventions when low runway", () => {
      const shouldBlock = shouldBlockIntervention(
        SurvivalStatus.HEALTHY,
        50000,
        2
      );
      expect(shouldBlock).toBe(true);
    });

    it("should allow interventions when healthy", () => {
      const shouldBlock = shouldBlockIntervention(
        SurvivalStatus.HEALTHY,
        50000,
        6
      );
      expect(shouldBlock).toBe(false);
    });

    it("should allow interventions when thriving", () => {
      const shouldBlock = shouldBlockIntervention(
        SurvivalStatus.THRIVING,
        100000,
        24
      );
      expect(shouldBlock).toBe(false);
    });
  });

  describe("Input Validation", () => {
    it("should accept valid survival input", () => {
      const errors = validateSurvivalInput({
        financials: baseFinancials,
      });
      expect(errors).toHaveLength(0);
    });

    it("should reject negative expenses", () => {
      const errors = validateSurvivalInput({
        financials: { ...baseFinancials, monthlyExpenses: -1000 },
      });
      expect(errors.some(e => e.toLowerCase().includes("expenses"))).toBe(true);
    });

    it("should reject invalid gross margin", () => {
      const errors = validateSurvivalInput({
        financials: { ...baseFinancials, grossMargin: 150 },
      });
      expect(errors.some(e => e.toLowerCase().includes("gross margin"))).toBe(true);
    });

    it("should reject invalid operating margin", () => {
      const errors = validateSurvivalInput({
        financials: { ...baseFinancials, operatingMargin: -150 },
      });
      expect(errors.some(e => e.toLowerCase().includes("operating margin"))).toBe(true);
    });
  });

  describe("Comprehensive Survival Assessment", () => {
    it("should assess healthy business", () => {
      const assessment = assessSurvivalIntelligence({
        financials: {
          ...baseFinancials,
          monthlyRecurringRevenue: 10000,
          monthlyExpenses: 11000,
          cashOnHand: 10000,
          operatingMargin: -9,
        },
      });

      expect(assessment.survivalStatus).toBe(SurvivalStatus.HEALTHY);
      expect(assessment.cashRunwayMonths).toBeGreaterThan(5);
      expect(assessment.cashRunwayMonths).toBeLessThan(13);
      expect(assessment.interventionBlocked).toBe(false);
      expect(assessment.financialHealthScore).toBeGreaterThan(45);
    });

    it("should assess critical business", () => {
      const assessment = assessSurvivalIntelligence({
        financials: {
          ...baseFinancials,
          cashOnHand: -10000,
          cashRunwayMonths: 0,
        },
      });

      expect(assessment.survivalStatus).toBe(SurvivalStatus.CRITICAL);
      expect(assessment.interventionBlocked).toBe(true);
      expect(assessment.risksIdentified).toContain("negative_cash");
    });

    it("should assess stressed business", () => {
      const assessment = assessSurvivalIntelligence({
        financials: {
          ...baseFinancials,
          cashOnHand: 15000,
          monthlyRecurringRevenue: 0,
          monthlyExpenses: 8000,
        },
      });

      expect(assessment.survivalStatus).toBe(SurvivalStatus.STRESSED);
      expect(assessment.interventionBlocked).toBe(true);
    });

    it("should include all required fields in assessment", () => {
      const assessment = assessSurvivalIntelligence({
        financials: baseFinancials,
      });

      expect(assessment).toHaveProperty("cashRunwayMonths");
      expect(assessment).toHaveProperty("survivalStatus");
      expect(assessment).toHaveProperty("debtPressure");
      expect(assessment).toHaveProperty("marginPressure");
      expect(assessment).toHaveProperty("financialHealthScore");
      expect(assessment).toHaveProperty("risksIdentified");
      expect(assessment).toHaveProperty("interventionBlocked");
      expect(assessment).toHaveProperty("lastAssessedAt");
    });

    it("should pass Zod schema validation", () => {
      const assessment = assessSurvivalIntelligence({
        financials: baseFinancials,
      });

      const result = SurvivalMetricsSchema.safeParse(assessment);
      expect(result.success).toBe(true);
    });
  });

  describe("Real-World Scenarios", () => {
    it("should handle bootstrapped startup with low expenses", () => {
      const assessment = assessSurvivalIntelligence({
        financials: {
          monthlyRecurringRevenue: 2000,
          monthlyExpenses: 1000,
          cashOnHand: 25000,
          burnRate: 0,
          cashRunwayMonths: 25,
          grossMargin: 80,
          operatingMargin: 50,
        },
      });

      expect(assessment.survivalStatus).toBe(SurvivalStatus.THRIVING);
      expect(assessment.interventionBlocked).toBe(false);
      expect(assessment.risksIdentified).toHaveLength(0);
    });

    it("should handle growth-stage company with debt", () => {
      const assessment = assessSurvivalIntelligence({
        financials: {
          monthlyRecurringRevenue: 100000,
          monthlyExpenses: 90000,
          cashOnHand: 150000,
          burnRate: 0,
          cashRunwayMonths: 15,
          grossMargin: 70,
          operatingMargin: 10,
          debtOutstanding: 600000,
        },
      });

      expect([SurvivalStatus.HEALTHY, SurvivalStatus.THRIVING]).toContain(assessment.survivalStatus);
      expect([DebtPressure.HIGH, DebtPressure.CRITICAL]).toContain(assessment.debtPressure);
      expect(assessment.interventionBlocked).toBe(false);
    });

    it("should handle struggling company requiring urgent action", () => {
      const assessment = assessSurvivalIntelligence({
        financials: {
          monthlyRecurringRevenue: 5000,
          monthlyExpenses: 12000,
          cashOnHand: 20000,
          burnRate: 7000,
          cashRunwayMonths: 2.86,
          grossMargin: 40,
          operatingMargin: -58,
          debtOutstanding: 50000,
        },
      });

      expect(assessment.survivalStatus).toBe(SurvivalStatus.STRESSED);
      expect(assessment.interventionBlocked).toBe(true);
      expect(assessment.risksIdentified.length).toBeGreaterThan(1);
    });
  });

  describe("Determinism", () => {
    it("should produce identical scores for identical inputs", () => {
      const input = { financials: baseFinancials };

      const assessment1 = assessSurvivalIntelligence(input);
      const assessment2 = assessSurvivalIntelligence(input);

      expect(assessment1.survivalStatus).toBe(assessment2.survivalStatus);
      expect(assessment1.financialHealthScore).toBe(
        assessment2.financialHealthScore
      );
      expect(assessment1.cashRunwayMonths).toBe(assessment2.cashRunwayMonths);
      expect(assessment1.interventionBlocked).toBe(
        assessment2.interventionBlocked
      );
    });

    it("should produce consistent health scores across ranges", () => {
      for (let runway = 0; runway <= 24; runway += 3) {
        const score1 = calculateFinancialHealthScore(
          runway,
          20,
          DebtPressure.LOW,
          50000
        );
        const score2 = calculateFinancialHealthScore(
          runway,
          20,
          DebtPressure.LOW,
          50000
        );
        expect(score1).toBe(score2);
      }
    });
  });
});
