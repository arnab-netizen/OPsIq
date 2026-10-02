/**
 * Owner Decision candidate-set diagnostics — measurement only. Pure/no DB.
 * Proves the analyzer reports saturation, same-class / same-severity collisions and the real comparator's
 * deciding factor, without mutating candidates, reordering input, or changing the elected decision.
 * Any statistics here are TEST/FIXTURE measurements, not real-customer incidence and not a calibration.
 */
import { describe, it, expect } from "vitest";
import {
  analyzeOwnerDecisionCandidateSet,
  summarizeOwnerDecisionReports,
  priorityScoreBucket,
  PRIORITY_SCORE_BUCKETS,
} from "@/domain/owner-spine/owner-decision-diagnostics";
import {
  rankOwnerCandidates,
  resolveOwnerDecision,
  compareOwnerCandidatesWithFactor,
  type OwnerDecisionCandidate,
  type ResolveOwnerDecisionInput,
} from "@/domain/owner-spine/owner-decision";
import { NO_CHANGE_FACTS } from "@/__tests__/owner-decision/change-facts-fixture";

const NOW = new Date("2026-09-27T10:00:00.000Z");

function cand(id: string, over: Partial<OwnerDecisionCandidate> = {}): OwnerDecisionCandidate {
  return {
    candidateId: `domain_action:${id}`,
    businessId: "biz-1",
    workspaceId: "ws-1",
    source: "domain_action",
    domain: "finance",
    sourceId: id,
    priorityClass: "PROFIT_LOSS",
    findingCode: `CODE_${id}`,
    findingId: null,
    title: `SECRET TITLE ${id}`,
    explanation: `SECRET EXPLANATION ${id}`,
    severity: "high",
    priorityScore: 60,
    expectedImpactScore: 50,
    confidence: 0.8,
    effortScore: 40,
    status: "proposed",
    ownerActionRequired: true,
    blocking: false,
    evidence: [`SECRET EVIDENCE ${id}`],
    missingData: [`SECRET MISSING ${id}`],
    verificationMetric: null,
    evidenceAsOf: null,
    stale: false,
    exclusion: null,
    targetRoute: "/owner/finance",
    ...over,
  };
}

const group = (r: ReturnType<typeof analyzeOwnerDecisionCandidateSet>) => r.sameClassSameSeverityGroups[0];

describe("buckets", () => {
  it.each([[0, "0-24"], [24, "0-24"], [25, "25-49"], [49, "25-49"], [50, "50-74"], [74, "50-74"], [75, "75-89"], [89, "75-89"], [90, "90-94"], [94, "90-94"], [95, "95-99"], [99, "95-99"], [100, "100"], [250, "100"]])(
    "%s → %s",
    (p, b) => expect(priorityScoreBucket(p)).toBe(b)
  );
  it("bucket list is the documented one", () => {
    expect([...PRIORITY_SCORE_BUCKETS]).toEqual(["0-24", "25-49", "50-74", "75-89", "90-94", "95-99", "100"]);
  });
});

describe("population", () => {
  it("1. no candidates", () => {
    const r = analyzeOwnerDecisionCandidateSet([]);
    expect(r.totalCandidates).toBe(0);
    expect(r.saturation.ceilingCount).toBe(0);
    expect(r.saturation.ceilingPercent).toBe(0);
    expect(r.sameClassGroups).toEqual([]);
    expect(r.sameClassSameSeverityGroups).toEqual([]);
  });
  it("2. one candidate forms no group", () => {
    const r = analyzeOwnerDecisionCandidateSet([cand("a")]);
    expect(r.eligibleCandidates).toBe(1);
    expect(r.sameClassGroups).toEqual([]);
    expect(r.byDomain).toEqual({ finance: 1 });
    expect(r.byClass).toEqual({ PROFIT_LOSS: 1 });
    expect(r.bySeverity).toEqual({ high: 1 });
  });
  it("3. different classes form no same-class group", () => {
    const r = analyzeOwnerDecisionCandidateSet([cand("a", { priorityClass: "SURVIVAL_CASH" }), cand("b", { priorityClass: "PROFIT_LOSS" }), cand("c", { priorityClass: "GROWTH_OPPORTUNITY", domain: "sales" })]);
    expect(r.sameClassGroups).toEqual([]);
    expect(r.byDomain).toEqual({ finance: 2, sales: 1 });
  });
  it("excluded candidates are counted but not analyzed; missing severity is its own key", () => {
    const r = analyzeOwnerDecisionCandidateSet([cand("a"), cand("b", { exclusion: "completed" }), cand("c", { severity: null })]);
    expect(r.totalCandidates).toBe(3);
    expect(r.eligibleCandidates).toBe(2);
    expect(r.excludedCandidates).toBe(1);
    expect(r.bySeverity).toEqual({ high: 1, none: 1 });
  });
  it("4. same class, different severity: a same-class group but no same-severity group", () => {
    const r = analyzeOwnerDecisionCandidateSet([cand("a", { severity: "critical" }), cand("b", { severity: "low", domain: "cashflow" })]);
    expect(r.sameClassGroups).toHaveLength(1);
    expect(r.sameClassGroups[0].severitiesDiffer).toBe(true);
    expect(r.sameClassGroups[0].crossDomain).toBe(true);
    expect(r.sameClassSameSeverityGroups).toEqual([]);
  });
});

