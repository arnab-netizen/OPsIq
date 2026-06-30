/**
 * Owner readiness service — the max-reliability-green signal is sourced from the committed expert
 * benchmark and is fail-closed. (The full async assembly is exercised by the DB tests and the pilot
 * packs; here we lock the no-regression gate signal that gates pilot-ready.)
 */
import { describe, it, expect } from "vitest";
import { maxReliabilityGreenFromBenchmark } from "@/services/owner-mode/owner-readiness.service";

describe("owner readiness — max-reliability gate signal", () => {
  it("reads green from the committed expert benchmark (unsafe=0, generic-fails-green, math-green)", () => {
    expect(maxReliabilityGreenFromBenchmark()).toBe(true);
  });
});
