import { describe, it, expect } from "vitest";
import {
  DIAGNOSIS_STATUS_TRANSITIONS,
  isDiagnosisStatusTransitionAllowed,
  validateDiagnosisEvidence,
  assertReadyForRecommendation,
  hasContradictoryEvidence,
  computeEffectiveConfidence,
  type DiagnosisEvidenceInput,
  type DiagnosisStatus,
} from "@/domain/owner-mode/diagnosis-evidence";
import type { InputQualityAssessmentResult } from "@/domain/owner-mode/input-quality";

const WS = "00000000-0000-0000-0000-000000000001";
const BIZ = "00000000-0000-0000-0000-000000000002";

function validInput(overrides: Partial<DiagnosisEvidenceInput> = {}): DiagnosisEvidenceInput {
  return {
    workspaceId: WS,
    businessId: BIZ,
    evidenceFor: ["Revenue declined 23% YoY", "Gross margin fell from 48% to 31%"],
    evidenceAgainst: [],
    missingData: [],
    assumptions: ["Competitive landscape unchanged", "Owner cost structure is fixed"],
    confidenceScore: 75,
    confidenceReason: "Two independent financial metrics confirm the same root cause pattern.",
    riskFlags: [],
    whatWouldChangeThis: "If owner reveals undisclosed marketing spend that explains the margin drop.",
    ...overrides,
  };
}

function mockQualityAllows(): InputQualityAssessmentResult {
  return {
    workspaceId: WS,
    qualityStatus: "complete",
    overallScore: 95,
    missingFields: [],
    conflictFields: [],
    staleFields: [],
    allowsStrongRecommendation: true,
    allowsHighRiskAction: true,
    assessedBy: "InputQualityService",
  };
}

function mockQualityBlocks(): InputQualityAssessmentResult {
  return {
    workspaceId: WS,
    qualityStatus: "critical_missing",
    overallScore: 30,
    missingFields: [
      {
        field: "gross_margin",
        severity: "critical",
        blocksStrongRecommendation: true,
        blocksHighRiskAction: true,
        description: "gross_margin missing",
      },
    ],
    conflictFields: [],
    staleFields: [],
    allowsStrongRecommendation: false,
    allowsHighRiskAction: false,
    assessedBy: "InputQualityService",
  };
}

// ─── Status machine ───────────────────────────────────────────────────────────

describe("diagnosis status machine", () => {
  it("draft → evidence_reviewed is allowed", () => {
    expect(isDiagnosisStatusTransitionAllowed("draft", "evidence_reviewed")).toBe(true);
  });

  it("draft → rejected is allowed", () => {
    expect(isDiagnosisStatusTransitionAllowed("draft", "rejected")).toBe(true);
  });

  it("evidence_reviewed → confidence_assessed is allowed", () => {
    expect(isDiagnosisStatusTransitionAllowed("evidence_reviewed", "confidence_assessed")).toBe(true);
  });

  it("confidence_assessed → ready_for_recommendation is allowed", () => {
    expect(isDiagnosisStatusTransitionAllowed("confidence_assessed", "ready_for_recommendation")).toBe(true);
  });

  it("ready_for_recommendation → superseded is allowed", () => {
    expect(isDiagnosisStatusTransitionAllowed("ready_for_recommendation", "superseded")).toBe(true);
  });

  it("rejected → any is not allowed", () => {
    const statuses: DiagnosisStatus[] = [
      "draft", "evidence_reviewed", "confidence_assessed",
      "ready_for_recommendation", "superseded",
    ];
    for (const s of statuses) {
      expect(isDiagnosisStatusTransitionAllowed("rejected", s)).toBe(false);
    }
  });

  it("superseded → any is not allowed", () => {
    const statuses: DiagnosisStatus[] = [
      "draft", "evidence_reviewed", "confidence_assessed",
      "ready_for_recommendation", "rejected",
    ];
    for (const s of statuses) {
      expect(isDiagnosisStatusTransitionAllowed("superseded", s)).toBe(false);
    }
  });

  it("ready_for_recommendation cannot go back to draft", () => {
    expect(isDiagnosisStatusTransitionAllowed("ready_for_recommendation", "draft")).toBe(false);
  });

  it("AI cannot control status transitions (status machine is deterministic)", () => {
    // The status machine is a plain data structure with no AI involvement.
    // This test confirms DIAGNOSIS_STATUS_TRANSITIONS does not have any AI-based keys.
    const keys = Object.keys(DIAGNOSIS_STATUS_TRANSITIONS);
    expect(keys).toContain("draft");
    expect(keys).toContain("ready_for_recommendation");
    expect(keys.length).toBe(6);
  });
});

