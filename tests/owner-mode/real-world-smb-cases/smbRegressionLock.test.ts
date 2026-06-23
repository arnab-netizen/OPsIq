/**
 * SMB Phase 5 Regression Lock.
 *
 * Permanent benchmark assertions locking the honest state established after
 * Phase 4B. DO NOT tune thresholds upward without re-running all supported
 * cases and documenting the new baseline. DO NOT lower floors.
 *
 * Locked baseline (captured 2026-06-22, Phase 4B):
 *   SMB-001: 0.86  SMB-002: 0.93  SMB-003: 0.84  SMB-004: 0.73
 *   SMB-006: 0.80  SMB-007: 0.86  SMB-008: 0.88  SMB-010: 0.86
 *   SMB-012: 0.89  AVG: 0.85
 *   All 9/9 supported cases pass. 0 bad recommendations.
 *
 * Lock groups:
 *   L1 — Supported/unsupported case set is stable (no drift in denominator)
 *   L2 — Each supported case totalScore ≥ (locked − 0.05 tolerance)
 *   L3 — Each supported case ROOT_CAUSE_ALIGNMENT.passed = true
 *   L4 — Each supported case BAD_RECOMMENDATION_AVOIDANCE.passed = true
 *   L5 — Zero bad recommendation violations across all supported cases
 *   L6 — Overall supported pass count = 9/9
 *   L7 — Average supported totalScore ≥ 0.80 (locked avg 0.85 − 0.05 tolerance)
 *   L8 — Unsupported cases (SMB-005, SMB-009, SMB-011) return scope-gap / abstention
 *   L9 — Leakage guards: composer source contains no must_identify phrases as double-quoted literals
 */

import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { loadRealWorldSmbFixtures } from "./loadFixtures";
import { scoreOutput } from "./scoringContract";
import { runCaseAgainstOpsiq } from "./runCaseAgainstOpsiq";

// ── Constants ─────────────────────────────────────────────────────────────────

const SUPPORTED_CASES = [
  "SMB-001",
  "SMB-002",
  "SMB-003",
  "SMB-004",
  "SMB-006",
  "SMB-007",
  "SMB-008",
  "SMB-010",
  "SMB-012",
] as const;

const UNSUPPORTED_CASES = ["SMB-005", "SMB-009", "SMB-011"] as const;

// Per-case locked score floors (locked total − 0.05 tolerance, floored to nearest 0.01)
const SCORE_FLOORS: Record<string, number> = {
  "SMB-001": 0.81,
  "SMB-002": 0.88,
  "SMB-003": 0.79,
  "SMB-004": 0.68,
  "SMB-006": 0.75,
  "SMB-007": 0.81,
  "SMB-008": 0.83,
  "SMB-010": 0.81,
  "SMB-012": 0.84,
};

const LOCKED_AVG_FLOOR = 0.80;
const LOCKED_PASS_COUNT = 9;
const TOTAL_FIXTURE_COUNT = 12;
const SCORE_TOLERANCE = 0.05;

const COMPOSER_SRC = readFileSync(
  join(__dirname, "smbOutputComposer.ts"),
  "utf-8"
);

// ── L1: Supported/unsupported set stability ───────────────────────────────────

describe("L1: supported and unsupported case sets are stable", () => {
  it(`total fixture count remains ${TOTAL_FIXTURE_COUNT}`, () => {
    const fixtures = loadRealWorldSmbFixtures();
    expect(fixtures).toHaveLength(TOTAL_FIXTURE_COUNT);
  });

  it(`supported set contains exactly ${SUPPORTED_CASES.length} cases`, () => {
    const fixtures = loadRealWorldSmbFixtures();
    const loaded = new Set(fixtures.map((f) => f.case_id));
    for (const id of SUPPORTED_CASES) {
      expect(loaded.has(id), `supported case ${id} missing from fixtures`).toBe(true);
    }
  });

  it(`unsupported set contains exactly ${UNSUPPORTED_CASES.length} cases`, () => {
    const fixtures = loadRealWorldSmbFixtures();
    const loaded = new Set(fixtures.map((f) => f.case_id));
    for (const id of UNSUPPORTED_CASES) {
      expect(loaded.has(id), `unsupported case ${id} missing from fixtures`).toBe(true);
    }
  });

  it("unsupported cases are not included in supported denominator", () => {
    for (const id of UNSUPPORTED_CASES) {
      expect(
        (SUPPORTED_CASES as readonly string[]).includes(id),
        `unsupported case ${id} should not be in SUPPORTED_CASES`
      ).toBe(false);
    }
  });
});

