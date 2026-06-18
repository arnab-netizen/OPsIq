import { describe, it, expect } from "vitest";
import {
  BENEFIT_STATUS_TRANSITIONS,
  isBenefitStatusTransitionAllowed,
  validateBenefit,
  validateBenefitRealization,
  computeBenefitRealizationRate,
  type BenefitStatus,
  type BenefitInput,
  type BenefitRealizationInput,
} from "@/domain/owner-mode/benefits-realization";

const WS = "00000000-0000-0000-0000-000000000001";
const BIZ = "00000000-0000-0000-0000-000000000002";

function validBenefitInput(overrides: Partial<BenefitInput> = {}): BenefitInput {
  return {
    workspaceId: WS,
    businessId: BIZ,
    expectedBusinessBenefit: "Increase gross margin from 31% to 42% within 6 months.",
    benefitType: "margin",
    baseline: 31,
    target: 42,
    targetUnit: "percent",
    benefitOwner: "owner-001",
    ...overrides,
  };
}

function validRealizationInput(
  overrides: Partial<BenefitRealizationInput> = {}
): BenefitRealizationInput {
  return {
    workspaceId: WS,
    benefitId: "benefit-001",
    benefitStatus: "on_track",
    ...overrides,
  };
}

describe("BENEFIT_STATUS_TRANSITIONS", () => {
  it("has exactly 6 keys", () => {
    expect(Object.keys(BENEFIT_STATUS_TRANSITIONS)).toHaveLength(6);
  });

  it("realized is terminal (empty array)", () => {
    expect(BENEFIT_STATUS_TRANSITIONS.realized).toEqual([]);
  });

  it("not_realized is terminal (empty array)", () => {
    expect(BENEFIT_STATUS_TRANSITIONS.not_realized).toEqual([]);
  });

  it("pending → on_track is allowed", () => {
    expect(BENEFIT_STATUS_TRANSITIONS.pending).toContain("on_track");
  });

  it("on_track → realized is allowed", () => {
    expect(BENEFIT_STATUS_TRANSITIONS.on_track).toContain("realized");
  });

  it("deferred → pending is allowed", () => {
    expect(BENEFIT_STATUS_TRANSITIONS.deferred).toContain("pending");
  });

  it("realized → pending is NOT allowed", () => {
    expect(BENEFIT_STATUS_TRANSITIONS.realized).not.toContain("pending");
  });

  it("not_realized → on_track is NOT allowed", () => {
    expect(BENEFIT_STATUS_TRANSITIONS.not_realized).not.toContain("on_track");
  });
});

describe("isBenefitStatusTransitionAllowed", () => {
  it("pending → on_track: true", () => {
    expect(isBenefitStatusTransitionAllowed("pending", "on_track")).toBe(true);
  });

  it("on_track → realized: true", () => {
    expect(isBenefitStatusTransitionAllowed("on_track", "realized")).toBe(true);
  });

  it("deferred → pending: true", () => {
    expect(isBenefitStatusTransitionAllowed("deferred", "pending")).toBe(true);
  });

  it("realized → pending: false", () => {
    expect(isBenefitStatusTransitionAllowed("realized", "pending")).toBe(false);
  });

  it("not_realized → on_track: false", () => {
    expect(isBenefitStatusTransitionAllowed("not_realized", "on_track")).toBe(false);
  });

  it("partially_realized → realized: true", () => {
    expect(isBenefitStatusTransitionAllowed("partially_realized", "realized")).toBe(true);
  });

  it("partially_realized → not_realized: true", () => {
    expect(isBenefitStatusTransitionAllowed("partially_realized", "not_realized")).toBe(true);
  });

  it("on_track → deferred: true", () => {
    expect(isBenefitStatusTransitionAllowed("on_track", "deferred")).toBe(true);
  });

  it("pending → deferred: true", () => {
    expect(isBenefitStatusTransitionAllowed("pending", "deferred")).toBe(true);
  });

  it("deferred → not_realized: true", () => {
    expect(isBenefitStatusTransitionAllowed("deferred", "not_realized")).toBe(true);
  });
});

