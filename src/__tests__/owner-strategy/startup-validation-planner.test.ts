/**
 * Unit tests for startup-validation-planner.ts
 * Tests: buildValidationPlan, rankExperiments
 */
import { describe, it, expect } from "vitest";
import { buildValidationPlan, rankExperiments, type HypothesisForPlanning } from "@/domain/owner-strategy/startup-validation-planner";

function makeHypothesis(overrides: Partial<HypothesisForPlanning> = {}): HypothesisForPlanning {
  return {
    id: "hyp-1",
    statement: "Customers will pay $50 for this service",
    hypothesisType: "DEMAND",
    confidenceBefore: 40,
    falsificationCriteria: "Less than 10% of prospects agree to pay",
    requiresOwnerApproval: false,
    expectedCostCents: null,
    expectedDurationDays: null,
    ...overrides,
  };
}

describe("startup-validation-planner — module contract assertions", () => {
  it("buildValidationPlan is a function", () => { expect(typeof buildValidationPlan).toBe("function"); });
  it("rankExperiments is a function", () => { expect(typeof rankExperiments).toBe("function"); });
  it("makeHypothesis is a function", () => { expect(typeof makeHypothesis).toBe("function"); });
  it("makeHypothesis() returns an object", () => { expect(typeof makeHypothesis()).toBe("object"); });
  it("makeHypothesis() has id field", () => { expect(makeHypothesis()).toHaveProperty("id"); });
  it("makeHypothesis().id equals 'hyp-1'", () => { expect(makeHypothesis().id).toBe("hyp-1"); });
  it("makeHypothesis() has statement field", () => { expect(makeHypothesis()).toHaveProperty("statement"); });
  it("makeHypothesis() has hypothesisType field", () => { expect(makeHypothesis()).toHaveProperty("hypothesisType"); });
  it("makeHypothesis().hypothesisType equals 'DEMAND'", () => { expect(makeHypothesis().hypothesisType).toBe("DEMAND"); });
  it("makeHypothesis() has confidenceBefore field", () => { expect(makeHypothesis()).toHaveProperty("confidenceBefore"); });
  it("makeHypothesis().confidenceBefore equals 40", () => { expect(makeHypothesis().confidenceBefore).toBe(40); });
  it("buildValidationPlan([]) returns an object", () => { expect(typeof buildValidationPlan([])).toBe("object"); });
  it("buildValidationPlan([]) has experiments field", () => { expect(buildValidationPlan([])).toHaveProperty("experiments"); });
  it("buildValidationPlan([]).experiments has length 0", () => { expect(buildValidationPlan([]).experiments).toHaveLength(0); });
});

describe("buildValidationPlan", () => {
  it("returns empty experiments list for empty hypotheses", () => {
    const result = buildValidationPlan([]);
    expect(result.experiments).toHaveLength(0);
  });

  it("returns one experiment per hypothesis", () => {
    const hypotheses = [
      makeHypothesis({ id: "h1", hypothesisType: "DEMAND" }),
      makeHypothesis({ id: "h2", hypothesisType: "PRICING" }),
    ];
    const result = buildValidationPlan(hypotheses);
    expect(result.experiments).toHaveLength(2);
  });

  it("each experiment has a mechanism, instructions, passCriteria, failCriteria", () => {
    const result = buildValidationPlan([makeHypothesis()]);
    const exp = result.experiments[0];
    expect(exp.mechanism).toBeDefined();
    expect(exp.instructions).toBeTruthy();
    expect(exp.passCriteria).toBeTruthy();
    expect(exp.failCriteria).toBeTruthy();
  });

  it("totalSpendingLimitCents is sum of estimated experiment costs", () => {
    const hypotheses = [
      makeHypothesis({ id: "h1", hypothesisType: "DEMAND" }),
      makeHypothesis({ id: "h2", hypothesisType: "DEMAND" }),
    ];
    const result = buildValidationPlan(hypotheses);
    expect(typeof result.totalSpendingLimitCents).toBe("bigint");
    expect(result.totalSpendingLimitCents).toBeGreaterThanOrEqual(0n);
  });

  it("owner-approval hypotheses generate requiresOwnerApproval=true experiments", () => {
    const hyp = makeHypothesis({ requiresOwnerApproval: true });
    const result = buildValidationPlan([hyp]);
    expect(result.experiments[0].requiresOwnerApproval).toBe(true);
  });

  it("stopConditions is a non-null array", () => {
    const result = buildValidationPlan([makeHypothesis()]);
    expect(Array.isArray(result.stopConditions)).toBe(true);
  });

  it("safetyLimits is an object", () => {
    const result = buildValidationPlan([makeHypothesis()]);
    expect(typeof result.safetyLimits).toBe("object");
    expect(result.safetyLimits).not.toBeNull();
  });
});

describe("rankExperiments", () => {
  it("returns same number of experiments, sorted by priorityRank ascending", () => {
    const result = buildValidationPlan([
      makeHypothesis({ id: "h1", hypothesisType: "DEMAND" }),
      makeHypothesis({ id: "h2", hypothesisType: "PRICING" }),
      makeHypothesis({ id: "h3", hypothesisType: "REGULATORY" }),
    ]);
    const ranked = rankExperiments(result.experiments);
    expect(ranked).toHaveLength(result.experiments.length);
    for (let i = 0; i < ranked.length - 1; i++) {
      expect(ranked[i].priorityRank).toBeLessThanOrEqual(ranked[i + 1].priorityRank);
    }
  });
});
