/**
 * Owner Marketing & Growth (Module 6 Slice 1) — deterministic metrics engine
 * tests. Pure/no DB. Covers cost-per-lead/order, campaign ROI, lead/inquiry
 * conversion, referral rate, organic share, campaign follow-up, composite scores,
 * marketing-state escalation, data-confidence, industry-template adaptability,
 * currency validation, null-on-missing, bounded scores, and input non-mutation.
 */
import { describe, it, expect } from "vitest";
import {
  computeMarketingMetrics,
  isValidCurrency,
  num,
  resolveMarketingThresholds,
  costPerLead,
  costPerOrder,
  campaignRoiPct,
  leadConversionPct,
  referralRatePct,
  organicSharePct,
  campaignFollowupRatePct,
  type MarketingSnapshotInput,
  MARKETING_STATES,
} from "@/domain/owner-marketing";

/** A compounding marketing month in INR (May 2026). */
function healthy(): MarketingSnapshotInput {
  return {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    currency: "INR",
    businessModel: "service",
    marketingSpend: 50000,
    revenue: 200000, // ROI 300%
    leads: 500,
    inquiries: 300,
    orders: 100, // 20% lead conversion
    newCustomers: 90,
    paidLeads: 200,
    organicLeads: 300, // 60% organic
    campaignsRun: 5,
    campaignsWithFollowup: 5, // 100% follow-up
    contentPosted: 20,
    couponsRedeemed: 10,
    referrals: 18, // 20% referral
    walkIns: 40,
  };
}

/** A wasting marketing month: negative ROI, almost no conversion, no follow-up. */
function wasting(): MarketingSnapshotInput {
  return {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    currency: "INR",
    businessModel: "service",
    marketingSpend: 100000,
    revenue: 30000, // ROI -70% (critical)
    leads: 200,
    inquiries: 150,
    orders: 4, // 2% lead conversion (critical)
    newCustomers: 4,
    paidLeads: 180,
    organicLeads: 20, // 10% organic (paid-reliant)
    campaignsRun: 10,
    campaignsWithFollowup: 2, // 20% follow-up (critical)
    contentPosted: 2,
    couponsRedeemed: 1,
    referrals: 0, // 0% referral
    walkIns: 5,
  };
}

describe("owner-marketing/metrics — module contract assertions", () => {
  it("computeMarketingMetrics is a function", () => { expect(typeof computeMarketingMetrics).toBe("function"); });
  it("isValidCurrency is a function", () => { expect(typeof isValidCurrency).toBe("function"); });
  it("num is a function", () => { expect(typeof num).toBe("function"); });
  it("resolveMarketingThresholds is a function", () => { expect(typeof resolveMarketingThresholds).toBe("function"); });
  it("costPerLead is a function", () => { expect(typeof costPerLead).toBe("function"); });
  it("costPerOrder is a function", () => { expect(typeof costPerOrder).toBe("function"); });
  it("campaignRoiPct is a function", () => { expect(typeof campaignRoiPct).toBe("function"); });
  it("leadConversionPct is a function", () => { expect(typeof leadConversionPct).toBe("function"); });
  it("referralRatePct is a function", () => { expect(typeof referralRatePct).toBe("function"); });
  it("organicSharePct is a function", () => { expect(typeof organicSharePct).toBe("function"); });
  it("campaignFollowupRatePct is a function", () => { expect(typeof campaignFollowupRatePct).toBe("function"); });
  it("MARKETING_STATES is an array", () => { expect(Array.isArray(MARKETING_STATES)).toBe(true); });
  it("healthy is a function", () => { expect(typeof healthy).toBe("function"); });
  it("wasting is a function", () => { expect(typeof wasting).toBe("function"); });
});

describe("Owner Marketing engine — spend + conversion metrics", () => {
  it("computes cost-per-lead / cost-per-order / ROI from real inputs", () => {
    const i = healthy();
    expect(costPerLead(i)).toBe(100);
    expect(costPerOrder(i)).toBe(500);
    expect(campaignRoiPct(i)).toBe(300);
  });

  it("computes conversion / referral / organic / follow-up metrics", () => {
    const i = healthy();
    expect(leadConversionPct(i)).toBe(20);
    expect(referralRatePct(i)).toBe(20);
    expect(organicSharePct(i)).toBe(60);
    expect(campaignFollowupRatePct(i)).toBe(100);
  });

  it("ROI can be negative (wasted spend is not hidden)", () => {
    expect(campaignRoiPct(wasting())).toBe(-70);
  });

  it("returns null (never invents) when denominators are missing or zero", () => {
    expect(costPerLead({ periodStart: "", periodEnd: "", currency: "INR" })).toBeNull();
    expect(campaignRoiPct({ periodStart: "", periodEnd: "", currency: "INR", marketingSpend: 0, revenue: 5 })).toBeNull();
    expect(leadConversionPct({ periodStart: "", periodEnd: "", currency: "INR", leads: 0, orders: 3 })).toBeNull();
    expect(organicSharePct({ periodStart: "", periodEnd: "", currency: "INR", paidLeads: 0, organicLeads: 0 })).toBeNull();
  });

  it("clamps share/conversion metrics into [0,100]", () => {
    const m = computeMarketingMetrics({ ...healthy(), orders: 900 }); // 180% lead conversion
    expect(m.leadConversionPct).toBe(100); // clamped
  });
});

