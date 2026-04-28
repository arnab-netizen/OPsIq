import { describe, it, expect } from "vitest";
import {
  calculateDecisionAccuracy,
  getAccuracyCategory,
} from "../accuracy";

describe("calculateDecisionAccuracy - Decision Accuracy Engine", () => {
  describe("Correct Accuracy Calculation", () => {
    it("should calculate accuracy as 1.0 (actual equals expected)", () => {
      const result = calculateDecisionAccuracy(100, 100);
      expect(result.valid).toBe(true);
      expect(result.accuracy).toBe(1.0);
      expect(result.error).toBe(0);
    });

    it("should calculate accuracy > 1.0 (overperforming)", () => {
      const result = calculateDecisionAccuracy(100, 150);
      expect(result.valid).toBe(true);
      expect(result.accuracy).toBe(1.5); // 150 / 100
      expect(result.error).toBe(50); // 150 - 100
    });

    it("should calculate accuracy < 1.0 (underperforming)", () => {
      const result = calculateDecisionAccuracy(100, 50);
      expect(result.valid).toBe(true);
      expect(result.accuracy).toBe(0.5); // 50 / 100
      expect(result.error).toBe(-50); // 50 - 100
    });

    it("should handle large values", () => {
      const result = calculateDecisionAccuracy(1000000, 1500000);
      expect(result.valid).toBe(true);
      expect(result.accuracy).toBe(1.5);
      expect(result.error).toBe(500000);
    });

    it("should handle small values", () => {
      const result = calculateDecisionAccuracy(0.5, 0.7);
      expect(result.valid).toBe(true);
      expect(result.accuracy).toBe(1.4); // 0.7 / 0.5
      expect(result.error).toBe(0.2); // 0.7 - 0.5
    });

    it("should handle fractional accuracy", () => {
      const result = calculateDecisionAccuracy(3, 1);
      expect(result.valid).toBe(true);
      expect(result.accuracy).toBe(0.3333); // 1 / 3, rounded to 4 decimals
      expect(result.error).toBe(-2);
    });
  });

  describe("Accuracy with Zero or Negative Expected", () => {
    it("should return null accuracy when expected impact is zero", () => {
      const result = calculateDecisionAccuracy(0, 100);
      expect(result.valid).toBe(true);
      expect(result.accuracy).toBeNull(); // Cannot divide by zero
      expect(result.error).toBe(100); // 100 - 0
    });

    it("should handle zero actual with zero expected", () => {
      const result = calculateDecisionAccuracy(0, 0);
      expect(result.valid).toBe(true);
      expect(result.accuracy).toBeNull();
      expect(result.error).toBe(0);
    });

    it("should return null accuracy when expected is zero but actual is not", () => {
      const result = calculateDecisionAccuracy(0, 50);
      expect(result.valid).toBe(true);
      expect(result.accuracy).toBeNull();
      expect(result.error).toBe(50);
    });
  });

  describe("Rounding Accuracy to 4 Decimals", () => {
    it("should round accuracy to 4 decimals", () => {
      const result = calculateDecisionAccuracy(3, 1);
      expect(result.valid).toBe(true);
      expect(result.accuracy).toBe(0.3333); // rounded from 0.33333...
    });

    it("should round error to 2 decimals", () => {
      const result = calculateDecisionAccuracy(100, 133.333);
      expect(result.valid).toBe(true);
      expect(result.error).toBe(33.33); // rounded from 33.333
      expect(result.accuracy).toBe(1.3333); // 133.333 / 100
    });

    it("should handle rounding up for accuracy", () => {
      const result = calculateDecisionAccuracy(7, 1);
      expect(result.valid).toBe(true);
      expect(result.accuracy).toBe(0.1429); // 1 / 7 rounded to 4 decimals
    });
  });

  describe("Negative Impact Cases", () => {
    it("should handle negative expected with positive actual", () => {
      const result = calculateDecisionAccuracy(-100, 50);
      expect(result.valid).toBe(true);
      expect(result.accuracy).toBe(-0.5); // 50 / -100
      expect(result.error).toBe(150); // 50 - (-100)
    });

    it("should handle both negative", () => {
      const result = calculateDecisionAccuracy(-100, -50);
      expect(result.valid).toBe(true);
      expect(result.accuracy).toBe(0.5); // -50 / -100
      expect(result.error).toBe(50); // -50 - (-100)
    });

    it("should handle negative expected with zero actual", () => {
      const result = calculateDecisionAccuracy(-100, 0);
      expect(result.valid).toBe(true);
      expect(result.accuracy).toBe(0); // 0 / -100
      expect(result.error).toBe(100); // 0 - (-100)
    });
  });

  describe("Null/Undefined Safety", () => {
    it("should handle null expectedImpact", () => {
      const result = calculateDecisionAccuracy(null, 100);
      expect(result.valid).toBe(false);
      expect(result.accuracy).toBeNull();
      expect(result.error).toBeNull();
      expect(result.reason).toBeDefined();
    });

    it("should handle undefined expectedImpact", () => {
      const result = calculateDecisionAccuracy(undefined, 100);
      expect(result.valid).toBe(false);
      expect(result.accuracy).toBeNull();
      expect(result.error).toBeNull();
      expect(result.reason).toBeDefined();
    });

    it("should handle null actualOutcome", () => {
      const result = calculateDecisionAccuracy(100, null);
      expect(result.valid).toBe(false);
      expect(result.accuracy).toBeNull();
      expect(result.error).toBeNull();
      expect(result.reason).toBeDefined();
    });

    it("should handle undefined actualOutcome", () => {
      const result = calculateDecisionAccuracy(100, undefined);
      expect(result.valid).toBe(false);
      expect(result.accuracy).toBeNull();
      expect(result.error).toBeNull();
      expect(result.reason).toBeDefined();
    });

    it("should handle both null", () => {
      const result = calculateDecisionAccuracy(null, null);
      expect(result.valid).toBe(false);
      expect(result.accuracy).toBeNull();
      expect(result.error).toBeNull();
    });
  });

  describe("Invalid Input Handling", () => {
    it("should reject NaN expectedImpact", () => {
      const result = calculateDecisionAccuracy(NaN, 100);
      expect(result.valid).toBe(false);
      expect(result.accuracy).toBeNull();
      expect(result.error).toBeNull();
    });

    it("should reject Infinity in expectedImpact", () => {
      const result = calculateDecisionAccuracy(Infinity, 100);
      expect(result.valid).toBe(false);
      expect(result.accuracy).toBeNull();
      expect(result.error).toBeNull();
    });

    it("should reject negative Infinity in actualOutcome", () => {
      const result = calculateDecisionAccuracy(100, -Infinity);
      expect(result.valid).toBe(false);
      expect(result.accuracy).toBeNull();
      expect(result.error).toBeNull();
    });
  });

  describe("Deterministic Behavior", () => {
    it("should produce same result for same inputs", () => {
      const result1 = calculateDecisionAccuracy(100, 150);
      const result2 = calculateDecisionAccuracy(100, 150);
      const result3 = calculateDecisionAccuracy(100, 150);

      expect(result1.accuracy).toBe(result2.accuracy);
      expect(result2.accuracy).toBe(result3.accuracy);
      expect(result1.accuracy).toBe(1.5);
    });

    it("should be deterministic with floating point", () => {
      const result1 = calculateDecisionAccuracy(100.5, 150.7);
      const result2 = calculateDecisionAccuracy(100.5, 150.7);

      expect(result1.accuracy).toBe(result2.accuracy);
      expect(result1.error).toBe(result2.error);
      expect(result1.accuracy).toBe(1.4995); // 150.7 / 100.5
      expect(result1.error).toBe(50.2);
    });
  });
});

