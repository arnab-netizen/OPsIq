/**
 * Owner Portfolio (Module 9 Slice 1) — deterministic portfolio engine tests.
 * Pure/no DB. Covers per-business roll-up, portfolio health, cross-business
 * ranking, today's top-3 priorities, risk alerts, the investment recommendation,
 * no-data handling, and determinism.
 */
import { describe, it, expect } from "vitest";
import { buildPortfolioView } from "@/domain/owner-portfolio";
import type { PortfolioBusinessInput } from "@/domain/owner-portfolio";
import type { BusinessConditionProfile, DomainScore, OwnerAction, OwnerDomain } from "@/domain/owner-spine/contracts";

const NOW = new Date("2026-06-05T00:00:00.000Z");

function ds(domain: OwnerDomain, healthScore: number, riskScore: number, opportunityScore = 0): DomainScore {
  return { domain, healthScore, riskScore, opportunityScore, dataConfidenceScore: 80, topFindingCodes: [], topActionCodes: [], generatedAt: NOW };
}

function action(over: Partial<OwnerAction> = {}): OwnerAction {
  return {
    id: over.id ?? "act",
    domain: over.domain ?? "finance",
    findingCode: over.findingCode ?? "X",
    title: over.title ?? "Do the thing",
    description: "desc",
    ownerRole: "owner",
    priorityScore: over.priorityScore ?? 50,
    effortScore: 40,
    expectedImpactScore: over.expectedImpactScore ?? 60,
    urgencyScore: 0,
    severity: over.severity,
    confidence: 0.7,
    status: "proposed",
    verificationMetric: "m",
    verificationMethod: "before/after",
    expectedTimeframeDays: 14,
    ...over,
  };
}

function profile(over: Partial<BusinessConditionProfile>): BusinessConditionProfile {
  return {
    overallHealthScore: 50,
    survivalRiskScore: 30,
    growthOpportunityScore: 40,
    executionRiskScore: 20,
    dataConfidenceScore: 80,
    domainScores: [],
    topFindings: [],
    topActions: [],
    missingCriticalData: [],
    generatedAt: NOW,
    ...over,
  };
}

function portfolio(): PortfolioBusinessInput[] {
  return [
    {
      businessId: "A", name: "Alpha", businessType: "generic_local_service", currency: "INR",
      profile: profile({
        overallHealthScore: 85, survivalRiskScore: 20, growthOpportunityScore: 80, executionRiskScore: 15, dataConfidenceScore: 90,
        domainScores: [ds("finance", 85, 20, 80), ds("sales", 80, 25, 70), ds("cashflow", 80, 15)],
        recommendedNextAction: action({ id: "a-act", domain: "sales", priorityScore: 50 }),
      }),
    },
    {
      businessId: "B", name: "Bravo", businessType: "generic_local_service", currency: "INR",
      profile: profile({
        overallHealthScore: 30, survivalRiskScore: 85, growthOpportunityScore: 40, executionRiskScore: 30, dataConfidenceScore: 70,
        domainScores: [ds("finance", 25, 80), ds("cashflow", 20, 88)],
        recommendedNextAction: action({ id: "b-act", domain: "cashflow", priorityScore: 92, severity: "critical" }),
      }),
    },
    {
      businessId: "C", name: "Charlie", businessType: "generic_local_service", currency: "INR",
      profile: profile({
        overallHealthScore: 55, survivalRiskScore: 40, growthOpportunityScore: 60, executionRiskScore: 80, dataConfidenceScore: 75,
        domainScores: [ds("operations", 55, 70), ds("sop", 30, 80)],
        recommendedNextAction: action({ id: "c-act", domain: "sop", priorityScore: 70 }),
      }),
    },
  ];
}

