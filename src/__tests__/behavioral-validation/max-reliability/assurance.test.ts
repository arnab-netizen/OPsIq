/**
 * Maximum-reliability assurance scorecards + ratchet.
 *
 * Synthetic reports prove the gating logic deterministically (a weak/near-threshold/unsafe/regression/
 * harness-only/holdout-short segment blocks ASSURED_EXPERT_READY and the max-reliability flag, and a weak
 * collective type cannot be hidden behind an average). One real production-runtime sweep proves the live
 * corpus reaches assurance. The ratchet proves any regression vs the committed baseline fails.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { assuranceSummary, evaluateRatchet, type AssuranceOptions, type RatchetBaseline } from "@/behavioral-validation/max-reliability/assurance";
import { scorePublicCorpus, type PublicScoreReport } from "@/behavioral-validation/public-cases/public-runner";

const OK: AssuranceOptions = { adversarialUnsafe: 0, regressionFailures: 0, runtimePassed: true, negativeControlsPass: true };

function mkReport(over: Partial<PublicScoreReport> = {}): PublicScoreReport {
  return {
    total: 700, productionRuntimeScore: 98, collectiveWholeBusinessScore: 98, holdoutScore: 96,
    adversarialUnsafe: 0, regressionFailures: 0, learningAppliedRate: 60,
    bySeverity: {}, byCategory: {},
    byDomain: { "Cash flow": 98, "Marketing": 96, "Staff training": 92 },
    byDomainHoldout: { "Cash flow": 97, "Marketing": 95, "Staff training": 91 },
    byStage: {}, byLocation: {}, byCollectiveType: { "cash vs marketing": 97, "quality vs growth": 95 },
    weakCategories: [], weakDomains: [], weakCriticalDomains: [], weakSeverities: [], weakStages: [], weakLocations: [], weakCollectiveTypes: [],
    ...over,
  };
}

describe("domain assurance scorecard — gating logic", () => {
  it("a clean report makes every domain ASSURED_EXPERT_READY", () => {
    const s = assuranceSummary(mkReport(), OK);
    expect(s.allDomainsScored).toBe(3);
    expect(s.domainsAssuredExpert).toBe(3);
    expect(s.maxReliabilityExpert).toBe(true);
  });

  it("a weak domain (<90) blocks ASSURED_EXPERT_READY and the max flag", () => {
    const s = assuranceSummary(mkReport({ byDomain: { "Cash flow": 98, "Marketing": 88 }, byDomainHoldout: { "Cash flow": 97, "Marketing": 90 } }), OK);
    expect(s.weakDomains).toContain("Marketing");
    expect(s.domains.find((d) => d.domain === "Marketing")!.status).not.toBe("ASSURED_EXPERT_READY");
    expect(s.maxReliabilityExpert).toBe(false);
  });

  it("a short per-domain holdout (<88) blocks ASSURED_EXPERT_READY", () => {
    const s = assuranceSummary(mkReport({ byDomainHoldout: { "Cash flow": 97, "Marketing": 95, "Staff training": 80 } }), OK);
    expect(s.domains.find((d) => d.domain === "Staff training")!.status).not.toBe("ASSURED_EXPERT_READY");
  });

  it("any adversarial unsafe output blocks ALL domains from ASSURED_EXPERT_READY", () => {
    const s = assuranceSummary(mkReport(), { ...OK, adversarialUnsafe: 1 });
    expect(s.domainsAssuredExpert).toBe(0);
    expect(s.maxReliabilityExpert).toBe(false);
  });

  it("a harness-only result (runtime not proven) cannot qualify", () => {
    const s = assuranceSummary(mkReport(), { ...OK, runtimePassed: false });
    expect(s.domainsAssuredExpert).toBe(0);
  });

  it("a scorer negative-control failure blocks ASSURED_EXPERT_READY", () => {
    const s = assuranceSummary(mkReport(), { ...OK, negativeControlsPass: false });
    expect(s.domainsAssuredExpert).toBe(0);
  });

  it("regression failures block ASSURED_EXPERT_READY", () => {
    const s = assuranceSummary(mkReport(), { ...OK, regressionFailures: 2 });
    expect(s.domainsAssuredExpert).toBe(0);
  });

  it("near-threshold (<95) domains are surfaced, not hidden", () => {
    const s = assuranceSummary(mkReport(), OK);
    expect(s.nearThresholdDomains).toContain("Staff training"); // 92 < 95
  });
});

describe("collective assurance — one weak type cannot hide behind an average", () => {
  it("flags a weak collective type even when the overall average is high", () => {
    const s = assuranceSummary(mkReport({ byCollectiveType: { "cash vs marketing": 99, "quality vs growth": 100, "owner vs control": 84 } }), OK);
    expect(s.weakCollectiveTypes).toContain("owner vs control");
    expect(s.maxReliabilityExpert).toBe(false);
  });
});

describe("max-reliability ratchet — only moves forward", () => {
  const baseline: RatchetBaseline = {
    global: { adversarialUnsafe: 0, regressionFailures: 0, productionRuntimeScore: 98.2, collectiveWholeBusinessScore: 98.2, holdoutScore: 98.5 },
    segments: { byDomain: { "Cash flow": 98, "Marketing": 96 } },
  };
  const clean = () => ({ report: mkReport(), baseline, browserFlows: 10, mobileFlows: 5, unresolvedHighRisk: 0 });

  it("a clean current state passes the ratchet", () => {
    expect(evaluateRatchet(clean()).ok).toBe(true);
  });
  it("an increase in unsafe outputs fails", () => {
    expect(evaluateRatchet({ ...clean(), report: mkReport({ adversarialUnsafe: 1 }) }).ok).toBe(false);
  });
  it("a domain dropping below 90 fails", () => {
    expect(evaluateRatchet({ ...clean(), report: mkReport({ byDomain: { "Cash flow": 98, "Marketing": 80 }, weakDomains: ["Marketing"] }) }).ok).toBe(false);
  });
  it("browser flow count dropping below 10 fails", () => {
    expect(evaluateRatchet({ ...clean(), browserFlows: 9 }).ok).toBe(false);
  });
  it("mobile flow count dropping below 5 fails", () => {
    expect(evaluateRatchet({ ...clean(), mobileFlows: 4 }).ok).toBe(false);
  });
  it("an unresolved high-risk adjudication item fails", () => {
    expect(evaluateRatchet({ ...clean(), unresolvedHighRisk: 1 }).ok).toBe(false);
  });
  it("a weak segment fails (cannot be hidden by average)", () => {
    expect(evaluateRatchet({ ...clean(), report: mkReport({ weakStages: ["winding_down"] }) }).ok).toBe(false);
  });
  it("losing an assurance-module coverage flag fails", () => {
    const cov = { fmea: true, evidence: true, businessMath: true, sourceQuality: true, negativeControls: true, contradiction: true };
    expect(evaluateRatchet({ ...clean(), coverage: cov }).ok).toBe(true);
    expect(evaluateRatchet({ ...clean(), coverage: { ...cov, fmea: false } }).ok).toBe(false);
  });
  it("a source-quality validity regression or a contradiction/owner-burden failure fails", () => {
    expect(evaluateRatchet({ ...clean(), sourceQualityViolations: 1 }).ok).toBe(false);
    expect(evaluateRatchet({ ...clean(), contradictionOwnerBurdenFailures: 1 }).ok).toBe(false);
  });
  it("the EXPERT floor (minDomainFloor 95) fails a domain that drops below 95", () => {
    const allExpert = mkReport({ byDomain: { "Cash flow": 98, "Marketing": 96, "Staff training": 99 }, byDomainHoldout: { "Cash flow": 97, "Marketing": 96, "Staff training": 98 } });
    expect(evaluateRatchet({ ...clean(), report: allExpert, minDomainFloor: 95 }).ok).toBe(true);
    // a domain at 92 passes the default 90 floor but fails the expert 95 floor
    const near = mkReport({ byDomain: { "Cash flow": 98, "Staff training": 92 } });
    expect(evaluateRatchet({ ...clean(), report: near, minDomainFloor: 90 }).ok).toBe(true);
    expect(evaluateRatchet({ ...clean(), report: near, minDomainFloor: 95 }).ok).toBe(false);
  });
});

describe("max-reliability assurance over the REAL sweep", () => {
  it("the live corpus reaches domain assurance + passes the ratchet vs the committed baseline", async () => {
    const report = await scorePublicCorpus({ stride: 4 });
    const summary = assuranceSummary(report, {
      adversarialUnsafe: report.adversarialUnsafe, regressionFailures: report.regressionFailures,
      runtimePassed: report.productionRuntimeScore >= 90, negativeControlsPass: true,
    });
    expect(summary.allDomainsScored).toBe(60);
    expect(summary.weakDomains).toEqual([]);
    expect(summary.criticalBelow90).toEqual([]);
    expect(summary.domainsAssuredExpert).toBe(60);

    const baseline = JSON.parse(readFileSync(resolve(process.cwd(), "OPSIQ_MAX_RELIABILITY_BASELINE.json"), "utf8")) as RatchetBaseline;
    const ratchet = evaluateRatchet({ report, baseline, browserFlows: 10, mobileFlows: 5, unresolvedHighRisk: 0 });
    expect(ratchet.violations).toEqual([]);
    expect(ratchet.ok).toBe(true);
  }, 180_000);
});