describe("getAccuracyCategory", () => {
  it("should categorize 1.0 as on_track", () => {
    expect(getAccuracyCategory(1.0)).toBe("on_track");
  });

  it("should categorize 0.95 as on_track", () => {
    expect(getAccuracyCategory(0.95)).toBe("on_track");
  });

  it("should categorize 1.05 as on_track", () => {
    expect(getAccuracyCategory(1.05)).toBe("on_track");
  });

  it("should categorize 1.1 as on_track (boundary)", () => {
    expect(getAccuracyCategory(1.1)).toBe("on_track");
  });

  it("should categorize 0.9 as on_track (boundary)", () => {
    expect(getAccuracyCategory(0.9)).toBe("on_track");
  });

  it("should categorize < 0.9 as underperforming", () => {
    expect(getAccuracyCategory(0.5)).toBe("underperforming");
    expect(getAccuracyCategory(0.89)).toBe("underperforming");
  });

  it("should categorize > 1.1 as overperforming", () => {
    expect(getAccuracyCategory(1.5)).toBe("overperforming");
    expect(getAccuracyCategory(1.11)).toBe("overperforming");
  });

  it("should categorize null as unknown", () => {
    expect(getAccuracyCategory(null)).toBe("unknown");
  });

  it("should categorize 0.0 as underperforming", () => {
    expect(getAccuracyCategory(0.0)).toBe("underperforming");
  });

  it("should categorize 2.0 as overperforming", () => {
    expect(getAccuracyCategory(2.0)).toBe("overperforming");
  });
});
