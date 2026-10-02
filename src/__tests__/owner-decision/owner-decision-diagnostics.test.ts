/**
 * Owner Decision candidate-set diagnostics — measurement only. Pure/no DB.
 * Proves the analyzer reports saturation, same-class / same-severity collisions and the real comparator's
 * deciding factor, without mutating candidates, reordering input, or changing the elected decision.
 * Any statistics here are TEST/FIXTURE measurements, not real-customer incidence and not a calibration.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  analyzeCanonicalOwnerDecisionCandidateSet,
  analyzeOwnerDecisionCandidateSet,
  summarizeOwnerDecisionReports,
  priorityScoreBucket,
  PRIORITY_SCORE_BUCKETS,
} from "@/domain/owner-spine/owner-decision-diagnostics";
import { NO_OWNER_GATE_CONSTRAINTS, type OwnerGateConstraints } from "@/domain/owner-mode/owner-action-gate-policy";
import {
  canonicalEligibility,
  rankOwnerCandidates,
  resolveOwnerDecision,
  compareOwnerCandidatesWithFactor,
  type OwnerDecisionCandidate,
  type ResolveOwnerDecisionInput,
} from "@/domain/owner-spine/owner-decision";
import { NO_CHANGE_FACTS } from "@/__tests__/owner-decision/change-facts-fixture";

const ELIGIBLE = { population: "eligible-input" } as const;
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
    const r = analyzeOwnerDecisionCandidateSet([], ELIGIBLE);
    expect(r.totalCandidates).toBe(0);
    expect(r.saturation.ceilingCount).toBe(0);
    expect(r.saturation.ceilingPercent).toBe(0);
    expect(r.sameClassGroups).toEqual([]);
    expect(r.sameClassSameSeverityGroups).toEqual([]);
  });
  it("2. one candidate forms no group", () => {
    const r = analyzeOwnerDecisionCandidateSet([cand("a")], ELIGIBLE);
    expect(r.eligibleCandidates).toBe(1);
    expect(r.sameClassGroups).toEqual([]);
    expect(r.byDomain).toEqual({ finance: 1 });
    expect(r.byClass).toEqual({ PROFIT_LOSS: 1 });
    expect(r.bySeverity).toEqual({ high: 1 });
  });
  it("3. different classes form no same-class group", () => {
    const r = analyzeOwnerDecisionCandidateSet([cand("a", { priorityClass: "SURVIVAL_CASH" }), cand("b", { priorityClass: "PROFIT_LOSS" }), cand("c", { priorityClass: "GROWTH_OPPORTUNITY", domain: "sales" })], ELIGIBLE);
    expect(r.sameClassGroups).toEqual([]);
    expect(r.byDomain).toEqual({ finance: 2, sales: 1 });
  });
  it("excluded candidates are counted but not analyzed; missing severity is its own key", () => {
    const r = analyzeOwnerDecisionCandidateSet([cand("a"), cand("b", { exclusion: "completed" }), cand("c", { severity: null })], ELIGIBLE);
    expect(r.totalCandidates).toBe(3);
    expect(r.eligibleCandidates).toBe(2);
    expect(r.excludedCandidates).toBe(1);
    expect(r.bySeverity).toEqual({ high: 1, none: 1 });
  });
  it("4. same class, different severity: a same-class group but no same-severity group", () => {
    const r = analyzeOwnerDecisionCandidateSet([cand("a", { severity: "critical" }), cand("b", { severity: "low", domain: "cashflow" })], ELIGIBLE);
    expect(r.sameClassGroups).toHaveLength(1);
    expect(r.sameClassGroups[0].severitiesDiffer).toBe(true);
    expect(r.sameClassGroups[0].crossDomain).toBe(true);
    expect(r.sameClassSameSeverityGroups).toEqual([]);
  });
});

describe("winner factor (the real comparator's deciding criterion)", () => {
  it("5. same class + severity, different priority → priority", () => {
    const g = group(analyzeOwnerDecisionCandidateSet([cand("a", { priorityScore: 70 }), cand("b", { priorityScore: 80 })], ELIGIBLE));
    expect(g.winnerFactor).toBe("priority");
    expect(g.winnerCandidateId).toBe("domain_action:b");
  });
  it("6. equal priority, different impact → impact", () => {
    const g = group(analyzeOwnerDecisionCandidateSet([cand("a", { expectedImpactScore: 60 }), cand("b", { expectedImpactScore: 70 })], ELIGIBLE));
    expect(g.winnerFactor).toBe("impact");
    expect(g.winnerCandidateId).toBe("domain_action:b");
  });
  it("7. equal priority + impact, different confidence → confidence", () => {
    const g = group(analyzeOwnerDecisionCandidateSet([cand("a", { confidence: 0.6 }), cand("b", { confidence: 0.9 })], ELIGIBLE));
    expect(g.winnerFactor).toBe("confidence");
    expect(g.winnerCandidateId).toBe("domain_action:b");
  });
  it("8. equal through confidence, different effort → effort (lower effort wins)", () => {
    const g = group(analyzeOwnerDecisionCandidateSet([cand("a", { effortScore: 70 }), cand("b", { effortScore: 20 })], ELIGIBLE));
    expect(g.winnerFactor).toBe("effort");
    expect(g.winnerCandidateId).toBe("domain_action:b");
  });
  it("9. everything numerically equal → deterministic identifier; flagged numericallyIdentical", () => {
    const g = group(analyzeOwnerDecisionCandidateSet([cand("b"), cand("a")], ELIGIBLE));
    expect(g.winnerFactor).toBe("identifier");
    expect(g.numericallyIdentical).toBe(true);
    expect(g.winnerFindingCode).toBe("CODE_a");
  });
  it("a current finding precedes a refresh of out-of-date figures at equal class and severity", () => {
    const g = group(analyzeOwnerDecisionCandidateSet([cand("r", { source: "evidence_refresh", priorityScore: 100 }), cand("c", { priorityScore: 10 })], ELIGIBLE));
    expect(g.winnerFactor).toBe("current_evidence");
    expect(g.winnerCandidateId).toBe("domain_action:c");
  });
  it("every reported winner matches the comparator's own order", () => {
    const set = [cand("a", { priorityScore: 100, confidence: 0.5 }), cand("b", { priorityScore: 100, confidence: 0.9 }), cand("c", { priorityScore: 99 })];
    const g = group(analyzeOwnerDecisionCandidateSet(set, ELIGIBLE));
    const expected = [...set].sort((x, y) => compareOwnerCandidatesWithFactor(x, y)[0]).map((c) => c.candidateId);
    expect(g.ranked.map((m) => m.candidateId)).toEqual(expected);
  });
});

describe("saturation", () => {
  it("10. two candidates both at 100 are a saturated collision resolved by a later factor", () => {
    const r = analyzeOwnerDecisionCandidateSet([cand("a", { priorityScore: 100, expectedImpactScore: 90 }), cand("b", { priorityScore: 100, expectedImpactScore: 70 })], ELIGIBLE);
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
    const r = analyzeOwnerDecisionCandidateSet([cand("a", { priorityScore: 100 }), cand("b", { priorityScore: 100, expectedImpactScore: 60 }), cand("c", { priorityScore: 100, expectedImpactScore: 70 })], ELIGIBLE);
    expect(group(r).saturatedCount).toBe(3);
    expect(group(r).adjacentFactors).toEqual(["impact", "impact"]);
    expect(r.saturation.buckets["100"]).toBe(3);
  });
  it("12. a saturated same-class/same-severity group across domains", () => {
    const r = analyzeOwnerDecisionCandidateSet([cand("a", { priorityScore: 100, domain: "finance" }), cand("b", { priorityScore: 100, domain: "cashflow", confidence: 0.95 })], ELIGIBLE);
    expect(group(r).crossDomain).toBe(true);
    expect(group(r).saturatedCollision).toBe(true);
    expect(group(r).winnerFactor).toBe("confidence");
  });
  it("13. saturated candidates in different classes are not a collision", () => {
    const r = analyzeOwnerDecisionCandidateSet([cand("a", { priorityScore: 100, priorityClass: "SURVIVAL_CASH" }), cand("b", { priorityScore: 100, priorityClass: "PROFIT_LOSS" })], ELIGIBLE);
    expect(r.saturation.ceilingCount).toBe(2);
    expect(r.ceilingByClass).toEqual({ PROFIT_LOSS: 1, SURVIVAL_CASH: 1 });
    expect(r.sameClassSameSeverityGroups).toEqual([]);
  });
  it("14. 99 vs 100: not a saturated collision; priority decides", () => {
    const g = group(analyzeOwnerDecisionCandidateSet([cand("a", { priorityScore: 99 }), cand("b", { priorityScore: 100 })], ELIGIBLE));
    expect(g.saturatedCollision).toBe(false);
    expect(g.anySaturated).toBe(true);
    expect(g.allSaturated).toBe(false);
    expect(g.winnerFactor).toBe("priority");
    expect(g.winnerCandidateId).toBe("domain_action:b");
  });
  it("a raw score above 100 is read exactly as the comparator reads it (clamped)", () => {
    const r = analyzeOwnerDecisionCandidateSet([cand("a", { priorityScore: 480 }), cand("b", { priorityScore: 99.6 })], ELIGIBLE);
    expect(r.saturation.ceilingCount).toBe(2);
    expect(group(r).saturatedCollision).toBe(true);
  });
  it("100-vs-100 is distinguishable from a genuine complete tie", () => {
    const sat = group(analyzeOwnerDecisionCandidateSet([cand("a", { priorityScore: 100, expectedImpactScore: 90 }), cand("b", { priorityScore: 100, expectedImpactScore: 60 })], ELIGIBLE));
    const tie = group(analyzeOwnerDecisionCandidateSet([cand("a", { priorityScore: 100 }), cand("b", { priorityScore: 100 })], ELIGIBLE));
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
    const g = group(analyzeOwnerDecisionCandidateSet(set, ELIGIBLE));
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
    const g = group(analyzeOwnerDecisionCandidateSet(tied, ELIGIBLE));
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
    analyzeOwnerDecisionCandidateSet(set, ELIGIBLE);
    expect(JSON.stringify(set)).toBe(snapshot);
    expect(set.map((c) => c.candidateId)).toEqual(order);
    expect(JSON.stringify(resolveOwnerDecision(input))).toBe(decisionBefore);
    expect(Object.isFrozen(set)).toBe(false);
  });
  it("works on a frozen array of frozen candidates (cannot mutate)", () => {
    const frozen = Object.freeze(set.map((c) => Object.freeze({ ...c })));
    expect(() => analyzeOwnerDecisionCandidateSet(frozen, ELIGIBLE)).not.toThrow();
  });
  it("17. deterministic across repeated runs and input orderings", () => {
    const a = JSON.stringify(analyzeOwnerDecisionCandidateSet(set, ELIGIBLE));
    expect(JSON.stringify(analyzeOwnerDecisionCandidateSet(set, ELIGIBLE))).toBe(a);
    expect(JSON.stringify(analyzeOwnerDecisionCandidateSet([...set].reverse(), ELIGIBLE))).toBe(a);
  });
  it("18. no free text (title, explanation, evidence, missing data) appears in the report", () => {
    const text = JSON.stringify(analyzeOwnerDecisionCandidateSet(set, ELIGIBLE));
    expect(text).not.toMatch(/SECRET/);
  });
});

describe("TEST/FIXTURE MEASUREMENT summary (not production incidence, not a calibration)", () => {
  const sets = [
    [cand("a", { priorityScore: 100 }), cand("b", { priorityScore: 100, expectedImpactScore: 80 })],
    [cand("c", { priorityScore: 100, severity: "critical" }), cand("d", { priorityScore: 60, severity: "low" })],
    [cand("e", { priorityScore: 70, domain: "sales" }), cand("f", { priorityScore: 75, domain: "marketing" })],
    [cand("g", { priorityScore: 100, priorityClass: "SURVIVAL_CASH" })],
  ].map((s) => analyzeOwnerDecisionCandidateSet(s, ELIGIBLE));
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

describe("population contract", () => {
  const set = [cand("a", { priorityScore: 100 }), cand("b", { priorityScore: 100, exclusion: "completed" })];
  it("the general analyzer labels itself eligible-input and never claims the exact canonical population", () => {
    const r = analyzeOwnerDecisionCandidateSet(set, ELIGIBLE);
    expect(r.population).toBe("eligible-input");
    expect(r.exactCanonicalPopulation).toBe(false);
    expect(r.populationTrace).toBeNull();
  });
  it("the canonical analyzer labels itself canonical-ranked with a population trace", () => {
    const r = analyzeCanonicalOwnerDecisionCandidateSet(set, { businessId: "biz-1", workspaceId: "ws-1" });
    expect(r.population).toBe("canonical-ranked");
    expect(r.exactCanonicalPopulation).toBe(true);
    expect(r.populationTrace?.rankedCount).toBe(1);
  });
  it("the measurement summary distinguishes exact-canonical from eligible-input sets", () => {
    const scope = { businessId: "biz-1", workspaceId: "ws-1" };
    const mixed = summarizeOwnerDecisionReports([analyzeCanonicalOwnerDecisionCandidateSet(set, scope), analyzeOwnerDecisionCandidateSet(set, ELIGIBLE)]);
    expect(mixed.canonicalPopulationSets).toBe(1);
    expect(mixed.eligibleInputPopulationSets).toBe(1);
    expect(mixed.allExactCanonical).toBe(false);
    expect(summarizeOwnerDecisionReports([analyzeCanonicalOwnerDecisionCandidateSet(set, scope)]).allExactCanonical).toBe(true);
    expect(summarizeOwnerDecisionReports([]).allExactCanonical).toBe(false);
  });
});

describe("exact canonical population (hostile fixture)", () => {
  // 5 raw candidates → 4 ranked: one completed (excluded), one growth step held by the capacity gate, one
  // stale finance finding replaced by a synthesized refresh target, plus a synthesized capacity blocker.
  const scope = { businessId: "biz-1", workspaceId: "ws-1" };
  const CAPACITY_DOWN: OwnerGateConstraints = { ...NO_OWNER_GATE_CONSTRAINTS, capacity: { status: "blocked", reason: "Oven: down", bottlenecks: ["Oven"], confidence: null } };
  const raw = [
    cand("done", { findingCode: "SALES_OPP_WINBACK", domain: "sales", exclusion: "completed" }),
    cand("scale", { findingCode: "MKT_OPP_SCALE_WINNER", domain: "marketing", priorityClass: "GROWTH_OPPORTUNITY", priorityScore: 100 }),
    cand("stalefin", { findingCode: "FIN_INSOLVENT_RUNWAY", domain: "finance", priorityClass: "SURVIVAL_CASH", severity: "critical", priorityScore: 100, stale: true }),
    cand("cf", { findingCode: "CF_LOW_RUNWAY", domain: "cashflow", priorityClass: "SURVIVAL_CASH", severity: "critical", priorityScore: 100 }),
    cand("ops", { findingCode: "OPS_OPP_CLOSE_SOP_GAP", domain: "operations", priorityClass: "PROCESS_OPTIMISATION", severity: "medium", priorityScore: 70 }),
  ];
  const gatedScope = { ...scope, gate: CAPACITY_DOWN };
  const production = canonicalEligibility(raw, gatedScope);
  const report = analyzeCanonicalOwnerDecisionCandidateSet(raw, gatedScope);
  const ids = (cs: readonly OwnerDecisionCandidate[]) => cs.map((c) => c.candidateId).sort();

  it("the exact population is neither the raw input nor a simple exclusion filter", () => {
    expect(raw).toHaveLength(5);
    expect(production.ranked).toHaveLength(4);
    expect(ids(production.ranked)).not.toEqual(ids(raw.filter((c) => c.exclusion === null)));
  });
  it("the trace is derived from production's canonicalEligibility", () => {
    expect(report.populationTrace).toEqual({
      rawCount: 5, outOfScopeCount: 0, excludedOnInputCount: 1, staleReplacedCount: 1, heldBySafetyGateCount: production.holds.length,
      synthesizedCount: 2, synthesizedBySource: { evidence_refresh: 1, safety_gate: 1 }, rankedCount: production.ranked.length,
    });
    expect(production.holds.map((h) => h.candidateId)).toEqual(["domain_action:scale"]);
  });
  it("statistics describe exactly the production ranked population (counts, saturation, classes, domains)", () => {
    expect(report.eligibleCandidates).toBe(production.ranked.length);
    const count = (key: (c: OwnerDecisionCandidate) => string) => {
      const m: Record<string, number> = {};
      for (const c of production.ranked) m[key(c)] = (m[key(c)] ?? 0) + 1;
      return Object.fromEntries(Object.entries(m).sort(([a], [b]) => (a < b ? -1 : 1)));
    };
    expect(report.byDomain).toEqual(count((c) => String(c.domain)));
    expect(report.byClass).toEqual(count((c) => c.priorityClass));
    expect(report.bySeverity).toEqual(count((c) => c.severity ?? "none"));
    expect(report.saturation.ceilingCount).toBe(production.ranked.filter((c) => c.priorityScore === 100).length);
    expect(report.saturation.ceilingCount).toBe(2);
  });
  it("an excluded candidate and a gate-held candidate are absent from the statistics", () => {
    expect(report.byDomain.sales).toBeUndefined();
    expect(report.byDomain.marketing).toBeUndefined();
    expect(report.byClass.GROWTH_OPPORTUNITY).toBeUndefined();
    // …while the simple eligible-input analysis of the same raw array wrongly includes the held step and the stale original.
    const naive = analyzeOwnerDecisionCandidateSet(raw, ELIGIBLE);
    expect(naive.byDomain.marketing).toBe(1);
    // Same size by coincidence (4 vs 4) but a different population: the identities differ.
    expect(naive.byDomain).toEqual({ cashflow: 1, finance: 1, marketing: 1, operations: 1 });
    expect(naive.byDomain).not.toEqual(report.byDomain);
    expect(naive.exactCanonicalPopulation).toBe(false);
  });
  it("synthesized candidates DO appear: the refresh target and the safety-gate blocker are in the population", () => {
    expect(report.byDomain.finance).toBe(1);
    expect(report.byClass.OVERLOAD_BLOCKING).toBe(1);
    expect(report.populationTrace?.synthesizedBySource.safety_gate).toBe(1);
    const collision = report.sameClassSameSeverityGroups.find((g) => g.priorityClass === "SURVIVAL_CASH");
    expect(collision?.ranked.map((m) => m.candidateId)).toEqual(["domain_action:cf", "evidence_refresh:finance"]);
  });
  it("same-class/same-severity collisions use the exact comparator population: a saturated collision decided by current_evidence", () => {
    expect(report.sameClassSameSeverityGroups).toHaveLength(1);
    const g = report.sameClassSameSeverityGroups[0];
    expect(g.saturatedCollision).toBe(true);
    expect(g.crossDomain).toBe(true);
    expect(g.winnerFactor).toBe("current_evidence");
    expect(g.saturationResolvedByLaterFactor).toBe(false);
  });
  it("the analyzer's top candidate equals the production decision's primary", () => {
    const decision = resolveOwnerDecision({
      businessId: "biz-1", workspaceId: "ws-1", candidates: raw, diagnosedDomains: ["finance", "cashflow", "marketing", "operations"], staleDomains: ["finance"], strategy: null,
      dataSufficiency: { status: "sufficient", lowestDataConfidenceScore: 90, lowConfidenceDomains: [], missingCriticalData: [] },
      reassessment: { days: 14, reason: "test" }, changeFacts: NO_CHANGE_FACTS, gate: CAPACITY_DOWN, now: NOW,
    });
    expect(report.topRankedCandidateId).toBe(decision.primaryCandidateId);
    expect(report.topRankedCandidateId).toBe(production.ranked[0].candidateId);
  });
  it("does not mutate the raw input and is deterministic", () => {
    const before = JSON.stringify(raw);
    const a = JSON.stringify(analyzeCanonicalOwnerDecisionCandidateSet(raw, gatedScope));
    expect(JSON.stringify(raw)).toBe(before);
    expect(JSON.stringify(analyzeCanonicalOwnerDecisionCandidateSet([...raw].reverse(), gatedScope))).toBe(a);
    expect(a).not.toMatch(/SECRET/);
  });
  it("another business's candidates are out of scope and excluded from the population", () => {
    const other = cand("other", { businessId: "biz-2", priorityScore: 100 });
    const r = analyzeCanonicalOwnerDecisionCandidateSet([...raw, other], gatedScope);
    expect(r.populationTrace?.outOfScopeCount).toBe(1);
    expect(r.eligibleCandidates).toBe(report.eligibleCandidates);
  });
  it("without gate constraints nothing is held and no blocker is synthesized (same code path as production)", () => {
    const r = analyzeCanonicalOwnerDecisionCandidateSet(raw, scope);
    expect(r.populationTrace?.heldBySafetyGateCount).toBe(0);
    expect(r.populationTrace?.synthesizedBySource).toEqual({ evidence_refresh: 1 });
    expect(r.byDomain.marketing).toBe(1);
  });
});

describe("no duplicate canonical logic", () => {
  const src = readFileSync(join(process.cwd(), "src/domain/owner-spine/owner-decision-diagnostics.ts"), "utf8");
  it("derives the population from production's canonicalEligibility and re-implements no eligibility or gate logic", () => {
    expect(src).toMatch(/canonicalEligibility\(candidates, scope\)/);
    for (const forbidden of ["evaluateOwnerActionGate", "buildGateBlockerTargets", "buildRefreshTargets", "held_by_safety_gate", "stale_evidence\" as const", "NO_OWNER_GATE_CONSTRAINTS"]) {
      expect(src, forbidden).not.toContain(forbidden);
    }
  });
});
