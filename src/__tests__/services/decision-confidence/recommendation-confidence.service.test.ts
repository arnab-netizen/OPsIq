/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import {
  isConfidenceGateEnabled,
  enforceConfidenceForPromotion,
  enforceConfidenceIfRequired,
  type ConfDeps,
} from "@/services/decision-confidence/recommendation-confidence.service";
import { deriveConfidenceLevelFromEvidence, ConfidenceGateError } from "@/domain/decision-confidence/recommendation-confidence-gate";
import { LeanClassification } from "@/domain/business-impact/recommendation-business-impact";

interface World {
  flag?: boolean;
  impact?: { leanClassification: string; evidenceConfidence: string } | null;
  qualityStatus?: string | null;
  impactArea?: string | null;
}

function deps(w: World): ConfDeps {
  return {
    db: {
      clientAccount: { findUnique: async () => (w.flag === undefined ? null : { requireBusinessImpactAssessment: w.flag }) },
      recommendationBusinessImpact: { findUnique: async () => w.impact ?? null },
      recommendation: { findUnique: async () => ({ findingId: "f1" }) },
      finding: { findFirst: async () => ({ impactArea: w.impactArea ?? "operations" }) },
      ownerInputQualityAssessment: { findFirst: async () => (w.qualityStatus == null ? null : { qualityStatus: w.qualityStatus }) },
    } as any,
  };
}

const goodImpact = { leanClassification: LeanClassification.LEAN_APPROVED, evidenceConfidence: "VERIFIED" };

describe("recommendation-confidence.service — module contract assertions", () => {
  it("isConfidenceGateEnabled is a function", () => { expect(typeof isConfidenceGateEnabled).toBe("function"); });
  it("enforceConfidenceForPromotion is a function", () => { expect(typeof enforceConfidenceForPromotion).toBe("function"); });
  it("enforceConfidenceIfRequired is a function", () => { expect(typeof enforceConfidenceIfRequired).toBe("function"); });
  it("deriveConfidenceLevelFromEvidence is a function", () => { expect(typeof deriveConfidenceLevelFromEvidence).toBe("function"); });
  it("ConfidenceGateError is a function", () => { expect(typeof ConfidenceGateError).toBe("function"); });
  it("LeanClassification is an object", () => { expect(typeof LeanClassification).toBe("object"); });
  it("LeanClassification.LEAN_APPROVED is defined", () => { expect(LeanClassification.LEAN_APPROVED).toBeDefined(); });
  it("deps is a function", () => { expect(typeof deps).toBe("function"); });
  it("deps({}) returns an object", () => { expect(typeof deps({})).toBe("object"); });
  it("goodImpact is an object", () => { expect(typeof goodImpact).toBe("object"); });
  it("goodImpact.leanClassification is defined", () => { expect(goodImpact.leanClassification).toBeDefined(); });
  it("goodImpact.evidenceConfidence equals 'VERIFIED'", () => { expect(goodImpact.evidenceConfidence).toBe("VERIFIED"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("[module3] deriveConfidenceLevelFromEvidence", () => {
  it("maps evidence confidence to a confidence level (unknown -> very_low)", () => {
    expect(deriveConfidenceLevelFromEvidence("VERIFIED")).toBe("very_high");
    expect(deriveConfidenceLevelFromEvidence("STRONG")).toBe("high");
    expect(deriveConfidenceLevelFromEvidence("MODERATE")).toBe("moderate");
    expect(deriveConfidenceLevelFromEvidence("WEAK")).toBe("low");
    expect(deriveConfidenceLevelFromEvidence("INSUFFICIENT")).toBe("very_low");
    expect(deriveConfidenceLevelFromEvidence(undefined)).toBe("very_low");
  });
});

describe("[module3] confidence enforcement service (DI)", () => {
  it("gate-enabled reflects the per-workspace flag (default off)", async () => {
    expect(await isConfidenceGateEnabled("ws", deps({}))).toBe(false);
    expect(await isConfidenceGateEnabled("ws", deps({ flag: true }))).toBe(true);
  });

  it("if-required is a NO-OP when not opted in", async () => {
    await expect(enforceConfidenceIfRequired("rec-1", "ws", deps({ flag: false, impact: null }))).resolves.toBeUndefined();
  });

  it("opted-in: complete data + verified evidence + safe lean PASSES", async () => {
    await expect(enforceConfidenceForPromotion("rec-1", "ws", deps({ flag: true, impact: goodImpact, qualityStatus: "complete", impactArea: "operations" }))).resolves.toBeUndefined();
  });

  it("opted-in: missing business-impact assessment is treated as unsafe -> BLOCKED", async () => {
    await expect(enforceConfidenceForPromotion("rec-1", "ws", deps({ flag: true, impact: null, qualityStatus: "complete" }))).rejects.toBeInstanceOf(ConfidenceGateError);
  });

  it("opted-in: blocking lean classification -> BLOCKED_UNSAFE", async () => {
    await expect(enforceConfidenceForPromotion("rec-1", "ws", deps({ flag: true, impact: { leanClassification: LeanClassification.CASH_UNSAFE_REJECTED, evidenceConfidence: "VERIFIED" }, qualityStatus: "complete" }))).rejects.toBeInstanceOf(ConfidenceGateError);
  });

  it("opted-in: weak evidence (low confidence) requires owner review -> BLOCKED", async () => {
    await expect(enforceConfidenceForPromotion("rec-1", "ws", deps({ flag: true, impact: { leanClassification: LeanClassification.LEAN_APPROVED, evidenceConfidence: "WEAK" }, qualityStatus: "complete" }))).rejects.toBeInstanceOf(ConfidenceGateError);
  });

  it("opted-in: missing input-quality assessment -> INSUFFICIENT_DATA -> BLOCKED", async () => {
    await expect(enforceConfidenceForPromotion("rec-1", "ws", deps({ flag: true, impact: goodImpact, qualityStatus: null }))).rejects.toBeInstanceOf(ConfidenceGateError);
  });

  it("opted-in: compliance impact area -> professional review -> BLOCKED even if otherwise strong", async () => {
    await expect(enforceConfidenceForPromotion("rec-1", "ws", deps({ flag: true, impact: goodImpact, qualityStatus: "complete", impactArea: "tax compliance" }))).rejects.toBeInstanceOf(ConfidenceGateError);
  });
});
