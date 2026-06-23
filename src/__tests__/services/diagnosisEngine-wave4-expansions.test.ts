/**
 * Wave 4 targeted tests:
 * 1. fin_isUnitEconomicsFailure() — LOCATION_UNIT_PATTERN for multi-site expansion (SIM-02-001)
 * 2. OPERATIONAL_BOTTLENECK — relaxed co-requirement: market_position declining signal (SIM-06-001)
 * 3. UE_LOCATION_EXPANSION sub-mechanism detection and sentence vocabulary
 * 4. OP_THROUGHPUT_CONSTRAINT sub-mechanism detection and sentence vocabulary
 * 5. Safety guards — prior sub-mechanisms unaffected; no regressions on existing cases
 */
import { describe, it, expect } from "vitest";
import { diagnoseRootCause } from "@/services/consulting-engine/diagnosis-engine";
import {
  detectSubMechanism,
  buildSubMechanismSentence,
  type SubMechanism,
  type ComposerInput,
} from "../../../tests/owner-mode/real-world-smb-cases/smbOutputComposer";
import {
  DiagnosisType,
  DiagnosisConfidence,
  ConfidenceLevel,
  type EvidenceItem,
} from "@/domain/consulting-engine/types";

// ── Minimal builder helpers ──────────────────────────────────────────────────

let seq = 0;
function ev(
  dimension: EvidenceItem["dimension"],
  finding: string,
  supportingData?: Record<string, number>,
  isCritical = false
): EvidenceItem {
  return {
    id: `ev-w4-${++seq}`,
    dimension,
    finding,
    confidence: ConfidenceLevel.HIGH,
    isCritical,
    supportingData,
  };
}

function baseInput(
  type: DiagnosisType,
  findingsText: string[],
  metrics: Record<string, number> = {}
): ComposerInput {
  return {
    diagnosisResult: {
      primaryRootCause: {
        id: "d-w4",
        type,
        description: "",
        mechanismDescription: "",
        evidenceIds: [],
        confidence: DiagnosisConfidence.MODERATE,
        alternativeExplanations: [],
        missingEvidenceFor: [],
      },
      alternativeRootCauses: [],
      confidence: DiagnosisConfidence.MODERATE,
      readinessForIntervention: "PROVISIONAL",
      warningFlags: [],
    },
    evidenceItems: [],
    sidecar: {
      case_id: "W4-TEST",
      engine_archetype_synonym: type.toLowerCase(),
      unsupported_expected_archetypes: [],
      evidence_items: findingsText.map((f, i) => ({
        source_path: `test[${i}]`,
        finding: f,
        dimension: "financial_health" as const,
        is_critical: false,
        confidence: "HIGH" as const,
      })),
      clarification_requests: [],
      metric_key_mappings: Object.entries(metrics).map(([k, v]) => ({
        fixture_key: k,
        canonical_key: k,
        evidence_item_index: 0,
        value_override: v,
      })),
    },
    scenario: {
      business: "Test business",
      missing_inputs_opsiq_should_request: [],
    },
  };
}

function containsPhrase(output: string, phrase: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const tokens = normalize(phrase).split(/\s+/).filter((t) => t.length > 2);
  if (tokens.length === 0) return true;
  const haystack = normalize(output);
  if (tokens.length <= 3) return haystack.includes(normalize(phrase));
  const matched = tokens.filter((t) => haystack.includes(t)).length;
  return matched / tokens.length >= 0.7;
}

// ── 1. LOCATION_UNIT_PATTERN — fin_isUnitEconomicsFailure() ─────────────────

