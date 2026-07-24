/**
 * Owner Pilot Readiness Score — pure domain tests (no DB, no browser).
 * Proves: score appears; decreases with missing critical data; increases when correct data supplied;
 * does NOT increase from irrelevant data; blocks pilot-ready when low; readiness shape is mobile-usable.
 */
import { describe, it, expect } from "vitest";
import {
  assessOwnerPilotReadiness,
  type ReadinessRuntimeSummary,
  type AssessReadinessInput,
} from "@/domain/owner-mode/readiness-score";
import { requiredInputsForProfile } from "@/domain/owner-mode/owner-onboarding";
import type { OwnerInputCategory } from "@/domain/owner-mode/input-catalog";

const goodRuntime: ReadinessRuntimeSummary = {
  nextBestActionPresent: true,
  ownerManualActionCount: 2,
  delegatedWorkCount: 3,
  proofRequiredCount: 0,
  redDomains: [],
  learningApplied: true,
  realProviderBacked: true,
  runtimePathAvailable: true,
  maxReliabilityGreen: true,
};

function fullySetUp(profileType: AssessReadinessInput["profileType"], ownerRole: AssessReadinessInput["ownerRole"]): OwnerInputCategory[] {
  const req = requiredInputsForProfile(profileType, ownerRole);
  // Supply the minimum + recommended + proof, so every dimension has data.
  return Array.from(new Set<OwnerInputCategory>([...req.minimumRequired, ...req.recommended, "proof_completion"]));
}

describe("readiness-score — module contract assertions", () => {
  it("assessOwnerPilotReadiness is a function", () => { expect(typeof assessOwnerPilotReadiness).toBe("function"); });
  it("requiredInputsForProfile is a function", () => { expect(typeof requiredInputsForProfile).toBe("function"); });
  it("goodRuntime is an object", () => { expect(typeof goodRuntime).toBe("object"); });
  it("goodRuntime.nextBestActionPresent is true", () => { expect(goodRuntime.nextBestActionPresent).toBe(true); });
  it("goodRuntime.maxReliabilityGreen is true", () => { expect(goodRuntime.maxReliabilityGreen).toBe(true); });
  it("fullySetUp is a function", () => { expect(typeof fullySetUp).toBe("function"); });
  it("fullySetUp returns an array", () => { expect(Array.isArray(fullySetUp("laundry_drycleaning", "owner_operated"))).toBe(true); });
  it("fullySetUp result length is greater than 0", () => { expect(fullySetUp("laundry_drycleaning", "owner_operated").length).toBeGreaterThan(0); });
  it("assessOwnerPilotReadiness({...}) returns an object", () => { expect(typeof assessOwnerPilotReadiness({ profileType: "laundry_drycleaning", ownerRole: "owner_operated", suppliedCategories: [], runtime: goodRuntime })).toBe("object"); });
  it("assessOwnerPilotReadiness result has overallScore field", () => { expect(assessOwnerPilotReadiness({ profileType: "laundry_drycleaning", ownerRole: "owner_operated", suppliedCategories: [], runtime: goodRuntime })).toHaveProperty("overallScore"); });
  it("assessOwnerPilotReadiness result has dimensions field", () => { expect(assessOwnerPilotReadiness({ profileType: "laundry_drycleaning", ownerRole: "owner_operated", suppliedCategories: [], runtime: goodRuntime })).toHaveProperty("dimensions"); });
  it("assessOwnerPilotReadiness result has pilotReady field", () => { expect(assessOwnerPilotReadiness({ profileType: "laundry_drycleaning", ownerRole: "owner_operated", suppliedCategories: [], runtime: goodRuntime })).toHaveProperty("pilotReady"); });
  it("assessOwnerPilotReadiness result has blockers field", () => { expect(assessOwnerPilotReadiness({ profileType: "laundry_drycleaning", ownerRole: "owner_operated", suppliedCategories: [], runtime: goodRuntime })).toHaveProperty("blockers"); });
  it("assessOwnerPilotReadiness dimensions has length 10", () => { expect(assessOwnerPilotReadiness({ profileType: "laundry_drycleaning", ownerRole: "owner_operated", suppliedCategories: [], runtime: goodRuntime }).dimensions).toHaveLength(10); });
});

