/**
 * OBQ owner decisions — UNKNOWN is a state, not a number.
 *
 *  1. cash = explicit numeric value | UNKNOWN. Unknown cash never blocks a first read, is never fabricated as 0, makes
 *     cash-dependent conclusions abstain, lowers confidence and is explained to the owner.
 *  2. An unknown cost component is never zero. fixed known + variable UNKNOWN does NOT give total costs, profit or margin.
 *     An explicit 0 is a known value and participates normally.
 */
import { describe, it, expect } from "vitest";
import {
  breakEvenRevenue, calculateDataConfidence, cashDaysOfCosts, cashRunwayDays, computeFinancialMetrics, fixedCostBurdenPct,
  fixedCostsTotal, knownFixedCosts, knownVariableCosts, missingCriticalFinanceInputs, netMarginPct, netProfit, totalCosts,
  variableCostsTotal, type FinancialSnapshotInput,
} from "@/domain/owner-finance";
import { diagnoseFinanceSnapshot } from "@/domain/owner-finance/diagnosis";
import { resolveLiquidity } from "@/domain/owner-finance/liquidity";
import { evaluateFirstReadSufficiency } from "@/domain/owner-finance/first-read-sufficiency";
import { assessQuickEntry } from "@/domain/owner-finance/quick-entry";
import { unsupportedConclusions } from "@/domain/owner-finance/unsupported-conclusions";
import { computeMissingInputsWithPriority } from "@/domain/owner-finance/data-confidence";

const NOW = new Date("2026-10-05T00:00:00Z");
const base = { periodStart: "2026-09-01", periodEnd: "2026-09-30", currency: "INR" } as const;
const snap = (over: Partial<FinancialSnapshotInput>): FinancialSnapshotInput => ({ ...base, revenue: 100000, ...over });
const codes = (i: FinancialSnapshotInput) => diagnoseFinanceSnapshot(i, { now: NOW }).findings.map((f) => f.code);

