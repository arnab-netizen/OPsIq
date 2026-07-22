import { describe, it, expect } from "vitest";
import {
  generateHypotheses,
  prioritizeHypotheses,
  evaluateHypothesisResult,
  HYPOTHESIS_TEMPLATES,
  type HypothesisType,
} from "../../domain/owner-strategy/startup-hypothesis-engine";

describe("startup-hypothesis-engine", () => {
  // ── generateHypotheses ────────────────────────────────────────────────────
  describe("generateHypotheses", () => {
    it("returns one hypothesis per template", () => {
      const hypotheses = generateHypotheses("Test Idea", "Food");
      expect(hypotheses).toHaveLength(HYPOTHESIS_TEMPLATES.length);
    });

    it("each hypothesis statement is prefixed with ideaName and industry", () => {
      const hypotheses = generateHypotheses("Test Idea", "Food");
      hypotheses.forEach((h) => {
        expect(h.statement).toContain("[Test Idea — Food]");
      });
    });

    it("confidenceBefore is 50 for all generated hypotheses", () => {
      const hypotheses = generateHypotheses("Test Idea", "Food");
      hypotheses.forEach((h) => {
        expect(h.confidenceBefore).toBe(50);
      });
    });

    it("requiresOwnerApproval is true only for critical hypotheses with expectedCostCents > 0", () => {
      const hypotheses = generateHypotheses("Test Idea", "Food");
      hypotheses.forEach((h) => {
        const expected = h.isCritical && h.expectedCostCents > 0;
        expect(h.requiresOwnerApproval).toBe(expected);
      });
    });

    it("REGULATORY hypothesis has highest defaultPriority (95)", () => {
      const hypotheses = generateHypotheses("Test Idea", "Food");
      const regulatory = hypotheses.find((h) => h.type === "REGULATORY");
      expect(regulatory?.priorityScore).toBe(95);
    });
  });

  // ── prioritizeHypotheses ──────────────────────────────────────────────────
  describe("prioritizeHypotheses", () => {
    it("returns hypotheses sorted by priorityScore descending", () => {
      const hypotheses = generateHypotheses("Test Idea", "Food");
      const sorted = prioritizeHypotheses(hypotheses);
      for (let i = 0; i < sorted.length - 1; i++) {
        expect(sorted[i].priorityScore).toBeGreaterThanOrEqual(sorted[i + 1].priorityScore);
      }
    });

    it("does not mutate the input array", () => {
      const hypotheses = generateHypotheses("Test Idea", "Food");
      const original = hypotheses.map((h) => h.priorityScore);
      prioritizeHypotheses(hypotheses);
      expect(hypotheses.map((h) => h.priorityScore)).toEqual(original);
    });

    it("REGULATORY appears first (highest priority 95)", () => {
      const hypotheses = generateHypotheses("Test Idea", "Food");
      const sorted = prioritizeHypotheses(hypotheses);
      expect(sorted[0].type).toBe("REGULATORY");
    });
  });

  // ── Scenario H: INVALIDATED result → memoryType STARTUP_FAILED_HYPOTHESIS ─
  describe("Scenario H — failed hypothesis memoryType", () => {
    it("DISCONFIRMED result produces memoryType=STARTUP_FAILED_HYPOTHESIS", () => {
      const evaluation = evaluateHypothesisResult(
        "hyp-001",
        "DEMAND",
        true,
        "DISCONFIRMED",
        50
      );
      expect(evaluation.memoryType).toBe("STARTUP_FAILED_HYPOTHESIS");
    });

    it("INCONCLUSIVE result produces memoryType=STARTUP_FAILED_HYPOTHESIS", () => {
      const evaluation = evaluateHypothesisResult(
        "hyp-002",
        "PRICING",
        true,
        "INCONCLUSIVE",
        50
      );
      expect(evaluation.memoryType).toBe("STARTUP_FAILED_HYPOTHESIS");
    });

    it("CONFIRMED result produces memoryType=STARTUP_VALIDATED_HYPOTHESIS", () => {
      const evaluation = evaluateHypothesisResult(
        "hyp-003",
        "DEMAND",
        true,
        "CONFIRMED",
        50
      );
      expect(evaluation.memoryType).toBe("STARTUP_VALIDATED_HYPOTHESIS");
    });

    it("PARTIALLY_CONFIRMED produces STARTUP_VALIDATED_HYPOTHESIS", () => {
      const evaluation = evaluateHypothesisResult(
        "hyp-004",
        "ACQUISITION",
        false,
        "PARTIALLY_CONFIRMED",
        50
      );
      expect(evaluation.memoryType).toBe("STARTUP_VALIDATED_HYPOTHESIS");
    });
  });

  // ── evaluateHypothesisResult — confidence delta ───────────────────────────
  describe("evaluateHypothesisResult — confidence scoring", () => {
    it("CONFIRMED increases confidence by 30", () => {
      const result = evaluateHypothesisResult("h1", "DEMAND", true, "CONFIRMED", 50);
      expect(result.confidenceAfter).toBe(80);
    });

    it("DISCONFIRMED decreases confidence by 40", () => {
      const result = evaluateHypothesisResult("h1", "DEMAND", true, "DISCONFIRMED", 50);
      expect(result.confidenceAfter).toBe(10);
    });

    it("confidence is capped at 0 minimum", () => {
      const result = evaluateHypothesisResult("h1", "DEMAND", true, "DISCONFIRMED", 20);
      expect(result.confidenceAfter).toBe(0);
    });

    it("confidence is capped at 100 maximum", () => {
      const result = evaluateHypothesisResult("h1", "DEMAND", true, "CONFIRMED", 90);
      expect(result.confidenceAfter).toBe(100);
    });

    it("PARTIALLY_CONFIRMED increases confidence by 10", () => {
      const result = evaluateHypothesisResult("h1", "DELIVERY", false, "PARTIALLY_CONFIRMED", 50);
      expect(result.confidenceAfter).toBe(60);
    });

    it("INCONCLUSIVE decreases confidence by 5", () => {
      const result = evaluateHypothesisResult("h1", "PRICING", false, "INCONCLUSIVE", 50);
      expect(result.confidenceAfter).toBe(45);
    });
  });

  // ── evaluateHypothesisResult — effectOnScore ─────────────────────────────
  describe("effectOnScore", () => {
    it("critical hypothesis has 2× effect on score", () => {
      const critical = evaluateHypothesisResult("h1", "DEMAND", true, "CONFIRMED", 50);
      const nonCritical = evaluateHypothesisResult("h2", "SUPPLIER", false, "CONFIRMED", 50);
      expect(Math.abs(critical.effectOnScore)).toBe(Math.abs(nonCritical.effectOnScore) * 2);
    });
  });

  // ── evaluateHypothesisResult — memoryKey ─────────────────────────────────
  describe("memoryKey", () => {
    it("memoryKey follows pattern hypothesis:<type_lowercase>:<id>", () => {
      const result = evaluateHypothesisResult("abc-123", "DEMAND", true, "CONFIRMED", 50);
      expect(result.memoryKey).toBe("hypothesis:demand:abc-123");
    });
  });

  // ── Scenario G: owner GO decision vs system REJECT are separate (conceptual) ─
  describe("Scenario G — owner override is conceptually separate from system result", () => {
    it("a DISCONFIRMED critical hypothesis gives followUpAction suggesting MODIFY or REJECT", () => {
      const evaluation = evaluateHypothesisResult(
        "hyp-crit",
        "DEMAND",
        true,
        "DISCONFIRMED",
        50
      );
      expect(evaluation.followUpAction).toContain("MODIFY");
      expect(evaluation.followUpAction).toContain("REJECT");
    });

    it("the evaluation result does not suppress hypothesisId — both system result and id are preserved", () => {
      const evaluation = evaluateHypothesisResult("owner-override-id", "DEMAND", true, "DISCONFIRMED", 50);
      // System result (DISCONFIRMED) is stored; owner decision (GO) would be a separate field in the service layer
      expect(evaluation.hypothesisId).toBe("owner-override-id");
      expect(evaluation.result).toBe("DISCONFIRMED");
    });
  });

  // ── followUpAction per result type ───────────────────────────────────────
  describe("followUpAction", () => {
    it("INCONCLUSIVE → redesign experiment", () => {
      const result = evaluateHypothesisResult("h1", "PRICING", true, "INCONCLUSIVE", 50);
      expect(result.followUpAction).toContain("redesign");
    });

    it("PARTIALLY_CONFIRMED → run additional experiment", () => {
      const result = evaluateHypothesisResult("h1", "PRICING", false, "PARTIALLY_CONFIRMED", 50);
      expect(result.followUpAction).toContain("additional experiment");
    });

    it("CONFIRMED → proceed with dependent hypotheses", () => {
      const result = evaluateHypothesisResult("h1", "DEMAND", false, "CONFIRMED", 50);
      expect(result.followUpAction).toContain("dependent hypotheses");
    });
  });
});
