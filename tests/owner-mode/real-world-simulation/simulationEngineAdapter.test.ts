/**
 * Adapter integration tests: SimulationFixture → real OpsIQ engine → score.
 *
 * These tests verify that runSimulationCaseAgainstOpsiq calls the real
 * diagnosis engine (not a mock), that unsupported SC-06 cases are handled
 * as SCOPE_GAP, and that scoring runs on actual adapter output.
 *
 * Tests do NOT modify engine logic, scoring thresholds, fixture content,
 * or sidecar text. No answer-key vocabulary is injected into output.
 */
import { describe, it, expect } from "vitest";
import { loadSimulationFixtures, getSimulationCaseById } from "./loadSimulationFixtures";
import { runSimulationCaseAgainstOpsiq } from "./runSimulationCaseAgainstOpsiq";
import { normalizeSimulationFixtureToEvidence } from "./normalizeSimulationFixtureToEvidence";
import type { SimulationFixture } from "./simulationFixtureSchema";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getFixture(caseId: string): SimulationFixture {
  const corpus = loadSimulationFixtures();
  if (corpus.status !== "READY") throw new Error("Corpus not ready");
  return getSimulationCaseById(caseId);
}

// ── Normalization: adapter produces EvidenceItem[] from fixture+sidecar ───────

describe("normalizeSimulationFixtureToEvidence: structural contract", () => {
  it("produces non-empty EvidenceItem[] for SIM-01-001", () => {
    const fixture = getFixture("SIM-01-001");
    const result = normalizeSimulationFixtureToEvidence(fixture);
    expect(result.caseId).toBe("SIM-01-001");
    expect(result.evidenceItems.length).toBeGreaterThan(0);
    expect(result.unsupportedArchetype).toBe(false);
    expect(result.expectedBehavior).toBe("DIAGNOSE");
    expect(result.expectedArchetypeSynonym).toBe("working_capital_stress");
  });

  // W4 CORRECTION: SIM-06-001 reclassified from SCOPE_GAP to SUPPORTED (operational_bottleneck).
  // OPERATIONAL_BOTTLENECK now accepts market_position critical declining-order evidence as
  // co-requirement, enabling the engine to diagnose manufacturing throughput constraint cases.
  it("marks SIM-06-001 as unsupportedArchetype=false (W4: now supported as operational_bottleneck)", () => {
    const fixture = getFixture("SIM-06-001");
    const result = normalizeSimulationFixtureToEvidence(fixture);
    expect(result.unsupportedArchetype).toBe(false);
    expect(result.expectedBehavior).toBe("DIAGNOSE");
    expect(result.expectedArchetypeSynonym).toBe("operational_bottleneck");
    expect(result.unsupportedArchetypes.length).toBe(0);
  });

  it("marks SIM-06-002 as unsupportedArchetype=true", () => {
    const fixture = getFixture("SIM-06-002");
    const result = normalizeSimulationFixtureToEvidence(fixture);
    expect(result.unsupportedArchetype).toBe(true);
    expect(result.expectedBehavior).toBe("ABSTAIN_OR_SCOPE_GAP");
  });

  it("throws SIDECAR_LEAKAGE when overrideSidecar contains must_identify phrase", () => {
    const fixture = getFixture("SIM-01-001");
    const leakySidecar = {
      case_id: "SIM-01-001",
      fixture_version: "2026-06-22",
      engine_archetype_synonym: "working_capital_stress",
      unsupported_expected_archetypes: [],
      evidence_items: [
        {
          source_path: "input_packet.symptoms[0]",
          finding: "cash position running critically low with invoices unpaid",
          dimension: "financial_health",
          is_critical: true,
          confidence: "HIGH",
          no_outcome_leakage: true,
          rationale: "Test — no leakage phrase here.",
        },
      ],
      metric_key_mappings: [],
      clarification_requests: [],
      validation_notes: "Leakage test sidecar.",
    };
    // SIM-01-001 must_identify includes "cash position running critically low"
    // We craft the finding to include the first must_identify phrase from that case:
    // "cash flow not profit as the primary diagnostic lens"
    // Injecting it verbatim to verify the leakage guard fires
    const must0 = fixture.sealed_expected_output.scoring_rubric.must_identify[0];
    (leakySidecar.evidence_items[0] as Record<string, unknown>)["finding"] =
      `finding that contains ${must0}`;

    expect(() => normalizeSimulationFixtureToEvidence(fixture, leakySidecar)).toThrow(
      /SIDECAR_LEAKAGE/
    );
  });

  it("throws INVALID_SIDECAR when overrideSidecar fails validator", () => {
    const fixture = getFixture("SIM-01-001");
    const badSidecar = { case_id: "not-valid", fixture_version: "bad" };
    expect(() => normalizeSimulationFixtureToEvidence(fixture, badSidecar)).toThrow(
      /INVALID_SIDECAR/
    );
  });

  it("attaches supportingData to evidence items that have metric_key_mappings", () => {
    const fixture = getFixture("SIM-01-001");
    const result = normalizeSimulationFixtureToEvidence(fixture);
    const itemsWithData = result.evidenceItems.filter(
      (e) => e.supportingData && Object.keys(e.supportingData).length > 0
    );
    expect(itemsWithData.length).toBeGreaterThan(0);
  });

  it("loadSimulationFixtures returns corpus with status READY", () => {
    const corpus = loadSimulationFixtures();
    expect(corpus.status).toBe("READY");
  });
});

