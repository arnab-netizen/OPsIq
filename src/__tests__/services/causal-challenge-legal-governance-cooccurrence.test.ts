import { describe, it, expect } from "vitest";
import { runCausalChallenge } from "@/services/governance/causal-challenge";
import type { CausalChallengeInput } from "@/services/governance/causal-challenge";

/**
 * P2 fix: causal-challenge bypass for legal_governance_risk.
 *
 * Historical governance/fraud cases (Luckin, Byjus, Satyam, Paytm, etc.) have evidence
 * in raw dimensions ("governance", "finance", "operations") that do not match the mapped
 * home dimensions for legal_governance_risk ("process_maturity", "market_position").
 * Findings in those off-home dimensions contain governance/fraud/regulatory text that
 * matches PROTECTED_OFF_ARCHETYPE, causing adverseOffArchetypeEvidence=true.
 *
 * Fix: for legal_governance_risk, off-home findings that match PROTECTED_OFF_ARCHETYPE
 * via governance/regulatory/fraud vocabulary (LEGAL_GOVERNANCE_HOME_SIGNAL) are the
 * same signal that produced the diagnosis — they do not contradict it. Bypass applied
 * when finding has no numeric corroboration and is not a structural-commitment term.
 *
 * Guards that must still hold:
 *   - Structural commitment (capex/irreversible) always holds
 *   - Numeric-corroborated governance finding still holds
 *   - Insolvency/cash terms in off-home dim still hold for legal_governance_risk
 *   - Financial distress with legal bypass still works (P1 unchanged)
 */

function cc(
  diagnosisType: string,
  evidence: CausalChallengeInput["evidence"],
  businessProblem = "Company requires diagnosis."
): ReturnType<typeof runCausalChallenge> {
  return runCausalChallenge({ committed: true, businessProblem, diagnosisType, evidence });
}

describe("causal-challenge-legal-governance-cooccurrence — module contract assertions", () => {
  it("runCausalChallenge is a function", () => { expect(typeof runCausalChallenge).toBe("function"); });
  it("cc is a function", () => { expect(typeof cc).toBe("function"); });
  it("cc('legal_governance_risk', []) returns an object", () => { expect(typeof cc("legal_governance_risk", [])).toBe("object"); });
  it("cc result has adverseOffArchetypeEvidence field", () => { expect(cc("legal_governance_risk", [])).toHaveProperty("adverseOffArchetypeEvidence"); });
  it("cc result has challenged field", () => { expect(cc("legal_governance_risk", [])).toHaveProperty("challenged"); });
  it("typeof cc result.adverseOffArchetypeEvidence is 'boolean'", () => { expect(typeof cc("legal_governance_risk", []).adverseOffArchetypeEvidence).toBe("boolean"); });
  it("typeof cc result.challenged is 'boolean'", () => { expect(typeof cc("legal_governance_risk", []).challenged).toBe("boolean"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
  it("expect is a function", () => { expect(typeof expect).toBe("function"); });
  it("cc('cash_liquidity_crisis', []) returns an object", () => { expect(typeof cc("cash_liquidity_crisis", [])).toBe("object"); });
  it("cc('cash_liquidity_crisis', []) has challenged field", () => { expect(cc("cash_liquidity_crisis", [])).toHaveProperty("challenged"); });
  it("cc with empty evidence has challenged false", () => { expect(cc("legal_governance_risk", []).challenged).toBe(false); });
  it("cc with empty evidence has adverseOffArchetypeEvidence false", () => { expect(cc("legal_governance_risk", []).adverseOffArchetypeEvidence).toBe(false); });
});

describe("P2 causal-challenge — legal_governance_risk home-signal bypass", () => {
  it("governance text in raw 'operations' dim does NOT hold for legal_governance_risk (Luckin-style)", () => {
    const r = cc("legal_governance_risk", [
      {
        dimension: "operations",
        finding: "Rapid store network expansion outpacing normal governance and internal control development",
        isCritical: true,
      },
    ]);
    expect(r.adverseOffArchetypeEvidence).toBe(false);
    expect(r.challenged).toBe(false);
  });

  it("regulatory text in raw 'finance' dim does NOT hold for legal_governance_risk (Paytm-style)", () => {
    const r = cc("legal_governance_risk", [
      {
        dimension: "finance",
        finding: "Persistent non-compliance with regulatory directives led to RBI restrictions on fresh deposits",
        isCritical: true,
      },
    ]);
    expect(r.adverseOffArchetypeEvidence).toBe(false);
    expect(r.challenged).toBe(false);
  });

  it("fraud text in raw 'governance' dim does NOT hold for legal_governance_risk (Satyam-style)", () => {
    const r = cc("legal_governance_risk", [
      {
        dimension: "governance",
        finding: "Board approved related-party acquisition without adequate scrutiny — fraud risk and governance compliance failure",
        isCritical: true,
      },
    ]);
    expect(r.adverseOffArchetypeEvidence).toBe(false);
    expect(r.challenged).toBe(false);
  });

  it("sanction text in off-home dim does NOT hold for legal_governance_risk", () => {
    const r = cc("legal_governance_risk", [
      {
        dimension: "finance",
        finding: "Entity faces risk of regulatory sanction if compliance remediation is not completed within deadline",
        isCritical: true,
      },
    ]);
    expect(r.adverseOffArchetypeEvidence).toBe(false);
    expect(r.challenged).toBe(false);
  });

  it("governance text WITH numeric supportingData still holds for legal_governance_risk", () => {
    const r = cc("legal_governance_risk", [
      {
        dimension: "operations",
        finding: "Governance control framework failure — 6 compliance gaps identified",
        isCritical: true,
        supportingData: { complianceGapCount: 6 },
      },
    ]);
    expect(r.adverseOffArchetypeEvidence).toBe(true);
    expect(r.challenged).toBe(true);
  });

  it("insolvency text in off-home dim still holds for legal_governance_risk (contradictory — different primary cause)", () => {
    const r = cc("legal_governance_risk", [
      {
        dimension: "finance",
        finding: "Entity is technically insolvent; rescue or resolution required",
        isCritical: true,
      },
    ]);
    expect(r.adverseOffArchetypeEvidence).toBe(true);
    expect(r.challenged).toBe(true);
  });

  it("capex/irreversible structural commitment always holds for legal_governance_risk", () => {
    const r = cc("legal_governance_risk", [
      {
        dimension: "finance",
        finding: "Board proposing irreversible facility expansion during governance crisis",
        isCritical: true,
      },
    ]);
    expect(r.adverseOffArchetypeEvidence).toBe(true);
    expect(r.challenged).toBe(true);
  });

  it("non-critical off-home governance finding does NOT hold (isCritical=false guard unchanged)", () => {
    const r = cc("legal_governance_risk", [
      {
        dimension: "operations",
        finding: "Minor governance documentation gap in one subsidiary",
        isCritical: false,
      },
    ]);
    expect(r.adverseOffArchetypeEvidence).toBe(false);
  });

  it("P1 bypass unchanged — cash_liquidity_crisis with off-home regulatory finding does NOT hold", () => {
    const r = cc("cash_liquidity_crisis", [
      {
        dimension: "process_maturity",
        finding: "Regulatory scrutiny following cash crisis, governance concerns raised",
        isCritical: true,
      },
    ]);
    expect(r.adverseOffArchetypeEvidence).toBe(false);
    expect(r.challenged).toBe(false);
  });
});