describe("winner factor (the real comparator's deciding criterion)", () => {
  it("5. same class + severity, different priority → priority", () => {
    const g = group(analyzeOwnerDecisionCandidateSet([cand("a", { priorityScore: 70 }), cand("b", { priorityScore: 80 })]));
    expect(g.winnerFactor).toBe("priority");
    expect(g.winnerCandidateId).toBe("domain_action:b");
  });
  it("6. equal priority, different impact → impact", () => {
    const g = group(analyzeOwnerDecisionCandidateSet([cand("a", { expectedImpactScore: 60 }), cand("b", { expectedImpactScore: 70 })]));
    expect(g.winnerFactor).toBe("impact");
    expect(g.winnerCandidateId).toBe("domain_action:b");
  });
  it("7. equal priority + impact, different confidence → confidence", () => {
    const g = group(analyzeOwnerDecisionCandidateSet([cand("a", { confidence: 0.6 }), cand("b", { confidence: 0.9 })]));
    expect(g.winnerFactor).toBe("confidence");
    expect(g.winnerCandidateId).toBe("domain_action:b");
  });
  it("8. equal through confidence, different effort → effort (lower effort wins)", () => {
    const g = group(analyzeOwnerDecisionCandidateSet([cand("a", { effortScore: 70 }), cand("b", { effortScore: 20 })]));
    expect(g.winnerFactor).toBe("effort");
    expect(g.winnerCandidateId).toBe("domain_action:b");
  });
  it("9. everything numerically equal → deterministic identifier; flagged numericallyIdentical", () => {
    const g = group(analyzeOwnerDecisionCandidateSet([cand("b"), cand("a")]));
    expect(g.winnerFactor).toBe("identifier");
    expect(g.numericallyIdentical).toBe(true);
    expect(g.winnerFindingCode).toBe("CODE_a");
  });
  it("a current finding precedes a refresh of out-of-date figures at equal class and severity", () => {
    const g = group(analyzeOwnerDecisionCandidateSet([cand("r", { source: "evidence_refresh", priorityScore: 100 }), cand("c", { priorityScore: 10 })]));
    expect(g.winnerFactor).toBe("current_evidence");
    expect(g.winnerCandidateId).toBe("domain_action:c");
  });
  it("every reported winner matches the comparator's own order", () => {
    const set = [cand("a", { priorityScore: 100, confidence: 0.5 }), cand("b", { priorityScore: 100, confidence: 0.9 }), cand("c", { priorityScore: 99 })];
    const g = group(analyzeOwnerDecisionCandidateSet(set));
    const expected = [...set].sort((x, y) => compareOwnerCandidatesWithFactor(x, y)[0]).map((c) => c.candidateId);
    expect(g.ranked.map((m) => m.candidateId)).toEqual(expected);
  });
});