describe("Owner Marketing engine — composite scores", () => {
  it("a compounding month scores healthy, low risk", () => {
    const m = computeMarketingMetrics(healthy());
    expect(m.marketingHealthScore).toBeGreaterThanOrEqual(60);
    expect(m.marketingRiskScore).toBeLessThanOrEqual(15);
    expect(m.marketingState).toBe("COMPOUNDING");
    expect(m.marketingTier).toBe("optimization");
  });

  it("a wasting month scores low health, high risk, WASTING state", () => {
    const m = computeMarketingMetrics(wasting());
    expect(m.marketingRiskScore).toBeGreaterThanOrEqual(70);
    expect(m.marketingHealthScore).toBeLessThanOrEqual(40);
    expect(m.marketingState).toBe("WASTING");
    expect(m.marketingTier).toBe("rescue");
  });

  it("all composite scores stay within [0,100]", () => {
    for (const input of [healthy(), wasting(), { periodStart: "", periodEnd: "", currency: "INR" }]) {
      const m = computeMarketingMetrics(input);
      for (const s of [m.marketingHealthScore, m.marketingRiskScore, m.marketingOpportunityScore, m.dataConfidenceScore]) {
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(100);
      }
      expect(MARKETING_STATES).toContain(m.marketingState);
    }
  });

  it("surfaces recoverable opportunity when conversion + referral have headroom", () => {
    const m = computeMarketingMetrics(wasting());
    expect(m.marketingOpportunityScore).toBeGreaterThan(0);
  });
});

describe("Owner Marketing engine — marketing-state ladder", () => {
  it("escalates to LEAKING on a single critical signal without a paired critical", () => {
    const m = computeMarketingMetrics({
      ...healthy(),
      marketingSpend: 100000,
      revenue: 50000, // ROI -50% → criticalRoi
      orders: 100, // keeps lead conversion healthy (not critical)
      campaignsWithFollowup: 5, // follow-up still 100%
    });
    expect(m.marketingState).toBe("LEAKING");
  });

  it("flags FLAT on soft signals (low ROI, not critical)", () => {
    const m = computeMarketingMetrics({
      ...healthy(),
      marketingSpend: 100000,
      revenue: 130000, // ROI 30% → low (< 50), not critical (>= 0)
    });
    expect(m.marketingState).toBe("FLAT");
  });
});

describe("Owner Marketing engine — data confidence + missing inputs", () => {
  it("full inputs give high confidence and no missing-critical", () => {
    const m = computeMarketingMetrics(healthy());
    expect(m.dataConfidenceScore).toBeGreaterThanOrEqual(85);
    expect(m.missingRequiredInputs).toEqual([]);
  });

  it("missing critical inputs are listed and lower confidence", () => {
    const m = computeMarketingMetrics({ periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR" });
    expect(m.missingRequiredInputs).toContain("marketingSpend");
    expect(m.missingRequiredInputs).toContain("leads");
    expect(m.missingRequiredInputs).toContain("orders");
    expect(m.dataConfidenceScore).toBeLessThan(50);
  });

  it("marks a stale snapshot down when now is provided", () => {
    const fresh = computeMarketingMetrics(healthy(), { now: new Date("2026-06-05") });
    const stale = computeMarketingMetrics(healthy(), { now: new Date("2026-09-01") });
    expect(stale.dataConfidenceScore).toBeLessThan(fresh.dataConfidenceScore);
  });
});

describe("Owner Marketing engine — thresholds, currency, purity", () => {
  it("applies industry-template overrides with a generic fallback", () => {
    const generic = resolveMarketingThresholds();
    const laundry = resolveMarketingThresholds("laundry_local_service");
    const unknown = resolveMarketingThresholds("does_not_exist");
    expect(laundry.lowReferralRatePct).toBeGreaterThan(generic.lowReferralRatePct);
    expect(unknown).toEqual(generic);
  });

  it("validates currency codes (fail closed)", () => {
    expect(isValidCurrency("INR")).toBe(true);
    expect(isValidCurrency("")).toBe(false);
    expect(isValidCurrency("12")).toBe(false);
    expect(num(Infinity)).toBeNull();
    expect(num(5)).toBe(5);
  });

  it("does not mutate the input snapshot", () => {
    const input = healthy();
    const copy = JSON.parse(JSON.stringify(input));
    computeMarketingMetrics(input);
    expect(input).toEqual(copy);
  });
});
