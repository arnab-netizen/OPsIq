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
