import { describe, it, expect } from "vitest";
import {
  validateValidationCriteria,
  assertRecommendationHasCriteria,
  computeTargetDelta,
  type ValidationCriteriaInput,
} from "@/domain/owner-mode/outcome-validation";

const WS = "00000000-0000-0000-0000-000000000001";
const BIZ = "00000000-0000-0000-0000-000000000002";

function validCriteria(overrides: Partial<ValidationCriteriaInput> = {}): ValidationCriteriaInput {
  return {
    workspaceId: WS,
    businessId: BIZ,
    recommendationId: "rec-001",
    metricName: "gross_margin_pct",
    baselineValue: 28,
    targetValue: 35,
    successCondition: "Gross margin reaches or exceeds 35% for two consecutive months.",
    partialSuccessCondition: "Gross margin reaches 31-34% after 3 months.",
    failureCondition: "No improvement after 90 days.",
    riskLevel: "standard",
    ...overrides,
  };
}

function highRiskCriteria(overrides: Partial<ValidationCriteriaInput> = {}): ValidationCriteriaInput {
  return validCriteria({
    riskLevel: "high",
    stopCondition: "Gross margin drops below 20% — halt all renegotiations.",
    ...overrides,
  });
}

function criticalRiskCriteria(overrides: Partial<ValidationCriteriaInput> = {}): ValidationCriteriaInput {
  return validCriteria({
    riskLevel: "critical",
    stopCondition: "Revenue drops > 15% — halt immediately.",
    escalationCondition: "Notify board if stop-loss triggered within 30 days.",
    ...overrides,
  });
}

// ─── VAL-RULE-1: successCondition ────────────────────────────────────────────

describe("VAL-RULE-1: successCondition required (min 10 chars)", () => {
  it("violation when successCondition is empty", () => {
    const result = validateValidationCriteria(validCriteria({ successCondition: "" }));
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("VAL-RULE-1"))).toBe(true);
  });

  it("violation when successCondition is too short", () => {
    const result = validateValidationCriteria(validCriteria({ successCondition: "ok done" }));
    expect(result.violations.some((v) => v.includes("VAL-RULE-1"))).toBe(true);
  });

  it("no violation when successCondition is sufficient", () => {
    const result = validateValidationCriteria(validCriteria());
    expect(result.violations.some((v) => v.includes("VAL-RULE-1"))).toBe(false);
  });
});

// ─── VAL-RULE-2: metricName ───────────────────────────────────────────────────

describe("VAL-RULE-2: metricName required", () => {
  it("violation when metricName is empty", () => {
    const result = validateValidationCriteria(validCriteria({ metricName: "" }));
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("VAL-RULE-2"))).toBe(true);
  });

  it("no violation when metricName is provided", () => {
    const result = validateValidationCriteria(validCriteria());
    expect(result.violations.some((v) => v.includes("VAL-RULE-2"))).toBe(false);
  });
});

// ─── VAL-RULE-3: high/critical risk requires stopCondition ───────────────────

describe("VAL-RULE-3: stopCondition required for high/critical risk", () => {
  it("violation when high risk without stopCondition", () => {
    const result = validateValidationCriteria(
      validCriteria({ riskLevel: "high", stopCondition: undefined })
    );
    expect(result.violations.some((v) => v.includes("VAL-RULE-3"))).toBe(true);
  });

  it("violation when critical risk without stopCondition", () => {
    const result = validateValidationCriteria(
      validCriteria({ riskLevel: "critical", stopCondition: undefined, escalationCondition: "Notify board." })
    );
    expect(result.violations.some((v) => v.includes("VAL-RULE-3"))).toBe(true);
  });

  it("no violation when high risk has stopCondition", () => {
    const result = validateValidationCriteria(highRiskCriteria());
    expect(result.violations.some((v) => v.includes("VAL-RULE-3"))).toBe(false);
  });

  it("standard risk does not require stopCondition", () => {
    const result = validateValidationCriteria(validCriteria({ stopCondition: undefined }));
    expect(result.violations.some((v) => v.includes("VAL-RULE-3"))).toBe(false);
  });

  it("low risk does not require stopCondition", () => {
    const result = validateValidationCriteria(
      validCriteria({ riskLevel: "low", stopCondition: undefined })
    );
    expect(result.violations.some((v) => v.includes("VAL-RULE-3"))).toBe(false);
  });

  it("requiresStopLoss is true for high risk", () => {
    const result = validateValidationCriteria(highRiskCriteria());
    expect(result.requiresStopLoss).toBe(true);
  });

  it("requiresStopLoss is false for standard risk", () => {
    const result = validateValidationCriteria(validCriteria());
    expect(result.requiresStopLoss).toBe(false);
  });
});