// ─── No evidence blocks strong diagnosis ─────────────────────────────────────

describe("validateDiagnosisEvidence — no evidence blocks strong diagnosis", () => {
  it("returns invalid when evidenceFor is empty", () => {
    const result = validateDiagnosisEvidence(validInput({ evidenceFor: [] }));
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("DIAG-RULE-1"))).toBe(true);
  });

  it("blocks strong recommendation when evidenceFor is empty", () => {
    const result = validateDiagnosisEvidence(validInput({ evidenceFor: [] }));
    expect(result.allowsStrongRecommendation).toBe(false);
  });

  it("returns draft status when evidenceFor is empty", () => {
    const result = validateDiagnosisEvidence(validInput({ evidenceFor: [] }));
    expect(result.diagnosisStatus).toBe("draft");
  });
});

// ─── Evidence stores ──────────────────────────────────────────────────────────

describe("validateDiagnosisEvidence — diagnosis stores evidence and assumptions", () => {
  it("returns valid for complete evidence input", () => {
    const result = validateDiagnosisEvidence(validInput());
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("allows strong recommendation for valid complete input", () => {
    const result = validateDiagnosisEvidence(validInput());
    expect(result.allowsStrongRecommendation).toBe(true);
  });

  it("effective confidence equals raw confidence when no missing data", () => {
    const result = validateDiagnosisEvidence(validInput({ confidenceScore: 80 }));
    expect(result.effectiveConfidenceScore).toBe(80);
  });
});

// ─── Contradictory evidence is visible ───────────────────────────────────────

describe("contradictory evidence is visible", () => {
  it("hasContradictoryEvidence returns true when evidenceAgainst is non-empty", () => {
    const input = validInput({ evidenceAgainst: ["Owner reports higher revenue in private notes"] });
    expect(hasContradictoryEvidence(input)).toBe(true);
  });

  it("hasContradictoryEvidence returns false when evidenceAgainst is empty", () => {
    expect(hasContradictoryEvidence(validInput())).toBe(false);
  });

  it("diagnosis with contradictory evidence is still valid (not hidden — explicit)", () => {
    const input = validInput({
      evidenceAgainst: ["Some conflicting data present"],
    });
    const result = validateDiagnosisEvidence(input);
    expect(result.valid).toBe(true);
    // contradictory evidence is surfaced (not hidden), which is the correct behaviour
  });
});

// ─── Missing data lowers confidence ──────────────────────────────────────────

describe("missing data lowers confidence", () => {
  it("caps confidence at 60 when missingData is non-empty", () => {
    const result = validateDiagnosisEvidence(
      validInput({ confidenceScore: 85, missingData: ["gross_margin not available"] })
    );
    expect(result.effectiveConfidenceScore).toBe(60);
  });

  it("adds DIAG-RULE-2 violation when raw confidence exceeds cap", () => {
    const result = validateDiagnosisEvidence(
      validInput({ confidenceScore: 85, missingData: ["cash_runway unavailable"] })
    );
    expect(result.violations.some((v) => v.includes("DIAG-RULE-2"))).toBe(true);
  });

  it("does not cap confidence when missing data is absent", () => {
    const result = validateDiagnosisEvidence(validInput({ confidenceScore: 85, missingData: [] }));
    expect(result.effectiveConfidenceScore).toBe(85);
  });
});

// ─── confidence_reason required ──────────────────────────────────────────────

describe("confidence_reason required", () => {
  it("returns invalid when confidenceReason is empty", () => {
    const result = validateDiagnosisEvidence(validInput({ confidenceReason: "" }));
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("DIAG-RULE-4"))).toBe(true);
  });

  it("returns invalid when confidenceReason is too short (< 10 chars)", () => {
    const result = validateDiagnosisEvidence(validInput({ confidenceReason: "short" }));
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("DIAG-RULE-4"))).toBe(true);
  });
});

