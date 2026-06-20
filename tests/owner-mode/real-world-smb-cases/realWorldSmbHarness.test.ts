/**
 * Real-world SMB case harness.
 *
 * This test file has two parts:
 *
 * PART A — fixture + scoring infrastructure tests (always run):
 *   Verifies that all 12 fixtures load, validate, and produce scoreable structure.
 *
 * PART B — engine integration tests (SKIPPED — see reason below):
 *   REASON: The OpsIQ diagnosis engine (diagnoseRootCause) accepts EvidenceItem[]
 *   with typed canonical dimensions. SMB fixtures carry narrative format
 *   (symptoms, facts_known_to_owner as freeform KV). No deterministic conversion
 *   from SMB narrative → EvidenceItem[] exists without case-specific mappings or
 *   an NLP layer (not permitted — no external calls). See runCaseAgainstOpsiq.ts.
 *
 *   MISSING ENTRYPOINT: A stable adapter converting SMB fixture narrative to
 *   EvidenceItem[] is required before integration tests can run.
 *   File: tests/owner-mode/real-world-smb-cases/runCaseAgainstOpsiq.ts
 *   Resolution: Author companion EvidenceItem[] arrays per fixture and wire them
 *   to diagnoseRootCause() in src/services/consulting-engine/diagnosis-engine.ts.
 */

import { describe, it, expect } from "vitest";
import { loadRealWorldSmbFixtures } from "./loadFixtures";
import { scoreOutput, type CaseScore } from "./scoringContract";
import { TODO_INTEGRATION_SKIPPED } from "./runCaseAgainstOpsiq";

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

// ── PART B: Engine integration (SKIPPED) ─────────────────────────────────────

describe("SMB harness: engine integration (skipped — missing entrypoint)", () => {
  it.skip(
    "SKIPPED: runs all 12 fixtures through the OpsIQ engine and scores outputs",
    () => {
      // Integration skipped. See module-level comment and runCaseAgainstOpsiq.ts.
      expect(TODO_INTEGRATION_SKIPPED).toBe(true);
    }
  );

  it.skip(
    "SKIPPED: requires at least 8/12 cases to pass with totalScore >= 0.70",
    () => {
      // Cannot run without engine integration adapter.
      expect(TODO_INTEGRATION_SKIPPED).toBe(true);
    }
  );

  it.skip(
    "SKIPPED: requires zero cases to produce a bad recommendation",
    () => {
      expect(TODO_INTEGRATION_SKIPPED).toBe(true);
    }
  );
});