// ── Engine adapter: calls real diagnosis engine ───────────────────────────────

describe("runSimulationCaseAgainstOpsiq: calls real diagnosis engine", () => {
  it("SIM-01-001 returns a diagnosisResult from the real engine (not mock)", async () => {
    const fixture = getFixture("SIM-01-001");
    const result = await runSimulationCaseAgainstOpsiq(fixture);
    expect(result.unsupportedArchetype).toBe(false);
    if (result.unsupportedArchetype === false) {
      // diagnosisResult must be a real engine output with a primaryRootCause.type field
      expect(result.diagnosisResult).toBeDefined();
      expect(typeof result.diagnosisResult.primaryRootCause.type).toBe("string");
      expect(result.diagnosisResult.primaryRootCause.type.length).toBeGreaterThan(0);
      // output must be a non-empty string (engine prose, not a placeholder)
      expect(typeof result.output).toBe("string");
      expect(result.output.length).toBeGreaterThan(100);
    }
  });

  it("SIM-01-001 score has all required dimension keys", async () => {
    const fixture = getFixture("SIM-01-001");
    const result = await runSimulationCaseAgainstOpsiq(fixture);
    expect(result.score).toBeDefined();
    expect(typeof result.score.totalScore).toBe("number");
    expect(typeof result.score.passed).toBe("boolean");
    expect(result.score.dimensionResults).toBeDefined();
    expect(result.score.dimensionResults.rootCause).toBeDefined();
    expect(result.score.dimensionResults.badRecommendationAvoidance).toBeDefined();
    expect(result.score.dimensionResults.evidenceDiscipline).toBeDefined();
  });

  it("SIM-01-001 failureClassification is set", async () => {
    const fixture = getFixture("SIM-01-001");
    const result = await runSimulationCaseAgainstOpsiq(fixture);
    expect(typeof result.failureClassification).toBe("string");
    expect(result.failureClassification.length).toBeGreaterThan(0);
  });
});

// ── Unsupported cases: SCOPE_GAP path ────────────────────────────────────────

