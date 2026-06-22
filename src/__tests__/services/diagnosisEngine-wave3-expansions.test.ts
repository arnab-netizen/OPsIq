/**
 * Wave 3 targeted tests:
 * 1. LEGAL "enquiry" suppression — removing "enquiry" from STRONG_LEGAL_TEXT
 * 2. Churn-driven demand failure — fin_isChurnDrivenDemandFailure
 * 3. New sub-mechanism detection — DEMAND_STAFF_ROTATION_RETENTION, MARGIN_SUPPLIER_COST_BLENDED
 * 4. Vocabulary coverage for SIM-03-001 and SIM-04-002 must_identify terms
 * 5. Safety guards — no regressions on legitimate LEGAL/DEMAND/MARGIN cases
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
    id: `ev-w3-${++seq}`,
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
    diagnosis: {
      id: "d-w3",
      type,
      description: "",
      mechanismDescription: "",
      evidenceIds: [],
      confidence: DiagnosisConfidence.MODERATE,
      alternativeExplanations: [],
      missingEvidenceFor: [],
    },
    evidence: [],
    missingInputKeys: [],
    sidecar: {
      case_id: "W3-TEST",
      fixture_version: "2026-06-22",
      engine_archetype_synonym: type.toLowerCase(),
      unsupported_expected_archetypes: [],
      evidence_items: findingsText.map((f, i) => ({
        source_path: `test[${i}]`,
        finding: f,
        dimension: "financial_health" as const,
        is_critical: false,
        confidence: "HIGH" as const,
        no_outcome_leakage: true,
        rationale: "test",
      })),
      metric_key_mappings: Object.entries(metrics).map(([k, v]) => ({
        fixture_key: k,
        canonical_key: k,
        evidence_item_index: 0,
        value_override: v,
      })),
      clarification_requests: [],
      validation_notes: "Wave 3 test",
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

// ── 1. LEGAL "enquiry" suppression ──────────────────────────────────────────

describe("W3: LEGAL 'enquiry' suppression", () => {
  it("bare 'enquiry' in market_position does NOT fire LEGAL_GOVERNANCE_RISK", () => {
    const evidence = [
      ev("market_position", "new client enquiry volume is healthy and initial booking conversion is acceptable"),
      ev("market_position", "200 monthly enquiries received with high initial conversion"),
    ];
    const result = diagnoseRootCause(evidence, "Test business");
    expect(result.primaryRootCause.type).not.toBe(DiagnosisType.LEGAL_GOVERNANCE_RISK);
  });

  it("'enquiry' alone in process_maturity does NOT fire LEGAL_GOVERNANCE_RISK", () => {
    const evidence = [
      ev("process_maturity", "client enquiry process is informal with no tracking system"),
    ];
    const result = diagnoseRootCause(evidence, "Test business");
    expect(result.primaryRootCause.type).not.toBe(DiagnosisType.LEGAL_GOVERNANCE_RISK);
  });

  it("'enquiry' combined with 'regulatory' in process_maturity STILL fires LEGAL (2+ LEGAL_TEXT hits)", () => {
    const evidence = [
      ev("process_maturity", "regulatory enquiry opened into licensing compliance breach", { complianceGapCount: 3 }),
    ];
    const result = diagnoseRootCause(evidence, "Test business");
    expect(result.primaryRootCause.type).toBe(DiagnosisType.LEGAL_GOVERNANCE_RISK);
  });

  it("genuine misconduct evidence still fires LEGAL_GOVERNANCE_RISK", () => {
    const evidence = [
      ev("process_maturity", "employee misconduct investigation opened by regulator", { complianceGapCount: 5 }),
      ev("process_maturity", "regulatory consent order issued for non-compliance"),
    ];
    const result = diagnoseRootCause(evidence, "Test business");
    expect(result.primaryRootCause.type).toBe(DiagnosisType.LEGAL_GOVERNANCE_RISK);
  });

  it("fraud evidence still fires LEGAL_GOVERNANCE_RISK", () => {
    const evidence = [
      ev("process_maturity", "fraud detected in accounts payable process requiring external audit"),
      ev("process_maturity", "unauthorized account access audit revealed control failure"),
    ];
    const result = diagnoseRootCause(evidence, "Test business");
    expect(result.primaryRootCause.type).toBe(DiagnosisType.LEGAL_GOVERNANCE_RISK);
  });

  it("penalty + non-compliance fires LEGAL_GOVERNANCE_RISK", () => {
    const evidence = [
      ev("process_maturity", "penalty notice received for non-compliance with licensing requirements", { regulatoryDeadlineDays: 30 }),
    ];
    const result = diagnoseRootCause(evidence, "Test business");
    expect(result.primaryRootCause.type).toBe(DiagnosisType.LEGAL_GOVERNANCE_RISK);
  });
});

// ── 2. Churn-driven demand failure (engine path) ─────────────────────────────

describe("W3: fin_isChurnDrivenDemandFailure engine path", () => {
  it("critical customer_retention departure evidence + demandDurabilityMonths fires DEMAND_GENERATION_FAILURE", () => {
    const evidence = [
      { ...ev("customer_retention", "most clients stop engaging after two to four sessions without providing an explanation"), isCritical: true, supportingData: { demandDurabilityMonths: 3 } },
      ev("customer_retention", "multiple clients have mentioned that a different person performed their most recent visit", undefined, true),
    ];
    const result = diagnoseRootCause(evidence, "Cleaning service business");
    expect(result.primaryRootCause.type).toBe(DiagnosisType.DEMAND_GENERATION_FAILURE);
  });

  it("non-critical customer_retention departure evidence does NOT fire churn demand path", () => {
    const evidence = [
      { ...ev("customer_retention", "some clients stop engaging after a few sessions"), isCritical: false, supportingData: { demandDurabilityMonths: 3 } },
    ];
    const result = diagnoseRootCause(evidence, "Test business");
    expect(result.primaryRootCause.type).not.toBe(DiagnosisType.DEMAND_GENERATION_FAILURE);
  });

  it("critical departure evidence WITHOUT demandDurabilityMonths does NOT fire churn demand path", () => {
    const evidence = [
      { ...ev("customer_retention", "most clients stop engaging after two sessions"), isCritical: true },
    ];
    const result = diagnoseRootCause(evidence, "Test business");
    expect(result.primaryRootCause.type).not.toBe(DiagnosisType.DEMAND_GENERATION_FAILURE);
  });

  it("generic satisfaction complaint in customer_retention does NOT fire churn demand path", () => {
    const evidence = [
      { ...ev("customer_retention", "some customers report dissatisfaction with wait times"), isCritical: true, supportingData: { demandDurabilityMonths: 8 } },
    ];
    const result = diagnoseRootCause(evidence, "Test business");
    expect(result.primaryRootCause.type).not.toBe(DiagnosisType.DEMAND_GENERATION_FAILURE);
  });
});

// ── 3. DEMAND_STAFF_ROTATION_RETENTION detection ─────────────────────────────

describe("W3: DEMAND_STAFF_ROTATION_RETENTION sub-mechanism detection", () => {
  it("detects via 'operative' keyword", () => {
    const input = baseInput(DiagnosisType.DEMAND_GENERATION_FAILURE, [
      "the operative assigned to each client changes frequently between sessions",
    ]);
    expect(detectSubMechanism(input, DiagnosisType.DEMAND_GENERATION_FAILURE)).toBe(
      "DEMAND_STAFF_ROTATION_RETENTION"
    );
  });

  it("detects via 'cleaning staff' keyword", () => {
    const input = baseInput(DiagnosisType.DEMAND_GENERATION_FAILURE, [
      "7 cleaning staff employed on rotating schedules",
    ]);
    expect(detectSubMechanism(input, DiagnosisType.DEMAND_GENERATION_FAILURE)).toBe(
      "DEMAND_STAFF_ROTATION_RETENTION"
    );
  });

  it("detects via 'client tenure' keyword", () => {
    const input = baseInput(DiagnosisType.DEMAND_GENERATION_FAILURE, [
      "average client tenure approximately 3 months; no exit feedback collected",
    ]);
    expect(detectSubMechanism(input, DiagnosisType.DEMAND_GENERATION_FAILURE)).toBe(
      "DEMAND_STAFF_ROTATION_RETENTION"
    );
  });

  it("does NOT fire DEMAND_STAFF_ROTATION when 'subscriber' present (subscriber takes priority)", () => {
    const input = baseInput(DiagnosisType.DEMAND_GENERATION_FAILURE, [
      "subscriber count flat; operative assigned to accounts changes",
    ]);
    expect(detectSubMechanism(input, DiagnosisType.DEMAND_GENERATION_FAILURE)).toBe(
      "DEMAND_STAGNATION_SUBSCRIBER_CHURN"
    );
  });
});

// ── 4. MARGIN_SUPPLIER_COST_BLENDED detection ────────────────────────────────

describe("W3: MARGIN_SUPPLIER_COST_BLENDED sub-mechanism detection", () => {
  it("detects via 'supplier' keyword", () => {
    const input = baseInput(DiagnosisType.MARGIN_EROSION, [
      "purchase prices paid to suppliers have increased but the owner cannot quantify the change by product",
    ]);
    expect(detectSubMechanism(input, DiagnosisType.MARGIN_EROSION)).toBe(
      "MARGIN_SUPPLIER_COST_BLENDED"
    );
  });

  it("detects via 'product categor' keyword", () => {
    const input = baseInput(DiagnosisType.MARGIN_EROSION, [
      "three product categories all reported as a single combined figure; no breakout available",
    ]);
    expect(detectSubMechanism(input, DiagnosisType.MARGIN_EROSION)).toBe(
      "MARGIN_SUPPLIER_COST_BLENDED"
    );
  });

  it("detects via 'single combined figure' keyword", () => {
    const input = baseInput(DiagnosisType.MARGIN_EROSION, [
      "costs reported as a single combined figure across all lines",
    ]);
    expect(detectSubMechanism(input, DiagnosisType.MARGIN_EROSION)).toBe(
      "MARGIN_SUPPLIER_COST_BLENDED"
    );
  });

  it("MARGIN_FOOD_COST_ABSORPTION takes priority over MARGIN_SUPPLIER_COST_BLENDED when 'ingredient' present", () => {
    const input = baseInput(DiagnosisType.MARGIN_EROSION, [
      "ingredient costs from suppliers have increased; menu not reviewed",
    ]);
    expect(detectSubMechanism(input, DiagnosisType.MARGIN_EROSION)).toBe(
      "MARGIN_FOOD_COST_ABSORPTION"
    );
  });
});

// ── 5. DEMAND_STAFF_ROTATION_RETENTION sentence vocabulary (SIM-04-002) ──────

describe("W3: DEMAND_STAFF_ROTATION_RETENTION sentence covers SIM-04-002 must_identify", () => {
  const input = baseInput(DiagnosisType.DEMAND_GENERATION_FAILURE, [
    "the operative assigned to each client changes frequently between sessions",
    "average client tenure approximately 3 months; no exit feedback collected from departing clients",
  ]);
  const sentence = buildSubMechanismSentence(input, "DEMAND_STAFF_ROTATION_RETENTION" as SubMechanism);

  it("covers 'roster rotation as driver of early departure'", () => {
    expect(containsPhrase(sentence, "roster rotation as driver of early departure")).toBe(true);
  });

  it("covers 'client tenure average of only three months'", () => {
    expect(containsPhrase(sentence, "client tenure average of only three months")).toBe(true);
  });

  it("covers 'pricing misattribution by owner'", () => {
    expect(containsPhrase(sentence, "pricing misattribution by owner")).toBe(true);
  });

  it("covers 'need to audit departure pattern against staff assignment'", () => {
    expect(containsPhrase(sentence, "need to audit departure pattern against staff assignment")).toBe(true);
  });

  it("mentions operative changes", () => {
    expect(sentence.toLowerCase()).toMatch(/operative|staff.*assign|assign.*staff/);
  });

  it("mentions early departure", () => {
    expect(sentence.toLowerCase()).toMatch(/early departure|departure/);
  });
});

// ── 6. MARGIN_SUPPLIER_COST_BLENDED sentence vocabulary (SIM-03-001) ─────────

describe("W3: MARGIN_SUPPLIER_COST_BLENDED sentence covers SIM-03-001 must_identify", () => {
  const input = baseInput(DiagnosisType.MARGIN_EROSION, [
    "purchase prices paid to suppliers have increased but the owner cannot quantify the change by product",
    "three product categories all reported as a single combined figure; no breakout by category available",
    "no price adjustments have been made to customers in over 18 months despite changing input costs",
  ]);
  const sentence = buildSubMechanismSentence(input, "MARGIN_SUPPLIER_COST_BLENDED" as SubMechanism);

  it("covers 'product-level profitability'", () => {
    expect(containsPhrase(sentence, "product-level profitability")).toBe(true);
  });

  it("covers 'supplier cost increases'", () => {
    expect(containsPhrase(sentence, "supplier cost increases")).toBe(true);
  });

  it("covers 'pricing review gap'", () => {
    expect(containsPhrase(sentence, "pricing review gap")).toBe(true);
  });

  it("covers 'blended reporting masking individual performance'", () => {
    expect(containsPhrase(sentence, "blended reporting masking individual performance")).toBe(true);
  });

  it("covers 'unrecovered cost increases'", () => {
    expect(containsPhrase(sentence, "unrecovered cost increases")).toBe(true);
  });
});

// ── 7. Safety guards: Wave 1 + Wave 2 sub-mechanisms unaffected ──────────────

describe("W3: Wave 1/2 sub-mechanism safety guards", () => {
  it("MARGIN_FOOD_COST_ABSORPTION still detects via 'café'", () => {
    const input = baseInput(DiagnosisType.MARGIN_EROSION, [
      "café ingredient costs have risen significantly",
    ]);
    expect(detectSubMechanism(input, DiagnosisType.MARGIN_EROSION)).toBe("MARGIN_FOOD_COST_ABSORPTION");
  });

  it("MARGIN_DISCOUNT_DEPENDENCY still detects via 'promotional'", () => {
    const input = baseInput(DiagnosisType.MARGIN_EROSION, [
      "promotional clearance events have become the primary sales driver",
    ]);
    expect(detectSubMechanism(input, DiagnosisType.MARGIN_EROSION)).toBe("MARGIN_DISCOUNT_DEPENDENCY");
  });

  it("GTM_TARGETING_SCOPE_MISMATCH still detects via 'matter type'", () => {
    const input = baseInput(DiagnosisType.GTM_CHANNEL_MISMATCH, [
      "out-of-scope enquiries consume intake capacity; matter type qualification rate is low",
    ]);
    expect(detectSubMechanism(input, DiagnosisType.GTM_CHANNEL_MISMATCH)).toBe("GTM_TARGETING_SCOPE_MISMATCH");
  });

  it("DEMAND_STAGNATION_SUBSCRIBER_CHURN still detects via 'subscriber'", () => {
    const input = baseInput(DiagnosisType.DEMAND_GENERATION_FAILURE, [
      "subscriber count flat for 12 months; only 12 new signups per month",
    ]);
    expect(detectSubMechanism(input, DiagnosisType.DEMAND_GENERATION_FAILURE)).toBe(
      "DEMAND_STAGNATION_SUBSCRIBER_CHURN"
    );
  });

  it("DEMAND_STAGNATION_MEMBER_CHURN still detects via 'member'", () => {
    const input = baseInput(DiagnosisType.DEMAND_GENERATION_FAILURE, [
      "flat total membership despite 18 new members joining each month",
    ]);
    expect(detectSubMechanism(input, DiagnosisType.DEMAND_GENERATION_FAILURE)).toBe(
      "DEMAND_STAGNATION_MEMBER_CHURN"
    );
  });
});
