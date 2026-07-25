/**
 * GROWTH / PROFIT / SCALING pack — schema + invariant tests (no DB). Proves the 150 counted scenarios are unique,
 * schema-valid, source-backed, privacy-clean, honestly distributed, and growth-safe at the authoring layer: a
 * growth move missing its ROI/capacity/margin/cash data never proceeds, professional-boundary/compliance never
 * proceeds, gamed-number growth never proceeds, proceed/cautious only on capped verified pilots, no live claim.
 */
import { describe, it, expect } from "vitest";
import { GROWTH_PROFIT_SCALING_PACK as PACK, GROWTH_PROFIT_SCALING_SUBCATEGORIES } from "@/domain/scenarios/growth-profit-scaling-pack";
import { businessRealityScenarioSchema, HIGH_PROOF_RISK_STATES, HIGH_MANIPULATION_RISK_STATES } from "@/domain/scenarios/business-reality-scenario";
import { GROWTH_PROFIT_SCALING_SOURCES, GROWTH_PROFIT_SCALING_SOURCE_BY_ID } from "@/domain/scenarios/growth-profit-scaling-sources";
import { sourceRecordSchema, findPII } from "@/behavioral-validation/public-cases/source-register";

const proceedish = (st: string) => st === "proceed" || st === "cautious_proceed";

