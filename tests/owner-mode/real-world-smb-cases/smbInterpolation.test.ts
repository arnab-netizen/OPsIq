/**
 * SMB Engine Interpolation Tests
 *
 * Verifies that buildInterpolatedCausalSentence derives text only from
 * evidenceItems[].supportingData and sidecar metric_key_mappings value_overrides.
 * No fixture answer-key fields (must_identify, expected_first_action,
 * bad_recommendations_to_flag, expected_opsiq_diagnosis) are read in any test.
 */

import { describe, it, expect } from "vitest";
import { DiagnosisType, DiagnosisConfidence } from "@/domain/consulting-engine/types";
import type { EvidenceItem } from "@/domain/consulting-engine/types";
import type { DiagnosisResult } from "@/services/consulting-engine/diagnosis-engine";
import {
  buildInterpolatedCausalSentence,
  CANONICAL_METRIC_LABELS,
} from "./smbOutputComposer";
import type { ComposerInput, ComposerSidecar, ComposerScenario } from "./smbOutputComposer";

// ── Minimal builder helpers ───────────────────────────────────────────────────

function makeSidecar(overrides: Partial<ComposerSidecar> = {}): ComposerSidecar {
  return {
    case_id: "TEST-000",
    engine_archetype_synonym: null,
    unsupported_expected_archetypes: [],
    evidence_items: [],
    clarification_requests: [],
    metric_key_mappings: [],
    ...overrides,
  };
}

function makeScenario(): ComposerScenario {
  return {
    business: "Test business",
    missing_inputs_opsiq_should_request: [],
  };
}

function makeDiagnosisResult(type: DiagnosisType): DiagnosisResult {
  return {
    primaryRootCause: {
      type,
      description: "Test description",
      mechanismDescription: "Test mechanism",
      missingEvidenceFor: [],
    },
    alternativeRootCauses: [],
    confidence: DiagnosisConfidence.HIGH,
    warningFlags: [],
  };
}

function makeEvidenceItem(supportingData: Record<string, unknown>): EvidenceItem {
  return {
    id: "ev-test",
    type: "financial_metric" as never,
    value: null,
    confidence: "HIGH" as never,
    source: "test",
    supportingData,
  };
}

function makeInput(
  type: DiagnosisType,
  evidenceItems: EvidenceItem[],
  sidecarOverrides: Partial<ComposerSidecar> = {}
): ComposerInput {
  return {
    diagnosisResult: makeDiagnosisResult(type),
    evidenceItems,
    sidecar: makeSidecar(sidecarOverrides),
    scenario: makeScenario(),
  };
}

// ── Test group 1: Interpolation uses only evidence/supportingData ─────────────

describe("Interpolation data source isolation", () => {
  it("WORKING_CAPITAL_STRESS uses dso from supportingData", () => {
    const input = makeInput(DiagnosisType.WORKING_CAPITAL_STRESS, [
      makeEvidenceItem({ dso: 60 }),
    ]);
    const sentence = buildInterpolatedCausalSentence(input, DiagnosisType.WORKING_CAPITAL_STRESS);
    expect(sentence).toContain("60");
    expect(sentence).toContain("days sales outstanding");
  });

  it("WORKING_CAPITAL_STRESS uses value_override from sidecar when supportingData absent", () => {
    const input = makeInput(DiagnosisType.WORKING_CAPITAL_STRESS, [], {
      metric_key_mappings: [
        {
          fixture_key: "receivables_days",
          canonical_key: "dso",
          evidence_item_index: 0,
          value_override: 55,
        },
      ],
    });
    const sentence = buildInterpolatedCausalSentence(input, DiagnosisType.WORKING_CAPITAL_STRESS);
    expect(sentence).toContain("55");
  });

  it("UNIT_ECONOMICS_FAILURE uses contribution from supportingData", () => {
    const input = makeInput(DiagnosisType.UNIT_ECONOMICS_FAILURE, [
      makeEvidenceItem({ contribution: -13 }),
    ]);
    const sentence = buildInterpolatedCausalSentence(input, DiagnosisType.UNIT_ECONOMICS_FAILURE);
    expect(sentence).toContain("-13");
    expect(sentence).toContain("contribution margin");
  });

  it("MARGIN_EROSION uses profitChangePercent from supportingData", () => {
    const input = makeInput(DiagnosisType.MARGIN_EROSION, [
      makeEvidenceItem({ profitChangePercent: -13 }),
    ]);
    const sentence = buildInterpolatedCausalSentence(input, DiagnosisType.MARGIN_EROSION);
    expect(sentence).toContain("13%");
  });
});

