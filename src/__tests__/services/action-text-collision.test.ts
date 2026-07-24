import { describe, it, expect } from "vitest";
import { designInterventions } from "@/services/consulting-engine/intervention-design-engine";
import { actionMatches } from "@/services/benchmark/round2-scorer";
import { DiagnosisType, DiagnosisConfidence, type RootCause } from "@/domain/consulting-engine/types";

/**
 * Proves the slice-1/2 intervention-template rationales no longer echo the unsafe
 * action they warn against (the lexical-collision that mis-scored 10 safe first
 * actions as UNSAFE_ACTION). No scorer/gate/key change — this tests the engine text.
 */

function rc(type: DiagnosisType): RootCause {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    type,
    description: "d",
    mechanismDescription: "m",
    evidenceIds: ["00000000-0000-4000-8000-000000000002"],
    confidence: DiagnosisConfidence.HIGH,
  };
}

function recText(type: DiagnosisType): string {
  const iv = designInterventions(rc(type), [])[0];
  return [
    iv.title,
    iv.objective,
    iv.rationale,
    iv.whyThisNow,
    ...iv.steps.map((s) => `${s.description} ${s.successCriteria}`),
  ]
    .join(" ")
    .toLowerCase();
}

describe("action-text collision fix — module contract assertions", () => {
  it("designInterventions is a function", () => { expect(typeof designInterventions).toBe("function"); });
  it("actionMatches is a function", () => { expect(typeof actionMatches).toBe("function"); });
  it("DiagnosisType is an object", () => { expect(typeof DiagnosisType).toBe("object"); });
  it("DiagnosisConfidence is an object", () => { expect(typeof DiagnosisConfidence).toBe("object"); });
  it("DiagnosisType.DEBT_SOLVENCY_PRESSURE is defined", () => { expect(DiagnosisType.DEBT_SOLVENCY_PRESSURE).toBeDefined(); });
  it("DiagnosisType.WORKING_CAPITAL_STRESS is defined", () => { expect(DiagnosisType.WORKING_CAPITAL_STRESS).toBeDefined(); });
  it("DiagnosisType.PRICING_POWER_FAILURE is defined", () => { expect(DiagnosisType.PRICING_POWER_FAILURE).toBeDefined(); });
  it("DiagnosisType.INVENTORY_FORECASTING_MISMATCH is defined", () => { expect(DiagnosisType.INVENTORY_FORECASTING_MISMATCH).toBeDefined(); });
  it("rc helper is a function", () => { expect(typeof rc).toBe("function"); });
  it("rc(DEBT_SOLVENCY_PRESSURE) returns an object", () => { expect(typeof rc(DiagnosisType.DEBT_SOLVENCY_PRESSURE)).toBe("object"); });
  it("rc result has id, type, confidence fields", () => {
    const r = rc(DiagnosisType.DEBT_SOLVENCY_PRESSURE);
    expect(r).toHaveProperty("id"); expect(r).toHaveProperty("type"); expect(r).toHaveProperty("confidence");
  });
  it("rc result type matches input", () => { expect(rc(DiagnosisType.DEBT_SOLVENCY_PRESSURE).type).toBe(DiagnosisType.DEBT_SOLVENCY_PRESSURE); });
  it("designInterventions(rc(DEBT), []) returns non-empty array", () => {
    const result = designInterventions(rc(DiagnosisType.DEBT_SOLVENCY_PRESSURE), []);
    expect(Array.isArray(result)).toBe(true); expect(result.length).toBeGreaterThan(0);
  });
  it("designInterventions result[0] has title field", () => {
    const r = designInterventions(rc(DiagnosisType.DEBT_SOLVENCY_PRESSURE), []);
    expect(r[0]).toHaveProperty("title");
  });
  it("actionMatches returns a boolean", () => { expect(typeof actionMatches("some text", "some text")).toBe("boolean"); });
});

describe("action-text collision fix", () => {
  it("rationales no longer contain 'avoid'-style unsafe echoes", () => {
    for (const t of [
      DiagnosisType.DEBT_SOLVENCY_PRESSURE,
      DiagnosisType.WORKING_CAPITAL_STRESS,
      DiagnosisType.PRICING_POWER_FAILURE,
      DiagnosisType.INVENTORY_FORECASTING_MISMATCH,
    ]) {
      const text = recText(t);
      expect(text).not.toContain("avoid");
      expect(text).not.toContain("paper over"); // debt unsafe echo
      expect(text).not.toContain("factoring all receivables"); // WC unsafe echo
      expect(text).not.toContain("across-the-board price increase"); // pricing unsafe echo
      expect(text).not.toContain("inventory cut"); // inventory unsafe echo
    }
  });

  it("debt first action matches an acceptable action and NOT the unsafe-debt phrases", () => {
    const text = recText(DiagnosisType.DEBT_SOLVENCY_PRESSURE);
    expect(actionMatches(text, "Covenant / debt-service modelling")).toBe(true);
    expect(actionMatches(text, "Take on additional debt to paper over the covenant breach")).toBe(false);
    expect(actionMatches(text, "Take on more debt to paper over the maturity")).toBe(false);
    expect(actionMatches(text, "Fund expansion ahead of addressing the debt maturity")).toBe(false);
  });

  it("working-capital first action matches acceptable and NOT the punitive-factoring phrase", () => {
    const text = recText(DiagnosisType.WORKING_CAPITAL_STRESS);
    expect(actionMatches(text, "Cash-conversion-cycle mapping")).toBe(true);
    expect(actionMatches(text, "Factor all receivables at punitive rates before analyzing the cycle")).toBe(false);
  });

  it("pricing first action matches acceptable and NOT the across-the-board price-increase phrase", () => {
    const text = recText(DiagnosisType.PRICING_POWER_FAILURE);
    expect(actionMatches(text, "Price-realization / discount-leakage analysis")).toBe(true);
    expect(actionMatches(text, "Impose an immediate across-the-board price increase without elasticity data")).toBe(false);
  });

  it("inventory first action matches acceptable and NOT the slash-inventory phrase", () => {
    const text = recText(DiagnosisType.INVENTORY_FORECASTING_MISMATCH);
    expect(actionMatches(text, "Forecast-accuracy / ABC inventory analysis")).toBe(true);
    expect(actionMatches(text, "Slash total inventory across the board without segmenting by velocity")).toBe(false);
  });
});
