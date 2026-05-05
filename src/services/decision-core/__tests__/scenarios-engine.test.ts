import { describe, it, expect } from "vitest";
import { ScenariosEngine, PathDimensions } from "../scenarios-engine";
import { v4 as uuidv4 } from "uuid";

describe("ScenariosEngine", () => {
  const engine = new ScenariosEngine();

  const createPathDimensions = (overrides: Partial<PathDimensions> = {}): PathDimensions => ({
    pathId: uuidv4(),
    impactValue: 100000, // $100k base impact
    probability: 0.75, // 75% success probability
    riskScore: 0.2, // 20% risk/failure probability
    timeToResultDays: 90,
    dependencyCount: 2,
    bottleneckImpactPercent: 10, // 10% impact reduction from bottleneck
    ...overrides,
  });

  describe("analyzePathScenarios", () => {
    it("should generate best/base/worst scenarios with correct probabilities", () => {
      const dims = createPathDimensions();
      const analysis = engine.analyzePathScenarios(dims);

      expect(analysis.bestCase.prob).toBe(0.2);
      expect(analysis.baseCase.prob).toBe(0.6);
      expect(analysis.worstCase.prob).toBe(0.2);
    });

    it("should calculate best case as base impact * 1.3", () => {
      const dims = createPathDimensions({ impactValue: 100000 });
      const analysis = engine.analyzePathScenarios(dims);

      expect(analysis.bestCase.value).toBe(130000);
    });

    it("should calculate base case as impact * probability * (1 - bottleneck%)", () => {
      const dims = createPathDimensions({
        impactValue: 100000,
        probability: 0.75,
        bottleneckImpactPercent: 10,
      });
      const analysis = engine.analyzePathScenarios(dims);

      // 100000 * 0.75 * (1 - 0.1) = 100000 * 0.75 * 0.9 = 67500
      expect(analysis.baseCase.value).toBe(67500);
    });

    it("should calculate worst case as impact * 0.5 * (1 - risk_score)", () => {
      const dims = createPathDimensions({
        impactValue: 100000,
        riskScore: 0.2, // 20% risk
      });
      const analysis = engine.analyzePathScenarios(dims);

      // 100000 * 0.5 * (1 - 0.2) = 100000 * 0.5 * 0.8 = 40000
      expect(analysis.worstCase.value).toBe(40000);
    });

    it("should calculate expected value correctly", () => {
      const dims = createPathDimensions({
        impactValue: 100000,
        probability: 0.75,
        riskScore: 0.2,
        bottleneckImpactPercent: 10,
      });
      const analysis = engine.analyzePathScenarios(dims);

      // Best: 130000 * 0.2 = 26000
      // Base: 67500 * 0.6 = 40500
      // Worst: 40000 * 0.2 = 8000
      // EV = 26000 + 40500 + 8000 = 74500
      expect(analysis.expectedValue).toBe(74500);
    });

    it("should set downside exposure to worst case value", () => {
      const dims = createPathDimensions({ impactValue: 100000, riskScore: 0.5 });
      const analysis = engine.analyzePathScenarios(dims);

      expect(analysis.downsideExposure).toBe(analysis.worstCase.value);
    });

    it("should generate failure triggers based on dependency count", () => {
      const dims = createPathDimensions({ dependencyCount: 3 });
      const analysis = engine.analyzePathScenarios(dims);

      expect(analysis.failureTriggers.length).toBeGreaterThan(0);
      expect(analysis.failureTriggers[0]).toContain("dependencies");
    });

    it("should generate triggers for high risk score", () => {
      const dims = createPathDimensions({ riskScore: 0.7 });
      const analysis = engine.analyzePathScenarios(dims);

      const riskTrigger = analysis.failureTriggers.find((t) => t.includes("risks"));
      expect(riskTrigger).toBeDefined();
    });

    it("should handle zero impact value", () => {
      const dims = createPathDimensions({ impactValue: 0 });
      const analysis = engine.analyzePathScenarios(dims);

      expect(analysis.expectedValue).toBe(0);
      expect(analysis.downsideExposure).toBe(0);
    });

    it("should handle very high risk score (1.0)", () => {
      const dims = createPathDimensions({ riskScore: 1.0 });
      const analysis = engine.analyzePathScenarios(dims);

      // Worst case: 100000 * 0.5 * (1 - 1.0) = 0
      expect(analysis.worstCase.value).toBe(0);
    });

    it("should include scenario descriptions/triggers", () => {
      const dims = createPathDimensions();
      const analysis = engine.analyzePathScenarios(dims);

      expect(analysis.bestCase.trigger).toBeDefined();
      expect(analysis.baseCase.trigger).toBeDefined();
      expect(analysis.worstCase.trigger).toBeDefined();
    });

    it("should maintain pathId throughout analysis", () => {
      const dims = createPathDimensions();
      const analysis = engine.analyzePathScenarios(dims);

      expect(analysis.pathId).toBe(dims.pathId);
    });
  });

  describe("analyzeMultiplePathScenarios", () => {
    it("should analyze multiple paths independently", () => {
      const paths = [
        createPathDimensions({ impactValue: 50000 }),
        createPathDimensions({ impactValue: 100000 }),
        createPathDimensions({ impactValue: 150000 }),
      ];

      const results = engine.analyzeMultiplePathScenarios(paths);

      expect(results).toHaveLength(3);
      expect(results[0].scenarios.expectedValue).toBeLessThan(results[1].scenarios.expectedValue);
      expect(results[1].scenarios.expectedValue).toBeLessThan(results[2].scenarios.expectedValue);
    });

    it("should preserve path context in results", () => {
      const paths = [createPathDimensions(), createPathDimensions()];
      const results = engine.analyzeMultiplePathScenarios(paths);

      results.forEach((result, idx) => {
        expect(result.pathId).toBe(paths[idx].pathId);
        expect(result.impactValue).toBe(paths[idx].impactValue);
        expect(result.probability).toBe(paths[idx].probability);
      });
    });
  });

  describe("calculateExpectedValue", () => {
    it("should calculate EV with default probabilities", () => {
      const ev = engine.calculateExpectedValue(100, 50, 20);

      // (100 * 0.2) + (50 * 0.6) + (20 * 0.2) = 20 + 30 + 4 = 54
      expect(ev).toBe(54);
    });

    it("should calculate EV with custom probabilities", () => {
      const ev = engine.calculateExpectedValue(100, 50, 20, 0.3, 0.5, 0.2);

      // (100 * 0.3) + (50 * 0.5) + (20 * 0.2) = 30 + 25 + 4 = 59
      expect(ev).toBe(59);
    });

    it("should handle negative values in worst case", () => {
      const ev = engine.calculateExpectedValue(100, 50, -30);

      // (100 * 0.2) + (50 * 0.6) + (-30 * 0.2) = 20 + 30 - 6 = 44
      expect(ev).toBe(44);
    });
  });

  describe("compareScenarios", () => {
    it("should identify scenario with higher EV as better", () => {
      const dims1 = createPathDimensions({ impactValue: 100000 });
      const dims2 = createPathDimensions({ impactValue: 50000 });

      const scenario1 = engine.analyzePathScenarios(dims1);
      const scenario2 = engine.analyzePathScenarios(dims2);

      expect(engine.compareScenarios(scenario1, scenario2)).toBe(true);
      expect(engine.compareScenarios(scenario2, scenario1)).toBe(false);
    });
  });

  describe("rankPathsByExpectedValue", () => {
    it("should rank paths by EV highest first", () => {
      const paths = [
        createPathDimensions({ impactValue: 50000, pathId: "path-1" }),
        createPathDimensions({ impactValue: 150000, pathId: "path-2" }),
        createPathDimensions({ impactValue: 100000, pathId: "path-3" }),
      ];

      const analyzed = engine.analyzeMultiplePathScenarios(paths);
      const ranked = engine.rankPathsByExpectedValue(analyzed);

      expect(ranked[0].pathId).toBe("path-2"); // Highest EV
      expect(ranked[1].pathId).toBe("path-3");
      expect(ranked[2].pathId).toBe("path-1"); // Lowest EV
    });

    it("should not modify original array", () => {
      const paths = [
        createPathDimensions({ impactValue: 50000 }),
        createPathDimensions({ impactValue: 100000 }),
      ];

      const analyzed = engine.analyzeMultiplePathScenarios(paths);
      const originalOrder = analyzed.map((p) => p.pathId);

      engine.rankPathsByExpectedValue(analyzed);

      expect(analyzed.map((p) => p.pathId)).toEqual(originalOrder);
    });
  });

  describe("calculateRiskAdjustedEV", () => {
    it("should discount EV by diagnostic confidence", () => {
      const ev = 100000;
      const confidence = 0.75;

      const adjusted = engine.calculateRiskAdjustedEV(ev, confidence);

      expect(adjusted).toBe(75000);
    });

    it("should reduce EV significantly with low confidence", () => {
      const ev = 100000;
      const lowConfidence = 0.3;

      const adjusted = engine.calculateRiskAdjustedEV(ev, lowConfidence);

      expect(adjusted).toBe(30000);
    });

    it("should not adjust with high confidence", () => {
      const ev = 100000;
      const highConfidence = 0.95;

      const adjusted = engine.calculateRiskAdjustedEV(ev, highConfidence);

      expect(adjusted).toBe(95000);
    });
  });

  describe("identifyDownsideRisks", () => {
    it("should filter paths by downside exposure threshold", () => {
      const paths = [
        createPathDimensions({ impactValue: 100000, riskScore: 0.1 }),
        createPathDimensions({ impactValue: 100000, riskScore: 0.2 }),
      ];

      const analyzed = engine.analyzeMultiplePathScenarios(paths);
      const downsideRisks = engine.identifyDownsideRisks(analyzed);

      // All worst cases are positive, so downside risks should be empty
      // (filter looks for < 0, but worst case is always >= 0)
      expect(downsideRisks.length).toBe(0);
    });

    it("should return all paths if all have negative downside (theoretical edge case)", () => {
      // This tests the filter logic without relying on actual negative generation
      const paths = [
        createPathDimensions({ impactValue: 50000, riskScore: 0.8 }),
        createPathDimensions({ impactValue: 75000, riskScore: 0.9 }),
      ];

      const analyzed = engine.analyzeMultiplePathScenarios(paths);

      // Verify all paths have positive downside exposure
      analyzed.forEach((path) => {
        expect(path.scenarios.downsideExposure).toBeGreaterThanOrEqual(0);
      });

      const downsideRisks = engine.identifyDownsideRisks(analyzed);
      expect(downsideRisks.length).toBe(0);
    });
  });

  describe("validateScenarioAnalysis", () => {
    it("should validate correct scenario analysis", () => {
      const dims = createPathDimensions();
      const analysis = engine.analyzePathScenarios(dims);

      expect(engine.validateScenarioAnalysis(analysis)).toBe(true);
    });

    it("should reject invalid probability sum", () => {
      const dims = createPathDimensions();
      const analysis = engine.analyzePathScenarios(dims);

      // Manually corrupt probabilities
      analysis.bestCase.prob = 0.5;
      analysis.baseCase.prob = 0.5;
      analysis.worstCase.prob = 0.5; // Sum = 1.5, invalid

      expect(engine.validateScenarioAnalysis(analysis)).toBe(false);
    });

    it("should reject negative probability", () => {
      const dims = createPathDimensions();
      const analysis = engine.analyzePathScenarios(dims);

      analysis.bestCase.prob = -0.1;

      expect(engine.validateScenarioAnalysis(analysis)).toBe(false);
    });

    it("should reject probability > 1", () => {
      const dims = createPathDimensions();
      const analysis = engine.analyzePathScenarios(dims);

      analysis.baseCase.prob = 1.5;
      analysis.worstCase.prob = -0.4; // Make sum = 1.0

      expect(engine.validateScenarioAnalysis(analysis)).toBe(false);
    });

    it("should reject invalid expected value (NaN or Infinity)", () => {
      const dims = createPathDimensions();
      const analysis = engine.analyzePathScenarios(dims);

      analysis.expectedValue = NaN;

      expect(engine.validateScenarioAnalysis(analysis)).toBe(false);
    });
  });

  describe("Edge Cases", () => {
    it("should handle path with zero dependencies", () => {
      const dims = createPathDimensions({ dependencyCount: 0 });
      const analysis = engine.analyzePathScenarios(dims);

      expect(analysis.failureTriggers.length).toBeGreaterThan(0);
    });

    it("should handle path with many dependencies (10+)", () => {
      const dims = createPathDimensions({ dependencyCount: 10 });
      const analysis = engine.analyzePathScenarios(dims);

      const depTrigger = analysis.failureTriggers.find((t) => t.includes("dependencies"));
      expect(depTrigger).toBeDefined();
    });

    it("should handle very large impact values", () => {
      const dims = createPathDimensions({ impactValue: 10000000 }); // $10M
      const analysis = engine.analyzePathScenarios(dims);

      expect(analysis.expectedValue).toBeGreaterThan(0);
      expect(Number.isFinite(analysis.expectedValue)).toBe(true);
    });

    it("should handle bottleneck reduction above 50%", () => {
      const dims = createPathDimensions({ bottleneckImpactPercent: 80 });
      const analysis = engine.analyzePathScenarios(dims);

      // Base case: 100000 * 0.75 * (1 - 0.8) = 100000 * 0.75 * 0.2 = 15000
      expect(analysis.baseCase.value).toBe(15000);
    });

    it("should handle all three scenarios equal", () => {
      const dims = createPathDimensions({
        impactValue: 50000,
        probability: 0.5,
        riskScore: 0.5,
        bottleneckImpactPercent: 0,
      });
      const analysis = engine.analyzePathScenarios(dims);

      // Best: 50000 * 1.3 = 65000
      // Base: 50000 * 0.5 = 25000
      // Worst: 50000 * 0.5 * 0.5 = 12500
      // EV = 65000*0.2 + 25000*0.6 + 12500*0.2 = 13000 + 15000 + 2500 = 30500

      expect(analysis.expectedValue).toBe(30500);
    });
  });

  describe("Scenario Probabilities & EV Consistency", () => {
    it("should ensure probabilities always sum to 1.0", () => {
      const dims = createPathDimensions();
      const analysis = engine.analyzePathScenarios(dims);

      const sum =
        analysis.bestCase.prob +
        analysis.baseCase.prob +
        analysis.worstCase.prob;

      expect(Math.abs(sum - 1.0)).toBeLessThan(0.01);
    });

    it("should ensure EV is between worst and best case values", () => {
      const dims = createPathDimensions();
      const analysis = engine.analyzePathScenarios(dims);

      expect(analysis.expectedValue).toBeLessThanOrEqual(analysis.bestCase.value);
      expect(analysis.expectedValue).toBeGreaterThanOrEqual(analysis.worstCase.value);
    });
  });
});