describe("saturation", () => {
  it("10. two candidates both at 100 are a saturated collision resolved by a later factor", () => {
    const r = analyzeOwnerDecisionCandidateSet([cand("a", { priorityScore: 100, expectedImpactScore: 90 }), cand("b", { priorityScore: 100, expectedImpactScore: 70 })]);
    const g = group(r);
    expect(r.saturation.ceilingCount).toBe(2);
    expect(r.saturation.ceilingPercent).toBe(100);
    expect(g.saturatedCollision).toBe(true);
    expect(g.allSaturated).toBe(true);
    expect(g.priorityScoresEqual).toBe(true);
    expect(g.winnerFactor).toBe("impact");
    expect(g.saturationResolvedByLaterFactor).toBe(true);
    expect(g.numericallyIdentical).toBe(false);
  });
  it("11. three or more at 100", () => {
    const r = analyzeOwnerDecisionCandidateSet([cand("a", { priorityScore: 100 }), cand("b", { priorityScore: 100, expectedImpactScore: 60 }), cand("c", { priorityScore: 100, expectedImpactScore: 70 })]);
    expect(group(r).saturatedCount).toBe(3);
    expect(group(r).adjacentFactors).toEqual(["impact", "impact"]);
    expect(r.saturation.buckets["100"]).toBe(3);
  });
  it("12. a saturated same-class/same-severity group across domains", () => {
    const r = analyzeOwnerDecisionCandidateSet([cand("a", { priorityScore: 100, domain: "finance" }), cand("b", { priorityScore: 100, domain: "cashflow", confidence: 0.95 })]);
    expect(group(r).crossDomain).toBe(true);
    expect(group(r).saturatedCollision).toBe(true);
    expect(group(r).winnerFactor).toBe("confidence");
  });
  it("13. saturated candidates in different classes are not a collision", () => {
    const r = analyzeOwnerDecisionCandidateSet([cand("a", { priorityScore: 100, priorityClass: "SURVIVAL_CASH" }), cand("b", { priorityScore: 100, priorityClass: "PROFIT_LOSS" })]);
    expect(r.saturation.ceilingCount).toBe(2);
    expect(r.ceilingByClass).toEqual({ PROFIT_LOSS: 1, SURVIVAL_CASH: 1 });
    expect(r.sameClassSameSeverityGroups).toEqual([]);
  });
  it("14. 99 vs 100: not a saturated collision; priority decides", () => {
    const g = group(analyzeOwnerDecisionCandidateSet([cand("a", { priorityScore: 99 }), cand("b", { priorityScore: 100 })]));
    expect(g.saturatedCollision).toBe(false);
    expect(g.anySaturated).toBe(true);
    expect(g.allSaturated).toBe(false);
    expect(g.winnerFactor).toBe("priority");
    expect(g.winnerCandidateId).toBe("domain_action:b");
  });
  it("a raw score above 100 is read exactly as the comparator reads it (clamped)", () => {
    const r = analyzeOwnerDecisionCandidateSet([cand("a", { priorityScore: 480 }), cand("b", { priorityScore: 99.6 })]);
    expect(r.saturation.ceilingCount).toBe(2);
    expect(group(r).saturatedCollision).toBe(true);
  });
  it("100-vs-100 is distinguishable from a genuine complete tie", () => {
    const sat = group(analyzeOwnerDecisionCandidateSet([cand("a", { priorityScore: 100, expectedImpactScore: 90 }), cand("b", { priorityScore: 100, expectedImpactScore: 60 })]));
    const tie = group(analyzeOwnerDecisionCandidateSet([cand("a", { priorityScore: 100 }), cand("b", { priorityScore: 100 })]));
    expect(sat.saturatedCollision && !sat.numericallyIdentical).toBe(true);
    expect(tie.saturatedCollision && tie.numericallyIdentical).toBe(true);
    expect(tie.winnerFactor).toBe("identifier");
  });
});

describe("hostile fixture: four candidates, same class, same severity, all priority 100", () => {
  // a: impact 90 → wins on impact. b/c: impact 70, b has higher confidence → confidence. c/d: equal through
  // confidence; c has lower effort → effort. e/f tied entirely → identifier.
  const set = [
    cand("d", { priorityScore: 100, expectedImpactScore: 70, confidence: 0.7, effortScore: 60, domain: "marketing" }),
    cand("c", { priorityScore: 100, expectedImpactScore: 70, confidence: 0.7, effortScore: 30, domain: "sales" }),
    cand("b", { priorityScore: 100, expectedImpactScore: 70, confidence: 0.9, domain: "cashflow" }),
    cand("a", { priorityScore: 100, expectedImpactScore: 90, domain: "finance" }),
  ];
  it("identifies each deciding factor and the true winner without changing it", () => {
    const before = JSON.stringify(set);
    const g = group(analyzeOwnerDecisionCandidateSet(set));
    expect(JSON.stringify(set)).toBe(before);
    expect(g.size).toBe(4);
    expect(g.allSaturated).toBe(true);
    expect(g.crossDomain).toBe(true);
    expect(g.ranked.map((m) => m.candidateId)).toEqual(["domain_action:a", "domain_action:b", "domain_action:c", "domain_action:d"]);
    expect(g.adjacentFactors).toEqual(["impact", "confidence", "effort"]);
    expect(g.winnerFactor).toBe("impact");
    expect(g.winnerCandidateId).toBe(rankOwnerCandidates(set)[0].candidateId);
  });
  it("two candidates tied until the deterministic identifier", () => {
    const tied = [...set, cand("e", { priorityScore: 100, expectedImpactScore: 70, confidence: 0.7, effortScore: 30, domain: "sales" })];
    const g = group(analyzeOwnerDecisionCandidateSet(tied));
    expect(g.adjacentFactors).toContain("identifier");
    expect(g.winnerCandidateId).toBe(rankOwnerCandidates(tied)[0].candidateId);
  });
});

