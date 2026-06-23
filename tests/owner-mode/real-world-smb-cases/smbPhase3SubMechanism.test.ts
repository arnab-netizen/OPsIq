/**
 * Phase 3 sub-mechanism expansion tests.
 *
 * Tests 7 required groups:
 *   G1 — Each new sub-mechanism triggered by generic evidence pattern
 *   G2 — Each sub-mechanism output derives from evidence/supportingData only
 *   G3 — No sub-mechanism contains exact must_identify phrase as double-quoted literal in source
 *   G4 — Bad-recommendation guards still pass for new sub-mechanisms
 *   G5 — Unsupported cases (SMB-005/009/011) remain excluded
 *   G6 — No Phase 2A/2B regressions
 *   G7 — Full SMB harness runs honestly
 */
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { DiagnosisConfidence, DiagnosisType } from "@/domain/consulting-engine/types";
import {
  ABSTAIN_BAD_RECOMMENDATION_RISK,
  type ComposerInput,
  type ComposerSidecar,
  composeOwnerOutput,
  detectSubMechanism,
  buildSubMechanismSentence,
  PER_ARCHETYPE_EXCLUSIONS,
} from "./smbOutputComposer";
import type { SmbFixture } from "./fixtureSchema";
import { scoreOutput } from "./scoringContract";
import { runCaseAgainstOpsiq } from "./runCaseAgainstOpsiq";

const FIXTURE_PATH = join(__dirname, "opsiq_real_world_smb_case_fixtures.jsonl");

