/**
 * Tests for the SMB fixture normalization layer.
 * Validates that normalizeFixtureToEvidence correctly converts fixtures + sidecars
 * into EvidenceItem[] arrays for the OpsIQ engine.
 */

import { describe, it, expect } from "vitest";
import { normalizeFixtureToEvidence } from "./normalizeFixtureToEvidence";
import { loadRealWorldSmbFixtures, getRealWorldSmbCaseById } from "./loadFixtures";
import { VALID_DIMENSIONS } from "./evidenceHintSidecarValidator";

// ── Test 1: SMB-001 normalizes to EvidenceItem[] ─────────────────────────────

describe("normalizeFixtureToEvidence: SMB-001 produces valid EvidenceItem[]", () => {
  it("produces non-empty EvidenceItem[] with valid UUIDs and dimensions", () => {
    const fixture = getRealWorldSmbCaseById("SMB-001");
    const result = normalizeFixtureToEvidence(fixture);

    expect(result.caseId).toBe("SMB-001");
    expect(result.evidenceItems.length).toBeGreaterThan(0);
    expect(result.unsupportedArchetype).toBe(false);
    expect(result.expectedBehavior).toBe("DIAGNOSE");
    expect(result.expectedArchetypeSynonym).toBe("working_capital_stress");

    for (const item of result.evidenceItems) {
      expect(item.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
      expect(VALID_DIMENSIONS).toContain(item.dimension);
      expect(typeof item.finding).toBe("string");
      expect(item.finding.length).toBeGreaterThan(0);
      expect(typeof item.isCritical).toBe("boolean");
    }
  });
});

// ── Test 2: SMB-005 returns unsupportedArchetype = true ──────────────────────

describe("normalizeFixtureToEvidence: SMB-005 is an abstention case", () => {
  it("returns unsupportedArchetype=true and ABSTAIN_OR_SCOPE_GAP behavior", () => {
    const fixture = getRealWorldSmbCaseById("SMB-005");
    const result = normalizeFixtureToEvidence(fixture);

    expect(result.unsupportedArchetype).toBe(true);
    expect(result.expectedBehavior).toBe("ABSTAIN_OR_SCOPE_GAP");
    expect(result.expectedArchetypeSynonym).toBeNull();
    expect(result.unsupportedArchetypes.length).toBeGreaterThan(0);
  });
});

// ── Test 3: Missing sidecar throws ───────────────────────────────────────────

describe("normalizeFixtureToEvidence: missing sidecar fails closed", () => {
  it("throws with MISSING_SIDECAR when no sidecar file exists", () => {
    const fixture = getRealWorldSmbCaseById("SMB-001");
    const badFixture = { ...fixture, case_id: "SMB-999" };
    expect(() => normalizeFixtureToEvidence(badFixture as typeof fixture)).toThrow(
      /MISSING_SIDECAR/
    );
  });
});

// ── Test 4: Invalid source_path (outcome leakage) fails ──────────────────────

describe("normalizeFixtureToEvidence: invalid sidecar fails closed", () => {
  it("throws when sidecar contains an outcome-side source_path", () => {
    const fixture = getRealWorldSmbCaseById("SMB-001");
    const badSidecar = {
      case_id: "SMB-001",
      fixture_version: "2026-06-20",
      engine_archetype_synonym: "working_capital_stress",
      unsupported_expected_archetypes: [],
      evidence_items: [
        {
          source_path: "expected_opsiq_diagnosis.primary_root_cause",
          finding: "some finding",
          dimension: "financial_health",
          is_critical: false,
          confidence: "MEDIUM",
          no_outcome_leakage: true,
          rationale: "test rationale here",
        },
      ],
      metric_key_mappings: [],
      clarification_requests: [],
      validation_notes: "test",
    };
    expect(() => normalizeFixtureToEvidence(fixture, badSidecar)).toThrow(/INVALID_SIDECAR/);
  });
});

// ── Test 5: no_outcome_leakage=false fails ───────────────────────────────────

describe("normalizeFixtureToEvidence: no_outcome_leakage=false fails", () => {
  it("throws when an evidence item has no_outcome_leakage=false", () => {
    const fixture = getRealWorldSmbCaseById("SMB-001");
    const badSidecar = {
      case_id: "SMB-001",
      fixture_version: "2026-06-20",
      engine_archetype_synonym: "working_capital_stress",
      unsupported_expected_archetypes: [],
      evidence_items: [
        {
          source_path: "scenario.symptoms[0]",
          finding: "some finding about cash flow",
          dimension: "financial_health",
          is_critical: true,
          confidence: "HIGH",
          no_outcome_leakage: false,
          rationale: "test rationale goes here",
        },
      ],
      metric_key_mappings: [],
      clarification_requests: [],
      validation_notes: "test",
    };
    expect(() => normalizeFixtureToEvidence(fixture, badSidecar)).toThrow(/INVALID_SIDECAR/);
  });
});

// ── Test 6: Normalizer does not read expected_opsiq_diagnosis ─────────────────

describe("normalizeFixtureToEvidence: evidence isolation", () => {
  it("produces the same evidenceItems regardless of what is in expected_opsiq_diagnosis", () => {
    const fixture = getRealWorldSmbCaseById("SMB-001");

    const mutatedFixture = {
      ...fixture,
      expected_opsiq_diagnosis: {
        ...fixture.expected_opsiq_diagnosis,
        primary_root_cause: "completely_different_fabricated_root_cause",
        scoring_criteria: {
          ...fixture.expected_opsiq_diagnosis.scoring_criteria,
          must_identify: ["fabricated term that does not exist"],
        },
      },
    };

    const normal = normalizeFixtureToEvidence(fixture);
    const mutated = normalizeFixtureToEvidence(mutatedFixture as typeof fixture);

    expect(mutated.evidenceItems.length).toBe(normal.evidenceItems.length);
    for (let i = 0; i < normal.evidenceItems.length; i++) {
      expect(mutated.evidenceItems[i].finding).toBe(normal.evidenceItems[i].finding);
      expect(mutated.evidenceItems[i].dimension).toBe(normal.evidenceItems[i].dimension);
    }
  });
});

// ── Test 7: Misleading-signal evidence is preserved with prefix ───────────────

describe("normalizeFixtureToEvidence: misleading signal finding preservation", () => {
  it("preserves the misleading signal prefix in normalized evidence findings", () => {
    const fixture = getRealWorldSmbCaseById("SMB-001");
    const result = normalizeFixtureToEvidence(fixture);

    const misleading = result.evidenceItems.filter((e) =>
      e.finding.startsWith("Surface signal (not root cause): ")
    );
    expect(misleading.length).toBeGreaterThan(0);
    for (const item of misleading) {
      expect(item.isCritical).toBe(false);
    }
  });
});

// ── Test 8: supportingData keys survive conversion ────────────────────────────

describe("normalizeFixtureToEvidence: supportingData from metric_key_mappings", () => {
  it("SMB-001 produces at least one EvidenceItem with dso in supportingData", () => {
    const fixture = getRealWorldSmbCaseById("SMB-001");
    const result = normalizeFixtureToEvidence(fixture);

    const withDso = result.evidenceItems.find(
      (e) => e.supportingData && "dso" in e.supportingData
    );
    expect(withDso).toBeDefined();
    expect(typeof withDso?.supportingData?.dso).toBe("number");
  });
});

// ── Test 9: Output dimensions are all valid engine dimensions ─────────────────

describe("normalizeFixtureToEvidence: all dimensions are valid", () => {
  it("every EvidenceItem in every fixture has a valid engine dimension", () => {
    const fixtures = loadRealWorldSmbFixtures();
    for (const fixture of fixtures) {
      const result = normalizeFixtureToEvidence(fixture);
      for (const item of result.evidenceItems) {
        expect(VALID_DIMENSIONS as readonly string[]).toContain(item.dimension);
      }
    }
  });
});

// ── Test 10: Exactly 12 fixtures normalize without error ──────────────────────

describe("normalizeFixtureToEvidence: all 12 fixtures normalize", () => {
  it("normalizes all 12 fixtures without throwing", () => {
    const fixtures = loadRealWorldSmbFixtures();
    expect(fixtures).toHaveLength(12);

    const results = [];
    for (const fixture of fixtures) {
      expect(() => {
        const r = normalizeFixtureToEvidence(fixture);
        results.push(r);
      }).not.toThrow();
    }
    expect(results).toHaveLength(12);

    const abstentions = results.filter((r) => r.unsupportedArchetype);
    const supported = results.filter((r) => !r.unsupportedArchetype);
    expect(abstentions).toHaveLength(3);
    expect(supported).toHaveLength(9);
  });
});