describe("validateBenefit", () => {
  it("BEN-RULE-1: empty expectedBusinessBenefit → violation", () => {
    const result = validateBenefit(validBenefitInput({ expectedBusinessBenefit: "" }));
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("BEN-RULE-1"))).toBe(true);
  });

  it("BEN-RULE-1: short expectedBusinessBenefit (< 10 chars) → violation", () => {
    const result = validateBenefit(validBenefitInput({ expectedBusinessBenefit: "Short" }));
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("BEN-RULE-1"))).toBe(true);
  });

  it("BEN-RULE-1: exactly 10 chars → no BEN-RULE-1 violation", () => {
    const result = validateBenefit(
      validBenefitInput({ expectedBusinessBenefit: "1234567890" })
    );
    expect(result.violations.some((v) => v.includes("BEN-RULE-1"))).toBe(false);
  });

  it("BEN-RULE-2: empty benefitOwner → violation", () => {
    const result = validateBenefit(validBenefitInput({ benefitOwner: "" }));
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("BEN-RULE-2"))).toBe(true);
  });

  it("BEN-RULE-2: whitespace-only benefitOwner → violation", () => {
    const result = validateBenefit(validBenefitInput({ benefitOwner: "   " }));
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("BEN-RULE-2"))).toBe(true);
  });

  it("BEN-RULE-3: target set without baseline → violation", () => {
    const result = validateBenefit(
      validBenefitInput({ target: 50, baseline: undefined })
    );
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("BEN-RULE-3"))).toBe(true);
  });

  it("BEN-RULE-3: target and baseline both set → no BEN-RULE-3 violation", () => {
    const result = validateBenefit(validBenefitInput({ target: 50, baseline: 30 }));
    expect(result.violations.some((v) => v.includes("BEN-RULE-3"))).toBe(false);
  });

  it("BEN-RULE-3: neither target nor baseline → no violation", () => {
    const result = validateBenefit(
      validBenefitInput({ target: undefined, baseline: undefined })
    );
    expect(result.violations.some((v) => v.includes("BEN-RULE-3"))).toBe(false);
  });

  it("BEN-RULE-4: target equals baseline → violation", () => {
    const result = validateBenefit(validBenefitInput({ target: 31, baseline: 31 }));
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("BEN-RULE-4"))).toBe(true);
  });

  it("BEN-RULE-4: target differs from baseline → no BEN-RULE-4 violation", () => {
    const result = validateBenefit(validBenefitInput({ target: 42, baseline: 31 }));
    expect(result.violations.some((v) => v.includes("BEN-RULE-4"))).toBe(false);
  });

  it("valid complete input → valid, no violations", () => {
    const result = validateBenefit(validBenefitInput());
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("valid input without optional baseline/target → valid", () => {
    const result = validateBenefit(
      validBenefitInput({ baseline: undefined, target: undefined, targetUnit: undefined })
    );
    expect(result.valid).toBe(true);
  });

  it("workspace scoping: empty workspaceId throws", () => {
    expect(() =>
      validateBenefit(validBenefitInput({ workspaceId: "" }))
    ).toThrow();
  });

  it("workspace scoping: whitespace workspaceId throws", () => {
    expect(() =>
      validateBenefit(validBenefitInput({ workspaceId: "   " }))
    ).toThrow();
  });
});

