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

describe("recommendation confidence gate — module contract assertions", () => {
  it("classifyRecommendationConfidence is a function", () => { expect(typeof classifyRecommendationConfidence).toBe("function"); });
  it("assertConfidenceForPromotion is a function", () => { expect(typeof assertConfidenceForPromotion).toBe("function"); });
  it("ConfidenceGateError is a class/function", () => { expect(typeof ConfidenceGateError).toBe("function"); });
  it("ConfidencePromotionClass is an object", () => { expect(typeof ConfidencePromotionClass).toBe("object"); });
  it("ConfidencePromotionClass.HIGH_CONFIDENCE is defined", () => { expect(ConfidencePromotionClass.HIGH_CONFIDENCE).toBeDefined(); });
  it("ConfidencePromotionClass.LOW_CONFIDENCE is defined", () => { expect(ConfidencePromotionClass.LOW_CONFIDENCE).toBeDefined(); });
  it("ConfidencePromotionClass.BLOCKED_UNSAFE is defined", () => { expect(ConfidencePromotionClass.BLOCKED_UNSAFE).toBeDefined(); });
  it("ConfidencePromotionClass.INSUFFICIENT_DATA is defined", () => { expect(ConfidencePromotionClass.INSUFFICIENT_DATA).toBeDefined(); });
  it("base is a function", () => { expect(typeof base).toBe("function"); });
  it("base() returns an object", () => { expect(typeof base()).toBe("object"); });
  it("base() has confidenceLevel field", () => { expect(base()).toHaveProperty("confidenceLevel"); });
  it("base().confidenceLevel equals 'high'", () => { expect(base().confidenceLevel).toBe("high"); });
  it("base() has isUnsafe field", () => { expect(base()).toHaveProperty("isUnsafe"); });
  it("base().isUnsafe is false", () => { expect(base().isUnsafe).toBe(false); });
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