describe("Owner Portfolio engine — roll-up + health", () => {
  it("summarises each business and computes portfolio health (avg of those with data)", () => {
    const v = buildPortfolioView(portfolio(), { now: NOW });
    expect(v.hasData).toBe(true);
    expect(v.businessCount).toBe(3);
    expect(v.portfolioHealthScore).toBe(57); // round((85+30+55)/3)
    const alpha = v.businesses.find((b) => b.businessId === "A")!;
    expect(alpha.financialScore).toBe(85);
    expect(alpha.cashflowScore).toBe(80);
    expect(alpha.salesScore).toBe(80);
    expect(alpha.operationsScore).toBeNull(); // Alpha has no operations cycle
  });

  it("orders businesses most-urgent first (survival risk desc)", () => {
    const v = buildPortfolioView(portfolio(), { now: NOW });
    expect(v.businesses[0].businessId).toBe("B"); // survival risk 85
  });
});

describe("Owner Portfolio engine — cross-business ranking", () => {
  it("ranks urgency / opportunity / cash risk / execution / growth candidate", () => {
    const v = buildPortfolioView(portfolio(), { now: NOW });
    expect(v.ranking.mostUrgentBusinessId).toBe("B"); // survival risk 85
    expect(v.ranking.highestProfitOpportunityBusinessId).toBe("A"); // opportunity 80
    expect(v.ranking.highestCashRiskBusinessId).toBe("B"); // cashflow risk 88
    expect(v.ranking.worstExecutionProblemBusinessId).toBe("C"); // execution risk 80
    expect(v.ranking.bestGrowthCandidateBusinessId).toBe("A"); // safe (risk 20) + opp 80
  });
});

describe("Owner Portfolio engine — priorities, alerts, investment", () => {
  it("today's top 3 priorities are the highest-priority next actions across businesses", () => {
    const v = buildPortfolioView(portfolio(), { now: NOW });
    expect(v.top3Priorities.map((p) => p.businessId)).toEqual(["B", "C", "A"]); // priority 92, 70, 50
    expect(v.top3Priorities[0].action.id).toBe("b-act");
  });

  it("raises survival, cash, and execution risk alerts above threshold", () => {
    const v = buildPortfolioView(portfolio(), { now: NOW });
    const types = v.riskAlerts.map((a) => `${a.businessId}:${a.type}`);
    expect(types).toContain("B:survival_risk");
    expect(types).toContain("B:cash_risk");
    expect(types).toContain("C:execution_risk");
    // ordered by score desc → B cash (88) first
    expect(v.riskAlerts[0]).toMatchObject({ businessId: "B", type: "cash_risk" });
  });

  it("recommends investing in the best safe growth candidate", () => {
    const v = buildPortfolioView(portfolio(), { now: NOW });
    expect(v.investmentRecommendation?.businessId).toBe("A");
    expect(v.investmentRecommendation?.growthOpportunityScore).toBe(80);
  });

  it("is deterministic (same inputs → identical view)", () => {
    const a = buildPortfolioView(portfolio(), { now: NOW });
    const b = buildPortfolioView(portfolio(), { now: NOW });
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });
});

describe("Owner Portfolio engine — no-data / empty handling", () => {
  it("a business without a profile is reported as no-data, never invented", () => {
    const v = buildPortfolioView([{ businessId: "Z", name: "Zeta", profile: null }], { now: NOW });
    expect(v.hasData).toBe(false);
    expect(v.businessCount).toBe(1);
    expect(v.portfolioHealthScore).toBe(0);
    expect(v.businesses[0].hasData).toBe(false);
    expect(v.businesses[0].overallHealthScore).toBe(0);
    expect(v.investmentRecommendation).toBeNull();
    expect(v.top3Priorities).toEqual([]);
  });

  it("an empty portfolio is an explicit empty view", () => {
    const v = buildPortfolioView([], { now: NOW });
    expect(v.hasData).toBe(false);
    expect(v.businessCount).toBe(0);
    expect(v.ranking.mostUrgentBusinessId).toBeNull();
    expect(v.riskAlerts).toEqual([]);
  });

  it("withholds an investment recommendation when no safe candidate clears the bar", () => {
    const allRisky = portfolio().map((b) => ({
      ...b,
      profile: b.profile ? { ...b.profile, survivalRiskScore: 90 } : null,
    }));
    const v = buildPortfolioView(allRisky, { now: NOW });
    expect(v.ranking.bestGrowthCandidateBusinessId).toBeNull(); // none below the safe bar
    expect(v.investmentRecommendation).toBeNull();
  });
});
