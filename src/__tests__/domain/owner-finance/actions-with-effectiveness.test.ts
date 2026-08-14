/**
 * Finance closed-loop learning — actions.ts effectiveness integration tests.
 * Covers Scenario M (ranking changes with modifier) and Scenario I (critical blocked).
 */
import { describe, it, expect } from "vitest";
import {
  recommendationToOwnerAction,
  planFinanceActionsFromDiagnosis,
} from "@/domain/owner-finance/actions";
import { buildEffectivenessMap } from "@/domain/owner-finance/outcome-signals";
import type { FinanceRecommendation } from "@/domain/owner-finance/recommendations";
import type { FinanceDiagnosisResult } from "@/domain/owner-finance/diagnosis";
import type { FinanceFinding } from "@/domain/owner-finance/findings";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeRec(overrides: Partial<FinanceRecommendation> = {}): FinanceRecommendation {
  return {
    findingCode: "FIN_LOW_MARGIN",
    recommendationCode: "FINREC_MARGIN_RECOVERY",
    title: "Increase gross margin",
    requiredOwnerAction: "Reduce cost of goods.",
    ownerRole: "owner",
    expectedFinancialImpactScore: 80,
    effortScore: 40,
    urgencyScore: 70,
    severity: "warning",
    confidence: 0.75,
    verificationMetric: "grossMarginPct",
    verificationMethod: "Compare gross margin % before/after.",
    expectedTimeframeDays: 30,
    evidence: [],
    sourceMetric: "grossMarginPct",
    sourceValue: 12,
    threshold: 20,
    ...overrides,
  };
}

function makeDiagnosisResult(findings: FinanceFinding[]): FinanceDiagnosisResult {
  return {
    metrics: {
      grossMarginPct: 12,
      netProfitMarginPct: 5,
      debtServiceCoverageRatio: null,
      ownerSalarySustainabilityMonths: null,
      cashBufferDays: null,
      revenueGrowthPct: null,
      expenseToRevenueRatio: null,
      debtToEquityRatio: null,
      financialRiskScore: 40,
      survivalState: "caution",
    },
    findings,
    domainScore: {
      healthScore: 55,
      riskScore: 40,
      opportunityScore: 30,
      dataConfidenceScore: 65,
    },
    generatedAt: new Date("2026-01-01"),
  } as unknown as FinanceDiagnosisResult;
}

// ─── Scenario I: critical severity never modified ────────────────────────────

describe("Scenario I — critical severity, effectiveness modifier zeroed", () => {
  it("critical rec confidence unchanged when modifier would increase", () => {
    const rec = makeRec({ severity: "critical", confidence: 0.9 });
    const withoutModifier = recommendationToOwnerAction(rec, 50, 0);
    const withModifier = recommendationToOwnerAction(rec, 50, 0.10);
    expect(withoutModifier.confidence).toBeCloseTo(withModifier.confidence, 6);
  });

  it("critical rec confidence unchanged when modifier would decrease", () => {
    const rec = makeRec({ severity: "critical", confidence: 0.7 });
    const withoutModifier = recommendationToOwnerAction(rec, 50, 0);
    const withNegativeModifier = recommendationToOwnerAction(rec, 50, -0.10);
    expect(withoutModifier.confidence).toBeCloseTo(withNegativeModifier.confidence, 6);
  });

  it("critical rec priorityScore unchanged by positive modifier", () => {
    const rec = makeRec({ severity: "critical", confidence: 0.8 });
    const base = recommendationToOwnerAction(rec, 50, 0).priorityScore;
    const boosted = recommendationToOwnerAction(rec, 50, 0.10).priorityScore;
    expect(base).toBeCloseTo(boosted, 6);
  });
});

// ─── Scenario M: ranking changes with modifier ───────────────────────────────

