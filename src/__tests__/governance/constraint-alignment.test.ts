import { describe, it, expect } from "vitest";
import { assessConstraintAlignment } from "@/services/governance/constraint-alignment";

/** RC-7 Option C: recommendation-to-owner-constraint alignment. */
describe("constraint-alignment verifier", () => {
  it("is inert when not committed or no owner profile", () => {
    expect(assessConstraintAlignment(false, { costBand: "HIGH" }, { budgetBand: "MINIMAL" }).conflict).toBe(false);
    expect(assessConstraintAlignment(true, { costBand: "HIGH" }, undefined).conflict).toBe(false);
  });

  it("flags duration exceeding owner time horizon", () => {
    const r = assessConstraintAlignment(true, { estimatedTotalDays: 7 }, { timeHorizonDays: 2 });
    expect(r.conflict).toBe(true);
    expect(r.reasons.join(" ")).toMatch(/duration/);
  });

  it("flags cost band exceeding budget band", () => {
    const r = assessConstraintAlignment(true, { costBand: "MEDIUM" }, { budgetBand: "LOW" });
    expect(r.conflict).toBe(true);
    expect(r.reasons.join(" ")).toMatch(/budget/);
  });

  it("flags legal/compliance-sensitive context when recommendation lacks compliance handling", () => {
    const r = assessConstraintAlignment(
      true,
      { text: "Design and launch customer loyalty program with discounts" },
      { legalComplianceSensitive: true }
    );
    expect(r.conflict).toBe(true);
    expect(r.reasons.join(" ")).toMatch(/compliance/);
  });

  it("does NOT flag legal-sensitive context when recommendation addresses compliance review", () => {
    const r = assessConstraintAlignment(
      true,
      { text: "Launch program after legal compliance review and regulatory approval" },
      { legalComplianceSensitive: true }
    );
    expect(r.conflict).toBe(false);
  });

  it("flags capacity conflict when staff capacity is LOW and recommendation is intensive", () => {
    const r = assessConstraintAlignment(
      true,
      { costBand: "HIGH", estimatedTotalDays: 60 },
      { staffCapacity: "LOW", budgetBand: "HIGH", timeHorizonDays: 365 }
    );
    expect(r.conflict).toBe(true);
    expect(r.reasons.join(" ")).toMatch(/capacity/);
  });

  it("flags risk tolerance conflict only when risk appetite is low and class is higher-risk", () => {
    const r = assessConstraintAlignment(
      true,
      { interventionClass: "GROWTH_ENABLEMENT", costBand: "LOW", estimatedTotalDays: 5, text: "" },
      { riskAppetite: "low", budgetBand: "HIGH", timeHorizonDays: 90, legalComplianceSensitive: false }
    );
    expect(r.conflict).toBe(true);
    expect(r.reasons.join(" ")).toMatch(/risk tolerance/);
  });

  it("PASSES a feasible recommendation within all constraints", () => {
    const r = assessConstraintAlignment(
      true,
      { costBand: "LOW", estimatedTotalDays: 7, interventionClass: "CONTAINMENT", text: "implement complaint tracking" },
      { budgetBand: "MEDIUM", timeHorizonDays: 90, legalComplianceSensitive: false, staffCapacity: "MEDIUM" }
    );
    expect(r.conflict).toBe(false);
    expect(r.reasons).toHaveLength(0);
  });
});
