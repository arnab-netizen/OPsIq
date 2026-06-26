import { describe, it, expect } from "vitest";
import { assessGrowthReadiness, assertGrowthReady, GrowthNotReadyError, GrowthReadiness } from "@/domain/execution/growth-readiness";
import { assessScaleReadiness, assertScaleReady, NotScaleReadyError, ScaleReadiness, type ScaleSignals } from "@/domain/execution/scale-readiness";
import { ProgressionMove, type GrowthSignals } from "@/domain/execution/progression-engine";

const cleanGrowth = (over: Partial<GrowthSignals> = {}): GrowthSignals => ({
  cashRunwayWeak: false, grossMarginClear: true, repeatCustomersStrong: true, staffQualityStable: true,
  ownerFirefightingDaily: false, sopManagerLayerWorking: true, complaintsOrReworkRising: false,
  capacityStressed: false, profitImpactVerified: true, revenueGrowing: true, ...over,
});

describe("[module21] growth readiness (delegates to progression engine)", () => {
  it("clean signals -> GROWTH_READY", () => {
    const r = assessGrowthReadiness(cleanGrowth());
    expect(r.readiness).toBe(GrowthReadiness.GROWTH_READY);
    expect(r.allowed).toBe(true);
    expect(r.ownerApprovalRequired).toBe(true);
  });

  it("weak cash -> STABILIZE_FIRST with the engine's reason", () => {
    const r = assessGrowthReadiness(cleanGrowth({ cashRunwayWeak: true }));
    expect(r.readiness).toBe(GrowthReadiness.STABILIZE_FIRST);
    expect(r.blockedReasons).toContain("weak_cash_runway");
  });

  it("guard throws when not growth-ready", () => {
    expect(() => assertGrowthReady(cleanGrowth(), ProgressionMove.MARKETING_SCALE, "act-1")).not.toThrow();
    expect(() => assertGrowthReady(cleanGrowth({ capacityStressed: true }), ProgressionMove.MARKETING_SCALE, "act-1")).toThrow(GrowthNotReadyError);
  });
});

describe("[module22] scale readiness (higher tier on growth)", () => {
  const scaleReady = (over: Partial<ScaleSignals> = {}): ScaleSignals => ({ ...cleanGrowth(), managementLayerInPlace: true, operationsRepeatable: true, ...over });

  it("growth-ready + management layer + repeatable ops -> SCALE_READY", () => {
    const r = assessScaleReadiness(scaleReady());
    expect(r.readiness).toBe(ScaleReadiness.SCALE_READY);
    expect(r.allowed).toBe(true);
    expect(r.growthReady).toBe(true);
  });

  it("growth-ready but no management layer -> NOT_SCALE_READY", () => {
    const r = assessScaleReadiness(scaleReady({ managementLayerInPlace: false }));
    expect(r.allowed).toBe(false);
    expect(r.growthReady).toBe(true);
    expect(r.blockedReasons).toContain("no_management_layer");
  });

  it("not growth-ready -> NOT_SCALE_READY (inherits growth blockers)", () => {
    const r = assessScaleReadiness(scaleReady({ cashRunwayWeak: true }));
    expect(r.allowed).toBe(false);
    expect(r.growthReady).toBe(false);
    expect(r.blockedReasons).toContain("weak_cash_runway");
  });

  it("operations not repeatable -> blocked", () => {
    expect(assessScaleReadiness(scaleReady({ operationsRepeatable: false })).allowed).toBe(false);
  });

  it("guard throws when not scale-ready", () => {
    expect(() => assertScaleReady(scaleReady(), ProgressionMove.SECOND_LOCATION, "act-1")).not.toThrow();
    expect(() => assertScaleReady(scaleReady({ operationsRepeatable: false }), ProgressionMove.SECOND_LOCATION, "act-1")).toThrow(NotScaleReadyError);
  });
});
