import { describe, it, expect } from "vitest";
import { classifyOutcome, type OutcomeCategory } from "@/services/operator/outcome-classifier";

describe("P2B: Outcome Classifier (Canonical)", () => {
  describe("Rule 1: Failure (no outcome achieved)", () => {
    it("should classify null actualOutcome as failure", () => {
      const result = classifyOutcome(null, 50000);
      expect(result.category).toBe("failure");
      expect(result.reason).toBe("No outcome achieved");
    });

    it("should classify undefined actualOutcome as failure", () => {
      const result = classifyOutcome(undefined, 50000);
      expect(result.category).toBe("failure");
      expect(result.reason).toBe("No outcome achieved");
    });

    it("should classify zero actualOutcome as failure", () => {
      const result = classifyOutcome(0, 50000);
      expect(result.category).toBe("failure");
      expect(result.reason).toBe("No outcome achieved");
    });
  });

  describe("Rule 2: Uncertain (variance >200%)", () => {
    it("should classify 5x expected as uncertain (400% variance)", () => {
      const result = classifyOutcome(250000, 50000);
      expect(result.category).toBe("uncertain");
      expect(result.reason).toContain(">200%");
      expect(result.reason).toContain("400%");
    });

    it("should classify 3x expected as uncertain (201% variance past boundary)", () => {
      const result = classifyOutcome(150100, 50000);
      expect(result.category).toBe("uncertain");
      expect(result.reason).toContain(">200%");
    });

    it("should NOT classify exactly 3x expected as uncertain (exactly 200% variance)", () => {
      const result = classifyOutcome(150000, 50000);
      expect(result.category).toBe("success");
    });

    it("should NOT classify 2x expected as uncertain (100% variance)", () => {
      const result = classifyOutcome(100000, 50000);
      expect(result.category).not.toBe("uncertain");
    });
  });

  describe("Rule 3: Partial (actual < 50% of expected)", () => {
    it("should classify 25% achievement as partial", () => {
      const result = classifyOutcome(12500, 50000);
      expect(result.category).toBe("partial");
      expect(result.reason).toContain("25%");
      expect(result.reason).toContain("expected");
    });

    it("should classify 49% achievement as partial", () => {
      const result = classifyOutcome(24500, 50000);
      expect(result.category).toBe("partial");
    });

    it("should NOT classify exactly 50% as partial", () => {
      const result = classifyOutcome(25000, 50000);
      expect(result.category).not.toBe("partial");
    });
  });

  describe("Rule 4: Success (positive in reasonable range)", () => {
    it("should classify 50% achievement as success", () => {
      const result = classifyOutcome(25000, 50000);
      expect(result.category).toBe("success");
      expect(result.reason).toContain("50%");
    });

    it("should classify 100% achievement as success", () => {
      const result = classifyOutcome(50000, 50000);
      expect(result.category).toBe("success");
      expect(result.reason).toContain("100%");
    });

    it("should classify 150% achievement as success (under 200% variance)", () => {
      const result = classifyOutcome(75000, 50000);
      expect(result.category).toBe("success");
      expect(result.reason).toContain("150%");
    });

    it("should classify any positive outcome with no baseline as success", () => {
      const result = classifyOutcome(100000, null);
      expect(result.category).toBe("success");
      expect(result.reason).toContain("no baseline");
    });
  });

  describe("Edge cases", () => {
    it("should handle missing expected impact", () => {
      const result = classifyOutcome(50000, undefined);
      expect(result.category).toBe("success");
    });

    it("should handle zero expected impact", () => {
      const result = classifyOutcome(50000, 0);
      expect(result.category).toBe("success");
    });

    it("should be deterministic", () => {
      const result1 = classifyOutcome(75000, 50000);
      const result2 = classifyOutcome(75000, 50000);
      expect(result1.category).toBe(result2.category);
      expect(result1.reason).toBe(result2.reason);
    });
  });
});
