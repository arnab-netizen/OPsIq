import { describe, it, expect } from "vitest";
import { runSystem } from "@/services/system/run";
import { parseCSV } from "@/services/ingestion/csv";
import { validateRows } from "@/services/ingestion/validate";

describe("Backbone System", () => {
  describe("runSystem", () => {
    it("should execute with high risk scenario", () => {
      const result = runSystem({
        risk: 8,
        revenueChange: 2000,
        costChange: 800,
        confidence: 0.85,
      });

      expect(result.decisions).toBeDefined();
      expect(result.decisions.length).toBeGreaterThan(0);
      expect(result.impact).toBeDefined();
      expect(result.impact.impactExpected).toBe(1200); // 2000 - 800
      expect(result.impact.confidence).toBeGreaterThan(0.4);
    });

    it("should execute with context available scenario", () => {
      const result = runSystem({
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
          risk: 5,
          revenueChange: 0,
          costChange: 0,
          confidence: 0.8,
        });
      }).toThrow("NO_IMPACT");
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
});
