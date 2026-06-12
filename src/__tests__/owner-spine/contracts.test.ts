/**
 * Owner Intelligence Spine contracts — unit tests (Module 2 Slice 1).
 * Pure/deterministic, no DB. Proves clamping, deterministic priority + ranking,
 * Business Condition rollup honesty, Module 1 vocabulary alignment, and that
 * invalid scores/confidence cannot escape the contracts.
 */
import { describe, it, expect } from "vitest";
import {
  OWNER_SEVERITIES,
  OWNER_ACTION_STATUSES,
  OWNER_VERIFICATION_STATUSES,
  OWNER_DOMAINS,
  clampScore,
  clampConfidence,
  calculateOwnerPriorityScore,
  rankOwnerActions,
  buildBusinessConditionProfile,
  ownerFindingSchema,
  ownerActionSchema,
  domainScoreSchema,
  type OwnerAction,
  type DomainScore,
} from "@/domain/owner-spine/contracts";
import { RECOVERY_ACTION_STATUSES } from "@/domain/founder-recovery/action-status";

const FIXED_NOW = new Date("2026-06-11T00:00:00.000Z");

function makeAction(over: Partial<OwnerAction> & { findingCode: string; title: string }): OwnerAction {
  return {
    domain: "finance",
    description: "d",
    ownerRole: "owner",
    priorityScore: 50,
    effortScore: 30,
    expectedImpactScore: 50,
    urgencyScore: 40,
    confidence: 0.7,
    status: "proposed",
    verificationMetric: "grossMarginPct",
    verificationMethod: "compare before/after",
    expectedTimeframeDays: 14,
    ...over,
  };
}

function makeDomainScore(over: Partial<DomainScore> & { domain: DomainScore["domain"] }): DomainScore {
  return {
    healthScore: 50,
    riskScore: 50,
    opportunityScore: 50,
    dataConfidenceScore: 50,
    topFindingCodes: [],
    topActionCodes: [],
    generatedAt: FIXED_NOW,
    ...over,
  };
}

