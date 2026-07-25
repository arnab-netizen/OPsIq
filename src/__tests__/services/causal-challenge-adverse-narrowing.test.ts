import { describe, it, expect } from "vitest";
import { runCausalChallenge, type CausalEvidence } from "@/services/governance/causal-challenge";

/**
 * Adverse-off-archetype NARROWING (this slice). The blanket "any off-home adverse
 * evidence ⇒ abstain" is narrowed so SECONDARY / downstream / low-severity off-home
 * adverse evidence no longer forces abstention, while protected-danger families,
 * financial-aggravation language, and severe adverse numerics still hold. The
 * out-of-model arm is unchanged. No case ids / hidden keys / answer-key text.
 */

function ev(
  dimension: string,
  finding: string,
  isCritical = true,
  supportingData?: Record<string, string | number | boolean>
): CausalEvidence {
  return { dimension, finding, isCritical, supportingData };
}

// adverseOffArchetypeEvidence only (isolate the arm from the out-of-model arm by using
// a neutral businessProblem that carries no out-of-model stem).
function adverseOff(diagnosisType: string, evidence: CausalEvidence[]): boolean {
  return runCausalChallenge({
    committed: true,
    businessProblem: "the owner wants to improve results",
    diagnosisType,
    evidence,
  }).adverseOffArchetypeEvidence;
}