describe("owner pilot readiness score", () => {
  it("produces a readiness score with all ten dimensions", () => {
    const r = assessOwnerPilotReadiness({
      profileType: "laundry_drycleaning", ownerRole: "owner_operated",
      suppliedCategories: fullySetUp("laundry_drycleaning", "owner_operated"), runtime: goodRuntime,
    });
    expect(r.overallScore).toBeGreaterThan(0);
    expect(r.dimensions).toHaveLength(10);
    const keys = r.dimensions.map((d) => d.key);
    expect(keys).toContain("data_readiness");
    expect(keys).toContain("proof_readiness");
    expect(keys).toContain("learning_provenance_readiness");
  });

  it("a well-set-up business with green runtime reaches pilot-ready", () => {
    const r = assessOwnerPilotReadiness({
      profileType: "laundry_drycleaning", ownerRole: "owner_operated",
      suppliedCategories: fullySetUp("laundry_drycleaning", "owner_operated"), runtime: goodRuntime,
    });
    expect(r.blockers).toHaveLength(0);
    expect(r.pilotReady).toBe(true);
    expect(r.overallScore).toBeGreaterThanOrEqual(75);
  });

  it("readiness decreases when critical data is missing", () => {
    const full = fullySetUp("laundry_drycleaning", "owner_operated");
    const high = assessOwnerPilotReadiness({ profileType: "laundry_drycleaning", ownerRole: "owner_operated", suppliedCategories: full, runtime: goodRuntime });
    const missingCritical = full.filter((c) => c !== "revenue_sales");
    const low = assessOwnerPilotReadiness({ profileType: "laundry_drycleaning", ownerRole: "owner_operated", suppliedCategories: missingCritical, runtime: goodRuntime });
    expect(low.overallScore).toBeLessThan(high.overallScore);
    expect(low.pilotReady).toBe(false);
    expect(low.blockers.join(" ")).toMatch(/critical/i);
  });

  it("readiness increases when the correct (relevant) data is supplied", () => {
    const partial: OwnerInputCategory[] = ["expenses", "cash_debt", "proof_completion"];
    const before = assessOwnerPilotReadiness({ profileType: "laundry_drycleaning", ownerRole: "owner_operated", suppliedCategories: partial, runtime: goodRuntime });
    const after = assessOwnerPilotReadiness({ profileType: "laundry_drycleaning", ownerRole: "owner_operated", suppliedCategories: [...partial, "revenue_sales", "fixed_costs", "equipment_logs"], runtime: goodRuntime });
    expect(after.overallScore).toBeGreaterThan(before.overallScore);
  });

  it("readiness does NOT increase from irrelevant data", () => {
    // Laundry missing a relevant critical (revenue). Adding irrelevant categories must not raise it.
    const base: OwnerInputCategory[] = ["expenses", "cash_debt", "equipment_logs", "fixed_costs", "proof_completion"];
    const baseR = assessOwnerPilotReadiness({ profileType: "laundry_drycleaning", ownerRole: "owner_operated", suppliedCategories: base, runtime: goodRuntime });
    const withIrrelevant = assessOwnerPilotReadiness({
      profileType: "laundry_drycleaning", ownerRole: "owner_operated",
      suppliedCategories: [...base, "b2b_contracts", "branch_records", "inventory_stock"], runtime: goodRuntime,
    });
    expect(baseR.overallScore).toBe(withIrrelevant.overallScore); // unchanged — revenue still missing
    expect(withIrrelevant.pilotReady).toBe(false);
  });

  it("blocks pilot-ready when the max-reliability ratchet is not green, even with perfect data", () => {
    const full = fullySetUp("laundry_drycleaning", "owner_operated");
    const r = assessOwnerPilotReadiness({
      profileType: "laundry_drycleaning", ownerRole: "owner_operated",
      suppliedCategories: full, runtime: { ...goodRuntime, maxReliabilityGreen: false },
    });
    expect(r.pilotReady).toBe(false);
    expect(r.overallScore).toBeLessThanOrEqual(55);
    expect(r.blockers.join(" ")).toMatch(/max-reliability/i);
  });

  it("blocks pilot-ready when there is no proof path or no runtime path", () => {
    const full = fullySetUp("laundry_drycleaning", "owner_operated").filter((c) => c !== "proof_completion");
    const noProof = assessOwnerPilotReadiness({ profileType: "laundry_drycleaning", ownerRole: "owner_operated", suppliedCategories: full, runtime: goodRuntime });
    expect(noProof.pilotReady).toBe(false);
    expect(noProof.blockers.join(" ")).toMatch(/proof/i);

    const noRuntime = assessOwnerPilotReadiness({
      profileType: "laundry_drycleaning", ownerRole: "owner_operated",
      suppliedCategories: fullySetUp("laundry_drycleaning", "owner_operated"),
      runtime: { ...goodRuntime, runtimePathAvailable: false },
    });
    expect(noRuntime.pilotReady).toBe(false);
    expect(noRuntime.blockers.join(" ")).toMatch(/runtime/i);
  });

  it("blocks pilot-ready when the owner carries too many manual actions", () => {
    const full = fullySetUp("laundry_drycleaning", "owner_operated");
    const r = assessOwnerPilotReadiness({
      profileType: "laundry_drycleaning", ownerRole: "owner_operated",
      suppliedCategories: full, runtime: { ...goodRuntime, ownerManualActionCount: 9 },
    });
    expect(r.pilotReady).toBe(false);
    expect(r.blockers.join(" ")).toMatch(/owner/i);
  });

  it("readiness shape is mobile-usable — bounded dimensions and plain blocker strings", () => {
    const r = assessOwnerPilotReadiness({
      profileType: "housekeeping_cleaning", ownerRole: "remote_owner",
      suppliedCategories: [], runtime: { ...goodRuntime, nextBestActionPresent: false },
    });
    expect(r.dimensions.length).toBe(10);
    expect(Array.isArray(r.blockers)).toBe(true);
    for (const b of r.blockers) expect(typeof b).toBe("string");
    expect(r.overallScore).toBeLessThanOrEqual(55);
  });
});
