import { describe, it, expect } from "vitest";

/**
 * P2A UNIT TESTS: EXPECTATION FIELD VALIDATION
 *
 * Tests validateExpectationFields() function
 * - All fields present ✓
 * - Missing why_now ✗
 * - Missing cost_of_inaction ✗
 * - Missing expected_metric ✗
 * - Invalid expected_direction ✗
 * - Missing expected_target ✗
 */

export interface ExpectationValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateExpectationFields(input: {
  why_now?: string;
  cost_of_inaction?: string;
  expected_metric?: string;
  expected_direction?: string;
  expected_target?: string;
}): ExpectationValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Allowed metrics whitelist
  const ALLOWED_METRICS = [
    "approval_rate",
    "processing_time",
    "customer_satisfaction",
    "error_rate",
    "throughput",
    "latency",
    "uptime",
    "cost_reduction",
  ];

  // Validate why_now
  if (!input.why_now) {
    errors.push("why_now is required");
  } else if (typeof input.why_now !== "string") {
    errors.push("why_now must be a string");
  } else if (input.why_now.length < 10) {
    errors.push("why_now must be at least 10 characters");
  } else if (input.why_now.length > 500) {
    errors.push("why_now must be at most 500 characters");
  }

  // Validate cost_of_inaction
  if (!input.cost_of_inaction) {
    errors.push("cost_of_inaction is required");
  } else if (typeof input.cost_of_inaction !== "string") {
    errors.push("cost_of_inaction must be a string");
  } else if (input.cost_of_inaction.length < 10) {
    errors.push("cost_of_inaction must be at least 10 characters");
  } else if (input.cost_of_inaction.length > 500) {
    errors.push("cost_of_inaction must be at most 500 characters");
  }

  // Validate expected_metric
  if (!input.expected_metric) {
    errors.push("expected_metric is required");
  } else if (typeof input.expected_metric !== "string") {
    errors.push("expected_metric must be a string");
  } else if (!ALLOWED_METRICS.includes(input.expected_metric)) {
    errors.push(
      `expected_metric must be one of: ${ALLOWED_METRICS.join(", ")}`
    );
  }

  // Validate expected_direction
  if (!input.expected_direction) {
    errors.push("expected_direction is required");
  } else if (typeof input.expected_direction !== "string") {
    errors.push("expected_direction must be a string");
  } else if (!["INCREASE", "DECREASE", "STABILIZE"].includes(input.expected_direction)) {
    errors.push(
      "expected_direction must be one of: INCREASE, DECREASE, STABILIZE"
    );
  }

  // Validate expected_target
  if (!input.expected_target) {
    errors.push("expected_target is required");
  } else if (typeof input.expected_target !== "string") {
    errors.push("expected_target must be a string");
  } else if (input.expected_target.trim().length === 0) {
    errors.push("expected_target must not be empty");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

describe("validateExpectationFields", () => {
  it("should pass with all required fields present", () => {
    const result = validateExpectationFields({
      why_now: "Revenue declining at 2% per week",
      cost_of_inaction: "Approval backlog grows by 50% monthly",
      expected_metric: "approval_rate",
      expected_direction: "INCREASE",
      expected_target: "85%+",
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should reject missing why_now", () => {
    const result = validateExpectationFields({
      cost_of_inaction: "Backlog grows...",
      expected_metric: "approval_rate",
      expected_direction: "INCREASE",
      expected_target: "85%+",
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("why_now is required");
  });

  it("should reject why_now < 10 characters", () => {
    const result = validateExpectationFields({
      why_now: "Short",
      cost_of_inaction: "Backlog grows by 50% monthly",
      expected_metric: "approval_rate",
      expected_direction: "INCREASE",
      expected_target: "85%+",
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "why_now must be at least 10 characters"
    );
  });

  it("should reject why_now > 500 characters", () => {
    const result = validateExpectationFields({
      why_now: "a".repeat(501),
      cost_of_inaction: "Backlog grows by 50% monthly",
      expected_metric: "approval_rate",
      expected_direction: "INCREASE",
      expected_target: "85%+",
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("why_now must be at most 500 characters");
  });

  it("should reject missing cost_of_inaction", () => {
    const result = validateExpectationFields({
      why_now: "Revenue declining at 2% per week",
      expected_metric: "approval_rate",
      expected_direction: "INCREASE",
      expected_target: "85%+",
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("cost_of_inaction is required");
  });

  it("should reject cost_of_inaction < 10 characters", () => {
    const result = validateExpectationFields({
      why_now: "Revenue declining at 2% per week",
      cost_of_inaction: "Short",
      expected_metric: "approval_rate",
      expected_direction: "INCREASE",
      expected_target: "85%+",
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "cost_of_inaction must be at least 10 characters"
    );
  });

  it("should reject missing expected_metric", () => {
    const result = validateExpectationFields({
      why_now: "Revenue declining at 2% per week",
      cost_of_inaction: "Backlog grows by 50% monthly",
      expected_direction: "INCREASE",
      expected_target: "85%+",
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("expected_metric is required");
  });

  it("should reject unknown expected_metric", () => {
    const result = validateExpectationFields({
      why_now: "Revenue declining at 2% per week",
      cost_of_inaction: "Backlog grows by 50% monthly",
      expected_metric: "unknown_metric",
      expected_direction: "INCREASE",
      expected_target: "85%+",
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining("expected_metric must be one of")
    );
  });

  it("should reject invalid expected_direction", () => {
    const result = validateExpectationFields({
      why_now: "Revenue declining at 2% per week",
      cost_of_inaction: "Backlog grows by 50% monthly",
      expected_metric: "approval_rate",
      expected_direction: "WRONG",
      expected_target: "85%+",
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "expected_direction must be one of: INCREASE, DECREASE, STABILIZE"
    );
  });

  it("should accept INCREASE as valid direction", () => {
    const result = validateExpectationFields({
      why_now: "Revenue declining at 2% per week",
      cost_of_inaction: "Backlog grows by 50% monthly",
      expected_metric: "approval_rate",
      expected_direction: "INCREASE",
      expected_target: "85%+",
    });

    expect(result.valid).toBe(true);
  });

  it("should accept DECREASE as valid direction", () => {
    const result = validateExpectationFields({
      why_now: "Error rate rising at 3% per week",
      cost_of_inaction: "Customer complaints increasing",
      expected_metric: "error_rate",
      expected_direction: "DECREASE",
      expected_target: "< 0.5%",
    });

    expect(result.valid).toBe(true);
  });

  it("should accept STABILIZE as valid direction", () => {
    const result = validateExpectationFields({
      why_now: "Latency fluctuating significantly",
      cost_of_inaction: "User experience degraded",
      expected_metric: "latency",
      expected_direction: "STABILIZE",
      expected_target: "50-100ms",
    });

    expect(result.valid).toBe(true);
  });

  it("should reject missing expected_direction", () => {
    const result = validateExpectationFields({
      why_now: "Revenue declining at 2% per week",
      cost_of_inaction: "Backlog grows by 50% monthly",
      expected_metric: "approval_rate",
      expected_target: "85%+",
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("expected_direction is required");
  });

  it("should reject missing expected_target", () => {
    const result = validateExpectationFields({
      why_now: "Revenue declining at 2% per week",
      cost_of_inaction: "Backlog grows by 50% monthly",
      expected_metric: "approval_rate",
      expected_direction: "INCREASE",
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("expected_target is required");
  });

  it("should reject empty expected_target", () => {
    const result = validateExpectationFields({
      why_now: "Revenue declining at 2% per week",
      cost_of_inaction: "Backlog grows by 50% monthly",
      expected_metric: "approval_rate",
      expected_direction: "INCREASE",
      expected_target: "   ",
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("expected_target must not be empty");
  });

  it("should reject multiple missing fields", () => {
    const result = validateExpectationFields({
      why_now: "Short",
      expected_metric: "unknown",
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(3);
  });

  it("should handle empty input object", () => {
    const result = validateExpectationFields({});

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(5); // All 5 required fields missing
  });

  it("should support all allowed metrics", () => {
    const allowedMetrics = [
      "approval_rate",
      "processing_time",
      "customer_satisfaction",
      "error_rate",
      "throughput",
      "latency",
      "uptime",
      "cost_reduction",
    ];

    for (const metric of allowedMetrics) {
      const result = validateExpectationFields({
        why_now: "Revenue declining at 2% per week",
        cost_of_inaction: "Backlog grows by 50% monthly",
        expected_metric: metric,
        expected_direction: "INCREASE",
        expected_target: "85%+",
      });

      expect(result.valid).toBe(true);
    }
  });
});
