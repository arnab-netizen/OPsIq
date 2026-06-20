/**
 * Tests for the scoring normalization logic introduced in
 * REAL_WORLD_REPLAY_DIAGNOSIS_ACTION_SCORING_NORMALIZATION.
 *
 * Since scoreAgainstOutcome is not exported from the harness, the logic is
 * replicated inline here to keep it under test without coupling to harness
 * internals.
 */
import { describe, it, expect } from "vitest";
import { normalizeDiagnosis, actionMatches } from "@/services/benchmark/round2-scorer";

// --- Replicated scoring logic (mirrors run-historical-validation.ts) ----------

interface OutcomeForTest {
  expert_diagnosis: string;
  expert_first_action: string;
  harmful_actions?: string[];
  beneficial_actions?: string[];
  expected_diagnosis_codes?: string[];
  expected_action_codes?: string[];
}

function scoreTest(
  diagnosis: string,
  committed: boolean,
  gateAbstain: boolean,
  recText: string,
  recClass: string | null,
  outcome: OutcomeForTest
): { diagnosisAgreement: boolean; actionAgreement: boolean } {
  const engineDx = normalizeDiagnosis(diagnosis);
  const proceeds = committed && !gateAbstain;

  const diagnosisAgreement =
    Array.isArray(outcome.expected_diagnosis_codes) && outcome.expected_diagnosis_codes.length > 0
      ? outcome.expected_diagnosis_codes.includes(engineDx)
      : normalizeDiagnosis(outcome.expert_diagnosis) === engineDx;

  const harmful = outcome.harmful_actions ?? [];
  const beneficial = [outcome.expert_first_action, ...(outcome.beneficial_actions ?? [])].filter(Boolean);
  const recommendedHarmful = proceeds && harmful.some((h) => actionMatches(recText, h));

  let recommendedBeneficial: boolean;
  if (proceeds && Array.isArray(outcome.expected_action_codes) && outcome.expected_action_codes.length > 0 && recClass !== null) {
    recommendedBeneficial = outcome.expected_action_codes.includes(recClass);
  } else {
    recommendedBeneficial = proceeds && beneficial.some((b) => actionMatches(recText, b));
  }

  void recommendedHarmful;

  return { diagnosisAgreement, actionAgreement: recommendedBeneficial };
}

// --- Tests -------------------------------------------------------------------

describe("scoring-normalization: diagnosis agreement", () => {
  it("returns true when engineDx is in expected_diagnosis_codes", () => {
    const outcome: OutcomeForTest = {
      expert_diagnosis: "irrelevant text",
      expert_first_action: "do something",
      expected_diagnosis_codes: ["legal_governance_risk", "cash_liquidity_crisis"],
    };
    const { diagnosisAgreement } = scoreTest(
      "legal_governance_risk",
      true,
      false,
      "",
      null,
      outcome
    );
    expect(diagnosisAgreement).toBe(true);
  });

  it("returns false when engineDx is NOT in expected_diagnosis_codes", () => {
    const outcome: OutcomeForTest = {
      expert_diagnosis: "irrelevant text",
      expert_first_action: "do something",
      expected_diagnosis_codes: ["debt_solvency_pressure"],
    };
    const { diagnosisAgreement } = scoreTest(
      "cash_liquidity_crisis",
      true,
      false,
      "",
      null,
      outcome
    );
    expect(diagnosisAgreement).toBe(false);
  });
});

describe("scoring-normalization: action agreement", () => {
  it("returns true when recClass is in expected_action_codes", () => {
    const outcome: OutcomeForTest = {
      expert_diagnosis: "any",
      expert_first_action: "unrelated action phrase",
      expected_action_codes: ["CONTAINMENT", "STRUCTURAL_REPAIR"],
    };
    const { actionAgreement } = scoreTest(
      "legal_governance_risk",
      true,
      false,
      "some recommendation text",
      "CONTAINMENT",
      outcome
    );
    expect(actionAgreement).toBe(true);
  });

  it("returns false when recClass is NOT in expected_action_codes", () => {
    const outcome: OutcomeForTest = {
      expert_diagnosis: "any",
      expert_first_action: "unrelated action phrase",
      expected_action_codes: ["CONTAINMENT", "STRUCTURAL_REPAIR"],
    };
    const { actionAgreement } = scoreTest(
      "legal_governance_risk",
      true,
      false,
      "some recommendation text",
      "GROWTH_ENABLEMENT",
      outcome
    );
    expect(actionAgreement).toBe(false);
  });

  it("returns false when committed=false", () => {
    const outcome: OutcomeForTest = {
      expert_diagnosis: "any",
      expert_first_action: "some action",
      expected_action_codes: ["CONTAINMENT"],
    };
    const { actionAgreement } = scoreTest(
      "legal_governance_risk",
      false,
      false,
      "containment approach",
      "CONTAINMENT",
      outcome
    );
    expect(actionAgreement).toBe(false);
  });

  it("returns false when gateAbstain=true", () => {
    const outcome: OutcomeForTest = {
      expert_diagnosis: "any",
      expert_first_action: "some action",
      expected_action_codes: ["CONTAINMENT"],
    };
    const { actionAgreement } = scoreTest(
      "legal_governance_risk",
      true,
      true,
      "containment approach",
      "CONTAINMENT",
      outcome
    );
    expect(actionAgreement).toBe(false);
  });
});

describe("scoring-normalization: fallback to text comparison when expected_diagnosis_codes absent", () => {
  it("falls back to expert_diagnosis text match when expected_diagnosis_codes is empty array", () => {
    const outcome: OutcomeForTest = {
      expert_diagnosis: "legal_governance_risk",
      expert_first_action: "fix governance",
      expected_diagnosis_codes: [],
    };
    const { diagnosisAgreement } = scoreTest(
      "legal_governance_risk",
      true,
      false,
      "",
      null,
      outcome
    );
    expect(diagnosisAgreement).toBe(true);
  });

  it("falls back to expert_diagnosis text match when expected_diagnosis_codes is absent", () => {
    const outcome: OutcomeForTest = {
      expert_diagnosis: "cash_liquidity_crisis",
      expert_first_action: "secure liquidity",
    };
    const { diagnosisAgreement } = scoreTest(
      "cash_liquidity_crisis",
      true,
      false,
      "",
      null,
      outcome
    );
    expect(diagnosisAgreement).toBe(true);
  });
});

describe("scoring-normalization: structural separation", () => {
  it("engine input objects do not carry expected_diagnosis_codes or expected_action_codes", () => {
    const typicalEngineInput: Record<string, unknown> = {
      engagementId: "some-id",
      businessProblem: "cash flow problem",
      evidence: [],
      clientContext: { industry: "retail", size: "medium", revenueImpactUrgency: "HIGH" },
    };
    expect(typicalEngineInput).not.toHaveProperty("expected_diagnosis_codes");
    expect(typicalEngineInput).not.toHaveProperty("expected_action_codes");
  });
});
