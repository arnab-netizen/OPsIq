import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  validateSidecar,
  VALID_DIMENSIONS,
  CANONICAL_KEY_DIMENSION_MAP,
} from "./evidenceHintSidecarValidator";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HINTS_DIR = join(__dirname, "evidence-hints");
const EXPECTED_CASE_IDS = [
  "SMB-001", "SMB-002", "SMB-003", "SMB-004", "SMB-005", "SMB-006",
  "SMB-007", "SMB-008", "SMB-009", "SMB-010", "SMB-011", "SMB-012",
];

function loadSidecar(caseId: string): unknown {
  const path = join(HINTS_DIR, `${caseId}.evidence-hints.json`);
  return JSON.parse(readFileSync(path, "utf-8"));
}

function validSidecar(overrides: Record<string, unknown> = {}): unknown {
  return {
    case_id: "SMB-001",
    fixture_version: "2026-06-20",
    engine_archetype_synonym: "working_capital_stress",
    unsupported_expected_archetypes: [],
    evidence_items: [
      {
        source_path: "scenario.symptoms[0]",
        finding: "owner cannot make payroll without drawing on credit line",
        dimension: "financial_health",
        is_critical: true,
        confidence: "HIGH",
        no_outcome_leakage: true,
        rationale: "Payroll inability is an acute liquidity signal assigned to financial_health.",
      },
    ],
    metric_key_mappings: [],
    clarification_requests: [],
    validation_notes: "Test sidecar for unit tests.",
    ...overrides,
  };
}

// ── Unit tests: structural rules ───────────────────────────────────────────────

describe("R1: case_id must match SMB-\\d{3} pattern", () => {
  it("accepts valid case_id", () => {
    const r = validateSidecar(validSidecar({ case_id: "SMB-007" }));
    expect(r.valid).toBe(true);
  });

  it("rejects lowercase smb-001", () => {
    const r = validateSidecar(validSidecar({ case_id: "smb-001" }));
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.code === "INVALID_CASE_ID_FORMAT")).toBe(true);
  });

  it("rejects missing case_id", () => {
    const s = validSidecar() as Record<string, unknown>;
    delete s["case_id"];
    const r = validateSidecar(s);
    expect(r.errors.some((e) => e.code === "MISSING_CASE_ID")).toBe(true);
  });

  it("rejects SMB-1 (too short)", () => {
    const r = validateSidecar(validSidecar({ case_id: "SMB-1" }));
    expect(r.errors.some((e) => e.code === "INVALID_CASE_ID_FORMAT")).toBe(true);
  });
});

describe("R2: fixture_version must be YYYY-MM-DD", () => {
  it("accepts valid date", () => {
    const r = validateSidecar(validSidecar({ fixture_version: "2026-06-20" }));
    expect(r.valid).toBe(true);
  });

  it("rejects missing fixture_version", () => {
    const s = validSidecar() as Record<string, unknown>;
    delete s["fixture_version"];
    const r = validateSidecar(s);
    expect(r.errors.some((e) => e.code === "MISSING_FIXTURE_VERSION")).toBe(true);
  });

  it("rejects non-date fixture_version", () => {
    const r = validateSidecar(validSidecar({ fixture_version: "v1.0.0" }));
    expect(r.errors.some((e) => e.code === "INVALID_FIXTURE_VERSION_FORMAT")).toBe(true);
  });
});

describe("R3: engine_archetype_synonym must be string or null", () => {
  it("accepts null for gap cases", () => {
    const r = validateSidecar(
      validSidecar({
        engine_archetype_synonym: null,
        unsupported_expected_archetypes: [
          { smb_label: "some_gap", gap_reason: "NO_ENGINE_ARCHETYPE" },
        ],
      })
    );
    expect(r.valid).toBe(true);
  });

  it("rejects undefined engine_archetype_synonym", () => {
    const s = validSidecar() as Record<string, unknown>;
    s["engine_archetype_synonym"] = undefined;
    const r = validateSidecar(s);
    expect(r.errors.some((e) => e.code === "INVALID_ENGINE_ARCHETYPE_SYNONYM")).toBe(true);
  });
});

