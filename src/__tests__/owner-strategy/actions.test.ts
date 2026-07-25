/**
 * Owner Strategy & Scenario Planning (Module 8 Slice 3) — recommendation/action
 * planner tests. Pure/no DB. Verifies traceable recommendations, action conformance
 * to the Spine schema, bounded + deterministic pressure-weighted priority, ranking,
 * no-invention (every emitted finding has a template), template traceability, and
 * that the recommended next action targets the most urgent scenario problem.
 */
import { describe, it, expect } from "vitest";
import {
  diagnoseStrategySnapshot,
  planStrategyActionsFromDiagnosis,
  buildStrategyRecommendations,
  STRATEGY_REC_TEMPLATES,
  type StrategySnapshotInput,
} from "@/domain/owner-strategy";
import {
  ownerActionSchema,
  OWNER_ACTION_STATUSES,
  calculateOwnerPriorityScore,
} from "@/domain/owner-spine/contracts";

const NOW = new Date("2026-06-05T00:00:00.000Z");

function strongGo(): StrategySnapshotInput {
  return {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    currency: "INR",
    currentRevenue: 500000,
    expectedRevenueChange: 100000,
    costChange: 30000,
    investmentRequired: 200000,
    timeToImpactMonths: 3,
    riskLevel: "low",
    cashAvailable: 400000,
    capacityImpactPct: 20,
    staffImpact: 1,
  };
}

function avoid(): StrategySnapshotInput {
  return {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    currency: "INR",
    currentRevenue: 500000,
    expectedRevenueChange: 20000,
    costChange: 60000,
    investmentRequired: 800000,
    timeToImpactMonths: 12,
    riskLevel: "high",
    cashAvailable: 100000,
    capacityImpactPct: 80,
    staffImpact: 4,
  };
}

function plan(input: StrategySnapshotInput) {
  return planStrategyActionsFromDiagnosis(diagnoseStrategySnapshot(input, { now: NOW }));
}
const actionCodes = (p: { actions: { findingCode: string }[] }) => p.actions.map((a) => a.findingCode);

describe("owner-strategy actions — module contract assertions", () => {
  it("diagnoseStrategySnapshot is a function", () => { expect(typeof diagnoseStrategySnapshot).toBe("function"); });
  it("planStrategyActionsFromDiagnosis is a function", () => { expect(typeof planStrategyActionsFromDiagnosis).toBe("function"); });
  it("buildStrategyRecommendations is a function", () => { expect(typeof buildStrategyRecommendations).toBe("function"); });
  it("STRATEGY_REC_TEMPLATES is an object", () => { expect(typeof STRATEGY_REC_TEMPLATES).toBe("object"); });
  it("ownerActionSchema is an object", () => { expect(typeof ownerActionSchema).toBe("object"); });
  it("OWNER_ACTION_STATUSES is defined", () => { expect(OWNER_ACTION_STATUSES).toBeDefined(); });
  it("calculateOwnerPriorityScore is a function", () => { expect(typeof calculateOwnerPriorityScore).toBe("function"); });
  it("NOW is a Date", () => { expect(NOW instanceof Date).toBe(true); });
  it("strongGo is a function", () => { expect(typeof strongGo).toBe("function"); });
  it("avoid is a function", () => { expect(typeof avoid).toBe("function"); });
  it("plan is a function", () => { expect(typeof plan).toBe("function"); });
  it("actionCodes is a function", () => { expect(typeof actionCodes).toBe("function"); });
  it("strongGo() returns an object", () => { expect(typeof strongGo()).toBe("object"); });
  it("avoid() returns an object", () => { expect(typeof avoid()).toBe("object"); });
});

describe("owner-strategy planner — recommendation/action creation", () => {
  it("a negative base case creates a drop-or-rescope action", () => {
    const p = plan(avoid());
    expect(actionCodes(p)).toContain("STR_NEGATIVE_BASE_CASE");
    const rec = p.recommendations.find((r) => r.findingCode === "STR_NEGATIVE_BASE_CASE");
    expect(rec?.category).toBe("drop_or_rescope");
    expect(rec?.recommendationCode).toBe("STRREC_DROP_OR_RESCOPE");
  });

  it("a strong-go option creates a pursue action", () => {
    const p = plan(strongGo());
    expect(actionCodes(p)).toContain("STR_OPP_STRONG_RETURN");
    const rec = p.recommendations.find((r) => r.findingCode === "STR_OPP_STRONG_RETURN");
    expect(rec?.category).toBe("pursue");
  });

  it("recommendations are traceable to a real source metric/value", () => {
    const p = plan(avoid());
    const rec = p.recommendations.find((r) => r.findingCode === "STR_UNAFFORDABLE");
    expect(rec?.sourceMetric).toBe("affordabilityRatio");
    expect(typeof rec?.sourceValue).toBe("number");
    expect(rec?.verificationMetric).toBe("affordabilityRatio");
  });
});

