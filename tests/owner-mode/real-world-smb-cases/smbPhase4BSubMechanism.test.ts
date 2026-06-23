/**
 * Phase 4B sub-mechanism tests: WC_BILLED_NOT_COLLECTED_GAP.
 *
 * Test groups:
 *   G1 — WC_BILLED_NOT_COLLECTED_GAP triggered by generic billing + collection evidence
 *   G2 — Billing-only evidence does NOT trigger WC_BILLED_NOT_COLLECTED_GAP
 *   G3 — Collection-only evidence does NOT trigger WC_BILLED_NOT_COLLECTED_GAP
 *   G4 — Output does NOT contain forbidden phrase "collection process failure"
 *   G5 — Output contains required standard AR terms
 *   G6 — Bad-recommendation guard passes for WC_BILLED_NOT_COLLECTED_GAP
 *   G7 — Leakage guard: no must_identify literals in source as double-quoted strings
 *   G8 — SMB-008 RCA passes; full harness ≥6/9, avg≥0.65, 0 bad recs
 */
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { DiagnosisConfidence, DiagnosisType } from "@/domain/consulting-engine/types";
import {
  type ComposerInput,
  type ComposerSidecar,
  composeOwnerOutput,
  detectSubMechanism,
  buildSubMechanismSentence,
  serializeComposerOutput,
  PER_ARCHETYPE_EXCLUSIONS,
} from "./smbOutputComposer";
import type { SmbFixture } from "./fixtureSchema";
import { scoreOutput } from "./scoringContract";
import { runCaseAgainstOpsiq } from "./runCaseAgainstOpsiq";

const FIXTURE_PATH = join(__dirname, "opsiq_real_world_smb_case_fixtures.jsonl");
const SIDECAR_DIR = join(__dirname, "evidence-hints");
const COMPOSER_SRC = readFileSync(join(__dirname, "smbOutputComposer.ts"), "utf-8");

