/**
 * Phase 2 — Wealth Path Classifier + Business Model Quality Score tests.
 *
 * Proves the execution.md Phase 2 exit gate:
 *   - covers high-quality, weak, dead-end, trap, and owner-job businesses
 *   - outputs include score, classification, evidence, missing data, confidence
 *   - OpsIQ may recommend stabilize/validate/pivot/pause/sell/exit/stop-investing
 *   - missing values are not hallucinated; low-data results are provisional
 */

import { describe, it, expect } from "vitest";
import {
  classifyWealthPath,
  scoreBusinessModelQuality,
} from "@/domain/owner-strategy/wealth-path";
import type { WealthPathInput } from "@/domain/owner-strategy/wealth-path.types";

// High-quality productized/subscription business (real wealth vehicle).
const HIGH_QUALITY: WealthPathInput = {
  grossMarginPct: 80,
  netMarginPct: 30,
  revenueFrequency: "subscription",
  repeatCustomerPct: 75,
  customerAcquisitionDifficulty: "low",
  pricingPower: "strong",
  differentiation: "strong",
  competitiveMoat: "strong",
  expansionPath: "product",
  capitalIntensity: "low",
  workingCapitalPressure: "low",
  downsideRisk: "low",
  regulatoryBurden: "low",
  ownerIsPrimaryOperator: false,
  staffCanRunWithoutOwner: true,
  ownerHoursPerWeek: 20,
  demandValidated: true,
  trendDeclining: false,
};

describe("scoreBusinessModelQuality — score integrity (Rule D)", () => {
  it("exposes inputs, missing data, confidence, rubric, and data source", () => {
    const r = scoreBusinessModelQuality(HIGH_QUALITY);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.dimensions).toHaveLength(7);
    expect(r.inputsUsed.length).toBeGreaterThan(0);
    expect(r.dataSource).toBe("owner_reported_structural_signals");
    expect(r.rubric).toContain("margin");
    expect(r.confidence).toBeGreaterThan(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
  });

  it("dimension weights sum to 1.0", () => {
    const r = scoreBusinessModelQuality(HIGH_QUALITY);
    const sum = r.dimensions.reduce((s, d) => s + d.weight, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
  });

  it("rates a strong structural model as strong/exceptional with high confidence", () => {
    const r = scoreBusinessModelQuality(HIGH_QUALITY);
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(["strong", "exceptional"]).toContain(r.tier);
    expect(r.provisionalLowConfidence).toBe(false);
  });

  it("clamps extreme/invalid numbers into 0..100 without throwing", () => {
    const r = scoreBusinessModelQuality({
      netMarginPct: 999,
      grossMarginPct: 999,
      repeatCustomerPct: -50,
    });
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });

  it("does not hallucinate: missing fields are listed and defaults are disclosed", () => {
    const r = scoreBusinessModelQuality({ netMarginPct: 12 });
    expect(r.inputsUsed).toContain("netMarginPct");
    expect(r.missingInputs).toContain("grossMarginPct");
    expect(r.missingInputs).toContain("expansionPath");
    expect(r.assumptions.join(" ")).toMatch(/unknown/i);
    expect(r.confidence).toBeLessThan(0.5);
  });
});

describe("classifyWealthPath — required taxonomy coverage (Phase 2 exit gate)", () => {
  it("HIGH-QUALITY → scalable wealth vehicle, not provisional, evidence present", () => {
    const r = classifyWealthPath(HIGH_QUALITY);
    expect(r.pathType).toBe("technology_product_business");
    expect(r.provisionalLowConfidence).toBe(false);
    expect(r.blocksHighRiskExecution).toBe(false);
    expect(r.evidence.length).toBeGreaterThan(0);
    expect(r.confidence).toBeGreaterThan(0.6);
  });

  it("WEAK → survival cashflow business (thin margin, low structural quality)", () => {
    const r = classifyWealthPath({
      grossMarginPct: 22,
      netMarginPct: 4,
      revenueFrequency: "one_off",
      repeatCustomerPct: 8,
      customerAcquisitionDifficulty: "high",
      pricingPower: "weak",
      differentiation: "weak",
      competitiveMoat: "none",
      expansionPath: "local",
      capitalIntensity: "medium",
      downsideRisk: "medium",
      ownerIsPrimaryOperator: false,
      staffCanRunWithoutOwner: true,
      trendDeclining: false,
    });
    expect(r.pathType).toBe("survival_cashflow_business");
    expect(["weak", "moderate"]).toContain(r.quality.tier);
    expect(r.strategicOptions).toContain("stabilize");
  });

  it("DEAD-END → declining, no path, no moat → sell/exit/pivot offered", () => {
    const r = classifyWealthPath({
      netMarginPct: 6,
      expansionPath: "none",
      differentiation: "weak",
      competitiveMoat: "none",
      ownerIsPrimaryOperator: false,
      staffCanRunWithoutOwner: true,
      trendDeclining: true,
      demandValidated: false,
    });
    expect(r.pathType).toBe("dead_end_business");
    expect(r.strategicOptions).toEqual(expect.arrayContaining(["pivot", "sell", "exit"]));
    expect(r.blocksHighRiskExecution).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/pivot|sell|exit/i);
  });

  it("TRAP → poor return + cash/risk sink → stop_investing/exit offered", () => {
    const r = classifyWealthPath({
      netMarginPct: 1,
      grossMarginPct: 18,
      expansionPath: "local",
      differentiation: "weak",
      competitiveMoat: "none",
      capitalIntensity: "high",
      workingCapitalPressure: "high",
      downsideRisk: "high",
      ownerIsPrimaryOperator: false,
      staffCanRunWithoutOwner: true,
    });
    expect(r.pathType).toBe("trap_business");
    expect(r.strategicOptions).toEqual(expect.arrayContaining(["stop_investing", "exit"]));
    expect(r.blocksHighRiskExecution).toBe(true);
  });

  it("TRAP (negative-margin capital sink) → trap even without other flags", () => {
    const r = classifyWealthPath({
      netMarginPct: -10,
      capitalIntensity: "high",
      expansionPath: "local",
    });
    expect(r.pathType).toBe("trap_business");
    expect(r.warnings.join(" ")).toMatch(/not currently profitable/i);
  });

  it("OWNER-JOB → flagged even when profitable (uncomfortable verdict)", () => {
    const r = classifyWealthPath({
      grossMarginPct: 60,
      netMarginPct: 20, // profitable!
      expansionPath: "local",
      ownerIsPrimaryOperator: true,
      staffCanRunWithoutOwner: false,
      ownerHoursPerWeek: 70,
    });
    expect(r.pathType).toBe("owner_dependent_job");
    expect(r.warnings.join(" ")).toMatch(/owner/i);
    expect(r.strategicOptions).toEqual(expect.arrayContaining(["redirect", "sell"]));
    expect(r.blocksHighRiskExecution).toBe(true);
  });
});

