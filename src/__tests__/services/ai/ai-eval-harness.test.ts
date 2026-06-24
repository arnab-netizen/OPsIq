/**
 * AI-18 evaluation harness — proves 100% guardrail coverage on the mock track.
 */
import { describe, it, expect } from "vitest";
import { runAiEvalHarness, AI_EVAL_CASES } from "@/services/ai/eval-harness";

describe("AI-18 governed-AI eval harness (mock track)", () => {
  it("every canonical eval case resolves to its expected governed status", async () => {
    const report = await runAiEvalHarness();
    const failures = report.results.filter((r) => !r.pass);
    expect(failures, JSON.stringify(failures, null, 2)).toHaveLength(0);
    expect(report.passed).toBe(report.total);
    expect(report.total).toBe(AI_EVAL_CASES.length);
  });

  it("covers all three mock tracks with 100% pass", async () => {
    const report = await runAiEvalHarness();
    for (const track of ["MOCK_AI_TESTED", "GUARDRAIL_TESTED", "PROMPT_INJECTION_TESTED"] as const) {
      expect(report.byTrack[track].total).toBeGreaterThan(0);
      expect(report.byTrack[track].passed).toBe(report.byTrack[track].total);
    }
  });
});
