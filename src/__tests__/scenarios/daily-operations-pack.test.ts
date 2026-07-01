/**
 * DAILY OPERATIONS pack — schema + invariant tests (no DB). Proves the 300 counted scenarios are unique,
 * schema-valid, source-backed, privacy-clean, honestly distributed, and policy-safe at the authoring layer:
 * proceed/cautious ONLY on routine reversible SOP-granted verified-proof steps; no high-risk / critical-missing /
 * compliance / fraud case proceeds; owner-gating where material; proof + reassessment always; no live claim.
 */
import { describe, it, expect } from "vitest";
import { DAILY_OPERATIONS_PACK as PACK, DAILY_OPERATIONS_SUBCATEGORIES } from "@/domain/scenarios/daily-operations-pack";
import { businessRealityScenarioSchema, HIGH_PROOF_RISK_STATES } from "@/domain/scenarios/business-reality-scenario";
import { DAILY_OPERATIONS_SOURCES, DAILY_OPERATIONS_SOURCE_BY_ID } from "@/domain/scenarios/daily-operations-sources";
import { sourceRecordSchema, findPII } from "@/behavioral-validation/public-cases/source-register";

const proceedish = (st: string) => st === "proceed" || st === "cautious_proceed";
const BOUNDARY_DOMINANTS = new Set(["compliance_block", "proof_fraud_block", "cash_survival"]);

describe("Daily Operations pack — count & identity", () => {
  it("has exactly 300 counted, unique scenarios", () => {
    expect(PACK.length).toBe(300);
    expect(new Set(PACK.map((s) => s.scenarioId)).size).toBe(300);
    expect(PACK.every((s) => s.scenarioPack === "DAILY_OPERATIONS")).toBe(true);
    expect(PACK.every((s) => s.countedForReadiness && !s.synthetic && !s.liveDataBacked)).toBe(true);
  });

  it("covers 12 subcategories × 25 each", () => {
    for (const sub of DAILY_OPERATIONS_SUBCATEGORIES) {
      expect(PACK.filter((s) => s.category === sub).length, sub).toBe(25);
    }
    expect(new Set(PACK.map((s) => s.category)).size).toBe(12);
  });

  it("is schema-valid for all 300 (non-strict schema strips the extra seed field)", () => {
    for (const s of PACK) expect(businessRealityScenarioSchema.safeParse(s).success, s.scenarioId).toBe(true);
  });
});

describe("Daily Operations pack — sources & gold", () => {
  it("every scenario is source-backed by a valid privacy-clean source", () => {
    for (const s of PACK) {
      expect(s.sourceRefs.length, s.scenarioId).toBeGreaterThan(0);
      for (const ref of s.sourceRefs) expect(DAILY_OPERATIONS_SOURCE_BY_ID[ref], `${s.scenarioId}->${ref}`).toBeDefined();
    }
  });

  it("has 28 privacy-clean sources (schema-valid, low privacy risk, no PII)", () => {
    expect(DAILY_OPERATIONS_SOURCES.length).toBe(28);
    for (const src of DAILY_OPERATIONS_SOURCES) {
      expect(sourceRecordSchema.safeParse(src).success, src.id).toBe(true);
      expect(src.privacyRisk, src.id).toBe("low");
      expect(findPII([src.title, src.citation ?? "", ...src.factsUsed].join(" ")), src.id).toEqual([]);
    }
  });

  it("has 12 independent gold cases, ≥1 per subcategory", () => {
    const gold = PACK.filter((s) => s.independentGold);
    expect(gold.length).toBe(12);
    expect(new Set(gold.map((s) => s.category)).size).toBe(12);
  });
});

describe("Daily Operations pack — distribution (proceed/cautious common, as befits daily ops)", () => {
  const count = (f: (s: (typeof PACK)[number]) => string) =>
    PACK.reduce<Record<string, number>>((d, s) => ((d[f(s)] = (d[f(s)] ?? 0) + 1), d), {});

  it("hits the target action-status ranges with all five statuses", () => {
    const d = count((s) => s.expectedActionStatus);
    expect(d.proceed, "proceed").toBeGreaterThanOrEqual(45);
    expect(d.proceed).toBeLessThanOrEqual(75);
    expect(d.cautious_proceed, "cautious").toBeGreaterThanOrEqual(45);
    expect(d.cautious_proceed).toBeLessThanOrEqual(75);
    expect(d.need_more_data, "nmd").toBeGreaterThanOrEqual(60);
    expect(d.need_more_data).toBeLessThanOrEqual(90);
    expect(d.owner_decision_required, "owner").toBeGreaterThanOrEqual(45);
    expect(d.owner_decision_required).toBeLessThanOrEqual(75);
    expect(d.blocked, "blocked").toBeGreaterThanOrEqual(15);
    expect(d.blocked).toBeLessThanOrEqual(45);
  });

  it("is workload-aware: most routine work is low owner-workload (delegated, not owner-burdened)", () => {
    const d = count((s) => s.ownerWorkloadRisk);
    expect((d.low ?? 0)).toBeGreaterThan((d.medium ?? 0) + (d.high ?? 0));
  });
});

describe("Daily Operations pack — proceed/cautious policy & safety", () => {
  it("proceed/cautious ONLY on routine reversible verified-proof steps (never high-risk/boundary/critical-missing)", () => {
    for (const s of PACK.filter((x) => proceedish(x.expectedActionStatus))) {
      expect(s.highRisk, `${s.scenarioId} highRisk`).toBe(false);
      expect(s.professionalReviewRequired, `${s.scenarioId} profReview`).toBe(false);
      expect(s.expectedInputQualityState, `${s.scenarioId} inputQuality`).not.toBe("critical_missing");
      expect(BOUNDARY_DOMINANTS.has(s.expectedDominantConstraint), `${s.scenarioId} dominant`).toBe(false);
      expect(HIGH_PROOF_RISK_STATES.has(s.expectedProofRiskState ?? "none"), `${s.scenarioId} proofRisk`).toBe(false);
    }
  });

  it("no high-risk action proceeds; no critical-missing case proceeds", () => {
    expect(PACK.filter((s) => s.highRisk && proceedish(s.expectedActionStatus)).length).toBe(0);
    expect(PACK.filter((s) => s.expectedInputQualityState === "critical_missing" && proceedish(s.expectedActionStatus)).length).toBe(0);
  });

  it("blocked cases are safety/compliance/fraud boundaries and never proceed", () => {
    for (const s of PACK.filter((x) => x.expectedActionStatus === "blocked")) {
      expect(["compliance_block", "proof_fraud_block"], s.scenarioId).toContain(s.expectedDominantConstraint);
    }
  });

  it("carries a specific do-now, proof requirement, and reassessment on every scenario (no generic advice)", () => {
    for (const s of PACK) {
      expect(s.expectedDoNow.length, s.scenarioId).toBeGreaterThan(20);
      expect(s.expectedProofRequired.length, s.scenarioId).toBeGreaterThan(0);
      expect(s.expectedReassessment.length, s.scenarioId).toBeGreaterThan(0);
    }
  });

  it("claims no live outcome and surfaces owner-workload on dashboard and mobile", () => {
    expect(PACK.every((s) => s.liveOutcomeClaimAllowed === false)).toBe(true);
    expect(PACK.every((s) => s.expectedDashboardFields.includes("ownerWorkload"))).toBe(true);
    expect(PACK.every((s) => s.expectedMobileFields.includes("ownerWorkload"))).toBe(true);
  });
});
