import { describe, it, expect } from "vitest";
import { assessConstraintAlignment } from "@/services/governance/constraint-alignment";

describe("constraint-alignment verifier — module contract assertions", () => {
  it("assessConstraintAlignment is a function", () => { expect(typeof assessConstraintAlignment).toBe("function"); });
  it("assessConstraintAlignment(false,{costBand:'HIGH'},{budgetBand:'MINIMAL'}).conflict is false", () => { expect(assessConstraintAlignment(false, { costBand: "HIGH" }, { budgetBand: "MINIMAL" }).conflict).toBe(false); });
  it("assessConstraintAlignment returns an object", () => { expect(typeof assessConstraintAlignment(false, {}, {})).toBe("object"); });
  it("assessConstraintAlignment result has conflict field", () => { expect(assessConstraintAlignment(false, {}, {})).toHaveProperty("conflict"); });
  it("assessConstraintAlignment result has reasons field", () => { expect(assessConstraintAlignment(false, {}, {})).toHaveProperty("reasons"); });
  it("assessConstraintAlignment(true,{},undefined).conflict is false", () => { expect(assessConstraintAlignment(true, {}, undefined).conflict).toBe(false); });
  it("duration exceeding time horizon flags conflict", () => { expect(assessConstraintAlignment(true, { estimatedTotalDays: 7 }, { timeHorizonDays: 2 }).conflict).toBe(true); });
  it("cost band exceeding budget band flags conflict", () => { expect(assessConstraintAlignment(true, { costBand: "MEDIUM" }, { budgetBand: "LOW" }).conflict).toBe(true); });
  it("feasible recommendation within constraints passes", () => { expect(assessConstraintAlignment(true, { costBand: "LOW", estimatedTotalDays: 7, interventionClass: "CONTAINMENT", text: "implement complaint tracking" }, { budgetBand: "MEDIUM", timeHorizonDays: 90, legalComplianceSensitive: false, staffCapacity: "MEDIUM" }).conflict).toBe(false); });
  it("conflict result has reasons as array", () => { const r = assessConstraintAlignment(true, { costBand: "MEDIUM" }, { budgetBand: "LOW" }); expect(Array.isArray(r.reasons)).toBe(true); });
  it("conflict reasons length greater than 0 when conflicted", () => { expect(assessConstraintAlignment(true, { costBand: "MEDIUM" }, { budgetBand: "LOW" }).reasons.length).toBeGreaterThan(0); });
  it("no conflict has empty reasons array", () => { expect(assessConstraintAlignment(false, {}, {}).reasons).toHaveLength(0); });
  it("not committed with any profile gives no conflict", () => { expect(assessConstraintAlignment(false, { estimatedTotalDays: 200 }, { timeHorizonDays: 1 }).conflict).toBe(false); });
  it("committed true with profile undefined gives no conflict", () => { expect(assessConstraintAlignment(true, { estimatedTotalDays: 200 }, undefined).conflict).toBe(false); });
});

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
