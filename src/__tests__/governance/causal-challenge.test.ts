import { describe, it, expect } from "vitest";
import { runCausalChallenge } from "@/services/governance/causal-challenge";

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

  it("flags an out-of-model cause cited in the stated problem (alignment failure)", () => {
    const r = runCausalChallenge({
      committed: true,
      businessProblem:
        "Churn spiked the same month a competitor launched a permanent free tier.",
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
        { dimension: "financial_health", finding: "Contribution margin negative (-12%)", supportingData: { marginPct: -12 } },
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
