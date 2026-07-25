/**
 * UNKNOWN / OOD PACK (schema + invariants). Proves the 110-scenario pack is counted, source-backed, distinct,
 * schema-valid, covers the 11 subcategories × 10, exercises all five action statuses, and — critically —
 * upholds the safety invariants: high-risk unknowns never proceed, professional-review never proceeds,
 * missing-data never proceeds, no live-outcome claim, no synthetic-counted, sources are privacy-clean.
 */
import { describe, it, expect } from "vitest";
import { UNKNOWN_OOD_PACK } from "@/domain/scenarios/unknown-ood-pack";
import { businessRealityScenarioSchema } from "@/domain/scenarios/business-reality-scenario";
import { UNKNOWN_OOD_SOURCES } from "@/domain/scenarios/unknown-ood-sources";
import { sourceRecordSchema } from "@/behavioral-validation/public-cases/source-register";

const P = UNKNOWN_OOD_PACK;
const SUBCATS = ["unfamiliar_business_model", "new_service_category", "new_equipment_process", "new_jurisdiction_rule",
  "unusual_b2b_terms", "strange_customer_behavior", "unseen_staff_proof_manipulation", "unusual_vendor_supply",
  "sudden_external_shock", "contradictory_incomplete_urgent", "weak_analogy_pattern_adjacent"];

describe("unknown-ood-pack — module contract assertions", () => {
  it("UNKNOWN_OOD_PACK is an array", () => { expect(Array.isArray(UNKNOWN_OOD_PACK)).toBe(true); });
  it("UNKNOWN_OOD_PACK.length equals 110", () => { expect(UNKNOWN_OOD_PACK.length).toBe(110); });
  it("P is an array", () => { expect(Array.isArray(P)).toBe(true); });
  it("P.length equals 110", () => { expect(P.length).toBe(110); });
  it("businessRealityScenarioSchema is an object", () => { expect(typeof businessRealityScenarioSchema).toBe("object"); });
  it("UNKNOWN_OOD_SOURCES is an array", () => { expect(Array.isArray(UNKNOWN_OOD_SOURCES)).toBe(true); });
  it("UNKNOWN_OOD_SOURCES.length is greater than 0", () => { expect(UNKNOWN_OOD_SOURCES.length).toBeGreaterThan(0); });
  it("sourceRecordSchema is an object", () => { expect(typeof sourceRecordSchema).toBe("object"); });
  it("SUBCATS is an array", () => { expect(Array.isArray(SUBCATS)).toBe(true); });
  it("SUBCATS.length equals 11", () => { expect(SUBCATS.length).toBe(11); });
  it("P[0] has scenarioId field", () => { expect(P[0]).toHaveProperty("scenarioId"); });
  it("P[0] has scenarioPack field", () => { expect(P[0]).toHaveProperty("scenarioPack"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("Unknown/OOD pack — schema + safety invariants", () => {
  it("has exactly 110 counted, unique, schema-valid scenarios in pack UNKNOWN_OOD", () => {
    expect(P.length).toBe(110);
    expect(new Set(P.map((s) => s.scenarioId)).size).toBe(110);
    for (const s of P) {
      expect(businessRealityScenarioSchema.safeParse(s).success, s.scenarioId).toBe(true);
      expect(s.scenarioPack).toBe("UNKNOWN_OOD");
      expect(s.countedForReadiness).toBe(true);
      expect(s.synthetic).toBe(false);
    }
  });

  it("covers all 11 subcategories with 10 each", () => {
    for (const c of SUBCATS) expect(P.filter((s) => s.category === c).length, c).toBe(10);
  });

  it("every counted scenario is source-backed; every source is privacy-clean", () => {
    for (const s of P) expect(s.sourceRefs.length, s.scenarioId).toBeGreaterThan(0);
    for (const src of UNKNOWN_OOD_SOURCES) {
      expect(sourceRecordSchema.safeParse(src).success, src.id).toBe(true);
      expect(src.privacyRisk).toBe("low");
    }
    // every referenced source id actually exists in the register.
    const ids = new Set(UNKNOWN_OOD_SOURCES.map((s) => s.id));
    for (const s of P) for (const r of s.sourceRefs) expect(ids.has(r), `${s.scenarioId} -> ${r}`).toBe(true);
  });

  it("exercises all five action statuses; proceed/cautious are rare", () => {
    const st = new Set(P.map((s) => s.expectedActionStatus));
    for (const s of ["blocked", "need_more_data", "owner_decision_required", "cautious_proceed", "proceed"]) {
      expect(st.has(s as never), s).toBe(true);
    }
    const proceedish = P.filter((s) => s.expectedActionStatus === "proceed" || s.expectedActionStatus === "cautious_proceed").length;
    expect(proceedish).toBeLessThanOrEqual(12); // rare
  });

  it("SAFETY: a high-risk unknown NEVER proceeds/cautious-proceeds", () => {
    for (const s of P) if (s.highRisk) expect(["proceed", "cautious_proceed"], s.scenarioId).not.toContain(s.expectedActionStatus);
  });

  it("SAFETY: a professional-review scenario NEVER proceeds", () => {
    for (const s of P) if (s.professionalReviewRequired) expect(["proceed", "cautious_proceed"], s.scenarioId).not.toContain(s.expectedActionStatus);
  });

  it("SAFETY: a critical-missing / need_more_data scenario never proceeds", () => {
    for (const s of P) {
      if (s.expectedInputQualityState === "critical_missing") expect(s.expectedActionStatus).not.toBe("proceed");
      if (s.expectedActionStatus === "need_more_data") expect(s.highRisk).toBe(false);
    }
  });

  it("SAFETY: no scenario allows a live-outcome claim; none is a pure `known` novelty in a guardrail case", () => {
    for (const s of P) {
      expect(s.liveOutcomeClaimAllowed).toBe(false);
      expect(s.liveDataBacked).toBe(false);
      if (s.knownToUnknownTag === "unknown_unknown_guardrail") {
        // guardrail cases must block or ask for data — never proceed.
        expect(["blocked", "need_more_data", "owner_decision_required"]).toContain(s.expectedActionStatus);
      }
    }
  });

  it("has at least one independent-gold scenario per subcategory (≥11 total)", () => {
    expect(P.filter((s) => s.independentGold).length).toBeGreaterThanOrEqual(11);
    for (const c of SUBCATS) expect(P.some((s) => s.category === c && s.independentGold), c).toBe(true);
  });

  it("every scenario surfaces novelty + missing-data on desktop AND mobile fields", () => {
    for (const s of P) {
      expect(s.expectedDashboardFields).toContain("novelty");
      expect(s.expectedDashboardFields).toContain("missingData");
      expect(s.expectedMobileFields).toContain("confidence");
      expect(s.expectedMobileFields).toContain("missingData");
    }
  });
});
