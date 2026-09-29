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

describe("margin-safety-gate — module contract assertions", () => {
  it("evaluateMarginSafety is a function", () => { expect(typeof evaluateMarginSafety).toBe("function"); });
  it("assertMarginSafetyForPromotion is a function", () => { expect(typeof assertMarginSafetyForPromotion).toBe("function"); });
  it("MarginSafetyGateError is a function", () => { expect(typeof MarginSafetyGateError).toBe("function"); });
  it("MarginSafetyOutcome is an object", () => { expect(typeof MarginSafetyOutcome).toBe("object"); });
  it("grossMarginPctFrom is a function", () => { expect(typeof grossMarginPctFrom).toBe("function"); });
  it("RecommendationSensitivity is an object", () => { expect(typeof RecommendationSensitivity).toBe("object"); });
  it("enforceMarginSafetyForPromotion is a function", () => { expect(typeof enforceMarginSafetyForPromotion).toBe("function"); });
  it("evaluateMarginSafety(20, PRICING_SENSITIVE, 15) returns an object", () => { expect(typeof evaluateMarginSafety(20, RecommendationSensitivity.PRICING_SENSITIVE, 15)).toBe("object"); });
  it("evaluateMarginSafety result has allowed field", () => { expect(evaluateMarginSafety(20, RecommendationSensitivity.PRICING_SENSITIVE, 15)).toHaveProperty("allowed"); });
  it("evaluateMarginSafety result has outcome field", () => { expect(evaluateMarginSafety(20, RecommendationSensitivity.PRICING_SENSITIVE, 15)).toHaveProperty("outcome"); });
  it("evaluateMarginSafety(20, PRICING_SENSITIVE, 15).allowed is true", () => { expect(evaluateMarginSafety(20, RecommendationSensitivity.PRICING_SENSITIVE, 15).allowed).toBe(true); });
  it("evaluateMarginSafety(8, PRICING_SENSITIVE, 15).allowed is false", () => { expect(evaluateMarginSafety(8, RecommendationSensitivity.PRICING_SENSITIVE, 15).allowed).toBe(false); });
  it("grossMarginPctFrom(100, 70) equals 30", () => { expect(grossMarginPctFrom(100, 70)).toBe(30); });
  it("MarginSafetyOutcome.BLOCKED_BELOW_FLOOR is defined", () => { expect(MarginSafetyOutcome.BLOCKED_BELOW_FLOOR).toBeDefined(); });
});

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

  it("defers unknown margin to the input-quality gate (does not block here) — the base contract, unchanged", () => {
    const r = evaluateMarginSafety(null, RecommendationSensitivity.PRICING_SENSITIVE, 15);
    expect(r.allowed).toBe(true);
    expect(r.outcome).toBe(MarginSafetyOutcome.ALLOWED);
    expect(r.reason).toBe("Gross margin unknown; deferred to the input-quality gate.");
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

function depsFor(impactArea: string | null, revenue: number | null, costOfGoods: number | null, businessIds: string[] = ["biz-1"]): MarginDeps {
  return {
    marginFloorPct: 15,
    db: {
      recommendation: { findUnique: vi.fn(async () => ({ findingId: "f1" })) },
      finding: { findFirst: vi.fn(async () => ({ impactArea })) },
      ownerBusiness: { findMany: vi.fn(async () => businessIds.map((id) => ({ id }))) },
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

  it("reads the business's CURRENT EFFECTIVE snapshot: business-scoped, unsuperseded, ordered by evidence period", async () => {
    const deps = depsFor("pricing discount policy", 100, 70);
    await enforceMarginSafetyForPromotion("rec1", "ws1", deps);
    const args = (deps.db.ownerFinancialSnapshot.findFirst as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(args.where).toEqual({ workspaceId: "ws1", businessId: "biz-1", supersededById: null, periodEnd: { lte: expect.any(Date) } });
    expect(args.orderBy[0]).toEqual({ periodEnd: "desc" });
  });

  it("one business known SAFE: proceeds; UNSAFE: blocked below the floor", async () => {
    await expect(enforceMarginSafetyForPromotion("rec1", "ws1", depsFor("pricing discount policy", 100, 60))).resolves.toBeUndefined();
    const err = await enforceMarginSafetyForPromotion("rec1", "ws1", depsFor("pricing discount policy", 100, 95)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MarginSafetyGateError);
    expect((err as MarginSafetyGateError).code).toBe("MARGIN_SAFETY_GATE_BLOCKED");
  });

  it("multi-business: margin is not attributable — another business's figures are never read; unknown margin is deferred, never treated as a known-safe reading", async () => {
    const deps = depsFor("pricing discount policy", 100, 95, ["biz-1", "biz-2"]); // one business's figures are below the floor
    await expect(enforceMarginSafetyForPromotion("rec1", "ws1", deps)).resolves.toBeUndefined();
    expect(deps.db.ownerFinancialSnapshot.findFirst).not.toHaveBeenCalled();
  });

  it("the single business has no figures: the query is scoped to it, nothing else is read, and the unknown margin is deferred", async () => {
    const deps = depsFor("pricing discount policy", null, null, ["biz-1"]);
    await expect(enforceMarginSafetyForPromotion("rec1", "ws1", deps)).resolves.toBeUndefined();
    const args = (deps.db.ownerFinancialSnapshot.findFirst as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(args.where).toEqual({ workspaceId: "ws1", businessId: "biz-1", supersededById: null, periodEnd: { lte: expect.any(Date) } });
  });

  it("skips entirely for non-pricing recommendations (no snapshot read)", async () => {
    const deps = depsFor("growth marketing", 100, 99);
    await expect(enforceMarginSafetyForPromotion("rec1", "ws1", deps)).resolves.toBeUndefined();
    expect(deps.db.ownerFinancialSnapshot.findFirst).not.toHaveBeenCalled();
  });
});
