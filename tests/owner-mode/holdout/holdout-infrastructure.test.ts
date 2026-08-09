/**
 * Holdout Infrastructure Tests
 *
 * Validates the holdout evaluation harness itself — schema, sidecar validator,
 * normalizer, and leakage guard — so that CI failures in the holdout tests reflect
 * actual engine defects, not fixture/sidecar corruption.
 *
 * Covers:
 *   - HoldoutFixture schema (parseAndValidateHoldoutFixtures, validateHoldoutFixture)
 *   - Sidecar validator (validateHoldoutSidecar) — HOL-NN-NNN pattern + all rules
 *   - Normalizer (normalizeHoldoutFixtureToEvidence) — EvidenceItem[] production
 *   - Leakage guard (checkSidecarLeakage) — sealed phrases must not appear in evidence
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  parseAndValidateHoldoutFixtures,
  validateHoldoutFixture,
  HOLDOUT_CATEGORIES,
  HOLDOUT_TEST_TYPES,
} from "./holdoutFixtureSchema";
import type { HoldoutFixture } from "./holdoutFixtureSchema";
import {
  validateHoldoutSidecar,
  VALID_DIMENSIONS,
  CANONICAL_KEY_DIMENSION_MAP,
} from "./holdoutEvidenceHintValidator";
import {
  normalizeHoldoutFixtureToEvidence,
  checkSidecarLeakage,
} from "./normalizeHoldoutFixtureToEvidence";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = join(__dirname, "fixtures/holdout_cases.jsonl");
const HINTS_DIR = join(__dirname, "evidence-hints");

const HOL_CASE_IDS = [
  "HOL-01-001", "HOL-02-001", "HOL-03-001", "HOL-04-001", "HOL-05-001",
  "HOL-06-001", "HOL-07-001", "HOL-08-001", "HOL-09-001", "HOL-10-001",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadSidecarRaw(caseId: string): unknown {
  const path = join(HINTS_DIR, `${caseId}.evidence-hints.json`);
  return JSON.parse(readFileSync(path, "utf-8"));
}

function loadAllFixtures(): HoldoutFixture[] {
  return parseAndValidateHoldoutFixtures(readFileSync(FIXTURES_PATH, "utf-8"));
}

function validFixtureObject(overrides: Record<string, unknown> = {}): unknown {
  return {
    case_id: "HOL-01-001",
    title: "Working Capital Stress — Retail SMB",
    category: "HC-01",
    test_type: "TT-1",
    segment: "retail_smb",
    business_context: "Owner-operated retail store with 3 employees and seasonal demand.",
    source_basis: ["independent construction — no benchmark fixture referenced"],
    input_packet: {
      business_description: "A small retail store with supply-chain delays and slow receivables.",
      facts_known_to_owner: { monthly_revenue: 45000, monthly_expenses: 52000 },
      symptoms: [
        "Supplier payments are consistently 30 days late",
        "Owner is personally funding shortfalls from savings",
        "Two suppliers have put the business on credit hold",
      ],
      misleading_signals: [
        "Year-over-year units sold have increased 12%",
        "The owner has strong customer relationships",
      ],
      missing_inputs_opsiq_should_request: [
        "Current accounts-receivable aging report",
        "Outstanding supplier balances with due dates",
        "Breakdown of fixed vs variable monthly costs",
      ],
    },
    sealed_expected_output: {
      primary_root_cause: "working_capital_shortfall",
      secondary_causes: [
        "Gross margin erosion due to supplier price increases",
        "Inventory tied up in slow-moving lines",
      ],
      expected_first_action: "Produce a 13-week cash flow forecast to map the shortfall",
      bad_recommendations_to_flag: [
        "Increase advertising spend to grow revenue",
        "Hire additional staff to improve capacity",
        "Launch a new product line to diversify revenue",
        "Seek equity investment to fund expansion",
      ],
      scoring_rubric: {
        must_identify: [
          "liquidity shortfall",
          "payables pressure",
          "receivables gap",
          "operating deficit",
        ],
        must_not_claim: [
          "business is fundamentally profitable",
          "growth is the solution",
        ],
        ideal_depth: [
          "quantify the monthly shortfall in absolute terms",
          "distinguish structural deficit from timing problem",
        ],
      },
    },
    leakage_controls: {
      author_read_benchmark_fixtures: false,
      author_read_composer_source: false,
    },
    holdout_meta: {
      author_id: "holdout-author-001",
      construction_date: "2026-06-23",
      industry: "retail",
      intervention_mode: "diagnostic",
      business_condition_hypothesis: "Acute working capital stress",
      consulting_lifecycle_stage: "Stage 1 — Initial Assessment",
    },
    ...overrides,
  };
}

function validSidecarObject(overrides: Record<string, unknown> = {}): unknown {
  return {
    case_id: "HOL-01-001",
    fixture_version: "2026-06-23",
    engine_archetype_synonym: "working_capital_stress",
    unsupported_expected_archetypes: [],
    evidence_items: [
      {
        source_path: "input_packet.symptoms[0]",
        finding: "Supplier payments are consistently 30 days late, indicating acute payables pressure",
        dimension: "financial_health",
        is_critical: true,
        confidence: "HIGH",
        no_outcome_leakage: true,
        rationale: "Systematic late payment to suppliers is a direct indicator of payables-side stress.",
      },
    ],
    metric_key_mappings: [],
    clarification_requests: [],
    validation_notes: "Synthetic sidecar for unit tests only.",
    ...overrides,
  };
}

// ── Section 1: HoldoutFixture schema — unit tests ─────────────────────────────

describe("HoldoutFixture schema: valid fixture is accepted", () => {
  it("accepts a fully valid HOL-NN-NNN fixture object", () => {
    const f = validateHoldoutFixture(validFixtureObject(), 0);
    expect(f.case_id).toBe("HOL-01-001");
    expect(f.title.length).toBeGreaterThan(0);
    expect(f.category).toBe("HC-01");
    expect(f.test_type).toBe("TT-1");
    expect(f.leakage_controls.leakage_check_passed).toBe(true);
  });
});

describe("HoldoutFixture schema: case_id must match HOL-NN-NNN", () => {
  it("rejects SMB-style case_id", () => {
    expect(() => validateHoldoutFixture(validFixtureObject({ case_id: "SMB-001" }), 0))
      .toThrow(/HOL-\\d\{2\}-\\d\{3\}/);
  });

  it("rejects HOL-1 (too short, single digit block)", () => {
    expect(() => validateHoldoutFixture(validFixtureObject({ case_id: "HOL-1" }), 0))
      .toThrow(/HOL-\\d\{2\}-\\d\{3\}/);
  });

  it("rejects HOL-01 (missing third segment)", () => {
    expect(() => validateHoldoutFixture(validFixtureObject({ case_id: "HOL-01" }), 0))
      .toThrow(/HOL-\\d\{2\}-\\d\{3\}/);
  });

  it("rejects missing case_id", () => {
    const obj = validFixtureObject() as Record<string, unknown>;
    delete obj["case_id"];
    expect(() => validateHoldoutFixture(obj, 0)).toThrow(/case_id/);
  });
});

describe("HoldoutFixture schema: title validation", () => {
  it("rejects blank title", () => {
    expect(() => validateHoldoutFixture(validFixtureObject({ title: "" }), 0))
      .toThrow(/title/);
  });

  it("rejects whitespace-only title", () => {
    expect(() => validateHoldoutFixture(validFixtureObject({ title: "   " }), 0))
      .toThrow(/title/);
  });
});

describe("HoldoutFixture schema: category and test_type must be valid codes", () => {
  it("rejects unknown category code", () => {
    expect(() => validateHoldoutFixture(validFixtureObject({ category: "HC-99" }), 0))
      .toThrow(/HC-99/);
  });

  it("rejects SMB-style category", () => {
    expect(() => validateHoldoutFixture(validFixtureObject({ category: "HC-0" }), 0))
      .toThrow(/category/);
  });

  it("rejects unknown test_type", () => {
    expect(() => validateHoldoutFixture(validFixtureObject({ test_type: "TT-9" }), 0))
      .toThrow(/TT-9/);
  });

  it("accepts all defined HOLDOUT_CATEGORIES", () => {
    for (const cat of HOLDOUT_CATEGORIES) {
      expect(() => validateHoldoutFixture(validFixtureObject({ category: cat }), 0))
        .not.toThrow();
    }
  });

  it("accepts all defined HOLDOUT_TEST_TYPES", () => {
    for (const tt of HOLDOUT_TEST_TYPES) {
      expect(() => validateHoldoutFixture(validFixtureObject({ test_type: tt }), 0))
        .not.toThrow();
    }
  });
});

describe("HoldoutFixture schema: sealed_expected_output validation", () => {
  it("rejects missing primary_root_cause", () => {
    const obj = validFixtureObject() as Record<string, unknown>;
    const seo = { ...(obj["sealed_expected_output"] as Record<string, unknown>) };
    delete seo["primary_root_cause"];
    obj["sealed_expected_output"] = seo;
    expect(() => validateHoldoutFixture(obj, 0)).toThrow(/primary_root_cause/);
  });

  it("rejects blank primary_root_cause", () => {
    const obj = validFixtureObject() as Record<string, unknown>;
    (obj["sealed_expected_output"] as Record<string, unknown>)["primary_root_cause"] = "   ";
    expect(() => validateHoldoutFixture(obj, 0)).toThrow(/primary_root_cause/);
  });

  it("rejects empty must_identify array", () => {
    const obj = validFixtureObject() as Record<string, unknown>;
    const seo = obj["sealed_expected_output"] as Record<string, unknown>;
    (seo["scoring_rubric"] as Record<string, unknown>)["must_identify"] = [];
    expect(() => validateHoldoutFixture(obj, 0)).toThrow(/must_identify/);
  });
});

describe("HoldoutFixture schema: input_packet cardinality rules", () => {
  it("rejects fewer than 3 symptoms", () => {
    const obj = validFixtureObject() as Record<string, unknown>;
    (obj["input_packet"] as Record<string, unknown>)["symptoms"] = ["only one symptom", "two"];
    expect(() => validateHoldoutFixture(obj, 0)).toThrow(/symptoms/);
  });

  it("rejects fewer than 2 misleading_signals", () => {
    const obj = validFixtureObject() as Record<string, unknown>;
    (obj["input_packet"] as Record<string, unknown>)["misleading_signals"] = ["only one signal"];
    expect(() => validateHoldoutFixture(obj, 0)).toThrow(/misleading_signals/);
  });

  it("rejects more than 6 missing_inputs_opsiq_should_request", () => {
    const obj = validFixtureObject() as Record<string, unknown>;
    (obj["input_packet"] as Record<string, unknown>)["missing_inputs_opsiq_should_request"] = [
      "a", "b", "c", "d", "e", "f", "g",
    ];
    expect(() => validateHoldoutFixture(obj, 0)).toThrow(/missing_inputs/);
  });
});

describe("HoldoutFixture schema: leakage_controls must be closed", () => {
  it("rejects author_read_benchmark_fixtures: true", () => {
    const obj = validFixtureObject() as Record<string, unknown>;
    (obj["leakage_controls"] as Record<string, unknown>)["author_read_benchmark_fixtures"] = true;
    expect(() => validateHoldoutFixture(obj, 0)).toThrow(/author_read_benchmark_fixtures/);
  });

  it("rejects author_read_composer_source: true", () => {
    const obj = validFixtureObject() as Record<string, unknown>;
    (obj["leakage_controls"] as Record<string, unknown>)["author_read_composer_source"] = true;
    expect(() => validateHoldoutFixture(obj, 0)).toThrow(/author_read_composer_source/);
  });
});

describe("HoldoutFixture schema: parseAndValidateHoldoutFixtures JSONL rules", () => {
  it("rejects duplicate case_id in JSONL", () => {
    const line = JSON.stringify(validFixtureObject({ case_id: "HOL-01-001" }));
    expect(() => parseAndValidateHoldoutFixtures(`${line}\n${line}`))
      .toThrow(/Duplicate case_id.*HOL-01-001/);
  });

  it("rejects invalid JSON line in JSONL", () => {
    const line = JSON.stringify(validFixtureObject());
    expect(() => parseAndValidateHoldoutFixtures(`${line}\n{broken`))
      .toThrow(/Invalid JSON/);
  });
});

// ── Section 2: HoldoutFixture schema — integration (all 10 real fixtures) ─────

describe("HoldoutFixture schema: all 10 real fixtures are valid", () => {
  it("JSONL file contains exactly 10 non-blank lines", () => {
    const content = readFileSync(FIXTURES_PATH, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim().length > 0);
    expect(lines).toHaveLength(10);
  });

  it("parseAndValidateHoldoutFixtures loads 10 fixtures without error", () => {
    const fixtures = loadAllFixtures();
    expect(fixtures).toHaveLength(10);
  });

  it("all 10 fixtures have HOL-NN-NNN case_ids", () => {
    const fixtures = loadAllFixtures();
    for (const f of fixtures) {
      expect(f.case_id).toMatch(/^HOL-\d{2}-\d{3}$/);
    }
  });

  it("all 10 fixtures have distinct case_ids", () => {
    const fixtures = loadAllFixtures();
    const ids = new Set(fixtures.map((f) => f.case_id));
    expect(ids.size).toBe(10);
  });

  it("all 10 fixtures have valid holdout categories (HC-01..HC-10)", () => {
    const fixtures = loadAllFixtures();
    for (const f of fixtures) {
      expect(HOLDOUT_CATEGORIES as readonly string[]).toContain(f.category);
    }
  });

  it("all 10 fixtures have valid test_type values (TT-1..TT-5)", () => {
    const fixtures = loadAllFixtures();
    for (const f of fixtures) {
      expect(HOLDOUT_TEST_TYPES as readonly string[]).toContain(f.test_type);
    }
  });

  it("all 10 fixtures have leakage_check_passed = true", () => {
    const fixtures = loadAllFixtures();
    for (const f of fixtures) {
      expect(f.leakage_controls.leakage_check_passed).toBe(true);
    }
  });

  for (const caseId of HOL_CASE_IDS) {
    it(`${caseId} is present and has a non-blank title`, () => {
      const fixtures = loadAllFixtures();
      const f = fixtures.find((x) => x.case_id === caseId);
      expect(f).toBeDefined();
      expect(f!.title.trim().length).toBeGreaterThan(0);
    });
  }
});

// ── Section 3: Sidecar validator — unit tests ─────────────────────────────────

describe("validateHoldoutSidecar: valid sidecar is accepted", () => {
  it("accepts a fully valid HOL sidecar", () => {
    const r = validateHoldoutSidecar(validSidecarObject());
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });
});

describe("validateHoldoutSidecar: case_id must match HOL-NN-NNN", () => {
  it("rejects SMB-style case_id with INVALID_CASE_ID", () => {
    const r = validateHoldoutSidecar(validSidecarObject({ case_id: "SMB-001" }));
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.code === "INVALID_CASE_ID")).toBe(true);
  });

  it("rejects HOL-1 (single-digit block) with INVALID_CASE_ID", () => {
    const r = validateHoldoutSidecar(validSidecarObject({ case_id: "HOL-1" }));
    expect(r.errors.some((e) => e.code === "INVALID_CASE_ID")).toBe(true);
  });

  it("accepts HOL-09-999", () => {
    const r = validateHoldoutSidecar(validSidecarObject({ case_id: "HOL-09-999" }));
    const caseIdErrors = r.errors.filter((e) => e.code === "INVALID_CASE_ID");
    expect(caseIdErrors).toHaveLength(0);
  });

  it("rejects missing case_id with MISSING_CASE_ID", () => {
    const obj = validSidecarObject() as Record<string, unknown>;
    delete obj["case_id"];
    const r = validateHoldoutSidecar(obj);
    expect(r.errors.some((e) => e.code === "MISSING_CASE_ID")).toBe(true);
  });
});

describe("validateHoldoutSidecar: fixture_version must be YYYY-MM-DD", () => {
  it("rejects missing fixture_version with MISSING_FIXTURE_VERSION", () => {
    const obj = validSidecarObject() as Record<string, unknown>;
    delete obj["fixture_version"];
    const r = validateHoldoutSidecar(obj);
    expect(r.errors.some((e) => e.code === "MISSING_FIXTURE_VERSION")).toBe(true);
  });

  it("rejects non-date fixture_version with INVALID_FIXTURE_VERSION", () => {
    const r = validateHoldoutSidecar(validSidecarObject({ fixture_version: "v1.0.0" }));
    expect(r.errors.some((e) => e.code === "INVALID_FIXTURE_VERSION")).toBe(true);
  });
});

describe("validateHoldoutSidecar: engine_archetype_synonym rules", () => {
  it("rejects missing archetype synonym with MISSING_ARCHETYPE_SYNONYM", () => {
    const obj = validSidecarObject() as Record<string, unknown>;
    delete obj["engine_archetype_synonym"];
    const r = validateHoldoutSidecar(obj);
    expect(r.errors.some((e) => e.code === "MISSING_ARCHETYPE_SYNONYM")).toBe(true);
  });

  it("accepts null synonym for gap cases when unsupported_expected_archetypes is non-empty", () => {
    const r = validateHoldoutSidecar(
      validSidecarObject({
        engine_archetype_synonym: null,
        unsupported_expected_archetypes: [
          { smb_label: "some_gap_case", gap_reason: "No engine archetype covers this pattern" },
        ],
      })
    );
    const synonymErrors = r.errors.filter(
      (e) => e.code === "MISSING_ARCHETYPE_SYNONYM" || e.code === "INVALID_ARCHETYPE_SYNONYM"
    );
    expect(synonymErrors).toHaveLength(0);
  });

  it("rejects non-null synonym when gap archetypes present — SYNONYM_MUST_BE_NULL_WHEN_UNSUPPORTED", () => {
    const r = validateHoldoutSidecar(
      validSidecarObject({
        engine_archetype_synonym: "working_capital_stress",
        unsupported_expected_archetypes: [
          { smb_label: "some_gap", gap_reason: "No coverage" },
        ],
      })
    );
    expect(r.errors.some((e) => e.code === "SYNONYM_MUST_BE_NULL_WHEN_UNSUPPORTED")).toBe(true);
  });
});

describe("validateHoldoutSidecar: evidence_items rules", () => {
  it("rejects missing evidence_items with MISSING_EVIDENCE_ITEMS", () => {
    const obj = validSidecarObject() as Record<string, unknown>;
    delete obj["evidence_items"];
    const r = validateHoldoutSidecar(obj);
    expect(r.errors.some((e) => e.code === "MISSING_EVIDENCE_ITEMS")).toBe(true);
  });

  it("rejects empty evidence_items with EMPTY_EVIDENCE_ITEMS", () => {
    const r = validateHoldoutSidecar(validSidecarObject({ evidence_items: [] }));
    expect(r.errors.some((e) => e.code === "EMPTY_EVIDENCE_ITEMS")).toBe(true);
  });

  it("rejects source_path referencing sealed_expected_output — OUTCOME_PATH_FORBIDDEN", () => {
    const r = validateHoldoutSidecar(
      validSidecarObject({
        evidence_items: [
          {
            source_path: "sealed_expected_output.primary_root_cause",
            finding: "some finding about the business",
            dimension: "financial_health",
            is_critical: false,
            confidence: "MEDIUM",
            no_outcome_leakage: true,
            rationale: "Should fail due to outcome-side source path.",
          },
        ],
      })
    );
    expect(r.errors.some((e) => e.code === "OUTCOME_PATH_FORBIDDEN")).toBe(true);
  });

  it("rejects no_outcome_leakage: false — OUTCOME_LEAKAGE_FLAGGED", () => {
    const r = validateHoldoutSidecar(
      validSidecarObject({
        evidence_items: [
          {
            source_path: "input_packet.symptoms[0]",
            finding: "some finding about the business",
            dimension: "financial_health",
            is_critical: false,
            confidence: "MEDIUM",
            no_outcome_leakage: false,
            rationale: "Testing leakage flag enforcement.",
          },
        ],
      })
    );
    expect(r.errors.some((e) => e.code === "OUTCOME_LEAKAGE_FLAGGED")).toBe(true);
  });

  it("rejects invalid dimension — INVALID_DIMENSION", () => {
    const r = validateHoldoutSidecar(
      validSidecarObject({
        evidence_items: [
          {
            source_path: "input_packet.symptoms[0]",
            finding: "some finding here",
            dimension: "strategic_vision",
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

  it("accepts all 7 valid dimensions without INVALID_DIMENSION errors", () => {
    for (const dim of VALID_DIMENSIONS) {
      const r = validateHoldoutSidecar(
        validSidecarObject({
          evidence_items: [
            {
              source_path: "input_packet.symptoms[0]",
              finding: "some business finding here",
              dimension: dim,
              is_critical: false,
              confidence: "MEDIUM",
              no_outcome_leakage: true,
              rationale: "Dimension coverage test.",
            },
          ],
        })
      );
      const dimErrors = r.errors.filter((e) => e.code === "INVALID_DIMENSION");
      expect(dimErrors).toHaveLength(0);
    }
  });
});

describe("validateHoldoutSidecar: misleading signal rules", () => {
  const MISLEADING_SOURCE = "input_packet.misleading_signals[0]";

  it("rejects misleading signal finding without required prefix — MISLEADING_SIGNAL_MISSING_PREFIX", () => {
    const r = validateHoldoutSidecar(
      validSidecarObject({
        evidence_items: [
          {
            source_path: MISLEADING_SOURCE,
            finding: "revenue is up 18% year-over-year and appears healthy",
            dimension: "financial_health",
            is_critical: false,
            confidence: "LOW",
            no_outcome_leakage: true,
            rationale: "Missing the required misleading signal prefix.",
          },
        ],
      })
    );
    expect(r.errors.some((e) => e.code === "MISLEADING_SIGNAL_MISSING_PREFIX")).toBe(true);
  });

  it("rejects misleading signal with is_critical=true — MISLEADING_SIGNAL_MUST_BE_NON_CRITICAL", () => {
    const r = validateHoldoutSidecar(
      validSidecarObject({
        evidence_items: [
          {
            source_path: MISLEADING_SOURCE,
            finding: "Surface signal (not root cause): revenue is up",
            dimension: "financial_health",
            is_critical: true,
            confidence: "LOW",
            no_outcome_leakage: true,
            rationale: "Misleading signal marked critical — should be rejected.",
          },
        ],
      })
    );
    expect(r.errors.some((e) => e.code === "MISLEADING_SIGNAL_MUST_BE_NON_CRITICAL")).toBe(true);
  });

  it("rejects misleading signal with confidence != LOW — MISLEADING_SIGNAL_MUST_BE_LOW", () => {
    const r = validateHoldoutSidecar(
      validSidecarObject({
        evidence_items: [
          {
            source_path: MISLEADING_SOURCE,
            finding: "Surface signal (not root cause): revenue is up",
            dimension: "financial_health",
            is_critical: false,
            confidence: "HIGH",
            no_outcome_leakage: true,
            rationale: "Misleading signal with HIGH confidence — should be rejected.",
          },
        ],
      })
    );
    expect(r.errors.some((e) => e.code === "MISLEADING_SIGNAL_MUST_BE_LOW")).toBe(true);
  });

  it("accepts a correctly formed misleading signal evidence item", () => {
    const r = validateHoldoutSidecar(
      validSidecarObject({
        evidence_items: [
          {
            source_path: MISLEADING_SOURCE,
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
    const misleadingErrors = r.errors.filter(
      (e) =>
        e.code === "MISLEADING_SIGNAL_MISSING_PREFIX" ||
        e.code === "MISLEADING_SIGNAL_MUST_BE_NON_CRITICAL" ||
        e.code === "MISLEADING_SIGNAL_MUST_BE_LOW"
    );
    expect(misleadingErrors).toHaveLength(0);
  });
});

describe("validateHoldoutSidecar: metric_key_mappings registry rules", () => {
  it("rejects unknown canonical_key — UNKNOWN_CANONICAL_KEY", () => {
    const r = validateHoldoutSidecar(
      validSidecarObject({
        metric_key_mappings: [
          {
            fixture_key: "some_fact_key",
            canonical_key: "inventoryTurnoverXYZ",
            evidence_item_index: 0,
          },
        ],
      })
    );
    expect(r.errors.some((e) => e.code === "UNKNOWN_CANONICAL_KEY")).toBe(true);
  });

  it("accepts all canonical keys from the registry", () => {
    for (const key of Object.keys(CANONICAL_KEY_DIMENSION_MAP)) {
      const requiredDim = CANONICAL_KEY_DIMENSION_MAP[key];
      const r = validateHoldoutSidecar(
        validSidecarObject({
          evidence_items: [
            {
              source_path: "input_packet.symptoms[0]",
              finding: "some finding text here about the business",
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
        (e) => e.code === "UNKNOWN_CANONICAL_KEY" || e.code === "CANONICAL_KEY_DIMENSION_MISMATCH"
      );
      expect(keyErrors).toHaveLength(0);
    }
  });

  it("rejects value_override without transform_note — MISSING_TRANSFORM_NOTE", () => {
    const r = validateHoldoutSidecar(
      validSidecarObject({
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
});

// ── Section 4: Sidecar validator — integration (all 10 real sidecars) ────────

describe("Holdout sidecar files: all 10 exist and pass validation", () => {
  it("evidence-hints directory contains exactly 10 sidecar files", () => {
    const files = readdirSync(HINTS_DIR).filter((f) => f.endsWith(".evidence-hints.json"));
    expect(files).toHaveLength(10);
  });

  for (const caseId of HOL_CASE_IDS) {
    it(`${caseId}.evidence-hints.json passes validateHoldoutSidecar`, () => {
      const raw = loadSidecarRaw(caseId);
      const result = validateHoldoutSidecar(raw);
      if (!result.valid) {
        const summary = result.errors.map((e) => `  [${e.code}] ${e.message}`).join("\n");
        throw new Error(`${caseId} sidecar has validation errors:\n${summary}`);
      }
      expect(result.valid).toBe(true);
    });

    it(`${caseId} sidecar case_id field matches filename`, () => {
      const raw = loadSidecarRaw(caseId) as Record<string, unknown>;
      expect(raw["case_id"]).toBe(caseId);
    });

    it(`${caseId} sidecar has at least 1 evidence item`, () => {
      const raw = loadSidecarRaw(caseId) as Record<string, unknown>;
      expect(Array.isArray(raw["evidence_items"])).toBe(true);
      expect((raw["evidence_items"] as unknown[]).length).toBeGreaterThan(0);
    });
  }
});

describe("Holdout sidecar files: all 10 have non-null archetype synonyms", () => {
  for (const caseId of HOL_CASE_IDS) {
    it(`${caseId} has a non-null engine_archetype_synonym`, () => {
      const raw = loadSidecarRaw(caseId) as Record<string, unknown>;
      expect(raw["engine_archetype_synonym"]).not.toBeNull();
      expect(typeof raw["engine_archetype_synonym"]).toBe("string");
    });
  }
});

// ── Section 5: Normalizer tests ───────────────────────────────────────────────

describe("normalizeHoldoutFixtureToEvidence: HOL-01-001 produces valid EvidenceItem[]", () => {
  it("produces non-empty EvidenceItem[] with valid UUIDs and dimensions", () => {
    const fixtures = loadAllFixtures();
    const fixture = fixtures.find((f) => f.case_id === "HOL-01-001")!;
    const result = normalizeHoldoutFixtureToEvidence(fixture);

    expect(result.caseId).toBe("HOL-01-001");
    expect(result.evidenceItems.length).toBeGreaterThan(0);
    expect(result.unsupportedArchetype).toBe(false);
    expect(result.expectedBehavior).toBe("DIAGNOSE");
    expect(result.expectedArchetypeSynonym).toBe("working_capital_stress");

    for (const item of result.evidenceItems) {
      expect(item.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
      expect(VALID_DIMENSIONS as readonly string[]).toContain(item.dimension);
      expect(typeof item.finding).toBe("string");
      expect(item.finding.length).toBeGreaterThan(0);
      expect(typeof item.isCritical).toBe("boolean");
    }
  });
});

describe("normalizeHoldoutFixtureToEvidence: all 10 fixtures normalize without error", () => {
  it("normalizes all 10 fixtures and all return DIAGNOSE behavior", () => {
    const fixtures = loadAllFixtures();
    expect(fixtures).toHaveLength(10);

    const results = [];
    for (const fixture of fixtures) {
      expect(() => {
        const r = normalizeHoldoutFixtureToEvidence(fixture);
        results.push(r);
      }).not.toThrow();
    }
    expect(results).toHaveLength(10);

    for (const r of results) {
      expect(r.expectedBehavior).toBe("DIAGNOSE");
      expect(r.evidenceItems.length).toBeGreaterThan(0);
    }
  });
});

describe("normalizeHoldoutFixtureToEvidence: all output dimensions are valid engine dimensions", () => {
  it("every EvidenceItem in every holdout fixture has a valid engine dimension", () => {
    const fixtures = loadAllFixtures();
    for (const fixture of fixtures) {
      const result = normalizeHoldoutFixtureToEvidence(fixture);
      for (const item of result.evidenceItems) {
        expect(VALID_DIMENSIONS as readonly string[]).toContain(item.dimension);
      }
    }
  });
});

describe("normalizeHoldoutFixtureToEvidence: missing sidecar fails closed", () => {
  it("throws MISSING_SIDECAR for a non-existent case_id", () => {
    const fixtures = loadAllFixtures();
    const baseFixture = fixtures[0];
    const badFixture = { ...baseFixture, case_id: "HOL-99-999" } as HoldoutFixture;
    expect(() => normalizeHoldoutFixtureToEvidence(badFixture)).toThrow(/MISSING_SIDECAR/);
  });
});

describe("normalizeHoldoutFixtureToEvidence: evidence isolation (sealed output not read)", () => {
  it("produces identical EvidenceItems regardless of what is in sealed_expected_output", () => {
    const fixtures = loadAllFixtures();
    const fixture = fixtures[0];

    const mutatedFixture: HoldoutFixture = {
      ...fixture,
      sealed_expected_output: {
        ...fixture.sealed_expected_output,
        primary_root_cause: "completely_fabricated_root_cause_for_test",
        scoring_rubric: {
          ...fixture.sealed_expected_output.scoring_rubric,
          must_identify: ["fabricated term that does not exist in any sidecar"],
        },
      },
    };

    const normal = normalizeHoldoutFixtureToEvidence(fixture);
    const mutated = normalizeHoldoutFixtureToEvidence(mutatedFixture);

    expect(mutated.evidenceItems.length).toBe(normal.evidenceItems.length);
    for (let i = 0; i < normal.evidenceItems.length; i++) {
      expect(mutated.evidenceItems[i].finding).toBe(normal.evidenceItems[i].finding);
      expect(mutated.evidenceItems[i].dimension).toBe(normal.evidenceItems[i].dimension);
    }
  });
});

// ── Section 6: Leakage guard ─────────────────────────────────────────────────

describe("checkSidecarLeakage: no violations for all 10 real fixture+sidecar pairs", () => {
  it("returns zero leakage violations for every real holdout pair", () => {
    const fixtures = loadAllFixtures();
    for (const fixture of fixtures) {
      const raw = loadSidecarRaw(fixture.case_id) as Parameters<typeof checkSidecarLeakage>[0];
      const violations = checkSidecarLeakage(raw, fixture);
      if (violations.length > 0) {
        const detail = violations
          .map((v) => `evidence_items[${v.evidenceItemIndex}] contains "${v.phrase}"`)
          .join("; ");
        throw new Error(`Leakage detected in ${fixture.case_id}: ${detail}`);
      }
      expect(violations).toHaveLength(0);
    }
  });
});

describe("checkSidecarLeakage: detects violation when sidecar finding contains a sealed phrase", () => {
  it("returns a LeakageViolation when a finding contains a must_identify phrase", () => {
    const fixtures = loadAllFixtures();
    const fixture = fixtures[0];
    const sealedPhrase = fixture.sealed_expected_output.scoring_rubric.must_identify[0];

    const leakySidecar = {
      case_id: fixture.case_id,
      fixture_version: "2026-06-23",
      engine_archetype_synonym: "working_capital_stress",
      unsupported_expected_archetypes: [],
      evidence_items: [
        {
          source_path: "input_packet.symptoms[0]",
          finding: `The business is experiencing a clear ${sealedPhrase} that explains the symptoms observed.`,
          dimension: "financial_health",
          is_critical: true,
          confidence: "HIGH",
          no_outcome_leakage: true,
          rationale: "Synthetic for leakage violation test.",
        },
      ],
      metric_key_mappings: [],
      clarification_requests: [],
      validation_notes: "Synthetic for leakage detection test.",
    } as Parameters<typeof checkSidecarLeakage>[0];

    const violations = checkSidecarLeakage(leakySidecar, fixture);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].phrase).toBe(sealedPhrase);
    expect(violations[0].evidenceItemIndex).toBe(0);
  });

  it("returns a LeakageViolation when a finding contains a bad_recommendations_to_flag phrase", () => {
    const fixtures = loadAllFixtures();
    const fixture = fixtures[0];
    const badPhrase = fixture.sealed_expected_output.bad_recommendations_to_flag[0];

    const leakySidecar = {
      case_id: fixture.case_id,
      fixture_version: "2026-06-23",
      engine_archetype_synonym: "working_capital_stress",
      unsupported_expected_archetypes: [],
      evidence_items: [
        {
          source_path: "input_packet.symptoms[0]",
          finding: `The owner should consider: ${badPhrase} to address the situation.`,
          dimension: "strategic_position",
          is_critical: false,
          confidence: "LOW",
          no_outcome_leakage: true,
          rationale: "Synthetic for bad-recommendation leakage test.",
        },
      ],
      metric_key_mappings: [],
      clarification_requests: [],
      validation_notes: "Synthetic for bad-rec leakage detection test.",
    } as Parameters<typeof checkSidecarLeakage>[0];

    const violations = checkSidecarLeakage(leakySidecar, fixture);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].phrase).toBe(badPhrase);
  });

  it("returns no violation when the finding does not contain any sealed phrase", () => {
    const fixtures = loadAllFixtures();
    const fixture = fixtures[0];

    const cleanSidecar = {
      case_id: fixture.case_id,
      fixture_version: "2026-06-23",
      engine_archetype_synonym: "working_capital_stress",
      unsupported_expected_archetypes: [],
      evidence_items: [
        {
          source_path: "input_packet.symptoms[0]",
          finding: "Supplier payments are overdue and the owner is drawing on personal funds to cover costs.",
          dimension: "financial_health",
          is_critical: true,
          confidence: "HIGH",
          no_outcome_leakage: true,
          rationale: "Clean finding with no sealed phrases.",
        },
      ],
      metric_key_mappings: [],
      clarification_requests: [],
      validation_notes: "Synthetic for clean-leakage check test.",
    } as Parameters<typeof checkSidecarLeakage>[0];

    const violations = checkSidecarLeakage(cleanSidecar, fixture);
    expect(violations).toHaveLength(0);
  });
});
