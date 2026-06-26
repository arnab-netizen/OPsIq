import { describe, it, expect } from "vitest";
import {
  horizonFromDays,
  benefitCostRatio,
  assessTimeHorizonTradeoff,
  assertHorizonAffordable,
  UnaffordableHorizonError,
  type TradeoffInput,
} from "@/domain/execution/time-horizon";

const input = (over: Partial<TradeoffInput> = {}): TradeoffInput => ({
  shortTermCost: 100,
  longTermBenefit: 200,
  paybackDays: 3,
  ownerSurvivalPressure: "NONE",
  ...over,
});

describe("[module37] horizonFromDays boundaries", () => {
  it("[module37] classifies IMMEDIATE at and below 7 days", () => {
    expect(horizonFromDays(0)).toBe("IMMEDIATE");
    expect(horizonFromDays(7)).toBe("IMMEDIATE");
  });
  it("[module37] classifies SHORT_TERM between 8 and 30 days", () => {
    expect(horizonFromDays(8)).toBe("SHORT_TERM");
    expect(horizonFromDays(30)).toBe("SHORT_TERM");
  });
  it("[module37] classifies MEDIUM_TERM between 31 and 180 days", () => {
    expect(horizonFromDays(31)).toBe("MEDIUM_TERM");
    expect(horizonFromDays(180)).toBe("MEDIUM_TERM");
  });
  it("[module37] classifies LONG_TERM above 180 days", () => {
    expect(horizonFromDays(181)).toBe("LONG_TERM");
    expect(horizonFromDays(9999)).toBe("LONG_TERM");
  });
  it("[module37] treats non-finite / negative days as IMMEDIATE", () => {
    expect(horizonFromDays(-5)).toBe("IMMEDIATE");
    expect(horizonFromDays(NaN)).toBe("IMMEDIATE");
  });
});

describe("[module37] netLeaning", () => {
  it("[module37] LONG_TERM_FAVORED when benefit/cost ratio is high", () => {
    const r = assessTimeHorizonTradeoff(input({ shortTermCost: 100, longTermBenefit: 200 }));
    expect(r.netLeaning).toBe("LONG_TERM_FAVORED");
  });
  it("[module37] SHORT_TERM_FAVORED when benefit/cost ratio is low", () => {
    // short horizon so it is not REJECT'd; benefit < cost but horizon immediate.
    const r = assessTimeHorizonTradeoff(input({ shortTermCost: 100, longTermBenefit: 50, paybackDays: 3 }));
    expect(r.netLeaning).toBe("SHORT_TERM_FAVORED");
  });
  it("[module37] BALANCED when benefit roughly equals cost", () => {
    const r = assessTimeHorizonTradeoff(input({ shortTermCost: 100, longTermBenefit: 100, paybackDays: 3 }));
    expect(r.netLeaning).toBe("BALANCED");
  });
});

describe("[module37] survival-pressure deferral", () => {
  it("[module37] defers a long-horizon action under CRITICAL pressure", () => {
    const r = assessTimeHorizonTradeoff(
      input({ paybackDays: 365, longTermBenefit: 1000, shortTermCost: 100, ownerSurvivalPressure: "CRITICAL" })
    );
    expect(r.recommendation).toBe("DEFER_UNTIL_STABLE");
    expect(r.affordableNow).toBe(false);
    expect(r.horizon).toBe("LONG_TERM");
  });
  it("[module37] proceeds with an immediate action even under CRITICAL pressure", () => {
    const r = assessTimeHorizonTradeoff(
      input({ paybackDays: 3, longTermBenefit: 1000, shortTermCost: 100, ownerSurvivalPressure: "CRITICAL" })
    );
    expect(r.recommendation).toBe("PROCEED");
    expect(r.affordableNow).toBe(true);
  });
  it("[module37] proceeds with a long-horizon action under NONE pressure when worthwhile", () => {
    const r = assessTimeHorizonTradeoff(
      input({ paybackDays: 365, longTermBenefit: 1000, shortTermCost: 100, ownerSurvivalPressure: "NONE" })
    );
    expect(r.recommendation).toBe("PROCEED");
  });
});

describe("[module37] REJECT path", () => {
  it("[module37] rejects a long-horizon action whose benefit does not exceed cost", () => {
    const r = assessTimeHorizonTradeoff(
      input({ paybackDays: 365, longTermBenefit: 100, shortTermCost: 100, ownerSurvivalPressure: "NONE" })
    );
    expect(r.recommendation).toBe("REJECT");
    expect(r.affordableNow).toBe(false);
  });
  it("[module37] REJECT takes precedence over CRITICAL deferral", () => {
    const r = assessTimeHorizonTradeoff(
      input({ paybackDays: 365, longTermBenefit: 50, shortTermCost: 100, ownerSurvivalPressure: "CRITICAL" })
    );
    expect(r.recommendation).toBe("REJECT");
  });
});

describe("[module37] benefitCostRatio guard", () => {
  it("[module37] computes ratio for positive cost", () => {
    expect(benefitCostRatio(input({ shortTermCost: 100, longTermBenefit: 250 }))).toBe(2.5);
  });
  it("[module37] returns null when short-term cost is zero", () => {
    expect(benefitCostRatio(input({ shortTermCost: 0, longTermBenefit: 250 }))).toBeNull();
  });
  it("[module37] returns null when short-term cost is negative", () => {
    expect(benefitCostRatio(input({ shortTermCost: -10, longTermBenefit: 250 }))).toBeNull();
  });
  it("[module37] zero-cost action with benefit leans LONG_TERM_FAVORED", () => {
    const r = assessTimeHorizonTradeoff(input({ shortTermCost: 0, longTermBenefit: 250, paybackDays: 3 }));
    expect(r.netLeaning).toBe("LONG_TERM_FAVORED");
  });
});

describe("[module37] assertHorizonAffordable guard", () => {
  it("[module37] passes on PROCEED", () => {
    expect(() => assertHorizonAffordable(input(), "action-1")).not.toThrow();
  });
  it("[module37] throws on DEFER_UNTIL_STABLE", () => {
    const bad = input({ paybackDays: 365, longTermBenefit: 1000, shortTermCost: 100, ownerSurvivalPressure: "CRITICAL" });
    expect(() => assertHorizonAffordable(bad, "action-2")).toThrow(UnaffordableHorizonError);
    try {
      assertHorizonAffordable(bad, "action-2");
    } catch (e) {
      expect(e).toBeInstanceOf(UnaffordableHorizonError);
      expect((e as UnaffordableHorizonError).code).toBe("UNAFFORDABLE_HORIZON");
      expect((e as UnaffordableHorizonError).recommendation).toBe("DEFER_UNTIL_STABLE");
      expect((e as UnaffordableHorizonError).rationale).toContain("survival pressure");
    }
  });
  it("[module37] throws on REJECT", () => {
    const bad = input({ paybackDays: 365, longTermBenefit: 100, shortTermCost: 100, ownerSurvivalPressure: "NONE" });
    expect(() => assertHorizonAffordable(bad, "action-3")).toThrow(UnaffordableHorizonError);
    try {
      assertHorizonAffordable(bad, "action-3");
    } catch (e) {
      expect((e as UnaffordableHorizonError).recommendation).toBe("REJECT");
    }
  });
});
