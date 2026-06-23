/**
 * SimulationFixture → EvidenceItem[] normalization layer (test-only).
 *
 * Converts a SimulationFixture + its evidence-hint sidecar into a typed
 * EvidenceItem[] suitable for the OpsIQ diagnosis engine. No production
 * engine logic is modified; no case-specific adapter code is added; no
 * external calls are made.
 *
 * Mirrors normalizeFixtureToEvidence.ts from the SMB path but accepts
 * SimulationFixture and reads from tests/owner-mode/real-world-simulation/evidence-hints/.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { v5 as uuidv5 } from "uuid";
import type { EvidenceItem } from "@/domain/consulting-engine/types";
import { ConfidenceLevel } from "@/domain/consulting-engine/types";
import { validateSimulationSidecar } from "./simulationEvidenceHintValidator";
import type { SimulationFixture } from "./simulationFixtureSchema";

const STABLE_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const SIDECAR_DIR = join(__dirname, "evidence-hints");
const FIXED_DATE = new Date("2026-06-22T00:00:00Z");

// ── Internal sidecar shape ────────────────────────────────────────────────────

interface SimulationEvidenceHintItem {
  source_path: string;
  finding: string;
  dimension: string;
  is_critical: boolean;
  confidence: string;
  no_outcome_leakage: boolean;
  rationale: string;
}

interface SimulationMetricKeyMapping {
  fixture_key: string;
  canonical_key: string;
  evidence_item_index: number;
  value_override?: number;
  transform_note?: string;
}

interface SimulationUnsupportedArchetype {
  smb_label: string;
  gap_reason: string;
}

interface SimulationEvidenceHintSidecar {
  case_id: string;
  fixture_version: string;
  engine_archetype_synonym: string | null;
  unsupported_expected_archetypes: SimulationUnsupportedArchetype[];
  evidence_items: SimulationEvidenceHintItem[];
  metric_key_mappings: SimulationMetricKeyMapping[];
  clarification_requests: unknown[];
  validation_notes: string;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface SimulationNormalizationResult {
  caseId: string;
  evidenceItems: EvidenceItem[];
  unsupportedArchetype: boolean;
  expectedBehavior: "DIAGNOSE" | "ABSTAIN_OR_SCOPE_GAP";
  expectedArchetypeSynonym: string | null;
  unsupportedArchetypes: SimulationUnsupportedArchetype[];
  clarificationRequests: unknown[];
}

export interface LeakageViolation {
  phrase: string;
  finding: string;
  evidenceItemIndex: number;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function loadSidecar(caseId: string): SimulationEvidenceHintSidecar {
  const path = join(SIDECAR_DIR, `${caseId}.evidence-hints.json`);
  let raw: unknown;
  try {
    const content = readFileSync(path, "utf-8");
    raw = JSON.parse(content);
  } catch (e: unknown) {
    throw new Error(`MISSING_SIDECAR: Cannot load sidecar for ${caseId}: ${String(e)}`);
  }
  const result = validateSimulationSidecar(raw);
  if (!result.valid) {
    const summary = result.errors.map((e) => `${e.code}: ${e.message}`).join("; ");
    throw new Error(`INVALID_SIDECAR for ${caseId}: ${summary}`);
  }
  return raw as SimulationEvidenceHintSidecar;
}

function toConfidenceLevel(s: string): ConfidenceLevel {
  switch (s) {
    case "HIGH": return ConfidenceLevel.HIGH;
    case "MEDIUM": return ConfidenceLevel.MEDIUM;
    case "LOW": return ConfidenceLevel.LOW;
    case "PROVISIONAL": return ConfidenceLevel.PROVISIONAL;
    default: return ConfidenceLevel.LOW;
  }
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Cross-check: verify no sealed_expected_output phrase appears verbatim in
 * any sidecar evidence item finding. This is separate from the fixture-level
 * leakage check (which checks input_packet).
 */
