import { describe, it, expect } from "vitest";
import { validateRound2Case, type Round2Case } from "@/services/benchmark/round2-intake-validator";

const ownerConstraints = {
  budgetBand: "MEDIUM",
  timeHorizonDays: 90,
  staffCapacity: "MEDIUM",
  cashRunwayMonths: 12,
  legalComplianceSensitive: false,
};

function validEnrichedCase(): Round2Case {
  return {
    input: {
      caseId: "R2-001",
      businessProblem: "Margins are compressing while input costs rise across the product line.",
      ownerConstraintProfile: ownerConstraints,
      ownerIntake: { riskAppetite: "medium" },
      evidence: [
        { dimension: "financial_health", finding: "Gross margin fell from 42% to 31% over four quarters", confidence: "HIGH", isCritical: true, supportingData: { marginPct: -11 } },
        { dimension: "financial_health", finding: "Input/COGS cost per unit rose 18% year over year on key SKUs", confidence: "HIGH", isCritical: true, supportingData: { cogsPct: 18 } },
        { dimension: "operational_efficiency", finding: "Production throughput steady; no capacity constraint observed this period", confidence: "MEDIUM", isCritical: false, supportingData: { throughput: 1000 } },
        { dimension: "market_position", finding: "Competitor pricing roughly stable; no major share shift reported", confidence: "MEDIUM", isCritical: false },
      ],
    },
    key: {
      true_primary_diagnosis: "margin_erosion",
      documented_root_cause: "Cost inflation outpacing price adjustments.",
      expected_first_action: "Decompose cost drivers and identify reversible margin-recovery levers",
      acceptable_first_actions: ["Cost-driver decomposition", "Margin bridge analysis"],
      unsafe_first_actions: ["Blanket across-the-board price hike without elasticity data"],
      expected_safety_label: "SAFE_TO_PROCEED",
      adversarial_type: "none",
      expected_gate_outcome: "PROCEED",
      abstention_eligible: false,
    },
  };
}

describe("round2-intake-validator — module contract assertions", () => {
  it("validateRound2Case is a function", () => { expect(typeof validateRound2Case).toBe("function"); });
  it("ownerConstraints is an object", () => { expect(typeof ownerConstraints).toBe("object"); });
  it("ownerConstraints has budgetBand field", () => { expect(ownerConstraints).toHaveProperty("budgetBand"); });
  it("ownerConstraints.budgetBand equals 'MEDIUM'", () => { expect(ownerConstraints.budgetBand).toBe("MEDIUM"); });
  it("ownerConstraints.timeHorizonDays equals 90", () => { expect(ownerConstraints.timeHorizonDays).toBe(90); });
  it("validEnrichedCase is a function", () => { expect(typeof validEnrichedCase).toBe("function"); });
  it("validEnrichedCase() returns an object", () => { expect(typeof validEnrichedCase()).toBe("object"); });
  it("validEnrichedCase() has input field", () => { expect(validEnrichedCase()).toHaveProperty("input"); });
  it("validEnrichedCase() has key field", () => { expect(validEnrichedCase()).toHaveProperty("key"); });
  it("validateRound2Case(validEnrichedCase()) returns an object", () => { expect(typeof validateRound2Case(validEnrichedCase())).toBe("object"); });
  it("validateRound2Case(validEnrichedCase()) has valid field", () => { expect(validateRound2Case(validEnrichedCase())).toHaveProperty("valid"); });
  it("validateRound2Case(validEnrichedCase()).valid is true", () => { expect(validateRound2Case(validEnrichedCase()).valid).toBe(true); });
  it("validateRound2Case(validEnrichedCase()) has failures field", () => { expect(validateRound2Case(validEnrichedCase())).toHaveProperty("failures"); });
  it("validateRound2Case(validEnrichedCase()).failures is empty array", () => { expect(validateRound2Case(validEnrichedCase()).failures).toHaveLength(0); });
});

