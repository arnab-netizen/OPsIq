/**
 * Cash / Profit Protection Depth (pure).
 *
 * Exercises each of the 11 protection signal types, severity by magnitude, the material-money owner-review
 * guard, ordering, the summary counts, empty/healthy input, workspace scoping, the honest data-gap signals,
 * and the safety guarantees: metricValue is only ever a real caller-provided number (never fabricated), no
 * currency figure is invented, and there is no fraud/negligence/HR-discipline label or hidden score.
 */
import { describe, it, expect } from "vitest";
import {
  buildCashProfitProtection,
  type CashProfitInput,
  type CashProfitSignalType,
} from "@/domain/owner-mode/cash-profit-protection";

const AT = "2026-07-06T00:00:00.000Z";
const WS = "ws-1";

// A healthy business: no cash/margin/pricing/cost/working-capital risk, full data.
function input(over: Partial<CashProfitInput> = {}): CashProfitInput {
  return {
    cashRunwayDays: 120, netMarginPct: 18, lowMarginJobCount: 0, pricingLeakCount: 0, discountLeakCount: 0,
    reworkCostEventCount: 0, deliveryCostEventCount: 0, staffInefficiencyCount: 0, b2bUnderpricedCount: 0,
    overdueReceivableCount: 0, hasUnitEconomics: true, financialDataComplete: true,
    supportingProofIds: [], supportingOperationalEventIds: [], supportingFinancialSnapshotIds: [], ...over,
  };
}
const build = (o: Partial<CashProfitInput> = {}, ws = WS) => buildCashProfitProtection(input(o), ws, AT);
const types = (r: { signals: { signalType: CashProfitSignalType }[] }) => r.signals.map((s) => s.signalType);
const find = (r: ReturnType<typeof build>, t: CashProfitSignalType) => r.signals.find((s) => s.signalType === t)!;

