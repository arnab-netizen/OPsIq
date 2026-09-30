import { describe, expect, it } from "vitest";
import { EMPTY_INPUTS, SAMPLE_INPUTS, calculateProfitCash, parseAmount, priceForTargetMargin } from "./profit-cash";

describe("calculateProfitCash", () => {
  it("reproduces the article example: $4,500 profit, $5,000 shortfall", () => {
    const r = calculateProfitCash(SAMPLE_INPUTS);
    expect(r.operatingProfit).toBe(4500);
    expect(r.liquidity).toBe(-5000);
    expect(r.quadrant).toBe("profitable-squeezed");
    expect(r.marginPercent).toBeCloseTo(16.07, 1);
  });

  it("classifies a healthy profitable business", () => {
    const r = calculateProfitCash({
      revenue: 50000, directCosts: 15000, operatingExpenses: 20000,
      cash: 30000, receivables: 10000, overdueReceivables: 1000, expectedCollections: 9000, billsDue: 20000,
    });
    expect(r.quadrant).toBe("profitable-healthy");
    expect(r.liquidity).toBe(19000);
  });

  it("classifies unprofitable with cash, and unprofitable and squeezed", () => {
    expect(calculateProfitCash({ ...EMPTY_INPUTS, revenue: 10000, directCosts: 6000, operatingExpenses: 7000, cash: 50000, billsDue: 5000 }).quadrant).toBe("unprofitable-healthy");
    expect(calculateProfitCash({ ...EMPTY_INPUTS, revenue: 10000, directCosts: 6000, operatingExpenses: 7000, cash: 1000, billsDue: 9000 }).quadrant).toBe("unprofitable-squeezed");
  });

  it("caps overdue at total owed and notes it", () => {
    const r = calculateProfitCash({ ...EMPTY_INPUTS, receivables: 100, overdueReceivables: 900 });
    expect(r.overdueSharePercent).toBe(100);
    expect(r.notes.join(" ")).toMatch(/capped/);
  });

  it("returns a blank result for empty input and null cover with no bills", () => {
    const r = calculateProfitCash(EMPTY_INPUTS);
    expect(r.isBlank).toBe(true);
    expect(r.coverRatio).toBeNull();
  });
});

describe("parseAmount", () => {
  it("handles blank, valid, negative and junk", () => {
    expect(parseAmount("")).toEqual({ value: 0, invalid: false });
    expect(parseAmount("1250.5")).toEqual({ value: 1250.5, invalid: false });
    expect(parseAmount("-5")).toEqual({ value: 0, invalid: true });
    expect(parseAmount("abc")).toEqual({ value: 0, invalid: true });
  });
});

describe("margin and markup", () => {
  it("computes gross margin and markup from price and cost ($100 price, $60 cost)", () => {
    const r = calculateProfitCash({ ...EMPTY_INPUTS, revenue: 100, directCosts: 60 });
    expect(r.grossProfit).toBe(40);
    expect(r.grossMarginPercent).toBeCloseTo(40, 5);
    expect(r.markupPercent).toBeCloseTo(66.667, 2);
  });
  it("sample gross margin is about 67.9% and markup about 211%", () => {
    const r = calculateProfitCash(SAMPLE_INPUTS);
    expect(r.grossMarginPercent).toBeCloseTo(67.857, 2);
    expect(r.markupPercent).toBeCloseTo(211.11, 1);
  });
  it("markup is null with no direct costs", () => {
    expect(calculateProfitCash({ ...EMPTY_INPUTS, revenue: 100 }).markupPercent).toBeNull();
  });
});

describe("priceForTargetMargin", () => {
  it("$60 cost at 40% margin needs a $100 price", () => {
    expect(priceForTargetMargin(60, 40)).toBeCloseTo(100, 5);
  });
  it("rejects 100% margin and invalid input", () => {
    expect(priceForTargetMargin(60, 100)).toBeNull();
    expect(priceForTargetMargin(-1, 40)).toBeNull();
    expect(priceForTargetMargin(60, -5)).toBeNull();
  });
});
