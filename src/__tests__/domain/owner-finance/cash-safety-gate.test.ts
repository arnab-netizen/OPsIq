import { describe, it, expect } from "vitest";
import {
  evaluateCashSafetyGate,
  assertCashSafetyForPromotion,
  worseState,
  CashSafetyGateError,
  CashSafetyOutcome,
  type FinancialHealthState,
} from "@/domain/owner-finance/cash-safety-gate";
import { RecommendationSensitivity } from "@/domain/owner-mode/recommendation-input-quality-gate";

const S = (x: FinancialHealthState) => x;

describe("[module4/5] cash-safety promotion gate — module contract assertions", () => {
  it("evaluateCashSafetyGate is a function", () => { expect(typeof evaluateCashSafetyGate).toBe("function"); });
  it("assertCashSafetyForPromotion is a function", () => { expect(typeof assertCashSafetyForPromotion).toBe("function"); });
  it("worseState is a function", () => { expect(typeof worseState).toBe("function"); });
  it("CashSafetyGateError is a class (function)", () => { expect(typeof CashSafetyGateError).toBe("function"); });
  it("CashSafetyOutcome.BLOCKED_CASH_UNSAFE is defined", () => { expect(CashSafetyOutcome.BLOCKED_CASH_UNSAFE).toBeDefined(); });
  it("RecommendationSensitivity.GROWTH_SENSITIVE is defined", () => { expect(RecommendationSensitivity.GROWTH_SENSITIVE).toBeDefined(); });
  it("RecommendationSensitivity.COMPLIANCE_SENSITIVE is defined", () => { expect(RecommendationSensitivity.COMPLIANCE_SENSITIVE).toBeDefined(); });
  it("worseState('SAFE', 'CRITICAL') returns 'CRITICAL'", () => { expect(worseState(S("SAFE"), S("CRITICAL"))).toBe("CRITICAL"); });
  it("evaluateCashSafetyGate returns object with allowed field", () => {
    expect(evaluateCashSafetyGate("SAFE", "SAFE", RecommendationSensitivity.GROWTH_SENSITIVE)).toHaveProperty("allowed");
  });
  it("evaluateCashSafetyGate SAFE+SAFE+GROWTH returns allowed=true", () => {
    expect(evaluateCashSafetyGate("SAFE", "SAFE", RecommendationSensitivity.GROWTH_SENSITIVE).allowed).toBe(true);
  });
  it("evaluateCashSafetyGate returns object with outcome field", () => {
    expect(evaluateCashSafetyGate("SAFE", "SAFE", RecommendationSensitivity.GROWTH_SENSITIVE)).toHaveProperty("outcome");
  });
  it("assertCashSafetyForPromotion does not throw when safe", () => {
    expect(() => assertCashSafetyForPromotion("SAFE", "SAFE", RecommendationSensitivity.GROWTH_SENSITIVE, "rec-x")).not.toThrow();
  });
  it("CashSafetyGateError is instanceof Error when thrown", () => {
    try { assertCashSafetyForPromotion("SAFE", "CRITICAL", RecommendationSensitivity.GROWTH_SENSITIVE, "rec-1"); }
    catch (e) { expect(e).toBeInstanceOf(Error); }
  });
  it("worseState('SAFE', 'SAFE') returns 'SAFE'", () => { expect(worseState(S("SAFE"), S("SAFE"))).toBe("SAFE"); });
});

describe("[module4/5] cash-safety promotion gate", () => {
  it("worseState returns the more severe state", () => {
    expect(worseState(S("SAFE"), S("CRITICAL"))).toBe("CRITICAL");
    expect(worseState(S("AT_RISK"), S("WATCH"))).toBe("AT_RISK");
  });

  it("growth is blocked at AT_RISK or worse, allowed when safe", () => {
    expect(evaluateCashSafetyGate("SAFE", "SAFE", RecommendationSensitivity.GROWTH_SENSITIVE).allowed).toBe(true);
    expect(evaluateCashSafetyGate("WATCH", "SAFE", RecommendationSensitivity.GROWTH_SENSITIVE).allowed).toBe(true);
    expect(evaluateCashSafetyGate("AT_RISK", "SAFE", RecommendationSensitivity.GROWTH_SENSITIVE).allowed).toBe(false);
    expect(evaluateCashSafetyGate("SAFE", "CRITICAL", RecommendationSensitivity.GROWTH_SENSITIVE).outcome).toBe(CashSafetyOutcome.BLOCKED_CASH_UNSAFE);
  });

  it("finance/pricing/hiring blocked at CRITICAL or worse, allowed at AT_RISK", () => {
    for (const s of [RecommendationSensitivity.FINANCE_SENSITIVE, RecommendationSensitivity.PRICING_SENSITIVE, RecommendationSensitivity.HIRING_SENSITIVE]) {
      expect(evaluateCashSafetyGate("AT_RISK", "AT_RISK", s).allowed).toBe(true);
      expect(evaluateCashSafetyGate("CRITICAL", "SAFE", s).allowed).toBe(false);
      expect(evaluateCashSafetyGate("SAFE", "INSOLVENT_RISK", s).allowed).toBe(false);
    }
  });

  it("general actions blocked only at insolvent risk", () => {
    expect(evaluateCashSafetyGate("CRITICAL", "CRITICAL", RecommendationSensitivity.GENERAL).allowed).toBe(true);
    expect(evaluateCashSafetyGate("INSOLVENT_RISK", "SAFE", RecommendationSensitivity.GENERAL).allowed).toBe(false);
  });

  it("compliance is cash-irrelevant here and passes", () => {
    expect(evaluateCashSafetyGate("INSOLVENT_RISK", "INSOLVENT_RISK", RecommendationSensitivity.COMPLIANCE_SENSITIVE).allowed).toBe(true);
  });

  it("the guard throws/passes with the effective state", () => {
    expect(() => assertCashSafetyForPromotion("SAFE", "SAFE", RecommendationSensitivity.GROWTH_SENSITIVE, "rec-1")).not.toThrow();
    try {
      assertCashSafetyForPromotion("SAFE", "CRITICAL", RecommendationSensitivity.GROWTH_SENSITIVE, "rec-1");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(CashSafetyGateError);
      expect((e as CashSafetyGateError).effectiveState).toBe("CRITICAL");
    }
  });
});