// ── L2: Per-case totalScore floors ───────────────────────────────────────────

describe("L2: per-case totalScore meets locked floor (locked − 0.05 tolerance)", () => {
  for (const caseId of SUPPORTED_CASES) {
    it(`${caseId} totalScore ≥ ${SCORE_FLOORS[caseId]}`, async () => {
      const fixtures = loadRealWorldSmbFixtures();
      const fixture = fixtures.find((f) => f.case_id === caseId)!;
      const result = await runCaseAgainstOpsiq(fixture);
      const score = scoreOutput(result.output, fixture);
      expect(
        score.totalScore,
        `${caseId} totalScore ${score.totalScore} < floor ${SCORE_FLOORS[caseId]} (locked ${SCORE_FLOORS[caseId] + SCORE_TOLERANCE})`
      ).toBeGreaterThanOrEqual(SCORE_FLOORS[caseId]);
    }, 60000);
  }
});

// ── L3: Per-case ROOT_CAUSE_ALIGNMENT.passed = true ──────────────────────────

describe("L3: per-case ROOT_CAUSE_ALIGNMENT.passed remains true", () => {
  for (const caseId of SUPPORTED_CASES) {
    it(`${caseId} ROOT_CAUSE_ALIGNMENT.passed = true`, async () => {
      const fixtures = loadRealWorldSmbFixtures();
      const fixture = fixtures.find((f) => f.case_id === caseId)!;
      const result = await runCaseAgainstOpsiq(fixture);
      const score = scoreOutput(result.output, fixture);
      expect(
        score.dimensionResults.ROOT_CAUSE_ALIGNMENT.passed,
        `${caseId} ROOT_CAUSE_ALIGNMENT regression: missing terms: ${score.dimensionResults.ROOT_CAUSE_ALIGNMENT.missingTerms.join(", ")}`
      ).toBe(true);
    }, 60000);
  }
});

// ── L4: Per-case BAD_RECOMMENDATION_AVOIDANCE.passed = true ──────────────────

describe("L4: per-case BAD_RECOMMENDATION_AVOIDANCE.passed remains true", () => {
  for (const caseId of SUPPORTED_CASES) {
    it(`${caseId} BAD_RECOMMENDATION_AVOIDANCE.passed = true`, async () => {
      const fixtures = loadRealWorldSmbFixtures();
      const fixture = fixtures.find((f) => f.case_id === caseId)!;
      const result = await runCaseAgainstOpsiq(fixture);
      const score = scoreOutput(result.output, fixture);
      expect(
        score.dimensionResults.BAD_RECOMMENDATION_AVOIDANCE.passed,
        `${caseId} BAD_RECOMMENDATION_AVOIDANCE regression: matched: ${score.dimensionResults.BAD_RECOMMENDATION_AVOIDANCE.matchedTerms.join(", ")}`
      ).toBe(true);
    }, 60000);
  }
});

// ── L5 + L6 + L7: Aggregate gates ────────────────────────────────────────────

