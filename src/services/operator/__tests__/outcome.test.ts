import { describe, it, expect } from "vitest";
import {
  calculateOutcomeDelta,
  getDeltaCategory,
  calculateDeviationPercent,
} from "../outcome";

describe("calculateOutcomeDelta - Outcome Delta Engine", () => {
  describe("Correct Delta Calculation", () => {
    it("should calculate positive delta (better than expected)", () => {
      const result = calculateOutcomeDelta(100, 150);
      expect(result.valid).toBe(true);
      expect(result.delta).toBe(50); // 150 - 100
      expect(result.reason).toBeUndefined();
    });

    it("should calculate negative delta (worse than expected)", () => {
      const result = calculateOutcomeDelta(100, 50);
      expect(result.valid).toBe(true);
      expect(result.delta).toBe(-50); // 50 - 100
      expect(result.reason).toBeUndefined();
    });

    it("should calculate zero delta (as expected)", () => {
      const result = calculateOutcomeDelta(100, 100);
      expect(result.valid).toBe(true);
      expect(result.delta).toBe(0); // 100 - 100
      expect(result.reason).toBeUndefined();
    });

    it("should handle large values", () => {
      const result = calculateOutcomeDelta(1000000, 1500000);
      expect(result.valid).toBe(true);
      expect(result.delta).toBe(500000);
    });

    it("should handle small values", () => {
      const result = calculateOutcomeDelta(0.5, 0.7);
      expect(result.valid).toBe(true);
      expect(result.delta).toBe(0.2);
    });

    it("should handle zero expected impact", () => {
      const result = calculateOutcomeDelta(0, 100);
      expect(result.valid).toBe(true);
      expect(result.delta).toBe(100); // 100 - 0
    });

    it("should handle zero actual outcome", () => {
      const result = calculateOutcomeDelta(100, 0);
      expect(result.valid).toBe(true);
      expect(result.delta).toBe(-100); // 0 - 100
    });
  });

  describe("Rounding to 2 Decimals", () => {
    it("should round to 2 decimals for floating point results", () => {
      const result = calculateOutcomeDelta(100, 133.333);
      expect(result.valid).toBe(true);
      expect(result.delta).toBe(33.33); // Rounded from 33.333
    });

    it("should handle rounding up", () => {
      const result = calculateOutcomeDelta(100, 100.456);
      expect(result.valid).toBe(true);
      expect(result.delta).toBe(0.46); // Rounded from 0.456
    });

    it("should handle rounding down", () => {
      const result = calculateOutcomeDelta(100, 100.444);
      expect(result.valid).toBe(true);
      expect(result.delta).toBe(0.44); // Rounded from 0.444
    });

    it("should handle precision edge case", () => {
      const result = calculateOutcomeDelta(0.1, 0.3);
      expect(result.valid).toBe(true);
      expect(result.delta).toBe(0.2);
    });
  });

  describe("Negative Delta Cases", () => {
    it("should handle significantly negative delta", () => {
      const result = calculateOutcomeDelta(1000, 100);
      expect(result.valid).toBe(true);
      expect(result.delta).toBe(-900);
    });

    it("should handle small negative delta", () => {
      const result = calculateOutcomeDelta(100, 99.99);
      expect(result.valid).toBe(true);
      expect(result.delta).toBe(-0.01);
    });

    it("should handle negative actual with positive expected", () => {
      const result = calculateOutcomeDelta(100, -50);
      expect(result.valid).toBe(true);
      expect(result.delta).toBe(-150);
    });

    it("should handle both negative inputs", () => {
      const result = calculateOutcomeDelta(-100, -50);
      expect(result.valid).toBe(true);
      expect(result.delta).toBe(50); // -50 - (-100)
    });
  });

  describe("Null/Undefined Safety", () => {
    it("should handle null expectedImpact", () => {
      const result = calculateOutcomeDelta(null, 100);
      expect(result.valid).toBe(false);
      expect(result.delta).toBeNull();
      expect(result.reason).toBeDefined();
    });

    it("should handle undefined expectedImpact", () => {
      const result = calculateOutcomeDelta(undefined, 100);
      expect(result.valid).toBe(false);
      expect(result.delta).toBeNull();
      expect(result.reason).toBeDefined();
    });

    it("should handle null actualOutcome", () => {
      const result = calculateOutcomeDelta(100, null);
      expect(result.valid).toBe(false);
      expect(result.delta).toBeNull();
      expect(result.reason).toBeDefined();
    });

    it("should handle undefined actualOutcome", () => {
      const result = calculateOutcomeDelta(100, undefined);
      expect(result.valid).toBe(false);
      expect(result.delta).toBeNull();
      expect(result.reason).toBeDefined();
    });

    it("should handle both null", () => {
      const result = calculateOutcomeDelta(null, null);
      expect(result.valid).toBe(false);
      expect(result.delta).toBeNull();
    });
  });

  describe("Invalid Input Handling", () => {
    it("should reject NaN values", () => {
      const result = calculateOutcomeDelta(NaN, 100);
      expect(result.valid).toBe(false);
      expect(result.delta).toBeNull();
    });

    it("should reject Infinity values", () => {
      const result = calculateOutcomeDelta(100, Infinity);
      expect(result.valid).toBe(false);
      expect(result.delta).toBeNull();
    });

    it("should reject negative Infinity", () => {
      const result = calculateOutcomeDelta(-Infinity, 100);
      expect(result.valid).toBe(false);
      expect(result.delta).toBeNull();
    });
  });

  describe("Deterministic Behavior", () => {
    it("should produce same result for same inputs", () => {
      const result1 = calculateOutcomeDelta(100, 150);
      const result2 = calculateOutcomeDelta(100, 150);
      const result3 = calculateOutcomeDelta(100, 150);

      expect(result1.delta).toBe(result2.delta);
      expect(result2.delta).toBe(result3.delta);
      expect(result1.delta).toBe(50);
    });

    it("should be deterministic with floating point", () => {
      const result1 = calculateOutcomeDelta(100.5, 150.7);
      const result2 = calculateOutcomeDelta(100.5, 150.7);

      expect(result1.delta).toBe(result2.delta);
      expect(result1.delta).toBe(50.2);
    });
  });
});