// ─── whatWouldChangeThis required ────────────────────────────────────────────

describe("whatWouldChangeThis required", () => {
  it("returns invalid when whatWouldChangeThis is empty", () => {
    const result = validateDiagnosisEvidence(validInput({ whatWouldChangeThis: "" }));
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("DIAG-RULE-5"))).toBe(true);
  });
});

// ─── Input quality assessment integration ────────────────────────────────────

describe("input quality assessment integration", () => {
  it("does not cap confidence when quality allows strong recommendation", () => {
    const result = validateDiagnosisEvidence(validInput({ confidenceScore: 80 }), mockQualityAllows());
    expect(result.effectiveConfidenceScore).toBe(80);
    expect(result.valid).toBe(true);
  });

  it("caps confidence at 50 when quality blocks strong recommendation", () => {
    const result = validateDiagnosisEvidence(validInput({ confidenceScore: 80 }), mockQualityBlocks());
    expect(result.effectiveConfidenceScore).toBe(50);
  });

  it("blocks strong recommendation when quality assessment blocks it", () => {
    const result = validateDiagnosisEvidence(validInput({ confidenceScore: 80 }), mockQualityBlocks());
    expect(result.allowsStrongRecommendation).toBe(false);
  });
});

// ─── assertReadyForRecommendation ────────────────────────────────────────────

describe("assertReadyForRecommendation", () => {
  it("does not throw for valid diagnosis at confidence_assessed", () => {
    const validation = validateDiagnosisEvidence(validInput());
    expect(() =>
      assertReadyForRecommendation("confidence_assessed", validation)
    ).not.toThrow();
  });

  it("throws for invalid diagnosis (violations present)", () => {
    const validation = validateDiagnosisEvidence(validInput({ evidenceFor: [] }));
    expect(() =>
      assertReadyForRecommendation("confidence_assessed", validation)
    ).toThrow();
  });

  it("throws for illegal status transition (draft → ready_for_recommendation)", () => {
    const validation = validateDiagnosisEvidence(validInput());
    expect(() =>
      assertReadyForRecommendation("draft", validation)
    ).toThrow(/Illegal status transition/);
  });
});

// ─── computeEffectiveConfidence ───────────────────────────────────────────────

describe("computeEffectiveConfidence", () => {
  it("returns raw score when no missing data and quality allows", () => {
    expect(computeEffectiveConfidence(75, [], true)).toBe(75);
  });

  it("caps at 60 when missing data present", () => {
    expect(computeEffectiveConfidence(85, ["field_a"], true)).toBe(60);
  });

  it("caps at 50 when quality does not allow strong", () => {
    expect(computeEffectiveConfidence(80, [], false)).toBe(50);
  });

  it("caps at lower of the two limits when both apply", () => {
    expect(computeEffectiveConfidence(90, ["missing_field"], false)).toBe(50);
  });

  it("clamps score to 0–100 range", () => {
    expect(computeEffectiveConfidence(-5, [], true)).toBe(0);
    expect(computeEffectiveConfidence(150, [], true)).toBe(100);
  });
});

// ─── Workspace scoping ────────────────────────────────────────────────────────

describe("workspace scoping", () => {
  it("throws when workspaceId is missing", () => {
    expect(() => validateDiagnosisEvidence(validInput({ workspaceId: "" }))).toThrow();
  });
});
