import { describe, it, expect } from "vitest";
import { runCausalChallenge, type CausalEvidence } from "@/services/governance/causal-challenge";

/**
 * P1 fix: financial-distress co-occurrence bypass.
 *
 * For committed financial-distress diagnoses (cash_liquidity_crisis,
 * debt_solvency_pressure, working_capital_stress), governance/regulatory/fraud/
 * insolvency evidence in off-home dimensions is an expected secondary co-occurrence
 * of the financial crisis, not a contradiction of the committed diagnosis. The
 * causal challenge must NOT abstain on these co-occurrences alone.
 *
 * The bypass is conditional: it applies ONLY when the off-archetype finding has no
 * numeric corroboration (empty/absent supportingData). A quantified governance finding
 * (complianceGapCount set, regulatoryDeadlineDays set, etc.) retains the full
 * PROTECTED_OFF_ARCHETYPE hold. Structural-commitment terms (capex, irreversible,
 * facility expansion, scale-spend-on-a-loss) always hold regardless.
 *
 * The out-of-model arm is independently updated: legal/regulatory mentions in the
 * businessProblem are now subsumed by cash_liquidity_crisis and debt_solvency_pressure,
 * because regulatory proceedings are expected consequences of financial distress, not
 * out-of-model primary causes that contradict those diagnoses.
 */

function ev(
  dimension: string,
  finding: string,
  isCritical = true,
  supportingData?: Record<string, string | number | boolean>
): CausalEvidence {
  return { dimension, finding, isCritical, supportingData };
}

function adverseOff(diagnosisType: string, evidence: CausalEvidence[]): boolean {
  return runCausalChallenge({
    committed: true,
    businessProblem: "the company needs highest-priority action",
    diagnosisType,
    evidence,
  }).adverseOffArchetypeEvidence;
}

function outOfModel(diagnosisType: string, businessProblem: string): boolean {
  return runCausalChallenge({
    committed: true,
    businessProblem,
    diagnosisType,
    evidence: [ev("financial_health", "liquidity is stressed", true)],
  }).outOfModelCauseInProblem;
}

// ─── STEP 1: P1 historical false-positives no longer abstain ─────────────────

describe("P1 fix — financial-distress governance co-occurrence: no longer abstains", () => {
  it("cash_liquidity_crisis + critical process_maturity 'governance' finding (no numeric) does NOT hold", () => {
    expect(
      adverseOff("cash_liquidity_crisis", [
        ev("financial_health", "Acute liquidity shortfall with creditors demanding repayment", true),
        ev("process_maturity", "Governance and internal control concerns exist at group level; accountability structures are under question following debt default", true),
      ])
    ).toBe(false);
  });

  it("debt_solvency_pressure + critical process_maturity 'governance credibility risk' (no numeric) does NOT hold", () => {
    expect(
      adverseOff("debt_solvency_pressure", [
        ev("financial_health", "Net debt to equity well above sustainable levels", true),
        ev("process_maturity", "Public allegations of fund diversion have been reported; allegations represent a governance credibility risk regardless of final adjudication", true),
      ])
    ).toBe(false);
  });

  it("cash_liquidity_crisis + critical process_maturity 'insolvency filing' (no numeric) does NOT hold", () => {
    // insolvency filing is the endpoint of a liquidity crisis, not a contradiction
    expect(
      adverseOff("cash_liquidity_crisis", [
        ev("financial_health", "All financial resources exhausted; ₹65 billion owed to creditors", true),
        ev("process_maturity", "Voluntary insolvency filing on 2 May 2023 — management acknowledged inability to continue without insolvency protection", true),
      ])
    ).toBe(false);
  });

  it("debt_solvency_pressure + critical process_maturity 'potential fraud risk, not yet confirmed' (no numeric) does NOT hold", () => {
    // unconfirmed fraud co-occurs with a genuine debt solvency crisis
    expect(
      adverseOff("debt_solvency_pressure", [
        ev("financial_health", "Significant debt overhang; breach of banking covenants imminent", true),
        ev("process_maturity", "The nature of the irregularities raised potential fraud risk, not yet confirmed as of the decision date.", true),
      ])
    ).toBe(false);
  });

  it("cash_liquidity_crisis + critical market_position 'regulatory coordination required' (no numeric) does NOT hold", () => {
    // regulatory mention in market evidence co-occurs with systemic financial crisis
    expect(
      adverseOff("cash_liquidity_crisis", [
        ev("financial_health", "Acute cash position; debt service at risk", true),
        ev("market_position", "Systemic risk to sector given scale; government and regulatory coordination required to manage contagion", true),
      ])
    ).toBe(false);
  });

  it("cash_liquidity_crisis + critical process_maturity 'regulatory frameworks' (no numeric) does NOT hold", () => {
    expect(
      adverseOff("cash_liquidity_crisis", [
        ev("financial_health", "Cash reserves insufficient to meet obligations", true),
        ev("process_maturity", "Pre-booked holidays represent a significant consumer-protection obligation that crystallizes upon any cessation of trading, implicating ATOL and regulatory frameworks.", true),
      ])
    ).toBe(false);
  });
});