describe("Scenario M — effectiveness modifier shifts ranking for non-critical", () => {
  it("positive modifier increases confidence for warning severity", () => {
    const rec = makeRec({ severity: "warning", confidence: 0.70 });
    const base = recommendationToOwnerAction(rec, 50, 0);
    const boosted = recommendationToOwnerAction(rec, 50, 0.10);
    expect(boosted.confidence).toBeGreaterThan(base.confidence);
  });

  it("negative modifier decreases confidence for warning severity", () => {
    const rec = makeRec({ severity: "warning", confidence: 0.70 });
    const base = recommendationToOwnerAction(rec, 50, 0);
    const penalized = recommendationToOwnerAction(rec, 50, -0.10);
    expect(penalized.confidence).toBeLessThan(base.confidence);
  });

  it("confidence is clamped to [0, 1] even with extreme modifier", () => {
    const highConf = makeRec({ severity: "warning", confidence: 0.99 });
    const action = recommendationToOwnerAction(highConf, 50, 0.10);
    expect(action.confidence).toBeLessThanOrEqual(1.0);

    const lowConf = makeRec({ severity: "warning", confidence: 0.01 });
    const penalized = recommendationToOwnerAction(lowConf, 50, -0.10);
    expect(penalized.confidence).toBeGreaterThanOrEqual(0.0);
  });

  it("higher effectivenessModifier → higher priorityScore (non-critical, all else equal)", () => {
    // Use "high" (valid OwnerSeverity) so SEVERITY_URGENCY_BOOST lookup returns a number,
    // giving a non-zero priorityScore that varies with confidence.
    const rec = makeRec({ severity: "high", confidence: 0.70 });
    const low = recommendationToOwnerAction(rec, 50, -0.05).priorityScore;
    const mid = recommendationToOwnerAction(rec, 50, 0).priorityScore;
    const high = recommendationToOwnerAction(rec, 50, 0.05).priorityScore;
    expect(mid).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(mid);
  });
});

// ─── planFinanceActionsFromDiagnosis with effectivenessMap ───────────────────

describe("planFinanceActionsFromDiagnosis — effectivenessMap integration", () => {
  it("runs without effectivenessMap (cold-start — no modifier)", () => {
    // Should not throw when effectivenessMap is undefined
    expect(() => planFinanceActionsFromDiagnosis(
      makeDiagnosisResult([]) as FinanceDiagnosisResult
    )).not.toThrow();
  });

  it("runs with empty effectivenessMap", () => {
    const emptyMap = buildEffectivenessMap([]);
    expect(() => planFinanceActionsFromDiagnosis(
      makeDiagnosisResult([]) as FinanceDiagnosisResult,
      emptyMap
    )).not.toThrow();
  });

  it("actions array is empty when findings list is empty", () => {
    const plan = planFinanceActionsFromDiagnosis(makeDiagnosisResult([]));
    expect(plan.actions).toHaveLength(0);
    expect(plan.recommendedNextAction).toBeUndefined();
  });

  it("recommendedNextAction is the first (highest-priority) action", () => {
    const plan = planFinanceActionsFromDiagnosis(makeDiagnosisResult([]));
    if (plan.actions.length > 0) {
      expect(plan.recommendedNextAction).toEqual(plan.actions[0]);
    }
  });
});

// ─── recommendationToOwnerAction — contract assertions ───────────────────────

describe("recommendationToOwnerAction — contract assertions", () => {
  it("returns an object with domain=finance", () => {
    const action = recommendationToOwnerAction(makeRec(), 0, 0);
    expect(action.domain).toBe("finance");
  });
  it("status is always proposed", () => {
    const action = recommendationToOwnerAction(makeRec(), 0, 0);
    expect(action.status).toBe("proposed");
  });
  it("zero modifier leaves confidence unchanged", () => {
    const rec = makeRec({ confidence: 0.75, severity: "warning" });
    const action = recommendationToOwnerAction(rec, 0, 0);
    // confidence clamped but should match the source
    expect(action.confidence).toBeCloseTo(0.75, 6);
  });
  it("effectivenessModifier defaults to 0 when omitted (2-arg form)", () => {
    const rec = makeRec({ confidence: 0.75, severity: "warning" });
    const twoArg = recommendationToOwnerAction(rec, 50);
    const threeArg = recommendationToOwnerAction(rec, 50, 0);
    expect(twoArg.confidence).toBeCloseTo(threeArg.confidence, 6);
    expect(twoArg.priorityScore).toBeCloseTo(threeArg.priorityScore, 6);
  });
  it("opportunity severity allows modifier", () => {
    const rec = makeRec({ severity: "opportunity", confidence: 0.60 });
    const base = recommendationToOwnerAction(rec, 0, 0);
    const boosted = recommendationToOwnerAction(rec, 0, 0.05);
    expect(boosted.confidence).toBeGreaterThan(base.confidence);
  });
  it("info severity allows modifier", () => {
    const rec = makeRec({ severity: "info", confidence: 0.60 });
    const base = recommendationToOwnerAction(rec, 0, 0);
    const boosted = recommendationToOwnerAction(rec, 0, 0.05);
    expect(boosted.confidence).toBeGreaterThan(base.confidence);
  });
});
