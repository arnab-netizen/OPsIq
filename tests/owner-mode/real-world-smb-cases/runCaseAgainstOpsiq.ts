/**
 * Adapter: convert SMB fixture → EvidenceItem[] → run OpsIQ engine → serialize output.
 *
 * No production engine logic modified.
 * No case-specific adapter code.
 * No external calls.
 * No LLM.
 * No answer-key vocabulary — output is the engine's own text fields only.
 */

import { readFileSync } from "fs";
import { join } from "path";
import type { SmbFixture } from "./fixtureSchema";
import { normalizeFixtureToEvidence } from "./normalizeFixtureToEvidence";
import { diagnoseRootCause } from "@/services/consulting-engine/diagnosis-engine";
import type { DiagnosisResult } from "@/services/consulting-engine/diagnosis-engine";
import {
  composeOwnerOutput,
  serializeComposerOutput,
  type ComposerSidecar,
} from "./smbOutputComposer";

const SIDECAR_DIR = join(__dirname, "evidence-hints");

function loadComposerSidecar(caseId: string): ComposerSidecar {
  const path = join(SIDECAR_DIR, `${caseId}.evidence-hints.json`);
  const raw = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
  return {
    case_id: raw.case_id as string,
    engine_archetype_synonym: (raw.engine_archetype_synonym as string | null) ?? null,
    unsupported_expected_archetypes:
      (raw.unsupported_expected_archetypes as ComposerSidecar["unsupported_expected_archetypes"]) ??
      [],
    evidence_items:
      (raw.evidence_items as ComposerSidecar["evidence_items"]) ?? [],
    clarification_requests:
      (raw.clarification_requests as ComposerSidecar["clarification_requests"]) ??
      [],
    metric_key_mappings:
      (raw.metric_key_mappings as ComposerSidecar["metric_key_mappings"]) ?? [],
  };
}

export const TODO_INTEGRATION_SKIPPED = false;

// ── Output interfaces ─────────────────────────────────────────────────────────

export interface EngineRunResult {
  caseId: string;
  skipped: false;
  unsupportedArchetype: boolean;
  output: string;
  diagnosisResult?: DiagnosisResult;
}

export interface ScopeGapResult {
  caseId: string;
  skipped: false;
  unsupportedArchetype: true;
  output: string;
  scopeGapReason: string;
}

export type OpsiqRunResult = EngineRunResult | ScopeGapResult;

// ── Main adapter ──────────────────────────────────────────────────────────────

export async function runCaseAgainstOpsiq(
  fixture: SmbFixture
): Promise<OpsiqRunResult> {
  const normResult = normalizeFixtureToEvidence(fixture);

  if (normResult.unsupportedArchetype) {
    const gapLabels = normResult.unsupportedArchetypes
      .map((u) => `${u.smb_label}: ${u.gap_reason}`)
      .join("; ");
    return {
      caseId: fixture.case_id,
      skipped: false,
      unsupportedArchetype: true,
      output: [
        `SCOPE GAP: ${fixture.case_id}`,
        "",
        "OpsIQ cannot produce a confident root cause diagnosis for this case.",
        "The expected root causes fall outside the current engine archetype model.",
        "",
        `Expected archetypes not modelled: ${gapLabels}`,
        "",
        "OpsIQ will abstain rather than produce a low-confidence or incorrect diagnosis.",
        "Additional investigation is required to model this archetype.",
      ].join("\n"),
      scopeGapReason: gapLabels,
    };
  }

  const diagnosisResult = diagnoseRootCause(
    normResult.evidenceItems,
    fixture.scenario.business
  );

  // Compose owner-facing output between diagnosis and serialization. The composer
  // sees only the engine result, evidence, sidecar, and scenario fields — never
  // the fixture answer key.
  const sidecar = loadComposerSidecar(fixture.case_id);
  const composerOutput = composeOwnerOutput({
    diagnosisResult,
    evidenceItems: normResult.evidenceItems,
    sidecar,
    scenario: {
      business: fixture.scenario.business,
      missing_inputs_opsiq_should_request:
        fixture.scenario.missing_inputs_opsiq_should_request,
    },
  });
  const output = serializeComposerOutput(composerOutput);

  return {
    caseId: fixture.case_id,
    skipped: false,
    unsupportedArchetype: false,
    output,
    diagnosisResult,
  };
}