function loadFixtures(): SmbFixture[] {
  return readFileSync(FIXTURE_PATH, "utf-8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as SmbFixture);
}

function loadSidecar(caseId: string): ComposerSidecar {
  const p = join(SIDECAR_DIR, `${caseId}.evidence-hints.json`);
  return JSON.parse(readFileSync(p, "utf-8")) as ComposerSidecar;
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

// ── G1: WC_BILLED_NOT_COLLECTED_GAP triggers from generic billing + collection evidence ──

describe("G1: WC_BILLED_NOT_COLLECTED_GAP triggers from generic billing+collection signals", () => {
  it("fires when sidecar contains 'billed' and 'collected'", () => {
    const input: ComposerInput = {
      diagnosisResult: makeDiagnosis(DiagnosisType.WORKING_CAPITAL_STRESS),
      evidenceItems: makeEvidence({}),
      sidecar: minimalSidecar("monthly gap between billed and collected revenue"),
      scenario: { business: "Test", missing_inputs_opsiq_should_request: [] },
    };
    expect(detectSubMechanism(input, DiagnosisType.WORKING_CAPITAL_STRESS)).toBe(
      "WC_BILLED_NOT_COLLECTED_GAP"
    );
  });

  it("fires when sidecar contains 'invoice' and 'overdue'", () => {
    const input: ComposerInput = {
      diagnosisResult: makeDiagnosis(DiagnosisType.WORKING_CAPITAL_STRESS),
      evidenceItems: makeEvidence({}),
      sidecar: minimalSidecar("multiple invoice accounts overdue beyond 60 days"),
      scenario: { business: "Test", missing_inputs_opsiq_should_request: [] },
    };
    expect(detectSubMechanism(input, DiagnosisType.WORKING_CAPITAL_STRESS)).toBe(
      "WC_BILLED_NOT_COLLECTED_GAP"
    );
  });

  it("fires when sidecar contains 'billing' and 'follow-up'", () => {
    const input: ComposerInput = {
      diagnosisResult: makeDiagnosis(DiagnosisType.WORKING_CAPITAL_STRESS),
      evidenceItems: makeEvidence({}),
      sidecar: minimalSidecar("billing raised on delivery but follow-up on payment is ad hoc"),
      scenario: { business: "Test", missing_inputs_opsiq_should_request: [] },
    };
    expect(detectSubMechanism(input, DiagnosisType.WORKING_CAPITAL_STRESS)).toBe(
      "WC_BILLED_NOT_COLLECTED_GAP"
    );
  });

  it("fires when sidecar contains 'invoice' and 'aging'", () => {
    const input: ComposerInput = {
      diagnosisResult: makeDiagnosis(DiagnosisType.WORKING_CAPITAL_STRESS),
      evidenceItems: makeEvidence({}),
      sidecar: minimalSidecar("invoice aging report shows 40% of receivables past 60 days"),
      scenario: { business: "Test", missing_inputs_opsiq_should_request: [] },
    };
    expect(detectSubMechanism(input, DiagnosisType.WORKING_CAPITAL_STRESS)).toBe(
      "WC_BILLED_NOT_COLLECTED_GAP"
    );
  });

  it("does NOT trigger when sidecar has payables AND receivables (WC_CASH_CONVERSION_CYCLE takes priority)", () => {
    const input: ComposerInput = {
      diagnosisResult: makeDiagnosis(DiagnosisType.WORKING_CAPITAL_STRESS),
      evidenceItems: makeEvidence({}),
      sidecar: minimalSidecar("billed receivables outstanding 60 days; payables due in 30"),
      scenario: { business: "Test", missing_inputs_opsiq_should_request: [] },
    };
    expect(detectSubMechanism(input, DiagnosisType.WORKING_CAPITAL_STRESS)).toBe(
      "WC_CASH_CONVERSION_CYCLE"
    );
  });
});

// ── G2: Billing-only evidence does NOT trigger WC_BILLED_NOT_COLLECTED_GAP ──────

describe("G2: billing-only evidence does not trigger WC_BILLED_NOT_COLLECTED_GAP", () => {
  it("billing signal alone does not fire (no collection signal)", () => {
    const input: ComposerInput = {
      diagnosisResult: makeDiagnosis(DiagnosisType.WORKING_CAPITAL_STRESS),
      evidenceItems: makeEvidence({}),
      sidecar: minimalSidecar("billed revenue grew 20% year-over-year"),
      scenario: { business: "Test", missing_inputs_opsiq_should_request: [] },
    };
    const result = detectSubMechanism(input, DiagnosisType.WORKING_CAPITAL_STRESS);
    expect(result).not.toBe("WC_BILLED_NOT_COLLECTED_GAP");
    expect(result).toBeNull();
  });

  it("invoice signal alone does not fire (no collection signal)", () => {
    const input: ComposerInput = {
      diagnosisResult: makeDiagnosis(DiagnosisType.WORKING_CAPITAL_STRESS),
      evidenceItems: makeEvidence({}),
      sidecar: minimalSidecar("invoices are sent on net-30 terms to all clients"),
      scenario: { business: "Test", missing_inputs_opsiq_should_request: [] },
    };
    const result = detectSubMechanism(input, DiagnosisType.WORKING_CAPITAL_STRESS);
    expect(result).not.toBe("WC_BILLED_NOT_COLLECTED_GAP");
    expect(result).toBeNull();
  });
});

// ── G3: Collection-only evidence does NOT trigger WC_BILLED_NOT_COLLECTED_GAP ──

describe("G3: collection-only evidence does not trigger WC_BILLED_NOT_COLLECTED_GAP", () => {
  it("collection signal alone does not fire (no billing signal)", () => {
    const input: ComposerInput = {
      diagnosisResult: makeDiagnosis(DiagnosisType.WORKING_CAPITAL_STRESS),
      evidenceItems: makeEvidence({}),
      sidecar: minimalSidecar("collected revenue is down 10% this quarter"),
      scenario: { business: "Test", missing_inputs_opsiq_should_request: [] },
    };
    const result = detectSubMechanism(input, DiagnosisType.WORKING_CAPITAL_STRESS);
    expect(result).not.toBe("WC_BILLED_NOT_COLLECTED_GAP");
    expect(result).toBeNull();
  });

  it("overdue signal alone does not fire (no billing signal)", () => {
    const input: ComposerInput = {
      diagnosisResult: makeDiagnosis(DiagnosisType.WORKING_CAPITAL_STRESS),
      evidenceItems: makeEvidence({}),
      sidecar: minimalSidecar("supplier payments overdue by 45 days on average"),
      scenario: { business: "Test", missing_inputs_opsiq_should_request: [] },
    };
    const result = detectSubMechanism(input, DiagnosisType.WORKING_CAPITAL_STRESS);
    expect(result).not.toBe("WC_BILLED_NOT_COLLECTED_GAP");
    expect(result).toBeNull();
  });
});

// ── G4: Output does NOT contain forbidden phrase ──────────────────────────────

describe("G4: WC_BILLED_NOT_COLLECTED_GAP output does not contain forbidden phrase", () => {
  it("sentence does not include 'collection process failure'", () => {
    const input: ComposerInput = {
      diagnosisResult: makeDiagnosis(DiagnosisType.WORKING_CAPITAL_STRESS),
      evidenceItems: makeEvidence({}),
      sidecar: {
        ...minimalSidecar("billed revenue not yet collected; overdue accounts accumulating"),
        metric_key_mappings: [
          { fixture_key: "x", canonical_key: "dso", evidence_item_index: 0, value_override: 67 },
        ],
      },
      scenario: { business: "Test", missing_inputs_opsiq_should_request: [] },
    };
    const sentence = buildSubMechanismSentence(input, "WC_BILLED_NOT_COLLECTED_GAP");
    expect(sentence.toLowerCase()).not.toContain("collection process failure");
  });

  it("composer output does not include 'collection process failure' for generic billing+collected input", () => {
    const input: ComposerInput = {
      diagnosisResult: makeDiagnosis(DiagnosisType.WORKING_CAPITAL_STRESS),
      evidenceItems: makeEvidence({ dso: 45 }),
      sidecar: minimalSidecar("monthly gap between billed and collected client payments"),
      scenario: { business: "Test", missing_inputs_opsiq_should_request: [] },
    };
    const output = composeOwnerOutput(input);
    const serialized = serializeComposerOutput(output);
    expect(serialized.toLowerCase()).not.toContain("collection process failure");
  });
});

// ── G5: Output contains required standard AR terms ────────────────────────────

describe("G5: WC_BILLED_NOT_COLLECTED_GAP output contains required standard AR terms", () => {
  it("sentence contains 'billed vs collected'", () => {
    const input: ComposerInput = {
      diagnosisResult: makeDiagnosis(DiagnosisType.WORKING_CAPITAL_STRESS),
      evidenceItems: makeEvidence({}),
      sidecar: minimalSidecar("billed revenue exceeds collected; overdue accounts noted"),
      scenario: { business: "Test", missing_inputs_opsiq_should_request: [] },
    };
    const sentence = buildSubMechanismSentence(input, "WC_BILLED_NOT_COLLECTED_GAP");
    expect(sentence).toContain(`billed vs collected`);
  });

  it("sentence contains 'cash flow gap'", () => {
    const input: ComposerInput = {
      diagnosisResult: makeDiagnosis(DiagnosisType.WORKING_CAPITAL_STRESS),
      evidenceItems: makeEvidence({}),
      sidecar: minimalSidecar("billed revenue exceeds collected; overdue accounts noted"),
      scenario: { business: "Test", missing_inputs_opsiq_should_request: [] },
    };
    const sentence = buildSubMechanismSentence(input, "WC_BILLED_NOT_COLLECTED_GAP");
    expect(sentence).toContain(`cash flow gap`);
  });

  it("sentence with DSO numeric contains 'days sales outstanding'", () => {
    const input: ComposerInput = {
      diagnosisResult: makeDiagnosis(DiagnosisType.WORKING_CAPITAL_STRESS),
      evidenceItems: makeEvidence({}),
      sidecar: {
        ...minimalSidecar("billed revenue; overdue accounts growing"),
        metric_key_mappings: [
          { fixture_key: "x", canonical_key: "dso", evidence_item_index: 0, value_override: 67 },
        ],
      },
      scenario: { business: "Test", missing_inputs_opsiq_should_request: [] },
    };
    const sentence = buildSubMechanismSentence(input, "WC_BILLED_NOT_COLLECTED_GAP");
    expect(sentence).toContain(`days sales outstanding`);
  });
});

// ── G6: Bad-recommendation guard passes ───────────────────────────────────────

describe("G6: bad-recommendation guard passes for WC_BILLED_NOT_COLLECTED_GAP", () => {
  const wcExclusions = PER_ARCHETYPE_EXCLUSIONS[DiagnosisType.WORKING_CAPITAL_STRESS];
  const sentence = buildSubMechanismSentence(
    {
      diagnosisResult: makeDiagnosis(DiagnosisType.WORKING_CAPITAL_STRESS),
      evidenceItems: makeEvidence({}),
      sidecar: minimalSidecar("billed revenue; overdue invoices accumulating"),
      scenario: { business: "Test", missing_inputs_opsiq_should_request: [] },
    },
    "WC_BILLED_NOT_COLLECTED_GAP"
  );

  for (const exclusion of wcExclusions) {
    it(`sentence does not contain exclusion: "${exclusion}"`, () => {
      expect(sentence.toLowerCase()).not.toContain(exclusion.toLowerCase());
    });
  }
});

// ── G7: Leakage guard — new Phase 4B vocabulary not copied verbatim from fixture must_identify ──
// Only check the two NEW terms introduced in Phase 4B. Pre-existing terms like
// "accounts receivable" appear legitimately in CANONICAL_METRIC_LABELS vocabulary.

describe("G7: leakage guard — Phase 4B new terms not as exact double-quoted must_identify literals", () => {
  const phase4bNewTerms = [
    `billed vs collected`,
    `cash flow gap`,
  ];

  for (const term of phase4bNewTerms) {
    it(`Phase 4B term "${term}" does not appear as a double-quoted string literal in composer source`, () => {
      expect(COMPOSER_SRC).not.toContain(`"${term}"`);
    });
  }
});

// ── G8: SMB-008 RCA pass + full harness ───────────────────────────────────────

describe("G8: SMB-008 RCA pass and full harness gates", () => {
  it("SMB-008 RCA passes after WC_BILLED_NOT_COLLECTED_GAP implementation", async () => {
    const fixtures = loadFixtures();
    const smb008 = fixtures.find((f) => f.case_id === "SMB-008")!;
    const result = await runCaseAgainstOpsiq(smb008);
    const score = scoreOutput(result.output, smb008);
    expect(score.dimensionResults.ROOT_CAUSE_ALIGNMENT.passed).toBe(true);
    expect(score.dimensionResults.ROOT_CAUSE_ALIGNMENT.score).toBeGreaterThanOrEqual(0.60);
  }, 60000);

  it("WC_CASH_CONVERSION_CYCLE still fires for SMB-001 (no regression)", async () => {
    const fixtures = loadFixtures();
    const smb001 = fixtures.find((f) => f.case_id === "SMB-001")!;
    const sidecar = loadSidecar("SMB-001");
    const input: ComposerInput = {
      diagnosisResult: makeDiagnosis(DiagnosisType.WORKING_CAPITAL_STRESS),
      evidenceItems: makeEvidence({}),
      sidecar,
      scenario: { business: "Test", missing_inputs_opsiq_should_request: smb001.scenario.missing_inputs_opsiq_should_request },
    };
    expect(detectSubMechanism(input, DiagnosisType.WORKING_CAPITAL_STRESS)).toBe("WC_CASH_CONVERSION_CYCLE");
  });

  it("full harness: ≥6/9 supported cases pass", async () => {
    const fixtures = loadFixtures();
    const SUPPORTED = ["SMB-001","SMB-002","SMB-003","SMB-004","SMB-006","SMB-007","SMB-008","SMB-010","SMB-012"];
    const supported = fixtures.filter((f) => SUPPORTED.includes(f.case_id));
    let passes = 0;
    for (const fixture of supported) {
      const result = await runCaseAgainstOpsiq(fixture);
      const score = scoreOutput(result.output, fixture);
      if (score.passed) passes++;
    }
    expect(passes).toBeGreaterThanOrEqual(6);
  }, 120000);

  it("full harness: average score ≥0.65 across supported cases", async () => {
    const fixtures = loadFixtures();
    const SUPPORTED = ["SMB-001","SMB-002","SMB-003","SMB-004","SMB-006","SMB-007","SMB-008","SMB-010","SMB-012"];
    const supported = fixtures.filter((f) => SUPPORTED.includes(f.case_id));
    let total = 0;
    for (const fixture of supported) {
      const result = await runCaseAgainstOpsiq(fixture);
      const score = scoreOutput(result.output, fixture);
      total += score.totalScore;
    }
    expect(total / supported.length).toBeGreaterThanOrEqual(0.65);
  }, 120000);

  it("full harness: zero bad recommendation violations", async () => {
    const fixtures = loadFixtures();
    const SUPPORTED = ["SMB-001","SMB-002","SMB-003","SMB-004","SMB-006","SMB-007","SMB-008","SMB-010","SMB-012"];
    const supported = fixtures.filter((f) => SUPPORTED.includes(f.case_id));
    let violations = 0;
    for (const fixture of supported) {
      const result = await runCaseAgainstOpsiq(fixture);
      const score = scoreOutput(result.output, fixture);
      if (!score.dimensionResults.BAD_RECOMMENDATION_AVOIDANCE.passed) violations++;
    }
    expect(violations).toBe(0);
  }, 120000);
});
