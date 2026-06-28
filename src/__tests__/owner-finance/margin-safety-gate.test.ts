/**
 * Jarvis 360 Slice 2 — margin-safety gate (pure) + enforcement service (DI). No DB.
 */
import { describe, it, expect, vi } from "vitest";
import {
  evaluateMarginSafety,
  assertMarginSafetyForPromotion,
  MarginSafetyGateError,
  MarginSafetyOutcome,
  grossMarginPctFrom,
} from "@/domain/owner-finance/margin-safety-gate";
import { RecommendationSensitivity } from "@/domain/owner-mode/recommendation-input-quality-gate";
import { enforceMarginSafetyForPromotion, type MarginDeps } from "@/services/owner-finance/recommendation-margin-safety.service";

describe("evaluateMarginSafety", () => {
  it("blocks a pricing rec below the margin floor", () => {
    const r = evaluateMarginSafety(8, RecommendationSensitivity.PRICING_SENSITIVE, 15);
    expect(r.allowed).toBe(false);
    expect(r.outcome).toBe(MarginSafetyOutcome.BLOCKED_BELOW_FLOOR);
  });

  it("allows a pricing rec at or above the floor", () => {
    expect(evaluateMarginSafety(20, RecommendationSensitivity.PRICING_SENSITIVE, 15).allowed).toBe(true);
  });

  it("does not gate non-pricing recommendations", () => {
    expect(evaluateMarginSafety(2, RecommendationSensitivity.GENERAL, 15).allowed).toBe(true);
    expect(evaluateMarginSafety(2, RecommendationSensitivity.GROWTH_SENSITIVE, 15).allowed).toBe(true);
  });

  it("defers unknown margin to the input-quality gate (does not block here)", () => {
    expect(evaluateMarginSafety(null, RecommendationSensitivity.PRICING_SENSITIVE, 15).allowed).toBe(true);
  });

  it("assert throws MarginSafetyGateError when below floor", () => {
    expect(() => assertMarginSafetyForPromotion(5, RecommendationSensitivity.PRICING_SENSITIVE, "rec1", 15)).toThrow(MarginSafetyGateError);
  });
});

describe("grossMarginPctFrom", () => {
  it("computes margin and returns null on missing/zero revenue", () => {
    expect(grossMarginPctFrom(100, 70)).toBe(30);
    expect(grossMarginPctFrom(0, 70)).toBeNull();
    expect(grossMarginPctFrom(null, 70)).toBeNull();
  });
});

function depsFor(impactArea: string | null, revenue: number | null, costOfGoods: number | null): MarginDeps {
  return {
    marginFloorPct: 15,
    db: {
      recommendation: { findUnique: vi.fn(async () => ({ findingId: "f1" })) },
      finding: { findUnique: vi.fn(async () => ({ impactArea })) },
      ownerFinancialSnapshot: { findFirst: vi.fn(async () => (revenue === null && costOfGoods === null ? null : { revenue, costOfGoods })) },
    },
  };
}

describe("enforceMarginSafetyForPromotion", () => {
  it("blocks a discount rec when the latest snapshot margin is below floor", async () => {
    const deps = depsFor("pricing discount policy", 100, 92); // 8% margin
    await expect(enforceMarginSafetyForPromotion("rec1", "ws1", deps)).rejects.toBeInstanceOf(MarginSafetyGateError);
  });

  it("allows a discount rec when margin clears the floor", async () => {
    const deps = depsFor("pricing discount policy", 100, 70); // 30% margin
    await expect(enforceMarginSafetyForPromotion("rec1", "ws1", deps)).resolves.toBeUndefined();
  });

  it("skips entirely for non-pricing recommendations (no snapshot read)", async () => {
    const deps = depsFor("growth marketing", 100, 99);
    await expect(enforceMarginSafetyForPromotion("rec1", "ws1", deps)).resolves.toBeUndefined();
    expect(deps.db.ownerFinancialSnapshot.findFirst).not.toHaveBeenCalled();
  });
});
