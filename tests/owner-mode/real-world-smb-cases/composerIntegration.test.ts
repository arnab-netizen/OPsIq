/**
 * Composer integration tests — Suites A through I.
 *
 * These tests exercise the SMB output composer against real fixtures + sidecars
 * through the wired runner, and verify the leakage barrier, evidence-first
 * composition, missing-input requests, first-action quality, R-BRA exclusions,
 * scope gaps, and determinism.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { loadRealWorldSmbFixtures } from "./loadFixtures";
import { normalizeFixtureToEvidence } from "./normalizeFixtureToEvidence";
import { diagnoseRootCause } from "@/services/consulting-engine/diagnosis-engine";
import {
  DiagnosisConfidence,
  DiagnosisType,
} from "@/domain/consulting-engine/types";
import type { DiagnosisResult } from "@/services/consulting-engine/diagnosis-engine";
import {
  composeOwnerOutput,
  serializeComposerOutput,
  ABSTAIN_BAD_RECOMMENDATION_RISK,
  type ComposerInput,
  type ComposerSidecar,
} from "./smbOutputComposer";

const SIDECAR_DIR = join(__dirname, "evidence-hints");
const COMPOSER_SOURCE = readFileSync(
  join(__dirname, "smbOutputComposer.ts"),
  "utf-8"
);

const SUPPORTED_IDS = [
  "SMB-001",
  "SMB-002",
  "SMB-003",
  "SMB-004",
  "SMB-006",
  "SMB-007",
  "SMB-008",
  "SMB-010",
  "SMB-012",
];
const UNSUPPORTED_IDS = ["SMB-005", "SMB-009", "SMB-011"];

function loadSidecar(caseId: string): ComposerSidecar {
  const raw = JSON.parse(
    readFileSync(join(SIDECAR_DIR, `${caseId}.evidence-hints.json`), "utf-8")
  ) as Record<string, unknown>;
  return {
    case_id: raw.case_id as string,
    engine_archetype_synonym:
      (raw.engine_archetype_synonym as string | null) ?? null,
    unsupported_expected_archetypes:
      (raw.unsupported_expected_archetypes as ComposerSidecar["unsupported_expected_archetypes"]) ??
      [],
    evidence_items: (raw.evidence_items as ComposerSidecar["evidence_items"]) ?? [],
    clarification_requests:
      (raw.clarification_requests as ComposerSidecar["clarification_requests"]) ??
      [],
    metric_key_mappings:
      (raw.metric_key_mappings as ComposerSidecar["metric_key_mappings"]) ?? [],
  };
}

function buildInput(caseId: string): ComposerInput {
  const fixture = loadRealWorldSmbFixtures().find((f) => f.case_id === caseId)!;
  const norm = normalizeFixtureToEvidence(fixture);
  const diagnosisResult = diagnoseRootCause(
    norm.evidenceItems,
    fixture.scenario.business
  );
  return {
    diagnosisResult,
    evidenceItems: norm.evidenceItems,
    sidecar: loadSidecar(caseId),
    scenario: {
      business: fixture.scenario.business,
      missing_inputs_opsiq_should_request:
        fixture.scenario.missing_inputs_opsiq_should_request,
    },
  };
}

const FAQ_VERBS = [
  "build",
  "run",
  "calculate",
  "implement",
  "map",
  "produce",
  "obtain",
  "document",
  "model",
  "define",
  "identify",
  "audit",
  "separate",
  "engage",
];

// ── Suite A: source isolation ─────────────────────────────────────────────────

describe("Suite A: composer source isolation", () => {
  it("does not reference expected_opsiq_diagnosis", () => {
    expect(COMPOSER_SOURCE).not.toContain("expected_opsiq_diagnosis");
  });
  it("does not reference scoring_criteria", () => {
    expect(COMPOSER_SOURCE).not.toContain("scoring_criteria");
  });
  it("does not reference must_identify", () => {
    expect(COMPOSER_SOURCE).not.toContain("must_identify");
  });
  it("does not reference bad_recommendations_to_flag", () => {
    expect(COMPOSER_SOURCE).not.toContain("bad_recommendations_to_flag");
  });
  it("does not reference expected_first_action", () => {
    expect(COMPOSER_SOURCE).not.toContain("expected_first_action");
  });
});

// ── Suite B: root cause summary uses evidence, not just static archetype text ──

describe("Suite B: evidence-first root cause summary", () => {
  for (const caseId of SUPPORTED_IDS) {
    it(`${caseId}: rootCauseSummary contains a critical evidence finding`, () => {
      const input = buildInput(caseId);
      const output = composeOwnerOutput(input);
      const critical = input.sidecar.evidence_items.filter((e) => e.is_critical);
      const containsAFinding = critical.some((e) =>
        output.rootCauseSummary.includes(e.finding.trim())
      );
      expect(containsAFinding).toBe(true);
    });
    it(`${caseId}: rootCauseSummary is not only the archetype preamble + mechanism`, () => {
      const input = buildInput(caseId);
      const output = composeOwnerOutput(input);
      const mech =
        input.diagnosisResult.primaryRootCause.mechanismDescription ?? "";
      const withoutMech = output.rootCauseSummary.replace(mech, "").trim();
      expect(withoutMech.length).toBeGreaterThan(80);
    });
  }
});

// ── Suite C: missing inputs are present ───────────────────────────────────────

describe("Suite C: missing input requests", () => {
  for (const caseId of SUPPORTED_IDS) {
    it(`${caseId}: missingInputsToRequest is non-empty`, () => {
      const output = composeOwnerOutput(buildInput(caseId));
      expect(output.missingInputsToRequest.length).toBeGreaterThanOrEqual(1);
    });
  }

  it("indexed missing inputs match scenario text verbatim where index is defined", () => {
    for (const caseId of SUPPORTED_IDS) {
      const input = buildInput(caseId);
      const output = composeOwnerOutput(input);
      const indexed = input.sidecar.clarification_requests.filter(
        (r) => r.missing_input_index !== null
      );
      if (indexed.length === 0) continue;
      const anyVerbatim = indexed.some((r) => {
        const text =
          input.scenario.missing_inputs_opsiq_should_request[
            r.missing_input_index as number
          ];
        return text !== undefined && output.missingInputsToRequest.includes(text);
      });
      expect(anyVerbatim, `${caseId} verbatim missing-input`).toBe(true);
    }
  });
});

// ── Suite D: first action present & imperative ────────────────────────────────

describe("Suite D: first action quality", () => {
  for (const caseId of SUPPORTED_IDS) {
    it(`${caseId}: firstAction begins with an imperative verb`, () => {
      const output = composeOwnerOutput(buildInput(caseId));
      // Supported cases should not abstain unless evidence forces it.
      if (output.firstAction === ABSTAIN_BAD_RECOMMENDATION_RISK) {
        return; // abstention is acceptable and tested in Suite E
      }
      expect(output.firstAction.length).toBeGreaterThan(0);
      const firstWord = output.firstAction.split(/\s+/)[0].toLowerCase();
      expect(FAQ_VERBS).toContain(firstWord);
    });
  }
});

// ── Suite E: bad recommendation exclusion → abstention ────────────────────────

describe("Suite E: R-BRA abstention", () => {
  it("a working_capital first action containing an excluded phrase abstains", () => {
    // Build a synthetic input whose only critical finding injects an excluded phrase.
    const base = buildInput("SMB-001");
    const poisoned: ComposerInput = {
      ...base,
      sidecar: {
        ...base.sidecar,
        evidence_items: [
          {
            finding: "the owner should grow revenue aggressively this quarter",
            dimension: "financial_health",
            is_critical: true,
            confidence: "HIGH",
            source_path: "synthetic",
          },
        ],
      },
    };
    const out = composeOwnerOutput(poisoned);
    expect(out.firstAction).toBe(ABSTAIN_BAD_RECOMMENDATION_RISK);
    expect(out.warningFlags.join(" ")).toContain(
      String(DiagnosisType.WORKING_CAPITAL_STRESS)
    );
  });

  it("evidence-triggered runway exclusion fires across archetypes", () => {
    const base = buildInput("SMB-004"); // margin_erosion
    const poisoned: ComposerInput = {
      ...base,
      evidenceItems: base.evidenceItems.map((e, i) =>
        i === 0 ? { ...e, supportingData: { ...(e.supportingData ?? {}), runwayMonths: 2 } } : e
      ),
      sidecar: {
        ...base.sidecar,
        evidence_items: [
          {
            finding: "the owner plans to expand into a second site immediately",
            dimension: "financial_health",
            is_critical: true,
            confidence: "HIGH",
            source_path: "synthetic",
          },
        ],
      },
    };
    const out = composeOwnerOutput(poisoned);
    expect(out.firstAction).toBe(ABSTAIN_BAD_RECOMMENDATION_RISK);
  });
});

// ── Suite F: unsupported cases produce scope gap ──────────────────────────────

describe("Suite F: scope gap for unsupported cases", () => {
  for (const caseId of UNSUPPORTED_IDS) {
    it(`${caseId}: produces scope gap`, () => {
      const output = composeOwnerOutput(buildInput(caseId));
      expect(output.scopeGap).toBeDefined();
      expect(output.firstAction).toBe("");
      expect(output.rootCauseSummary).toBe("");
      const serialized = serializeComposerOutput(output);
      expect(serialized).toContain("SCOPE GAP");
      expect(serialized).not.toContain("PRIMARY ROOT CAUSE:");
      expect(serialized).not.toContain("First action:");
    });
  }
});

// ── Suite G: UNKNOWN diagnosis → abstention ───────────────────────────────────

describe("Suite G: UNKNOWN abstention", () => {
  it("UNKNOWN diagnosis produces abstention with no first action", () => {
    const base = buildInput("SMB-001");
    const unknownResult: DiagnosisResult = {
      ...base.diagnosisResult,
      primaryRootCause: {
        ...base.diagnosisResult.primaryRootCause,
        type: DiagnosisType.UNKNOWN,
      },
      confidence: DiagnosisConfidence.INSUFFICIENT_EVIDENCE,
    };
    const out = composeOwnerOutput({ ...base, diagnosisResult: unknownResult });
    expect(out.firstAction).toBe("");
    expect(out.rootCauseSummary).toBe("");
    expect(out.abstentionReason).toBeDefined();
    expect(serializeComposerOutput(out)).toContain("Insufficient evidence");
  });
});

// ── Suite H: no expected diagnosis fields accessible / runtime isolation ───────

describe("Suite H: runtime isolation from expected diagnosis", () => {
  it("composer runs without fixture expected diagnosis present", () => {
    for (const caseId of SUPPORTED_IDS) {
      const input = buildInput(caseId);
      // The ComposerInput type carries no expected_opsiq_diagnosis field at all.
      expect(
        (input as unknown as Record<string, unknown>).expected_opsiq_diagnosis
      ).toBeUndefined();
      expect(() => composeOwnerOutput(input)).not.toThrow();
    }
  });

  it("is deterministic: identical inputs produce byte-identical serialized output", () => {
    for (const caseId of [...SUPPORTED_IDS, ...UNSUPPORTED_IDS]) {
      const a = serializeComposerOutput(composeOwnerOutput(buildInput(caseId)));
      const b = serializeComposerOutput(composeOwnerOutput(buildInput(caseId)));
      expect(a).toBe(b);
    }
  });
});

// ── Suite I: R-BRA exclusion examples pass/fail correctly ──────────────────────

describe("Suite I: R-BRA exclusion behaviour", () => {
  it("I-3: allowed first action passes for each supported archetype", () => {
    for (const caseId of SUPPORTED_IDS) {
      const out = composeOwnerOutput(buildInput(caseId));
      if (out.firstAction === ABSTAIN_BAD_RECOMMENDATION_RISK) continue;
      expect(out.firstAction.length).toBeGreaterThan(0);
      const firstWord = out.firstAction.split(/\s+/)[0].toLowerCase();
      expect(FAQ_VERBS).toContain(firstWord);
    }
  });

  it("I-5: composer source contains no fixture bad_recommendations_to_flag phrase literal", () => {
    const fixtures = loadRealWorldSmbFixtures();
    const violations: string[] = [];
    for (const f of fixtures) {
      for (const bad of f.expected_opsiq_diagnosis.bad_recommendations_to_flag) {
        if (
          COMPOSER_SOURCE.includes(`"${bad}"`) ||
          COMPOSER_SOURCE.includes(`'${bad}'`)
        ) {
          violations.push(`${f.case_id}: "${bad}"`);
        }
      }
    }
    expect(violations, violations.join("\n")).toHaveLength(0);
  });
});