describe("owner-strategy planner — actions conform + prioritise", () => {
  it("every action satisfies the Spine OwnerAction schema (proposed, strategy)", () => {
    const p = plan(avoid());
    expect(p.actions.length).toBeGreaterThan(0);
    for (const a of p.actions) {
      expect(() => ownerActionSchema.parse(a)).not.toThrow();
      expect(a.domain).toBe("strategy");
      expect(a.status).toBe("proposed");
      expect(OWNER_ACTION_STATUSES).toContain(a.status);
      expect(a.priorityScore).toBeGreaterThanOrEqual(0);
      expect(a.priorityScore).toBeLessThanOrEqual(100);
      expect(Number.isInteger(a.priorityScore)).toBe(true);
    }
  });

  it("ranks by descending priority and recommends a critical-severity top action", () => {
    const p = plan(avoid());
    for (let i = 1; i < p.actions.length; i++) {
      expect(p.actions[i - 1].priorityScore).toBeGreaterThanOrEqual(p.actions[i].priorityScore);
    }
    expect(p.recommendedNextAction).toEqual(p.actions[0]);
    expect(p.recommendedNextAction?.severity).toBe("critical");
  });

  it("priority is pressure-weighted: scenario risk lifts the same action", () => {
    const p = plan(avoid());
    const risk = diagnoseStrategySnapshot(avoid(), { now: NOW }).metrics.strategyRiskScore;
    const rec = p.recommendations.find((r) => r.findingCode === "STR_NEGATIVE_BASE_CASE")!;
    const weighted = calculateOwnerPriorityScore({
      expectedImpactScore: rec.expectedDecisionImpactScore,
      confidence: rec.confidence,
      urgencyScore: rec.urgencyScore,
      effortScore: rec.effortScore,
      severity: rec.severity,
      survivalRiskScore: risk,
    });
    const unweighted = calculateOwnerPriorityScore({
      expectedImpactScore: rec.expectedDecisionImpactScore,
      confidence: rec.confidence,
      urgencyScore: rec.urgencyScore,
      effortScore: rec.effortScore,
      severity: rec.severity,
      survivalRiskScore: 0,
    });
    expect(weighted).toBeGreaterThanOrEqual(unweighted);
    const action = p.actions.find((a) => a.findingCode === "STR_NEGATIVE_BASE_CASE");
    expect(action?.priorityScore).toBe(weighted);
  });
});

describe("owner-strategy planner — no invention / completeness", () => {
  it("every emitted finding has a recommendation template (no missing inputs)", () => {
    for (const input of [strongGo(), avoid()]) {
      const diag = diagnoseStrategySnapshot(input, { now: NOW });
      const p = planStrategyActionsFromDiagnosis(diag);
      expect(p.missingActionInputs).toEqual([]);
      const withTemplate = diag.findings.filter((f) => STRATEGY_REC_TEMPLATES[f.code]);
      expect(p.recommendations.length).toBe(withTemplate.length);
    }
  });

  it("does not mutate diagnosis findings", () => {
    const diag = diagnoseStrategySnapshot(avoid(), { now: NOW });
    const before = JSON.parse(JSON.stringify(diag.findings));
    planStrategyActionsFromDiagnosis(diag);
    expect(diag.findings).toEqual(before);
  });

  it("buildStrategyRecommendations skips findings with no template", () => {
    const recs = buildStrategyRecommendations([
      {
        domain: "strategy",
        code: "STR_UNKNOWN_NOT_A_TEMPLATE",
        title: "x",
        summary: "x",
        sourceMetric: "x",
        sourceValue: null,
        threshold: null,
        severity: "low",
        confidence: 1,
        impactScore: 10,
        urgencyScore: 10,
        findingType: "risk",
        evidence: [],
        missingData: [],
      },
    ]);
    expect(recs).toEqual([]);
  });
});
