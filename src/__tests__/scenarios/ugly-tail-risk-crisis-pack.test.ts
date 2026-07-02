/**
 * UGLY / TAIL-RISK / CRISIS pack — schema + invariant tests (no DB). Proves the 150 counted scenarios are unique,
 * schema-valid, source-backed, privacy-clean, honestly distributed, and crisis-safe at the authoring layer: crisis
 * is block-dominant; every professional/legal/safety boundary is blocked; confirmed fraud/theft is blocked; no
 * missing-facts case proceeds; no high-risk/irreversible crisis move proceeds; proceed/cautious only on routine
 * reversible containment; no live claim; OpsIQ never autonomously handles a high-risk crisis.
 */
import { describe, it, expect } from "vitest";
import { UGLY_TAIL_RISK_CRISIS_PACK as PACK, UGLY_TAIL_RISK_CRISIS_SUBCATEGORIES } from "@/domain/scenarios/ugly-tail-risk-crisis-pack";
import { businessRealityScenarioSchema, HIGH_PROOF_RISK_STATES, HIGH_MANIPULATION_RISK_STATES } from "@/domain/scenarios/business-reality-scenario";
import { UGLY_TAIL_RISK_CRISIS_SOURCES, UGLY_TAIL_RISK_CRISIS_SOURCE_BY_ID } from "@/domain/scenarios/ugly-tail-risk-crisis-sources";
import { sourceRecordSchema, findPII } from "@/behavioral-validation/public-cases/source-register";

const proceedish = (st: string) => st === "proceed" || st === "cautious_proceed";

describe("Ugly/Tail-Risk/Crisis pack — count & identity", () => {
  it("has exactly 150 counted, unique scenarios", () => {
    expect(PACK.length).toBe(150);
    expect(new Set(PACK.map((s) => s.scenarioId)).size).toBe(150);
    expect(PACK.every((s) => s.scenarioPack === "UGLY_TAIL_RISK_CRISIS")).toBe(true);
    expect(PACK.every((s) => s.countedForReadiness && !s.synthetic && !s.liveDataBacked)).toBe(true);
  });

  it("covers 10 subcategories × 15 each", () => {
    for (const sub of UGLY_TAIL_RISK_CRISIS_SUBCATEGORIES) expect(PACK.filter((s) => s.category === sub).length, sub).toBe(15);
    expect(new Set(PACK.map((s) => s.category)).size).toBe(10);
  });

  it("is schema-valid for all 150", () => {
    for (const s of PACK) expect(businessRealityScenarioSchema.safeParse(s).success, s.scenarioId).toBe(true);
  });
});

