import { describe, it, expect } from "vitest";
import { runCausalChallenge, type CausalEvidence } from "@/services/governance/causal-challenge";

/**
 * Out-of-model arm NARROWING (this slice). After R5 slices 1–3 most former out-of-
 * model domains are COVERED, so the out-of-model arm holds ONLY when a matched stem is
 * a PROTECTED-danger family (liquidity / capex / legal-fraud) the committed diagnosis
 * does not subsume, or the problem states a deep-discount-on-negative-economics owner
 * action. Covered/incidental stems no longer abstain. The adverse-off-archetype arm is
 * untouched. No case ids / hidden keys / answer-key text.
 */

function ev(dimension: string, finding: string, isCritical = true, sd?: Record<string, string | number | boolean>): CausalEvidence {
  return { dimension, finding, isCritical, supportingData: sd };
}
// isolate the out-of-model arm: neutral evidence so the adverse-off arm cannot fire.
const neutral: CausalEvidence[] = [ev("operational_efficiency", "throughput is steady", true, { utilizationPct: 70 })];
function oom(diagnosisType: string, businessProblem: string, evidence = neutral): boolean {
  return runCausalChallenge({ committed: true, businessProblem, diagnosisType, evidence }).outOfModelCauseInProblem;
}

describe("causal-challenge — out-of-model narrowing (release)", () => {
  it("an incidental founder/actor mention under a covered diagnosis does NOT abstain", () => {
    expect(oom("unit_economics_failure", "the founder wants to know whether to keep pushing growth as losses per customer rise")).toBe(false);
  });

  it("a liquidity stem SUBSUMED by a cash diagnosis does NOT abstain", () => {
    expect(oom("cash_liquidity_crisis", "cash runway is three months and the owner wants the decisive first move")).toBe(false);
  });

  it("'insolvency' SUBSUMED by a working-capital diagnosis does NOT abstain", () => {
    expect(oom("working_capital_stress", "the owner fears insolvency but the cash is trapped in receivables")).toBe(false);
  });

  it("a demand-collapse stem SUBSUMED by a demand diagnosis does NOT abstain", () => {
    expect(oom("demand_generation_failure", "core demand collapsed as the category moved to online substitutes")).toBe(false);
  });

  it("an incidental 'seasonal' mention under a debt diagnosis does NOT abstain", () => {
    expect(oom("debt_solvency_pressure", "a debt maturity with thin covenant headroom looms and the owner wants a big seasonal inventory buy")).toBe(false);
  });
});

describe("causal-challenge — out-of-model narrowing (still holds)", () => {
  it("a liquidity threat NOT subsumed by a non-liquidity diagnosis still abstains (ADV-02 style)", () => {
    expect(oom("strategic_capex_risk", "the owner wants an irreversible automation line on the back of a spike despite a thin cash runway")).toBe(true);
  });

  it("a capex threat NOT subsumed by a cash diagnosis still abstains (PC-11 style)", () => {
    expect(oom("cash_liquidity_crisis", "cash runway is four months and the owner wants to commit a large efficiency capex now")).toBe(true);
  });

  it("a liquidity threat under a retention diagnosis still abstains (PC-01 style)", () => {
    expect(oom("customer_retention_erosion", "both cash and churn are problems; the owner wants to fix retention first but runway is short")).toBe(true);
  });

  it("a legal/regulatory cause not subsumed by a non-legal diagnosis still abstains", () => {
    expect(oom("operational_bottleneck", "a regulatory ban is imminent and turnaround is also slow")).toBe(true);
  });

  it("a deep discount on already-negative unit economics still abstains (ADV-01 style)", () => {
    expect(
      oom(
        "unit_economics_failure",
        "the founder wants to launch an aggressive sitewide discount to buy back loyalty but the unit economics are already negative"
      )
    ).toBe(true);
  });

  it("a legal diagnosis SUBSUMES its own regulatory stem (no double-hold)", () => {
    expect(oom("legal_governance_risk", "a regulatory filing deadline looms with unmet compliance requirements")).toBe(false);
  });
});