describe("W4: LOCATION_UNIT_PATTERN — location-level fixed-cost overcommitment", () => {
  it("critical 'never generated enough revenue to cover their own operating costs' fires UNIT_ECONOMICS_FAILURE", () => {
    const evidence = [
      ev("financial_health", "two of the four locations have never generated enough revenue to cover their own operating costs", undefined, true),
      ev("financial_health", "no location has produced a sustained positive operating surplus since opening", undefined, true),
    ];
    const result = diagnoseRootCause(evidence, "Yoga studio chain");
    expect(result.primaryRootCause.type).toBe(DiagnosisType.UNIT_ECONOMICS_FAILURE);
  });

  it("critical 'cover their own operating costs' pattern fires UNIT_ECONOMICS_FAILURE", () => {
    const evidence = [
      ev("financial_health", "three sites have never been able to cover their own operating costs since launch", undefined, true),
    ];
    const result = diagnoseRootCause(evidence, "Multi-site business");
    expect(result.primaryRootCause.type).toBe(DiagnosisType.UNIT_ECONOMICS_FAILURE);
  });

  it("non-critical location cost finding does NOT fire UNIT_ECONOMICS_FAILURE via LOCATION_UNIT_PATTERN", () => {
    const evidence = [
      ev("financial_health", "two locations have never generated enough revenue to cover their own operating costs", undefined, false),
    ];
    const result = diagnoseRootCause(evidence, "Test business");
    expect(result.primaryRootCause.type).not.toBe(DiagnosisType.UNIT_ECONOMICS_FAILURE);
  });

  it("generic cost increase without location framing does NOT fire via LOCATION_UNIT_PATTERN", () => {
    const evidence = [
      ev("financial_health", "costs have increased significantly this quarter reducing margin", undefined, true),
    ];
    const result = diagnoseRootCause(evidence, "Test business");
    expect(result.primaryRootCause.type).not.toBe(DiagnosisType.UNIT_ECONOMICS_FAILURE);
  });

  it("existing UNITECON_HARD patterns still fire for negative contribution language", () => {
    const evidence = [
      ev("financial_health", "negative contribution margin on each unit sold due to rising costs", undefined, true),
    ];
    const result = diagnoseRootCause(evidence, "Test business");
    expect(result.primaryRootCause.type).toBe(DiagnosisType.UNIT_ECONOMICS_FAILURE);
  });
});

// ── 2. OPERATIONAL_BOTTLENECK — market_position declining-orders co-requirement ─

describe("W4: OPERATIONAL_BOTTLENECK — market_position declining-order co-requirement", () => {
  it("op bottleneck signal + market_position critical 'declining' fires OPERATIONAL_BOTTLENECK", () => {
    const evidence = [
      ev("operational_efficiency", "average order lead time has extended from 8 weeks to 14 weeks over the past 18 months", undefined, true),
      ev("market_position", "the business is declining potential orders because it cannot commit to a delivery date within an acceptable timeframe", undefined, true),
      ev("operational_efficiency", "all production staff report feeling busy throughout the working day but the owner is unable to identify which part of the process is causing delays", undefined, true),
    ];
    const result = diagnoseRootCause(evidence, "Custom furniture maker");
    expect(result.primaryRootCause.type).toBe(DiagnosisType.OPERATIONAL_BOTTLENECK);
  });

  it("op bottleneck signal + 'turning away' market_position fires OPERATIONAL_BOTTLENECK", () => {
    const evidence = [
      ev("operational_efficiency", "turnaround time on repairs has doubled due to backlog at the assembly stage", undefined, true),
      ev("market_position", "the business is turning away new enquiries due to lead time constraints", undefined, true),
    ];
    const result = diagnoseRootCause(evidence, "Repair shop");
    expect(result.primaryRootCause.type).toBe(DiagnosisType.OPERATIONAL_BOTTLENECK);
  });

  it("op bottleneck signal alone (no customer_retention AND no market_position declining) does NOT fire", () => {
    const evidence = [
      ev("operational_efficiency", "turnaround time on orders has extended from 4 days to 9 days due to capacity backlog", undefined, true),
    ];
    const result = diagnoseRootCause(evidence, "Test business");
    expect(result.primaryRootCause.type).not.toBe(DiagnosisType.OPERATIONAL_BOTTLENECK);
  });

  it("existing customer_retention co-requirement path still fires", () => {
    const evidence = [
      ev("operational_efficiency", "turnaround time has increased due to backlogs causing significant delays", undefined, true),
      ev("customer_retention", "customers cite low repeat visit rate due to wait time defects", undefined, true),
    ];
    const result = diagnoseRootCause(evidence, "Service business");
    expect(result.primaryRootCause.type).toBe(DiagnosisType.OPERATIONAL_BOTTLENECK);
  });

  it("non-critical market_position declining does NOT satisfy co-requirement", () => {
    const evidence = [
      ev("operational_efficiency", "turnaround times have increased causing throughput bottleneck", undefined, true),
      ev("market_position", "some enquiries were declined last month", undefined, false),
    ];
    const result = diagnoseRootCause(evidence, "Test business");
    expect(result.primaryRootCause.type).not.toBe(DiagnosisType.OPERATIONAL_BOTTLENECK);
  });
});

// ── 3. UE_LOCATION_EXPANSION sub-mechanism detection ────────────────────────

