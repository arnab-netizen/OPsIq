/**
 * LOCAL / LEGAL / PROFESSIONAL-BOUNDARY pack — schema + invariant tests (no DB). Proves the 100 counted scenarios
 * are unique, schema-valid, source-backed, privacy-clean, honestly distributed, and boundary-safe at the authoring
 * layer: every professional/legal boundary is blocked and never proceeds; no missing-records case proceeds; no
 * fabricated-document case proceeds; proceed/cautious only on already-professional-prepared routine in-policy
 * filings; every scenario carries a "not final advice — consult a professional" note; no live claim.
 */
import { describe, it, expect } from "vitest";
import { LOCAL_LEGAL_BOUNDARY_PACK as PACK, LOCAL_LEGAL_BOUNDARY_SUBCATEGORIES } from "@/domain/scenarios/local-legal-professional-boundary-pack";
import { businessRealityScenarioSchema, HIGH_PROOF_RISK_STATES, HIGH_MANIPULATION_RISK_STATES } from "@/domain/scenarios/business-reality-scenario";
import { LOCAL_LEGAL_BOUNDARY_SOURCES, LOCAL_LEGAL_BOUNDARY_SOURCE_BY_ID } from "@/domain/scenarios/local-legal-professional-boundary-sources";
import { sourceRecordSchema, findPII } from "@/behavioral-validation/public-cases/source-register";

const proceedish = (st: string) => st === "proceed" || st === "cautious_proceed";

describe("Local/Legal/Boundary pack — count & identity", () => {
  it("has exactly 100 counted, unique scenarios", () => {
    expect(PACK.length).toBe(100);
    expect(new Set(PACK.map((s) => s.scenarioId)).size).toBe(100);
    expect(PACK.every((s) => s.scenarioPack === "LOCAL_LEGAL_PROFESSIONAL_BOUNDARY")).toBe(true);
    expect(PACK.every((s) => s.countedForReadiness && !s.synthetic && !s.liveDataBacked)).toBe(true);
  });

  it("covers 10 subcategories × 10 each", () => {
    for (const sub of LOCAL_LEGAL_BOUNDARY_SUBCATEGORIES) expect(PACK.filter((s) => s.category === sub).length, sub).toBe(10);
    expect(new Set(PACK.map((s) => s.category)).size).toBe(10);
  });

  it("is schema-valid for all 100", () => {
    for (const s of PACK) expect(businessRealityScenarioSchema.safeParse(s).success, s.scenarioId).toBe(true);
  });
});

describe("Local/Legal/Boundary pack — sources & gold", () => {
  it("every scenario is source-backed by a valid privacy-clean source", () => {
    for (const s of PACK) {
      expect(s.sourceRefs.length, s.scenarioId).toBeGreaterThan(0);
      for (const ref of s.sourceRefs) expect(LOCAL_LEGAL_BOUNDARY_SOURCE_BY_ID[ref], `${s.scenarioId}->${ref}`).toBeDefined();
    }
  });

  it("has 24 privacy-clean sources (schema-valid, low privacy risk, no PII)", () => {
    expect(LOCAL_LEGAL_BOUNDARY_SOURCES.length).toBe(24);
    for (const src of LOCAL_LEGAL_BOUNDARY_SOURCES) {
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

describe("Local/Legal/Boundary pack — distribution (within required ranges)", () => {
  const count = (f: (s: (typeof PACK)[number]) => string) =>
    PACK.reduce<Record<string, number>>((d, s) => ((d[f(s)] = (d[f(s)] ?? 0) + 1), d), {});
  it("hits the target action-status ranges with all five statuses", () => {
    const d = count((s) => s.expectedActionStatus);
    expect(d.proceed).toBeGreaterThanOrEqual(0); expect(d.proceed).toBeLessThanOrEqual(5);
    expect(d.cautious_proceed).toBeGreaterThanOrEqual(5); expect(d.cautious_proceed).toBeLessThanOrEqual(15);
    expect(d.need_more_data).toBeGreaterThanOrEqual(20); expect(d.need_more_data).toBeLessThanOrEqual(40);
    expect(d.owner_decision_required).toBeGreaterThanOrEqual(25); expect(d.owner_decision_required).toBeLessThanOrEqual(45);
    expect(d.blocked).toBeGreaterThanOrEqual(25); expect(d.blocked).toBeLessThanOrEqual(45);
    for (const k of ["proceed", "cautious_proceed", "need_more_data", "owner_decision_required", "blocked"]) expect(d[k], k).toBeGreaterThan(0);
  });
});

describe("Local/Legal/Boundary pack — hard safety rules", () => {
  it("every professional-boundary case is blocked and never proceeds", () => {
    for (const s of PACK.filter((x) => x.professionalReviewRequired)) {
      expect(s.expectedActionStatus, s.scenarioId).toBe("blocked");
      expect(proceedish(s.expectedActionStatus), s.scenarioId).toBe(false);
    }
    expect(PACK.filter((s) => s.professionalReviewRequired).length).toBeGreaterThan(0);
  });
  it("no missing-records case proceeds", () => {
    expect(PACK.filter((s) => s.expectedInputQualityState === "critical_missing" && proceedish(s.expectedActionStatus)).length).toBe(0);
  });
  it("no fabricated-document / high-risk case proceeds; proceed/cautious only on professional-prepared routine items", () => {
    for (const s of PACK.filter((x) => proceedish(x.expectedActionStatus))) {
      expect(s.highRisk, s.scenarioId).toBe(false);
      expect(s.professionalReviewRequired, s.scenarioId).toBe(false);
      expect(s.expectedInputQualityState, s.scenarioId).not.toBe("critical_missing");
      expect(HIGH_PROOF_RISK_STATES.has(s.expectedProofRiskState ?? "none"), s.scenarioId).toBe(false);
      expect(HIGH_MANIPULATION_RISK_STATES.has(s.expectedManipulationRiskState ?? "none"), s.scenarioId).toBe(false);
    }
  });
  it("fabricated-document blocks (tax/books) carry a confirmed manipulation pattern + high anti-gaming risk", () => {
    const fraud = PACK.filter((s) => s.expectedDominantConstraint === "proof_fraud_block");
    expect(fraud.length).toBeGreaterThan(0);
    for (const s of fraud) {
      expect(s.expectedActionStatus, s.scenarioId).toBe("blocked");
      expect(s.expectedManipulationRiskState, s.scenarioId).toBe("confirmed_pattern");
      expect(s.antiGamingRisk, s.scenarioId).toBe("high");
    }
  });
  it("carries a professional-boundary note on every scenario and claims no live outcome", () => {
    expect(PACK.every((s) => s.liveOutcomeClaimAllowed === false)).toBe(true);
    expect(PACK.every((s) => /consult a qualified professional|not final/i.test(s.sourceLimitations.join(" ")))).toBe(true);
    expect(PACK.every((s) => s.expectedDashboardFields.includes("professionalBoundary") && s.expectedMobileFields.includes("professionalBoundary"))).toBe(true);
  });
  it("carries a specific do-now, proof requirement, and reassessment on every scenario (no generic advice)", () => {
    for (const s of PACK) {
      expect(s.expectedDoNow.length, s.scenarioId).toBeGreaterThan(20);
      expect(s.expectedProofRequired.length, s.scenarioId).toBeGreaterThan(0);
      expect(s.expectedReassessment.length, s.scenarioId).toBeGreaterThan(0);
    }
  });
});
