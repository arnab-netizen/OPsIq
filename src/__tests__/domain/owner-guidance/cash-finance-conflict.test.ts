/**
 * Home same-business conflict arbitration — a real human usability test reproduced: same
 * business, an older AT_RISK cash-survival reading sitting alongside a newer SAFE finance
 * diagnosis, with Home presenting the stale AT_RISK reading as current truth. This proves the
 * fix: resolveCashFinanceSignal() never presents a superseded stale reading as current, and
 * fails safe (marks the situation explicitly conflicting) when freshness cannot be established.
 */
import { describe, it, expect } from "vitest";
import { resolveCashFinanceSignal } from "@/domain/owner-guidance/cash-finance-conflict";

const day = (n: number) => new Date(2026, 0, n);

describe("resolveCashFinanceSignal", () => {
  it("both agree SAFE: effective SAFE, no conflict", () => {
    const r = resolveCashFinanceSignal(
      { state: "SAFE", generatedAt: day(1) },
      { state: "SAFE", generatedAt: day(2) }
    );
    expect(r).toEqual({ effectiveState: "SAFE", safe: true, conflicting: false, supersededSource: null, supersededState: null });
  });

  it("both agree unsafe: effective state is the more severe of the two", () => {
    const r = resolveCashFinanceSignal(
      { state: "CRITICAL", generatedAt: day(1) },
      { state: "AT_RISK", generatedAt: day(2) }
    );
    expect(r.effectiveState).toBe("CRITICAL");
    expect(r.safe).toBe(false);
    expect(r.conflicting).toBe(false);
  });

  it("reproduces the human-test bug: older AT_RISK cash + newer SAFE finance -> Home must use the newer SAFE reading, not present the stale AT_RISK as current truth", () => {
    const r = resolveCashFinanceSignal(
      { state: "AT_RISK", generatedAt: day(1) }, // older
      { state: "SAFE", generatedAt: day(10) } // newer
    );
    expect(r.effectiveState).toBe("SAFE");
    expect(r.safe).toBe(true);
    expect(r.conflicting).toBe(false);
    expect(r.supersededSource).toBe("cash");
    expect(r.supersededState).toBe("AT_RISK");
  });

  it("newer cash reading is unsafe, superseding an older SAFE finance diagnosis: uses the newer (unsafe) reading — things got worse", () => {
    const r = resolveCashFinanceSignal(
      { state: "CRITICAL", generatedAt: day(10) }, // newer
      { state: "SAFE", generatedAt: day(1) } // older
    );
    expect(r.effectiveState).toBe("CRITICAL");
    expect(r.safe).toBe(false);
    expect(r.supersededSource).toBe("finance");
    expect(r.supersededState).toBe("SAFE");
  });

  it("disagreement with no timestamps at all: genuinely incomparable, fails safe as conflicting", () => {
    const r = resolveCashFinanceSignal(
      { state: "AT_RISK", generatedAt: null },
      { state: "SAFE", generatedAt: null }
    );
    expect(r).toEqual({ effectiveState: null, safe: false, conflicting: true, supersededSource: null, supersededState: null });
  });

  it("disagreement with only one side's timestamp known: genuinely incomparable, fails safe", () => {
    const r = resolveCashFinanceSignal(
      { state: "AT_RISK", generatedAt: day(1) },
      { state: "SAFE", generatedAt: null }
    );
    expect(r.conflicting).toBe(true);
    expect(r.safe).toBe(false);
  });

  it("disagreement with identical timestamps: genuinely incomparable, fails safe", () => {
    const r = resolveCashFinanceSignal(
      { state: "AT_RISK", generatedAt: day(5) },
      { state: "SAFE", generatedAt: day(5) }
    );
    expect(r.conflicting).toBe(true);
  });

  it("only cash present: uses it directly, no conflict", () => {
    const r = resolveCashFinanceSignal({ state: "CRITICAL", generatedAt: day(1) }, { state: null, generatedAt: null });
    expect(r).toEqual({ effectiveState: "CRITICAL", safe: false, conflicting: false, supersededSource: null, supersededState: null });
  });

  it("only finance present: uses it directly, no conflict", () => {
    const r = resolveCashFinanceSignal({ state: null, generatedAt: null }, { state: "SAFE", generatedAt: day(1) });
    expect(r).toEqual({ effectiveState: "SAFE", safe: true, conflicting: false, supersededSource: null, supersededState: null });
  });

  it("neither present: null, not conflicting (nothing to compare)", () => {
    const r = resolveCashFinanceSignal({ state: null, generatedAt: null }, { state: null, generatedAt: null });
    expect(r).toEqual({ effectiveState: null, safe: false, conflicting: false, supersededSource: null, supersededState: null });
  });

  it("WATCH counts as a safe state on both sides of a disagreement", () => {
    const r = resolveCashFinanceSignal(
      { state: "AT_RISK", generatedAt: day(1) },
      { state: "WATCH", generatedAt: day(10) }
    );
    expect(r.effectiveState).toBe("WATCH");
    expect(r.safe).toBe(true);
  });
});
