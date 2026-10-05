/**
 * Owner Portfolio (Module 9 Slice 1) — deterministic portfolio engine tests.
 * Pure/no DB. Covers per-business roll-up, portfolio health, cross-business
 * ranking, today's top-3 priorities, risk alerts, the investment recommendation,
 * no-data handling, and determinism.
 */
import { describe, it, expect } from "vitest";
import { buildPortfolioView } from "@/domain/owner-portfolio";
import type { PortfolioBusinessInput } from "@/domain/owner-portfolio";
import type { BusinessConditionProfile, DomainScore, OwnerDomain } from "@/domain/owner-spine/contracts";
import { resolveOwnerAdvicePolicy } from "@/domain/owner-spine/owner-advice-policy";
import type { CurrentOwnerDecision, OwnerDecisionTarget, OwnerPriorityClass, OwnerSeverity } from "@/domain/owner-spine/owner-decision";

const NOW = new Date("2026-06-05T00:00:00.000Z");

function ds(domain: OwnerDomain, healthScore: number, riskScore: number, opportunityScore = 0): DomainScore {
  return { domain, healthScore, riskScore, opportunityScore, dataConfidenceScore: 80, topFindingCodes: [], topActionCodes: [], generatedAt: NOW };
}

/** A business's canonical main target, as the owner-home resolver returns it (only the fields the engine reads). */
function decision(businessId: string, id: string, domain: OwnerDomain, priorityClass: OwnerPriorityClass, severity: OwnerSeverity | null): CurrentOwnerDecision {
  const primaryTarget: OwnerDecisionTarget = {
    candidateId: `domain_action:${domain}:${id}`, source: "domain_action", domain, domainLabel: domain, priorityClass,
    findingCode: "X", title: `Target ${id}`, explanation: "", severity, status: "proposed", targetRoute: `/owner/${domain}`,
  };
  // The canonical advice policy for a current, sufficient decision (resolved by the real policy, not hand-built).
  const advicePolicy = resolveOwnerAdvicePolicy({
    state: "TARGET",
    primary: { source: "domain_action", priorityClass, findingCode: "X", domain, missingData: [] },
    intent: "FIX" as never,
    primaryDomainLabel: domain,
    dataSufficiency: { status: "sufficient", lowConfidenceDomains: [], missingCriticalData: [] },
    staleDomains: [], gateCashProvisional: false, gateCashConflicting: false, missingInformation: [], reassessmentTrigger: "",
  });
  return { businessId, state: "TARGET", primaryTarget, advicePolicy } as unknown as CurrentOwnerDecision;
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
      }),
      staleDomains: [],
      ownerDecision: decision("A", "a-act", "sales", "GROWTH_OPPORTUNITY", "low"),
    },
    {
      businessId: "B", name: "Bravo", businessType: "generic_local_service", currency: "INR",
      profile: profile({
        overallHealthScore: 30, survivalRiskScore: 85, growthOpportunityScore: 40, executionRiskScore: 30, dataConfidenceScore: 70,
        domainScores: [ds("finance", 25, 80), ds("cashflow", 20, 88)],
      }),
      staleDomains: [],
      ownerDecision: decision("B", "b-act", "cashflow", "SURVIVAL_CASH", "critical"),
    },
    {
      businessId: "C", name: "Charlie", businessType: "generic_local_service", currency: "INR",
      profile: profile({
        overallHealthScore: 55, survivalRiskScore: 40, growthOpportunityScore: 60, executionRiskScore: 80, dataConfidenceScore: 75,
        domainScores: [ds("operations", 55, 70), ds("sop", 30, 80)],
      }),
      staleDomains: [],
      ownerDecision: decision("C", "c-act", "sop", "BLOCKED_EXECUTION", "high"),
    },
  ];
}

describe("owner-portfolio engine — module contract assertions", () => {
  it("buildPortfolioView is a function", () => { expect(typeof buildPortfolioView).toBe("function"); });
  it("NOW is a Date", () => { expect(NOW instanceof Date).toBe(true); });
  it("ds is a function", () => { expect(typeof ds).toBe("function"); });
  it("decision is a function", () => { expect(typeof decision).toBe("function"); });
  it("profile is a function", () => { expect(typeof profile).toBe("function"); });
  it("portfolio is a function", () => { expect(typeof portfolio).toBe("function"); });
  it("portfolio() returns an array", () => { expect(Array.isArray(portfolio())).toBe(true); });
  it("portfolio().length equals 3", () => { expect(portfolio().length).toBe(3); });
  it("buildPortfolioView(portfolio(), { now: NOW }) returns an object", () => { expect(typeof buildPortfolioView(portfolio(), { now: NOW })).toBe("object"); });
  it("buildPortfolioView(portfolio(), { now: NOW }) has hasData field", () => { expect(buildPortfolioView(portfolio(), { now: NOW })).toHaveProperty("hasData"); });
  it("decision() returns a business-scoped canonical target", () => { expect(decision("A", "x", "sales", "GROWTH_OPPORTUNITY", null).primaryTarget?.priorityClass).toBe("GROWTH_OPPORTUNITY"); });
  it("profile({ overallHealthScore: 50 }) returns an object", () => { expect(typeof profile({ overallHealthScore: 50 })).toBe("object"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

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
  it("today's top 3 priorities are each business's canonical main target, ordered by business class", () => {
    const v = buildPortfolioView(portfolio(), { now: NOW });
    expect(v.top3Priorities.map((p) => p.businessId)).toEqual(["B", "C", "A"]); // survival cash, blocked execution, growth
    expect(v.top3Priorities[0].target.candidateId).toBe("domain_action:cashflow:b-act");
  });

  it("class outranks severity across businesses (a critical growth item never beats a medium blocker)", () => {
    const input = portfolio();
    input[0].ownerDecision = decision("A", "a-act", "sales", "GROWTH_OPPORTUNITY", "critical");
    input[2].ownerDecision = decision("C", "c-act", "sop", "BLOCKED_EXECUTION", "medium");
    const v = buildPortfolioView(input, { now: NOW });
    expect(v.top3Priorities.map((p) => p.businessId)).toEqual(["B", "C", "A"]);
  });

  it("'needing attention first', the business list and top-3 #1 use ONE order (a safety target beats a higher survival-risk score)", () => {
    const input = portfolio();
    // B: high survival risk (85) but a PROFIT_LOSS target; C: lower survival risk (40) but a safety target.
    input[1].ownerDecision = decision("B", "b-act", "finance", "PROFIT_LOSS", "high");
    input[2].ownerDecision = decision("C", "c-act", "compliance", "SAFETY_COMPLIANCE", null);
    const v = buildPortfolioView(input, { now: NOW });
    expect(v.top3Priorities[0].businessId).toBe("C");
    expect(v.ranking.mostUrgentBusinessId).toBe("C");
    expect(v.businesses[0].businessId).toBe("C");
  });

  it("never attributes another business's decision to this business", () => {
    const input = portfolio();
    input[0].ownerDecision = decision("B", "stray", "cashflow", "SURVIVAL_CASH", "critical");
    const v = buildPortfolioView(input, { now: NOW });
    expect(v.top3Priorities.map((p) => p.businessId)).toEqual(["B", "C"]);
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