describe("non-interference", () => {
  const set = [cand("b", { priorityScore: 100 }), cand("a", { priorityScore: 100, domain: "cashflow" }), cand("c", { priorityClass: "SURVIVAL_CASH", priorityScore: 20 })];
  it("15/16. analysis neither mutates nor reorders candidates and leaves the elected decision identical", () => {
    const snapshot = JSON.stringify(set);
    const order = set.map((c) => c.candidateId);
    const input: ResolveOwnerDecisionInput = {
      businessId: "biz-1", workspaceId: "ws-1", candidates: set, diagnosedDomains: ["finance"], staleDomains: [], strategy: null,
      dataSufficiency: { status: "sufficient", lowestDataConfidenceScore: 90, lowConfidenceDomains: [], missingCriticalData: [] },
      reassessment: { days: 14, reason: "test" }, changeFacts: NO_CHANGE_FACTS, now: NOW,
    };
    const decisionBefore = JSON.stringify(resolveOwnerDecision(input));
    analyzeOwnerDecisionCandidateSet(set);
    expect(JSON.stringify(set)).toBe(snapshot);
    expect(set.map((c) => c.candidateId)).toEqual(order);
    expect(JSON.stringify(resolveOwnerDecision(input))).toBe(decisionBefore);
    expect(Object.isFrozen(set)).toBe(false);
  });
  it("works on a frozen array of frozen candidates (cannot mutate)", () => {
    const frozen = Object.freeze(set.map((c) => Object.freeze({ ...c })));
    expect(() => analyzeOwnerDecisionCandidateSet(frozen)).not.toThrow();
  });
  it("17. deterministic across repeated runs and input orderings", () => {
    const a = JSON.stringify(analyzeOwnerDecisionCandidateSet(set));
    expect(JSON.stringify(analyzeOwnerDecisionCandidateSet(set))).toBe(a);
    expect(JSON.stringify(analyzeOwnerDecisionCandidateSet([...set].reverse()))).toBe(a);
  });
  it("18. no free text (title, explanation, evidence, missing data) appears in the report", () => {
    const text = JSON.stringify(analyzeOwnerDecisionCandidateSet(set));
    expect(text).not.toMatch(/SECRET/);
  });
});

describe("TEST/FIXTURE MEASUREMENT summary (not production incidence, not a calibration)", () => {
  const sets = [
    [cand("a", { priorityScore: 100 }), cand("b", { priorityScore: 100, expectedImpactScore: 80 })],
    [cand("c", { priorityScore: 100, severity: "critical" }), cand("d", { priorityScore: 60, severity: "low" })],
    [cand("e", { priorityScore: 70, domain: "sales" }), cand("f", { priorityScore: 75, domain: "marketing" })],
    [cand("g", { priorityScore: 100, priorityClass: "SURVIVAL_CASH" })],
  ].map((s) => analyzeOwnerDecisionCandidateSet(s));
  it("aggregates counts and winner factors", () => {
    const sum = summarizeOwnerDecisionReports(sets);
    expect(sum.candidateSets).toBe(4);
    expect(sum.totalCandidates).toBe(7);
    expect(sum.ceilingCount).toBe(4);
    expect(sum.ceilingPercent).toBe(57.14);
    expect(sum.sameClassGroups).toBe(3);
    expect(sum.sameClassSameSeverityGroups).toBe(2);
    expect(sum.sameClassSameSeverityCrossDomainGroups).toBe(1);
    expect(sum.saturatedCollisionGroups).toBe(1);
    expect(sum.winnerFactorCounts).toEqual({ impact: 1, priority: 1 });
    expect(sum.saturatedCollisionWinnerFactorCounts).toEqual({ impact: 1 });
    expect(sum.saturationResolvedByLaterFactorGroups).toBe(1);
  });
  it("empty input", () => {
    expect(summarizeOwnerDecisionReports([]).ceilingPercent).toBe(0);
  });
});