describe("getDeltaCategory", () => {
  it("should categorize positive delta as better_than_expected", () => {
    expect(getDeltaCategory(50)).toBe("better_than_expected");
    expect(getDeltaCategory(0.1)).toBe("better_than_expected");
  });

  it("should categorize negative delta as worse_than_expected", () => {
    expect(getDeltaCategory(-50)).toBe("worse_than_expected");
    expect(getDeltaCategory(-0.1)).toBe("worse_than_expected");
  });

  it("should categorize zero delta as as_expected", () => {
    expect(getDeltaCategory(0)).toBe("as_expected");
  });

  it("should categorize small positive delta as as_expected", () => {
    expect(getDeltaCategory(0.005)).toBe("as_expected"); // Within 0.01 tolerance
  });

  it("should categorize small negative delta as as_expected", () => {
    expect(getDeltaCategory(-0.005)).toBe("as_expected");
  });

  it("should categorize null as unknown", () => {
    expect(getDeltaCategory(null)).toBe("unknown");
  });
});

describe("calculateDeviationPercent", () => {
  it("should calculate deviation percentage", () => {
    const result = calculateDeviationPercent(100, 50);
    expect(result).toBe(50); // 50% of 100
  });

  it("should handle negative deltas", () => {
    const result = calculateDeviationPercent(100, -50);
    expect(result).toBe(-50); // -50% of 100
  });

  it("should return null for zero expected impact", () => {
    const result = calculateDeviationPercent(0, 100);
    expect(result).toBeNull();
  });

  it("should round to 2 decimals", () => {
    const result = calculateDeviationPercent(100, 33.333);
    expect(result).toBe(33.33); // Rounded from 33.333%
  });

  it("should handle small percentages", () => {
    const result = calculateDeviationPercent(1000, 5);
    expect(result).toBe(0.5); // 0.5%
  });
});
