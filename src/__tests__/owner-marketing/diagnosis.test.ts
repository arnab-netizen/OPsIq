/**
 * Owner Marketing & Growth (Module 6 Slice 2) — detector + diagnosis tests.
 * Pure/no DB. Covers risk findings (wasted spend / poor conversion / weak offer /
 * wrong channel / low referral / no follow-up / missing data / invalid currency),
 * opportunity findings (scale winner / lift conversion / activate referrals /
 * build organic / add follow-up / data quality), deterministic ranking, the
 * marketing DomainScore, no-fabrication-on-missing, and spine schema validity.
 */
import { describe, it, expect } from "vitest";
import {
  diagnoseMarketingSnapshot,
  buildMarketingRiskFindings,
  buildMarketingOpportunityFindings,
  computeMarketingMetrics,
  resolveMarketingThresholds,
  rankMarketingFindings,
  type MarketingSnapshotInput,
} from "@/domain/owner-marketing";
import { ownerFindingSchema, domainScoreSchema } from "@/domain/owner-spine/contracts";

function healthy(): MarketingSnapshotInput {
  return {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    currency: "INR",
    marketingSpend: 50000,
    revenue: 200000,
    leads: 500,
    inquiries: 300,
    orders: 100,
    newCustomers: 90,
    paidLeads: 200,
    organicLeads: 300,
    campaignsRun: 5,
    campaignsWithFollowup: 5,
    contentPosted: 20,
    couponsRedeemed: 10,
    referrals: 18,
    walkIns: 40,
  };
}

/** Wasting: negative ROI, near-zero conversion, weak offer, paid-reliant, no follow-up, no referrals. */
function wasting(): MarketingSnapshotInput {
  return {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    currency: "INR",
    marketingSpend: 100000,
    revenue: 30000, // ROI -70% (critical)
    leads: 200,
    inquiries: 150,
    orders: 4, // 2% lead conversion (critical), inquiry ~2.7% (weak offer)
    newCustomers: 4,
    paidLeads: 180,
    organicLeads: 20, // 10% organic (wrong channel mix)
    campaignsRun: 10,
    campaignsWithFollowup: 2, // 20% follow-up (critical)
    contentPosted: 2,
    couponsRedeemed: 1,
    referrals: 0, // 0% referral
    walkIns: 5,
  };
}

const codes = (fs: { code: string }[]) => fs.map((f) => f.code);

function diagnose(input: MarketingSnapshotInput) {
  return diagnoseMarketingSnapshot(input, { now: new Date("2026-06-05") });
}

describe("owner-marketing detector — risk findings", () => {
  it("wasting triggers the marketing risk cluster", () => {
    const r = diagnose(wasting());
    const c = codes(r.riskFindings);
    expect(c).toEqual(
      expect.arrayContaining([
        "MKT_WASTED_SPEND",
        "MKT_POOR_CONVERSION",
        "MKT_WEAK_OFFER",
        "MKT_WRONG_CHANNEL_MIX",
        "MKT_LOW_REFERRAL",
        "MKT_NO_FOLLOWUP",
      ])
    );
    const roi = r.riskFindings.find((f) => f.code === "MKT_WASTED_SPEND");
    expect(roi?.severity).toBe("critical"); // ROI -70% < critical 0
  });

  it("healthy marketing emits no marketing risk findings", () => {
    const r = diagnose(healthy());
    const c = codes(r.riskFindings);
    expect(c).not.toContain("MKT_WASTED_SPEND");
    expect(c).not.toContain("MKT_POOR_CONVERSION");
    expect(c).not.toContain("MKT_NO_FOLLOWUP");
    expect(c).not.toContain("MKT_WRONG_CHANNEL_MIX");
  });

  it("flags missing critical data and invalid currency (certain)", () => {
    const input: MarketingSnapshotInput = { periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "" };
    const m = computeMarketingMetrics(input, { now: new Date("2026-06-05") });
    const findings = buildMarketingRiskFindings(input, m, resolveMarketingThresholds());
    const c = codes(findings);
    expect(c).toContain("MKT_INVALID_CURRENCY");
    expect(c).toContain("MKT_MISSING_CRITICAL_DATA");
    const missing = findings.find((f) => f.code === "MKT_MISSING_CRITICAL_DATA");
    expect(missing?.confidence).toBe(1);
    expect(missing?.missingData).toEqual(
      expect.arrayContaining(["marketingSpend", "leads", "orders"])
    );
  });
});