describe("R5: gap case must have null synonym", () => {
  it("rejects non-null synonym when unsupported_expected_archetypes is non-empty", () => {
    const r = validateSidecar(
      validSidecar({
        engine_archetype_synonym: "working_capital_stress",
        unsupported_expected_archetypes: [
          { smb_label: "some_gap", gap_reason: "NO_ENGINE_ARCHETYPE" },
        ],
      })
    );
    expect(r.errors.some((e) => e.code === "SYNONYM_PRESENT_FOR_GAP_CASE")).toBe(true);
  });
});

describe("R7: evidence_items must be non-empty", () => {
  it("rejects empty evidence_items", () => {
    const r = validateSidecar(validSidecar({ evidence_items: [] }));
    expect(r.errors.some((e) => e.code === "EMPTY_EVIDENCE_ITEMS")).toBe(true);
  });
});

describe("R9: source_path must not reference expected_opsiq_diagnosis", () => {
  it("rejects outcome-side source_path", () => {
    const r = validateSidecar(
      validSidecar({
        evidence_items: [
          {
            source_path: "expected_opsiq_diagnosis.primary_root_cause",
            finding: "some finding",
            dimension: "financial_health",
            is_critical: false,
            confidence: "MEDIUM",
            no_outcome_leakage: true,
            rationale: "Should fail validation due to outcome path.",
          },
        ],
      })
    );
    expect(r.errors.some((e) => e.code === "OUTCOME_PATH_FORBIDDEN")).toBe(true);
  });
});

describe("R11: dimension must be one of 7 valid values", () => {
  it("accepts all 7 valid dimensions", () => {
    for (const dim of VALID_DIMENSIONS) {
      const r = validateSidecar(
        validSidecar({
          evidence_items: [
            {
              source_path: "scenario.symptoms[0]",
              finding: "some finding text here",
              dimension: dim,
              is_critical: false,
              confidence: "MEDIUM",
              no_outcome_leakage: true,
              rationale: "Valid dimension assignment for test purposes.",
            },
          ],
        })
      );
      const dimErrors = r.errors.filter((e) => e.code === "INVALID_DIMENSION");
      expect(dimErrors).toHaveLength(0);
    }
  });

  it("rejects unknown dimension string", () => {
    const r = validateSidecar(
      validSidecar({
        evidence_items: [
          {
            source_path: "scenario.symptoms[0]",
            finding: "some finding",
            dimension: "strategic_health",
            is_critical: false,
            confidence: "MEDIUM",
            no_outcome_leakage: true,
            rationale: "Testing invalid dimension.",
          },
        ],
      })
    );
    expect(r.errors.some((e) => e.code === "INVALID_DIMENSION")).toBe(true);
  });
});

describe("R14: no_outcome_leakage must be true", () => {
  it("rejects false no_outcome_leakage", () => {
    const r = validateSidecar(
      validSidecar({
        evidence_items: [
          {
            source_path: "scenario.symptoms[0]",
            finding: "some finding",
            dimension: "financial_health",
            is_critical: false,
            confidence: "MEDIUM",
            no_outcome_leakage: false,
            rationale: "Testing outcome leakage flag.",
          },
        ],
      })
    );
    expect(r.errors.some((e) => e.code === "OUTCOME_LEAKAGE_DECLARED")).toBe(true);
  });
});

