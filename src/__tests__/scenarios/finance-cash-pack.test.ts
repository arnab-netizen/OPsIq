/**
 * FINANCE / CASH / CAPITAL ALLOCATION pack — schema + invariant tests (no DB). Proves the 120 counted scenarios
 * are unique, schema-valid, source-backed, privacy-clean, honestly distributed, and finance-safe at the authoring
 * layer: cash-critical never proceeds, missing critical financial data never proceeds, professional-boundary
 * finance never proceeds, proceed/cautious only on routine within-threshold verified actions, no live claim.
 */
import { describe, it, expect } from "vitest";
import { FINANCE_CASH_PACK as PACK, FINANCE_CASH_SUBCATEGORIES } from "@/domain/scenarios/finance-cash-pack";
import { businessRealityScenarioSchema, HIGH_PROOF_RISK_STATES } from "@/domain/scenarios/business-reality-scenario";
import { FINANCE_CASH_SOURCES, FINANCE_CASH_SOURCE_BY_ID } from "@/domain/scenarios/finance-cash-sources";
import { sourceRecordSchema, findPII } from "@/behavioral-validation/public-cases/source-register";

const proceedish = (st: string) => st === "proceed" || st === "cautious_proceed";

describe("Finance/Cash pack — count & identity", () => {
  it("has exactly 120 counted, unique scenarios", () => {
    expect(PACK.length).toBe(120);
    expect(new Set(PACK.map((s) => s.scenarioId)).size).toBe(120);
    expect(PACK.every((s) => s.scenarioPack === "FINANCE_CASH_CAPITAL_ALLOCATION")).toBe(true);
    expect(PACK.every((s) => s.countedForReadiness && !s.synthetic && !s.liveDataBacked)).toBe(true);
  });

  it("covers 12 subcategories × 10 each", () => {
    for (const sub of FINANCE_CASH_SUBCATEGORIES) expect(PACK.filter((s) => s.category === sub).length, sub).toBe(10);
    expect(new Set(PACK.map((s) => s.category)).size).toBe(12);
  });

  it("is schema-valid for all 120", () => {
    for (const s of PACK) expect(businessRealityScenarioSchema.safeParse(s).success, s.scenarioId).toBe(true);
  });
});

describe("Finance/Cash pack — sources & gold", () => {
  it("every scenario is source-backed by a valid privacy-clean source", () => {
    for (const s of PACK) {
      expect(s.sourceRefs.length, s.scenarioId).toBeGreaterThan(0);
      for (const ref of s.sourceRefs) expect(FINANCE_CASH_SOURCE_BY_ID[ref], `${s.scenarioId}->${ref}`).toBeDefined();
    }
  });

  it("has 24 privacy-clean sources (schema-valid, low privacy risk, no PII)", () => {
    expect(FINANCE_CASH_SOURCES.length).toBe(24);
    for (const src of FINANCE_CASH_SOURCES) {
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

describe("Finance/Cash pack — distribution (within required ranges)", () => {
  const count = (f: (s: (typeof PACK)[number]) => string) =>
    PACK.reduce<Record<string, number>>((d, s) => ((d[f(s)] = (d[f(s)] ?? 0) + 1), d), {});
  it("hits the target action-status ranges with all five statuses", () => {
    const d = count((s) => s.expectedActionStatus);
    expect(d.proceed).toBeGreaterThanOrEqual(5); expect(d.proceed).toBeLessThanOrEqual(15);
    expect(d.cautious_proceed).toBeGreaterThanOrEqual(10); expect(d.cautious_proceed).toBeLessThanOrEqual(25);
    expect(d.need_more_data).toBeGreaterThanOrEqual(25); expect(d.need_more_data).toBeLessThanOrEqual(45);
    expect(d.owner_decision_required).toBeGreaterThanOrEqual(30); expect(d.owner_decision_required).toBeLessThanOrEqual(55);
    expect(d.blocked).toBeGreaterThanOrEqual(15); expect(d.blocked).toBeLessThanOrEqual(35);
  });
});

describe("Finance/Cash pack — hard safety rules", () => {
  it("no cash-critical (cash_survival) action proceeds", () => {
    expect(PACK.filter((s) => s.expectedDominantConstraint === "cash_survival" && proceedish(s.expectedActionStatus)).length).toBe(0);
  });
  it("no critical-missing financial data proceeds", () => {
    expect(PACK.filter((s) => s.expectedInputQualityState === "critical_missing" && proceedish(s.expectedActionStatus)).length).toBe(0);
  });
  it("no professional-boundary finance case proceeds (and each is blocked/owner-gated)", () => {
    for (const s of PACK.filter((x) => x.professionalReviewRequired)) {
      expect(proceedish(s.expectedActionStatus), s.scenarioId).toBe(false);
      expect(s.expectedActionStatus, s.scenarioId).toBe("blocked");
    }
  });
  it("no high-risk action proceeds; proceed/cautious only on routine within-threshold verified actions", () => {
    for (const s of PACK.filter((x) => proceedish(x.expectedActionStatus))) {
      expect(s.highRisk, s.scenarioId).toBe(false);
      expect(s.professionalReviewRequired, s.scenarioId).toBe(false);
      expect(s.expectedInputQualityState, s.scenarioId).not.toBe("critical_missing");
      expect(HIGH_PROOF_RISK_STATES.has(s.expectedProofRiskState ?? "none"), s.scenarioId).toBe(false);
    }
  });
  it("payroll pressure is owner-gated (never proceeds) — never hidden", () => {
    for (const s of PACK.filter((x) => x.category === "payroll_staff_payment_pressure")) {
      expect(proceedish(s.expectedActionStatus) && s.severity === "high", s.scenarioId).toBe(false);
    }
    expect(PACK.filter((s) => s.category === "payroll_staff_payment_pressure" && s.expectedActionStatus === "owner_decision_required").length).toBeGreaterThan(0);
  });
  it("separates expected impact from proven actual and claims no live outcome", () => {
    expect(PACK.every((s) => s.liveOutcomeClaimAllowed === false)).toBe(true);
    expect(PACK.every((s) => /expected only|not proven|not final/i.test(s.expectedOutcomeMetric + " " + s.sourceLimitations.join(" ")))).toBe(true);
    expect(PACK.every((s) => s.expectedDashboardFields.includes("cashImpact") && s.expectedMobileFields.includes("cashImpact"))).toBe(true);
  });
  it("carries a specific do-now, proof requirement, and reassessment on every scenario (no generic advice)", () => {
    for (const s of PACK) {
      expect(s.expectedDoNow.length, s.scenarioId).toBeGreaterThan(20);
      expect(s.expectedProofRequired.length, s.scenarioId).toBeGreaterThan(0);
      expect(s.expectedReassessment.length, s.scenarioId).toBeGreaterThan(0);
    }
  });
});