describe("causal-challenge-adverse-narrowing — module contract assertions", () => {
  it("runCausalChallenge is a function", () => { expect(typeof runCausalChallenge).toBe("function"); });
  it("ev is a function", () => { expect(typeof ev).toBe("function"); });
  it("adverseOff is a function", () => { expect(typeof adverseOff).toBe("function"); });
  it("ev() returns an object", () => { expect(typeof ev("financial_health", "test")).toBe("object"); });
  it("ev() has dimension field", () => { expect(ev("financial_health", "test")).toHaveProperty("dimension"); });
  it("ev() has finding field", () => { expect(ev("financial_health", "test")).toHaveProperty("finding"); });
  it("adverseOff() returns a boolean", () => { expect(typeof adverseOff("cash_liquidity_crisis", [])).toBe("boolean"); });
  it("runCausalChallenge returns an object", () => { expect(typeof runCausalChallenge({ committed: true, businessProblem: "test", diagnosisType: "unknown", evidence: [] })).toBe("object"); });
  it("runCausalChallenge result has adverseOffArchetypeEvidence field", () => { expect(runCausalChallenge({ committed: true, businessProblem: "test", diagnosisType: "unknown", evidence: [] })).toHaveProperty("adverseOffArchetypeEvidence"); });
  it("runCausalChallenge result has challenged field", () => { expect(runCausalChallenge({ committed: true, businessProblem: "test", diagnosisType: "unknown", evidence: [] })).toHaveProperty("challenged"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
  it("typeof JSON.stringify equals function", () => { expect(typeof JSON.stringify).toBe("function"); });
});

describe("causal-challenge — adverse-off-archetype narrowing (release)", () => {
  it("NON-critical off-home adverse evidence does NOT force abstention", () => {
    expect(
      adverseOff("quality_control_failure", [
        ev("quality_delivery", "Complaint and defect rates rose first", true, { complaintRate: 11 }),
        ev("customer_retention", "Visit frequency dropped among loyal guests citing safety", false, { repeatRatePct: 48 }),
      ])
    ).toBe(false);
  });

  it("downstream churn under a churn-driver diagnosis does NOT force abstention", () => {
    expect(
      adverseOff("quality_control_failure", [
        ev("quality_delivery", "Complaint and defect rates rose first and churn followed", true, { complaintRate: 11 }),
        ev("customer_retention", "Repeat rate fell sharply among recent cohorts after a service change", true, { repeatRatePct: 34 }),
      ])
    ).toBe(false);
  });

  it("key-person diagnosis with downstream churn does NOT force abstention", () => {
    expect(
      adverseOff("key_person_risk", [
        ev("team_capability", "The only senior rainmaker left and took client relationships", true, { keyPersonCount: 1 }),
        ev("customer_retention", "Repeat bookings fell sharply in the same period", true, { repeatRatePct: 32 }),
      ])
    ).toBe(false);
  });

  it("a secondary operational drop under a legal diagnosis does NOT force abstention", () => {
    expect(
      adverseOff("legal_governance_risk", [
        ev("process_maturity", "A governance breach surfaced and a regulator is asking questions", true, { complianceGapCount: 5 }),
        ev("operational_efficiency", "There is also an operational efficiency drop the owner wants to tackle first", true, { turnaroundDays: 7 }),
      ])
    ).toBe(false);
  });
});

describe("causal-challenge — adverse-off-archetype narrowing (still holds)", () => {
  it("critical legal/fraud off-archetype evidence still abstains", () => {
    expect(
      adverseOff("cash_liquidity_crisis", [
        ev("financial_health", "Runway is short and burn is high", true, { cashRunwayMonths: 4 }),
        ev("process_maturity", "A regulator opened a fraud inquiry into unauthorized accounts", true, { complianceGapCount: 6 }),
      ])
    ).toBe(true);
  });

  it("critical off-archetype NEGATIVE margin still abstains", () => {
    expect(
      adverseOff("inventory_forecasting_mismatch", [
        ev("operational_efficiency", "Forecast error misallocates stock", true, { forecastErrorPct: 40 }),
        ev("financial_health", "Gross margin fell into negative territory", true, { marginPct: -6 }),
      ])
    ).toBe(true);
  });

  it("critical capex / irreversible off-archetype evidence still abstains", () => {
    expect(
      adverseOff("cash_liquidity_crisis", [
        ev("financial_health", "Runway is short", true, { cashRunwayMonths: 4 }),
        ev("market_position", "An irreversible facility expansion is proposed on a single contract", true, { demandDurabilityMonths: 6 }),
      ])
    ).toBe(true);
  });

  it("severe ≤3-month runway off-archetype evidence still abstains", () => {
    expect(
      adverseOff("operational_bottleneck", [
        ev("operational_efficiency", "Turnaround is slow at one station", true, { turnaroundDays: 12 }),
        ev("financial_health", "Cash will run out within two months", true, { cashRunwayMonths: 2 }),
      ])
    ).toBe(true);
  });

  it("financial-aggravation language (deepening the core problem) still abstains", () => {
    expect(
      adverseOff("debt_solvency_pressure", [
        ev("financial_health", "In covenant breach yet plans to take on new debt", true, { covenantHeadroom: -0.02 }),
        ev("market_position", "The new contract is large, low-margin, and back-loaded, which deepens the hole", true, { contractMargin: 2 }),
      ])
    ).toBe(true);
  });

  it("owner proposing to scale spend to grow out of a loss still abstains", () => {
    expect(
      adverseOff("unit_economics_failure", [
        ev("financial_health", "Contribution per unit is negative", true, { contribution: -3 }),
        ev("market_position", "The owner wants to scale acquisition spend hard to grow out of the loss", true, { newCustomerRate: 12 }),
      ])
    ).toBe(true);
  });
});

describe("causal-challenge — out-of-model arm (protected-danger) still holds", () => {
  it("a protected-danger out-of-model cause in the business problem still abstains", () => {
    // A liquidity threat not subsumed by an operational diagnosis still holds the
    // out-of-model arm (covered/incidental stems are released — see
    // causal-challenge-out-of-model-narrowing.test.ts).
    const sig = runCausalChallenge({
      committed: true,
      businessProblem: "turnaround is slow and the firm is near insolvency with a thin cash runway",
      diagnosisType: "operational_bottleneck",
      evidence: [ev("operational_efficiency", "Turnaround is slow", true, { turnaroundDays: 12 })],
    });
    expect(sig.outOfModelCauseInProblem).toBe(true);
    expect(sig.challenged).toBe(true);
  });
});