describe("cash: explicit zero, positive and UNKNOWN are three different evidence states", () => {
  const zero = snap({ fixedCosts: 20000, variableCosts: 10000, cashOnHand: 0, bankBalance: 0 });
  const positive = snap({ fixedCosts: 20000, variableCosts: 10000, cashOnHand: 5000, bankBalance: 0 });
  const unknown = snap({ fixedCosts: 20000, variableCosts: 10000 });

  it("liquidity: zero and positive are COMPLETE facts; unknown is UNKNOWN with no total (never 0)", () => {
    expect(resolveLiquidity(zero)).toMatchObject({ status: "COMPLETE", physicalCash: 0, totalLiquidFunds: 0 });
    expect(resolveLiquidity(positive)).toMatchObject({ status: "COMPLETE", physicalCash: 5000, totalLiquidFunds: 5000 });
    expect(resolveLiquidity(unknown)).toMatchObject({ status: "UNKNOWN", physicalCash: null, totalLiquidFunds: null });
  });

  it("sufficiency: all three allow a first read, but only zero/positive have cashKnown", () => {
    for (const i of [zero, positive, unknown]) expect(missingCriticalFinanceInputs(i)).toEqual([]);
    expect(evaluateFirstReadSufficiency(zero)).toMatchObject({ sufficient: true, cashKnown: true });
    expect(evaluateFirstReadSufficiency(positive)).toMatchObject({ sufficient: true, cashKnown: true });
    expect(evaluateFirstReadSufficiency(unknown)).toMatchObject({ sufficient: true, cashKnown: false, missing: [] });
  });

  it("quick entry: blank cash is absent from the values (not 0); '0' is kept as a real zero", () => {
    expect(assessQuickEntry({ revenue: "1", fixedCosts: "1", cashOnHand: "" }).values).toEqual({ revenue: 1, fixedCosts: 1 });
    expect(assessQuickEntry({ revenue: "1", fixedCosts: "1", cashOnHand: "0" }).values).toEqual({ revenue: 1, fixedCosts: 1, cashOnHand: 0 });
  });

  it("cash-dependent conclusions abstain when unknown and are computed when known (loss-making, so runway applies)", () => {
    const loss = (cash: Partial<FinancialSnapshotInput>) => snap({ revenue: 100000, fixedCosts: 100000, variableCosts: 30000, ...cash });
    expect(cashRunwayDays(loss({}))).toBeNull();
    expect(cashDaysOfCosts(loss({}))).toBeNull();
    expect(cashRunwayDays(loss({ cashOnHand: 0, bankBalance: 0 }))).toBe(0); // a real zero is a real, alarming fact
    expect(cashRunwayDays(loss({ cashOnHand: 30000, bankBalance: 0 }))).toBeGreaterThan(0);
    expect(codes(loss({}))).not.toContain("FIN_INSOLVENT_RUNWAY");
    expect(codes(loss({ cashOnHand: 0, bankBalance: 0 }))).toContain("FIN_INSOLVENT_RUNWAY");
  });

  it("unknown cash is distinguishable from zero in the metrics set and in the diagnosis", () => {
    expect(computeFinancialMetrics(zero, { now: NOW }).liquidityStatus).toBe("COMPLETE");
    expect(computeFinancialMetrics(unknown, { now: NOW }).liquidityStatus).toBe("UNKNOWN");
    expect(codes(unknown)).toContain("FIN_LIQUIDITY_UNCONFIRMED"); // the survival guard keys on this: UNKNOWN is neither safe nor dangerous
    expect(codes(zero)).not.toContain("FIN_LIQUIDITY_UNCONFIRMED");
  });

  it("confidence is reduced while cash is unknown, relative to the same evidence with cash known (zero or positive)", () => {
    const c = (i: FinancialSnapshotInput) => calculateDataConfidence(i, { now: NOW }).dataConfidenceScore;
    expect(c(unknown)).toBeLessThan(c(positive));
    expect(c(unknown)).toBeLessThan(c(zero));
    expect(c(zero)).toBe(c(positive)); // zero is evidence, not a penalty
  });

  it("cash is an IMPORTANT (not critical) missing input", () => {
    const miss = computeMissingInputsWithPriority({ revenue: 1, fixedCosts: 1, cashOnHand: null });
    expect(miss.find((m) => m.field === "Cash in hand")).toMatchObject({ priority: "IMPORTANT" });
    expect(miss.filter((m) => m.priority === "CRITICAL")).toEqual([]);
  });

  it("the owner is told what cannot be concluded, in plain words, without asking for an estimate", () => {
    const u = unsupportedConclusions(unknown);
    const cash = u.find((c) => c.code === "CASH_UNKNOWN")!;
    expect(cash.text).toMatch(/can't say how long your cash will last/);
    expect(cash.text).toMatch(/don't need to estimate/);
    expect(unsupportedConclusions(zero).some((c) => c.code === "CASH_UNKNOWN")).toBe(false);
    expect(unsupportedConclusions(positive).some((c) => c.code === "CASH_UNKNOWN")).toBe(false);
  });
});

describe("costs: an unknown component is never zero", () => {
  const cases: Array<{
    name: string; fixed?: number; variable?: number;
    total: number | null; profit: number | null; margin: number | null;
  }> = [
    { name: "fixed known + variable known", fixed: 20000, variable: 10000, total: 30000, profit: 70000, margin: 70 },
    { name: "fixed known + variable UNKNOWN", fixed: 20000, total: null, profit: null, margin: null },
    { name: "fixed UNKNOWN + variable known", variable: 10000, total: null, profit: null, margin: null },
    { name: "both UNKNOWN", total: null, profit: null, margin: null },
    { name: "explicit fixed 0 + variable known", fixed: 0, variable: 10000, total: 10000, profit: 90000, margin: 90 },
    { name: "explicit fixed 0 + variable UNKNOWN", fixed: 0, total: null, profit: null, margin: null },
    { name: "explicit variable 0 + fixed known", fixed: 20000, variable: 0, total: 20000, profit: 80000, margin: 80 },
    { name: "explicit variable 0 + fixed UNKNOWN", variable: 0, total: null, profit: null, margin: null },
    { name: "explicit 0 and 0", fixed: 0, variable: 0, total: 0, profit: 100000, margin: 100 },
  ];

  it.each(cases)("$name", ({ fixed, variable, total, profit, margin }) => {
    const i = snap({ fixedCosts: fixed, variableCosts: variable, cashOnHand: 1000, bankBalance: 0 });
    expect(totalCosts(i)).toBe(total);
    expect(netProfit(i)).toBe(profit);
    expect(netMarginPct(i)).toBe(margin);
    const m = computeFinancialMetrics(i, { now: NOW });
    expect(m.netProfit).toBe(profit);
    expect(m.netMarginPct).toBe(margin);
    // Anything that needs complete costs follows.
    if (total === null) {
      expect(cashDaysOfCosts(i)).toBeNull();
      expect(cashRunwayDays(i)).toBeNull();
      expect(m.profitPerOrder).toBeNull();
      expect(m.ownerWithdrawalPressurePct).toBeNull();
    }
  });

  it("the owner's example: revenue 100000, fixed 20000, variable UNKNOWN → no total, no profit, no 80% margin", () => {
    const i = snap({ fixedCosts: 20000 });
    expect(knownFixedCosts(i)).toBe(20000);
    expect(knownVariableCosts(i)).toBeNull();
    expect(fixedCostsTotal(i)).toBe(20000);
    expect(variableCostsTotal(i)).toBeNull();
    expect(totalCosts(i)).toBeNull();
    expect(netProfit(i)).toBeNull();
    expect(netMarginPct(i)).toBeNull();
    // A formula that CAN truthfully use the known part still does: fixed cost burden only needs revenue and fixed costs.
    expect(fixedCostBurdenPct(i)).toBe(20);
    // ...but break-even needs the contribution margin (variable costs), so it abstains.
    expect(breakEvenRevenue(i)).toBeNull();
  });

  it("the diagnosis raises no profit/margin conclusion from partial costs, and says what it cannot conclude", () => {
    const i = snap({ fixedCosts: 20000, cashOnHand: 5000, bankBalance: 0 });
    const c = codes(i);
    for (const code of ["FIN_NEGATIVE_NET_MARGIN", "FIN_BELOW_BREAK_EVEN", "FIN_OPP_MARGIN_IMPROVEMENT"]) expect(c).not.toContain(code);
    const u = unsupportedConclusions(i).find((x) => x.code === "COSTS_INCOMPLETE")!;
    expect(u.text).toMatch(/Some cost information is missing \(variable costs\), so OpsIQ cannot calculate total profit or margin yet\./);
  });

  it("a business that is certainly loss-making on its known costs still gets the finding it can truthfully support", () => {
    // Fixed costs alone exceed revenue: the fixed-cost burden finding is supported without inventing total profit.
    const i = snap({ revenue: 100000, fixedCosts: 130000, cashOnHand: 5000, bankBalance: 0 });
    expect(codes(i)).toContain("FIN_HIGH_FIXED_COST_BURDEN");
    expect(netProfit(i)).toBeNull();
  });

  it("itemised lines: a total needs EVERY line known (an explicit 0 counts); a subset is only a known subset", () => {
    const partial = snap({ rent: 10000, salaryPayroll: 20000 }); // utilities unknown
    expect(fixedCostsTotal(partial)).toBeNull();
    expect(knownFixedCosts(partial)).toBe(30000);
    const complete = snap({ rent: 10000, salaryPayroll: 20000, utilities: 0 });
    expect(fixedCostsTotal(complete)).toBe(30000);
    const variablePartial = snap({ costOfGoodsOrServices: 5000 }); // delivery unknown
    expect(variableCostsTotal(variablePartial)).toBeNull();
    expect(variableCostsTotal(snap({ costOfGoodsOrServices: 5000, deliveryFulfilmentCost: 0 }))).toBe(5000);
  });

  it("health is not inflated by partial costs: no margin means the neutral baseline, capped by confidence", () => {
    const partial = computeFinancialMetrics(snap({ fixedCosts: 20000, cashOnHand: 5000, bankBalance: 0 }), { now: NOW });
    expect(partial.netMarginPct).toBeNull();
    expect(partial.survivalState).not.toBe("SAFE");
    expect(partial.financialHealthScore).toBeLessThanOrEqual(Math.floor(50 + partial.dataConfidenceScore / 2));
  });
});
