import { describe, it, expect } from "vitest";
import {
  complaintRate,
  estimateLtv,
  classifyCustomer,
  assessCustomerProfitability,
  rollupBySegment,
  rankByProfitability,
  type CustomerProfitInput,
} from "@/domain/execution/customer-profitability";

const C = (over: Partial<CustomerProfitInput> = {}): CustomerProfitInput => ({
  customerId: "c1", segment: "retail", revenue: 1000, directCost: 600, orders: 10, complaints: 1, ...over,
});

describe("[module17] customer profitability", () => {
  it("complaint rate = complaints / orders (0 when no orders)", () => {
    expect(complaintRate(C({ orders: 10, complaints: 2 }))).toBeCloseTo(0.2, 5);
    expect(complaintRate(C({ orders: 0, complaints: 3 }))).toBe(0);
  });

  it("LTV = avg monthly margin x lifespan (falls back to revenue-cost)", () => {
    expect(estimateLtv(C({ avgMonthlyMargin: 400, expectedLifespanMonths: 12 }))).toBe(4800);
    expect(estimateLtv(C({ revenue: 1000, directCost: 600, expectedLifespanMonths: 3 }))).toBe(1200);
  });

  it("classifies by contribution margin pct", () => {
    expect(classifyCustomer(-0.1)).toBe("LOSS_MAKING");
    expect(classifyCustomer(0.1)).toBe("MARGINAL");
    expect(classifyCustomer(0.4)).toBe("PROFITABLE");
  });

  it("assesses a customer incl high-maintenance flag", () => {
    const a = assessCustomerProfitability(C({ revenue: 1000, directCost: 600, orders: 10, complaints: 3 }));
    expect(a.contributionMargin).toBe(400);
    expect(a.contributionMarginPct).toBeCloseTo(0.4, 5);
    expect(a.classification).toBe("PROFITABLE");
    expect(a.highMaintenance).toBe(true); // 0.3 >= 0.2
  });

  it("loss-making customer flagged", () => {
    expect(assessCustomerProfitability(C({ revenue: 500, directCost: 700 })).classification).toBe("LOSS_MAKING");
  });

  it("rolls up by segment with loss-making counts", () => {
    const roll = rollupBySegment([
      C({ customerId: "c1", segment: "b2b", revenue: 5000, directCost: 4000 }),
      C({ customerId: "c2", segment: "b2b", revenue: 1000, directCost: 1200 }),
      C({ customerId: "c3", segment: "retail", revenue: 1000, directCost: 600 }),
    ]);
    const b2b = roll.find((r) => r.segment === "b2b")!;
    expect(b2b.customerCount).toBe(2);
    expect(b2b.lossMakingCount).toBe(1);
    expect(b2b.totalContributionMargin).toBe(800); // 1000 + (-200)
  });

  it("ranks customers by contribution margin desc", () => {
    const ranked = rankByProfitability([
      C({ customerId: "low", revenue: 1000, directCost: 900 }),
      C({ customerId: "high", revenue: 2000, directCost: 500 }),
    ]);
    expect(ranked[0].customerId).toBe("high");
  });
});
