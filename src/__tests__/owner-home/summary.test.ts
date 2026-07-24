/**
 * Owner Home & Mobile Usability (Module 12 Slice 1) — Owner Home Summary engine.
 * Pure, deterministic unit tests for the §19 owner-home payload. No DB.
 */
import { describe, it, expect } from "vitest";
import {
  buildOwnerHomeSummary,
  dangerLevel,
  OPEN_ACTION_STATUSES,
  MAX_REQUIRED_ACTIONS,
  type OwnerHomeVerificationInput,
} from "@/domain/owner-home";
import type { DomainScore, OwnerAction, OwnerFinding, OwnerDomain } from "@/domain/owner-spine/contracts";

const NOW = new Date("2026-06-14T00:00:00.000Z");

function score(domain: OwnerDomain, over: Partial<DomainScore> = {}): DomainScore {
  return {
    domain,
    healthScore: 50,
    riskScore: 50,
    opportunityScore: 50,
    dataConfidenceScore: 80,
    topFindingCodes: [],
    topActionCodes: [],
    generatedAt: NOW,
    ...over,
  };
}

function finding(over: Partial<OwnerFinding> = {}): OwnerFinding {
  return {
    domain: "finance",
    code: "F_CODE",
    title: "Finding",
    summary: "A finding.",
    sourceMetric: "metric",
    sourceValue: 1,
    threshold: 2,
    severity: "medium",
    confidence: 0.5,
    impactScore: 50,
    urgencyScore: 50,
    findingType: "risk",
    evidence: [],
    missingData: [],
    ...over,
  };
}

function action(over: Partial<OwnerAction> = {}): OwnerAction {
  return {
    domain: "finance",
    findingCode: "F_CODE",
    title: "Action",
    description: "Do the thing.",
    ownerRole: "owner",
    priorityScore: 50,
    effortScore: 40,
    expectedImpactScore: 50,
    urgencyScore: 0,
    confidence: 0.6,
    status: "proposed",
    verificationMetric: "metric",
    verificationMethod: "Compare before/after.",
    expectedTimeframeDays: 14,
    ...over,
  };
}

function verification(over: Partial<OwnerHomeVerificationInput> = {}): OwnerHomeVerificationInput {
  return {
    domain: "finance",
    actionTitle: "Action",
    metric: "metric",
    beforeValue: 10,
    afterValue: 8,
    status: "verified_improved",
    verifiedAt: NOW,
    ...over,
  };
}

describe("owner-home summary — module contract assertions", () => {
  it("buildOwnerHomeSummary is a function", () => { expect(typeof buildOwnerHomeSummary).toBe("function"); });
  it("dangerLevel is a function", () => { expect(typeof dangerLevel).toBe("function"); });
  it("OPEN_ACTION_STATUSES is an array", () => { expect(Array.isArray(OPEN_ACTION_STATUSES)).toBe(true); });
  it("OPEN_ACTION_STATUSES.length is greater than 0", () => { expect(OPEN_ACTION_STATUSES.length).toBeGreaterThan(0); });
  it("MAX_REQUIRED_ACTIONS is a number", () => { expect(typeof MAX_REQUIRED_ACTIONS).toBe("number"); });
  it("NOW is a Date", () => { expect(NOW instanceof Date).toBe(true); });
  it("score is a function", () => { expect(typeof score).toBe("function"); });
  it("finding is a function", () => { expect(typeof finding).toBe("function"); });
  it("action is a function", () => { expect(typeof action).toBe("function"); });
  it("verification is a function", () => { expect(typeof verification).toBe("function"); });
  it("dangerLevel(null) is 'unknown'", () => { expect(dangerLevel(null)).toBe("unknown"); });
  it("dangerLevel(0) is 'none'", () => { expect(dangerLevel(0)).toBe("none"); });
  it("dangerLevel(80) is 'critical'", () => { expect(dangerLevel(80)).toBe("critical"); });
  it("score('finance') returns an object with domain field", () => { expect(score("finance")).toHaveProperty("domain"); });
});