describe("Owner Spine — score clamping", () => {
  it("clamps negative to 0 and over-100 to 100", () => {
    expect(clampScore(-5)).toBe(0);
    expect(clampScore(150)).toBe(100);
    expect(clampScore(0)).toBe(0);
    expect(clampScore(100)).toBe(100);
  });
  it("rounds decimals to nearest integer and fails closed on non-finite", () => {
    expect(clampScore(72.4)).toBe(72);
    expect(clampScore(72.6)).toBe(73);
    expect(clampScore(Number.NaN)).toBe(0);
    // Non-finite fails closed to 0 (never invented as a max score).
    expect(clampScore(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("Owner Spine — confidence clamping", () => {
  it("clamps negative to 0 and over-1 to 1, preserves decimals, NaN→0", () => {
    expect(clampConfidence(-0.5)).toBe(0);
    expect(clampConfidence(1.5)).toBe(1);
    expect(clampConfidence(0.42)).toBe(0.42);
    expect(clampConfidence(Number.NaN)).toBe(0);
  });
});

describe("Owner Spine — priority calculation", () => {
  const base = { expectedImpactScore: 40, confidence: 0.5, urgencyScore: 40, effortScore: 40 };

  it("is always within 0..100", () => {
    for (const impact of [0, 50, 100]) {
      for (const eff of [0, 50, 100]) {
        const p = calculateOwnerPriorityScore({ ...base, expectedImpactScore: impact, effortScore: eff });
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(100);
      }
    }
  });

  it("higher impact increases priority", () => {
    expect(calculateOwnerPriorityScore({ ...base, expectedImpactScore: 60 })).toBeGreaterThan(
      calculateOwnerPriorityScore({ ...base, expectedImpactScore: 40 })
    );
  });

  it("higher urgency and higher severity increase priority", () => {
    expect(calculateOwnerPriorityScore({ ...base, urgencyScore: 80 })).toBeGreaterThan(
      calculateOwnerPriorityScore({ ...base, urgencyScore: 30 })
    );
    expect(calculateOwnerPriorityScore({ ...base, severity: "critical" })).toBeGreaterThan(
      calculateOwnerPriorityScore({ ...base, severity: "low" })
    );
  });

  it("higher effort decreases priority", () => {
    expect(calculateOwnerPriorityScore({ ...base, effortScore: 90 })).toBeLessThan(
      calculateOwnerPriorityScore({ ...base, effortScore: 20 })
    );
  });

  it("critical survival action outranks low-growth action", () => {
    const survival = calculateOwnerPriorityScore({
      expectedImpactScore: 80, confidence: 0.9, urgencyScore: 70, effortScore: 30,
      severity: "critical", survivalRiskScore: 90,
    });
    const growth = calculateOwnerPriorityScore({
      expectedImpactScore: 50, confidence: 0.6, urgencyScore: 30, effortScore: 60,
      severity: "low", survivalRiskScore: 10,
    });
    expect(survival).toBeGreaterThan(growth);
  });

  it("does not invent missing confidence (invalid confidence → priority 0)", () => {
    expect(calculateOwnerPriorityScore({ ...base, confidence: Number.NaN })).toBe(0);
  });
});

describe("Owner Spine — action ranking", () => {
  it("sorts by descending priority", () => {
    const ranked = rankOwnerActions([
      makeAction({ findingCode: "A", title: "a", priorityScore: 20 }),
      makeAction({ findingCode: "B", title: "b", priorityScore: 80 }),
      makeAction({ findingCode: "C", title: "c", priorityScore: 50 }),
    ]);
    expect(ranked.map((a) => a.findingCode)).toEqual(["B", "C", "A"]);
  });

  it("uses a deterministic, stable tie-break on equal priority", () => {
    const actions = [
      makeAction({ findingCode: "Z", title: "z", priorityScore: 50, expectedImpactScore: 50 }),
      makeAction({ findingCode: "A", title: "a", priorityScore: 50, expectedImpactScore: 50 }),
    ];
    const r1 = rankOwnerActions(actions).map((a) => a.findingCode);
    const r2 = rankOwnerActions([...actions].reverse()).map((a) => a.findingCode);
    expect(r1).toEqual(["A", "Z"]);
    expect(r2).toEqual(r1); // order-independent → deterministic
  });

  it("does not mutate the input array", () => {
    const actions = [
      makeAction({ findingCode: "A", title: "a", priorityScore: 10 }),
      makeAction({ findingCode: "B", title: "b", priorityScore: 90 }),
    ];
    const before = actions.map((a) => a.findingCode);
    rankOwnerActions(actions);
    expect(actions.map((a) => a.findingCode)).toEqual(before);
  });
});

describe("Owner Spine — Business Condition Profile", () => {
  it("aggregates domain scores and picks the recommended next action", () => {
    const profile = buildBusinessConditionProfile({
      businessId: "biz1",
      domainScores: [
        makeDomainScore({ domain: "finance", healthScore: 40, riskScore: 80, opportunityScore: 30, dataConfidenceScore: 70 }),
        makeDomainScore({ domain: "sales", healthScore: 60, riskScore: 20, opportunityScore: 70, dataConfidenceScore: 90 }),
      ],
      topActions: [
        makeAction({ findingCode: "LOW", title: "low", priorityScore: 25 }),
        makeAction({ findingCode: "HIGH", title: "high", priorityScore: 88 }),
      ],
      now: FIXED_NOW,
    });
    expect(profile.overallHealthScore).toBe(50); // avg(40,60)
    expect(profile.survivalRiskScore).toBe(80); // finance is a survival domain
    expect(profile.growthOpportunityScore).toBe(70); // max opportunity
    expect(profile.dataConfidenceScore).toBe(80); // avg(70,90)
    expect(profile.recommendedNextAction?.findingCode).toBe("HIGH");
    expect(profile.generatedAt).toBe(FIXED_NOW);
  });

  it("carries missing critical data (deduped) and never invents it", () => {
    const profile = buildBusinessConditionProfile({
      domainScores: [],
      missingCriticalData: ["revenue", "revenue", "cashOnHand"],
      now: FIXED_NOW,
    });
    expect(profile.missingCriticalData.sort()).toEqual(["cashOnHand", "revenue"]);
  });

  it("with no domain scores, every score is 0 and no action invented", () => {
    const profile = buildBusinessConditionProfile({ domainScores: [], now: FIXED_NOW });
    expect(profile.overallHealthScore).toBe(0);
    expect(profile.survivalRiskScore).toBe(0);
    expect(profile.growthOpportunityScore).toBe(0);
    expect(profile.executionRiskScore).toBe(0);
    expect(profile.dataConfidenceScore).toBe(0);
    expect(profile.recommendedNextAction).toBeUndefined();
    expect(profile.missingCriticalData).toEqual([]);
  });
});

describe("Owner Spine — Module 1 contract compatibility", () => {
  it("severity values match Module 1 severity", () => {
    expect([...OWNER_SEVERITIES]).toEqual(["low", "medium", "high", "critical"]);
  });
  it("action statuses are exactly Module 1's recovery action statuses", () => {
    expect(OWNER_ACTION_STATUSES).toBe(RECOVERY_ACTION_STATUSES);
    expect([...OWNER_ACTION_STATUSES]).toEqual([
      "proposed", "assigned", "in_progress", "blocked", "completed", "cancelled",
    ]);
  });
  it("verification statuses match Module 1's verification status union", () => {
    expect([...OWNER_VERIFICATION_STATUSES]).toEqual([
      "unverified", "verified_improved", "verified_not_improved", "inconclusive", "disputed",
    ]);
  });
  it("exposes all ten owner domains", () => {
    expect(OWNER_DOMAINS).toContain("recovery");
    expect(OWNER_DOMAINS).toContain("finance");
    expect(OWNER_DOMAINS.length).toBe(10);
  });
});

describe("Owner Spine — anti-false-green (invalid values cannot escape)", () => {
  it("a finding with score > 100 fails schema validation", () => {
    const bad = ownerFindingSchema.safeParse({
      domain: "finance", code: "X", title: "t", summary: "s", sourceMetric: "m",
      severity: "high", confidence: 0.5, impactScore: 150, urgencyScore: 10,
    });
    expect(bad.success).toBe(false);
  });
  it("an action with confidence > 1 fails schema validation", () => {
    const bad = ownerActionSchema.safeParse({
      domain: "finance", findingCode: "X", title: "t", description: "d", ownerRole: "owner",
      priorityScore: 50, effortScore: 10, expectedImpactScore: 50, confidence: 1.5,
      verificationMetric: "m", verificationMethod: "v", expectedTimeframeDays: 7,
    });
    expect(bad.success).toBe(false);
  });
  it("a domain score with negative score fails schema validation", () => {
    const bad = domainScoreSchema.safeParse({
      domain: "finance", healthScore: -1, riskScore: 10, opportunityScore: 10,
      dataConfidenceScore: 10, generatedAt: FIXED_NOW,
    });
    expect(bad.success).toBe(false);
  });
  it("clamp helpers also prevent invalid values from escaping as >100 / >1", () => {
    expect(clampScore(99999)).toBe(100);
    expect(clampConfidence(99999)).toBe(1);
  });
});
