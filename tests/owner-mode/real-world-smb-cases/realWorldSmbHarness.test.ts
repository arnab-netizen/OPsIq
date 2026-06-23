/**
 * Real-world SMB case harness.
 *
 * PART A — fixture + scoring infrastructure tests (always run).
 * PART B — engine integration tests (live; replaces the prior skipped block).
 */

import { describe, it, expect } from "vitest";
import { loadRealWorldSmbFixtures } from "./loadFixtures";
import { scoreOutput, type CaseScore } from "./scoringContract";
import { runCaseAgainstOpsiq, TODO_INTEGRATION_SKIPPED } from "./runCaseAgainstOpsiq";

// ── PART A: Infrastructure integrity ─────────────────────────────────────────

describe("SMB harness: fixture infrastructure", () => {
  it("loads all 12 fixtures without error", () => {
    const fixtures = loadRealWorldSmbFixtures();
    expect(fixtures).toHaveLength(12);
  });

  it("every fixture has at least one must_identify term, one bad recommendation, and one missing input", () => {
    const fixtures = loadRealWorldSmbFixtures();
    for (const f of fixtures) {
      expect(f.expected_opsiq_diagnosis.scoring_criteria.must_identify.length).toBeGreaterThan(0);
      expect(f.expected_opsiq_diagnosis.bad_recommendations_to_flag.length).toBeGreaterThan(0);
      expect(f.scenario.missing_inputs_opsiq_should_request.length).toBeGreaterThan(0);
    }
  });

  it("scoring contract is callable for all 12 fixtures without throwing", () => {
    const fixtures = loadRealWorldSmbFixtures();
    const syntheticOutput = "placeholder output with no meaningful content";
    const scores: CaseScore[] = [];
    for (const f of fixtures) {
      expect(() => {
        const s = scoreOutput(syntheticOutput, f);
        scores.push(s);
      }).not.toThrow();
    }
    expect(scores).toHaveLength(12);
  });

  it("empty output fails all cases on ROOT_CAUSE_ALIGNMENT", () => {
    const fixtures = loadRealWorldSmbFixtures();
    for (const f of fixtures) {
      const result = scoreOutput("", f);
      expect(result.dimensionResults.ROOT_CAUSE_ALIGNMENT.passed).toBe(false);
    }
  });

  it("output recommending every bad action fails BAD_RECOMMENDATION_AVOIDANCE for every fixture", () => {
    const fixtures = loadRealWorldSmbFixtures();
    for (const f of fixtures) {
      const allBad = f.expected_opsiq_diagnosis.bad_recommendations_to_flag.join(". ");
      const result = scoreOutput(allBad, f);
      expect(result.dimensionResults.BAD_RECOMMENDATION_AVOIDANCE.passed).toBe(false);
      expect(result.passed).toBe(false);
    }
  });

  it("score report includes all required fields for every case", () => {
    const fixtures = loadRealWorldSmbFixtures();
    for (const f of fixtures) {
      const result = scoreOutput("test output", f);
      expect(result).toHaveProperty("case_id");
      expect(result).toHaveProperty("totalScore");
      expect(result).toHaveProperty("passed");
      expect(result).toHaveProperty("failedDimensions");
      expect(result).toHaveProperty("criticalFailures");
      expect(result.dimensionResults).toHaveProperty("ROOT_CAUSE_ALIGNMENT");
      expect(result.dimensionResults).toHaveProperty("MISSING_INPUT_REQUESTS");
      expect(result.dimensionResults).toHaveProperty("FIRST_ACTION_QUALITY");
      expect(result.dimensionResults).toHaveProperty("BAD_RECOMMENDATION_AVOIDANCE");
    }
  });
});

// ── PART B: Engine integration ────────────────────────────────────────────────

describe("SMB harness: engine integration", () => {
  it("integration adapter is no longer skipped", () => {
    expect(TODO_INTEGRATION_SKIPPED).toBe(false);
  });

  it("runs all 12 fixtures through the normalizer and engine without throwing", async () => {
    const fixtures = loadRealWorldSmbFixtures();
    const results = [];
    for (const f of fixtures) {
      const r = await runCaseAgainstOpsiq(f);
      results.push(r);
    }
    expect(results).toHaveLength(12);
  });

  it("scores supported cases and meets quality gates: ≥6/9 pass, average ≥0.65, zero bad recommendations", async () => {
    const fixtures = loadRealWorldSmbFixtures();

    const supportedScores: CaseScore[] = [];
    const badRecViolations: string[] = [];

    for (const fixture of fixtures) {
      const runResult = await runCaseAgainstOpsiq(fixture);

      if (runResult.unsupportedArchetype) {
        // Gap cases are expected abstentions; excluded from pass-rate denominator
        continue;
      }

      const score = scoreOutput(runResult.output, fixture);
      supportedScores.push(score);

      if (!score.dimensionResults.BAD_RECOMMENDATION_AVOIDANCE.passed) {
        badRecViolations.push(
          `${fixture.case_id}: ${score.dimensionResults.BAD_RECOMMENDATION_AVOIDANCE.matchedTerms.join("; ")}`
        );
      }
    }

    // Gate 1: Zero bad recommendations from supported cases
    if (badRecViolations.length > 0) {
      throw new Error(
        `Bad recommendations detected in ${badRecViolations.length} supported case(s):\n${badRecViolations.join("\n")}`
      );
    }

    // Gate 2: At least 6 of 9 supported cases pass (totalScore ≥ 0.70, rca.passed, bra.passed)
    const passedCases = supportedScores.filter((s) => s.passed);
    const failedDetails = supportedScores
      .filter((s) => !s.passed)
      .map(
        (s) =>
          `${s.case_id}: total=${s.totalScore}, failures=${s.criticalFailures.join(",") || s.failedDimensions.join(",")}`
      );

    expect(
      passedCases.length,
      `Only ${passedCases.length}/9 supported cases passed (need ≥6).\nFailed: ${failedDetails.join("\n")}`
    ).toBeGreaterThanOrEqual(6);

    // Gate 3: Average score across supported cases ≥ 0.65
    const avg =
      supportedScores.reduce((sum, s) => sum + s.totalScore, 0) / supportedScores.length;

    expect(
      avg,
      `Average supported case score ${avg.toFixed(2)} < 0.65.\nScores: ${supportedScores.map((s) => `${s.case_id}=${s.totalScore}`).join(", ")}`
    ).toBeGreaterThanOrEqual(0.65);
  });
});