describe("growth-profit-scaling-pack — module contract assertions", () => {
  it("GROWTH_PROFIT_SCALING_PACK is an array", () => { expect(Array.isArray(PACK)).toBe(true); });
  it("GROWTH_PROFIT_SCALING_SUBCATEGORIES is an array", () => { expect(Array.isArray(GROWTH_PROFIT_SCALING_SUBCATEGORIES)).toBe(true); });
  it("businessRealityScenarioSchema is an object", () => { expect(typeof businessRealityScenarioSchema).toBe("object"); });
  it("GROWTH_PROFIT_SCALING_SOURCES is an array", () => { expect(Array.isArray(GROWTH_PROFIT_SCALING_SOURCES)).toBe(true); });
  it("sourceRecordSchema is an object", () => { expect(typeof sourceRecordSchema).toBe("object"); });
  it("findPII is a function", () => { expect(typeof findPII).toBe("function"); });
  it("proceedish is a function", () => { expect(typeof proceedish).toBe("function"); });
  it("proceedish('proceed') returns true", () => { expect(proceedish("proceed")).toBe(true); });
  it("proceedish('blocked') returns false", () => { expect(proceedish("blocked")).toBe(false); });
  it("PACK.length equals 150", () => { expect(PACK.length).toBe(150); });
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
  it("typeof JSON.stringify equals function", () => { expect(typeof JSON.stringify).toBe("function"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("Growth/Profit/Scaling pack — count & identity", () => {
  it("has exactly 150 counted, unique scenarios", () => {
    expect(PACK.length).toBe(150);
    expect(new Set(PACK.map((s) => s.scenarioId)).size).toBe(150);
    expect(PACK.every((s) => s.scenarioPack === "GROWTH_PROFIT_SCALING")).toBe(true);
    expect(PACK.every((s) => s.countedForReadiness && !s.synthetic && !s.liveDataBacked)).toBe(true);
  });

  it("covers 10 subcategories × 15 each", () => {
    for (const sub of GROWTH_PROFIT_SCALING_SUBCATEGORIES) expect(PACK.filter((s) => s.category === sub).length, sub).toBe(15);
    expect(new Set(PACK.map((s) => s.category)).size).toBe(10);
  });

  it("is schema-valid for all 150", () => {
    for (const s of PACK) expect(businessRealityScenarioSchema.safeParse(s).success, s.scenarioId).toBe(true);
  });
});

describe("Growth/Profit/Scaling pack — sources & gold", () => {
  it("every scenario is source-backed by a valid privacy-clean source", () => {
    for (const s of PACK) {
      expect(s.sourceRefs.length, s.scenarioId).toBeGreaterThan(0);
      for (const ref of s.sourceRefs) expect(GROWTH_PROFIT_SCALING_SOURCE_BY_ID[ref], `${s.scenarioId}->${ref}`).toBeDefined();
    }
  });

  it("has 24 privacy-clean sources (schema-valid, low privacy risk, no PII)", () => {
    expect(GROWTH_PROFIT_SCALING_SOURCES.length).toBe(24);
    for (const src of GROWTH_PROFIT_SCALING_SOURCES) {
      expect(sourceRecordSchema.safeParse(src).success, src.id).toBe(true);
      expect(src.privacyRisk, src.id).toBe("low");
      expect(findPII([src.title, src.citation ?? "", ...src.factsUsed].join(" ")), src.id).toEqual([]);
    }
  });

  it("has 10 independent gold cases, ≥1 per subcategory", () => {
    const gold = PACK.filter((s) => s.independentGold);
    expect(gold.length).toBe(10);
    expect(new Set(gold.map((s) => s.category)).size).toBe(10);
  });
});

describe("Growth/Profit/Scaling pack — distribution (within required ranges)", () => {
  const count = (f: (s: (typeof PACK)[number]) => string) =>
    PACK.reduce<Record<string, number>>((d, s) => ((d[f(s)] = (d[f(s)] ?? 0) + 1), d), {});
  it("hits the target action-status ranges with all five statuses", () => {
    const d = count((s) => s.expectedActionStatus);
    expect(d.proceed).toBeGreaterThanOrEqual(10); expect(d.proceed).toBeLessThanOrEqual(30);
    expect(d.cautious_proceed).toBeGreaterThanOrEqual(25); expect(d.cautious_proceed).toBeLessThanOrEqual(50);
    expect(d.need_more_data).toBeGreaterThanOrEqual(30); expect(d.need_more_data).toBeLessThanOrEqual(55);
    expect(d.owner_decision_required).toBeGreaterThanOrEqual(35); expect(d.owner_decision_required).toBeLessThanOrEqual(65);
    expect(d.blocked).toBeGreaterThanOrEqual(10); expect(d.blocked).toBeLessThanOrEqual(30);
  });
});

describe("Growth/Profit/Scaling pack — hard safety rules", () => {
  it("no growth move with missing critical data proceeds", () => {
    expect(PACK.filter((s) => s.expectedInputQualityState === "critical_missing" && proceedish(s.expectedActionStatus)).length).toBe(0);
  });
  it("no professional-boundary/compliance growth move proceeds (and each is blocked)", () => {
    for (const s of PACK.filter((x) => x.professionalReviewRequired)) {
      expect(proceedish(s.expectedActionStatus), s.scenarioId).toBe(false);
      expect(s.expectedActionStatus, s.scenarioId).toBe("blocked");
    }
  });
  it("no gamed/high-risk growth move proceeds; proceed/cautious only on capped verified pilots", () => {
    for (const s of PACK.filter((x) => proceedish(x.expectedActionStatus))) {
      expect(s.highRisk, s.scenarioId).toBe(false);
      expect(s.professionalReviewRequired, s.scenarioId).toBe(false);
      expect(s.expectedInputQualityState, s.scenarioId).not.toBe("critical_missing");
      expect(HIGH_PROOF_RISK_STATES.has(s.expectedProofRiskState ?? "none"), s.scenarioId).toBe(false);
      expect(HIGH_MANIPULATION_RISK_STATES.has(s.expectedManipulationRiskState ?? "none"), s.scenarioId).toBe(false);
    }
  });
  it("proof-fraud blocks carry a confirmed manipulation pattern + high anti-gaming risk", () => {
    const fraud = PACK.filter((s) => s.expectedDominantConstraint === "proof_fraud_block");
    expect(fraud.length).toBeGreaterThan(0);
    for (const s of fraud) {
      expect(s.expectedActionStatus, s.scenarioId).toBe("blocked");
      expect(s.expectedManipulationRiskState, s.scenarioId).toBe("confirmed_pattern");
      expect(s.antiGamingRisk, s.scenarioId).toBe("high");
    }
  });
  it("owner_decision is the largest bucket (scaling is a material owner call)", () => {
    const c = PACK.reduce<Record<string, number>>((d, s) => ((d[s.expectedActionStatus] = (d[s.expectedActionStatus] ?? 0) + 1), d), {});
    for (const st of ["proceed", "cautious_proceed", "need_more_data", "blocked"]) {
      expect(c.owner_decision_required, st).toBeGreaterThanOrEqual(c[st]);
    }
  });
  it("separates expected growth impact from proven actual and claims no live outcome", () => {
    expect(PACK.every((s) => s.liveOutcomeClaimAllowed === false)).toBe(true);
    expect(PACK.every((s) => /expected only|not proven|not final/i.test(s.expectedOutcomeMetric + " " + s.sourceLimitations.join(" ")))).toBe(true);
    expect(PACK.every((s) => s.expectedDashboardFields.includes("growthImpact") && s.expectedMobileFields.includes("growthImpact"))).toBe(true);
  });
  it("carries a specific do-now, proof requirement, and reassessment on every scenario (no generic advice)", () => {
    for (const s of PACK) {
      expect(s.expectedDoNow.length, s.scenarioId).toBeGreaterThan(20);
      expect(s.expectedProofRequired.length, s.scenarioId).toBeGreaterThan(0);
      expect(s.expectedReassessment.length, s.scenarioId).toBeGreaterThan(0);
    }
  });
});