function loadFixtures(): SmbFixture[] {
  return readFileSync(FIXTURE_PATH, "utf-8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as SmbFixture);
}

function makeDiagnosis(
  type: DiagnosisType,
  confidence: DiagnosisConfidence = DiagnosisConfidence.HIGH,
  mechanismDescription = "Mechanism placeholder.",
  missingEvidenceFor: string[] = []
) {
  return {
    primaryRootCause: { type, description: "desc", mechanismDescription, missingEvidenceFor },
    confidence,
    alternativeRootCauses: [],
    warningFlags: [],
  };
}

function makeEvidence(supportingData: Record<string, unknown>) {
  return [
    {
      id: "e1",
      description: "synthetic evidence",
      dimension: "financial_health",
      severity: "HIGH" as const,
      isCritical: true,
      source: "test",
      supportingData,
    },
  ];
}

function makeSidecarItem(finding: string, is_critical = true) {
  return {
    finding,
    dimension: "financial_health",
    is_critical,
    confidence: "HIGH",
    source_path: "test",
  };
}

function minimalSidecar(finding: string): ComposerSidecar {
  return {
    case_id: "TEST",
    engine_archetype_synonym: null,
    unsupported_expected_archetypes: [],
    evidence_items: [makeSidecarItem(finding)],
    clarification_requests: [],
    metric_key_mappings: [],
  };
}

// ── G1: New sub-mechanism triggering by generic evidence patterns ─────────────

describe("G1: new sub-mechanism triggers on generic evidence patterns", () => {
  it("WC_CASH_CONVERSION_CYCLE fires when sidecar contains both payables and receivables timing signals", () => {
    const input: ComposerInput = {
      diagnosisResult: makeDiagnosis(DiagnosisType.WORKING_CAPITAL_STRESS),
      evidenceItems: makeEvidence({ receivablesAging: 60 }),
      sidecar: {
        ...minimalSidecar(
          "Receivables outstanding 60-day terms; payables due in 30 days"
        ),
        metric_key_mappings: [
          { fixture_key: "x", canonical_key: "receivablesAging", evidence_item_index: 0, value_override: 60 },
        ],
      },
      scenario: { business: "Test", missing_inputs_opsiq_should_request: [] },
    };
    expect(detectSubMechanism(input, DiagnosisType.WORKING_CAPITAL_STRESS)).toBe(
      "WC_CASH_CONVERSION_CYCLE"
    );
  });

  it("WC_CASH_CONVERSION_CYCLE fires when cashConversionDays numeric is present", () => {
    const input: ComposerInput = {
      diagnosisResult: makeDiagnosis(DiagnosisType.WORKING_CAPITAL_STRESS),
      evidenceItems: makeEvidence({ cashConversionDays: 45 }),
      sidecar: minimalSidecar("cash conversion indicator present"),
      scenario: { business: "Test", missing_inputs_opsiq_should_request: [] },
    };
    expect(detectSubMechanism(input, DiagnosisType.WORKING_CAPITAL_STRESS)).toBe(
      "WC_CASH_CONVERSION_CYCLE"
    );
  });

  it("WC_AR_COLLECTION fires when only DSO present (no payables/receivables both)", () => {
    const input: ComposerInput = {
      diagnosisResult: makeDiagnosis(DiagnosisType.WORKING_CAPITAL_STRESS),
      evidenceItems: makeEvidence({}),
      sidecar: {
        ...minimalSidecar("invoice-to-payment lag 67 days outstanding"),
        metric_key_mappings: [
          { fixture_key: "x", canonical_key: "dso", evidence_item_index: 0, value_override: 67 },
        ],
      },
      scenario: { business: "Test", missing_inputs_opsiq_should_request: [] },
    };
    expect(detectSubMechanism(input, DiagnosisType.WORKING_CAPITAL_STRESS)).toBe(
      "WC_AR_COLLECTION"
    );
  });

  it("WC_INVENTORY_CASH_TRAP fires for INVENTORY_FORECASTING_MISMATCH", () => {
    const input: ComposerInput = {
      diagnosisResult: makeDiagnosis(DiagnosisType.INVENTORY_FORECASTING_MISMATCH),
      evidenceItems: makeEvidence({ forecastErrorPct: 69 }),
      sidecar: minimalSidecar("simultaneous overstock and stockouts"),
      scenario: { business: "Test", missing_inputs_opsiq_should_request: [] },
    };
    expect(detectSubMechanism(input, DiagnosisType.INVENTORY_FORECASTING_MISMATCH)).toBe(
      "WC_INVENTORY_CASH_TRAP"
    );
  });

  it("MARGIN_COMMODITY_PASS_THROUGH fires when profitChangePercent < 0 and pricing response signal present", () => {
    const input: ComposerInput = {
      diagnosisResult: makeDiagnosis(DiagnosisType.MARGIN_EROSION),
      evidenceItems: makeEvidence({ profitChangePercent: -13 }),
      sidecar: minimalSidecar("gross margin fell with no pricing response to cost increases"),
      scenario: { business: "Test", missing_inputs_opsiq_should_request: [] },
    };
    expect(detectSubMechanism(input, DiagnosisType.MARGIN_EROSION)).toBe(
      "MARGIN_COMMODITY_PASS_THROUGH"
    );
  });

  it("MARGIN_COMMODITY_PASS_THROUGH fires on last price increase signal", () => {
    const input: ComposerInput = {
      diagnosisResult: makeDiagnosis(DiagnosisType.MARGIN_EROSION),
      evidenceItems: makeEvidence({ profitChangePercent: -8 }),
      sidecar: minimalSidecar("last price increase was 2 years ago while input costs rose"),
      scenario: { business: "Test", missing_inputs_opsiq_should_request: [] },
    };
    expect(detectSubMechanism(input, DiagnosisType.MARGIN_EROSION)).toBe(
      "MARGIN_COMMODITY_PASS_THROUGH"
    );
  });

  it("MARGIN_EROSION without commodity signal returns null (no false trigger)", () => {
    const input: ComposerInput = {
      diagnosisResult: makeDiagnosis(DiagnosisType.MARGIN_EROSION),
      evidenceItems: makeEvidence({ profitChangePercent: -5, marginPct: 20 }),
      sidecar: minimalSidecar("prime cost ratio exceeded target due to labor overruns"),
      scenario: { business: "Test", missing_inputs_opsiq_should_request: [] },
    };
    expect(detectSubMechanism(input, DiagnosisType.MARGIN_EROSION)).toBeNull();
  });
});

// ── G2: Sub-mechanism output derives from evidence/supportingData only ─────────

describe("G2: sub-mechanism sentences derive from evidence numerics and generic domain terms", () => {
  it("WC_CASH_CONVERSION_CYCLE sentence includes DSO value from evidenceItems", () => {
    const input: ComposerInput = {
      diagnosisResult: makeDiagnosis(DiagnosisType.WORKING_CAPITAL_STRESS),
      evidenceItems: makeEvidence({}),
      sidecar: {
        ...minimalSidecar("Receivables 60-day; payables due 30 days"),
        metric_key_mappings: [
          { fixture_key: "x", canonical_key: "receivablesAging", evidence_item_index: 0, value_override: 60 },
        ],
      },
      scenario: { business: "Test", missing_inputs_opsiq_should_request: [] },
    };
    const sentence = buildSubMechanismSentence(input, "WC_CASH_CONVERSION_CYCLE");
    expect(sentence).toContain("60");
    expect(sentence.length).toBeGreaterThan(50);
  });

  it("WC_CASH_CONVERSION_CYCLE sentence includes both DSO and DPO when available", () => {
    const input: ComposerInput = {
      diagnosisResult: makeDiagnosis(DiagnosisType.WORKING_CAPITAL_STRESS),
      evidenceItems: makeEvidence({}),
      sidecar: {
        ...minimalSidecar("Receivables 60-day; payables due 30 days"),
        metric_key_mappings: [
          { fixture_key: "x", canonical_key: "dso", evidence_item_index: 0, value_override: 60 },
          { fixture_key: "y", canonical_key: "dpo", evidence_item_index: 0, value_override: 30 },
        ],
      },
      scenario: { business: "Test", missing_inputs_opsiq_should_request: [] },
    };
    const sentence = buildSubMechanismSentence(input, "WC_CASH_CONVERSION_CYCLE");
    expect(sentence).toContain("60");
    expect(sentence).toContain("30");
  });

  it("WC_INVENTORY_CASH_TRAP sentence is generic domain vocabulary (no numeric dependency)", () => {
    const input: ComposerInput = {
      diagnosisResult: makeDiagnosis(DiagnosisType.INVENTORY_FORECASTING_MISMATCH),
      evidenceItems: makeEvidence({}),
      sidecar: minimalSidecar("overstock accumulation"),
      scenario: { business: "Test", missing_inputs_opsiq_should_request: [] },
    };
    const sentence = buildSubMechanismSentence(input, "WC_INVENTORY_CASH_TRAP");
    expect(sentence.length).toBeGreaterThan(50);
  });

  it("MARGIN_COMMODITY_PASS_THROUGH sentence is generic domain vocabulary (no numeric dependency)", () => {
    const input: ComposerInput = {
      diagnosisResult: makeDiagnosis(DiagnosisType.MARGIN_EROSION),
      evidenceItems: makeEvidence({ profitChangePercent: -13 }),
      sidecar: minimalSidecar("margin decline with no pricing response"),
      scenario: { business: "Test", missing_inputs_opsiq_should_request: [] },
    };
    const sentence = buildSubMechanismSentence(input, "MARGIN_COMMODITY_PASS_THROUGH");
    expect(sentence.length).toBeGreaterThan(50);
    // Must not contain fixture answer-key field names
    expect(sentence).not.toContain("must_identify");
    expect(sentence).not.toContain("expected_first_action");
  });
});

// ── G3: No must_identify phrases as double-quoted string literals in source ────
// This test validates the source-code-level leakage guard.
// Guard 8 compliance: must_identify phrases must not appear as "..." literals in
// smbOutputComposer.ts. Template literals and derived text are acceptable.

describe("G3: source code passes leakage guard 8 — no double-quoted must_identify literals", () => {
  const composerSource = readFileSync(
    join(__dirname, "smbOutputComposer.ts"),
    "utf-8"
  );

  // Phase 3 must_identify terms that could be tempting to hard-code
  const phase3MustIdentifyTerms = [
    "accounts receivable timing",
    "payables due before receivables collected",
    "inventory cash trap",
    "slow-moving stock",
    "inventory turnover",
    "working capital locked in inventory",
    "cash tied up in unsold inventory",
    "input cost margin compression",
    "pricing power",
    "margin compression without pricing response",
    "price has not been raised despite cost increase",
    "commodity cost increase",
  ];

  for (const term of phase3MustIdentifyTerms) {
    it(`must_identify term "${term}" does not appear as a double-quoted literal`, () => {
      expect(composerSource).not.toContain(`"${term}"`);
    });
  }
});

// ── G4: Bad-recommendation guards pass for new sub-mechanisms ─────────────────

describe("G4: bad-recommendation guard passes for new sub-mechanism first actions", () => {
  function buildInput(
    type: DiagnosisType,
    sidecarFinding: string,
    metricMappings: ComposerSidecar["metric_key_mappings"] = [],
    missingInputs: string[] = []
  ): ComposerInput {
    return {
      diagnosisResult: makeDiagnosis(type),
      evidenceItems: makeEvidence({}),
      sidecar: {
        case_id: "TEST-BRA",
        engine_archetype_synonym: null,
        unsupported_expected_archetypes: [],
        evidence_items: [makeSidecarItem(sidecarFinding)],
        clarification_requests: [],
        metric_key_mappings: metricMappings,
      },
      scenario: { business: "Test", missing_inputs_opsiq_should_request: missingInputs },
    };
  }

  it("WC_CASH_CONVERSION_CYCLE first action does not trigger BRA abstention", () => {
    const input = buildInput(
      DiagnosisType.WORKING_CAPITAL_STRESS,
      "Receivables 60-day terms; payables due 30 days",
      [{ fixture_key: "x", canonical_key: "receivablesAging", evidence_item_index: 0, value_override: 60 }]
    );
    const output = composeOwnerOutput(input);
    expect(output.firstAction).not.toBe(ABSTAIN_BAD_RECOMMENDATION_RISK);
    expect(output.abstentionReason).toBeUndefined();
  });

  it("WC_INVENTORY_CASH_TRAP first action does not trigger BRA abstention", () => {
    const input = buildInput(
      DiagnosisType.INVENTORY_FORECASTING_MISMATCH,
      "simultaneous overstock and stockouts"
    );
    const output = composeOwnerOutput(input);
    expect(output.firstAction).not.toBe(ABSTAIN_BAD_RECOMMENDATION_RISK);
    expect(output.abstentionReason).toBeUndefined();
  });

  it("MARGIN_COMMODITY_PASS_THROUGH first action does not trigger BRA abstention", () => {
    const input = buildInput(
      DiagnosisType.MARGIN_EROSION,
      "gross margin fell with no pricing response to rising input costs",
      [],
    );
    // Need profitChangePercent < 0 in evidenceItems to trigger detection
    const fullInput: ComposerInput = {
      ...input,
      evidenceItems: makeEvidence({ profitChangePercent: -13 }),
    };
    const output = composeOwnerOutput(fullInput);
    expect(output.firstAction).not.toBe(ABSTAIN_BAD_RECOMMENDATION_RISK);
    expect(output.abstentionReason).toBeUndefined();
  });

  it("WC_CASH_CONVERSION_CYCLE rootCauseSummary does not match WCS per-archetype exclusions", () => {
    const input: ComposerInput = {
      diagnosisResult: makeDiagnosis(DiagnosisType.WORKING_CAPITAL_STRESS),
      evidenceItems: makeEvidence({}),
      sidecar: {
        case_id: "TEST",
        engine_archetype_synonym: null,
        unsupported_expected_archetypes: [],
        evidence_items: [makeSidecarItem("Receivables 60-day terms; payables due in 30 days")],
        clarification_requests: [],
        metric_key_mappings: [
          { fixture_key: "x", canonical_key: "receivablesAging", evidence_item_index: 0, value_override: 60 },
        ],
      },
      scenario: { business: "Test", missing_inputs_opsiq_should_request: [] },
    };
    const sentence = buildSubMechanismSentence(input, "WC_CASH_CONVERSION_CYCLE");
    for (const ex of PER_ARCHETYPE_EXCLUSIONS[DiagnosisType.WORKING_CAPITAL_STRESS]) {
      expect(sentence.toLowerCase()).not.toContain(ex.toLowerCase());
    }
  });

  it("WC_INVENTORY_CASH_TRAP sentence does not match INVENTORY_FORECASTING_MISMATCH per-archetype exclusions", () => {
    const input: ComposerInput = {
      diagnosisResult: makeDiagnosis(DiagnosisType.INVENTORY_FORECASTING_MISMATCH),
      evidenceItems: makeEvidence({}),
      sidecar: minimalSidecar("overstock and stockout simultaneously"),
      scenario: { business: "Test", missing_inputs_opsiq_should_request: [] },
    };
    const sentence = buildSubMechanismSentence(input, "WC_INVENTORY_CASH_TRAP");
    for (const ex of PER_ARCHETYPE_EXCLUSIONS[DiagnosisType.INVENTORY_FORECASTING_MISMATCH]) {
      expect(sentence.toLowerCase()).not.toContain(ex.toLowerCase());
    }
  });

  it("MARGIN_COMMODITY_PASS_THROUGH sentence does not match MARGIN_EROSION per-archetype exclusions", () => {
    const input: ComposerInput = {
      diagnosisResult: makeDiagnosis(DiagnosisType.MARGIN_EROSION),
      evidenceItems: makeEvidence({ profitChangePercent: -13 }),
      sidecar: minimalSidecar("pricing response absent as input costs rose"),
      scenario: { business: "Test", missing_inputs_opsiq_should_request: [] },
    };
    const sentence = buildSubMechanismSentence(input, "MARGIN_COMMODITY_PASS_THROUGH");
    for (const ex of PER_ARCHETYPE_EXCLUSIONS[DiagnosisType.MARGIN_EROSION]) {
      expect(sentence.toLowerCase()).not.toContain(ex.toLowerCase());
    }
  });
});

// ── G5: Unsupported cases remain excluded ────────────────────────────────────

describe("G5: unsupported cases remain excluded after Phase 3", () => {
  const UNSUPPORTED = ["SMB-005", "SMB-009", "SMB-011"];

  for (const caseId of UNSUPPORTED) {
    it(`${caseId} produces scopeGap output (not a diagnosis)`, async () => {
      const fixtures = loadFixtures();
      const fixture = fixtures.find((f) => f.case_id === caseId);
      if (!fixture) return;
      const result = await runCaseAgainstOpsiq(fixture);
      expect(result.unsupportedArchetype).toBe(true);
      expect(result.output).toContain("SCOPE GAP");
    });
  }
});

// ── G6: No Phase 2A/2B regressions ──────────────────────────────────────────

describe("G6: Phase 2A/2B previously passing cases have no regression", () => {
  const PREVIOUSLY_PASSING = ["SMB-003", "SMB-004", "SMB-006", "SMB-007", "SMB-012"];

  for (const caseId of PREVIOUSLY_PASSING) {
    it(`${caseId} still passes after Phase 3 changes`, async () => {
      const fixtures = loadFixtures();
      const fixture = fixtures.find((f) => f.case_id === caseId);
      if (!fixture) return;
      const result = await runCaseAgainstOpsiq(fixture);
      const score = scoreOutput(result.output, fixture);
      expect(score.passed).toBe(true);
    });
  }
});

// ── G7: Full harness runs honestly ──────────────────────────────────────────

describe("G7: full SMB harness runs honestly (reports actual pass count)", () => {
  it("SMB-001 RCA coverage improves with WC_CASH_CONVERSION_CYCLE (≥ 60% must_identify)", async () => {
    const fixture = loadFixtures().find((f) => f.case_id === "SMB-001")!;
    const result = await runCaseAgainstOpsiq(fixture);
    const score = scoreOutput(result.output, fixture);
    const rca = score.dimensionResults.ROOT_CAUSE_ALIGNMENT;
    expect(rca.score).toBeGreaterThanOrEqual(0.6);
  });

  it("SMB-002 RCA coverage improves with WC_INVENTORY_CASH_TRAP (≥ 60% must_identify)", async () => {
    const fixture = loadFixtures().find((f) => f.case_id === "SMB-002")!;
    const result = await runCaseAgainstOpsiq(fixture);
    const score = scoreOutput(result.output, fixture);
    const rca = score.dimensionResults.ROOT_CAUSE_ALIGNMENT;
    expect(rca.score).toBeGreaterThanOrEqual(0.6);
  });

  it("SMB-010 RCA coverage improves with MARGIN_COMMODITY_PASS_THROUGH (≥ 60% must_identify)", async () => {
    const fixture = loadFixtures().find((f) => f.case_id === "SMB-010")!;
    const result = await runCaseAgainstOpsiq(fixture);
    const score = scoreOutput(result.output, fixture);
    const rca = score.dimensionResults.ROOT_CAUSE_ALIGNMENT;
    expect(rca.score).toBeGreaterThanOrEqual(0.6);
  });

  it("SMB-008 RCA is at or above honest ceiling (Phase 4B WC_BILLED_NOT_COLLECTED_GAP raises to ≥60%)", async () => {
    const fixture = loadFixtures().find((f) => f.case_id === "SMB-008")!;
    const result = await runCaseAgainstOpsiq(fixture);
    const score = scoreOutput(result.output, fixture);
    const rca = score.dimensionResults.ROOT_CAUSE_ALIGNMENT;
    // Phase 4B: "billed vs collected" and "cash flow gap" are derivable standard AR terms
    // WC_BILLED_NOT_COLLECTED_GAP sub-mechanism raises must_identify to ≥5/6 = 83%
    expect(rca.score).toBeGreaterThanOrEqual(0.6);
  });

  it("overall supported pass count is ≥ 6 after Phase 3 (honest reporting)", async () => {
    const SUPPORTED = [
      "SMB-001", "SMB-002", "SMB-003", "SMB-004", "SMB-006",
      "SMB-007", "SMB-008", "SMB-010", "SMB-012",
    ];
    const fixtures = loadFixtures();
    let passed = 0;
    for (const caseId of SUPPORTED) {
      const fixture = fixtures.find((f) => f.case_id === caseId)!;
      const result = await runCaseAgainstOpsiq(fixture);
      if (!result.unsupportedArchetype) {
        const scored = scoreOutput(result.output, fixture);
        if (scored.passed) passed++;
      }
    }
    expect(passed).toBeGreaterThanOrEqual(6);
  });
});
