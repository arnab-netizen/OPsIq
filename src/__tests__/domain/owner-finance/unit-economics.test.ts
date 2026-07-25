import { describe, it, expect } from "vitest";
import {
  totalDirectCost,
  contributionMargin,
  contributionMarginPct,
  profitPerLabourHour,
  profitPerMachineHour,
  profitPerDeliveryKm,
  isLossMaking,
  minimumViablePrice,
  marginFloorPrice,
  assessDiscountSafety,
  compareSegmentProfitability,
  summarizeSegment,
  type OrderEconomicsInput,
} from "@/domain/owner-finance/unit-economics";

const order = (over: Partial<OrderEconomicsInput> = {}): OrderEconomicsInput => ({
  revenue: 1000, labourCost: 200, materialCost: 150, deliveryCost: 50, ...over,
});

describe("[module6] unit economics — module contract assertions", () => {
  it("totalDirectCost is a function", () => { expect(typeof totalDirectCost).toBe("function"); });
  it("contributionMargin is a function", () => { expect(typeof contributionMargin).toBe("function"); });
  it("contributionMarginPct is a function", () => { expect(typeof contributionMarginPct).toBe("function"); });
  it("profitPerLabourHour is a function", () => { expect(typeof profitPerLabourHour).toBe("function"); });
  it("isLossMaking is a function", () => { expect(typeof isLossMaking).toBe("function"); });
  it("minimumViablePrice is a function", () => { expect(typeof minimumViablePrice).toBe("function"); });
  it("assessDiscountSafety is a function", () => { expect(typeof assessDiscountSafety).toBe("function"); });
  it("compareSegmentProfitability is a function", () => { expect(typeof compareSegmentProfitability).toBe("function"); });
  it("summarizeSegment is a function", () => { expect(typeof summarizeSegment).toBe("function"); });
  it("order is a function", () => { expect(typeof order).toBe("function"); });
  it("order() returns an object with revenue field", () => { expect(order()).toHaveProperty("revenue"); });
  it("order().revenue is 1000 by default", () => { expect(order().revenue).toBe(1000); });
  it("totalDirectCost(order()) is 400", () => { expect(totalDirectCost(order())).toBe(400); });
  it("isLossMaking(order()) is false", () => { expect(isLossMaking(order())).toBe(false); });
});

describe("[module6] unit economics — per-unit profit", () => {
  it("computes direct cost, contribution margin and pct", () => {
    const o = order();
    expect(totalDirectCost(o)).toBe(400);
    expect(contributionMargin(o)).toBe(600);
    expect(contributionMarginPct(o)).toBeCloseTo(0.6, 5);
  });

  it("profit-per-resource returns null when the resource is unused", () => {
    const o = order();
    expect(profitPerLabourHour(o, { labourHours: 4 })).toBeCloseTo(150, 5);
    expect(profitPerMachineHour(o, { machineHours: 2 })).toBeCloseTo(300, 5);
    expect(profitPerDeliveryKm(o, { deliveryKm: 10 })).toBeCloseTo(60, 5);
    expect(profitPerLabourHour(o, {})).toBeNull();
    expect(profitPerMachineHour(o, {})).toBeNull();
    expect(profitPerDeliveryKm(o, {})).toBeNull();
  });

  it("detects loss-making orders (negative contribution margin)", () => {
    expect(isLossMaking(order({ revenue: 300 }))).toBe(true); // cost 400 > revenue 300
    expect(isLossMaking(order())).toBe(false);
  });

  it("computes minimum viable price / margin floor for a target margin", () => {
    // direct cost 400, target 60% -> price 1000
    expect(minimumViablePrice(400, 0.6)).toBeCloseTo(1000, 5);
    expect(marginFloorPrice(400, 0.5)).toBeCloseTo(800, 5);
    // target 0 -> price equals cost
    expect(minimumViablePrice(400, 0)).toBe(400);
  });

  it("flags a discount below the margin floor as unsafe", () => {
    const safe = assessDiscountSafety(400, 1000, 0.5);
    expect(safe.safe).toBe(true);
    const unsafe = assessDiscountSafety(400, 600, 0.5); // floor 800
    expect(unsafe.safe).toBe(false);
    expect(unsafe.floorPrice).toBeCloseTo(800, 5);
  });

  it("compares B2B vs retail by contribution-margin pct", () => {
    const retail = summarizeSegment("retail", [order({ revenue: 1000 })]); // 60%
    const b2b = summarizeSegment("b2b", [order({ revenue: 5000, labourCost: 1500, materialCost: 1500, deliveryCost: 1000 })]); // (5000-4000)/5000 = 20%
    const cmp = compareSegmentProfitability(b2b, retail);
    expect(cmp.higherMarginSegment).toBe("retail");
    expect(cmp.bothProfitable).toBe(true);
    expect(cmp.marginGapPct).toBeCloseTo(0.4, 5);
  });

  it("summarizeSegment aggregates orders and handles zero revenue", () => {
    const s = summarizeSegment("retail", [order({ revenue: 1000 }), order({ revenue: 500, labourCost: 100, materialCost: 100, deliveryCost: 50 })]);
    expect(s.contributionMargin).toBe(600 + 250);
    const empty = summarizeSegment("x", []);
    expect(empty.contributionMarginPct).toBe(0);
  });
});
