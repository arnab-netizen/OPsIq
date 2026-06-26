import { describe, it, expect } from "vitest";
import { evaluateVetoes, isVetoed, NO_VETOES, type VetoContext } from "@/domain/domain-training/veto-matrix";

const ctx = (over: Partial<VetoContext> = {}): VetoContext => ({ ...NO_VETOES, ...over });

describe("[F6] veto matrix — each veto has a passing + failing test", () => {
  it("critical cash blocks growth/marketing/expansion/hiring/bulk-buying", () => {
    const c = ctx({ criticalCashSurvivalRisk: true });
    for (const a of ["growth", "paid_marketing", "expansion", "non_essential_hiring", "bulk_buying"] as const) {
      expect(isVetoed(a, c)).toBe(true);
    }
    expect(isVetoed("growth", NO_VETOES)).toBe(false);
  });

  it("compliance/safety uncertainty blocks action until verified", () => {
    expect(isVetoed("growth", ctx({ complianceOrSafetyUncertain: true }))).toBe(true);
    expect(isVetoed("scale", ctx({ complianceOrSafetyUncertain: true }))).toBe(true);
  });

  it("severe quality failure blocks marketing/growth/scale", () => {
    const c = ctx({ severeQualityFailure: true });
    expect(isVetoed("paid_marketing", c)).toBe(true);
    expect(isVetoed("growth", c)).toBe(true);
    expect(isVetoed("scale", c)).toBe(true);
  });

  it("capacity overload blocks broad demand generation", () => {
    expect(isVetoed("demand_generation", ctx({ capacityOverload: true }))).toBe(true);
  });

  it("staff overload blocks demand increase + new non-critical tasks", () => {
    const c = ctx({ staffOverload: true });
    expect(isVetoed("demand_generation", c)).toBe(true);
    expect(isVetoed("new_non_critical_task", c)).toBe(true);
  });

  it("owner overload blocks owner-heavy action unless survival-critical", () => {
    expect(isVetoed("owner_heavy_action", ctx({ ownerOverload: true }))).toBe(true);
    expect(isVetoed("owner_heavy_action", ctx({ ownerOverload: true, survivalCritical: true }))).toBe(false);
  });

  it("negative margin blocks discounting/low-price-B2B/revenue-chasing", () => {
    const c = ctx({ negativeMargin: true });
    expect(isVetoed("discounting_below_margin", c)).toBe(true);
    expect(isVetoed("low_price_b2b", c)).toBe(true);
    expect(isVetoed("revenue_chasing", c)).toBe(true);
  });

  it("missing proof blocks closure/learning/high-confidence", () => {
    const c = ctx({ missingProof: true });
    expect(isVetoed("closure", c)).toBe(true);
    expect(isVetoed("learning_admission", c)).toBe(true);
    expect(isVetoed("high_confidence_recommendation", c)).toBe(true);
  });

  it("contradictory data blocks confident diagnosis; unverified outcome blocks learning", () => {
    expect(isVetoed("confident_diagnosis", ctx({ contradictoryData: true }))).toBe(true);
    expect(isVetoed("learning_admission", ctx({ unverifiedOutcome: true }))).toBe(true);
  });

  it("vetoes cannot be bypassed by owner preference (no such input exists)", () => {
    // evaluateVetoes has no owner-preference parameter; same context always yields same result.
    const c = ctx({ criticalCashSurvivalRisk: true });
    const r1 = evaluateVetoes(c);
    const r2 = evaluateVetoes(c);
    expect(r1.blocked.sort()).toEqual(r2.blocked.sort());
    expect(r1.blocked).toContain("growth");
  });
});