// ─── VAL-RULE-4: target must differ from baseline ────────────────────────────

describe("VAL-RULE-4: targetValue must differ from baselineValue", () => {
  it("violation when target equals baseline", () => {
    const result = validateValidationCriteria(
      validCriteria({ baselineValue: 30, targetValue: 30 })
    );
    expect(result.violations.some((v) => v.includes("VAL-RULE-4"))).toBe(true);
  });

  it("no violation when target differs from baseline", () => {
    const result = validateValidationCriteria(
      validCriteria({ baselineValue: 28, targetValue: 35 })
    );
    expect(result.violations.some((v) => v.includes("VAL-RULE-4"))).toBe(false);
  });

  it("no violation when only one of baseline/target is provided", () => {
    const result = validateValidationCriteria(
      validCriteria({ baselineValue: 28, targetValue: undefined })
    );
    expect(result.violations.some((v) => v.includes("VAL-RULE-4"))).toBe(false);
  });

  it("no violation when neither baseline nor target is provided", () => {
    const result = validateValidationCriteria(
      validCriteria({ baselineValue: undefined, targetValue: undefined })
    );
    expect(result.violations.some((v) => v.includes("VAL-RULE-4"))).toBe(false);
  });
});

// ─── VAL-RULE-5: must link to recommendation or action ───────────────────────

describe("VAL-RULE-5: recommendationId or actionId required", () => {
  it("violation when neither recommendationId nor actionId provided", () => {
    const result = validateValidationCriteria(
      validCriteria({ recommendationId: undefined, actionId: undefined })
    );
    expect(result.violations.some((v) => v.includes("VAL-RULE-5"))).toBe(true);
  });

  it("valid when only recommendationId provided", () => {
    const result = validateValidationCriteria(
      validCriteria({ recommendationId: "rec-001", actionId: undefined })
    );
    expect(result.violations.some((v) => v.includes("VAL-RULE-5"))).toBe(false);
  });

  it("valid when only actionId provided", () => {
    const result = validateValidationCriteria(
      validCriteria({ recommendationId: undefined, actionId: "action-001" })
    );
    expect(result.violations.some((v) => v.includes("VAL-RULE-5"))).toBe(false);
  });

  it("valid when both provided", () => {
    const result = validateValidationCriteria(
      validCriteria({ recommendationId: "rec-001", actionId: "action-001" })
    );
    expect(result.violations.some((v) => v.includes("VAL-RULE-5"))).toBe(false);
  });
});

// ─── VAL-RULE-6: minimumSampleSize ───────────────────────────────────────────

describe("VAL-RULE-6: minimumSampleSize must be positive", () => {
  it("violation when minimumSampleSize is 0", () => {
    const result = validateValidationCriteria(validCriteria({ minimumSampleSize: 0 }));
    expect(result.violations.some((v) => v.includes("VAL-RULE-6"))).toBe(true);
  });

  it("violation when minimumSampleSize is negative", () => {
    const result = validateValidationCriteria(validCriteria({ minimumSampleSize: -5 }));
    expect(result.violations.some((v) => v.includes("VAL-RULE-6"))).toBe(true);
  });

  it("no violation when minimumSampleSize is positive", () => {
    const result = validateValidationCriteria(validCriteria({ minimumSampleSize: 10 }));
    expect(result.violations.some((v) => v.includes("VAL-RULE-6"))).toBe(false);
  });

  it("no violation when minimumSampleSize is undefined (optional)", () => {
    const result = validateValidationCriteria(validCriteria({ minimumSampleSize: undefined }));
    expect(result.violations.some((v) => v.includes("VAL-RULE-6"))).toBe(false);
  });
});

// ─── VAL-RULE-7: measurement window ──────────────────────────────────────────

describe("VAL-RULE-7: measurementEndAt must be after measurementStartAt", () => {
  const start = new Date("2026-01-01");
  const end = new Date("2026-04-01");

  it("violation when end is before start", () => {
    const result = validateValidationCriteria(
      validCriteria({ measurementStartAt: end, measurementEndAt: start })
    );
    expect(result.violations.some((v) => v.includes("VAL-RULE-7"))).toBe(true);
  });

  it("violation when end equals start", () => {
    const result = validateValidationCriteria(
      validCriteria({ measurementStartAt: start, measurementEndAt: start })
    );
    expect(result.violations.some((v) => v.includes("VAL-RULE-7"))).toBe(true);
  });

  it("no violation when end is after start", () => {
    const result = validateValidationCriteria(
      validCriteria({ measurementStartAt: start, measurementEndAt: end })
    );
    expect(result.violations.some((v) => v.includes("VAL-RULE-7"))).toBe(false);
  });

  it("no violation when neither date is provided", () => {
    const result = validateValidationCriteria(
      validCriteria({ measurementStartAt: undefined, measurementEndAt: undefined })
    );
    expect(result.violations.some((v) => v.includes("VAL-RULE-7"))).toBe(false);
  });
});

