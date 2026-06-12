/**
 * Owner Sales (Module 3 Slice 1) — deterministic metrics engine tests.
 * Pure/no DB. Covers funnel conversion, retention/churn, per-unit + per-day,
 * segment mix, leakage ratios, composite scores, sales-state escalation,
 * data-confidence, industry-template adaptability, currency validation,
 * null-on-missing, bounded scores, and input non-mutation.
 */
import { describe, it, expect } from "vitest";
import {
  computeSalesMetrics,
  isValidCurrency,
  num,
  resolveSalesThresholds,
  leadToSaleConversionPct,
  repeatRatePct,
  lostCustomerRatePct,
  averageOrderValue,
  b2bSharePct,
  complaintToSaleRatioPct,
  type SalesSnapshotInput,
  SALES_STATES,
} from "@/domain/owner-sales";

/** Healthy sales month in INR (May 2026, 31 days). */
function healthy(): SalesSnapshotInput {
  return {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    currency: "INR",
    businessModel: "service",
    leads: 1000,
    qualifiedLeads: 600,
    orders: 350, // 35% conversion (> healthy 30)
    revenue: 700000,
    newCustomers: 150,
    repeatCustomers: 200, // 200/350 = 57% repeat (> healthy 50)
    lostCustomers: 20,
    complaints: 5,
    discountAmount: 20000,
    refundAmount: 5000,
    b2bRevenue: 200000,
    b2cRevenue: 500000,
    b2bPipelineValue: 600000,
    staffCount: 5,
  };
}

const stateRank = (s: string) => SALES_STATES.indexOf(s as never);

describe("owner-sales — safe numeric + currency", () => {
  it("num() fails closed on missing/NaN/Infinity", () => {
    expect(num(5)).toBe(5);
    expect(num(0)).toBe(0);
    expect(num(undefined)).toBeNull();
    expect(num(null)).toBeNull();
    expect(num(Number.NaN)).toBeNull();
    expect(num(Number.POSITIVE_INFINITY)).toBeNull();
  });
  it("validates currency (alpha 3–8), rejects empty/numeric", () => {
    expect(isValidCurrency("INR")).toBe(true);
    expect(isValidCurrency("")).toBe(false);
    expect(isValidCurrency("12")).toBe(false);
    expect(isValidCurrency("TOOLONGCODE")).toBe(false);
    expect(computeSalesMetrics({ ...healthy(), currency: "" }).currencyValid).toBe(false);
    expect(computeSalesMetrics(healthy()).currencyValid).toBe(true);
  });
});

describe("owner-sales — funnel + customer metrics", () => {
  it("lead→sale conversion = orders / leads", () => {
    expect(leadToSaleConversionPct(healthy())).toBe(35);
    expect(leadToSaleConversionPct({ ...healthy(), leads: 0 })).toBeNull();
    expect(leadToSaleConversionPct({ ...healthy(), leads: undefined })).toBeNull();
  });
  it("repeat rate = repeat / (new + repeat)", () => {
    expect(repeatRatePct(healthy())).toBe(57.1); // 200/350
    expect(
      repeatRatePct({ ...healthy(), newCustomers: undefined, repeatCustomers: undefined })
    ).toBeNull();
  });
  it("lost-customer rate = lost / (active + lost)", () => {
    expect(lostCustomerRatePct({ ...healthy(), newCustomers: 40, repeatCustomers: 60, lostCustomers: 25 })).toBe(20); // 25/125
    expect(lostCustomerRatePct({ ...healthy(), lostCustomers: undefined })).toBeNull();
  });
  it("AOV derives from revenue/orders, falls back to direct", () => {
    expect(averageOrderValue(healthy())).toBe(2000); // 700000/350
    expect(
      averageOrderValue({ ...healthy(), revenue: undefined, orders: undefined, averageOrderValue: 1500 })
    ).toBe(1500);
  });
});

describe("owner-sales — segment mix + leakage", () => {
  it("b2b share from b2b/(b2b+b2c)", () => {
    expect(b2bSharePct(healthy())).toBe(28.6); // 200000/700000
    expect(b2bSharePct({ ...healthy(), b2bRevenue: undefined, b2cRevenue: undefined, revenue: undefined })).toBeNull();
  });
  it("complaint-to-sale ratio = complaints / orders", () => {
    expect(complaintToSaleRatioPct({ ...healthy(), complaints: 35, orders: 350 })).toBe(10);
    expect(complaintToSaleRatioPct({ ...healthy(), orders: 0 })).toBeNull();
  });
});