describe("W4: UE_LOCATION_EXPANSION sub-mechanism detection", () => {
  it("detects via 'location' + 'cover their own' keywords", () => {
    const input = baseInput(DiagnosisType.UNIT_ECONOMICS_FAILURE, [
      "two of the four locations have never generated enough revenue to cover their own operating costs",
    ]);
    expect(detectSubMechanism(input, DiagnosisType.UNIT_ECONOMICS_FAILURE)).toBe(
      "UE_LOCATION_EXPANSION"
    );
  });

  it("detects via 'location' + 'operating surplus' keywords", () => {
    const input = baseInput(DiagnosisType.UNIT_ECONOMICS_FAILURE, [
      "no location has produced a sustained positive operating surplus since opening",
    ]);
    expect(detectSubMechanism(input, DiagnosisType.UNIT_ECONOMICS_FAILURE)).toBe(
      "UE_LOCATION_EXPANSION"
    );
  });

  it("detects via 'location' + 'operating costs' keywords", () => {
    const input = baseInput(DiagnosisType.UNIT_ECONOMICS_FAILURE, [
      "four locations; combined revenue; no location-level profit and loss; three sites not covering operating costs",
    ]);
    expect(detectSubMechanism(input, DiagnosisType.UNIT_ECONOMICS_FAILURE)).toBe(
      "UE_LOCATION_EXPANSION"
    );
  });

  it("UE_FIXED_COST_BREAKEVEN takes priority when large monthly values present", () => {
    const input = baseInput(
      DiagnosisType.UNIT_ECONOMICS_FAILURE,
      ["location failed to cover their own operating costs from day one"],
      { variableCost: 85000, price: 60000 }
    );
    expect(detectSubMechanism(input, DiagnosisType.UNIT_ECONOMICS_FAILURE)).toBe(
      "UE_FIXED_COST_BREAKEVEN"
    );
  });
});

// ── 4. OP_THROUGHPUT_CONSTRAINT sub-mechanism detection ─────────────────────

describe("W4: OP_THROUGHPUT_CONSTRAINT sub-mechanism detection", () => {
  it("detects via 'lead time' + 'stage' keywords", () => {
    const input = baseInput(DiagnosisType.OPERATIONAL_BOTTLENECK, [
      "average lead time has extended; owner cannot identify which stage is the bottleneck",
    ]);
    expect(detectSubMechanism(input, DiagnosisType.OPERATIONAL_BOTTLENECK)).toBe(
      "OP_THROUGHPUT_CONSTRAINT"
    );
  });

  it("detects via 'lead time' + 'finishing' keywords", () => {
    const input = baseInput(DiagnosisType.OPERATIONAL_BOTTLENECK, [
      "lead time now 14 weeks; completed pieces waiting in the finishing area",
    ]);
    expect(detectSubMechanism(input, DiagnosisType.OPERATIONAL_BOTTLENECK)).toBe(
      "OP_THROUGHPUT_CONSTRAINT"
    );
  });

  it("detects via 'production' + 'furniture' keywords", () => {
    const input = baseInput(DiagnosisType.OPERATIONAL_BOTTLENECK, [
      "custom furniture production process has uniformly busy staff across all stages",
    ]);
    expect(detectSubMechanism(input, DiagnosisType.OPERATIONAL_BOTTLENECK)).toBe(
      "OP_THROUGHPUT_CONSTRAINT"
    );
  });

  it("OWNER_CAPACITY_CEILING still takes priority when 'non-billable' + 'billable' present", () => {
    const input = baseInput(DiagnosisType.OPERATIONAL_BOTTLENECK, [
      "owner non-billable hours consume lead time capacity; billable work suffers",
    ]);
    expect(detectSubMechanism(input, DiagnosisType.OPERATIONAL_BOTTLENECK)).toBe(
      "OWNER_CAPACITY_CEILING"
    );
  });
});

// ── 5. UE_LOCATION_EXPANSION sentence vocabulary (SIM-02-001 must_identify) ──

describe("W4: UE_LOCATION_EXPANSION sentence covers SIM-02-001 must_identify", () => {
  const input = baseInput(DiagnosisType.UNIT_ECONOMICS_FAILURE, [
    "two of the four locations have never generated enough revenue to cover their own operating costs",
    "no location has produced a sustained positive operating surplus since opening",
    "no location-level profit and loss available",
  ]);
  const sentence = buildSubMechanismSentence(input, "UE_LOCATION_EXPANSION" as SubMechanism);

  it("covers 'fixed overhead per location'", () => {
    expect(containsPhrase(sentence, "fixed overhead per location")).toBe(true);
  });

  it("covers 'revenue required to break even per site'", () => {
    expect(containsPhrase(sentence, "revenue required to break even per site")).toBe(true);
  });

  it("covers 'location-level viability'", () => {
    expect(containsPhrase(sentence, "location-level viability")).toBe(true);
  });

  it("covers 'expansion decision without unit economics'", () => {
    expect(containsPhrase(sentence, "expansion decision without unit economics")).toBe(true);
  });

  it("covers 'locations not covering their own costs'", () => {
    expect(containsPhrase(sentence, "locations not covering their own costs")).toBe(true);
  });
});

