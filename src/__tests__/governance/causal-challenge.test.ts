import { describe, it, expect } from "vitest";
import { runCausalChallenge } from "@/services/governance/causal-challenge";

describe("causal-challenge verifier — module contract assertions", () => {
  it("runCausalChallenge is a function", () => {
    expect(typeof runCausalChallenge).toBe("function");
  });
  it("runCausalChallenge returns an object", () => {
    const r = runCausalChallenge({ committed: false, businessProblem: "test", diagnosisType: "unknown", evidence: [] });
    expect(typeof r).toBe("object");
  });
  it("runCausalChallenge result has challenged field", () => {
    const r = runCausalChallenge({ committed: false, businessProblem: "test", diagnosisType: "unknown", evidence: [] });
    expect(r).toHaveProperty("challenged");
  });
  it("runCausalChallenge result has abstention_hint field", () => {
    const r = runCausalChallenge({ committed: false, businessProblem: "test", diagnosisType: "unknown", evidence: [] });
    expect(r).toHaveProperty("abstention_hint");
  });
  it("challenged is a boolean", () => {
    const r = runCausalChallenge({ committed: false, businessProblem: "test", diagnosisType: "unknown", evidence: [] });
    expect(typeof r.challenged).toBe("boolean");
  });
  it("uncommitted diagnosis is not challenged", () => {
    const r = runCausalChallenge({ committed: false, businessProblem: "test", diagnosisType: "unknown", evidence: [] });
    expect(r.challenged).toBe(false);
  });
  it("uncommitted diagnosis has null abstention_hint", () => {
    const r = runCausalChallenge({ committed: false, businessProblem: "test", diagnosisType: "unknown", evidence: [] });
    expect(r.abstention_hint).toBeNull();
  });
  it("result has outOfModelCauseInProblem field", () => {
    const r = runCausalChallenge({ committed: true, businessProblem: "test", diagnosisType: "quality_control_failure", evidence: [] });
    expect(r).toHaveProperty("outOfModelCauseInProblem");
  });
  it("result has adverseOffArchetypeEvidence field", () => {
    const r = runCausalChallenge({ committed: true, businessProblem: "test", diagnosisType: "quality_control_failure", evidence: [] });
    expect(r).toHaveProperty("adverseOffArchetypeEvidence");
  });
  it("committed with empty evidence does not challenge", () => {
    const r = runCausalChallenge({ committed: true, businessProblem: "steady growth needed", diagnosisType: "quality_control_failure", evidence: [] });
    expect(r.challenged).toBe(false);
  });
  it("outOfModelCauseInProblem is a boolean", () => {
    const r = runCausalChallenge({ committed: true, businessProblem: "test", diagnosisType: "quality_control_failure", evidence: [] });
    expect(typeof r.outOfModelCauseInProblem).toBe("boolean");
  });
  it("adverseOffArchetypeEvidence is a boolean", () => {
    const r = runCausalChallenge({ committed: true, businessProblem: "test", diagnosisType: "quality_control_failure", evidence: [] });
    expect(typeof r.adverseOffArchetypeEvidence).toBe("boolean");
  });
  it("benign evidence on supported domain does not challenge", () => {
    const r = runCausalChallenge({ committed: true, businessProblem: "No QA checkpoints; complaints rising.", diagnosisType: "quality_control_failure", evidence: [{ dimension: "quality_delivery", finding: "complaint rate rising", isCritical: true }] });
    expect(r.challenged).toBe(false);
  });
  it("non-adverse off-archetype evidence does not trigger adverseOffArchetypeEvidence", () => {
    const r = runCausalChallenge({ committed: true, businessProblem: "Customers don't rebook.", diagnosisType: "customer_retention_erosion", evidence: [{ dimension: "customer_retention", finding: "low repeat", isCritical: true }, { dimension: "financial_health", finding: "revenue growing steadily" }] });
    expect(r.adverseOffArchetypeEvidence).toBe(false);
  });
  it("abstention_hint is string or null", () => {
    const r = runCausalChallenge({ committed: true, businessProblem: "test", diagnosisType: "customer_retention_erosion", evidence: [] });
    expect(r.abstention_hint === null || typeof r.abstention_hint === "string").toBe(true);
  });
});

/** RC-7 Option A: independent causal-challenge verifier. */
describe("causal-challenge verifier", () => {
  it("is inert when the diagnosis is not committed", () => {
    const r = runCausalChallenge({
      committed: false,
      businessProblem: "competitor launched a free tier",
      diagnosisType: "unknown",
      evidence: [{ dimension: "financial_health", finding: "margin negative -12%" }],
    });
    expect(r.challenged).toBe(false);
    expect(r.abstention_hint).toBeNull();
  });

  it("flags an out-of-model PROTECTED-danger cause cited in the stated problem (alignment failure)", () => {
    // Post-narrowing: the out-of-model arm holds on a protected-danger family
    // (legal/liquidity/capex) the committed diagnosis does not subsume — here a
    // regulatory ban under a retention diagnosis. (Covered/incidental causes no
    // longer hold; see causal-challenge-out-of-model-narrowing.test.ts.)
    const r = runCausalChallenge({
      committed: true,
      businessProblem:
        "Churn spiked the same month a regulatory ban hit the core product line.",
      diagnosisType: "customer_retention_erosion",
      evidence: [{ dimension: "customer_retention", finding: "churn up", isCritical: true }],
    });
    expect(r.outOfModelCauseInProblem).toBe(true);
    expect(r.challenged).toBe(true);
  });

  it("flags adverse evidence in a dimension the archetype ignored (contradictory signal)", () => {
    const r = runCausalChallenge({
      committed: true,
      businessProblem: "Customers are not coming back.",
      diagnosisType: "customer_retention_erosion",
      evidence: [
        { dimension: "customer_retention", finding: "low repeat purchase", isCritical: true },
        { dimension: "financial_health", finding: "Contribution margin negative (-12%)", isCritical: true, supportingData: { marginPct: -12 } },
      ],
    });
    expect(r.adverseOffArchetypeEvidence).toBe(true);
    expect(r.challenged).toBe(true);
    expect(r.abstention_hint).toBe("CONFLICTING_SIGNALS");
  });

  it("PRESERVES controls: benign off-archetype evidence and no out-of-model cause", () => {
    const r1 = runCausalChallenge({
      committed: true,
      businessProblem: "No QA checkpoints; complaints rising due to inconsistency.",
      diagnosisType: "quality_control_failure",
      evidence: [
        { dimension: "quality_delivery", finding: "complaint rate rising", isCritical: true },
        { dimension: "financial_health", finding: "margins stable" },
      ],
    });
    expect(r1.challenged).toBe(false);

    const r2 = runCausalChallenge({
      committed: true,
      businessProblem: "No follow-up or loyalty mechanism; customers don't rebook.",
      diagnosisType: "customer_retention_erosion",
      evidence: [
        { dimension: "customer_retention", finding: "low repeat purchase", isCritical: true },
        { dimension: "financial_health", finding: "healthy positive margins" },
      ],
    });
    expect(r2.challenged).toBe(false);
  });

  it("does not flag merely because off-archetype evidence exists (must be adverse)", () => {
    const r = runCausalChallenge({
      committed: true,
      businessProblem: "Customers don't rebook.",
      diagnosisType: "customer_retention_erosion",
      evidence: [
        { dimension: "customer_retention", finding: "low repeat", isCritical: true },
        { dimension: "financial_health", finding: "revenue growing steadily" },
      ],
    });
    expect(r.adverseOffArchetypeEvidence).toBe(false);
    expect(r.challenged).toBe(false);
  });
});
