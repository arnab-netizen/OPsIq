/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import {
  isInputQualityGateEnabled,
  enforceInputQualityForPromotion,
  enforceInputQualityIfRequired,
  type IQDeps,
} from "@/services/owner-mode/recommendation-input-quality.service";
import { mapImpactAreaToSensitivity, RecommendationSensitivity, InputQualityGateError } from "@/domain/owner-mode/recommendation-input-quality-gate";

interface World {
  flag?: boolean;
  findingId?: string | null;
  impactArea?: string | null;
  qualityStatus?: string | null;
}

function deps(w: World): IQDeps {
  return {
    db: {
      clientAccount: {
        findUnique: async () => (w.flag === undefined ? null : { requireBusinessImpactAssessment: w.flag }),
      },
      recommendation: {
        findUnique: async () => ({ findingId: w.findingId ?? null }),
      },
      finding: {
        findFirst: async () => ({ impactArea: w.impactArea ?? null }),
      },
      ownerInputQualityAssessment: {
        findFirst: async () => (w.qualityStatus == null ? null : { qualityStatus: w.qualityStatus }),
      },
    } as any,
  };
}

describe("recommendation-input-quality — module contract assertions", () => {
  it("isInputQualityGateEnabled is a function", () => { expect(typeof isInputQualityGateEnabled).toBe("function"); });
  it("enforceInputQualityForPromotion is a function", () => { expect(typeof enforceInputQualityForPromotion).toBe("function"); });
  it("enforceInputQualityIfRequired is a function", () => { expect(typeof enforceInputQualityIfRequired).toBe("function"); });
  it("mapImpactAreaToSensitivity is a function", () => { expect(typeof mapImpactAreaToSensitivity).toBe("function"); });
  it("RecommendationSensitivity is an object", () => { expect(typeof RecommendationSensitivity).toBe("object"); });
  it("RecommendationSensitivity.GENERAL is defined", () => { expect(RecommendationSensitivity.GENERAL).toBeDefined(); });
  it("RecommendationSensitivity.FINANCE_SENSITIVE is defined", () => { expect(RecommendationSensitivity.FINANCE_SENSITIVE).toBeDefined(); });
  it("RecommendationSensitivity.PRICING_SENSITIVE is defined", () => { expect(RecommendationSensitivity.PRICING_SENSITIVE).toBeDefined(); });
  it("InputQualityGateError is a function", () => { expect(typeof InputQualityGateError).toBe("function"); });
  it("deps is a function", () => { expect(typeof deps).toBe("function"); });
  it("deps({}) returns an object", () => { expect(typeof deps({})).toBe("object"); });
  it("deps({}) has db field", () => { expect(deps({})).toHaveProperty("db"); });
  it("mapImpactAreaToSensitivity(null) equals GENERAL", () => { expect(mapImpactAreaToSensitivity(null)).toBe(RecommendationSensitivity.GENERAL); });
  it("mapImpactAreaToSensitivity('cash runway') equals FINANCE_SENSITIVE", () => { expect(mapImpactAreaToSensitivity("cash runway")).toBe(RecommendationSensitivity.FINANCE_SENSITIVE); });
});

describe("[module2] mapImpactAreaToSensitivity", () => {
  it("maps impact areas to sensitivities; unknown -> GENERAL", () => {
    expect(mapImpactAreaToSensitivity("Financial health")).toBe(RecommendationSensitivity.FINANCE_SENSITIVE);
    expect(mapImpactAreaToSensitivity("cash runway")).toBe(RecommendationSensitivity.FINANCE_SENSITIVE);
    expect(mapImpactAreaToSensitivity("pricing strategy")).toBe(RecommendationSensitivity.PRICING_SENSITIVE);
    expect(mapImpactAreaToSensitivity("hiring plan")).toBe(RecommendationSensitivity.HIRING_SENSITIVE);
    expect(mapImpactAreaToSensitivity("growth / expansion")).toBe(RecommendationSensitivity.GROWTH_SENSITIVE);
    expect(mapImpactAreaToSensitivity("tax compliance")).toBe(RecommendationSensitivity.COMPLIANCE_SENSITIVE);
    expect(mapImpactAreaToSensitivity("customer happiness")).toBe(RecommendationSensitivity.GENERAL);
    expect(mapImpactAreaToSensitivity(null)).toBe(RecommendationSensitivity.GENERAL);
  });
});

describe("[module2] input-quality enforcement service (DI)", () => {
  it("gate enabled reflects the per-workspace flag (default off)", async () => {
    expect(await isInputQualityGateEnabled("ws", deps({}))).toBe(false);
    expect(await isInputQualityGateEnabled("ws", deps({ flag: false }))).toBe(false);
    expect(await isInputQualityGateEnabled("ws", deps({ flag: true }))).toBe(true);
  });

  it("if-required is a NO-OP when the workspace has not opted in", async () => {
    // Finance finding + no assessment would normally block, but flag off => skip.
    await expect(enforceInputQualityIfRequired("rec-1", "ws", deps({ flag: false, findingId: "f1", impactArea: "financial", qualityStatus: null }))).resolves.toBeUndefined();
  });

  it("opted-in: a finance-sensitive rec with NO input-quality assessment is BLOCKED (fail-closed)", async () => {
    await expect(enforceInputQualityIfRequired("rec-1", "ws", deps({ flag: true, findingId: "f1", impactArea: "financial", qualityStatus: null }))).rejects.toBeInstanceOf(InputQualityGateError);
  });

  it("opted-in: finance-sensitive rec with critical_missing input quality is BLOCKED", async () => {
    await expect(enforceInputQualityForPromotion("rec-1", "ws", deps({ flag: true, findingId: "f1", impactArea: "cash", qualityStatus: "critical_missing" }))).rejects.toBeInstanceOf(InputQualityGateError);
  });

  it("opted-in: finance-sensitive rec with complete input quality PASSES", async () => {
    await expect(enforceInputQualityForPromotion("rec-1", "ws", deps({ flag: true, findingId: "f1", impactArea: "financial", qualityStatus: "complete" }))).resolves.toBeUndefined();
  });

  it("opted-in: a GENERAL rec (non-sensitive finding) with weak data still PASSES", async () => {
    await expect(enforceInputQualityForPromotion("rec-1", "ws", deps({ flag: true, findingId: "f1", impactArea: "customer experience", qualityStatus: "data_limited" }))).resolves.toBeUndefined();
  });

  it("opted-in: a compliance-sensitive rec always routes to professional review (blocked from auto-promote)", async () => {
    await expect(enforceInputQualityForPromotion("rec-1", "ws", deps({ flag: true, findingId: "f1", impactArea: "legal compliance", qualityStatus: "complete" }))).rejects.toBeInstanceOf(InputQualityGateError);
  });
});
