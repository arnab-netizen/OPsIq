/**
 * Budget Outcome Learning — pure classifier unit proof.
 *
 * Proves outcome → disposition + confidence-impact, including the honesty rules:
 * unverified/missing-data lowers DATA confidence (not the recommendation); owner-override
 * and external-factor failures are not counted against the recommendation; a recommendation
 * that has failed before escalates then blocks.
 */
import { describe, it, expect } from "vitest";
import { classifyBudgetOutcome } from "@/domain/owner-budget/outcome-learning";

describe("outcome-learning — module contract assertions", () => {
  it("classifyBudgetOutcome is a function", () => { expect(typeof classifyBudgetOutcome).toBe("function"); });
  it("classifyBudgetOutcome({...}) returns an object", () => { expect(typeof classifyBudgetOutcome({ outcomeVerified: true, expectedImpact: 100, actualImpact: 110 })).toBe("object"); });
  it("classifyBudgetOutcome result has outcome field", () => { expect(classifyBudgetOutcome({ outcomeVerified: true, expectedImpact: 100, actualImpact: 110 })).toHaveProperty("outcome"); });
  it("classifyBudgetOutcome result has disposition field", () => { expect(classifyBudgetOutcome({ outcomeVerified: true, expectedImpact: 100, actualImpact: 110 })).toHaveProperty("disposition"); });
  it("classifyBudgetOutcome result has confidenceImpact field", () => { expect(classifyBudgetOutcome({ outcomeVerified: true, expectedImpact: 100, actualImpact: 110 })).toHaveProperty("confidenceImpact"); });
  it("classifyBudgetOutcome result has safeForLearning field", () => { expect(classifyBudgetOutcome({ outcomeVerified: true, expectedImpact: 100, actualImpact: 110 })).toHaveProperty("safeForLearning"); });
  it("success result outcome is 'SUCCESS'", () => { expect(classifyBudgetOutcome({ outcomeVerified: true, expectedImpact: 100, actualImpact: 110 }).outcome).toBe("SUCCESS"); });
  it("success result disposition is 'repeat'", () => { expect(classifyBudgetOutcome({ outcomeVerified: true, expectedImpact: 100, actualImpact: 110 }).disposition).toBe("repeat"); });
  it("success result confidenceImpact is 'raise'", () => { expect(classifyBudgetOutcome({ outcomeVerified: true, expectedImpact: 100, actualImpact: 110 }).confidenceImpact).toBe("raise"); });
  it("success result safeForLearning is true", () => { expect(classifyBudgetOutcome({ outcomeVerified: true, expectedImpact: 100, actualImpact: 110 }).safeForLearning).toBe(true); });
  it("failed result outcome is 'FAILED'", () => { expect(classifyBudgetOutcome({ outcomeVerified: true, expectedImpact: 100, actualImpact: 10 }).outcome).toBe("FAILED"); });
  it("cancelled result outcome is 'CANCELLED'", () => { expect(classifyBudgetOutcome({ outcomeVerified: true, cancelled: true }).outcome).toBe("CANCELLED"); });
  it("overridden result outcome is 'OVERRIDDEN'", () => { expect(classifyBudgetOutcome({ outcomeVerified: true, overridden: true, expectedImpact: 100, actualImpact: 0 }).outcome).toBe("OVERRIDDEN"); });
  it("external factor result outcome is 'EXTERNAL_FACTOR'", () => { expect(classifyBudgetOutcome({ outcomeVerified: true, externalFactor: true, expectedImpact: 100, actualImpact: 0 }).outcome).toBe("EXTERNAL_FACTOR"); });
});

describe("classifyBudgetOutcome", () => {
  it("verified success ⇒ repeat + raise confidence", () => {
    const r = classifyBudgetOutcome({ outcomeVerified: true, expectedImpact: 100, actualImpact: 110 });
    expect(r.outcome).toBe("SUCCESS");
    expect(r.disposition).toBe("repeat");
    expect(r.confidenceImpact).toBe("raise");
    expect(r.safeForLearning).toBe(true);
  });

  it("partial result ⇒ modify + maintain", () => {
    const r = classifyBudgetOutcome({ outcomeVerified: true, expectedImpact: 100, actualImpact: 60 });
    expect(r.outcome).toBe("PARTIAL");
    expect(r.disposition).toBe("modify");
    expect(r.confidenceImpact).toBe("maintain");
  });

  it("verified failure (first time) ⇒ escalate + lower the recommendation", () => {
    const r = classifyBudgetOutcome({ outcomeVerified: true, expectedImpact: 100, actualImpact: 10, priorFailures: 0 });
    expect(r.outcome).toBe("FAILED");
    expect(r.disposition).toBe("escalate");
    expect(r.confidenceImpact).toBe("lower_recommendation");
  });

  it("repeated failure (priorFailures ≥ 1) ⇒ block, not blindly repeated", () => {
    const r = classifyBudgetOutcome({ outcomeVerified: true, expectedImpact: 100, actualImpact: 10, priorFailures: 1 });
    expect(r.outcome).toBe("FAILED");
    expect(r.disposition).toBe("block");
  });

  it("missing impact data ⇒ lower DATA confidence (not the recommendation)", () => {
    const r = classifyBudgetOutcome({ outcomeVerified: true, expectedImpact: null, actualImpact: null });
    expect(r.outcome).toBe("UNVERIFIED");
    expect(r.confidenceImpact).toBe("lower_data");
    expect(r.disposition).toBe("modify");
  });

  it("owner override failure ⇒ classified separately, recommendation confidence maintained", () => {
    const r = classifyBudgetOutcome({ outcomeVerified: true, overridden: true, expectedImpact: 100, actualImpact: 0 });
    expect(r.outcome).toBe("OVERRIDDEN");
    expect(r.confidenceImpact).toBe("maintain");
    expect(r.safeForLearning).toBe(false);
  });

  it("external factor ⇒ classified separately, not attributed to the recommendation", () => {
    const r = classifyBudgetOutcome({ outcomeVerified: true, externalFactor: true, expectedImpact: 100, actualImpact: 0 });
    expect(r.outcome).toBe("EXTERNAL_FACTOR");
    expect(r.confidenceImpact).toBe("maintain");
  });

  it("cancelled ⇒ block + maintain", () => {
    const r = classifyBudgetOutcome({ outcomeVerified: true, cancelled: true });
    expect(r.outcome).toBe("CANCELLED");
    expect(r.disposition).toBe("block");
  });

  it("is deterministic", () => {
    const i = { outcomeVerified: true, expectedImpact: 100, actualImpact: 95, priorFailures: 0 };
    expect(classifyBudgetOutcome(i)).toEqual(classifyBudgetOutcome(i));
  });
});
