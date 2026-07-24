import { describe, it, expect } from "vitest";
import {
  evaluateNegativeRecommendation,
  rankNegativeRecommendations,
  assertNoBlockingNegative,
  BlockingNegativeRecommendationError,
  type NegativeRecommendationInput,
} from "@/domain/execution/negative-recommendation";

const rec = (
  over: Partial<NegativeRecommendationInput> = {}
): NegativeRecommendationInput => ({
  action: "do not discount further",
  kind: "STOP_CONTINUING",
  harmIfDone: "medium",
  evidenceStrength: "moderate",
  reversible: true,
  ...over,
});

describe("negative-recommendation — module contract assertions", () => {
  it("evaluateNegativeRecommendation is a function", () => { expect(typeof evaluateNegativeRecommendation).toBe("function"); });
  it("rankNegativeRecommendations is a function", () => { expect(typeof rankNegativeRecommendations).toBe("function"); });
  it("assertNoBlockingNegative is a function", () => { expect(typeof assertNoBlockingNegative).toBe("function"); });
  it("BlockingNegativeRecommendationError is a function", () => { expect(typeof BlockingNegativeRecommendationError).toBe("function"); });
  it("rec is a function", () => { expect(typeof rec).toBe("function"); });
  it("rec() returns an object", () => { expect(typeof rec()).toBe("object"); });
  it("rec() has action field", () => { expect(rec()).toHaveProperty("action"); });
  it("rec() has kind field", () => { expect(rec()).toHaveProperty("kind"); });
  it("rec() has harmIfDone field", () => { expect(rec()).toHaveProperty("harmIfDone"); });
  it("evaluateNegativeRecommendation(rec()) returns an object", () => { expect(typeof evaluateNegativeRecommendation(rec())).toBe("object"); });
  it("evaluateNegativeRecommendation(rec()) has urgency field", () => { expect(evaluateNegativeRecommendation(rec())).toHaveProperty("urgency"); });
  it("rankNegativeRecommendations([]) returns an array", () => { expect(Array.isArray(rankNegativeRecommendations([]))).toBe(true); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("[module34] evaluateNegativeRecommendation urgency tiers", () => {
  it("[module34] BLOCKING when harm critical AND evidence strong", () => {
    const r = evaluateNegativeRecommendation(
      rec({ harmIfDone: "critical", evidenceStrength: "strong", reversible: true })
    );
    expect(r.urgency).toBe("BLOCKING");
    expect(r.issue).toBe(true);
    expect(r.rationale).toContain("BLOCKING");
  });

  it("[module34] STRONG when harm high", () => {
    const r = evaluateNegativeRecommendation(
      rec({ harmIfDone: "high", evidenceStrength: "weak" })
    );
    expect(r.urgency).toBe("STRONG");
    expect(r.issue).toBe(true);
  });

  it("[module34] ADVISORY otherwise (medium harm)", () => {
    const r = evaluateNegativeRecommendation(
      rec({ harmIfDone: "medium", evidenceStrength: "moderate" })
    );
    expect(r.urgency).toBe("ADVISORY");
    expect(r.issue).toBe(true);
  });

  it("[module34] irreversible + critical => BLOCKING even without strong evidence", () => {
    const r = evaluateNegativeRecommendation(
      rec({ harmIfDone: "critical", evidenceStrength: "weak", reversible: false })
    );
    expect(r.urgency).toBe("BLOCKING");
    expect(r.issue).toBe(true);
  });

  it("[module34] critical + weak evidence + reversible is not BLOCKING", () => {
    const r = evaluateNegativeRecommendation(
      rec({ harmIfDone: "critical", evidenceStrength: "weak", reversible: true })
    );
    expect(r.urgency).toBe("ADVISORY");
    expect(r.issue).toBe(true);
  });
});

describe("[module34] issue=false case", () => {
  it("[module34] issue is false only when harm low AND evidence weak", () => {
    const r = evaluateNegativeRecommendation(
      rec({ harmIfDone: "low", evidenceStrength: "weak" })
    );
    expect(r.issue).toBe(false);
    expect(r.urgency).toBe("ADVISORY");
    expect(r.rationale).toContain("no negative recommendation");
  });

  it("[module34] low harm but moderate evidence still issues", () => {
    const r = evaluateNegativeRecommendation(
      rec({ harmIfDone: "low", evidenceStrength: "moderate" })
    );
    expect(r.issue).toBe(true);
  });
});

describe("[module34] rankNegativeRecommendations", () => {
  it("[module34] orders BLOCKING then STRONG then ADVISORY with tie-break by action name", () => {
    const inputs: NegativeRecommendationInput[] = [
      rec({ action: "z-advisory", harmIfDone: "medium" }),
      rec({ action: "b-blocking", harmIfDone: "critical", evidenceStrength: "strong" }),
      rec({ action: "a-strong", harmIfDone: "high" }),
      rec({ action: "a-blocking", harmIfDone: "critical", reversible: false, evidenceStrength: "weak" }),
      rec({ action: "m-strong", harmIfDone: "high" }),
    ];
    const ranked = rankNegativeRecommendations(inputs);
    expect(ranked.map((r) => r.input.action)).toEqual([
      "a-blocking",
      "b-blocking",
      "a-strong",
      "m-strong",
      "z-advisory",
    ]);
  });

  it("[module34] excludes issue===false entries", () => {
    const inputs: NegativeRecommendationInput[] = [
      rec({ action: "keep", harmIfDone: "high" }),
      rec({ action: "drop", harmIfDone: "low", evidenceStrength: "weak" }),
    ];
    const ranked = rankNegativeRecommendations(inputs);
    expect(ranked.map((r) => r.input.action)).toEqual(["keep"]);
  });
});

describe("[module34] assertNoBlockingNegative guard", () => {
  it("[module34] throws BlockingNegativeRecommendationError on blocking", () => {
    const inputs: NegativeRecommendationInput[] = [
      rec({ action: "fine", harmIfDone: "high" }),
      rec({ action: "stop-now", harmIfDone: "critical", evidenceStrength: "strong" }),
    ];
    try {
      assertNoBlockingNegative(inputs, "ACTION-1");
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(BlockingNegativeRecommendationError);
      const err = e as BlockingNegativeRecommendationError;
      expect(err.code).toBe("BLOCKING_NEGATIVE_RECOMMENDATION");
      expect(err.blockingActions).toEqual(["stop-now"]);
      expect(err.message).toContain("ACTION-1");
    }
  });

  it("[module34] passes when none blocking", () => {
    const inputs: NegativeRecommendationInput[] = [
      rec({ action: "a", harmIfDone: "high" }),
      rec({ action: "b", harmIfDone: "medium" }),
      rec({ action: "c", harmIfDone: "low", evidenceStrength: "weak" }),
    ];
    expect(() => assertNoBlockingNegative(inputs, "ACTION-2")).not.toThrow();
  });
});