// ─── Critical risk: escalationCondition ──────────────────────────────────────

describe("VAL-RULE-8: escalationCondition required for critical risk", () => {
  it("violation when critical risk without escalationCondition", () => {
    const result = validateValidationCriteria(
      validCriteria({
        riskLevel: "critical",
        stopCondition: "Halt if revenue drops 20%.",
        escalationCondition: undefined,
      })
    );
    expect(result.violations.some((v) => v.includes("VAL-RULE-8"))).toBe(true);
  });

  it("no violation when critical risk has both stop and escalation", () => {
    const result = validateValidationCriteria(criticalRiskCriteria());
    expect(result.violations.some((v) => v.includes("VAL-RULE-8"))).toBe(false);
  });

  it("requiresEscalation is true for critical risk", () => {
    const result = validateValidationCriteria(criticalRiskCriteria());
    expect(result.requiresEscalation).toBe(true);
  });

  it("requiresEscalation is false for high risk", () => {
    const result = validateValidationCriteria(highRiskCriteria());
    expect(result.requiresEscalation).toBe(false);
  });
});

// ─── assertRecommendationHasCriteria ─────────────────────────────────────────

describe("assertRecommendationHasCriteria", () => {
  it("throws when accepted recommendation has no criteria", () => {
    expect(() =>
      assertRecommendationHasCriteria("accepted", false, false)
    ).toThrow("VAL-GUARD-1");
  });

  it("does not throw when accepted recommendation has criteria", () => {
    expect(() =>
      assertRecommendationHasCriteria("accepted", true, false)
    ).not.toThrow();
  });

  it("does not throw when provisional accepted recommendation has no criteria", () => {
    expect(() =>
      assertRecommendationHasCriteria("accepted", false, true)
    ).not.toThrow();
  });

  it("does not throw for non-accepted status without criteria", () => {
    expect(() =>
      assertRecommendationHasCriteria("recommended", false, false)
    ).not.toThrow();
  });

  it("does not throw for rejected status", () => {
    expect(() =>
      assertRecommendationHasCriteria("rejected", false, false)
    ).not.toThrow();
  });
});

// ─── computeTargetDelta ───────────────────────────────────────────────────────

describe("computeTargetDelta", () => {
  it("computes absolute and percentage delta correctly", () => {
    const { absoluteDelta, percentageDelta } = computeTargetDelta(28, 35);
    expect(absoluteDelta).toBe(7);
    expect(percentageDelta).toBeCloseTo(25, 0);
  });

  it("handles negative delta (target lower than baseline)", () => {
    const { absoluteDelta, percentageDelta } = computeTargetDelta(50, 40);
    expect(absoluteDelta).toBe(-10);
    expect(percentageDelta).toBe(-20);
  });

  it("returns 0 percentage when baseline is 0", () => {
    const { absoluteDelta, percentageDelta } = computeTargetDelta(0, 10);
    expect(absoluteDelta).toBe(10);
    expect(percentageDelta).toBe(0);
  });

  it("handles equal values (delta = 0)", () => {
    const { absoluteDelta, percentageDelta } = computeTargetDelta(30, 30);
    expect(absoluteDelta).toBe(0);
    expect(percentageDelta).toBe(0);
  });
});

// ─── Valid complete inputs ─────────────────────────────────────────────────────

describe("valid complete inputs", () => {
  it("standard risk criteria is valid", () => {
    const result = validateValidationCriteria(validCriteria());
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("high risk criteria with stopCondition is valid", () => {
    const result = validateValidationCriteria(highRiskCriteria());
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("critical risk criteria with stop + escalation is valid", () => {
    const result = validateValidationCriteria(criticalRiskCriteria());
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("criteria linked to action only is valid", () => {
    const result = validateValidationCriteria(
      validCriteria({ recommendationId: undefined, actionId: "action-001" })
    );
    expect(result.valid).toBe(true);
  });
});

// ─── Workspace scoping ────────────────────────────────────────────────────────

describe("workspace scoping", () => {
  it("throws when workspaceId is empty", () => {
    expect(() => validateValidationCriteria(validCriteria({ workspaceId: "" }))).toThrow();
  });

  it("throws when workspaceId is whitespace", () => {
    expect(() => validateValidationCriteria(validCriteria({ workspaceId: "   " }))).toThrow();
  });
});