// ── Test group 2: Unknown metric key ignored / fails closed ───────────────────

describe("Unknown metric key handling", () => {
  it("Unknown key in supportingData does not cause crash and falls back", () => {
    const input = makeInput(DiagnosisType.WORKING_CAPITAL_STRESS, [
      makeEvidenceItem({ unknownXYZ: 999, anotherUnknown: "foo" }),
    ]);
    // Falls back to static sentence — no exception
    const sentence = buildInterpolatedCausalSentence(input, DiagnosisType.WORKING_CAPITAL_STRESS);
    expect(typeof sentence).toBe("string");
    expect(sentence.length).toBeGreaterThan(0);
    // Should NOT contain the unknown numeric value
    expect(sentence).not.toContain("999");
  });

  it("Unknown metric_key_mapping canonical_key is ignored", () => {
    const input = makeInput(DiagnosisType.UNIT_ECONOMICS_FAILURE, [], {
      metric_key_mappings: [
        {
          fixture_key: "something",
          canonical_key: "notARealKey",
          evidence_item_index: 0,
          value_override: 42,
        },
      ],
    });
    // Falls back to static no-numerics sentence — should not contain 42
    const sentence = buildInterpolatedCausalSentence(input, DiagnosisType.UNIT_ECONOMICS_FAILURE);
    expect(sentence).not.toContain("42");
  });
});

// ── Test group 3: Root summary changes when supportingData changes ────────────

describe("Root summary reflects supportingData changes", () => {
  it("WORKING_CAPITAL_STRESS: different dso values produce different sentences", () => {
    const input30 = makeInput(DiagnosisType.WORKING_CAPITAL_STRESS, [
      makeEvidenceItem({ dso: 30 }),
    ]);
    const input90 = makeInput(DiagnosisType.WORKING_CAPITAL_STRESS, [
      makeEvidenceItem({ dso: 90 }),
    ]);
    const s30 = buildInterpolatedCausalSentence(input30, DiagnosisType.WORKING_CAPITAL_STRESS);
    const s90 = buildInterpolatedCausalSentence(input90, DiagnosisType.WORKING_CAPITAL_STRESS);
    expect(s30).not.toBe(s90);
    expect(s30).toContain("30");
    expect(s90).toContain("90");
  });

  it("MARGIN_EROSION: no numerics falls back to static; with numerics adds value", () => {
    const inputStatic = makeInput(DiagnosisType.MARGIN_EROSION, []);
    const inputNumeric = makeInput(DiagnosisType.MARGIN_EROSION, [
      makeEvidenceItem({ profitChangePercent: -20 }),
    ]);
    const sStatic = buildInterpolatedCausalSentence(inputStatic, DiagnosisType.MARGIN_EROSION);
    const sNumeric = buildInterpolatedCausalSentence(inputNumeric, DiagnosisType.MARGIN_EROSION);
    expect(sStatic).not.toBe(sNumeric);
    expect(sNumeric).toContain("20%");
  });
});

// ── Test group 4: Root summary does not contain must_identify phrases ─────────
// must_identify phrases verified against fixture but NOT read from ComposerInput.