describe("Ugly/Tail-Risk/Crisis pack — sources & gold", () => {
  it("every scenario is source-backed by a valid privacy-clean source", () => {
    for (const s of PACK) {
      expect(s.sourceRefs.length, s.scenarioId).toBeGreaterThan(0);
      for (const ref of s.sourceRefs) expect(UGLY_TAIL_RISK_CRISIS_SOURCE_BY_ID[ref], `${s.scenarioId}->${ref}`).toBeDefined();
    }
  });

  it("has 24 privacy-clean sources (schema-valid, low privacy risk, no PII)", () => {
    expect(UGLY_TAIL_RISK_CRISIS_SOURCES.length).toBe(24);
    for (const src of UGLY_TAIL_RISK_CRISIS_SOURCES) {
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

describe("Ugly/Tail-Risk/Crisis pack — distribution (within required ranges)", () => {
  const count = (f: (s: (typeof PACK)[number]) => string) =>
    PACK.reduce<Record<string, number>>((d, s) => ((d[f(s)] = (d[f(s)] ?? 0) + 1), d), {});
  it("hits the target action-status ranges with all five statuses", () => {
    const d = count((s) => s.expectedActionStatus);
    expect(d.proceed).toBeGreaterThanOrEqual(0); expect(d.proceed).toBeLessThanOrEqual(5);
    expect(d.cautious_proceed).toBeGreaterThanOrEqual(5); expect(d.cautious_proceed).toBeLessThanOrEqual(15);
    expect(d.need_more_data).toBeGreaterThanOrEqual(20); expect(d.need_more_data).toBeLessThanOrEqual(45);
    expect(d.owner_decision_required).toBeGreaterThanOrEqual(35); expect(d.owner_decision_required).toBeLessThanOrEqual(60);
    expect(d.blocked).toBeGreaterThanOrEqual(45); expect(d.blocked).toBeLessThanOrEqual(80);
    for (const k of ["proceed", "cautious_proceed", "need_more_data", "owner_decision_required", "blocked"]) expect(d[k], k).toBeGreaterThan(0);
  });
  it("is block-dominant: blocked is the largest bucket, owner the second", () => {
    const d = count((s) => s.expectedActionStatus);
    for (const st of ["proceed", "cautious_proceed", "need_more_data", "owner_decision_required"]) expect(d.blocked, st).toBeGreaterThanOrEqual(d[st]);
    for (const st of ["proceed", "cautious_proceed", "need_more_data"]) expect(d.owner_decision_required, st).toBeGreaterThanOrEqual(d[st]);
  });
});

describe("Ugly/Tail-Risk/Crisis pack — hard safety rules", () => {
  it("every professional/legal/safety boundary case is blocked and never proceeds", () => {
    for (const s of PACK.filter((x) => x.professionalReviewRequired)) {
      expect(s.expectedActionStatus, s.scenarioId).toBe("blocked");
      expect(proceedish(s.expectedActionStatus), s.scenarioId).toBe(false);
    }
    expect(PACK.filter((s) => s.professionalReviewRequired).length).toBeGreaterThan(0);
  });
  it("no missing-facts case proceeds", () => {
    expect(PACK.filter((s) => s.expectedInputQualityState === "critical_missing" && proceedish(s.expectedActionStatus)).length).toBe(0);
  });
  it("no high-risk/irreversible crisis move proceeds; proceed/cautious only on routine reversible containment", () => {
    for (const s of PACK.filter((x) => proceedish(x.expectedActionStatus))) {
      expect(s.highRisk, s.scenarioId).toBe(false);
      expect(s.professionalReviewRequired, s.scenarioId).toBe(false);
      expect(s.expectedInputQualityState, s.scenarioId).not.toBe("critical_missing");
      expect(HIGH_PROOF_RISK_STATES.has(s.expectedProofRiskState ?? "none"), s.scenarioId).toBe(false);
      expect(HIGH_MANIPULATION_RISK_STATES.has(s.expectedManipulationRiskState ?? "none"), s.scenarioId).toBe(false);
    }
  });
  it("confirmed fraud/theft is blocked with a confirmed manipulation pattern + high anti-gaming risk", () => {
    const fraud = PACK.filter((s) => s.expectedDominantConstraint === "proof_fraud_block");
    expect(fraud.length).toBeGreaterThan(0);
    for (const s of fraud) {
      expect(s.expectedActionStatus, s.scenarioId).toBe("blocked");
      expect(s.expectedManipulationRiskState, s.scenarioId).toBe("confirmed_pattern");
      expect(s.antiGamingRisk, s.scenarioId).toBe("high");
    }
  });
  it("carries a crisis-boundary note on every scenario and claims no live outcome", () => {
    expect(PACK.every((s) => s.liveOutcomeClaimAllowed === false)).toBe(true);
    expect(PACK.every((s) => /involve the relevant professionals|not final/i.test(s.sourceLimitations.join(" ")))).toBe(true);
    expect(PACK.every((s) => s.expectedDashboardFields.includes("crisisSeverity") && s.expectedMobileFields.includes("crisisSeverity"))).toBe(true);
  });
  it("carries a specific do-now, proof requirement, and reassessment on every scenario (no generic advice)", () => {
    for (const s of PACK) {
      expect(s.expectedDoNow.length, s.scenarioId).toBeGreaterThan(20);
      expect(s.expectedProofRequired.length, s.scenarioId).toBeGreaterThan(0);
      expect(s.expectedReassessment.length, s.scenarioId).toBeGreaterThan(0);
    }
  });
});
