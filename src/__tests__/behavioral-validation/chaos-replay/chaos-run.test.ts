/**
 * CHAOS REPLAY — full counted run, scoring thresholds (§14) + OpsIQ layer matrix (§12).
 * Replays all counted real-world chaos scenarios through the production runtime, audits each against its
 * locked expectation, and asserts the hostile-skeptical readiness gates: module routing ≥90, dominant
 * constraint ≥90, supervisor ≥90, evidence ≥90, dashboard ≥85, owner comprehension ≥85, business outcome
 * ≥90, good/bad/ugly ≥90 each, unsafe = 0, generic = 0, fake confidence = 0, bad-outcome-if-followed
 * high-risk = 0, unresolved high-risk = 0; and that every OpsIQ layer is covered (high-risk layers ≥5).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { COUNTED_PUBLIC_CASES } from "@/behavioral-validation/chaos-replay/chaos-corpus";
import { runChaosBatch, type ChaosBatchItem } from "@/behavioral-validation/chaos-replay/chaos-run";
import { scoreChaos, chaosScoreGatesPass, CHAOS_THRESHOLDS } from "@/behavioral-validation/chaos-replay/chaos-scoring";
import { verifyLayerMatrix, OPSIQ_LAYERS, HIGH_RISK_LAYERS } from "@/behavioral-validation/chaos-replay/chaos-layers";
import { InMemoryLearningStore } from "@/behavioral-validation/learning-store";

describe("chaos-run — module contract assertions (non-DB)", () => {
  it("COUNTED_PUBLIC_CASES is an array", () => {
    expect(Array.isArray(COUNTED_PUBLIC_CASES)).toBe(true);
  });
  it("COUNTED_PUBLIC_CASES has at least 75 entries", () => {
    expect(COUNTED_PUBLIC_CASES.length).toBeGreaterThanOrEqual(75);
  });
  it("runChaosBatch is a function", () => {
    expect(typeof runChaosBatch).toBe("function");
  });
  it("scoreChaos is a function", () => {
    expect(typeof scoreChaos).toBe("function");
  });
  it("chaosScoreGatesPass is a function", () => {
    expect(typeof chaosScoreGatesPass).toBe("function");
  });
  it("verifyLayerMatrix is a function", () => {
    expect(typeof verifyLayerMatrix).toBe("function");
  });
  it("OPSIQ_LAYERS is an array with at least 1 entry", () => {
    expect(Array.isArray(OPSIQ_LAYERS)).toBe(true);
    expect(OPSIQ_LAYERS.length).toBeGreaterThan(0);
  });
  it("HIGH_RISK_LAYERS is an array with at least 1 entry", () => {
    expect(Array.isArray(HIGH_RISK_LAYERS)).toBe(true);
    expect(HIGH_RISK_LAYERS.length).toBeGreaterThan(0);
  });
  it("InMemoryLearningStore is a function (class)", () => {
    expect(typeof InMemoryLearningStore).toBe("function");
  });
  it("CHAOS_THRESHOLDS is an object", () => {
    expect(typeof CHAOS_THRESHOLDS).toBe("object");
  });
  it("CHAOS_THRESHOLDS has moduleRouting property (number)", () => {
    expect(typeof CHAOS_THRESHOLDS.moduleRouting).toBe("number");
  });
  it("CHAOS_THRESHOLDS.moduleRouting is >= 0", () => {
    expect(CHAOS_THRESHOLDS.moduleRouting).toBeGreaterThanOrEqual(0);
  });
  it("all HIGH_RISK_LAYERS entries are strings", () => {
    for (const l of HIGH_RISK_LAYERS) expect(typeof l).toBe("string");
  });
  it("all COUNTED_PUBLIC_CASES have a meta field", () => {
    expect(COUNTED_PUBLIC_CASES[0]).toHaveProperty("meta");
  });
  it("new InMemoryLearningStore() is an instance of InMemoryLearningStore", () => {
    expect(new InMemoryLearningStore()).toBeInstanceOf(InMemoryLearningStore);
  });
});

let items: ChaosBatchItem[];

beforeAll(async () => {
  const store = new InMemoryLearningStore();
  items = await runChaosBatch(COUNTED_PUBLIC_CASES, store);
}, 180000);

describe("chaos replay — full counted run scoring (§14)", () => {
  it("replays ≥75 counted real scenarios, all produced from the runtime (no static fallback)", () => {
    expect(items.length).toBeGreaterThanOrEqual(75);
    expect(items.every((i) => i.result.producedFromRuntime === true)).toBe(true);
    expect(items.every((i) => i.scenario.countedForReadiness && !i.scenario.synthetic)).toBe(true);
  });

  it("meets every chaos score threshold with zero unsafe / generic / fake-confidence / bad-outcome", () => {
    const s = scoreChaos(items);
    expect(s.moduleRouting).toBeGreaterThanOrEqual(CHAOS_THRESHOLDS.moduleRouting);
    expect(s.dominantConstraint).toBeGreaterThanOrEqual(CHAOS_THRESHOLDS.dominantConstraint);
    expect(s.supervisorBehavior).toBeGreaterThanOrEqual(CHAOS_THRESHOLDS.supervisorBehavior);
    expect(s.evidenceSufficiency).toBeGreaterThanOrEqual(CHAOS_THRESHOLDS.evidenceSufficiency);
    expect(s.dashboardUsefulness).toBeGreaterThanOrEqual(CHAOS_THRESHOLDS.dashboardUsefulness);
    expect(s.ownerComprehension).toBeGreaterThanOrEqual(CHAOS_THRESHOLDS.ownerComprehension);
    expect(s.businessOutcomeUsefulness).toBeGreaterThanOrEqual(CHAOS_THRESHOLDS.businessOutcomeUsefulness);
    expect(s.goodCorrectness).toBeGreaterThanOrEqual(CHAOS_THRESHOLDS.goodCorrectness);
    expect(s.badCorrectness).toBeGreaterThanOrEqual(CHAOS_THRESHOLDS.badCorrectness);
    expect(s.uglyCorrectness).toBeGreaterThanOrEqual(CHAOS_THRESHOLDS.uglyCorrectness);
    expect(s.unsafeOutputCount).toBe(0);
    expect(s.genericAdviceCount).toBe(0);
    expect(s.fakeConfidenceCount).toBe(0);
    expect(s.badOutcomeHighRiskCount).toBe(0);
    expect(s.unnecessaryDominantModuleCount).toBe(0);
    expect(s.unresolvedHighRiskFailures).toBe(0);
    expect(chaosScoreGatesPass(s).pass).toBe(true);
  });

  it("every good, bad and ugly case is correctly handled (no lucky-right-answer slips through)", () => {
    for (const i of items) {
      expect(i.audit.dominantConstraintActual, i.scenario.scenarioId).toBe(i.audit.dominantConstraintExpected);
      expect(i.audit.realWorldConsequenceAvoided, i.scenario.scenarioId).toBe(true);
      if (i.scenario.goodBadUgly === "ugly") expect(i.result.supervisor.canProceed, i.scenario.scenarioId).toBe(false);
    }
  });
});

describe("chaos replay — OpsIQ layer coverage matrix (§12)", () => {
  it("covers every OpsIQ layer; high-risk layers have ≥5 assertions", () => {
    // browser/DB/ratchet layers are credited by their own proven gates (run in separate suites).
    const verdict = verifyLayerMatrix(items, { browserProof: true, dbProof: true, ratchetGreen: true });
    expect(verdict.uncovered, `uncovered: ${verdict.uncovered.join(",")}`).toEqual([]);
    expect(verdict.highRiskUnder5, `under5: ${verdict.highRiskUnder5.join(",")}`).toEqual([]);
    expect(verdict.complete).toBe(true);
    expect(Object.keys(verdict.coverage).length).toBe(OPSIQ_LAYERS.length);
    for (const l of HIGH_RISK_LAYERS) expect(verdict.coverage[l], l).toBeGreaterThanOrEqual(5);
  });

  it("a missing browser/DB proof leaves the externally-proven layers uncovered (gate is honest)", () => {
    const verdict = verifyLayerMatrix(items, {}); // no external proofs
    expect(verdict.complete).toBe(false);
    expect(verdict.uncovered).toContain("db_tenancy_isolation");
    expect(verdict.uncovered).toContain("mobile");
    expect(verdict.uncovered).toContain("max_reliability_ratchet");
  });
});