describe("dangerLevel banding", () => {
  it("bands risk into none/low/elevated/high/critical and unknown for null", () => {
    expect(dangerLevel(null)).toBe("unknown");
    expect(dangerLevel(0)).toBe("none");
    expect(dangerLevel(19)).toBe("none");
    expect(dangerLevel(20)).toBe("low");
    expect(dangerLevel(39)).toBe("low");
    expect(dangerLevel(40)).toBe("elevated");
    expect(dangerLevel(59)).toBe("elevated");
    expect(dangerLevel(60)).toBe("high");
    expect(dangerLevel(79)).toBe("high");
    expect(dangerLevel(80)).toBe("critical");
    expect(dangerLevel(100)).toBe("critical");
  });
});

describe("buildOwnerHomeSummary", () => {
  it("reports a missing domain as unknown danger (never 0)", () => {
    const summary = buildOwnerHomeSummary({
      domainScores: [score("finance", { riskScore: 70 })],
      findings: [],
      actions: [],
      verifications: [],
      now: NOW,
    });
    expect(summary.cashDanger).toEqual({ key: "cashflow", riskScore: null, level: "unknown" });
    expect(summary.salesDanger.level).toBe("unknown");
    expect(summary.operationsDanger.level).toBe("unknown");
    expect(summary.executionDanger.level).toBe("unknown");
  });

  it("computes per-domain dangers and business health from real scores", () => {
    const summary = buildOwnerHomeSummary({
      domainScores: [
        score("cashflow", { riskScore: 85, healthScore: 20 }),
        score("sales", { riskScore: 45, healthScore: 60 }),
        score("operations", { riskScore: 30, healthScore: 70 }),
        score("sop", { riskScore: 65, healthScore: 40 }),
      ],
      findings: [],
      actions: [],
      verifications: [],
      now: NOW,
    });
    expect(summary.cashDanger).toEqual({ key: "cashflow", riskScore: 85, level: "critical" });
    expect(summary.salesDanger).toEqual({ key: "sales", riskScore: 45, level: "elevated" });
    expect(summary.operationsDanger).toEqual({ key: "operations", riskScore: 30, level: "low" });
    // execution = max(operations 30, sop 65) = 65 → high
    expect(summary.executionDanger).toEqual({ key: "execution", riskScore: 65, level: "high" });
    expect(summary.businessHealthScore).toBe(Math.round((20 + 60 + 70 + 40) / 4));
  });

  it("surfaces only the top 3 risks worst-first (severity → impact → confidence)", () => {
    const findings: OwnerFinding[] = [
      finding({ code: "R1", severity: "low", impactScore: 90, findingType: "risk" }),
      finding({ code: "R2", severity: "critical", impactScore: 10, findingType: "risk" }),
      finding({ code: "R3", severity: "high", impactScore: 80, findingType: "risk" }),
      finding({ code: "R4", severity: "high", impactScore: 80, confidence: 0.9, findingType: "risk" }),
      finding({ code: "O1", findingType: "opportunity", impactScore: 99 }),
    ];
    const summary = buildOwnerHomeSummary({ domainScores: [score("finance")], findings, actions: [], verifications: [], now: NOW });
    expect(summary.top3Risks.map((r) => r.code)).toEqual(["R2", "R4", "R3"]);
    // opportunity finding never appears among risks
    expect(summary.top3Risks.some((r) => r.code === "O1")).toBe(false);
  });

  it("surfaces only the top 3 opportunities best-first (impact → confidence)", () => {
    const findings: OwnerFinding[] = [
      finding({ code: "O1", findingType: "opportunity", impactScore: 40 }),
      finding({ code: "O2", findingType: "opportunity", impactScore: 90 }),
      finding({ code: "O3", findingType: "opportunity", impactScore: 70, confidence: 0.3 }),
      finding({ code: "O4", findingType: "opportunity", impactScore: 70, confidence: 0.9 }),
      finding({ code: "R1", findingType: "risk", impactScore: 99 }),
    ];
    const summary = buildOwnerHomeSummary({ domainScores: [score("finance")], findings, actions: [], verifications: [], now: NOW });
    expect(summary.top3Opportunities.map((o) => o.code)).toEqual(["O2", "O4", "O3"]);
    expect(summary.top3Opportunities.some((o) => o.code === "R1")).toBe(false);
  });

  it("lists today's required actions: open only, ranked, capped", () => {
    const actions: OwnerAction[] = [
      action({ findingCode: "A_DONE", status: "completed", priorityScore: 99 }),
      action({ findingCode: "A_CANCELLED", status: "cancelled", priorityScore: 98 }),
      action({ findingCode: "A1", status: "proposed", priorityScore: 30 }),
      action({ findingCode: "A2", status: "in_progress", priorityScore: 90 }),
      action({ findingCode: "A3", status: "assigned", priorityScore: 60 }),
      action({ findingCode: "A4", status: "blocked", priorityScore: 70 }),
      action({ findingCode: "A5", status: "proposed", priorityScore: 50 }),
      action({ findingCode: "A6", status: "proposed", priorityScore: 80 }),
    ];
    const summary = buildOwnerHomeSummary({ domainScores: [score("finance")], findings: [], actions, verifications: [], now: NOW });
    expect(summary.requiredActions.length).toBe(MAX_REQUIRED_ACTIONS);
    // closed actions excluded; remaining ranked by priority desc
    expect(summary.requiredActions.map((a) => a.findingCode)).toEqual(["A2", "A6", "A4", "A3", "A5"]);
    expect(summary.requiredActions.every((a) => OPEN_ACTION_STATUSES.includes(a.status))).toBe(true);
  });

  it("returns the most recent verified improvement, or null when none", () => {
    const none = buildOwnerHomeSummary({
      domainScores: [score("finance")],
      findings: [],
      actions: [],
      verifications: [
        verification({ status: "verified_not_improved", verifiedAt: new Date("2026-06-13T00:00:00Z") }),
        verification({ status: "inconclusive", verifiedAt: new Date("2026-06-12T00:00:00Z") }),
      ],
      now: NOW,
    });
    expect(none.lastVerifiedImprovement).toBeNull();

    const withImprovement = buildOwnerHomeSummary({
      domainScores: [score("finance")],
      findings: [],
      actions: [],
      verifications: [
        verification({ domain: "sales", actionTitle: "Older win", verifiedAt: new Date("2026-06-10T00:00:00Z") }),
        verification({ domain: "cashflow", actionTitle: "Newest win", metric: "dso", beforeValue: 60, afterValue: 40, verifiedAt: new Date("2026-06-13T00:00:00Z") }),
        verification({ status: "disputed", verifiedAt: new Date("2026-06-14T00:00:00Z") }),
      ],
      now: NOW,
    });
    expect(withImprovement.lastVerifiedImprovement).toEqual({
      domain: "cashflow",
      actionTitle: "Newest win",
      metric: "dso",
      beforeValue: 60,
      afterValue: 40,
      verifiedAt: new Date("2026-06-13T00:00:00Z"),
    });
  });

  it("is deterministic and never invents values for an empty business", () => {
    const empty = buildOwnerHomeSummary({ domainScores: [], findings: [], actions: [], verifications: [], now: NOW });
    expect(empty).toEqual(
      buildOwnerHomeSummary({ domainScores: [], findings: [], actions: [], verifications: [], now: NOW })
    );
    expect(empty.businessHealthScore).toBe(0);
    expect(empty.top3Risks).toEqual([]);
    expect(empty.top3Opportunities).toEqual([]);
    expect(empty.requiredActions).toEqual([]);
    expect(empty.lastVerifiedImprovement).toBeNull();
    expect(empty.cashDanger.level).toBe("unknown");
  });
});
