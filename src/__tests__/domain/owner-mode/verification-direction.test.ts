/**
 * getVerificationDirection() -- own-property-safety and per-finding-context regressions.
 *
 * Root cause this locks in: `VERIFICATION_METRIC_DIRECTION[metricKey] ?? null` is unsafe once
 * `metricKey` is a runtime string not guaranteed to be one of the table's authored keys. Every
 * plain object literal inherits `Object.prototype` members (`constructor`, `toString`, `valueOf`,
 * `hasOwnProperty`, `__proto__`, ...), so `map["constructor"]` resolves to `Object`'s constructor
 * function rather than `undefined` -- and `?? null` does NOT catch this, because a function value
 * is not nullish. The fixed implementation uses an own-property-only lookup (mirroring the
 * established `ownLookup` pattern in `src/lib/audit-label.ts`) plus a runtime type guard, so the
 * function can only ever return `"up"`, `"down"`, or `null`.
 *
 * Also locks in the capacityUtilizationPct exception: this is the one metric key that means
 * opposite things depending on which finding produced the action (OPS_CAPACITY_BOTTLENECK: too
 * high, reduce it, "down"; OPS_OPP_USE_CAPACITY_HEADROOM: too low/spare capacity, raise it, "up"),
 * confirmed by reading both src/domain/owner-operations/risk-rules.ts and opportunity-rules.ts.
 * It is deliberately absent from the flat table and resolved only via the second `findingCode`
 * argument -- never a single global default.
 */
import { describe, it, expect } from "vitest";
import { getVerificationDirection } from "@/domain/owner-mode/verification-direction";

const PROTOTYPE_POLLUTION_KEYS = ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"];

describe("getVerificationDirection", () => {
  it("returns 'up' for a known higher-is-better metric", () => {
    expect(getVerificationDirection("dataConfidenceScore")).toBe("up");
    expect(getVerificationDirection("netMarginPct")).toBe("up");
    expect(getVerificationDirection("leadToSaleConversionPct")).toBe("up");
    expect(getVerificationDirection("sopCoveragePct")).toBe("up");
  });

  it("returns 'down' for a known lower-is-better metric", () => {
    expect(getVerificationDirection("fixedCostBurdenPct")).toBe("down");
    expect(getVerificationDirection("discountLeakagePct")).toBe("down");
    expect(getVerificationDirection("lostCustomerRatePct")).toBe("down");
    expect(getVerificationDirection("delayRatePct")).toBe("down");
  });

  it("returns null for an ordinary unknown metric key", () => {
    expect(getVerificationDirection("someMadeUpMetricNotInTheTable")).toBeNull();
    expect(getVerificationDirection("breakEvenRevenue")).toBeNull();
    expect(getVerificationDirection("currency")).toBeNull();
  });

  it.each(PROTOTYPE_POLLUTION_KEYS)(
    "never resolves the inherited Object.prototype member %j -- returns null, not a function/method",
    (key) => {
      expect(() => getVerificationDirection(key)).not.toThrow();
      const result = getVerificationDirection(key);
      expect(result).toBeNull();
      expect(typeof result).not.toBe("function");
    }
  );

  it("returns null for null, undefined, and empty-string input", () => {
    expect(getVerificationDirection(null)).toBeNull();
    expect(getVerificationDirection(undefined)).toBeNull();
    expect(getVerificationDirection("")).toBeNull();
  });

  describe("capacityUtilizationPct (per-finding direction, not a single global default)", () => {
    it("resolves 'down' for the too-high-utilization risk finding (OPS_CAPACITY_BOTTLENECK)", () => {
      expect(getVerificationDirection("capacityUtilizationPct", "OPS_CAPACITY_BOTTLENECK")).toBe("down");
    });

    it("resolves 'up' for the spare-capacity opportunity finding (OPS_OPP_USE_CAPACITY_HEADROOM)", () => {
      expect(getVerificationDirection("capacityUtilizationPct", "OPS_OPP_USE_CAPACITY_HEADROOM")).toBe("up");
    });

    it("preserves the ambiguity (null) when no finding code is given", () => {
      expect(getVerificationDirection("capacityUtilizationPct")).toBeNull();
      expect(getVerificationDirection("capacityUtilizationPct", null)).toBeNull();
      expect(getVerificationDirection("capacityUtilizationPct", undefined)).toBeNull();
    });

    it("preserves the ambiguity (null) for an unrecognized finding code -- never guesses", () => {
      expect(getVerificationDirection("capacityUtilizationPct", "SOME_OTHER_CODE")).toBeNull();
    });

    it.each(PROTOTYPE_POLLUTION_KEYS)(
      "never resolves an inherited Object.prototype member as the finding code %j",
      (key) => {
        expect(getVerificationDirection("capacityUtilizationPct", key)).toBeNull();
      }
    );

    it("is not present in the flat VERIFICATION_METRIC_DIRECTION table (single global default forbidden)", async () => {
      const { VERIFICATION_METRIC_DIRECTION } = await import("@/domain/owner-mode/verification-direction");
      expect(Object.prototype.hasOwnProperty.call(VERIFICATION_METRIC_DIRECTION, "capacityUtilizationPct")).toBe(false);
    });
  });
});