describe("owner-sales — composite scores bounded + honest", () => {
  it("healthy business is STRONG with bounded scores", () => {
    const m = computeSalesMetrics(healthy());
    expect(m.salesState).toBe("STRONG");
    for (const v of [m.salesHealthScore, m.salesRiskScore, m.salesOpportunityScore, m.dataConfidenceScore]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
      expect(Number.isInteger(v)).toBe(true);
    }
    expect(m.salesHealthScore).toBeGreaterThan(60);
    expect(m.salesRiskScore).toBe(0);
  });
});

describe("owner-sales — state escalation", () => {
  it("CRITICAL when conversion + churn both collapse", () => {
    const m = computeSalesMetrics({
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
      currency: "INR",
      leads: 1000,
      orders: 30, // 3% conversion (< critical 5)
      revenue: 60000,
      newCustomers: 10,
      repeatCustomers: 5,
      lostCustomers: 20, // 20/35 = 57% lost (> critical 35)
    });
    expect(m.salesState).toBe("CRITICAL");
    expect(m.salesTier).toBe("rescue");
    expect(m.salesRiskScore).toBeGreaterThan(40);
  });
  it("SOFT on a single soft signal (high discount dependence)", () => {
    const m = computeSalesMetrics({
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
      currency: "INR",
      leads: 1000,
      orders: 350, // 35% conversion (healthy)
      revenue: 700000,
      newCustomers: 150,
      repeatCustomers: 200, // strong repeat
      lostCustomers: 10,
      discountAmount: 200000, // 28% discount dependence (> 15)
    });
    expect(m.salesState).toBe("SOFT");
  });
  it("states escalate monotonically across the fixtures", () => {
    const strong = stateRank(computeSalesMetrics(healthy()).salesState);
    const soft = stateRank(
      computeSalesMetrics({
        periodStart: "2026-05-01",
        periodEnd: "2026-05-31",
        currency: "INR",
        leads: 1000,
        orders: 350,
        revenue: 700000,
        newCustomers: 150,
        repeatCustomers: 200,
        lostCustomers: 10,
        discountAmount: 200000,
      }).salesState
    );
    expect(soft).toBeGreaterThan(strong); // SOFT(2) > STRONG(0)
  });
});

describe("owner-sales — data confidence + missing data honesty", () => {
  it("lists missing critical inputs and drops confidence", () => {
    const m = computeSalesMetrics({
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
      currency: "INR",
    });
    expect(m.missingRequiredInputs).toEqual(
      expect.arrayContaining(["orders", "customers", "leadsOrRevenue"])
    );
    expect(m.dataConfidenceScore).toBeLessThan(50);
    expect(m.salesState).toBe("SOFT"); // not enough data to assert strength
    expect(m.leadToSaleConversionPct).toBeNull();
    expect(m.repeatRatePct).toBeNull();
  });
  it("marks stale snapshots down when now is provided", () => {
    const fresh = computeSalesMetrics(healthy(), { now: new Date("2026-06-05") });
    const stale = computeSalesMetrics(healthy(), { now: new Date("2026-09-01") });
    expect(stale.dataConfidenceScore).toBeLessThan(fresh.dataConfidenceScore);
  });
});

describe("owner-sales — industry-template adaptability", () => {
  it("laundry template raises the repeat-rate bar (retention-driven)", () => {
    const generic = resolveSalesThresholds();
    const laundry = resolveSalesThresholds("laundry_local_service");
    expect(laundry.weakRepeatRatePct).toBeGreaterThan(generic.weakRepeatRatePct);
    expect(laundry.healthyRepeatRatePct).toBeGreaterThan(generic.healthyRepeatRatePct);
  });
  it("unknown template falls back to generic defaults", () => {
    expect(resolveSalesThresholds("does_not_exist")).toEqual(resolveSalesThresholds());
  });
});

describe("owner-sales — purity", () => {
  it("does not mutate its input", () => {
    const input = healthy();
    const snapshot = JSON.parse(JSON.stringify(input));
    computeSalesMetrics(input, { now: new Date("2026-06-10") });
    expect(input).toEqual(snapshot);
  });
});
