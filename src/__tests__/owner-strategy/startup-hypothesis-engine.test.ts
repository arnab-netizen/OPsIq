import { describe, it, expect } from "vitest";
import {
  generateHypotheses,
  prioritizeHypotheses,
  evaluateHypothesisResult,
  type HypothesisInput,
} from "@/domain/owner-strategy/startup-hypothesis-engine";

function baseInput(overrides: Partial<HypothesisInput> = {}): HypothesisInput {
  return {
    ideaName: "Test Startup",
    industry: "services",
    targetCustomer: "SMB owners",
    valuePropSummary: "Saves time on administrative tasks",
    revenueModel: "subscription",
    requiresLicence: false,
    estimatedCacCents: 5000,
    evidenceAvailable: [],
    ...overrides,
  };
}

describe("generateHypotheses", () => {
  it("returns 11 hypotheses when includeRegulatory is false", () => {
    const result = generateHypotheses(baseInput(), false);
    expect(result).toHaveLength(11);
  });

  it("returns 12 hypotheses when includeRegulatory is true", () => {
    const result = generateHypotheses(baseInput(), true);
    expect(result).toHaveLength(12);
  });

  it("includes REGULATORY_VIABILITY only when requested", () => {
    const without = generateHypotheses(baseInput(), false);
    const withReg = generateHypotheses(baseInput(), true);
    const withoutTypes = without.map((h) => h.hypothesisType);
    const withTypes = withReg.map((h) => h.hypothesisType);
    expect(withoutTypes).not.toContain("REGULATORY_VIABILITY");
    expect(withTypes).toContain("REGULATORY_VIABILITY");
  });

  it("all hypotheses have required fields", () => {
    const result = generateHypotheses(baseInput(), false);
    for (const h of result) {
      expect(h.statement).toBeTruthy();
      expect(h.hypothesisType).toBeTruthy();
      expect(h.falsificationCriteria).toBeTruthy();
      expect(h.validationMethod).toBeTruthy();
      expect(typeof h.priorityScore).toBe("number");
      expect(typeof h.confidenceBefore).toBe("number");
    }
  });

  it("confidenceBefore is 30 when evidence is available", () => {
    const result = generateHypotheses(baseInput({ evidenceAvailable: ["survey data"] }), false);
    expect(result[0].confidenceBefore).toBe(30);
  });

  it("confidenceBefore is 10 when no evidence is available", () => {
    const result = generateHypotheses(baseInput({ evidenceAvailable: [] }), false);
    expect(result[0].confidenceBefore).toBe(10);
  });

  it("ACQUISITION_FEASIBILITY uses estimatedCacCents × 5 for cost", () => {
    const idea = baseInput({ estimatedCacCents: 2000 });
    const result = generateHypotheses(idea, false);
    const acqHyp = result.find((h) => h.hypothesisType === "ACQUISITION_FEASIBILITY");
    expect(acqHyp).toBeDefined();
    expect(acqHyp!.expectedCostCents).toBe(10000);
  });
});

describe("prioritizeHypotheses", () => {
  it("returns hypotheses sorted by priorityScore descending", () => {
    const hypotheses = generateHypotheses(baseInput(), false);
    const sorted = prioritizeHypotheses(hypotheses);
    for (let i = 0; i < sorted.length - 1; i++) {
      expect(sorted[i].priorityScore).toBeGreaterThanOrEqual(sorted[i + 1].priorityScore);
    }
  });

  it("does not mutate the input array", () => {
    const hypotheses = generateHypotheses(baseInput(), false);
    const originalFirst = hypotheses[0].hypothesisType;
    prioritizeHypotheses(hypotheses);
    expect(hypotheses[0].hypothesisType).toBe(originalFirst);
  });

  it("returns an array of the same length", () => {
    const hypotheses = generateHypotheses(baseInput(), false);
    const sorted = prioritizeHypotheses(hypotheses);
    expect(sorted).toHaveLength(hypotheses.length);
  });
});

describe("evaluateHypothesisResult — CONFIRMED", () => {
  it("raises confidenceAfter above confidenceBefore", () => {
    const evaluation = evaluateHypothesisResult("PROBLEM_EXISTENCE", "CONFIRMED", 20);
    expect(evaluation.confidenceAfter).toBeGreaterThan(20);
  });

  it("caps confidenceAfter at 90", () => {
    const evaluation = evaluateHypothesisResult("PROBLEM_EXISTENCE", "CONFIRMED", 80);
    expect(evaluation.confidenceAfter).toBeLessThanOrEqual(90);
  });

  it("effectOnScore is positive", () => {
    const evaluation = evaluateHypothesisResult("WILLINGNESS_TO_PAY", "CONFIRMED", 30);
    expect(evaluation.effectOnScore).toBeGreaterThan(0);
  });
});

describe("evaluateHypothesisResult — REJECTED", () => {
  it("drops confidenceAfter to 5", () => {
    const evaluation = evaluateHypothesisResult("WILLINGNESS_TO_PAY", "REJECTED", 50);
    expect(evaluation.confidenceAfter).toBe(5);
  });

  it("effectOnScore is -40", () => {
    const evaluation = evaluateHypothesisResult("WILLINGNESS_TO_PAY", "REJECTED", 50);
    expect(evaluation.effectOnScore).toBe(-40);
  });

  it("followUpAction is non-empty and specific", () => {
    const evaluation = evaluateHypothesisResult("UNIT_ECONOMICS", "REJECTED", 40);
    expect(evaluation.followUpAction.length).toBeGreaterThan(10);
  });
});

describe("evaluateHypothesisResult — WEAKENED", () => {
  it("reduces confidenceAfter", () => {
    const evaluation = evaluateHypothesisResult("CUSTOMER_SEGMENT", "WEAKENED", 50);
    expect(evaluation.confidenceAfter).toBeLessThan(50);
  });

  it("effectOnScore is -10", () => {
    const evaluation = evaluateHypothesisResult("CUSTOMER_SEGMENT", "WEAKENED", 50);
    expect(evaluation.effectOnScore).toBe(-10);
  });
});

describe("evaluateHypothesisResult — INCONCLUSIVE", () => {
  it("keeps confidenceAfter the same as before", () => {
    const evaluation = evaluateHypothesisResult("PROBLEM_SEVERITY", "INCONCLUSIVE", 35);
    expect(evaluation.confidenceAfter).toBe(35);
  });

  it("effectOnScore is -5", () => {
    const evaluation = evaluateHypothesisResult("PROBLEM_SEVERITY", "INCONCLUSIVE", 35);
    expect(evaluation.effectOnScore).toBe(-5);
  });
});

describe("evaluateHypothesisResult — PENDING", () => {
  it("keeps confidenceAfter unchanged", () => {
    const evaluation = evaluateHypothesisResult("RETENTION_POTENTIAL", "PENDING", 20);
    expect(evaluation.confidenceAfter).toBe(20);
  });

  it("effectOnScore is 0", () => {
    const evaluation = evaluateHypothesisResult("RETENTION_POTENTIAL", "PENDING", 20);
    expect(evaluation.effectOnScore).toBe(0);
  });
});