describe("must_identify phrase isolation", () => {
  const SMB001_MUST_IDENTIFY_FORBIDDEN = [
    "ar ap mismatch",
    "cash flow gap",
    "payables due before receivables collected",
  ];
  const SMB002_MUST_IDENTIFY_FORBIDDEN = [
    "inventory cash trap",
    "working capital locked in inventory",
    "slow-moving stock",
  ];
  const SMB003_MUST_IDENTIFY_FORBIDDEN = [
    "ltv to cac ratio",
    "negative contribution after cac",
    "paid channel is loss-making at scale",
  ];
  const SMB010_MUST_IDENTIFY_FORBIDDEN = [
    "commodity cost increase",
    "margin compression without pricing response",
    "price has not been raised despite cost increase",
  ];

  function normalize(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  }

  it("WORKING_CAPITAL_STRESS (SMB-001) sentence does not contain forbidden must_identify phrases", () => {
    const input = makeInput(DiagnosisType.WORKING_CAPITAL_STRESS, [
      makeEvidenceItem({ dso: 60 }),
    ]);
    const sentence = normalize(buildInterpolatedCausalSentence(input, DiagnosisType.WORKING_CAPITAL_STRESS));
    for (const phrase of SMB001_MUST_IDENTIFY_FORBIDDEN) {
      expect(sentence).not.toContain(normalize(phrase));
    }
  });

  it("INVENTORY_FORECASTING_MISMATCH (SMB-002) sentence does not contain forbidden must_identify phrases", () => {
    const input = makeInput(DiagnosisType.INVENTORY_FORECASTING_MISMATCH, []);
    const sentence = normalize(buildInterpolatedCausalSentence(input, DiagnosisType.INVENTORY_FORECASTING_MISMATCH));
    for (const phrase of SMB002_MUST_IDENTIFY_FORBIDDEN) {
      expect(sentence).not.toContain(normalize(phrase));
    }
  });

  it("UNIT_ECONOMICS_FAILURE (SMB-003) sentence does not contain forbidden must_identify phrases", () => {
    const input = makeInput(DiagnosisType.UNIT_ECONOMICS_FAILURE, [
      makeEvidenceItem({ variableCost: 95, price: 82 }),
    ]);
    const sentence = normalize(buildInterpolatedCausalSentence(input, DiagnosisType.UNIT_ECONOMICS_FAILURE));
    for (const phrase of SMB003_MUST_IDENTIFY_FORBIDDEN) {
      expect(sentence).not.toContain(normalize(phrase));
    }
  });

  it("MARGIN_EROSION (SMB-010) sentence does not contain forbidden must_identify phrases", () => {
    const input = makeInput(DiagnosisType.MARGIN_EROSION, [
      makeEvidenceItem({ profitChangePercent: -13 }),
    ]);
    const sentence = normalize(buildInterpolatedCausalSentence(input, DiagnosisType.MARGIN_EROSION));
    for (const phrase of SMB010_MUST_IDENTIFY_FORBIDDEN) {
      expect(sentence).not.toContain(normalize(phrase));
    }
  });
});

// ── Test group 5: Root summary does not contain bad_rec phrases ───────────────

describe("Bad recommendation phrase isolation", () => {
  function normalize(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  }

  const BAD_RECS_UNIT_ECONOMICS = [
    "grow faster without fixing contribution",
    "double acquisition spending",
    "add new channels before fixing unit margin",
    "bring in outside capital to fuel growth",
    "discount to capture volume",
  ];

  const BAD_RECS_MARGIN_EROSION = [
    "drive higher customer throughput",
    "cut prices to attract demand",
    "run a discount promotion",
    "grow marketing outlay",
  ];

  it("UNIT_ECONOMICS_FAILURE sentence does not contain bad_rec phrases", () => {
    const input = makeInput(DiagnosisType.UNIT_ECONOMICS_FAILURE, [
      makeEvidenceItem({ variableCost: 95, price: 82 }),
    ]);
    const sentence = normalize(buildInterpolatedCausalSentence(input, DiagnosisType.UNIT_ECONOMICS_FAILURE));
    for (const phrase of BAD_RECS_UNIT_ECONOMICS) {
      expect(sentence).not.toContain(normalize(phrase));
    }
  });

  it("MARGIN_EROSION sentence does not contain bad_rec phrases", () => {
    const input = makeInput(DiagnosisType.MARGIN_EROSION, [
      makeEvidenceItem({ profitChangePercent: -13 }),
    ]);
    const sentence = normalize(buildInterpolatedCausalSentence(input, DiagnosisType.MARGIN_EROSION));
    for (const phrase of BAD_RECS_MARGIN_EROSION) {
      expect(sentence).not.toContain(normalize(phrase));
    }
  });
});

// ── Test group 6: Unsupported cases return empty string ───────────────────────