// ── 6. OP_THROUGHPUT_CONSTRAINT sentence vocabulary (SIM-06-001 must_identify) ─

describe("W4: OP_THROUGHPUT_CONSTRAINT sentence covers SIM-06-001 must_identify", () => {
  const input = baseInput(DiagnosisType.OPERATIONAL_BOTTLENECK, [
    "average order lead time has extended from 8 weeks to 14 weeks over the past 18 months",
    "completed pieces are sometimes waiting in the finishing area for extended periods",
    "all production staff report feeling busy but owner cannot identify which stage is causing delays",
  ]);
  const sentence = buildSubMechanismSentence(input, "OP_THROUGHPUT_CONSTRAINT" as SubMechanism);

  it("covers 'stage-level dwell time analysis needed'", () => {
    expect(containsPhrase(sentence, "stage-level dwell time analysis needed")).toBe(true);
  });

  it("covers 'visible work-in-progress waiting between stages'", () => {
    expect(containsPhrase(sentence, "visible work-in-progress waiting between stages")).toBe(true);
  });

  it("covers 'constraint location unknown before staffing decision'", () => {
    expect(containsPhrase(sentence, "constraint location unknown before staffing decision")).toBe(true);
  });

  it("covers 'lead time extension as symptom of bottleneck not headcount'", () => {
    expect(containsPhrase(sentence, "lead time extension as symptom of bottleneck not headcount")).toBe(true);
  });

  it("covers 'cost of adding staff before locating constraint'", () => {
    expect(containsPhrase(sentence, "cost of adding staff before locating constraint")).toBe(true);
  });
});

// ── 7. Safety guards ─────────────────────────────────────────────────────────

describe("W4: safety guards — prior sub-mechanisms unaffected", () => {
  it("UE_PAID_ACQUISITION still detects via numeric CAC proxy > LTV proxy", () => {
    const input = baseInput(
      DiagnosisType.UNIT_ECONOMICS_FAILURE,
      ["customer acquisition cost exceeds revenue per customer"],
      { variableCost: 200, price: 150 }
    );
    expect(detectSubMechanism(input, DiagnosisType.UNIT_ECONOMICS_FAILURE)).toBe(
      "UE_PAID_ACQUISITION"
    );
  });

  it("MARGIN_FOOD_COST_ABSORPTION still detects via 'ingredient'", () => {
    const input = baseInput(DiagnosisType.MARGIN_EROSION, [
      "ingredient costs have risen significantly over the past year",
    ]);
    expect(detectSubMechanism(input, DiagnosisType.MARGIN_EROSION)).toBe("MARGIN_FOOD_COST_ABSORPTION");
  });

  it("DEMAND_STAGNATION_SUBSCRIBER_CHURN still detects via 'subscriber'", () => {
    const input = baseInput(DiagnosisType.DEMAND_GENERATION_FAILURE, [
      "subscriber count flat for 12 months despite new signups",
    ]);
    expect(detectSubMechanism(input, DiagnosisType.DEMAND_GENERATION_FAILURE)).toBe(
      "DEMAND_STAGNATION_SUBSCRIBER_CHURN"
    );
  });

  it("MARGIN_SUPPLIER_COST_BLENDED still detects via 'supplier'", () => {
    const input = baseInput(DiagnosisType.MARGIN_EROSION, [
      "supplier price increases have not been passed through to customers",
    ]);
    expect(detectSubMechanism(input, DiagnosisType.MARGIN_EROSION)).toBe("MARGIN_SUPPLIER_COST_BLENDED");
  });

  it("DEMAND_STAFF_ROTATION_RETENTION still detects via 'operative'", () => {
    const input = baseInput(DiagnosisType.DEMAND_GENERATION_FAILURE, [
      "the operative assigned to each client changes frequently between sessions",
    ]);
    expect(detectSubMechanism(input, DiagnosisType.DEMAND_GENERATION_FAILURE)).toBe(
      "DEMAND_STAFF_ROTATION_RETENTION"
    );
  });
});
