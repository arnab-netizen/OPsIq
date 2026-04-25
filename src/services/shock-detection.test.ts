import { describe, it, expect } from "vitest";
import { detectShockState } from "./shock-detection";
import type { ShockDetectionInput } from "./shock-detection";

describe("Shock Detection Service", () => {
  describe("deterministic detection", () => {
    it("should detect critical shock from high severity score", async () => {
      const input: ShockDetectionInput = {
        engagementId: "test-engagement",
        conditionProfile: {
          severityScore: 9,
          urgencyLevel: "critical",
          cashPressureLevel: "critical",
          marginPressureLevel: "critical",
          ownerDependencyRisk: "critical",
        },
      };

      const result = await detectShockState(input);
      expect(result.shockDetected).toBe(true);
      expect(result.severity).toBe("critical");
      expect(result.indicators.length).toBeGreaterThan(0);
    });

    it("should return same result for same input (deterministic)", async () => {
      const input: ShockDetectionInput = {
        engagementId: "test-engagement",
        conditionProfile: {
          severityScore: 7,
          urgencyLevel: "high",
          cashPressureLevel: "high",
          marginPressureLevel: "medium",
          ownerDependencyRisk: "high",
        },
      };

      const result1 = await detectShockState(input);
      const result2 = await detectShockState(input);

      expect(result1.shockDetected).toBe(result2.shockDetected);
      expect(result1.severity).toBe(result2.severity);
      expect(result1.indicators).toEqual(result2.indicators);
    });

    it("should not falsely detect shock from low-risk inputs", async () => {
      const input: ShockDetectionInput = {
        engagementId: "test-engagement",
        conditionProfile: {
          severityScore: 2,
          urgencyLevel: "low",
          cashPressureLevel: "low",
          marginPressureLevel: "low",
          ownerDependencyRisk: "low",
        },
      };

      const result = await detectShockState(input);
      expect(result.shockDetected).toBe(false);
      expect(result.severity).toBe("low");
    });

    it("should detect high-severity shock from multiple high indicators", async () => {
      const input: ShockDetectionInput = {
        engagementId: "test-engagement",
        conditionProfile: {
          severityScore: 7,
          urgencyLevel: "high",
          cashPressureLevel: "high",
          marginPressureLevel: "high",
          ownerDependencyRisk: "high",
        },
      };

      const result = await detectShockState(input);
      expect(result.shockDetected).toBe(true);
      expect(result.severity).toBe("high");
    });

    it("should consider critical evidence items", async () => {
      const input: ShockDetectionInput = {
        engagementId: "test-engagement",
        evidenceItems: [
          {
            category: "financial",
            validationStatus: "validated",
            severity: "critical",
          },
          {
            category: "operational",
            validationStatus: "validated",
            severity: "critical",
          },
        ],
        conditionProfile: {
          severityScore: 3,
          urgencyLevel: "medium",
          cashPressureLevel: "medium",
          marginPressureLevel: "low",
          ownerDependencyRisk: "low",
        },
      };

      const result = await detectShockState(input);
      expect(result.shockDetected).toBe(true);
      expect(result.severity).toBe("critical");
      expect(result.indicators.some((i) => i.includes("critical evidence"))).toBe(true);
    });

    it("should not consider unvalidated evidence", async () => {
      const input: ShockDetectionInput = {
        engagementId: "test-engagement",
        evidenceItems: [
          {
            category: "financial",
            validationStatus: "submitted",
            severity: "critical",
          },
        ],
        conditionProfile: {
          severityScore: 2,
          urgencyLevel: "low",
          cashPressureLevel: "low",
          marginPressureLevel: "low",
          ownerDependencyRisk: "low",
        },
      };

      const result = await detectShockState(input);
      expect(result.shockDetected).toBe(false);
    });
  });

  describe("threshold alignment", () => {
    it("should use contract-defined thresholds", async () => {
      // Score 9 = critical
      const critical = await detectShockState({
        engagementId: "test",
        conditionProfile: {
          severityScore: 9,
          urgencyLevel: "low",
          cashPressureLevel: "low",
          marginPressureLevel: "low",
          ownerDependencyRisk: "low",
        },
      });
      expect(critical.severity).toBe("critical");

      // Score 7 = high
      const high = await detectShockState({
        engagementId: "test",
        conditionProfile: {
          severityScore: 7,
          urgencyLevel: "low",
          cashPressureLevel: "low",
          marginPressureLevel: "low",
          ownerDependencyRisk: "low",
        },
      });
      expect(high.severity).toBe("high");

      // Score 4 = medium
      const medium = await detectShockState({
        engagementId: "test",
        conditionProfile: {
          severityScore: 4,
          urgencyLevel: "low",
          cashPressureLevel: "low",
          marginPressureLevel: "low",
          ownerDependencyRisk: "low",
        },
      });
      expect(medium.severity).toBe("medium");

      // Score 0 = low
      const low = await detectShockState({
        engagementId: "test",
        conditionProfile: {
          severityScore: 0,
          urgencyLevel: "low",
          cashPressureLevel: "low",
          marginPressureLevel: "low",
          ownerDependencyRisk: "low",
        },
      });
      expect(low.severity).toBe("low");
    });
  });

  describe("rationale & indicators", () => {
    it("should provide rationale for detection", async () => {
      const result = await detectShockState({
        engagementId: "test",
        conditionProfile: {
          severityScore: 9,
          urgencyLevel: "critical",
          cashPressureLevel: "critical",
          marginPressureLevel: "critical",
          ownerDependencyRisk: "critical",
        },
      });

      expect(result.rationale).toBeDefined();
      expect(result.rationale.length).toBeGreaterThan(0);
    });

    it("should list specific indicators", async () => {
      const result = await detectShockState({
        engagementId: "test",
        conditionProfile: {
          severityScore: 7,
          urgencyLevel: "high",
          cashPressureLevel: "high",
          marginPressureLevel: "medium",
          ownerDependencyRisk: "high",
        },
      });

      expect(result.indicators.length).toBeGreaterThan(0);
      expect(result.indicators.some((i) => i.includes("severity score"))).toBe(true);
      expect(result.indicators.some((i) => i.includes("cash pressure"))).toBe(true);
    });
  });
});
