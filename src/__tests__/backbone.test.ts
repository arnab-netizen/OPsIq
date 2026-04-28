import { describe, it, expect } from "vitest";
import { runSystem } from "@/services/system/run";
import { parseCSV } from "@/services/ingestion/csv";
import { validateRows } from "@/services/ingestion/validate";
import {
  generateApprovedExplanation,
  generateBlockedExplanation,
  createDecisionResult,
} from "@/services/explanation/generate";

describe("Backbone System", () => {
  describe("runSystem", () => {
    it("should execute with high risk scenario", () => {
      const result = runSystem({
        baselineRevenue: 10000,
        baselineCost: 5000,
        risk: 8,
        revenueChange: 2000,
        costChange: 800,
        confidence: 0.85,
      });

      expect(result.decisions).toBeDefined();
      expect(result.decisions.length).toBeGreaterThan(0);
      expect(result.impact).toBeDefined();
      expect(result.impact.impactExpected).toBe(1200); // 2000 - 800
      expect(result.impact.confidenceWeight).toBeGreaterThan(0.4);
    });

    it("should execute with context available scenario", () => {
      const result = runSystem({
        baselineRevenue: 10000,
        baselineCost: 5000,
        revenueChange: 1500,
        costChange: 600,
        confidence: 0.75,
      });

      expect(result.decisions).toBeDefined();
      expect(result.impact).toBeDefined();
    });

    it("should fail-closed on low confidence", () => {
      expect(() => {
        runSystem({
          baselineRevenue: 10000,
          baselineCost: 5000,
          risk: 5,
          revenueChange: 1000,
          costChange: 500,
          confidence: 0.3,
        });
      }).toThrow("LOW_CONFIDENCE_BLOCKED");
    });

    it("should fail-closed on zero impact", () => {
      expect(() => {
        runSystem({
          baselineRevenue: 10000,
          baselineCost: 5000,
          risk: 5,
          revenueChange: 0,
          costChange: 0,
          confidence: 0.8,
        });
      }).toThrow("NON_POSITIVE_IMPACT_BLOCKED");
    });
  });

  describe("CSV Parser", () => {
    it("should parse valid CSV", () => {
      const csv = "name,value\ntest1,100\ntest2,200";
      const result = parseCSV(csv);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("test1");
      expect(result[0].value).toBe("100");
    });

    it("should fail-closed on empty input", () => {
      expect(() => parseCSV("")).toThrow("CSV input cannot be empty");
    });
  });

  describe("Validation Scoring", () => {
    it("should accept high quality data", () => {
      const rows = [
        { id: "1", name: "Alice", value: "100" },
        { id: "2", name: "Bob", value: "200" },
      ];
      const result = validateRows(rows);

      expect(result.score).toBe(1);
      expect(result.issues).toHaveLength(0);
    });

    it("should fail-closed on low quality", () => {
      const rows = [
        { id: "", name: "", value: "" },
        { id: "", name: "", value: "" },
      ];

      expect(() => validateRows(rows)).toThrow("LOW_DATA_QUALITY");
    });

    it("should fail-closed on empty rows", () => {
      expect(() => validateRows([])).toThrow("LOW_DATA_QUALITY");
    });
  });

  describe("Decision Explainability", () => {
    it("should generate approved explanation with drivers", () => {
      const explanation = generateApprovedExplanation({
        baselineRevenue: 10000,
        baselineCost: 5000,
        deltaRevenue: 2000,
        deltaCost: 500,
        confidence: 0.85,
        expectedImpact: 1500,
      });

      expect(explanation.summary).toBeDefined();
      expect(explanation.drivers.length).toBeGreaterThan(0);
      expect(explanation.drivers[0]).toHaveProperty("type");
      expect(explanation.drivers[0]).toHaveProperty("value");
      expect(explanation.assumptions.length).toBeGreaterThan(0);
      expect(explanation.risks.length).toBeGreaterThan(0);
      expect(explanation.missingData).toBeDefined();
      expect(explanation.calculationTrace).toBeDefined();
      expect(explanation.calculationTrace.netImpact).toBe(1500);
      expect(explanation.calculationTrace.formula).toContain("netImpact");
    });

    it("should generate blocked explanation for low confidence", () => {
      const explanation = generateBlockedExplanation("LOW_CONFIDENCE", {
        baselineRevenue: 10000,
        baselineCost: 5000,
        deltaRevenue: 1000,
        deltaCost: 500,
        confidence: 0.3,
        expectedImpact: 500,
      });

      expect(explanation.summary).toContain("BLOCKED");
      expect(explanation.summary).toContain("Confidence");
      expect(explanation.missingData.length).toBeGreaterThan(0);
    });

    it("should generate blocked explanation for non-positive impact", () => {
      const explanation = generateBlockedExplanation(
        "NON_POSITIVE_IMPACT",
        {
          baselineRevenue: 10000,
          baselineCost: 5000,
          deltaRevenue: 100,
          deltaCost: 500,
          confidence: 0.75,
          expectedImpact: -400,
        }
      );

      expect(explanation.summary).toContain("BLOCKED");
      expect(explanation.summary).toContain("non-positive");
      expect(explanation.missingData.length).toBeGreaterThan(0);
    });

    it("should create approved decision result", () => {
      const result = createDecisionResult(
        {
          baselineRevenue: 10000,
          baselineCost: 5000,
          deltaRevenue: 2000,
          deltaCost: 500,
          confidence: 0.85,
          expectedImpact: 1500,
        },
        true
      );

      expect(result.decision).toBe("APPROVED");
      expect(result.expectedImpact).toBe(1500);
      expect(result.confidence).toBe(0.85);
      expect(result.explanation).toBeDefined();
      expect(result.reason).toBeUndefined();
    });

    it("should create blocked decision result with reason", () => {
      const result = createDecisionResult(
        {
          baselineRevenue: 10000,
          baselineCost: 5000,
          deltaRevenue: 100,
          deltaCost: 500,
          confidence: 0.3,
          expectedImpact: -400,
        },
        false,
        "LOW_CONFIDENCE"
      );

      expect(result.decision).toBe("BLOCKED");
      expect(result.reason).toBe("LOW_CONFIDENCE");
      expect(result.explanation).toBeDefined();
      expect(result.explanation.summary).toContain("BLOCKED");
    });

    it("should include missing data in blocked explanations", () => {
      const explanation = generateBlockedExplanation("INVALID_INPUT");

      expect(explanation.missingData.length).toBeGreaterThan(0);
      expect(explanation.missingData).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/revenue|cost|confidence/i),
        ])
      );
    });

    it("should generate calculation trace with correct formula", () => {
      const explanation = generateApprovedExplanation({
        baselineRevenue: 10000,
        baselineCost: 5000,
        deltaRevenue: 2000,
        deltaCost: 500,
        confidence: 0.85,
        expectedImpact: 1500,
      });

      expect(explanation.calculationTrace).toEqual({
        baselineRevenue: 10000,
        baselineCost: 5000,
        revenueChange: 2000,
        costChange: 500,
        netImpact: 1500,
        formula: "netImpact = revenueChange - costChange",
      });
    });

    it("should create structured drivers with type and value", () => {
      const explanation = generateApprovedExplanation({
        baselineRevenue: 10000,
        baselineCost: 5000,
        deltaRevenue: 2000,
        deltaCost: 500,
        confidence: 0.85,
        expectedImpact: 1500,
      });

      const revenueDriver = explanation.drivers.find((d) => d.type === "REVENUE");
      const costDriver = explanation.drivers.find((d) => d.type === "COST");
      const netDriver = explanation.drivers.find((d) => d.type === "NET");

      expect(revenueDriver).toBeDefined();
      expect(revenueDriver?.value).toBe(2000);
      expect(costDriver).toBeDefined();
      expect(costDriver?.value).toBe(500);
      expect(netDriver).toBeDefined();
      expect(netDriver?.value).toBe(1500);
    });

    it("should include calculation trace in blocked explanations", () => {
      const explanation = generateBlockedExplanation("LOW_CONFIDENCE", {
        baselineRevenue: 10000,
        baselineCost: 5000,
        deltaRevenue: 1000,
        deltaCost: 500,
        confidence: 0.3,
        expectedImpact: 500,
      });

      expect(explanation.calculationTrace).toBeDefined();
      expect(explanation.calculationTrace.netImpact).toBe(500);
      expect(explanation.calculationTrace.formula).toContain("netImpact");
    });
  });
});