describe("runSimulationCaseAgainstOpsiq: SC-06 case status after W4 reclassification", () => {
  // W4 CORRECTION: SIM-06-001 is now SUPPORTED (operational_bottleneck archetype).
  // The test description and assertions below reflect the corrected state.
  it("SIM-06-001 returns unsupportedArchetype=false (W4: reclassified to supported)", async () => {
    const fixture = getFixture("SIM-06-001");
    const result = await runSimulationCaseAgainstOpsiq(fixture);
    expect(result.unsupportedArchetype).toBe(false);
    expect(result.failureClassification).not.toBe("SIM_ENGINE_GAP");
  });

  it("SIM-06-001 output does not contain SCOPE GAP marker (W4: now a supported diagnosis)", async () => {
    const fixture = getFixture("SIM-06-001");
    const result = await runSimulationCaseAgainstOpsiq(fixture);
    expect(result.output).not.toContain("SCOPE GAP");
  });

  it("SIM-06-002 returns unsupportedArchetype=true (SIM-06-002 remains scope gap)", async () => {
    const fixture = getFixture("SIM-06-002");
    const result = await runSimulationCaseAgainstOpsiq(fixture);
    expect(result.unsupportedArchetype).toBe(true);
    expect(result.failureClassification).toBe("SIM_ENGINE_GAP");
  });

  it("SIM-06-002 output contains SCOPE GAP marker", async () => {
    const fixture = getFixture("SIM-06-002");
    const result = await runSimulationCaseAgainstOpsiq(fixture);
    expect(result.output).toContain("SCOPE GAP");
  });
});

// ── TT-2/TT-4/TT-5: test type markers present only for relevant test types ───

describe("test_type markers: adversarial/data_conflicts/signal_trap appear when present", () => {
  it("TT-2 case (SIM-02-001) fixture has adversarial field", () => {
    const fixture = getFixture("SIM-02-001");
    expect(fixture.test_type).toBe("TT-2");
    expect(fixture.adversarial).toBeDefined();
  });

  it("TT-4 case (SIM-04-001) fixture has test_type TT-4", () => {
    const fixture = getFixture("SIM-04-001");
    expect(fixture.test_type).toBe("TT-4");
  });

  it("TT-5 case (SIM-01-002) fixture has signal_trap_analysis field", () => {
    const fixture = getFixture("SIM-01-002");
    expect(fixture.test_type).toBe("TT-5");
    expect(fixture.signal_trap_analysis).toBeDefined();
  });

  it("TT-1 case (SIM-01-001) does not have adversarial or signal_trap_analysis", () => {
    const fixture = getFixture("SIM-01-001");
    expect(fixture.test_type).toBe("TT-1");
    expect((fixture as Record<string, unknown>)["adversarial"]).toBeUndefined();
    expect((fixture as Record<string, unknown>)["signal_trap_analysis"]).toBeUndefined();
  });
});

// ── Determinism: running the same case twice produces identical scores ─────────

describe("determinism: same case produces identical score on repeated runs", () => {
  it("SIM-02-001 total score is identical across two runs", async () => {
    const fixture = getFixture("SIM-02-001");
    const run1 = await runSimulationCaseAgainstOpsiq(fixture);
    const run2 = await runSimulationCaseAgainstOpsiq(fixture);
    expect(run1.score.totalScore).toBe(run2.score.totalScore);
    expect(run1.score.passed).toBe(run2.score.passed);
    expect(run1.failureClassification).toBe(run2.failureClassification);
  });
});

// ── Full Batch 1: all 12 cases execute without throwing ───────────────────────

describe("Full Batch 1: all 12 simulation cases execute without throwing", () => {
  const BATCH_1 = [
    "SIM-01-001", "SIM-01-002",
    "SIM-02-001", "SIM-02-002",
    "SIM-03-001", "SIM-03-002",
    "SIM-04-001", "SIM-04-002",
    "SIM-05-001", "SIM-05-002",
    "SIM-06-001", "SIM-06-002",
  ];

  for (const caseId of BATCH_1) {
    it(`${caseId} runs to completion and returns a scored result`, async () => {
      const fixture = getFixture(caseId);
      const result = await runSimulationCaseAgainstOpsiq(fixture);
      expect(result.caseId).toBe(caseId);
      expect(typeof result.output).toBe("string");
      expect(result.output.length).toBeGreaterThan(0);
      expect(result.score).toBeDefined();
      expect(typeof result.score.totalScore).toBe("number");
      expect(result.score.totalScore).toBeGreaterThanOrEqual(0);
      expect(result.score.totalScore).toBeLessThanOrEqual(1);
      expect(typeof result.failureClassification).toBe("string");
    });
  }
});