describe("P1 fix — out-of-model arm: legal/regulatory in businessProblem subsumed by financial-distress diagnoses", () => {
  it("debt_solvency_pressure subsumes the legal domain: 'regulatory intervention' in businessProblem does NOT trigger outOfModel", () => {
    expect(
      outOfModel(
        "debt_solvency_pressure",
        "The company must determine highest-priority actions to preserve liquidity, restore governance credibility, and avoid formal regulatory intervention before the situation becomes irreversible."
      )
    ).toBe(false);
  });

  it("cash_liquidity_crisis subsumes the legal domain: 'regulatory' mention does NOT trigger outOfModel", () => {
    expect(
      outOfModel(
        "cash_liquidity_crisis",
        "The company faces a liquidity crisis compounded by regulatory scrutiny of its lending practices."
      )
    ).toBe(false);
  });
});

// ─── STEP 2 & 3: Dangerous contradictions and fraud-as-primary-cause still abstain ──

describe("P1 fix — dangerous structural contradictions still abstain", () => {
  it("cash_liquidity_crisis + critical off-archetype 'irreversible facility expansion' still abstains", () => {
    // structural commitment term — always holds regardless of supportingData
    expect(
      adverseOff("cash_liquidity_crisis", [
        ev("financial_health", "Runway is four months", true, { cashRunwayMonths: 4 }),
        ev("market_position", "An irreversible facility expansion is proposed on a single contract", true, { demandDurabilityMonths: 6 }),
      ])
    ).toBe(true);
  });

  it("cash_liquidity_crisis + critical off-archetype 'capex commitment' (no numeric) still abstains — structural term bypasses the numeric condition", () => {
    expect(
      adverseOff("cash_liquidity_crisis", [
        ev("financial_health", "Very limited liquidity headroom", true),
        ev("market_position", "Owner proposes a major capex commitment to expand capacity while cash is critical", true),
      ])
    ).toBe(true);
  });

  it("debt_solvency_pressure + off-archetype financial-aggravation language still abstains", () => {
    expect(
      adverseOff("debt_solvency_pressure", [
        ev("financial_health", "In covenant breach yet plans to take on new debt", true, { covenantHeadroom: -0.02 }),
        ev("market_position", "The new contract is large, low-margin, and back-loaded, which deepens the hole", true, { contractMargin: 2 }),
      ])
    ).toBe(true);
  });

  it("cash_liquidity_crisis + confirmed fraud with numeric corroboration still abstains (complianceGapCount present)", () => {
    // supportingData non-empty → numeric corroboration present → full PROTECTED hold
    expect(
      adverseOff("cash_liquidity_crisis", [
        ev("financial_health", "Runway is short and burn is high", true, { cashRunwayMonths: 4 }),
        ev("process_maturity", "A regulator opened a fraud inquiry into unauthorized accounts", true, { complianceGapCount: 6 }),
      ])
    ).toBe(true);
  });
});

