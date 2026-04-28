import { describe, it, expect } from "vitest";
import { calculateExecutionCertainty } from "@/services/execution-certainty";

describe("execution-certainty endpoint response shape", () => {
  it("returns object with score, level, blockers, risks, reasons", () => {
    const result = calculateExecutionCertainty("eng-123");

    expect(result).toHaveProperty("score");
    expect(result).toHaveProperty("level");
    expect(result).toHaveProperty("blockers");
    expect(result).toHaveProperty("risks");
    expect(result).toHaveProperty("reasons");
  });

  it("score is always a number between 0 and 100", () => {
    const result = calculateExecutionCertainty("eng-456");

    expect(typeof result.score).toBe("number");
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("level is one of the expected values", () => {
    const result = calculateExecutionCertainty("eng-789");

    expect(["blocked", "low", "medium", "high", "certain"]).toContain(result.level);
  });

  it("blockers, risks, reasons are arrays", () => {
    const result = calculateExecutionCertainty("eng-abc");

    expect(Array.isArray(result.blockers)).toBe(true);
    expect(Array.isArray(result.risks)).toBe(true);
    expect(Array.isArray(result.reasons)).toBe(true);
  });
});
