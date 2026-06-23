/**
 * Holdout Validation Runner.
 *
 * Adapts HoldoutFixture → EvidenceItem[] → OpsIQ engine → scored output.
 *
 * No production engine logic modified.
 * No case-specific adapter code.
 * No external calls. No LLM.
 * No answer-key vocabulary — output is the engine's own text fields only.
 *
 * Pipeline:
 *   normalizeHoldoutFixtureToEvidence()
 *   → diagnoseRootCause()
 *   → composeOwnerOutput()
 *   → serializeComposerOutput()
 *   → scoreSimulationOutput() [reused from simulation — same scoring contract]
 */
import { readFileSync } from "fs";
import { join } from "path";
import {
  parseAndValidateHoldoutFixtures,
  type HoldoutFixture,
} from "./holdoutFixtureSchema";
import { normalizeHoldoutFixtureToEvidence } from "./normalizeHoldoutFixtureToEvidence";
import { diagnoseRootCause } from "@/services/consulting-engine/diagnosis-engine";
import type { DiagnosisResult } from "@/services/consulting-engine/diagnosis-engine";
import {
  composeOwnerOutput,
  serializeComposerOutput,
  type ComposerSidecar,
} from "../real-world-smb-cases/smbOutputComposer";
import {
  scoreSimulationOutput,
  type SimulationCaseScore,
} from "../real-world-simulation/simulationScoringContract";

const FIXTURES_FILE = join(__dirname, "fixtures", "holdout_cases.jsonl");
const HOLDOUT_SIDECAR_DIR = join(__dirname, "evidence-hints");

function loadComposerSidecar(caseId: string): ComposerSidecar {
  const path = join(HOLDOUT_SIDECAR_DIR, `${caseId}.evidence-hints.json`);
  const raw = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
  return {
    case_id: raw["case_id"] as string,
    engine_archetype_synonym:
      (raw["engine_archetype_synonym"] as string | null) ?? null,
    unsupported_expected_archetypes:
      (raw["unsupported_expected_archetypes"] as ComposerSidecar["unsupported_expected_archetypes"]) ?? [],
    evidence_items:
      (raw["evidence_items"] as ComposerSidecar["evidence_items"]) ?? [],
    clarification_requests:
      (raw["clarification_requests"] as ComposerSidecar["clarification_requests"]) ?? [],
    metric_key_mappings:
      (raw["metric_key_mappings"] as ComposerSidecar["metric_key_mappings"]) ?? [],
  };
}

// ── Output interfaces ─────────────────────────────────────────────────────────

export interface HoldoutCaseRunResult {
  caseId: string;
  title: string;
  unsupportedArchetype: false;
  output: string;
  score: SimulationCaseScore;
  diagnosisResult: DiagnosisResult;
  failureClassification: string;
}

export interface HoldoutScopeGapResult {
  caseId: string;
  title: string;
  unsupportedArchetype: true;
  output: string;
  score: SimulationCaseScore;
  scopeGapReason: string;
  failureClassification: "HOL_ENGINE_GAP";
}

export type HoldoutRunResult = HoldoutCaseRunResult | HoldoutScopeGapResult;

function classifyFailure(score: SimulationCaseScore, unsupported: boolean): string {
  if (unsupported) return "HOL_ENGINE_GAP";
  if (score.passed) return "PASS";
  if (!score.dimensionResults.badRecommendationAvoidance.passed) return "HOL_TRAP_TAKEN";
  if (score.dimensionResults.rootCause.score < 0.3) return "HOL_ENGINE_GAP";
  return "HOL_SCORING_LIMITATION";
}

// ── Single case runner ────────────────────────────────────────────────────────

export async function runHoldoutCaseAgainstOpsiq(
  fixture: HoldoutFixture
): Promise<HoldoutRunResult> {
  const normResult = normalizeHoldoutFixtureToEvidence(fixture);

  if (normResult.unsupportedArchetype) {
    const gapLabels = normResult.unsupportedArchetypes
      .map((u) => `${u.smb_label}: ${u.gap_reason}`)
      .join("; ");
    const output = [
      `SCOPE GAP: ${fixture.case_id}`,
      "",
      "OpsIQ cannot produce a confident root cause diagnosis for this case.",
      "The expected root causes fall outside the current engine archetype model.",
      "",
      `Expected archetypes not modelled: ${gapLabels}`,
      "",
      "OpsIQ will abstain rather than produce a low-confidence or incorrect diagnosis.",
    ].join("\n");

    const score = scoreSimulationOutput(output, fixture as unknown as Parameters<typeof scoreSimulationOutput>[1]);
    return {
      caseId: fixture.case_id,
      title: fixture.title,
      unsupportedArchetype: true,
      output,
      score,
      scopeGapReason: gapLabels,
      failureClassification: "HOL_ENGINE_GAP",
    };
  }

  const diagnosisResult = diagnoseRootCause(
    normResult.evidenceItems,
    fixture.input_packet.business_description
  );

  const sidecar = loadComposerSidecar(fixture.case_id);
  const composerOutput = composeOwnerOutput({
    diagnosisResult,
    evidenceItems: normResult.evidenceItems,
    sidecar,
    scenario: {
      business: fixture.input_packet.business_description,
      industry: fixture.holdout_meta.industry,
      missing_inputs_opsiq_should_request:
        fixture.input_packet.missing_inputs_opsiq_should_request,
    },
  });

  const output = serializeComposerOutput(composerOutput);
  const score = scoreSimulationOutput(output, fixture as unknown as Parameters<typeof scoreSimulationOutput>[1]);

  return {
    caseId: fixture.case_id,
    title: fixture.title,
    unsupportedArchetype: false,
    output,
    score,
    diagnosisResult,
    failureClassification: classifyFailure(score, false),
  };
}

// ── Batch runner ──────────────────────────────────────────────────────────────

export async function runAllHoldoutCases(): Promise<HoldoutRunResult[]> {
  const jsonl = readFileSync(FIXTURES_FILE, "utf-8");
  const fixtures = parseAndValidateHoldoutFixtures(jsonl);

  const results: HoldoutRunResult[] = [];
  for (const fixture of fixtures) {
    const result = await runHoldoutCaseAgainstOpsiq(fixture);
    results.push(result);
  }
  return results;
}
