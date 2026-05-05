import { describe, it, expect } from "vitest";
import { MonetizationEngine, PathFinancialInput } from "../monetization-engine";
import { v4 as uuidv4 } from "uuid";

describe("MonetizationEngine", () => {
  const engine = new MonetizationEngine();

  const createFinancialInput = (overrides: Partial<PathFinancialInput> = {}): PathFinancialInput => ({
    pathId: uuidv4(),
    expectedValue: 100000,
    baselineAnnualRevenue: 1000000,
    baselineAnnualCost: 600000,
    baselineGrossMarginPct: 40,
    estimatedRevenueDelta: 200000,
    estimatedCostDelta: -50000, // Cost savings
    capitalRequired: 50000,
    timeToResultDays: 30,
    ...overrides,
  });

  describe("projectFinancials", () => {
    it("should calculate projected annual revenue correctly", () => {
      const input = createFinancialInput({
        baselineAnnualRevenue: 1000000,
        estimatedRevenueDelta: 200000,
      });

      const projection = engine.projectFinancials(input);

      expect(projection.projected.annual_revenue).toBe(1200000);
    });

    it("should calculate projected annual cost correctly", () => {
      const input = createFinancialInput({
        baselineAnnualCost: 600000,
        estimatedCostDelta: -50000, // Savings
      });

      const projection = engine.projectFinancials(input);

      expect(projection.projected.annual_cost).toBe(550000);
    });

    it("should calculate gross margin change correctly", () => {
      const input = createFinancialInput({
        baselineAnnualRevenue: 1000000,
        baselineAnnualCost: 600000,
        baselineGrossMarginPct: 40,
        estimatedRevenueDelta: 200000,
        estimatedCostDelta: -50000,
      });

      const projection = engine.projectFinancials(input);

      // Projected: revenue 1200000, cost 550000
      // Margin = (1200000 - 550000) / 1200000 * 100 = 54.17%
      expect(projection.delta.margin_delta).toBeGreaterThan(10);
      expect(projection.projected.gross_margin_pct).toBeGreaterThan(50);
    });

    it("should set revenue_delta correctly", () => {
      const input = createFinancialInput({ estimatedRevenueDelta: 300000 });
      const projection = engine.projectFinancials(input);

      expect(projection.delta.revenue_delta).toBe(300000);
    });

    it("should set cost_delta correctly", () => {
      const input = createFinancialInput({ estimatedCostDelta: -75000 });
      const projection = engine.projectFinancials(input);

      expect(projection.delta.cost_delta).toBe(-75000);
    });

    it("should set capital_required correctly", () => {
      const input = createFinancialInput({ capitalRequired: 150000 });
      const projection = engine.projectFinancials(input);

      expect(projection.delta.capital_required).toBe(150000);
    });

    it("should calculate payback_days correctly", () => {
      const input = createFinancialInput({
        estimatedRevenueDelta: 200000,
        estimatedCostDelta: -50000,
        capitalRequired: 50000,
        timeToResultDays: 30,
      });

      const projection = engine.projectFinancials(input);

      // Monthly benefit: (200000 - 50000) / 12 = 12500
      // Payback: (50000 / 12500) * 30 + 30 = 120 + 30 = 150 days
      expect(projection.delta.payback_days).toBeCloseTo(150, 0);
    });

    it("should calculate ROI correctly for positive returns", () => {
      const input = createFinancialInput({
        estimatedRevenueDelta: 200000,
        estimatedCostDelta: -50000,
        capitalRequired: 50000,
      });

      const projection = engine.projectFinancials(input);

      // Annual benefit: 200000 - 50000 = 150000
      // ROI: ((150000 - 50000) / 50000) * 100 = 200%
      expect(projection.roi_percent).toBe(200);
    });

    it("should calculate ROI as zero for zero capital", () => {
      const input = createFinancialInput({
        capitalRequired: 0,
      });

      const projection = engine.projectFinancials(input);

      expect(projection.roi_percent).toBe(0);
    });

    it("should calculate negative ROI for insufficient returns", () => {
      const input = createFinancialInput({
        estimatedRevenueDelta: 30000,
        estimatedCostDelta: 0,
        capitalRequired: 100000,
      });

      const projection = engine.projectFinancials(input);

      // Annual benefit: 30000
      // ROI: ((30000 - 100000) / 100000) * 100 = -70%
      expect(projection.roi_percent).toBe(-70);
    });

    it("should calculate NPV correctly", () => {
      const input = createFinancialInput({
        estimatedRevenueDelta: 200000,
        estimatedCostDelta: -50000,
        capitalRequired: 50000,
        timeToResultDays: 30,
      });

      const projection = engine.projectFinancials(input);

      // Monthly benefit: 150000/12 = 12500
      // NPV should be positive with 12-month horizon
      expect(projection.npv_12months).toBeGreaterThan(0);
    });

    it("should include cash flow projection", () => {
      const input = createFinancialInput();
      const projection = engine.projectFinancials(input);

      expect(projection.cashFlowProjection.month_1).toBeDefined();
      expect(projection.cashFlowProjection.month_3).toBeDefined();
      expect(projection.cashFlowProjection.month_6).toBeDefined();
      expect(projection.cashFlowProjection.month_12).toBeDefined();

      // Month 12 should be >= month 6 >= month 3 >= month 1
      expect(projection.cashFlowProjection.month_12).toBeGreaterThanOrEqual(
        projection.cashFlowProjection.month_6
      );
    });

    it("should set break-even date when payback is possible", () => {
      const input = createFinancialInput({
        estimatedRevenueDelta: 200000,
        estimatedCostDelta: 0,
        capitalRequired: 50000,
      });

      const projection = engine.projectFinancials(input);

      expect(projection.breakEvenDate).toBeDefined();
      expect(projection.breakEvenDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("should not set break-even date for negative cash flow", () => {
      const input = createFinancialInput({
        estimatedRevenueDelta: -100000, // Negative revenue
        estimatedCostDelta: -50000,
        capitalRequired: 50000,
      });

      const projection = engine.projectFinancials(input);

      expect(projection.breakEvenDate).toBeUndefined();
    });

    it("should handle zero capital investment", () => {
      const input = createFinancialInput({
        capitalRequired: 0,
        estimatedRevenueDelta: 100000,
      });

      const projection = engine.projectFinancials(input);

      expect(projection.delta.capital_required).toBe(0);
      expect(Number.isFinite(projection.roi_percent)).toBe(true);
    });

    it("should handle long time-to-result delays", () => {
      const input = createFinancialInput({
        timeToResultDays: 180,
        estimatedRevenueDelta: 100000,
      });

      const projection = engine.projectFinancials(input);

      expect(projection.delta.payback_days).toBeGreaterThanOrEqual(180);
    });
  });

  describe("projectMultiplePathFinancials", () => {
    it("should project financials for multiple paths", () => {
      const inputs = [
        createFinancialInput({ estimatedRevenueDelta: 100000 }),
        createFinancialInput({ estimatedRevenueDelta: 200000 }),
        createFinancialInput({ estimatedRevenueDelta: 150000 }),
      ];

      const results = engine.projectMultiplePathFinancials(inputs);

      expect(results).toHaveLength(3);
      expect(results[0].monetization.delta.revenue_delta).toBe(100000);
      expect(results[1].monetization.delta.revenue_delta).toBe(200000);
      expect(results[2].monetization.delta.revenue_delta).toBe(150000);
    });

    it("should preserve path context in results", () => {
      const inputs = [
        createFinancialInput(),
        createFinancialInput(),
      ];

      const results = engine.projectMultiplePathFinancials(inputs);

      results.forEach((result, idx) => {
        expect(result.pathId).toBe(inputs[idx].pathId);
        expect(result.expectedValue).toBe(inputs[idx].expectedValue);
      });
    });
  });

  describe("validateFinancialProjection", () => {
    it("should validate correct projection", () => {
      const input = createFinancialInput();
      const projection = engine.projectFinancials(input);

      expect(engine.validateFinancialProjection(projection)).toBe(true);
    });

    it("should reject invalid revenue delta (NaN)", () => {
      const input = createFinancialInput();
      const projection = engine.projectFinancials(input);

      projection.delta.revenue_delta = NaN;

      expect(engine.validateFinancialProjection(projection)).toBe(false);
    });

    it("should reject invalid cost delta (Infinity)", () => {
      const input = createFinancialInput();
      const projection = engine.projectFinancials(input);

      projection.delta.cost_delta = Infinity;

      expect(engine.validateFinancialProjection(projection)).toBe(false);
    });

    it("should reject unreasonable margin delta (> 100)", () => {
      const input = createFinancialInput();
      const projection = engine.projectFinancials(input);

      projection.delta.margin_delta = 150;

      expect(engine.validateFinancialProjection(projection)).toBe(false);
    });

    it("should reject negative payback days", () => {
      const input = createFinancialInput();
      const projection = engine.projectFinancials(input);

      projection.delta.payback_days = -10;

      expect(engine.validateFinancialProjection(projection)).toBe(false);
    });

    it("should reject invalid ROI (NaN)", () => {
      const input = createFinancialInput();
      const projection = engine.projectFinancials(input);

      projection.roi_percent = NaN;

      expect(engine.validateFinancialProjection(projection)).toBe(false);
    });
  });

  describe("rankPathsByROI", () => {
    it("should rank paths by ROI descending", () => {
      const inputs = [
        createFinancialInput({
          estimatedRevenueDelta: 50000,
          capitalRequired: 100000,
          pathId: "path-1",
        }),
        createFinancialInput({
          estimatedRevenueDelta: 200000,
          capitalRequired: 50000,
          pathId: "path-2",
        }),
        createFinancialInput({
          estimatedRevenueDelta: 100000,
          capitalRequired: 75000,
          pathId: "path-3",
        }),
      ];

      const results = engine.projectMultiplePathFinancials(inputs);
      const ranked = engine.rankPathsByROI(results);

      expect(ranked[0].pathId).toBe("path-2"); // Highest ROI
      expect(ranked[ranked.length - 1].pathId).toBe("path-1"); // Lowest ROI
    });

    it("should not modify original array", () => {
      const inputs = [
        createFinancialInput({ estimatedRevenueDelta: 100000 }),
        createFinancialInput({ estimatedRevenueDelta: 200000 }),
      ];

      const results = engine.projectMultiplePathFinancials(inputs);
      const originalOrder = results.map((r) => r.pathId);

      engine.rankPathsByROI(results);

      expect(results.map((r) => r.pathId)).toEqual(originalOrder);
    });
  });

  describe("rankPathsByPayback", () => {
    it("should rank paths by payback period ascending (shortest first)", () => {
      const inputs = [
        createFinancialInput({
          timeToResultDays: 90,
          estimatedRevenueDelta: 50000,
          pathId: "path-1",
        }),
        createFinancialInput({
          timeToResultDays: 30,
          estimatedRevenueDelta: 200000,
          pathId: "path-2",
        }),
        createFinancialInput({
          timeToResultDays: 60,
          estimatedRevenueDelta: 100000,
          pathId: "path-3",
        }),
      ];

      const results = engine.projectMultiplePathFinancials(inputs);
      const ranked = engine.rankPathsByPayback(results);

      expect(ranked[0].monetization.delta.payback_days).toBeLessThanOrEqual(
        ranked[1].monetization.delta.payback_days
      );
    });
  });

  describe("rankPathsByNPV", () => {
    it("should rank paths by NPV descending", () => {
      const inputs = [
        createFinancialInput({ estimatedRevenueDelta: 50000 }),
        createFinancialInput({ estimatedRevenueDelta: 200000 }),
        createFinancialInput({ estimatedRevenueDelta: 100000 }),
      ];

      const results = engine.projectMultiplePathFinancials(inputs);
      const ranked = engine.rankPathsByNPV(results);

      expect(ranked[0].monetization.npv_12months).toBeGreaterThanOrEqual(
        ranked[1].monetization.npv_12months
      );
    });
  });

  describe("identifyProfitablePaths", () => {
    it("should identify paths with positive ROI", () => {
      const inputs = [
        createFinancialInput({
          estimatedRevenueDelta: 200000,
          estimatedCostDelta: -50000,
          capitalRequired: 50000,
        }), // ROI = ((200000-50000-50000)/50000)*100 = 200%
        createFinancialInput({
          estimatedRevenueDelta: 30000,
          estimatedCostDelta: -50000,
          capitalRequired: 100000,
        }), // ROI = ((-20000)/100000)*100 = -20%
        createFinancialInput({
          estimatedRevenueDelta: 200000,
          estimatedCostDelta: -50000,
          capitalRequired: 75000,
        }), // ROI = ((200000-50000-75000)/75000)*100 = 100%
      ];

      const results = engine.projectMultiplePathFinancials(inputs);
      const profitable = engine.identifyProfitablePaths(results);

      expect(profitable.length).toBe(2); // Two positive ROI paths
      profitable.forEach((p) => {
        expect(p.monetization.roi_percent).toBeGreaterThan(0);
      });
    });

    it("should return empty array if no profitable paths", () => {
      const inputs = [
        createFinancialInput({
          estimatedRevenueDelta: 10000,
          capitalRequired: 100000,
        }),
        createFinancialInput({
          estimatedRevenueDelta: 20000,
          capitalRequired: 100000,
        }),
      ];

      const results = engine.projectMultiplePathFinancials(inputs);
      const profitable = engine.identifyProfitablePaths(results);

      expect(profitable.length).toBe(0);
    });
  });

  describe("identifyFastPaybackPaths", () => {
    it("should identify paths with payback <= 180 days", () => {
      const inputs = [
        createFinancialInput({
          estimatedRevenueDelta: 200000,
          capitalRequired: 50000,
          timeToResultDays: 30,
        }), // ~150 days payback
        createFinancialInput({
          estimatedRevenueDelta: 20000,
          capitalRequired: 100000,
          timeToResultDays: 30,
        }), // > 180 days payback
      ];

      const results = engine.projectMultiplePathFinancials(inputs);
      const fastPayback = engine.identifyFastPaybackPaths(results);

      expect(fastPayback.length).toBeGreaterThan(0);
      fastPayback.forEach((p) => {
        expect(p.monetization.delta.payback_days).toBeLessThanOrEqual(180);
      });
    });

    it("should accept custom max payback threshold", () => {
      const inputs = [createFinancialInput()];
      const results = engine.projectMultiplePathFinancials(inputs);

      const fastPayback = engine.identifyFastPaybackPaths(results, 100);

      const paybackDays = results[0].monetization.delta.payback_days;
      if (paybackDays <= 100) {
        expect(fastPayback.length).toBe(1);
      } else {
        expect(fastPayback.length).toBe(0);
      }
    });
  });

  describe("comparePaths", () => {
    it("should identify ROI winner correctly", () => {
      const input1 = createFinancialInput({
        estimatedRevenueDelta: 100000,
        capitalRequired: 50000,
      }); // ROI = 100%
      const input2 = createFinancialInput({
        estimatedRevenueDelta: 200000,
        capitalRequired: 50000,
      }); // ROI = 300%

      const result1 = {
        pathId: input1.pathId,
        expectedValue: input1.expectedValue,
        monetization: engine.projectFinancials(input1),
      };

      const result2 = {
        pathId: input2.pathId,
        expectedValue: input2.expectedValue,
        monetization: engine.projectFinancials(input2),
      };

      const comparison = engine.comparePaths(result1, result2);

      expect(comparison.roiWinner.pathId).toBe(result2.pathId);
    });

    it("should identify payback winner correctly", () => {
      const input1 = createFinancialInput({
        estimatedRevenueDelta: 100000,
        timeToResultDays: 60,
      }); // Longer payback
      const input2 = createFinancialInput({
        estimatedRevenueDelta: 200000,
        timeToResultDays: 30,
      }); // Shorter payback

      const result1 = {
        pathId: input1.pathId,
        expectedValue: input1.expectedValue,
        monetization: engine.projectFinancials(input1),
      };

      const result2 = {
        pathId: input2.pathId,
        expectedValue: input2.expectedValue,
        monetization: engine.projectFinancials(input2),
      };

      const comparison = engine.comparePaths(result1, result2);

      expect(comparison.paybackWinner.pathId).toBe(result2.pathId);
    });

    it("should identify NPV winner correctly", () => {
      const input1 = createFinancialInput({
        estimatedRevenueDelta: 100000,
      }); // Lower NPV
      const input2 = createFinancialInput({
        estimatedRevenueDelta: 200000,
      }); // Higher NPV

      const result1 = {
        pathId: input1.pathId,
        expectedValue: input1.expectedValue,
        monetization: engine.projectFinancials(input1),
      };

      const result2 = {
        pathId: input2.pathId,
        expectedValue: input2.expectedValue,
        monetization: engine.projectFinancials(input2),
      };

      const comparison = engine.comparePaths(result1, result2);

      expect(comparison.npvWinner.pathId).toBe(result2.pathId);
    });

    it("should have an overall winner", () => {
      const input1 = createFinancialInput();
      const input2 = createFinancialInput();

      const result1 = {
        pathId: input1.pathId,
        expectedValue: input1.expectedValue,
        monetization: engine.projectFinancials(input1),
      };

      const result2 = {
        pathId: input2.pathId,
        expectedValue: input2.expectedValue,
        monetization: engine.projectFinancials(input2),
      };

      const comparison = engine.comparePaths(result1, result2);

      expect(comparison.overallWinner).toBeDefined();
      expect([result1.pathId, result2.pathId]).toContain(comparison.overallWinner.pathId);
    });
  });

  describe("Edge Cases", () => {
    it("should handle zero revenue and cost", () => {
      const input = createFinancialInput({
        baselineAnnualRevenue: 0,
        baselineAnnualCost: 0,
        estimatedRevenueDelta: 100000,
        estimatedCostDelta: -20000,
      });

      const projection = engine.projectFinancials(input);

      expect(Number.isFinite(projection.projected.annual_revenue)).toBe(true);
      expect(Number.isFinite(projection.roi_percent)).toBe(true);
    });

    it("should handle very large revenue deltas", () => {
      const input = createFinancialInput({
        estimatedRevenueDelta: 10000000,
      });

      const projection = engine.projectFinancials(input);

      expect(Number.isFinite(projection.roi_percent)).toBe(true);
      expect(Number.isFinite(projection.npv_12months)).toBe(true);
    });

    it("should handle negative margins", () => {
      const input = createFinancialInput({
        baselineAnnualRevenue: 100000,
        baselineAnnualCost: 200000, // Cost > Revenue
        estimatedRevenueDelta: 50000,
        estimatedCostDelta: -10000,
      });

      const projection = engine.projectFinancials(input);

      expect(Number.isFinite(projection.delta.margin_delta)).toBe(true);
    });

    it("should handle time-to-result beyond one year", () => {
      const input = createFinancialInput({
        timeToResultDays: 400,
        estimatedRevenueDelta: 100000,
      });

      const projection = engine.projectFinancials(input);

      expect(projection.cashFlowProjection.month_12).toBe(0);
    });
  });
});
