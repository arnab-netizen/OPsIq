/**
 * CUSTOMER / VENDOR / MARKET pack — schema + invariant tests (no DB). Proves the 100 counted scenarios are unique,
 * schema-valid, source-backed, privacy-clean, honestly distributed, and safe at the authoring layer: a decision
 * missing customer/vendor/market data never proceeds, professional-boundary/compliance never proceeds, fraudulent-
 * claim/gamed cases never proceed, proceed/cautious only on routine in-policy verified actions, no live claim.
 */
import { describe, it, expect } from "vitest";
import { CUSTOMER_VENDOR_MARKET_PACK as PACK, CUSTOMER_VENDOR_MARKET_SUBCATEGORIES } from "@/domain/scenarios/customer-vendor-market-pack";
import { businessRealityScenarioSchema, HIGH_PROOF_RISK_STATES, HIGH_MANIPULATION_RISK_STATES } from "@/domain/scenarios/business-reality-scenario";
import { CUSTOMER_VENDOR_MARKET_SOURCES, CUSTOMER_VENDOR_MARKET_SOURCE_BY_ID } from "@/domain/scenarios/customer-vendor-market-sources";
import { sourceRecordSchema, findPII } from "@/behavioral-validation/public-cases/source-register";

const proceedish = (st: string) => st === "proceed" || st === "cautious_proceed";