describe("Unsupported archetype cases return empty interpolation", () => {
  it("Unknown type returns empty string", () => {
    const input = makeInput(DiagnosisType.UNKNOWN, []);
    const sentence = buildInterpolatedCausalSentence(input, DiagnosisType.UNKNOWN);
    expect(sentence).toBe("");
  });

  it("CASH_LIQUIDITY_CRISIS (not in interpolation scope) returns empty string", () => {
    const input = makeInput(DiagnosisType.CASH_LIQUIDITY_CRISIS, [
      makeEvidenceItem({ cashRunwayMonths: 1 }),
    ]);
    const sentence = buildInterpolatedCausalSentence(input, DiagnosisType.CASH_LIQUIDITY_CRISIS);
    expect(sentence).toBe("");
  });

  it("KEY_PERSON_RISK (not in interpolation scope) returns empty string", () => {
    const input = makeInput(DiagnosisType.KEY_PERSON_RISK, []);
    const sentence = buildInterpolatedCausalSentence(input, DiagnosisType.KEY_PERSON_RISK);
    expect(sentence).toBe("");
  });
});

// ── Test group 7: Canonical metric label registry integrity ───────────────────

describe("CANONICAL_METRIC_LABELS registry", () => {
  it("dso maps to days sales outstanding", () => {
    expect(CANONICAL_METRIC_LABELS["dso"]).toBe("days sales outstanding");
  });

  it("contribution maps to contribution margin per unit", () => {
    expect(CANONICAL_METRIC_LABELS["contribution"]).toBe("contribution margin per unit");
  });

  it("operatingMargin maps to operating margin", () => {
    expect(CANONICAL_METRIC_LABELS["operatingMargin"]).toBe("operating margin");
  });

  it("unknown key is undefined (not a crash)", () => {
    expect(CANONICAL_METRIC_LABELS["totallyFakeKey"]).toBeUndefined();
  });

  it("registry has at least 20 entries", () => {
    expect(Object.keys(CANONICAL_METRIC_LABELS).length).toBeGreaterThanOrEqual(20);
  });
});

// ── Test group 8: OPERATIONAL_BOTTLENECK is conservative ─────────────────────

describe("OPERATIONAL_BOTTLENECK interpolation is conservative", () => {
  it("produces a static sentence regardless of numeric data", () => {
    const inputNoData = makeInput(DiagnosisType.OPERATIONAL_BOTTLENECK, []);
    const inputWithData = makeInput(DiagnosisType.OPERATIONAL_BOTTLENECK, [
      makeEvidenceItem({ utilizationRate: 95, ownerHoursPerWeek: 70 }),
    ]);
    const s1 = buildInterpolatedCausalSentence(inputNoData, DiagnosisType.OPERATIONAL_BOTTLENECK);
    const s2 = buildInterpolatedCausalSentence(inputWithData, DiagnosisType.OPERATIONAL_BOTTLENECK);
    // Both produce non-empty conservative sentence
    expect(s1.length).toBeGreaterThan(0);
    // Volume-sensitive archetype — sentence should not recommend taking on more load
    expect(s1.toLowerCase()).not.toContain("grow");
    expect(s1.toLowerCase()).not.toContain("hire");
    // Static sentence — same regardless of numeric data
    expect(s1).toBe(s2);
  });
});

// ── Test group 9: Evidence-only score does not regress ────────────────────────
// Verifies that the interpolated sentence does not introduce bad_rec or must_identify
// vocabulary that would cause guard failures. This is a structural contract test —
// the actual score computation is in the full harness.

describe("Evidence-only score contract", () => {
  it("WORKING_CAPITAL_STRESS interpolation does not contain growth advice vocabulary", () => {
    const input = makeInput(DiagnosisType.WORKING_CAPITAL_STRESS, [
      makeEvidenceItem({ dso: 60 }),
    ]);
    const sentence = buildInterpolatedCausalSentence(input, DiagnosisType.WORKING_CAPITAL_STRESS).toLowerCase();
    const forbiddenGrowthTerms = ["grow revenue", "bring on new clients", "add sales headcount", "borrow to fund"];
    for (const term of forbiddenGrowthTerms) {
      expect(sentence).not.toContain(term);
    }
  });

  it("INVENTORY_FORECASTING_MISMATCH interpolation does not contain replenish/add-stock advice", () => {
    const input = makeInput(DiagnosisType.INVENTORY_FORECASTING_MISMATCH, []);
    const sentence = buildInterpolatedCausalSentence(input, DiagnosisType.INVENTORY_FORECASTING_MISMATCH).toLowerCase();
    const forbiddenTerms = ["replenish stock", "add product varieties", "use marketing to move excess"];
    for (const term of forbiddenTerms) {
      expect(sentence).not.toContain(term);
    }
  });
});
