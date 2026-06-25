import { describe, it, expect } from "vitest";
import {
  GrowthClassification as G,
  GrowthConfidence,
  ProgressionMove,
  GrowthSignals,
  classifyGrowth,
  evaluateProgressionRecommendation,
} from "@/domain/execution/progression-engine";

// A fully-healthy baseline; tests override one dimension at a time.
const healthy: GrowthSignals = {
  cashRunwayWeak: false,
  grossMarginClear: true,
  marginNegative: false,
  repeatCustomersStrong: true,
  staffQualityStable: true,
  ownerFirefightingDaily: false,
  sopManagerLayerWorking: true,
  complaintsOrReworkRising: false,
  capacityStressed: false,
  profitImpactVerified: true,
  revenueGrowing: true,
};
const s = (o: Partial<GrowthSignals>): GrowthSignals => ({ ...healthy, ...o });

describe("classifyGrowth", () => {
  it("healthy signals → HEALTHY_GROWTH with HIGH confidence", () => {
    const r = classifyGrowth(healthy);
    expect(r.classification).toBe(G.HEALTHY_GROWTH);
    expect(r.confidence).toBe(GrowthConfidence.HIGH);
    expect(r.missingData).toEqual([]);
  });
  it("revenue-only growth is NOT healthy", () => {
    expect(classifyGrowth(s({ grossMarginClear: false })).classification).toBe(G.REVENUE_ONLY_GROWTH);
  });
  it("unverified profit → UNVERIFIED_GROWTH", () => {
    expect(classifyGrowth(s({ profitImpactVerified: false })).classification).toBe(G.UNVERIFIED_GROWTH);
  });
  it("owner firefighting → OWNER_DEPENDENT_GROWTH", () => {
    expect(classifyGrowth(s({ ownerFirefightingDaily: true })).classification).toBe(G.OWNER_DEPENDENT_GROWTH);
  });
  it("missing signals lower confidence and are reported", () => {
    const r = classifyGrowth(s({ unknownSignals: ["margin", "repeat", "staff"] }));
    expect(r.confidence).toBe(GrowthConfidence.LOW);
    expect(r.missingData).toEqual(["margin", "repeat", "staff"]);
  });
});

describe("evaluateProgressionRecommendation — fail-closed gates", () => {
  it("weak cash blocks expansion", () => {
    const d = evaluateProgressionRecommendation(s({ cashRunwayWeak: true }), ProgressionMove.CAPACITY_EXPANSION);
    expect(d.allowed).toBe(false);
    expect(d.blockedReasons).toContain("weak_cash_runway");
  });
  it("unclear margin blocks a marketing-scale recommendation", () => {
    const d = evaluateProgressionRecommendation(s({ grossMarginClear: false }), ProgressionMove.MARKETING_SCALE);
    expect(d.allowed).toBe(false);
    expect(d.blockedReasons).toContain("unclear_gross_margin");
  });
  it("owner-dependent growth blocks a second-location recommendation", () => {
    const d = evaluateProgressionRecommendation(s({ ownerFirefightingDaily: true }), ProgressionMove.SECOND_LOCATION);
    expect(d.allowed).toBe(false);
    expect(d.blockedReasons).toContain("owner_firefighting_daily");
  });
  it("unverified profit blocks expansion", () => {
    const d = evaluateProgressionRecommendation(s({ profitImpactVerified: false }), ProgressionMove.CHANNEL_EXPANSION);
    expect(d.allowed).toBe(false);
    expect(d.blockedReasons).toContain("profit_impact_unverified");
  });
  it("healthy/stable data permits a controlled growth experiment", () => {
    const d = evaluateProgressionRecommendation(healthy, ProgressionMove.CONTROLLED_GROWTH_EXPERIMENT);
    expect(d.allowed).toBe(true);
    expect(d.blockedReasons).toEqual([]);
    expect(d.classification).toBe(G.HEALTHY_GROWTH);
  });
});