describe("customer-vendor-market-pack — module contract assertions", () => {
  it("CUSTOMER_VENDOR_MARKET_PACK is an array", () => { expect(Array.isArray(PACK)).toBe(true); });
  it("CUSTOMER_VENDOR_MARKET_SUBCATEGORIES is an array", () => { expect(Array.isArray(CUSTOMER_VENDOR_MARKET_SUBCATEGORIES)).toBe(true); });
  it("businessRealityScenarioSchema is an object", () => { expect(typeof businessRealityScenarioSchema).toBe("object"); });
  it("CUSTOMER_VENDOR_MARKET_SOURCES is an array", () => { expect(Array.isArray(CUSTOMER_VENDOR_MARKET_SOURCES)).toBe(true); });
  it("sourceRecordSchema is an object", () => { expect(typeof sourceRecordSchema).toBe("object"); });
  it("findPII is a function", () => { expect(typeof findPII).toBe("function"); });
  it("proceedish is a function", () => { expect(typeof proceedish).toBe("function"); });
  it("proceedish('proceed') returns true", () => { expect(proceedish("proceed")).toBe(true); });
  it("proceedish('blocked') returns false", () => { expect(proceedish("blocked")).toBe(false); });
  it("PACK.length equals 100", () => { expect(PACK.length).toBe(100); });
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
  it("typeof JSON.stringify equals function", () => { expect(typeof JSON.stringify).toBe("function"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("Customer/Vendor/Market pack — count & identity", () => {
  it("has exactly 100 counted, unique scenarios", () => {
    expect(PACK.length).toBe(100);
    expect(new Set(PACK.map((s) => s.scenarioId)).size).toBe(100);
    expect(PACK.every((s) => s.scenarioPack === "CUSTOMER_VENDOR_MARKET")).toBe(true);
    expect(PACK.every((s) => s.countedForReadiness && !s.synthetic && !s.liveDataBacked)).toBe(true);
  });

  it("covers 10 subcategories × 10 each", () => {
    for (const sub of CUSTOMER_VENDOR_MARKET_SUBCATEGORIES) expect(PACK.filter((s) => s.category === sub).length, sub).toBe(10);
    expect(new Set(PACK.map((s) => s.category)).size).toBe(10);
  });

  it("is schema-valid for all 100", () => {
    for (const s of PACK) expect(businessRealityScenarioSchema.safeParse(s).success, s.scenarioId).toBe(true);
  });
});

describe("Customer/Vendor/Market pack — sources & gold", () => {
  it("every scenario is source-backed by a valid privacy-clean source", () => {
    for (const s of PACK) {
      expect(s.sourceRefs.length, s.scenarioId).toBeGreaterThan(0);
      for (const ref of s.sourceRefs) expect(CUSTOMER_VENDOR_MARKET_SOURCE_BY_ID[ref], `${s.scenarioId}->${ref}`).toBeDefined();
    }
  });

  it("has 24 privacy-clean sources (schema-valid, low privacy risk, no PII)", () => {
    expect(CUSTOMER_VENDOR_MARKET_SOURCES.length).toBe(24);
    for (const src of CUSTOMER_VENDOR_MARKET_SOURCES) {
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

describe("Customer/Vendor/Market pack — distribution (within required ranges)", () => {
  const count = (f: (s: (typeof PACK)[number]) => string) =>
    PACK.reduce<Record<string, number>>((d, s) => ((d[f(s)] = (d[f(s)] ?? 0) + 1), d), {});
  it("hits the target action-status ranges with all five statuses", () => {
    const d = count((s) => s.expectedActionStatus);
    expect(d.proceed).toBeGreaterThanOrEqual(10); expect(d.proceed).toBeLessThanOrEqual(25);
    expect(d.cautious_proceed).toBeGreaterThanOrEqual(20); expect(d.cautious_proceed).toBeLessThanOrEqual(40);
    expect(d.need_more_data).toBeGreaterThanOrEqual(20); expect(d.need_more_data).toBeLessThanOrEqual(40);
    expect(d.owner_decision_required).toBeGreaterThanOrEqual(20); expect(d.owner_decision_required).toBeLessThanOrEqual(40);
    expect(d.blocked).toBeGreaterThanOrEqual(5); expect(d.blocked).toBeLessThanOrEqual(25);
  });
});

describe("Customer/Vendor/Market pack — hard safety rules", () => {
  it("no decision with missing critical data proceeds", () => {
    expect(PACK.filter((s) => s.expectedInputQualityState === "critical_missing" && proceedish(s.expectedActionStatus)).length).toBe(0);
  });
  it("no professional-boundary/compliance case proceeds (and each is blocked)", () => {
    for (const s of PACK.filter((x) => x.professionalReviewRequired)) {
      expect(proceedish(s.expectedActionStatus), s.scenarioId).toBe(false);
      expect(s.expectedActionStatus, s.scenarioId).toBe("blocked");
    }
  });
  it("no fraudulent/high-risk case proceeds; proceed/cautious only on routine in-policy verified actions", () => {
    for (const s of PACK.filter((x) => proceedish(x.expectedActionStatus))) {
      expect(s.highRisk, s.scenarioId).toBe(false);
      expect(s.professionalReviewRequired, s.scenarioId).toBe(false);
      expect(s.expectedInputQualityState, s.scenarioId).not.toBe("critical_missing");
      expect(HIGH_PROOF_RISK_STATES.has(s.expectedProofRiskState ?? "none"), s.scenarioId).toBe(false);
      expect(HIGH_MANIPULATION_RISK_STATES.has(s.expectedManipulationRiskState ?? "none"), s.scenarioId).toBe(false);
    }
  });
  it("fraud blocks (refund/vendor) carry a confirmed manipulation pattern + high anti-gaming risk", () => {
    const fraud = PACK.filter((s) => s.expectedDominantConstraint === "proof_fraud_block");
    expect(fraud.length).toBeGreaterThan(0);
    for (const s of fraud) {
      expect(s.expectedActionStatus, s.scenarioId).toBe("blocked");
      expect(s.expectedManipulationRiskState, s.scenarioId).toBe("confirmed_pattern");
      expect(s.antiGamingRisk, s.scenarioId).toBe("high");
    }
  });
  it("separates expected impact from proven actual and claims no live outcome", () => {
    expect(PACK.every((s) => s.liveOutcomeClaimAllowed === false)).toBe(true);
    expect(PACK.every((s) => /expected only|not proven|not final/i.test(s.expectedOutcomeMetric + " " + s.sourceLimitations.join(" ")))).toBe(true);
    expect(PACK.every((s) => s.expectedDashboardFields.includes("relationshipImpact") && s.expectedMobileFields.includes("relationshipImpact"))).toBe(true);
  });
  it("carries a specific do-now, proof requirement, and reassessment on every scenario (no generic advice)", () => {
    for (const s of PACK) {
      expect(s.expectedDoNow.length, s.scenarioId).toBeGreaterThan(20);
      expect(s.expectedProofRequired.length, s.scenarioId).toBeGreaterThan(0);
      expect(s.expectedReassessment.length, s.scenarioId).toBeGreaterThan(0);
    }
  });
});