describe("validateBenefitRealization", () => {
  it("BEN-RULE-5: not_realized without reasonNotRealized → violation", () => {
    const result = validateBenefitRealization(
      validRealizationInput({ benefitStatus: "not_realized", reasonNotRealized: undefined })
    );
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("BEN-RULE-5"))).toBe(true);
  });

  it("BEN-RULE-5: not_realized with too-short reason → violation", () => {
    const result = validateBenefitRealization(
      validRealizationInput({ benefitStatus: "not_realized", reasonNotRealized: "short" })
    );
    expect(result.violations.some((v) => v.includes("BEN-RULE-5"))).toBe(true);
  });

  it("BEN-RULE-5: not_realized with sufficient reason → no violation", () => {
    const result = validateBenefitRealization(
      validRealizationInput({
        benefitStatus: "not_realized",
        reasonNotRealized: "Market conditions changed significantly during implementation.",
      })
    );
    expect(result.valid).toBe(true);
    expect(result.violations.some((v) => v.includes("BEN-RULE-5"))).toBe(false);
  });

  it("BEN-RULE-6: partially_realized without reason → violation", () => {
    const result = validateBenefitRealization(
      validRealizationInput({
        benefitStatus: "partially_realized",
        reasonNotRealized: undefined,
      })
    );
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("BEN-RULE-6"))).toBe(true);
  });

  it("BEN-RULE-6: partially_realized with reason → no violation", () => {
    const result = validateBenefitRealization(
      validRealizationInput({
        benefitStatus: "partially_realized",
        reasonNotRealized: "Implementation was only completed in two of five regions.",
      })
    );
    expect(result.valid).toBe(true);
    expect(result.violations.some((v) => v.includes("BEN-RULE-6"))).toBe(false);
  });

  it("BEN-RULE-7: realized without actualBenefit → violation", () => {
    const result = validateBenefitRealization(
      validRealizationInput({ benefitStatus: "realized", actualBenefit: undefined })
    );
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("BEN-RULE-7"))).toBe(true);
  });

  it("BEN-RULE-7: realized with actualBenefit → no violation", () => {
    const result = validateBenefitRealization(
      validRealizationInput({ benefitStatus: "realized", actualBenefit: 38 })
    );
    expect(result.valid).toBe(true);
    expect(result.violations.some((v) => v.includes("BEN-RULE-7"))).toBe(false);
  });

  it("on_track status needs no reason → valid", () => {
    const result = validateBenefitRealization(
      validRealizationInput({ benefitStatus: "on_track" })
    );
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("pending status needs no reason → valid", () => {
    const result = validateBenefitRealization(
      validRealizationInput({ benefitStatus: "pending" })
    );
    expect(result.valid).toBe(true);
  });

  it("deferred status needs no reason → valid", () => {
    const result = validateBenefitRealization(
      validRealizationInput({ benefitStatus: "deferred" })
    );
    expect(result.valid).toBe(true);
  });

  it("workspace scoping: empty workspaceId throws for validateBenefitRealization", () => {
    expect(() =>
      validateBenefitRealization(validRealizationInput({ workspaceId: "" }))
    ).toThrow();
  });

  it("workspace scoping: whitespace workspaceId throws for validateBenefitRealization", () => {
    expect(() =>
      validateBenefitRealization(validRealizationInput({ workspaceId: "  " }))
    ).toThrow();
  });
});

describe("computeBenefitRealizationRate", () => {
  it("50% achievement", () => {
    expect(computeBenefitRealizationRate(0, 100, 50)).toBe(50);
  });

  it("100% achievement (fully realized)", () => {
    expect(computeBenefitRealizationRate(0, 100, 100)).toBe(100);
  });

  it("0% (no progress)", () => {
    expect(computeBenefitRealizationRate(0, 100, 0)).toBe(0);
  });

  it("overachievement clamped at 200%", () => {
    expect(computeBenefitRealizationRate(0, 100, 300)).toBe(200);
  });

  it("exactly 200% overachievement (not clamped)", () => {
    expect(computeBenefitRealizationRate(0, 100, 200)).toBe(200);
  });

  it("returns 0 when baseline === target (avoid division by zero)", () => {
    expect(computeBenefitRealizationRate(50, 50, 75)).toBe(0);
  });

  it("negative progress clamped to 0", () => {
    expect(computeBenefitRealizationRate(30, 50, 10)).toBe(0);
  });

  it("partial achievement with non-zero baseline", () => {
    // actual=36, baseline=31, target=42 → (5/11)*100 = 45.45 → 45
    expect(computeBenefitRealizationRate(31, 42, 36)).toBe(45);
  });

  it("full achievement with non-zero baseline", () => {
    expect(computeBenefitRealizationRate(31, 42, 42)).toBe(100);
  });
});