export function checkSidecarLeakage(
  sidecar: SimulationEvidenceHintSidecar,
  fixture: SimulationFixture
): LeakageViolation[] {
  const violations: LeakageViolation[] = [];
  const sealedPhrases = [
    ...fixture.sealed_expected_output.scoring_rubric.must_identify,
    ...fixture.sealed_expected_output.bad_recommendations_to_flag,
  ];
  for (let i = 0; i < sidecar.evidence_items.length; i++) {
    const normalizedFinding = normalize(sidecar.evidence_items[i].finding);
    for (const phrase of sealedPhrases) {
      if (normalizedFinding.includes(normalize(phrase))) {
        violations.push({
          phrase,
          finding: sidecar.evidence_items[i].finding,
          evidenceItemIndex: i,
        });
      }
    }
  }
  return violations;
}

// ── Normalizer ────────────────────────────────────────────────────────────────

export function normalizeSimulationFixtureToEvidence(
  fixture: SimulationFixture,
  overrideSidecar?: unknown
): SimulationNormalizationResult {
  const caseId = fixture.case_id;

  const sidecar: SimulationEvidenceHintSidecar = overrideSidecar
    ? (() => {
        const result = validateSimulationSidecar(overrideSidecar);
        if (!result.valid) {
          const summary = result.errors.map((e) => `${e.code}: ${e.message}`).join("; ");
          throw new Error(`INVALID_SIDECAR for ${caseId}: ${summary}`);
        }
        return overrideSidecar as SimulationEvidenceHintSidecar;
      })()
    : loadSidecar(caseId);

  // Leakage cross-check — throw if any sealed phrase appears in any finding
  const leakageViolations = checkSidecarLeakage(sidecar, fixture);
  if (leakageViolations.length > 0) {
    const detail = leakageViolations
      .map((v) => `"${v.phrase}" in evidence_items[${v.evidenceItemIndex}]`)
      .join("; ");
    throw new Error(`SIDECAR_LEAKAGE for ${caseId}: ${detail}`);
  }

  // Build supportingData by evidence_item_index from metric_key_mappings
  const supportingDataByIndex: Record<number, Record<string, number>> = {};
  for (const mapping of sidecar.metric_key_mappings) {
    const idx = mapping.evidence_item_index;
    if (!supportingDataByIndex[idx]) supportingDataByIndex[idx] = {};
    let value: number | undefined;
    if (mapping.value_override !== undefined) {
      value = mapping.value_override;
    } else {
      const rawVal =
        fixture.input_packet.facts_known_to_owner[mapping.fixture_key];
      if (typeof rawVal === "number") value = rawVal;
    }
    if (value !== undefined) {
      supportingDataByIndex[idx][mapping.canonical_key] = value;
    }
  }

  const evidenceItems: EvidenceItem[] = sidecar.evidence_items.map((item, idx) => {
    const id = uuidv5(`${caseId}#ev#${idx}`, STABLE_NAMESPACE);
    const sd = supportingDataByIndex[idx];
    return {
      id,
      dimension: item.dimension as EvidenceItem["dimension"],
      finding: item.finding,
      confidence: toConfidenceLevel(item.confidence),
      source: item.source_path,
      timestamp: FIXED_DATE,
      isCritical: item.is_critical,
      ...(sd && Object.keys(sd).length > 0 ? { supportingData: sd } : {}),
    };
  });

  const unsupportedArchetype = sidecar.unsupported_expected_archetypes.length > 0;

  return {
    caseId,
    evidenceItems,
    unsupportedArchetype,
    expectedBehavior: unsupportedArchetype ? "ABSTAIN_OR_SCOPE_GAP" : "DIAGNOSE",
    expectedArchetypeSynonym: sidecar.engine_archetype_synonym,
    unsupportedArchetypes: sidecar.unsupported_expected_archetypes,
    clarificationRequests: sidecar.clarification_requests,
  };
}
