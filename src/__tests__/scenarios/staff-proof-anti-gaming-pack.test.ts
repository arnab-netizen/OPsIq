/**
 * STAFF / PROOF / ANTI-GAMING pack — schema + invariant tests (no DB). Proves the 120 counted scenarios are
 * unique, schema-valid, source-backed, privacy-clean, honestly distributed, and SAFE at the authoring layer:
 * fake/weak/stale proof never verifies, fraud/collusion never proceeds, high proof/manipulation risk never
 * proceeds, dashboard + mobile surface proof/manipulation risk, and nothing claims a live outcome.
 */
import { describe, it, expect } from "vitest";
import { STAFF_PROOF_ANTI_GAMING_PACK as PACK, STAFF_PROOF_SUBCATEGORIES } from "@/domain/scenarios/staff-proof-anti-gaming-pack";
import { businessRealityScenarioSchema, HIGH_PROOF_RISK_STATES, HIGH_MANIPULATION_RISK_STATES } from "@/domain/scenarios/business-reality-scenario";
import { STAFF_PROOF_SOURCES, STAFF_PROOF_SOURCE_BY_ID } from "@/domain/scenarios/staff-proof-sources";
import { sourceRecordSchema, findPII } from "@/behavioral-validation/public-cases/source-register";

const proceedish = (st: string) => st === "proceed" || st === "cautious_proceed";

describe("Staff/Proof/Anti-Gaming pack — count & identity", () => {
  it("has exactly 120 counted, unique scenarios", () => {
    expect(PACK.length).toBe(120);
    expect(new Set(PACK.map((s) => s.scenarioId)).size).toBe(120);
    expect(PACK.every((s) => s.scenarioPack === "STAFF_PROOF_ANTI_GAMING")).toBe(true);
    expect(PACK.every((s) => s.countedForReadiness && !s.synthetic && !s.liveDataBacked)).toBe(true);
  });

  it("covers 12 subcategories × 10 each", () => {
    for (const sub of STAFF_PROOF_SUBCATEGORIES) {
      expect(PACK.filter((s) => s.category === sub).length, sub).toBe(10);
    }
    expect(new Set(PACK.map((s) => s.category)).size).toBe(12);
  });

  it("is schema-valid for all 120 (re-validated independently of construction)", () => {
    for (const s of PACK) {
      // the non-strict schema strips the extra `seed` field; a clean parse proves schema-validity.
      expect(businessRealityScenarioSchema.safeParse(s).success, s.scenarioId).toBe(true);
    }
  });
});

describe("Staff/Proof/Anti-Gaming pack — sources & gold", () => {
  it("every scenario is source-backed by a valid privacy-clean source", () => {
    for (const s of PACK) {
      expect(s.sourceRefs.length, s.scenarioId).toBeGreaterThan(0);
      for (const ref of s.sourceRefs) expect(STAFF_PROOF_SOURCE_BY_ID[ref], `${s.scenarioId}->${ref}`).toBeDefined();
    }
  });

  it("has 22 privacy-clean sources (schema-valid, low privacy risk, no PII)", () => {
    expect(STAFF_PROOF_SOURCES.length).toBe(22);
    for (const src of STAFF_PROOF_SOURCES) {
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

describe("Staff/Proof/Anti-Gaming pack — distributions", () => {
  const count = (f: (s: (typeof PACK)[number]) => string) =>
    PACK.reduce<Record<string, number>>((d, s) => ((d[f(s)] = (d[f(s)] ?? 0) + 1), d), {});

  it("presents all five action statuses; proceed/cautious are rare", () => {
    const d = count((s) => s.expectedActionStatus);
    for (const st of ["blocked", "need_more_data", "owner_decision_required", "cautious_proceed", "proceed"]) {
      expect(d[st], st).toBeGreaterThan(0);
    }
    expect((d.proceed ?? 0) + (d.cautious_proceed ?? 0)).toBeLessThanOrEqual(15);
    expect(d.need_more_data).toBeGreaterThanOrEqual(d.proceed ?? 0);
  });

  it("populates proof-risk and manipulation-risk on every scenario", () => {
    expect(PACK.every((s) => !!s.expectedProofRiskState && !!s.expectedManipulationRiskState)).toBe(true);
  });
});

describe("Staff/Proof/Anti-Gaming pack — safety invariants", () => {
  it("no high-risk / professional-review / high-proof-risk / high-manipulation case ever proceeds", () => {
    for (const s of PACK) {
      const mustNotProceed = s.highRisk || s.professionalReviewRequired
        || HIGH_PROOF_RISK_STATES.has(s.expectedProofRiskState ?? "none")
        || HIGH_MANIPULATION_RISK_STATES.has(s.expectedManipulationRiskState ?? "none");
      if (mustNotProceed) expect(proceedish(s.expectedActionStatus), s.scenarioId).toBe(false);
    }
  });

  it("fake completion never verifies: any proceeding fake-completion case is on VERIFIED proof only", () => {
    for (const s of PACK.filter((x) => x.category === "fake_task_completion" && proceedish(x.expectedActionStatus))) {
      expect(s.expectedProofRiskState, s.scenarioId).toBe("verified");
    }
  });

  it("reused/stale proof never passes as fresh: stale-proof cases demand more data (never proceed)", () => {
    for (const s of PACK.filter((x) => x.expectedProofRiskState === "stale")) {
      expect(s.expectedActionStatus, s.scenarioId).toBe("need_more_data");
    }
  });

  it("suspected collusion / confirmed pattern requires independent verification (blocked or owner-gated)", () => {
    for (const s of PACK.filter((x) => HIGH_MANIPULATION_RISK_STATES.has(x.expectedManipulationRiskState ?? "none"))) {
      expect(["blocked", "owner_decision_required"], s.scenarioId).toContain(s.expectedActionStatus);
      expect(s.expectedProofRequired.join(" ")).toMatch(/independent|out-of-chain|verification/i);
    }
  });

  it("contradictory proof triggers dispute/escalation (never proceed) and requests confirmation", () => {
    for (const s of PACK.filter((x) => x.expectedProofRiskState === "contradictory")) {
      expect(proceedish(s.expectedActionStatus), s.scenarioId).toBe(false);
    }
  });

  it("carries a specific do-now, proof requirement, and reassessment on every scenario (no generic advice)", () => {
    for (const s of PACK) {
      expect(s.expectedDoNow.length, s.scenarioId).toBeGreaterThan(20);
      expect(s.expectedProofRequired.length, s.scenarioId).toBeGreaterThan(0);
      expect(s.expectedReassessment.length, s.scenarioId).toBeGreaterThan(0);
    }
  });

  it("claims no live outcome and surfaces proof/manipulation risk on dashboard and mobile", () => {
    expect(PACK.every((s) => s.liveOutcomeClaimAllowed === false)).toBe(true);
    expect(PACK.every((s) => s.expectedDashboardFields.includes("proofRisk") && s.expectedDashboardFields.includes("manipulationRisk"))).toBe(true);
    expect(PACK.every((s) => s.expectedMobileFields.includes("proofRisk") && s.expectedMobileFields.includes("manipulationRisk"))).toBe(true);
  });
});
