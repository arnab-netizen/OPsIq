import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { checkRatchet, ratchetReport, computeBenchmark, type Benchmark } from "@/behavioral-validation/expert/ratchet";

const accepted: Benchmark = JSON.parse(readFileSync(resolve(process.cwd(), "OPSIQ_EXPERT_BENCHMARK.json"), "utf8"));

describe("benchmark ratchet", () => {
  it("the accepted benchmark file exists and is well-formed", () => {
    expect(accepted.overallScore).toBeGreaterThan(0);
    expect(accepted.unsafeOutputs).toBe(0);
    expect(accepted.genericAnswerFailsGreen).toBe(true);
    expect(accepted.businessMathGreen).toBe(true);
  });

  it("an identical benchmark passes the ratchet", () => {
    expect(checkRatchet(accepted, accepted).passed).toBe(true);
  });

  it("an unsafe regression fails immediately", () => {
    const worse = { ...accepted, unsafeOutputs: accepted.unsafeOutputs + 1 };
    const r = checkRatchet(accepted, worse);
    expect(r.passed).toBe(false);
    expect(r.violations.join(" ")).toMatch(/unsafe/);
  });

  it("a worse overall result (beyond tolerance) fails", () => {
    const worse = { ...accepted, overallScore: accepted.overallScore - 5 };
    expect(checkRatchet(accepted, worse).passed).toBe(false);
  });

  it("a critical-domain regression fails; a non-critical minor dip passes only with explanation", () => {
    const criticalDrop = { ...accepted, domainScores: { ...accepted.domainScores, diagnosis: accepted.domainScores.diagnosis - 3 } };
    expect(checkRatchet(accepted, criticalDrop).passed).toBe(false);

    const minorDip = { ...accepted, overallScore: accepted.overallScore - 1 };
    expect(checkRatchet(accepted, minorDip).passed).toBe(false); // no explanation
    expect(checkRatchet(accepted, minorDip, { acknowledgedExplanation: "intentional non-critical refactor" }).passed).toBe(true);
  });

  it("regression failures must remain zero", () => {
    expect(checkRatchet(accepted, { ...accepted, regressionFailures: 2 }).passed).toBe(false);
  });

  it("a ratchet report is generated", () => {
    const report = ratchetReport(accepted, accepted, checkRatchet(accepted, accepted));
    expect(report).toMatch(/Benchmark ratchet/);
    expect(report).toMatch(/PASS/);
  });

  it("the LIVE system still meets the accepted benchmark (no silent regression)", async () => {
    const live = await computeBenchmark();
    const r = checkRatchet(accepted, live);
    expect(r.violations).toEqual([]);
    expect(r.passed).toBe(true);
  }, 60000);
});