describe("owner-marketing detector — opportunity findings", () => {
  it("emits the improvement cluster under waste", () => {
    const r = diagnose(wasting());
    const c = codes(r.opportunityFindings);
    expect(c).toEqual(
      expect.arrayContaining([
        "MKT_OPP_LIFT_CONVERSION",
        "MKT_OPP_ACTIVATE_REFERRALS",
        "MKT_OPP_BUILD_ORGANIC",
        "MKT_OPP_ADD_FOLLOWUP",
      ])
    );
    // negative ROI → no scale-winner opportunity
    expect(c).not.toContain("MKT_OPP_SCALE_WINNER");
  });

  it("offers scale-winner opportunity when ROI is healthy", () => {
    const r = diagnose(healthy()); // ROI 300% ≥ 200%
    expect(codes(r.opportunityFindings)).toContain("MKT_OPP_SCALE_WINNER");
  });

  it("fabricates no opportunity when supporting inputs are absent", () => {
    const bare: MarketingSnapshotInput = {
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
      currency: "INR",
      marketingSpend: 50000,
      leads: 500,
      orders: 500, // 100% conversion; no revenue/referral/organic/followup inputs
    };
    const m = computeMarketingMetrics(bare, { now: new Date("2026-06-05") });
    const c = codes(buildMarketingOpportunityFindings(bare, m, resolveMarketingThresholds()));
    expect(c).not.toContain("MKT_OPP_SCALE_WINNER"); // ROI not computable
    expect(c).not.toContain("MKT_OPP_LIFT_CONVERSION"); // conversion is 100%
    expect(c).not.toContain("MKT_OPP_ACTIVATE_REFERRALS"); // no referral inputs
    expect(c).not.toContain("MKT_OPP_BUILD_ORGANIC"); // no channel inputs
    expect(c).not.toContain("MKT_OPP_ADD_FOLLOWUP"); // no campaign inputs
  });
});

describe("owner-marketing detector — ranking + domain score", () => {
  it("ranks critical findings ahead of low ones (deterministic + stable)", () => {
    const r = diagnose(wasting());
    const rank = { critical: 4, high: 3, medium: 2, low: 1 } as const;
    for (let i = 1; i < r.findings.length; i++) {
      expect(rank[r.findings[i - 1].severity]).toBeGreaterThanOrEqual(rank[r.findings[i].severity]);
    }
    const again = diagnose(wasting());
    expect(codes(again.findings)).toEqual(codes(r.findings));
  });

  it("produces a valid marketing DomainScore from the engine metrics", () => {
    const r = diagnose(wasting());
    const parsed = domainScoreSchema.parse(r.domainScore);
    expect(parsed.domain).toBe("marketing");
    expect(parsed.riskScore).toBe(r.metrics.marketingRiskScore);
    expect(parsed.healthScore).toBe(r.metrics.marketingHealthScore);
    expect(parsed.opportunityScore).toBe(r.metrics.marketingOpportunityScore);
    expect(parsed.topFindingCodes.length).toBeGreaterThan(0);
  });

  it("every finding satisfies the spine OwnerFinding schema with domain marketing", () => {
    const r = diagnose(wasting());
    for (const f of r.findings) {
      expect(() => ownerFindingSchema.parse(f)).not.toThrow();
      expect(f.domain).toBe("marketing");
    }
  });

  it("rankMarketingFindings does not mutate its input", () => {
    const r = diagnose(wasting());
    const before = codes(r.findings);
    const copy = [...r.findings];
    rankMarketingFindings(r.findings);
    expect(codes(copy)).toEqual(before);
  });
});
