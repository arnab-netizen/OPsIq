import { describe, it, expect } from "vitest";
import {
  assessCausality,
  observedEffectSize,
  shouldCreditAction,
  assertCausalBeforeLearning,
  UnprovenCausalityError,
  type CausalityEvidence,
} from "@/domain/execution/outcome-causality";

const base: CausalityEvidence = {
  hasBaseline: true,
  baselineValue: 100,
  outcomeValue: 120,
  temporalOrderCorrect: true,
  confoundersControlled: true,
  sampleAdequate: true,
  alternativeExplanations: 0,
};

describe("[module27] assessCausality verdicts", () => {
  it("[module27] CAUSAL_LIKELY when all criteria met", () => {
    const r = assessCausality(base);
    expect(r.verdict).toBe("CAUSAL_LIKELY");
    expect(r.confidence).toBe(1);
    expect(r.reasons).toContain("baseline_present");
  });

  it("[module27] SPURIOUS_RISK when temporal order wrong", () => {
    const r = assessCausality({ ...base, temporalOrderCorrect: false });
    expect(r.verdict).toBe("SPURIOUS_RISK");
    expect(r.reasons).toContain("temporal_order_incorrect");
  });

  it("[module27] SPURIOUS_RISK when no baseline", () => {
    const r = assessCausality({ ...base, hasBaseline: false });
    expect(r.verdict).toBe("SPURIOUS_RISK");
    expect(r.reasons).toContain("no_baseline");
  });

  it("[module27] INSUFFICIENT_EVIDENCE when sample inadequate", () => {
    const r = assessCausality({ ...base, sampleAdequate: false });
    expect(r.verdict).toBe("INSUFFICIENT_EVIDENCE");
    expect(r.reasons).toContain("sample_inadequate");
  });

  it("[module27] INSUFFICIENT_EVIDENCE when many alternatives and confounders not controlled", () => {
    const r = assessCausality({
      ...base,
      confoundersControlled: false,
      alternativeExplanations: 4,
    });
    expect(r.verdict).toBe("INSUFFICIENT_EVIDENCE");
    expect(r.reasons).toContain("many_uncontrolled_alternatives");
  });

  it("[module27] PLAUSIBLE when confounders not controlled but evidence otherwise sound", () => {
    const r = assessCausality({
      ...base,
      confoundersControlled: false,
      alternativeExplanations: 0,
    });
    expect(r.verdict).toBe("PLAUSIBLE");
    expect(r.reasons).toContain("confounders_not_controlled");
  });

  it("[module27] PLAUSIBLE when some (but not many) alternatives with confounders controlled", () => {
    const r = assessCausality({ ...base, alternativeExplanations: 2 });
    expect(r.verdict).toBe("PLAUSIBLE");
    expect(r.reasons).toContain("some_alternative_explanations");
  });
});

describe("[module27] observedEffectSize", () => {
  it("[module27] computes relative change when baseline and outcome present", () => {
    expect(observedEffectSize(base)).toBeCloseTo(0.2, 10);
  });

  it("[module27] negative effect size", () => {
    expect(observedEffectSize({ ...base, outcomeValue: 80 })).toBeCloseTo(-0.2, 10);
  });

  it("[module27] null when no baseline value", () => {
    expect(observedEffectSize({ ...base, baselineValue: undefined })).toBeNull();
  });

  it("[module27] null when no outcome value", () => {
    expect(observedEffectSize({ ...base, outcomeValue: undefined })).toBeNull();
  });

  it("[module27] null when baseline is zero", () => {
    expect(observedEffectSize({ ...base, baselineValue: 0 })).toBeNull();
  });
});

describe("[module27] shouldCreditAction", () => {
  it("[module27] true only for CAUSAL_LIKELY", () => {
    expect(shouldCreditAction(base)).toBe(true);
  });

  it("[module27] false for PLAUSIBLE", () => {
    expect(shouldCreditAction({ ...base, confoundersControlled: false })).toBe(false);
  });

  it("[module27] false for SPURIOUS_RISK", () => {
    expect(shouldCreditAction({ ...base, hasBaseline: false })).toBe(false);
  });

  it("[module27] false for INSUFFICIENT_EVIDENCE", () => {
    expect(shouldCreditAction({ ...base, sampleAdequate: false })).toBe(false);
  });
});

describe("[module27] assertCausalBeforeLearning guard", () => {
  it("[module27] throws on SPURIOUS_RISK", () => {
    expect(() =>
      assertCausalBeforeLearning({ ...base, temporalOrderCorrect: false }, "act-1")
    ).toThrow(UnprovenCausalityError);
  });

  it("[module27] throws on INSUFFICIENT_EVIDENCE", () => {
    expect(() =>
      assertCausalBeforeLearning({ ...base, sampleAdequate: false }, "act-2")
    ).toThrow(UnprovenCausalityError);
  });

  it("[module27] error carries code, verdict, and reasons", () => {
    try {
      assertCausalBeforeLearning({ ...base, hasBaseline: false }, "act-3");
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(UnprovenCausalityError);
      const err = e as UnprovenCausalityError;
      expect(err.code).toBe("UNPROVEN_CAUSALITY");
      expect(err.verdict).toBe("SPURIOUS_RISK");
      expect(err.reasons).toContain("no_baseline");
      expect(err.message).toContain("act-3");
    }
  });

  it("[module27] passes on CAUSAL_LIKELY", () => {
    expect(() => assertCausalBeforeLearning(base, "act-ok")).not.toThrow();
  });

  it("[module27] passes on PLAUSIBLE", () => {
    expect(() =>
      assertCausalBeforeLearning({ ...base, confoundersControlled: false }, "act-plausible")
    ).not.toThrow();
  });
});

describe("[module27] confidence monotonicity", () => {
  it("[module27] more criteria met yields higher confidence", () => {
    const none: CausalityEvidence = {
      hasBaseline: false,
      temporalOrderCorrect: false,
      confoundersControlled: false,
      sampleAdequate: false,
      alternativeExplanations: 5,
    };
    const one = { ...none, hasBaseline: true };
    const two = { ...one, temporalOrderCorrect: true };
    const three = { ...two, confoundersControlled: true };
    const four = { ...three, sampleAdequate: true };
    const five = { ...four, alternativeExplanations: 0 };

    const c = (e: CausalityEvidence) => assessCausality(e).confidence;
    expect(c(none)).toBe(0);
    expect(c(one)).toBeGreaterThan(c(none));
    expect(c(two)).toBeGreaterThan(c(one));
    expect(c(three)).toBeGreaterThan(c(two));
    expect(c(four)).toBeGreaterThan(c(three));
    expect(c(five)).toBeGreaterThan(c(four));
    expect(c(five)).toBe(1);
  });

  it("[module27] confidence stays within 0..1", () => {
    const r = assessCausality(base);
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
  });
});
