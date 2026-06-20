/**
 * Adapter: convert SMB fixture → EvidenceItem[] → run OpsIQ engine → serialize output.
 *
 * No production engine logic modified.
 * No case-specific adapter code.
 * No external calls.
 * No LLM.
 * No answer-key vocabulary — output is the engine's own text fields only.
 */

import type { SmbFixture } from "./fixtureSchema";
import { normalizeFixtureToEvidence } from "./normalizeFixtureToEvidence";
import { diagnoseRootCause } from "@/services/consulting-engine/diagnosis-engine";
import type { DiagnosisResult } from "@/services/consulting-engine/diagnosis-engine";

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

  const primary = diagnosisResult.primaryRootCause;

  const missingLines = ["Missing information requested:"];
  for (const m of primary.missingEvidenceFor ?? []) {
    missingLines.push(`  - ${m}`);
  }

  const outputParts = [
    `OpsIQ Diagnosis: ${fixture.case_id}`,
    "",
    `PRIMARY ROOT CAUSE: ${primary.type}`,
    `Description: ${primary.description}`,
    `Confidence: ${diagnosisResult.confidence}`,
    "",
    `Mechanism: ${primary.mechanismDescription}`,
    "",
    missingLines.join("\n"),
  ];

  if (diagnosisResult.warningFlags.length > 0) {
    outputParts.push("");
    outputParts.push(
      `Warnings:\n${diagnosisResult.warningFlags.map((w) => `  - ${w}`).join("\n")}`
    );
  }

  return {
    caseId: fixture.case_id,
    skipped: false,
    unsupportedArchetype: false,
    output: outputParts.join("\n"),
    diagnosisResult,
  };
}
