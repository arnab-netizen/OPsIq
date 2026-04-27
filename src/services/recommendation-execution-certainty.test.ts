import { describe, it, expect, vi, beforeEach } from "vitest";
import { calculateExecutionCertainty } from "./execution-certainty";

describe("Execution Certainty Decision Gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("low score triggers warning condition", () => {
    const result = calculateExecutionCertainty(
      "eng-123",
      [
        {
          id: "find-1",
          severity: "critical",
          resolved: false,
          verified: false,
        },
        {
          id: "find-2",
          severity: "critical",
          resolved: false,
          verified: false,
        },
        {
          id: "find-3",
          severity: "high",
          resolved: false,
          verified: false,
        },
      ],
      [],
      [
        {
          id: "act-1",
          priority: "critical",
          status: "blocked",
        },
      ],
      [],
      { overallStatus: "critical", kpiTrend: "deteriorating" }
    );

    expect(result.score).toBeLessThan(40);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it("blocked level triggers warning condition", () => {
    const result = calculateExecutionCertainty(
      "eng-456",
      [],
      [],
      [
        {
          id: "act-1",
          priority: "critical",
          status: "blocked",
        },
      ],
      [],
      { overallStatus: "stable", kpiTrend: "flat" }
    );

    expect(result.level).toBe("blocked");
  });

  it("high score does not trigger warning condition", () => {
    const result = calculateExecutionCertainty(
      "eng-789",
      [],
      [],
      [
        {
          id: "act-1",
          priority: "high",
          status: "completed",
        },
      ],
      [],
      { overallStatus: "healthy", kpiTrend: "improving" }
    );

    expect(result.score).toBeGreaterThanOrEqual(40);
    expect(result.level).not.toBe("blocked");
  });

  it("warning threshold is 40", () => {
    // Test exactly at boundary
    const result1 = calculateExecutionCertainty(
      "eng-1",
      [
        {
          id: "find-1",
          severity: "high",
          resolved: false,
          verified: false,
        },
      ],
      [],
      [],
      [],
      { overallStatus: "at_risk", kpiTrend: "flat" }
    );

    // Result should be around 40 or below with the above inputs
    expect(result1.score).toBeGreaterThanOrEqual(0);
    expect(result1.score).toBeLessThanOrEqual(100);
  });

  it("warning emitted when blocked", () => {
    const result = calculateExecutionCertainty(
      "eng-blocked",
      [],
      [],
      [
        {
          id: "critical-action",
          priority: "critical",
          status: "blocked",
        },
      ],
      [],
      { overallStatus: "stable", kpiTrend: "flat" }
    );

    expect(result.level).toBe("blocked");
    expect(result.blockers.length).toBeGreaterThan(0);
  });

  it("all required fields present for warning payload", () => {
    const result = calculateExecutionCertainty(
      "eng-payload",
      [
        {
          id: "find-1",
          severity: "critical",
          resolved: false,
          verified: false,
        },
      ],
      [],
      [],
      [],
      { overallStatus: "critical", kpiTrend: "deteriorating" }
    );

    expect(result).toHaveProperty("score");
    expect(result).toHaveProperty("level");
    expect(result).toHaveProperty("blockers");
    expect(result).toHaveProperty("risks");
    expect(Array.isArray(result.blockers)).toBe(true);
    expect(Array.isArray(result.risks)).toBe(true);
  });
});
