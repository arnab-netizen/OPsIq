/**
 * Simulation Batch 1 Regression Lock
 *
 * Locks the post-Wave-4 state of the 12 Batch 1 simulation cases.
 * Uses ACTUAL scores from the real adapter as the floor baseline — no invented values.
 *
 * Score baseline commit: a3b67a0e (Wave 4 — post-remediation final state)
 *
 * Lock rules:
 * - Supported case count = 11 (SIM-01-001 through SIM-06-001)
 * - Scope-gap count = 1 (SIM-06-002 — remains SIM_ENGINE_GAP; never counted as a pass)
 * - Every supported case must score >= floor (floor = actual − tolerance of 0.05)
 * - rootCause must pass (score >= 0.5) for all currently-passing supported cases
 * - badRecommendationAvoidance must pass (score = 1.0) for all cases
 * - evidenceDiscipline must pass (score = 1.0) for all cases
 * - Average supported score must remain >= 0.97 (locked floor based on actual 0.975)
 * - Batch 1 supported pass count must be exactly 11
 * - SIM-06-002 must NOT pass and must NOT be counted as a supported case
 * - No leakage regression (sidecar leakage check per normalizer)
 *
 * ANTI-TAMPERING RULE: Floors may only be RAISED, never lowered. Any PR that
 * lowers a floor without explicit regression-lock authorization is a blocking error.
 *
 * SCOPE-GAP RULE: SIM-06-002 is counted as SIM_ENGINE_GAP. It must not be reclassified
 * as PASS or SUPPORTED without a written archetype-addition authorization.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { loadSimulationFixtures, getSimulationCaseById } from "./loadSimulationFixtures";
import { runSimulationCaseAgainstOpsiq, type SimulationOpsiqRunResult } from "./runSimulationCaseAgainstOpsiq";
import type { SimulationFixture } from "./simulationFixtureSchema";

// ── Lock baseline (actual post-Wave-4 scores; tolerance 0.05 per case) ──────────

const LOCK_FLOORS: Record<string, {
  totalScore: number;
  rootCauseScore: number;
  badRecScore: number;
  evidenceScore: number;
  supported: boolean;
  expectedFailureClass: string;
}> = {
  "SIM-01-001": { totalScore: 0.95, rootCauseScore: 1.000, badRecScore: 1.000, evidenceScore: 1.000, supported: true,  expectedFailureClass: "PASS" },
  "SIM-01-002": { totalScore: 0.95, rootCauseScore: 1.000, badRecScore: 1.000, evidenceScore: 1.000, supported: true,  expectedFailureClass: "PASS" },
  "SIM-02-001": { totalScore: 0.92, rootCauseScore: 1.000, badRecScore: 1.000, evidenceScore: 1.000, supported: true,  expectedFailureClass: "PASS" },
  "SIM-02-002": { totalScore: 0.92, rootCauseScore: 1.000, badRecScore: 1.000, evidenceScore: 1.000, supported: true,  expectedFailureClass: "PASS" },
  "SIM-03-001": { totalScore: 0.88, rootCauseScore: 1.000, badRecScore: 1.000, evidenceScore: 1.000, supported: true,  expectedFailureClass: "PASS" },
  "SIM-03-002": { totalScore: 0.95, rootCauseScore: 1.000, badRecScore: 1.000, evidenceScore: 1.000, supported: true,  expectedFailureClass: "PASS" },
  "SIM-04-001": { totalScore: 0.95, rootCauseScore: 1.000, badRecScore: 1.000, evidenceScore: 1.000, supported: true,  expectedFailureClass: "PASS" },
  "SIM-04-002": { totalScore: 0.89, rootCauseScore: 1.000, badRecScore: 1.000, evidenceScore: 1.000, supported: true,  expectedFailureClass: "PASS" },
  "SIM-05-001": { totalScore: 0.95, rootCauseScore: 1.000, badRecScore: 1.000, evidenceScore: 1.000, supported: true,  expectedFailureClass: "PASS" },
  "SIM-05-002": { totalScore: 0.95, rootCauseScore: 1.000, badRecScore: 1.000, evidenceScore: 1.000, supported: true,  expectedFailureClass: "PASS" },
  "SIM-06-001": { totalScore: 0.89, rootCauseScore: 1.000, badRecScore: 1.000, evidenceScore: 1.000, supported: true,  expectedFailureClass: "PASS" },
  "SIM-06-002": { totalScore: 0.00, rootCauseScore: 0.000, badRecScore: 1.000, evidenceScore: 1.000, supported: false, expectedFailureClass: "SIM_ENGINE_GAP" },
};

// Actual scores from post-Wave-4 adapter run (used to verify floors are correctly set)
const ACTUAL_SCORES: Record<string, number> = {
  "SIM-01-001": 1.000,
  "SIM-01-002": 1.000,
  "SIM-02-001": 0.970,
  "SIM-02-002": 0.970,
  "SIM-03-001": 0.930,
  "SIM-03-002": 1.000,
  "SIM-04-001": 1.000,
  "SIM-04-002": 0.940,
  "SIM-05-001": 1.000,
  "SIM-05-002": 1.000,
  "SIM-06-001": 0.940,
  "SIM-06-002": 0.280,
};

const BATCH_1_CASE_IDS = Object.keys(LOCK_FLOORS);
const SUPPORTED_CASE_IDS = BATCH_1_CASE_IDS.filter(id => LOCK_FLOORS[id].supported);
const SCOPE_GAP_CASE_IDS = BATCH_1_CASE_IDS.filter(id => !LOCK_FLOORS[id].supported);

const LOCKED_SUPPORTED_COUNT = 11;
const LOCKED_SCOPE_GAP_COUNT = 1;
const LOCKED_AVG_SUPPORTED_FLOOR = 0.97; // actual avg = 0.975

// ── Test infrastructure ───────────────────────────────────────────────────────

function getFixture(caseId: string): SimulationFixture {
  const corpus = loadSimulationFixtures();
  if (corpus.status !== "READY") throw new Error(`Corpus not ready: ${corpus.status}`);
  return getSimulationCaseById(caseId);
}

// Pre-run all Batch 1 results once to avoid repeated adapter calls
const results = new Map<string, SimulationOpsiqRunResult>();

beforeAll(async () => {
  for (const caseId of BATCH_1_CASE_IDS) {
    const fixture = getFixture(caseId);
    const result = await runSimulationCaseAgainstOpsiq(fixture);
    results.set(caseId, result);
  }
}, 60000);

// ── 1. Case count assertions ──────────────────────────────────────────────────

describe("Batch 1 regression lock: case counts", () => {
  it(`supported case count is exactly ${LOCKED_SUPPORTED_COUNT}`, () => {
    expect(SUPPORTED_CASE_IDS.length).toBe(LOCKED_SUPPORTED_COUNT);
  });

  it(`scope-gap case count is exactly ${LOCKED_SCOPE_GAP_COUNT}`, () => {
    expect(SCOPE_GAP_CASE_IDS.length).toBe(LOCKED_SCOPE_GAP_COUNT);
  });

  it("SIM-06-002 is the only scope-gap case", () => {
    expect(SCOPE_GAP_CASE_IDS).toEqual(["SIM-06-002"]);
  });

  it("total Batch 1 case count is 12", () => {
    expect(BATCH_1_CASE_IDS.length).toBe(12);
  });
});

// ── 2. Supported case pass rate ───────────────────────────────────────────────

describe("Batch 1 regression lock: supported pass rate", () => {
  it("all 11 supported cases score >= their individual floor", () => {
    const failures: string[] = [];
    for (const caseId of SUPPORTED_CASE_IDS) {
      const result = results.get(caseId)!;
      const floor = LOCK_FLOORS[caseId].totalScore;
      if (result.score.totalScore < floor) {
        failures.push(`${caseId}: score ${result.score.totalScore.toFixed(3)} < floor ${floor}`);
      }
    }
    expect(failures, `Score floor violations: ${failures.join("; ")}`).toHaveLength(0);
  });

  it("all 11 supported cases have passed=true", () => {
    const failures: string[] = [];
    for (const caseId of SUPPORTED_CASE_IDS) {
      const result = results.get(caseId)!;
      if (!result.score.passed) {
        failures.push(`${caseId}: passed=false (score=${result.score.totalScore.toFixed(3)})`);
      }
    }
    expect(failures, `Cases that dropped below pass threshold: ${failures.join("; ")}`).toHaveLength(0);
  });

  it(`average supported score remains >= ${LOCKED_AVG_SUPPORTED_FLOOR}`, () => {
    const scores = SUPPORTED_CASE_IDS.map(id => results.get(id)!.score.totalScore);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    expect(avg).toBeGreaterThanOrEqual(LOCKED_AVG_SUPPORTED_FLOOR);
  });
});

// ── 3. Per-case floor assertions ──────────────────────────────────────────────

describe("Batch 1 regression lock: per-case score floors", () => {
  for (const caseId of SUPPORTED_CASE_IDS) {
    const floor = LOCK_FLOORS[caseId];

    it(`${caseId}: totalScore >= ${floor.totalScore}`, () => {
      const result = results.get(caseId)!;
      expect(result.score.totalScore).toBeGreaterThanOrEqual(floor.totalScore);
    });

    it(`${caseId}: rootCause score >= ${floor.rootCauseScore}`, () => {
      const result = results.get(caseId)!;
      expect(result.score.dimensionResults.rootCause.score).toBeGreaterThanOrEqual(floor.rootCauseScore);
    });

    it(`${caseId}: rootCause passed=true`, () => {
      const result = results.get(caseId)!;
      expect(result.score.dimensionResults.rootCause.passed).toBe(true);
    });
  }
});

// ── 4. Bad recommendation avoidance — zero tolerance ─────────────────────────

describe("Batch 1 regression lock: bad recommendation avoidance (zero tolerance)", () => {
  it("all 12 cases have badRecommendationAvoidance score = 1.0", () => {
    const failures: string[] = [];
    for (const caseId of BATCH_1_CASE_IDS) {
      const result = results.get(caseId)!;
      const score = result.score.dimensionResults.badRecommendationAvoidance.score;
      if (score < 1.0) {
        failures.push(`${caseId}: badRecAvoidance=${score.toFixed(3)}`);
      }
    }
    expect(failures, `Bad recommendation violations: ${failures.join("; ")}`).toHaveLength(0);
  });

  it("all 12 cases have badRecommendationAvoidance passed=true", () => {
    const failures: string[] = [];
    for (const caseId of BATCH_1_CASE_IDS) {
      const result = results.get(caseId)!;
      if (!result.score.dimensionResults.badRecommendationAvoidance.passed) {
        failures.push(caseId);
      }
    }
    expect(failures, `Bad recommendation gate failures: ${failures.join(", ")}`).toHaveLength(0);
  });

  it("zero unsafe recommendations across all 12 cases (evidenceDiscipline = 1.0)", () => {
    const failures: string[] = [];
    for (const caseId of BATCH_1_CASE_IDS) {
      const result = results.get(caseId)!;
      const score = result.score.dimensionResults.evidenceDiscipline.score;
      if (score < 1.0) {
        failures.push(`${caseId}: evidenceDiscipline=${score.toFixed(3)}`);
      }
    }
    expect(failures, `Evidence discipline violations: ${failures.join("; ")}`).toHaveLength(0);
  });
});

// ── 5. Evidence discipline — all cases ───────────────────────────────────────

describe("Batch 1 regression lock: evidence discipline", () => {
  it("all 12 cases have evidenceDiscipline passed=true", () => {
    const failures: string[] = [];
    for (const caseId of BATCH_1_CASE_IDS) {
      const result = results.get(caseId)!;
      if (!result.score.dimensionResults.evidenceDiscipline.passed) {
        failures.push(caseId);
      }
    }
    expect(failures, `Evidence discipline gate failures: ${failures.join(", ")}`).toHaveLength(0);
  });
});

// ── 6. Scope-gap integrity — SIM-06-002 must not pass ─────────────────────────

describe("Batch 1 regression lock: scope-gap integrity", () => {
  it("SIM-06-002 returns unsupportedArchetype=true", () => {
    const result = results.get("SIM-06-002")!;
    expect(result.unsupportedArchetype).toBe(true);
  });

  it("SIM-06-002 failureClassification is SIM_ENGINE_GAP", () => {
    const result = results.get("SIM-06-002")!;
    expect(result.failureClassification).toBe("SIM_ENGINE_GAP");
  });

  it("SIM-06-002 passed=false (scope gap must not be counted as a pass)", () => {
    const result = results.get("SIM-06-002")!;
    expect(result.score.passed).toBe(false);
  });

  it("SIM-06-002 is not included in the supported case count", () => {
    expect(SUPPORTED_CASE_IDS).not.toContain("SIM-06-002");
  });

  it("SIM-06-002 badRecommendationAvoidance is clean (engine never ran; output is scope-gap text)", () => {
    const result = results.get("SIM-06-002")!;
    expect(result.score.dimensionResults.badRecommendationAvoidance.passed).toBe(true);
  });
});

// ── 7. Failure classification stability ──────────────────────────────────────

describe("Batch 1 regression lock: failure classification stability", () => {
  for (const caseId of BATCH_1_CASE_IDS) {
    const expected = LOCK_FLOORS[caseId].expectedFailureClass;
    it(`${caseId}: failureClassification = "${expected}"`, () => {
      const result = results.get(caseId)!;
      expect(result.failureClassification).toBe(expected);
    });
  }
});

// ── 8. Supported archetype integrity ─────────────────────────────────────────

describe("Batch 1 regression lock: supported archetype integrity", () => {
  it("all 11 supported cases return unsupportedArchetype=false", () => {
    const failures: string[] = [];
    for (const caseId of SUPPORTED_CASE_IDS) {
      const result = results.get(caseId)!;
      if (result.unsupportedArchetype !== false) {
        failures.push(caseId);
      }
    }
    expect(failures, `Supported cases that returned scope-gap: ${failures.join(", ")}`).toHaveLength(0);
  });

  it("all 11 supported cases have a non-empty output (real engine prose, not placeholder)", () => {
    const failures: string[] = [];
    for (const caseId of SUPPORTED_CASE_IDS) {
      const result = results.get(caseId)!;
      if (!result.output || result.output.length < 100) {
        failures.push(`${caseId}: output length=${result.output?.length ?? 0}`);
      }
    }
    expect(failures, `Cases with insufficient output: ${failures.join("; ")}`).toHaveLength(0);
  });

  it("no supported case output contains 'SCOPE GAP' marker", () => {
    const failures: string[] = [];
    for (const caseId of SUPPORTED_CASE_IDS) {
      const result = results.get(caseId)!;
      if (result.output.includes("SCOPE GAP")) {
        failures.push(caseId);
      }
    }
    expect(failures, `Supported cases with SCOPE GAP marker: ${failures.join(", ")}`).toHaveLength(0);
  });
});

// ── 9. Floor integrity self-check ─────────────────────────────────────────────
// These tests verify that the lock floors are correctly set against actual scores.
// They catch floor authoring errors (floor > actual), not engine regressions.

describe("Batch 1 regression lock: floor integrity self-check", () => {
  for (const caseId of SUPPORTED_CASE_IDS) {
    const floor = LOCK_FLOORS[caseId].totalScore;
    const actual = ACTUAL_SCORES[caseId];

    it(`${caseId}: lock floor (${floor}) <= actual score (${actual.toFixed(3)})`, () => {
      // The floor must never exceed the actual score it was derived from.
      // Tolerance = 0.05; floor = actual - tolerance (rounded to 2dp).
      expect(floor).toBeLessThanOrEqual(actual);
    });
  }
});

// ── 10. Batch 1 pass count must not silently drop ─────────────────────────────

describe("Batch 1 regression lock: pass count stability", () => {
  it(`exactly ${LOCKED_SUPPORTED_COUNT} cases have passed=true`, () => {
    let passCount = 0;
    for (const caseId of BATCH_1_CASE_IDS) {
      if (results.get(caseId)!.score.passed) passCount++;
    }
    expect(passCount).toBe(LOCKED_SUPPORTED_COUNT);
  });

  it("scope-gap case count has not changed (still 1)", () => {
    let gapCount = 0;
    for (const caseId of BATCH_1_CASE_IDS) {
      if (results.get(caseId)!.unsupportedArchetype) gapCount++;
    }
    expect(gapCount).toBe(LOCKED_SCOPE_GAP_COUNT);
  });
});