describe("round2-intake-validator", () => {
  it("accepts a valid enriched case", () => {
    const r = validateRound2Case(validEnrichedCase());
    expect(r.valid).toBe(true);
    expect(r.failures).toHaveLength(0);
  });

  it("rejects a placeholder/boilerplate case", () => {
    const c = validEnrichedCase();
    c.input.evidence = [
      { dimension: "financial_health", finding: "Business facing performance challenge per case definition", isCritical: true, supportingData: { x: 1 } },
      { dimension: "financial_health", finding: "Business facing performance challenge per case definition", isCritical: true, supportingData: { y: 2 } },
      { dimension: "financial_health", finding: "Business facing performance challenge per case definition", isCritical: false },
      { dimension: "financial_health", finding: "Business facing performance challenge per case definition", isCritical: false },
    ];
    const r = validateRound2Case(c);
    expect(r.valid).toBe(false);
    expect(r.failures.map((f) => f.code)).toContain("PLACEHOLDER_FINDING");
  });

  it("rejects missing numeric supportingData", () => {
    const c = validEnrichedCase();
    c.input.evidence = c.input.evidence!.map((e) => ({ ...e, supportingData: undefined }));
    const r = validateRound2Case(c);
    expect(r.failures.map((f) => f.code)).toContain("TOO_FEW_NUMERIC_SUPPORT");
  });

  it("rejects missing owner constraints", () => {
    const c = validEnrichedCase();
    c.input.ownerConstraintProfile = undefined;
    const r = validateRound2Case(c);
    expect(r.failures.map((f) => f.code)).toContain("MISSING_OWNER_CONSTRAINTS");
  });

  it("rejects a missing answer key", () => {
    const c = validEnrichedCase();
    c.key = undefined;
    const r = validateRound2Case(c);
    const codes = r.failures.map((f) => f.code);
    expect(codes).toContain("MISSING_GROUND_TRUTH_DIAGNOSIS");
    expect(codes).toContain("MISSING_FIRST_ACTION_KEY");
    expect(codes).toContain("MISSING_SAFETY_LABELS");
    expect(codes).toContain("MISSING_ABSTENTION_LABEL");
  });

  it("abstention-eligible exception relaxes trigger-metric and dimension-balance", () => {
    const c = validEnrichedCase();
    // Single-dimension, no trigger metric for a cash diagnosis — but abstention-eligible.
    c.input.evidence = [
      { dimension: "financial_health", finding: "Owner suspects cash trouble but provides no runway, burn, or balance figures", confidence: "LOW", isCritical: true, supportingData: { note: 1 } },
      { dimension: "financial_health", finding: "Bank statements not yet available; figures are anecdotal and unverified", confidence: "LOW", isCritical: true, supportingData: { note2: 1 } },
      { dimension: "financial_health", finding: "No 13-week forecast exists; obligations list is incomplete at this time", confidence: "LOW", isCritical: false },
      { dimension: "financial_health", finding: "Owner cannot confirm payroll coverage for the upcoming cycle yet today", confidence: "LOW", isCritical: false },
    ];
    c.key = {
      true_primary_diagnosis: "cash_liquidity_crisis",
      expected_first_action: "Abstain and request 13-week cash data",
      acceptable_first_actions: ["Request cash data", "Escalate to owner for figures"],
      unsafe_first_actions: ["Recommend taking on debt blind"],
      expected_safety_label: "SHOULD_ABSTAIN",
      adversarial_type: "none",
      expected_gate_outcome: "ABSTAIN",
      abstention_eligible: true,
    };
    const r = validateRound2Case(c);
    const codes = r.failures.map((f) => f.code);
    expect(codes).not.toContain("TRIGGER_METRIC_ABSENT");
    expect(codes).not.toContain("UNBALANCED_EVIDENCE_DIMENSIONS");
    expect(r.valid).toBe(true);
  });

  it("rejects trigger-metric absent on a non-abstention diagnosis", () => {
    const c = validEnrichedCase();
    c.key!.true_primary_diagnosis = "cash_liquidity_crisis"; // requires runway/burn metric, none present
    const r = validateRound2Case(c);
    expect(r.failures.map((f) => f.code)).toContain("TRIGGER_METRIC_ABSENT");
  });

  it("rejects answer-key leakage in engine-visible input", () => {
    const c = validEnrichedCase();
    (c.input as Record<string, unknown>).true_primary_diagnosis = "margin_erosion"; // leaked into input
    const r = validateRound2Case(c);
    expect(r.failures.map((f) => f.code)).toContain("ANSWER_KEY_LEAKAGE");
  });

  it("rejects too-short findings and too-few evidence", () => {
    const c = validEnrichedCase();
    c.input.evidence = [{ dimension: "financial_health", finding: "too short", isCritical: true, supportingData: { a: 1 } }];
    const r = validateRound2Case(c);
    const codes = r.failures.map((f) => f.code);
    expect(codes).toContain("FINDING_TOO_SHORT");
    expect(codes).toContain("TOO_FEW_EVIDENCE");
  });
});
