/**
 * HoldoutFixture → EvidenceItem[] normalization layer (test-only).
 *
 * Mirrors normalizeSimulationFixtureToEvidence.ts but reads from
 * tests/owner-mode/holdout/evidence-hints/ and uses the holdout sidecar validator.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { v5 as uuidv5 } from "uuid";
import type { EvidenceItem } from "@/domain/consulting-engine/types";
import { ConfidenceLevel } from "@/domain/consulting-engine/types";
import { validateHoldoutSidecar } from "./holdoutEvidenceHintValidator";
import type { HoldoutFixture } from "./holdoutFixtureSchema";

const STABLE_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const SIDECAR_DIR = join(__dirname, "evidence-hints");
const FIXED_DATE = new Date("2026-06-23T00:00:00Z");

interface HoldoutEvidenceHintItem {
  source_path: string;
  finding: string;
  dimension: string;
  is_critical: boolean;
  confidence: string;
  no_outcome_leakage: boolean;
  rationale: string;
}

interface HoldoutMetricKeyMapping {
  fixture_key: string;
  canonical_key: string;
  evidence_item_index: number;
  value_override?: number;
  transform_note?: string;
}

interface HoldoutUnsupportedArchetype {
  smb_label: string;
  gap_reason: string;
}

interface HoldoutEvidenceHintSidecar {
  case_id: string;
  fixture_version: string;
  engine_archetype_synonym: string | null;
  unsupported_expected_archetypes: HoldoutUnsupportedArchetype[];
  evidence_items: HoldoutEvidenceHintItem[];
  metric_key_mappings: HoldoutMetricKeyMapping[];
  clarification_requests: unknown[];
  validation_notes: string;
}

export interface HoldoutNormalizationResult {
  caseId: string;
  evidenceItems: EvidenceItem[];
  unsupportedArchetype: boolean;
  expectedBehavior: "DIAGNOSE" | "ABSTAIN_OR_SCOPE_GAP";
  expectedArchetypeSynonym: string | null;
  unsupportedArchetypes: HoldoutUnsupportedArchetype[];
  clarificationRequests: unknown[];
}

export interface LeakageViolation {
  phrase: string;
  finding: string;
  evidenceItemIndex: number;
}

function loadSidecar(caseId: string): HoldoutEvidenceHintSidecar {
  const path = join(SIDECAR_DIR, `${caseId}.evidence-hints.json`);
  let raw: unknown;
  try {
    const content = readFileSync(path, "utf-8");
    raw = JSON.parse(content);
  } catch (e: unknown) {
    throw new Error(`MISSING_SIDECAR: Cannot load sidecar for ${caseId}: ${String(e)}`);
  }
  const result = validateHoldoutSidecar(raw);
  if (!result.valid) {
    const summary = result.errors.map((e) => `${e.code}: ${e.message}`).join("; ");
    throw new Error(`INVALID_SIDECAR for ${caseId}: ${summary}`);
  }
  return raw as HoldoutEvidenceHintSidecar;
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
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function checkSidecarLeakage(
  sidecar: HoldoutEvidenceHintSidecar,
  fixture: HoldoutFixture
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

export function normalizeHoldoutFixtureToEvidence(
  fixture: HoldoutFixture
): HoldoutNormalizationResult {
  const caseId = fixture.case_id;
  const sidecar = loadSidecar(caseId);

  const leakageViolations = checkSidecarLeakage(sidecar, fixture);
  if (leakageViolations.length > 0) {
    const detail = leakageViolations
      .map((v) => `"${v.phrase}" in evidence_items[${v.evidenceItemIndex}]`)
      .join("; ");
    throw new Error(`SIDECAR_LEAKAGE for ${caseId}: ${detail}`);
  }

  const supportingDataByIndex: Record<number, Record<string, number>> = {};
  for (const mapping of sidecar.metric_key_mappings) {
    const idx = mapping.evidence_item_index;
    if (!supportingDataByIndex[idx]) supportingDataByIndex[idx] = {};
    let value: number | undefined;
    if (mapping.value_override !== undefined) {
      value = mapping.value_override;
    } else {
      const rawVal = fixture.input_packet.facts_known_to_owner[mapping.fixture_key];
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
