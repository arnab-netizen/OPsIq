/**
 * Chaos scenario SCHEMA (§5) + GOOD/BAD/UGLY COVERAGE (§4) — pure, no DB, no browser.
 * Proves every counted scenario is schema-complete and source-backed, and that the counted corpus meets
 * the readiness coverage minimums (≥75 across ≥15 categories, good/bad/ugly per category, every mandatory
 * cross-cutting chaos type). Synthetic / unsourced / no-chaos scenarios are rejected.
 */
import { describe, it, expect } from "vitest";
import { chaosScenarioSchema, type ChaosScenario } from "@/behavioral-validation/chaos-replay/chaos-schema";
import {
  COUNTED_CHAOS_SCENARIOS, COUNTED_PUBLIC_CASES, SYNTHETIC_EDGE_SCENARIOS,
  REQUIRED_CATEGORIES, computeCoverage,
} from "@/behavioral-validation/chaos-replay/chaos-corpus";

const counted = COUNTED_CHAOS_SCENARIOS;
const cov = computeCoverage();

describe("chaos scenario schema (§5)", () => {
  it("validates every counted scenario as schema-complete", () => {
    for (const s of counted) expect(() => chaosScenarioSchema.parse(s)).not.toThrow();
    expect(counted.length).toBeGreaterThan(0);
  });

  const REQUIRED_FIELDS: Array<keyof ChaosScenario> = [
    "expectedModules", "expectedNonDominantModules", "expectedDominantConstraint", "expectedRejectedTemptingAction",
    "goodBadUgly", "expectedDashboardFields", "expectedProofReassessment", "expected7DaySignal", "expected30DaySignal",
    "expectedRealWorldConsequenceIfWrong",
  ];
  for (const f of REQUIRED_FIELDS) {
    it(`rejects a scenario missing required field: ${String(f)}`, () => {
      const broken = { ...counted[0] } as Record<string, unknown>;
      delete broken[f as string];
      expect(() => chaosScenarioSchema.parse(broken)).toThrow();
    });
  }

  it("every counted scenario carries a real sourceRef, ≥1 source limitation, a tempting wrong action and a real-world consequence", () => {
    for (const s of counted) {
      expect(s.sourceRefs.length).toBeGreaterThan(0);
      expect(s.sourceRefs.every((r) => /^SRC-/.test(r))).toBe(true);
      expect(s.sourceLimitations.length).toBeGreaterThan(0);
      expect(s.temptingWrongAction.length).toBeGreaterThan(3);
      expect(s.missingData.length).toBeGreaterThan(0);
      expect(s.expectedRealWorldConsequenceIfWrong.length).toBeGreaterThan(8);
    }
  });
});

describe("good/bad/ugly coverage (§4)", () => {
  it("runs ≥75 counted real scenarios across ≥15 categories", () => {
    expect(cov.countedTotal).toBeGreaterThanOrEqual(75);
    expect(cov.categories.length).toBeGreaterThanOrEqual(15);
    for (const cat of REQUIRED_CATEGORIES) expect(cov.categories).toContain(cat);
  });

  it("every category has ≥5 cases with ≥1 good, ≥2 bad, ≥2 ugly", () => {
    for (const [cat, c] of Object.entries(cov.perCategory)) {
      expect(c.total, `${cat} total`).toBeGreaterThanOrEqual(5);
      expect(c.good, `${cat} good`).toBeGreaterThanOrEqual(1);
      expect(c.bad, `${cat} bad`).toBeGreaterThanOrEqual(2);
      expect(c.ugly, `${cat} ugly`).toBeGreaterThanOrEqual(2);
    }
  });

  it("meets every mandatory cross-cutting chaos-type minimum", () => {
    const t = cov.chaosTypeCounts;
    expect(COUNTED_PUBLIC_CASES.filter((p) => p.meta.collective).length, "collective").toBeGreaterThanOrEqual(20);
    expect(t.owner_pressure_bad_idea ?? 0, "owner-pressure").toBeGreaterThanOrEqual(15);
    expect(t.missing_data_fake_confidence ?? 0, "missing-data").toBeGreaterThanOrEqual(15);
    expect(t.novelty_ood ?? 0, "novelty").toBeGreaterThanOrEqual(10);
    expect(t.stop_reject_pause ?? 0, "stop/reject/pause").toBeGreaterThanOrEqual(15);
    expect(t.shutdown_pivot_stoploss ?? 0, "shutdown").toBeGreaterThanOrEqual(10);
    expect(t.high_revenue_bad_business ?? 0, "high-revenue-bad").toBeGreaterThanOrEqual(10);
    expect(t.manipulation_collusion_fraud ?? 0, "manipulation").toBeGreaterThanOrEqual(10);
  });

  it("covers cyber/payment/data-loss, compliance, vendor, and proof/fraud chaos types", () => {
    const t = cov.chaosTypeCounts;
    expect(t.cyber_payment_data_loss ?? 0).toBeGreaterThanOrEqual(1);
    expect(t.compliance_professional_boundary ?? 0).toBeGreaterThanOrEqual(1);
    expect(t.vendor_supplier_disruption ?? 0).toBeGreaterThanOrEqual(1);
    expect(t.proof_fraud_completion ?? 0).toBeGreaterThanOrEqual(1);
  });
});

describe("synthetic / negative gates (§3, §4)", () => {
  it("a synthetic scenario is never counted and is excluded from coverage", () => {
    for (const s of SYNTHETIC_EDGE_SCENARIOS) {
      expect(s.synthetic).toBe(true);
      expect(s.countedForReadiness).toBe(false);
    }
    expect(computeCoverage([...counted, ...SYNTHETIC_EDGE_SCENARIOS]).countedTotal).toBe(cov.countedTotal);
  });

  it("the schema refuses a synthetic scenario marked counted", () => {
    const bad = { ...SYNTHETIC_EDGE_SCENARIOS[0], countedForReadiness: true };
    expect(() => chaosScenarioSchema.parse(bad)).toThrow();
  });

  it("the schema refuses a counted scenario with no sourceRef", () => {
    const bad = { ...counted[0], sourceRefs: [] };
    expect(() => chaosScenarioSchema.parse(bad)).toThrow();
  });
});