describe("classifyWealthPath — positive scalable categories", () => {
  const base: WealthPathInput = {
    netMarginPct: 15,
    grossMarginPct: 55,
    revenueFrequency: "recurring",
    repeatCustomerPct: 45,
    differentiation: "moderate",
    competitiveMoat: "moderate",
    ownerIsPrimaryOperator: false,
    staffCanRunWithoutOwner: true,
    capitalIntensity: "medium",
  };

  it("multi_unit expansion → multi_unit_scalable_business", () => {
    expect(classifyWealthPath({ ...base, expansionPath: "multi_unit" }).pathType).toBe(
      "multi_unit_scalable_business",
    );
  });
  it("asset_light expansion → asset_light_scalable_service", () => {
    expect(classifyWealthPath({ ...base, expansionPath: "asset_light_scalable" }).pathType).toBe(
      "asset_light_scalable_service",
    );
  });
  it("marketplace expansion → marketplace_aggregator_business", () => {
    expect(classifyWealthPath({ ...base, expansionPath: "marketplace" }).pathType).toBe(
      "marketplace_aggregator_business",
    );
  });

  it("strong moat + local/no path → strategic_stepping_stone (before local_profit)", () => {
    const r = classifyWealthPath({
      netMarginPct: 12,
      expansionPath: "local",
      differentiation: "strong",
      competitiveMoat: "strong",
      ownerIsPrimaryOperator: false,
      staffCanRunWithoutOwner: true,
    });
    expect(r.pathType).toBe("strategic_stepping_stone");
  });

  it("profitable, owner-independent, weak edge, local → local_profit_business", () => {
    const r = classifyWealthPath({
      netMarginPct: 18,
      grossMarginPct: 50,
      expansionPath: "local",
      differentiation: "moderate",
      competitiveMoat: "weak",
      ownerIsPrimaryOperator: false,
      staffCanRunWithoutOwner: true,
    });
    expect(r.pathType).toBe("local_profit_business");
    expect(r.strategicOptions).toContain("continue");
  });
});

describe("classifyWealthPath — missing-data honesty & determinism", () => {
  it("empty input → provisional, blocks high-risk, offers validate not continue", () => {
    const r = classifyWealthPath({});
    expect(r.provisionalLowConfidence).toBe(true);
    expect(r.blocksHighRiskExecution).toBe(true);
    expect(r.strategicOptions).toContain("validate");
    expect(r.strategicOptions).not.toContain("continue");
    expect(r.missingInputs.length).toBeGreaterThan(0);
    expect(r.confidence).toBeLessThan(0.5);
    expect(r.warnings.join(" ")).toMatch(/provisional/i);
  });

  it("is deterministic for identical input", () => {
    const a = classifyWealthPath(HIGH_QUALITY);
    const b = classifyWealthPath(HIGH_QUALITY);
    expect(a).toEqual(b);
  });

  it("cash runway < 3 months surfaces a survival-first warning", () => {
    const r = classifyWealthPath({
      netMarginPct: 8,
      cashRunwayMonths: 2,
      expansionPath: "local",
      ownerIsPrimaryOperator: false,
      staffCanRunWithoutOwner: true,
      differentiation: "moderate",
      competitiveMoat: "weak",
    });
    expect(r.warnings.join(" ")).toMatch(/runway/i);
  });

  it("every result exposes what evidence would change the verdict", () => {
    const r = classifyWealthPath({ netMarginPct: 10 });
    expect(r.whatWouldChangeResult.length).toBeGreaterThan(0);
  });
});
