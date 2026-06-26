import { describe, it, expect } from "vitest";
import { checkLean, type LeanInput } from "@/domain/domain-training/lean-filter";
import { UnsafeClass, detectUnsafe, isUnsafe, NO_UNSAFE_SIGNALS, type UnsafeSignals } from "@/domain/domain-training/unsafe-taxonomy";
import {
  runRegression,
  failedCritical,
  canMarkTrained,
  regressionSetIsComplete,
  type RegressionCase,
} from "@/domain/domain-training/regression-lock";

const lean = (over: Partial<LeanInput> = {}): LeanInput => ({
  reducesWasteOrProtectsValue: true, addsUnnecessaryAdmin: false, overloadsStaff: false, overloadsOwner: false,
  protectsProfit: true, protectsServiceQuality: true, supportsSustainableGrowth: true, simplerSafeOptionExists: false,
  complexityJustified: false, survivalCritical: false, emergencyTemporary: false, profitDamageJustified: false, ...over,
});

describe("[F13] owner-mode lean filter", () => {
  it("passes a clean lean action", () => { expect(checkLean(lean()).pass).toBe(true); });
  it("complexity-heavy fails if a simpler safe option exists", () => {
    expect(checkLean(lean({ simplerSafeOptionExists: true })).failures).toContain("unjustified_complexity");
    expect(checkLean(lean({ simplerSafeOptionExists: true, complexityJustified: true })).pass).toBe(true);
  });
  it("owner-heavy fails unless survival-critical", () => {
    expect(checkLean(lean({ overloadsOwner: true })).failures).toContain("overloads_owner_non_survival");
    expect(checkLean(lean({ overloadsOwner: true, survivalCritical: true })).pass).toBe(true);
  });
  it("staff-overloading fails unless emergency and temporary", () => {
    expect(checkLean(lean({ overloadsStaff: true })).failures).toContain("overloads_staff_non_emergency");
    expect(checkLean(lean({ overloadsStaff: true, emergencyTemporary: true })).pass).toBe(true);
  });
  it("profit-damaging fails unless justified", () => {
    expect(checkLean(lean({ protectsProfit: false })).failures).toContain("damages_profit_unjustified");
    expect(checkLean(lean({ protectsProfit: false, profitDamageJustified: true })).pass).toBe(true);
  });
});

describe("[F14] unsafe taxonomy", () => {
  it("each unsafe class is detected from its signal", () => {
    const keys: (keyof UnsafeSignals)[] = [
      "cashDestructive", "profitBlindRevenue", "complianceRisk", "staffOverload", "ownerOverload",
      "qualityDamaging", "capacityBlindGrowth", "falseCompletionAcceptance", "unverifiedLearningAdmission",
      "genericNonExecutable", "vanityMetricOptimization", "overconfidentLowData", "expansionBeforeProof",
      "discountBelowMargin", "hiringBeforeWorkloadProof",
    ];
    expect(keys.length).toBe(Object.keys(UnsafeClass).length);
    for (const k of keys) {
      const detected = detectUnsafe({ ...NO_UNSAFE_SIGNALS, [k]: true });
      expect(detected.length).toBe(1);
    }
  });
  it("unsafe class blocks (isUnsafe true); clean signals are safe", () => {
    expect(isUnsafe({ ...NO_UNSAFE_SIGNALS, discountBelowMargin: true })).toBe(true);
    expect(isUnsafe(NO_UNSAFE_SIGNALS)).toBe(false);
  });
  it("owner preference cannot override (no such input exists)", () => {
    const s = { ...NO_UNSAFE_SIGNALS, cashDestructive: true };
    expect(detectUnsafe(s)).toContain(UnsafeClass.CASH_DESTRUCTIVE);
  });
});

describe("[F15] regression lock", () => {
  const cases: RegressionCase[] = [
    { id: "g1", category: "golden_normal", critical: true },
    { id: "a1", category: "adversarial", critical: true },
    { id: "p1", category: "previous_failure", critical: true },
    { id: "h1", category: "harmful", critical: true },
    { id: "m1", category: "missing_data", critical: false },
    { id: "ar1", category: "archetype", critical: false },
    { id: "u1", category: "unsafe_output", critical: true },
  ];

  it("runs deterministically (sorted) and passes when all pass", () => {
    const r = runRegression(cases, () => true);
    expect(r.map((x) => x.id)).toEqual(["a1", "ar1", "g1", "h1", "m1", "p1", "u1"]);
    expect(canMarkTrained(r)).toBe(true);
  });
  it("a failed critical regression blocks promotion / training", () => {
    const r = runRegression(cases, (c) => c.id !== "h1"); // harmful critical fails
    expect(failedCritical(r)).toBe(true);
    expect(canMarkTrained(r)).toBe(false);
  });
  it("a failed non-critical regression does not block training", () => {
    const r = runRegression(cases, (c) => c.id !== "m1");
    expect(failedCritical(r)).toBe(false);
    expect(canMarkTrained(r)).toBe(true);
  });
  it("regression set must include all required categories", () => {
    expect(regressionSetIsComplete(cases)).toBe(true);
    expect(regressionSetIsComplete(cases.filter((c) => c.category !== "harmful"))).toBe(false);
  });
});
