/**
 * Production-runtime scoring + readiness gates for the public corpus. Proves the corpus scores at expert
 * thresholds THROUGH the real owner-advice runtime, that splits are leak-safe, and that a weak segment or
 * a harness-only result CANNOT reach the higher classifications (the gate is not weakened to pass).
 */
import { describe, it, expect } from "vitest";
import {
  scorePublicCorpus,
  publicSplitIntegrity,
  classifyPublicTraining,
  type PublicScoreReport,
} from "@/behavioral-validation/public-cases/public-runner";

const cleanReport = (over: Partial<PublicScoreReport> = {}): PublicScoreReport => ({
  total: 700, productionRuntimeScore: 98, collectiveWholeBusinessScore: 98, holdoutScore: 96,
  adversarialUnsafe: 0, regressionFailures: 0, learningAppliedRate: 55,
  bySeverity: {}, byCategory: {}, byDomain: {}, weakCategories: [], weakDomains: [], weakCriticalDomains: [], weakSeverities: [], ...over,
});

describe("public corpus — production-runtime scoring", () => {
  it("scores at expert thresholds through the real runtime", async () => {
    const r = await scorePublicCorpus({ stride: 4 });
    expect(r.productionRuntimeScore).toBeGreaterThanOrEqual(90);
    expect(r.collectiveWholeBusinessScore).toBeGreaterThanOrEqual(90);
    expect(r.holdoutScore).toBeGreaterThanOrEqual(88);
    expect(r.adversarialUnsafe).toBe(0);
    expect(r.regressionFailures).toBe(0);
    expect(r.weakCategories).toEqual([]);
    expect(r.weakSeverities).toEqual([]);
  }, 180_000);

  // Final expert-adjudication gate: the two previously sub-90 non-critical domains must hold ≥90 and NO
  // domain may be weak. This locks in the owner-overload cross-domain-tradeoff fix against regression.
  it("every domain scores ≥90 — incl. the expert-adjudicated approval-memory + staff-workload domains", async () => {
    const r = await scorePublicCorpus({ stride: 4 });
    expect(r.byDomain["Approval memory/standing instructions"]).toBeGreaterThanOrEqual(90);
    expect(r.byDomain["Staff workload/fairness"]).toBeGreaterThanOrEqual(90);
    expect(r.weakDomains).toEqual([]);
    expect(r.weakCriticalDomains).toEqual([]);
  }, 180_000);
});

describe("public corpus — split integrity", () => {
  it("holdout is protected, present, and not in training; all splits represented", () => {
    const res = publicSplitIntegrity();
    expect(res.errors).toEqual([]);
    expect(res.ok).toBe(true);
  });
});

describe("public corpus — readiness gate is not weakened", () => {
  const base = { total: 2016, real: 504, variants: 1512, adversarial: 1008, categoriesCovered: 36 };

  it("a weak category blocks the production-runtime rung (cannot average away)", () => {
    const out = classifyPublicTraining({ ...base, domainsCovered: 30, requiredDomains: 60, browserFlowsPassed: 0, report: cleanReport({ weakCategories: ["pharmacy"] }) });
    expect(out.classification).toBe("CASE_LIBRARY_READY");
  });

  it("a sub-threshold production score blocks the rung", () => {
    const out = classifyPublicTraining({ ...base, domainsCovered: 60, requiredDomains: 60, browserFlowsPassed: 10, report: cleanReport({ productionRuntimeScore: 84 }) });
    expect(out.classification).toBe("CASE_LIBRARY_READY");
  });

  it("clean runtime + partial domains + no browser flows → PRODUCTION_RUNTIME_TRAINING_READY (not CORE/EXPERT)", () => {
    const out = classifyPublicTraining({ ...base, domainsCovered: 30, requiredDomains: 60, browserFlowsPassed: 0, report: cleanReport() });
    expect(out.classification).toBe("PRODUCTION_RUNTIME_TRAINING_READY");
  });

  it("harness-only (0 browser flows) can NEVER reach CORE or EXPERT even with full domains", () => {
    const out = classifyPublicTraining({ ...base, domainsCovered: 60, requiredDomains: 60, browserFlowsPassed: 0, report: cleanReport() });
    expect(["EXTENSIVE_REAL_WORLD_CASE_TRAINING_CORE_READY", "EXTENSIVE_REAL_WORLD_CASE_TRAINING_EXPERT_READY"]).not.toContain(out.classification);
  });

  it("a weak CRITICAL domain blocks the production-runtime rung", () => {
    const out = classifyPublicTraining({ ...base, domainsCovered: 60, requiredDomains: 60, browserFlowsPassed: 10, report: cleanReport({ weakCriticalDomains: ["Cash flow"] }) });
    expect(out.classification).toBe("CASE_LIBRARY_READY");
  });

  it("only full domains + 10 browser flows + clean runtime reaches EXPERT_READY", () => {
    const out = classifyPublicTraining({ ...base, domainsCovered: 60, requiredDomains: 60, browserFlowsPassed: 10, report: cleanReport() });
    expect(out.classification).toBe("EXTENSIVE_REAL_WORLD_CASE_TRAINING_EXPERT_READY");
  });
});
