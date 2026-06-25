import { describe, it, expect } from "vitest";
import {
  classifyRecommendationConfidence,
  assertConfidenceForPromotion,
  ConfidenceGateError,
  ConfidencePromotionClass,
  type ConfidenceGateInput,
} from "@/domain/decision-confidence/recommendation-confidence-gate";

const base = (over: Partial<ConfidenceGateInput> = {}): ConfidenceGateInput => ({
  confidenceLevel: "high",
  hasSufficientData: true,
  isUnsafe: false,
  needsProfessionalReview: false,
  ...over,
});

describe("[module3] recommendation confidence gate", () => {
  it("high / very_high confidence auto-promotes", () => {
    expect(classifyRecommendationConfidence(base({ confidenceLevel: "high" })).allowed).toBe(true);
    expect(classifyRecommendationConfidence(base({ confidenceLevel: "very_high" })).classification).toBe(ConfidencePromotionClass.HIGH_CONFIDENCE);
  });

  it("moderate confidence is MEDIUM and allowed (with monitoring)", () => {
    const r = classifyRecommendationConfidence(base({ confidenceLevel: "moderate" }));
    expect(r.classification).toBe(ConfidencePromotionClass.MEDIUM_CONFIDENCE);
    expect(r.allowed).toBe(true);
  });

  it("low confidence requires owner review (blocked from auto-promote)", () => {
    const r = classifyRecommendationConfidence(base({ confidenceLevel: "low" }));
    expect(r.classification).toBe(ConfidencePromotionClass.REQUIRES_OWNER_REVIEW);
    expect(r.allowed).toBe(false);
  });

  it("very_low confidence is LOW_CONFIDENCE and blocked", () => {
    const r = classifyRecommendationConfidence(base({ confidenceLevel: "very_low" }));
    expect(r.classification).toBe(ConfidencePromotionClass.LOW_CONFIDENCE);
    expect(r.allowed).toBe(false);
  });

  it("insufficient data forces INSUFFICIENT_DATA regardless of a high level", () => {
    const r = classifyRecommendationConfidence(base({ confidenceLevel: "very_high", hasSufficientData: false }));
    expect(r.classification).toBe(ConfidencePromotionClass.INSUFFICIENT_DATA);
    expect(r.allowed).toBe(false);
  });

  it("unsafe forces BLOCKED_UNSAFE (precedence over confidence)", () => {
    const r = classifyRecommendationConfidence(base({ confidenceLevel: "very_high", isUnsafe: true }));
    expect(r.classification).toBe(ConfidencePromotionClass.BLOCKED_UNSAFE);
    expect(r.allowed).toBe(false);
  });

  it("professional review has the highest precedence", () => {
    const r = classifyRecommendationConfidence(base({ confidenceLevel: "very_high", isUnsafe: true, hasSufficientData: false, needsProfessionalReview: true }));
    expect(r.classification).toBe(ConfidencePromotionClass.REQUIRES_PROFESSIONAL_REVIEW);
    expect(r.allowed).toBe(false);
  });

  it("the guard throws ConfidenceGateError when blocked and is silent when allowed", () => {
    expect(() => assertConfidenceForPromotion(base({ confidenceLevel: "high" }), "rec-1")).not.toThrow();
    try {
      assertConfidenceForPromotion(base({ confidenceLevel: "very_low" }), "rec-1");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ConfidenceGateError);
      expect((e as ConfidenceGateError).code).toBe("CONFIDENCE_GATE_BLOCKED");
      expect((e as ConfidenceGateError).classification).toBe(ConfidencePromotionClass.LOW_CONFIDENCE);
    }
  });
});
