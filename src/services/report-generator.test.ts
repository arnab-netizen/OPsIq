import { describe, it, expect } from "vitest";
import { calculateExecutionCertainty } from "./execution-certainty";
import type { EngagementReport } from "./report-generator";

describe("report-generator with execution-certainty", () => {
  it("execution-certainty includes score, level, blockers, risks, reasons", () => {
    const result = calculateExecutionCertainty(
      "eng-123",
      [
        {
          id: "find-1",
          severity: "high",
          resolved: false,
          verified: true,
        },
      ],
      [],
      [],
      [],
      { overallStatus: "healthy", kpiTrend: "flat" }
    );

    expect(result).toHaveProperty("score");
    expect(result).toHaveProperty("level");
    expect(result).toHaveProperty("blockers");
    expect(result).toHaveProperty("risks");
    expect(result).toHaveProperty("reasons");
    expect(typeof result.score).toBe("number");
    expect(["blocked", "low", "medium", "high", "certain"]).toContain(result.level);
    expect(Array.isArray(result.blockers)).toBe(true);
    expect(Array.isArray(result.risks)).toBe(true);
    expect(Array.isArray(result.reasons)).toBe(true);
  });

  it("execution-certainty score reflects engagement health", () => {
    const healthyResult = calculateExecutionCertainty(
      "eng-456",
      [],
      [],
      [],
      [],
      { overallStatus: "healthy", kpiTrend: "improving" }
    );

    const criticalResult = calculateExecutionCertainty(
      "eng-789",
      [],
      [],
      [],
      [],
      { overallStatus: "critical", kpiTrend: "deteriorating" }
    );

    expect(healthyResult.score).toBeGreaterThan(criticalResult.score);
  });

  it("execution-certainty detects blocked critical actions", () => {
    const result = calculateExecutionCertainty(
      "eng-blocked",
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

    expect(result.blockers.length).toBeGreaterThan(0);
    expect(result.level).toBe("blocked");
  });
});
