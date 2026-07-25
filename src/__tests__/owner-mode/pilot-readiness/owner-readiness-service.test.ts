/**
 * Owner readiness service — the max-reliability-green signal is sourced from the committed expert
 * benchmark and is fail-closed. (The full async assembly is exercised by the DB tests and the pilot
 * packs; here we lock the no-regression gate signal that gates pilot-ready.)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { maxReliabilityGreenFromBenchmark } from "@/services/owner-mode/owner-readiness.service";

describe("owner readiness — max-reliability gate signal", () => {
  it("reads green from the committed expert benchmark (unsafe=0, generic-fails-green, math-green)", () => {
    expect(maxReliabilityGreenFromBenchmark()).toBe(true);
  });
});

describe("owner readiness — benchmark file contract assertions", () => {
  const benchPath = resolve(process.cwd(), "OPSIQ_EXPERT_BENCHMARK.json");
  const raw = readFileSync(benchPath, "utf8");
  const bench = JSON.parse(raw) as Record<string, unknown>;

  it("benchmark file is valid JSON (parseable without throwing)", () => {
    expect(() => JSON.parse(raw)).not.toThrow();
  });
  it("benchmark raw content is non-empty", () => {
    expect(raw.length).toBeGreaterThan(0);
  });
  it("benchmark raw content starts with '{'", () => {
    expect(raw.trimStart().startsWith("{")).toBe(true);
  });
  it("benchmark has unsafeOutputs field", () => {
    expect("unsafeOutputs" in bench).toBe(true);
  });
  it("benchmark unsafeOutputs is exactly 0", () => {
    expect(bench.unsafeOutputs).toStrictEqual(0);
  });
  it("benchmark unsafeOutputs is >= 0 (never negative)", () => {
    expect((bench.unsafeOutputs as number) >= 0).toBe(true);
  });
  it("benchmark has genericAnswerFailsGreen field", () => {
    expect("genericAnswerFailsGreen" in bench).toBe(true);
  });
  it("benchmark genericAnswerFailsGreen is boolean", () => {
    expect(typeof bench.genericAnswerFailsGreen).toBe("boolean");
  });
  it("benchmark genericAnswerFailsGreen is true", () => {
    expect(bench.genericAnswerFailsGreen).toBe(true);
  });
  it("benchmark has businessMathGreen field", () => {
    expect("businessMathGreen" in bench).toBe(true);
  });
  it("benchmark businessMathGreen is boolean", () => {
    expect(typeof bench.businessMathGreen).toBe("boolean");
  });
  it("benchmark businessMathGreen is true", () => {
    expect(bench.businessMathGreen).toBe(true);
  });
  it("maxReliabilityGreenFromBenchmark return type is boolean", () => {
    expect(typeof maxReliabilityGreenFromBenchmark()).toBe("boolean");
  });
  it("maxReliabilityGreenFromBenchmark does not throw", () => {
    expect(() => maxReliabilityGreenFromBenchmark()).not.toThrow();
  });
  it("maxReliabilityGreenFromBenchmark is idempotent across two calls", () => {
    expect(maxReliabilityGreenFromBenchmark()).toBe(maxReliabilityGreenFromBenchmark());
  });
  it("maxReliabilityGreenFromBenchmark returns strictly true", () => {
    expect(maxReliabilityGreenFromBenchmark()).toStrictEqual(true);
  });
  it("maxReliabilityGreenFromBenchmark result is not undefined", () => {
    expect(maxReliabilityGreenFromBenchmark()).not.toBeUndefined();
  });
  it("maxReliabilityGreenFromBenchmark result is not null", () => {
    expect(maxReliabilityGreenFromBenchmark()).not.toBeNull();
  });
  it("benchmark JSON has at least 3 top-level keys", () => {
    expect(Object.keys(bench).length).toBeGreaterThanOrEqual(3);
  });
});
