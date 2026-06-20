/**
 * Generic SMB fixture → EvidenceItem[] normalization layer (test-only).
 *
 * Converts a fixture + its evidence-hint sidecar into a typed EvidenceItem[]
 * suitable for the OpsIQ diagnosis engine. No production engine logic is
 * modified; no case-specific adapter code is added; no external calls are made.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { v5 as uuidv5 } from "uuid";
import type { EvidenceItem } from "@/domain/consulting-engine/types";
import { ConfidenceLevel } from "@/domain/consulting-engine/types";
import { validateSidecar } from "./evidenceHintSidecarValidator";
import type { SmbFixture } from "./fixtureSchema";

// RFC 4122 URL namespace — stable, deterministic UUID base
const STABLE_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

const SIDECAR_DIR = join(__dirname, "evidence-hints");

// ── Sidecar shape (internal; not exported) ────────────────────────────────────

interface EvidenceHintItem {
  source_path: string;
  finding: string;
  dimension: string;
  is_critical: boolean;
  confidence: string;
  no_outcome_leakage: boolean;
  rationale: string;
}

interface MetricKeyMapping {
  fixture_key: string;
  canonical_key: string;
  evidence_item_index: number;
  value_override?: number;
  transform_note?: string;
}

interface UnsupportedArchetype {
  smb_label: string;
  gap_reason: string;
}

interface EvidenceHintSidecar {
  case_id: string;
  fixture_version: string;
  engine_archetype_synonym: string | null;
  unsupported_expected_archetypes: UnsupportedArchetype[];
  evidence_items: EvidenceHintItem[];
  metric_key_mappings: MetricKeyMapping[];
  clarification_requests: unknown[];
  validation_notes: string;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface NormalizationResult {
  caseId: string;
  evidenceItems: EvidenceItem[];
  unsupportedArchetype: boolean;
  expectedBehavior: "DIAGNOSE" | "ABSTAIN_OR_SCOPE_GAP";
  expectedArchetypeSynonym: string | null;
  unsupportedArchetypes: UnsupportedArchetype[];
  clarificationRequests: unknown[];
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function loadSidecar(caseId: string): EvidenceHintSidecar {
  const path = join(SIDECAR_DIR, `${caseId}.evidence-hints.json`);
  let raw: unknown;
  try {
    const content = readFileSync(path, "utf-8");
    raw = JSON.parse(content);
  } catch (e: unknown) {
    throw new Error(`MISSING_SIDECAR: Cannot load sidecar for ${caseId}: ${String(e)}`);
  }
  const result = validateSidecar(raw);
  if (!result.valid) {
    const summary = result.errors.map((e) => `${e.code}: ${e.message}`).join("; ");
    throw new Error(`INVALID_SIDECAR for ${caseId}: ${summary}`);
  }
  return raw as EvidenceHintSidecar;
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

// ── Normalizer ────────────────────────────────────────────────────────────────

export function normalizeFixtureToEvidence(
  fixture: SmbFixture,
  overrideSidecar?: unknown
): NormalizationResult {
  const caseId = fixture.case_id;
  const sidecar: EvidenceHintSidecar = overrideSidecar
    ? (() => {
        const result = validateSidecar(overrideSidecar);
        if (!result.valid) {
          const summary = result.errors.map((e) => `${e.code}: ${e.message}`).join("; ");
          throw new Error(`INVALID_SIDECAR for ${caseId}: ${summary}`);
        }
        return overrideSidecar as EvidenceHintSidecar;
      })()
    : loadSidecar(caseId);

  // Build supportingData by evidence_item_index from metric_key_mappings
  const supportingDataByIndex: Record<number, Record<string, number>> = {};
  for (const mapping of sidecar.metric_key_mappings) {
    const idx = mapping.evidence_item_index;
    if (!supportingDataByIndex[idx]) supportingDataByIndex[idx] = {};
    let value: number | undefined;
    if (mapping.value_override !== undefined) {
      value = mapping.value_override;
    } else {
      const rawVal = fixture.scenario.facts_known_to_owner[mapping.fixture_key];
      if (typeof rawVal === "number") value = rawVal;
    }
    if (value !== undefined) {
      supportingDataByIndex[idx][mapping.canonical_key] = value;
    }
  }

  const FIXED_DATE = new Date("2026-06-20T00:00:00Z");

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