describe(`L5/L6/L7: aggregate gates — 0 bad recs, ${LOCKED_PASS_COUNT}/9 pass, avg ≥ ${LOCKED_AVG_FLOOR}`, () => {
  it("zero bad recommendation violations across all supported cases", async () => {
    const fixtures = loadRealWorldSmbFixtures();
    const violations: string[] = [];
    for (const caseId of SUPPORTED_CASES) {
      const fixture = fixtures.find((f) => f.case_id === caseId)!;
      const result = await runCaseAgainstOpsiq(fixture);
      const score = scoreOutput(result.output, fixture);
      if (!score.dimensionResults.BAD_RECOMMENDATION_AVOIDANCE.passed) {
        violations.push(
          `${caseId}: ${score.dimensionResults.BAD_RECOMMENDATION_AVOIDANCE.matchedTerms.join("; ")}`
        );
      }
    }
    expect(violations, `Bad recommendation violations: ${violations.join("\n")}`).toHaveLength(0);
  }, 120000);

  it(`supported pass count = ${LOCKED_PASS_COUNT}/9`, async () => {
    const fixtures = loadRealWorldSmbFixtures();
    const results: Array<{ id: string; passed: boolean; total: number }> = [];
    for (const caseId of SUPPORTED_CASES) {
      const fixture = fixtures.find((f) => f.case_id === caseId)!;
      const result = await runCaseAgainstOpsiq(fixture);
      const score = scoreOutput(result.output, fixture);
      results.push({ id: caseId, passed: score.passed, total: score.totalScore });
    }
    const passed = results.filter((r) => r.passed);
    const failed = results.filter((r) => !r.passed);
    expect(
      passed.length,
      `Only ${passed.length}/9 pass. Failed: ${failed.map((r) => `${r.id}=${r.total}`).join(", ")}`
    ).toBe(LOCKED_PASS_COUNT);
  }, 120000);

  it(`average supported totalScore ≥ ${LOCKED_AVG_FLOOR}`, async () => {
    const fixtures = loadRealWorldSmbFixtures();
    let total = 0;
    const perCase: string[] = [];
    for (const caseId of SUPPORTED_CASES) {
      const fixture = fixtures.find((f) => f.case_id === caseId)!;
      const result = await runCaseAgainstOpsiq(fixture);
      const score = scoreOutput(result.output, fixture);
      total += score.totalScore;
      perCase.push(`${caseId}=${score.totalScore}`);
    }
    const avg = total / SUPPORTED_CASES.length;
    expect(
      avg,
      `Average ${avg.toFixed(4)} < ${LOCKED_AVG_FLOOR}. Per case: ${perCase.join(", ")}`
    ).toBeGreaterThanOrEqual(LOCKED_AVG_FLOOR);
  }, 120000);
});

// ── L8: Unsupported cases return scope-gap / abstention ──────────────────────

describe("L8: unsupported cases remain excluded (scope-gap or abstention output)", () => {
  for (const caseId of UNSUPPORTED_CASES) {
    it(`${caseId} output contains SCOPE GAP or abstention marker`, async () => {
      const fixtures = loadRealWorldSmbFixtures();
      const fixture = fixtures.find((f) => f.case_id === caseId)!;
      const result = await runCaseAgainstOpsiq(fixture);
      const isScopeGap =
        result.unsupportedArchetype === true ||
        result.output.includes("SCOPE GAP") ||
        result.output.includes("OpsIQ will abstain") ||
        result.output.includes("Insufficient evidence");
      expect(
        isScopeGap,
        `${caseId} should produce scope-gap/abstention but got: ${result.output.slice(0, 200)}`
      ).toBe(true);
    }, 60000);
  }
});

// ── L9: Leakage guard — no must_identify phrases as double-quoted literals ────

describe("L9: leakage guard — no must_identify phrases appear as double-quoted string literals in composer source", () => {
  const fixtures = loadRealWorldSmbFixtures();

  for (const fixture of fixtures) {
    const mustIdentify = fixture.expected_opsiq_diagnosis.scoring_criteria.must_identify;
    for (const phrase of mustIdentify) {
      // Skip phrases that legitimately appear as domain vocabulary in CANONICAL_METRIC_LABELS
      // or ARCHETYPE_PREAMBLE (≤3 chars after normalization, acronyms, generic terms).
      // Only flag if found as a standalone "phrase" double-quoted string literal
      // that would only make sense as an answer-key copy.
      const normalized = phrase.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").trim();
      const tokens = normalized.split(" ").filter((t) => t.length > 2);
      // Only test multi-token phrases (≥2 meaningful tokens) — single-word terms
      // like "DSO" or "CAC" may appear legitimately as metric labels.
      if (tokens.length < 2) continue;

      it(`${fixture.case_id} must_identify "${phrase}" is not a double-quoted literal in composer source`, () => {
        // Check for the phrase as a complete double-quoted string "phrase"
        const asDoubleQuoted = `"${phrase}"`;
        expect(
          COMPOSER_SRC.includes(asDoubleQuoted),
          `Leakage: "${phrase}" from ${fixture.case_id} appears as double-quoted string literal in smbOutputComposer.ts`
        ).toBe(false);
      });
    }
  }
});