describe("P1 fix — fraud as primary cause (businessProblem) still abstains via integrity domain", () => {
  it("cash_liquidity_crisis: fraud as primary cause in businessProblem → integrity domain not subsumed → outOfModel fires", () => {
    expect(
      outOfModel(
        "cash_liquidity_crisis",
        "Embezzlement by the CFO has depleted all working capital reserves and the company cannot meet its obligations."
      )
    ).toBe(true);
  });

  it("debt_solvency_pressure: theft/embezzlement as primary cause in businessProblem → integrity domain not subsumed → outOfModel fires", () => {
    expect(
      outOfModel(
        "debt_solvency_pressure",
        "Widespread fraud and theft of customer deposits have eroded the capital base and triggered regulatory action."
      )
    ).toBe(true);
  });
});

// ─── STEP 4: Suzlon-style wrong diagnosis still held by SEVERE_FINANCIAL_TEXT ──

describe("P1 fix — wrong financial diagnosis with negative-margin evidence still abstains", () => {
  it("non-financial-distress diagnosis with off-archetype negative contribution margin still abstains via SEVERE_FINANCIAL_TEXT", () => {
    // margin_erosion (NOT in FINANCIAL_DISTRESS_DIAGNOSES) has home dim financial_health.
    // Off-archetype market_position evidence with negative contribution margin
    // matches SEVERE_FINANCIAL_TEXT — this path is independent of PROTECTED_OFF_ARCHETYPE
    // and the bypass, so it continues to hold for non-financial-distress diagnoses.
    expect(
      adverseOff("margin_erosion", [
        ev("financial_health", "Revenue declining sequentially on high fixed cost base", true),
        ev("market_position", "Contribution margin turned negative as input costs rose faster than achievable prices in the segment", true),
      ])
    ).toBe(true);
  });

  it("operational_bottleneck with off-archetype fraud evidence still abstains (non-financial-distress diagnosis)", () => {
    expect(
      adverseOff("operational_bottleneck", [
        ev("operational_efficiency", "Turnaround slow at key station", true, { turnaroundDays: 12 }),
        ev("process_maturity", "Fraud inquiry opened into product quality misrepresentation", true),
      ])
    ).toBe(true);
  });
});

// ─── STEP 5: Existing adversarial cases still abstain ────────────────────────

describe("P1 fix — existing adversarial cases unaffected", () => {
  it("ADV-02 style: capex commitment under strategic_capex_risk with thin liquidity still abstains (outOfModel)", () => {
    expect(
      outOfModel(
        "strategic_capex_risk",
        "the owner wants an irreversible automation line on the back of a spike despite a thin cash runway"
      )
    ).toBe(true);
  });

  it("PC-11 style: capex under cash_liquidity_crisis still abstains (outOfModel — capex domain not subsumed)", () => {
    expect(
      outOfModel(
        "cash_liquidity_crisis",
        "cash runway is four months and the owner wants to commit a large efficiency capex now"
      )
    ).toBe(true);
  });

  it("ADV-01 style: deep discount on negative unit economics still abstains", () => {
    expect(
      outOfModel(
        "unit_economics_failure",
        "the founder wants to launch an aggressive sitewide discount to buy back loyalty but the unit economics are already negative"
      )
    ).toBe(true);
  });

  it("operational diagnosis + liquidity threat still abstains (outOfModel — liquidity not subsumed)", () => {
    expect(
      outOfModel(
        "operational_bottleneck",
        "turnaround is slow and the firm is near insolvency with a thin cash runway"
      )
    ).toBe(true);
  });

  it("legal diagnosis correctly subsumes its own regulatory stem (no double-hold)", () => {
    expect(
      outOfModel(
        "legal_governance_risk",
        "a regulatory filing deadline looms with unmet compliance requirements"
      )
    ).toBe(false);
  });

  it("≤3-month runway numeric in off-archetype evidence still abstains", () => {
    expect(
      adverseOff("operational_bottleneck", [
        ev("operational_efficiency", "Turnaround is slow at one station", true, { turnaroundDays: 12 }),
        ev("financial_health", "Cash will run out within two months", true, { cashRunwayMonths: 2 }),
      ])
    ).toBe(true);
  });
});