describe("R16/R17: misleading signal prefix and is_critical/confidence rules", () => {
  it("rejects misleading_signal item without prefix", () => {
    const r = validateSidecar(
      validSidecar({
        evidence_items: [
          {
            source_path: "scenario.misleading_signals[0]",
            finding: "revenue is up 18% year-over-year and appears healthy",
            dimension: "financial_health",
            is_critical: false,
            confidence: "LOW",
            no_outcome_leakage: true,
            rationale: "Missing required prefix for misleading signal.",
          },
        ],
      })
    );
    expect(r.errors.some((e) => e.code === "MISSING_MISLEADING_PREFIX")).toBe(true);
  });

  it("rejects misleading_signal item with is_critical=true", () => {
    const r = validateSidecar(
      validSidecar({
        evidence_items: [
          {
            source_path: "scenario.misleading_signals[0]",
            finding: "Surface signal (not root cause): revenue is up",
            dimension: "financial_health",
            is_critical: true,
            confidence: "LOW",
            no_outcome_leakage: true,
            rationale: "Misleading signal marked critical — should fail.",
          },
        ],
      })
    );
    expect(r.errors.some((e) => e.code === "MISLEADING_SIGNAL_IS_CRITICAL")).toBe(true);
  });

  it("rejects misleading_signal item with confidence != LOW", () => {
    const r = validateSidecar(
      validSidecar({
        evidence_items: [
          {
            source_path: "scenario.misleading_signals[0]",
            finding: "Surface signal (not root cause): revenue is up",
            dimension: "financial_health",
            is_critical: false,
            confidence: "HIGH",
            no_outcome_leakage: true,
            rationale: "Misleading signal with HIGH confidence — should fail.",
          },
        ],
      })
    );
    expect(r.errors.some((e) => e.code === "MISLEADING_SIGNAL_CONFIDENCE_NOT_LOW")).toBe(true);
  });

  it("accepts correctly formed misleading signal", () => {
    const r = validateSidecar(
      validSidecar({
        evidence_items: [
          {
            source_path: "scenario.misleading_signals[0]",
            finding: "Surface signal (not root cause): revenue is up 18% year-over-year",
            dimension: "financial_health",
            is_critical: false,
            confidence: "LOW",
            no_outcome_leakage: true,
            rationale: "Correctly formed misleading signal with required prefix.",
          },
        ],
      })
    );
    const prefixErrors = r.errors.filter(
      (e) =>
        e.code === "MISSING_MISLEADING_PREFIX" ||
        e.code === "MISLEADING_SIGNAL_IS_CRITICAL" ||
        e.code === "MISLEADING_SIGNAL_CONFIDENCE_NOT_LOW"
    );
    expect(prefixErrors).toHaveLength(0);
  });
});

describe("R20: canonical_key must be in the registry", () => {
  it("rejects unknown canonical key", () => {
    const r = validateSidecar(
      validSidecar({
        metric_key_mappings: [
          {
            fixture_key: "some_fact_key",
            canonical_key: "inventoryTurnover",
            evidence_item_index: 0,
          },
        ],
      })
    );
    expect(r.errors.some((e) => e.code === "UNKNOWN_CANONICAL_KEY")).toBe(true);
  });

  it("accepts all registered canonical keys", () => {
    for (const key of Object.keys(CANONICAL_KEY_DIMENSION_MAP)) {
      const requiredDim = CANONICAL_KEY_DIMENSION_MAP[key];
      const r = validateSidecar(
        validSidecar({
          evidence_items: [
            {
              source_path: "scenario.symptoms[0]",
              finding: "some finding text here",
              dimension: requiredDim,
              is_critical: false,
              confidence: "MEDIUM",
              no_outcome_leakage: true,
              rationale: "Created to host metric key mapping for registry test.",
            },
          ],
          metric_key_mappings: [
            {
              fixture_key: "fact_key",
              canonical_key: key,
              evidence_item_index: 0,
            },
          ],
        })
      );
      const keyErrors = r.errors.filter(
        (e) => e.code === "UNKNOWN_CANONICAL_KEY" || e.code === "METRIC_DIMENSION_MISMATCH"
      );
      expect(keyErrors).toHaveLength(0);
    }
  });
});

describe("R22: metric dimension must match canonical key registry", () => {
  it("rejects dso mapped to market_position item", () => {
    const r = validateSidecar(
      validSidecar({
        evidence_items: [
          {
            source_path: "scenario.symptoms[0]",
            finding: "some financial finding",
            dimension: "market_position",
            is_critical: false,
            confidence: "MEDIUM",
            no_outcome_leakage: true,
            rationale: "Wrong dimension for metric key test.",
          },
        ],
        metric_key_mappings: [
          {
            fixture_key: "fact_key",
            canonical_key: "dso",
            evidence_item_index: 0,
          },
        ],
      })
    );
    expect(r.errors.some((e) => e.code === "METRIC_DIMENSION_MISMATCH")).toBe(true);
  });
});