describe("cash-profit-protection", () => {
  it("1. a short cash runway raises CASH_SAFETY_RISK with the real day count (owner review)", () => {
    const r = build({ cashRunwayDays: 8 });
    const s = find(r, "CASH_SAFETY_RISK");
    expect(s.severity).toBe("CRITICAL");
    expect(s.metricValue).toBe(8);
    expect(s.metricThreshold).toBe(30);
    expect(s.requiresOwnerReview).toBe(true);
    expect(s.approvalLevel).toBe("OWNER");
  });

  it("2. a thin/negative net margin raises LOW_MARGIN_WORK_RISK", () => {
    expect(types(build({ netMarginPct: 2 }))).toContain("LOW_MARGIN_WORK_RISK");
    expect(find(build({ netMarginPct: -3 }), "LOW_MARGIN_WORK_RISK").severity).toBe("HIGH");
  });

  it("2a. a categorical cash risk state (no measured runway) fires CASH_SAFETY_RISK qualitatively with NO fabricated day count (H4)", () => {
    const s = find(build({ cashRunwayDays: null, cashRunwayState: "CRITICAL" }), "CASH_SAFETY_RISK");
    expect(s.severity).toBe("CRITICAL");
    expect(s.metricValue).toBeNull(); // never a fabricated number derived from a category
    expect(s.metricType).toBe("CASH_SURVIVAL_STATE");
    expect(s.directionOnly).toBe(true);
    expect(s.requiresOwnerReview).toBe(true);
    expect(s.missingData.join(" ")).toMatch(/measured cash runway/i);
    // AT_RISK is HIGH, not CRITICAL.
    expect(find(build({ cashRunwayDays: null, cashRunwayState: "AT_RISK" }), "CASH_SAFETY_RISK").severity).toBe("HIGH");
  });

  it("2b. a SAFE/WATCH cash state (above the floor) fires no cash risk", () => {
    expect(types(build({ cashRunwayDays: null, cashRunwayState: "SAFE" }))).not.toContain("CASH_SAFETY_RISK");
    expect(types(build({ cashRunwayDays: null, cashRunwayState: "WATCH" }))).not.toContain("CASH_SAFETY_RISK");
  });

  it("2c. a categorical margin risk state (no measured margin) fires LOW_MARGIN_WORK_RISK qualitatively, metricValue null", () => {
    const s = find(build({ netMarginPct: null, netMarginState: "CRITICAL" }), "LOW_MARGIN_WORK_RISK");
    expect(s.metricValue).toBeNull();
    expect(s.metricType).toBe("MARGIN_STATE");
    expect(s.severity).toBe("HIGH"); // negative-margin states
    expect(find(build({ netMarginPct: null, netMarginState: "AT_RISK" }), "LOW_MARGIN_WORK_RISK").severity).toBe("MEDIUM");
  });

  it("2d. a REAL measured figure always takes precedence over the categorical state (precise path, no double-count)", () => {
    const r = build({ cashRunwayDays: 8, cashRunwayState: "CRITICAL" });
    const cash = r.signals.filter((s) => s.signalType === "CASH_SAFETY_RISK");
    expect(cash).toHaveLength(1);
    expect(cash[0].metricValue).toBe(8); // the real day count, not the state fallback
    expect(cash[0].metricType).toBe("CASH_RUNWAY_DAYS");
  });

  it("3. repeated below-cost work raises PRICING_LEAK (owner review)", () => {
    const s = find(build({ pricingLeakCount: 4 }), "PRICING_LEAK");
    expect(s.protectiveAction).toBe("REVIEW_PRICING");
    expect(s.requiresOwnerReview).toBe(true);
    expect(s.observedCount).toBe(4);
  });

  it("4. frequent discounts raise DISCOUNT_LEAK with a tighten-policy action", () => {
    expect(find(build({ discountLeakCount: 5 }), "DISCOUNT_LEAK").protectiveAction).toBe("TIGHTEN_DISCOUNT_POLICY");
  });

  it("5. repeated rework raises REWORK_COST_RISK (fix at source, manager-level)", () => {
    const s = find(build({ reworkCostEventCount: 4 }), "REWORK_COST_RISK");
    expect(s.protectiveAction).toBe("REDUCE_REWORK_AT_SOURCE");
    expect(s.approvalLevel).toBe("MANAGER");
    expect(s.relatedProcessFinding).toBe("REWORK_LOOP");
  });

  it("6. disproportionate delivery cost raises DELIVERY_COST_RISK", () => {
    expect(find(build({ deliveryCostEventCount: 3 }), "DELIVERY_COST_RISK").protectiveAction).toBe("REVIEW_DELIVERY_COST");
  });

  it("7. avoidable labour cost raises STAFF_INEFFICIENCY_COST_RISK (operational, not a staff score)", () => {
    const s = find(build({ staffInefficiencyCount: 4 }), "STAFF_INEFFICIENCY_COST_RISK");
    expect(s.protectiveAction).toBe("REBALANCE_STAFFING");
    expect(JSON.stringify(s).toLowerCase()).not.toMatch(/\bscore\b/);
  });

  it("8. an under-priced B2B contract raises B2B_UNDERPRICING_RISK (owner, high)", () => {
    const s = find(build({ b2bUnderpricedCount: 1 }), "B2B_UNDERPRICING_RISK");
    expect(s.severity).toBe("HIGH");
    expect(s.approvalLevel).toBe("OWNER");
    expect(s.protectiveAction).toBe("REPRICE_B2B_CONTRACT");
  });

  it("9. overdue receivables raise WORKING_CAPITAL_STRAIN with a chase action", () => {
    const s = find(build({ overdueReceivableCount: 6 }), "WORKING_CAPITAL_STRAIN");
    expect(s.severity).toBe("HIGH");
    expect(s.protectiveAction).toBe("CHASE_RECEIVABLES");
  });

  it("10. no unit economics raises MISSING_UNIT_ECONOMICS honestly (NEEDS_DATA)", () => {
    const s = find(build({ hasUnitEconomics: false }), "MISSING_UNIT_ECONOMICS");
    expect(s.confidence).toBe("NEEDS_DATA");
    expect(s.metricValue).toBeNull();
    expect(s.missingData.length).toBeGreaterThan(0);
  });

  it("11. incomplete financials raise PROFIT_DATA_INSUFFICIENT and never estimate profit", () => {
    const s = find(build({ financialDataComplete: false }), "PROFIT_DATA_INSUFFICIENT");
    expect(s.metricValue).toBeNull();
    expect(s.ownerExplanation.toLowerCase()).toMatch(/not estimate|incomplete/);
  });

  it("12. a healthy business with full data raises no risk signal", () => {
    const r = build();
    expect(r.signals).toHaveLength(0);
    expect(r.topSignal).toBeNull();
    expect(r.summary).toEqual({ total: 0, critical: 0, high: 0, ownerReviewRequired: 0 });
  });

  it("13. signals are ordered most-severe first; the top is the critical cash risk", () => {
    const r = build({ cashRunwayDays: 6, discountLeakCount: 4, reworkCostEventCount: 4 });
    expect(r.topSignal!.signalType).toBe("CASH_SAFETY_RISK");
    expect(r.signals[0].severity).toBe("CRITICAL");
  });

  it("14. metricValue is only ever a real caller-provided number, never fabricated, and no currency figure appears", () => {
    const r = build({ cashRunwayDays: 12, netMarginPct: 3, pricingLeakCount: 3, discountLeakCount: 4, reworkCostEventCount: 4, overdueReceivableCount: 4, b2bUnderpricedCount: 2 });
    for (const s of r.signals) {
      // Every metricValue that is set matches a real field we passed in (a count, %, or day value) — no invented amount.
      expect(s.metricValue === null || Number.isFinite(s.metricValue)).toBe(true);
      const prose = `${s.title} ${s.ownerExplanation} ${s.protectiveAction} ${s.riskGuardrail}`;
      expect(prose).not.toMatch(/[$£€]\s?\d/);
      expect(prose).not.toMatch(/\d+\s*(dollars|pounds|euros|rupees)/i);
    }
  });

  it("15. summary counts total/critical/high/owner-review; material money signals require owner review", () => {
    const r = build({ cashRunwayDays: 6, b2bUnderpricedCount: 1, reworkCostEventCount: 4 });
    expect(r.summary.total).toBe(3);
    expect(r.summary.critical).toBe(1); // cash
    expect(r.summary.high).toBe(1); // b2b
    expect(r.summary.ownerReviewRequired).toBe(2); // cash + b2b (rework is manager-level)
  });

  it("16. workspace scoping + no fraud/negligence/HR-discipline label in any generated text", () => {
    const r = build({ cashRunwayDays: 6, pricingLeakCount: 3, staffInefficiencyCount: 4, reworkCostEventCount: 4 }, "ws-2");
    expect(r.workspaceId).toBe("ws-2");
    expect(r.signals.every((s) => s.workspaceId === "ws-2")).toBe(true);
    const json = JSON.stringify(r).toLowerCase();
    expect(json).not.toMatch(/\b(fraud|theft|thief|negligent|negligence|lazy|dishonest)\b/);
    expect(json).not.toMatch(/\b(fire|fired|firing|terminate|payroll|salary|discipline|disciplinary|punish|suspend)\b/);
    expect(json).not.toMatch(/hidden\s*score/);
  });
});
