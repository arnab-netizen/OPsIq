/**
 * Business Condition semantic integrity (slice 1): survival / execution risk are measured ONLY from their
 * own domain families. With no applicable domain they are NOT MEASURED (null) — never borrowed from an
 * unrelated domain, and never conflated with a genuinely measured 0. Pure/no DB.
 */
import { describe, it, expect } from "vitest";
import { buildBusinessConditionProfile, SURVIVAL_DOMAINS, EXECUTION_DOMAINS } from "@/domain/owner-spine/contracts";
import type { DomainScore, OwnerDomain } from "@/domain/owner-spine/contracts";
import { computeReassessmentCadence } from "@/services/owner-condition/business-condition.service";
import { buildPortfolioView } from "@/domain/owner-portfolio";
import type { PortfolioBusinessInput } from "@/domain/owner-portfolio";

const NOW = new Date("2026-06-05T00:00:00.000Z");
const ds = (domain: OwnerDomain, riskScore: number, healthScore = 60, opportunityScore = 10): DomainScore => ({
  domain, healthScore, riskScore, opportunityScore, dataConfidenceScore: 80, topFindingCodes: [], topActionCodes: [], generatedAt: NOW,
});
const build = (domainScores: DomainScore[]) => buildBusinessConditionProfile({ domainScores, now: NOW });

describe("survival / execution family membership is unchanged", () => {
  it("survival = recovery, finance, cashflow; execution = operations, sop", () => {
    expect([...SURVIVAL_DOMAINS].sort()).toEqual(["cashflow", "finance", "recovery"]);
    expect([...EXECUTION_DOMAINS].sort()).toEqual(["operations", "sop"]);
  });
});

describe("single-domain profiles", () => {
  it.each(["strategy", "marketing", "sales"] as const)("%s-only: survival and execution risk are NOT MEASURED", (d) => {
    const p = build([ds(d, 70)]);
    expect(p.survivalRiskScore).toBeNull();
    expect(p.executionRiskScore).toBeNull();
  });
  it.each(["finance", "cashflow", "recovery"] as const)("%s-only: survival risk measured from that domain; execution NOT MEASURED", (d) => {
    const p = build([ds(d, 42)]);
    expect(p.survivalRiskScore).toBe(42);
    expect(p.executionRiskScore).toBeNull();
  });
  it.each(["operations", "sop"] as const)("%s-only: execution risk measured from that domain; survival NOT MEASURED", (d) => {
    const p = build([ds(d, 37)]);
    expect(p.executionRiskScore).toBe(37);
    expect(p.survivalRiskScore).toBeNull();
  });
});

describe("family aggregation is max over applicable domains only", () => {
  it("finance + cashflow + recovery → max of the three", () => {
    expect(build([ds("finance", 20), ds("cashflow", 65), ds("recovery", 40)]).survivalRiskScore).toBe(65);
  });
  it("operations + sop → max of the two", () => {
    expect(build([ds("operations", 25), ds("sop", 55)]).executionRiskScore).toBe(55);
  });
});

describe("unknown is distinct from zero", () => {
  it("a measured 0 is 0; no applicable domain is null", () => {
    const measured = build([ds("finance", 0)]);
    expect(measured.survivalRiskScore).toBe(0);
    expect(measured.survivalRiskScore).not.toBeNull();
    expect(build([ds("strategy", 0)]).survivalRiskScore).toBeNull();
    expect(build([ds("operations", 0)]).executionRiskScore).toBe(0);
    expect(build([ds("finance", 0)]).executionRiskScore).toBeNull();
  });
});

describe("hostile fixture: unrelated domains at risk 100 cannot populate survival/execution", () => {
  const unrelated = [ds("strategy", 100), ds("marketing", 100), ds("sales", 100)];
  it("survival and execution are NOT MEASURED, not 100", () => {
    const p = build(unrelated);
    expect(p.survivalRiskScore).toBeNull();
    expect(p.executionRiskScore).toBeNull();
  });
  it("unrelated risk 100 does not alter a measured survival value", () => {
    expect(build([ds("finance", 10), ...unrelated]).survivalRiskScore).toBe(10);
  });
  it("finance/cashflow/strategy/marketing/sales risk 100 does not alter execution unless operations/sop present", () => {
    const noExec = build([ds("finance", 100), ds("cashflow", 100), ...unrelated]);
    expect(noExec.executionRiskScore).toBeNull();
    expect(build([ds("operations", 5), ds("finance", 100), ds("cashflow", 100), ...unrelated]).executionRiskScore).toBe(5);
  });
  it("existing values are retained where the aggregate was already sourced from the correct family", () => {
    const full = build([ds("finance", 30), ds("cashflow", 50), ds("recovery", 20), ds("operations", 45), ds("sop", 15), ds("sales", 90), ds("marketing", 90), ds("strategy", 90)]);
    expect(full.survivalRiskScore).toBe(50);
    expect(full.executionRiskScore).toBe(45);
  });
});

describe("reassessment cadence never reads NOT MEASURED as safe", () => {
  it("fully measured and low risk keeps the monthly cadence", () => {
    expect(computeReassessmentCadence(10, 10, "sufficient").days).toBe(30);
  });
  it.each([[null, 10], [10, null], [null, null]] as const)("unmeasured category (%s, %s) is not relaxed to 30 days", (s, e) => {
    const r = computeReassessmentCadence(s, e, "sufficient");
    expect(r.days).toBe(14);
    expect(r.reason).toMatch(/not been measured/);
  });
  it("a measured high risk still wins when the other category is unmeasured", () => {
    expect(computeReassessmentCadence(80, null, "sufficient").days).toBe(7);
    expect(computeReassessmentCadence(null, 45, "sufficient").days).toBe(14);
  });
  it("insufficient data stays weekly regardless of measurement", () => {
    expect(computeReassessmentCadence(null, null, "insufficient").days).toBe(7);
  });
});

describe("portfolio does not treat NOT MEASURED as safe", () => {
  const input = (id: string, domainScores: DomainScore[]): PortfolioBusinessInput => ({
    businessId: id, name: id, businessType: "generic_local_service", currency: "INR",
    profile: buildBusinessConditionProfile({ domainScores, now: NOW }), ownerDecision: null,
  } as PortfolioBusinessInput);
  it("an unmeasured-survival business is not the safe investment candidate and raises no survival alert", () => {
    const v = buildPortfolioView([input("U", [ds("marketing", 100, 60, 95)]), input("M", [ds("finance", 10, 80, 70)])], { now: NOW } as never);
    expect(v.ranking.bestGrowthCandidateBusinessId).toBe("M");
    expect(v.businesses.find((b) => b.businessId === "U")!.survivalRiskScore).toBeNull();
    expect(v.riskAlerts.filter((a) => a.businessId === "U")).toEqual([]);
  });
});