describe("R23: value_override requires transform_note", () => {
  it("rejects value_override without transform_note", () => {
    const r = validateSidecar(
      validSidecar({
        metric_key_mappings: [
          {
            fixture_key: "fact_key",
            canonical_key: "dso",
            evidence_item_index: 0,
            value_override: 60,
          },
        ],
      })
    );
    expect(r.errors.some((e) => e.code === "MISSING_TRANSFORM_NOTE")).toBe(true);
  });

  it("accepts value_override with transform_note", () => {
    const r = validateSidecar(
      validSidecar({
        metric_key_mappings: [
          {
            fixture_key: "fact_key",
            canonical_key: "dso",
            evidence_item_index: 0,
            value_override: 60,
            transform_note: "Approximated from 60-day payment terms.",
          },
        ],
      })
    );
    const overrideErrors = r.errors.filter(
      (e) => e.code === "MISSING_TRANSFORM_NOTE" || e.code === "INVALID_VALUE_OVERRIDE"
    );
    expect(overrideErrors).toHaveLength(0);
  });
});

// ── Integration tests: validate all 12 real sidecar files ─────────────────────

describe("All 12 sidecar files exist and pass validation", () => {
  it("evidence-hints directory contains exactly 12 files", () => {
    const files = readdirSync(HINTS_DIR).filter((f) => f.endsWith(".evidence-hints.json"));
    expect(files).toHaveLength(12);
  });

  for (const caseId of EXPECTED_CASE_IDS) {
    it(`${caseId}.evidence-hints.json is valid`, () => {
      const sidecar = loadSidecar(caseId);
      const result = validateSidecar(sidecar);
      if (!result.valid) {
        const summary = result.errors.map((e) => `  [${e.code}] ${e.message}`).join("\n");
        throw new Error(`${caseId} sidecar has validation errors:\n${summary}`);
      }
      expect(result.valid).toBe(true);
    });

    it(`${caseId} case_id field matches filename`, () => {
      const sidecar = loadSidecar(caseId) as Record<string, unknown>;
      expect(sidecar["case_id"]).toBe(caseId);
    });

    it(`${caseId} has at least 1 evidence item`, () => {
      const sidecar = loadSidecar(caseId) as Record<string, unknown>;
      expect(Array.isArray(sidecar["evidence_items"])).toBe(true);
      expect((sidecar["evidence_items"] as unknown[]).length).toBeGreaterThan(0);
    });
  }
});

describe("Gap cases have null engine_archetype_synonym", () => {
  const GAP_CASES = ["SMB-005", "SMB-009", "SMB-011"];

  for (const caseId of GAP_CASES) {
    it(`${caseId} has engine_archetype_synonym: null`, () => {
      const sidecar = loadSidecar(caseId) as Record<string, unknown>;
      expect(sidecar["engine_archetype_synonym"]).toBeNull();
    });

    it(`${caseId} has non-empty unsupported_expected_archetypes`, () => {
      const sidecar = loadSidecar(caseId) as Record<string, unknown>;
      expect(Array.isArray(sidecar["unsupported_expected_archetypes"])).toBe(true);
      expect((sidecar["unsupported_expected_archetypes"] as unknown[]).length).toBeGreaterThan(0);
    });
  }
});

describe("Covered cases have non-null engine_archetype_synonym", () => {
  const COVERED_CASES = ["SMB-001", "SMB-002", "SMB-003", "SMB-004", "SMB-006", "SMB-007", "SMB-008", "SMB-010", "SMB-012"];

  for (const caseId of COVERED_CASES) {
    it(`${caseId} has a non-null engine_archetype_synonym`, () => {
      const sidecar = loadSidecar(caseId) as Record<string, unknown>;
      expect(sidecar["engine_archetype_synonym"]).not.toBeNull();
      expect(typeof sidecar["engine_archetype_synonym"]).toBe("string");
    });
  }
});
