import { describe, it, expect } from "vitest";
import {
  evaluateInputQualityGate,
  assertInputQualityForPromotion,
  InputQualityGateError,
  RecommendationSensitivity,
  InputQualityPromotionOutcome,
} from "@/domain/owner-mode/recommendation-input-quality-gate";
import type { InputQualityStatus } from "@/domain/owner-mode/input-quality";

const REC = "rec-1";
const BLOCKING: InputQualityStatus[] = ["critical_missing", "conflicting", "unsafe_for_strong_recommendation"];
const WEAK: InputQualityStatus[] = ["data_limited", "stale", "owner_estimate_only"];
const SENSITIVE = [
  RecommendationSensitivity.FINANCE_SENSITIVE,
  RecommendationSensitivity.GROWTH_SENSITIVE,
  RecommendationSensitivity.PRICING_SENSITIVE,
  RecommendationSensitivity.HIRING_SENSITIVE,
];

describe("[module2] recommendation input-quality gate — module contract assertions", () => {
  it("evaluateInputQualityGate is a function", () => {
    expect(typeof evaluateInputQualityGate).toBe("function");
  });
  it("assertInputQualityForPromotion is a function", () => {
    expect(typeof assertInputQualityForPromotion).toBe("function");
  });
  it("InputQualityGateError is defined", () => {
    expect(InputQualityGateError).toBeDefined();
  });
  it("RecommendationSensitivity.FINANCE_SENSITIVE is defined", () => {
    expect(RecommendationSensitivity.FINANCE_SENSITIVE).toBeDefined();
  });
  it("RecommendationSensitivity.GENERAL is defined", () => {
    expect(RecommendationSensitivity.GENERAL).toBeDefined();
  });
  it("RecommendationSensitivity.COMPLIANCE_SENSITIVE is defined", () => {
    expect(RecommendationSensitivity.COMPLIANCE_SENSITIVE).toBeDefined();
  });
  it("InputQualityPromotionOutcome.BLOCKED_INSUFFICIENT_DATA is defined", () => {
    expect(InputQualityPromotionOutcome.BLOCKED_INSUFFICIENT_DATA).toBeDefined();
  });
  it("InputQualityPromotionOutcome.REQUIRES_OWNER_REVIEW is defined", () => {
    expect(InputQualityPromotionOutcome.REQUIRES_OWNER_REVIEW).toBeDefined();
  });
  it("InputQualityPromotionOutcome.REQUIRES_PROFESSIONAL_REVIEW is defined", () => {
    expect(InputQualityPromotionOutcome.REQUIRES_PROFESSIONAL_REVIEW).toBeDefined();
  });
  it("BLOCKING has 3 entries", () => {
    expect(BLOCKING.length).toBe(3);
  });
  it("WEAK has 3 entries", () => {
    expect(WEAK.length).toBe(3);
  });
  it("SENSITIVE has 4 entries", () => {
    expect(SENSITIVE.length).toBe(4);
  });
  it("evaluateInputQualityGate returns an object", () => {
    expect(typeof evaluateInputQualityGate("complete", RecommendationSensitivity.FINANCE_SENSITIVE)).toBe("object");
  });
  it("evaluateInputQualityGate result has an allowed field", () => {
    expect(evaluateInputQualityGate("complete", RecommendationSensitivity.FINANCE_SENSITIVE)).toHaveProperty("allowed");
  });
  it("evaluateInputQualityGate result has an outcome field", () => {
    expect(evaluateInputQualityGate("complete", RecommendationSensitivity.FINANCE_SENSITIVE)).toHaveProperty("outcome");
  });
  it("evaluateInputQualityGate('complete', FINANCE_SENSITIVE).allowed is true", () => {
    expect(evaluateInputQualityGate("complete", RecommendationSensitivity.FINANCE_SENSITIVE).allowed).toBe(true);
  });
});

describe("[module2] recommendation input-quality gate", () => {
  it("complete data allows a sensitive recommendation", () => {
    for (const s of SENSITIVE) {
      expect(evaluateInputQualityGate("complete", s).allowed).toBe(true);
    }
  });

  it.each(BLOCKING)("blocking status %s blocks every sensitive recommendation", (status) => {
    for (const s of SENSITIVE) {
      const r = evaluateInputQualityGate(status, s);
      expect(r.allowed).toBe(false);
      expect(r.outcome).toBe(InputQualityPromotionOutcome.BLOCKED_INSUFFICIENT_DATA);
    }
  });

  it.each(WEAK)("weak status %s routes a sensitive recommendation to owner review", (status) => {
    const r = evaluateInputQualityGate(status, RecommendationSensitivity.FINANCE_SENSITIVE);
    expect(r.allowed).toBe(false);
    expect(r.outcome).toBe(InputQualityPromotionOutcome.REQUIRES_OWNER_REVIEW);
  });

  it("compliance-sensitive recommendations always require professional review", () => {
    for (const status of ["complete", "critical_missing"] as InputQualityStatus[]) {
      const r = evaluateInputQualityGate(status, RecommendationSensitivity.COMPLIANCE_SENSITIVE);
      expect(r.allowed).toBe(false);
      expect(r.outcome).toBe(InputQualityPromotionOutcome.REQUIRES_PROFESSIONAL_REVIEW);
    }
  });

  it("general recommendations are only blocked on outright critical/conflicting evidence", () => {
    expect(evaluateInputQualityGate("data_limited", RecommendationSensitivity.GENERAL).allowed).toBe(true);
    expect(evaluateInputQualityGate("stale", RecommendationSensitivity.GENERAL).allowed).toBe(true);
    expect(evaluateInputQualityGate("critical_missing", RecommendationSensitivity.GENERAL).allowed).toBe(false);
    expect(evaluateInputQualityGate("conflicting", RecommendationSensitivity.GENERAL).allowed).toBe(false);
  });

  it("the guard throws InputQualityGateError when blocked and is silent when allowed", () => {
    expect(() => assertInputQualityForPromotion("complete", RecommendationSensitivity.FINANCE_SENSITIVE, REC)).not.toThrow();
    expect(() => assertInputQualityForPromotion("critical_missing", RecommendationSensitivity.FINANCE_SENSITIVE, REC)).toThrow(InputQualityGateError);
    try {
      assertInputQualityForPromotion("conflicting", RecommendationSensitivity.GROWTH_SENSITIVE, REC);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(InputQualityGateError);
      expect((e as InputQualityGateError).code).toBe("INPUT_QUALITY_GATE_BLOCKED");
      expect((e as InputQualityGateError).outcome).toBe(InputQualityPromotionOutcome.BLOCKED_INSUFFICIENT_DATA);
    }
  });
});
