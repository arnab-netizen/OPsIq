/**
 * A2 — Portfolio investment recommendation is gated on the canonical owner decision / advice policy.
 * Ranking is not permission. Pure; no DB. Does NOT address growth-score comparability (P2).
 */
import { describe, it, expect } from "vitest";
import { buildPortfolioView, assessPortfolioInvestmentEligibility, PORTFOLIO_THRESHOLDS } from "@/domain/owner-portfolio";
import type { PortfolioBusinessInput } from "@/domain/owner-portfolio";
import type { BusinessConditionProfile, DomainScore, OwnerDomain } from "@/domain/owner-spine/contracts";
import type { CurrentOwnerDecision, OwnerDecisionState, OwnerPriorityClass } from "@/domain/owner-spine/owner-decision";
import { ownerMaterialCommitmentGuard, resolveOwnerAdvicePolicy, type OwnerAdvicePolicy, type OwnerAdvicePolicyInput } from "@/domain/owner-spine/owner-advice-policy";

const NOW = new Date("2026-06-05T00:00:00.000Z");

function ds(domain: OwnerDomain, opportunityScore: number): DomainScore {
  return { domain, healthScore: 70, riskScore: 20, opportunityScore, dataConfidenceScore: 80, topFindingCodes: [], topActionCodes: [], generatedAt: NOW };
}
function profile(over: Partial<BusinessConditionProfile> = {}): BusinessConditionProfile {
  return {
    overallHealthScore: 70, survivalRiskScore: 20, growthOpportunityScore: 90, executionRiskScore: 20, dataConfidenceScore: 80,
    domainScores: [ds("sales", 90), ds("finance", 30)], topFindings: [], topActions: [], missingCriticalData: [], generatedAt: NOW,
    ...over,
  } as BusinessConditionProfile;
}

type PolicyKind = "SUPPORTED" | "EVIDENCE_REQUIRED" | "REFRESH_REQUIRED" | "PROVISIONAL" | "CONFLICT" | "CAUTION_NO_COMMIT" | "RECORDED_FACT";

/** A policy produced by the REAL canonical resolver (never hand-built), so tests cannot drift from it. */
function policy(kind: PolicyKind, priorityClass: OwnerPriorityClass = "GROWTH_OPPORTUNITY"): OwnerAdvicePolicy {
  const base: OwnerAdvicePolicyInput = {
    state: "TARGET",
    primary: { source: "domain_action", priorityClass, findingCode: "F", domain: "sales", missingData: [] },
    intent: "GROW", primaryDomainLabel: "Sales",
    dataSufficiency: { status: "sufficient", lowConfidenceDomains: [], missingCriticalData: [] },
    staleDomains: [], gateCashProvisional: false, gateCashConflicting: false, missingInformation: ["x"], reassessmentTrigger: "t",
  };
  switch (kind) {
    case "SUPPORTED": return resolveOwnerAdvicePolicy({ ...base, intent: "FIX" as never });
    case "EVIDENCE_REQUIRED": return resolveOwnerAdvicePolicy({ ...base, primary: { ...base.primary!, priorityClass: "MISSING_CRITICAL_EVIDENCE" } });
    case "REFRESH_REQUIRED": return resolveOwnerAdvicePolicy({ ...base, primary: { ...base.primary!, source: "evidence_refresh" } });
    case "PROVISIONAL": return resolveOwnerAdvicePolicy({ ...base, dataSufficiency: { status: "insufficient", lowConfidenceDomains: ["sales"], missingCriticalData: ["m"] } });
    case "CONFLICT": return resolveOwnerAdvicePolicy({ ...base, primary: { ...base.primary!, source: "safety_gate", findingCode: "GATE_CASH_UNSAFE", priorityClass: "SURVIVAL_CASH" }, gateCashConflicting: true });
    case "CAUTION_NO_COMMIT": return resolveOwnerAdvicePolicy({ ...base, dataSufficiency: { status: "caution", lowConfidenceDomains: [], missingCriticalData: [] } });
    case "RECORDED_FACT": return resolveOwnerAdvicePolicy({ ...base, primary: { ...base.primary!, source: "compliance_item", priorityClass } });
  }
}

function decision(businessId: string, p: OwnerAdvicePolicy, priorityClass: OwnerPriorityClass | null = "GROWTH_OPPORTUNITY", state: OwnerDecisionState = "TARGET"): CurrentOwnerDecision {
  const primaryTarget = priorityClass && state === "TARGET"
    ? { candidateId: `c:${businessId}`, source: "domain_action", domain: "sales", domainLabel: "Sales", priorityClass, findingCode: "F", findingId: null, title: `Target ${businessId}`, explanation: "", severity: "low", status: "proposed", targetRoute: "/owner/sales" }
    : null;
  return { businessId, state, primaryTarget, advicePolicy: p } as unknown as CurrentOwnerDecision;
}

function biz(id: string, over: Partial<PortfolioBusinessInput> = {}): PortfolioBusinessInput {
  return { businessId: id, name: `Biz ${id}`, profile: profile(), ownerDecision: decision(id, policy("SUPPORTED")), staleDomains: [], ...over };
}
const recId = (inputs: PortfolioBusinessInput[]) => buildPortfolioView(inputs, { now: NOW }).investmentRecommendation?.businessId ?? null;

describe("A2 reproduction — ranking must not become permission", () => {
  it.each(["EVIDENCE_REQUIRED", "REFRESH_REQUIRED", "PROVISIONAL"] as const)("%s: no investment recommendation despite a high growth score", (kind) => {
    const v = buildPortfolioView([biz("A", { ownerDecision: decision("A", policy(kind)) })], { now: NOW });
    expect(v.ranking.bestGrowthCandidateBusinessId).toBe("A");
    expect(v.investmentRecommendation).toBeNull();
  });
  it("SAFETY_COMPLIANCE recorded fact (canMakeMaterialCommitment=true) still blocks growth investment", () => {
    const p = policy("RECORDED_FACT", "SAFETY_COMPLIANCE");
    expect(p.canMakeMaterialCommitment).toBe(true);
    const v = buildPortfolioView([biz("A", { ownerDecision: decision("A", p, "SAFETY_COMPLIANCE") })], { now: NOW });
    expect(v.ranking.bestGrowthCandidateBusinessId).toBe("A");
    expect(v.investmentRecommendation).toBeNull();
  });
});

describe("A2 — eligibility matrix", () => {
  it("eligible baseline (SUPPORTED, growth class, fresh) is recommended", () => {
    const v = buildPortfolioView([biz("A")], { now: NOW });
    expect(v.investmentRecommendation?.businessId).toBe("A");
    expect(v.investmentAssessment.status).toBe("RECOMMENDED");
  });
  it.each(["EVIDENCE_REQUIRED", "REFRESH_REQUIRED", "PROVISIONAL", "CONFLICT", "CAUTION_NO_COMMIT"] as const)("%s policy blocks and is HELD (visible)", (kind) => {
    const p = policy(kind);
    expect(p.canMakeMaterialCommitment).toBe(false);
    const v = buildPortfolioView([biz("A", { ownerDecision: decision("A", p) })], { now: NOW });
    expect(v.investmentRecommendation).toBeNull();
    expect(v.investmentAssessment.status).toBe("HELD");
    expect(v.investmentAssessment.held[0]).toMatchObject({ businessId: "A", ownerStatement: p.ownerStatement });
    expect(v.investmentAssessment.held[0].nextStep.length).toBeGreaterThan(0);
  });
  it.each([
    "SAFETY_COMPLIANCE", "SURVIVAL_CASH", "CUSTOMER_SERVICE_FAILURE", "OVERLOAD_BLOCKING", "PROFIT_LOSS", "BLOCKED_EXECUTION", "PLAN_COMMITMENT_RISK", "MISSING_CRITICAL_EVIDENCE",
  ] as const)("primary class %s blocks growth investment even when no material-decision guard applies", (cls) => {
    const v = buildPortfolioView([biz("A", { ownerDecision: decision("A", policy("SUPPORTED"), cls) })], { now: NOW });
    expect(v.investmentRecommendation).toBeNull();
    expect(v.investmentAssessment.status).toBe("HELD");
  });
  it("PROCESS_OPTIMISATION primary is eligible", () => {
    expect(recId([biz("A", { ownerDecision: decision("A", policy("SUPPORTED"), "PROCESS_OPTIMISATION") })])).toBe("A");
  });
  it("NO_OPEN_ACTIONS with a current, sufficient policy is eligible", () => {
    const p = resolveOwnerAdvicePolicy({ state: "NO_OPEN_ACTIONS", primary: null, intent: null, primaryDomainLabel: "", dataSufficiency: { status: "sufficient", lowConfidenceDomains: [], missingCriticalData: [] }, staleDomains: [], gateCashProvisional: false, gateCashConflicting: false, missingInformation: [], reassessmentTrigger: "" });
    expect(recId([biz("A", { ownerDecision: decision("A", p, null, "NO_OPEN_ACTIONS") })])).toBe("A");
  });
  it("NO_OPEN_ACTIONS + SUPPORTED: canMakeMaterialCommitment=false, guard=null, still eligible, and copy never claims a commitment is permitted", () => {
    const p = resolveOwnerAdvicePolicy({ state: "NO_OPEN_ACTIONS", primary: null, intent: null, primaryDomainLabel: "", dataSufficiency: { status: "sufficient", lowConfidenceDomains: [], missingCriticalData: [] }, staleDomains: [], gateCashProvisional: false, gateCashConflicting: false, missingInformation: [], reassessmentTrigger: "" });
    expect(p.mode).toBe("SUPPORTED");
    expect(p.canMakeMaterialCommitment).toBe(false);
    expect(ownerMaterialCommitmentGuard(p)).toBeNull();
    const v = buildPortfolioView([biz("A", { ownerDecision: decision("A", p, null, "NO_OPEN_ACTIONS") })], { now: NOW });
    expect(v.investmentRecommendation).not.toBeNull();
    expect(v.investmentRecommendation?.businessId).toBe("A");
    expect(v.investmentAssessment.status).toBe("RECOMMENDED");
    const copy = `${v.investmentRecommendation!.reason} ${v.investmentAssessment.summary}`;
    expect(copy).not.toMatch(/permits? a commitment/i);
    expect(copy).toMatch(/do not require holding a material decision/);
  });
  it("NO_OPEN_ACTIONS with insufficient data is held by the guard", () => {
    const p = resolveOwnerAdvicePolicy({ state: "NO_OPEN_ACTIONS", primary: null, intent: null, primaryDomainLabel: "", dataSufficiency: { status: "insufficient", lowConfidenceDomains: [], missingCriticalData: [] }, staleDomains: [], gateCashProvisional: false, gateCashConflicting: false, missingInformation: [], reassessmentTrigger: "" });
    expect(recId([biz("A", { ownerDecision: decision("A", p, null, "NO_OPEN_ACTIONS") })])).toBeNull();
  });
  it("NO_EVIDENCE never qualifies", () => {
    const p = resolveOwnerAdvicePolicy({ state: "NO_EVIDENCE", primary: null, intent: null, primaryDomainLabel: "", dataSufficiency: { status: "sufficient", lowConfidenceDomains: [], missingCriticalData: [] }, staleDomains: [], gateCashProvisional: false, gateCashConflicting: false, missingInformation: [], reassessmentTrigger: "" });
    expect(recId([biz("A", { ownerDecision: decision("A", p, null, "NO_EVIDENCE") })])).toBeNull();
  });
  it("NO_EVIDENCE never qualifies even if a (malformed) policy carries no guard", () => {
    expect(recId([biz("A", { ownerDecision: decision("A", policy("SUPPORTED"), null, "NO_EVIDENCE") })])).toBeNull();
  });
  it("missing ownerDecision fails closed (held, not recommended)", () => {
    const v = buildPortfolioView([biz("A", { ownerDecision: null })], { now: NOW });
    expect(v.investmentRecommendation).toBeNull();
    expect(v.investmentAssessment.status).toBe("HELD");
  });
  it("ownerDecision.businessId mismatch fails closed", () => {
    expect(recId([biz("A", { ownerDecision: decision("OTHER", policy("SUPPORTED")) })])).toBeNull();
  });
  it("unknown freshness (staleDomains absent) fails closed", () => {
    expect(recId([biz("A", { staleDomains: undefined })])).toBeNull();
  });
});

describe("A2 — quantitative criteria unchanged", () => {
  it("survival null (not measured) never qualifies; measured 0 does", () => {
    expect(recId([biz("A", { profile: profile({ survivalRiskScore: null }) })])).toBeNull();
    expect(recId([biz("A", { profile: profile({ survivalRiskScore: 0 }) })])).toBe("A");
  });
  it("survival at the bar fails; just below passes", () => {
    expect(recId([biz("A", { profile: profile({ survivalRiskScore: PORTFOLIO_THRESHOLDS.safeInvestmentSurvivalRiskBar }) })])).toBeNull();
    expect(recId([biz("A", { profile: profile({ survivalRiskScore: PORTFOLIO_THRESHOLDS.safeInvestmentSurvivalRiskBar - 1 }) })])).toBe("A");
  });
  it("growth below the minimum fails with NO_QUALIFYING_CANDIDATE (not HELD); growth 0 is measured, not missing", () => {
    const v = buildPortfolioView([biz("A", { profile: profile({ growthOpportunityScore: 0, domainScores: [ds("sales", 0)] }) })], { now: NOW });
    expect(v.investmentRecommendation).toBeNull();
    expect(v.investmentAssessment.status).toBe("NO_QUALIFYING_CANDIDATE");
    expect(v.investmentAssessment.held).toEqual([]);
  });
  it("thresholds are unchanged", () => {
    expect(PORTFOLIO_THRESHOLDS.safeInvestmentSurvivalRiskBar).toBe(50);
    expect(PORTFOLIO_THRESHOLDS.minInvestmentOpportunityScore).toBe(40);
  });
  it("a business with no profile is NO_QUALIFYING_CANDIDATE", () => {
    const v = buildPortfolioView([biz("A", { profile: null })], { now: NOW });
    expect(v.investmentAssessment.status).toBe("NO_QUALIFYING_CANDIDATE");
  });
});

describe("A2 — freshness reuses canonical staleDomains", () => {
  it("growth supported only by a stale domain is blocked (no fallback to a lower fresh score)", () => {
    const v = buildPortfolioView([biz("A", { staleDomains: ["sales"] })], { now: NOW });
    expect(v.investmentRecommendation).toBeNull();
    expect(v.investmentAssessment.status).toBe("HELD");
  });
  it("an unrelated stale domain does not block", () => {
    expect(recId([biz("A", { staleDomains: ["finance"] })])).toBe("A");
  });
  it("tie at the exact max: eligible when at least one supporting domain is current; blocked when all are stale", () => {
    const p = profile({ growthOpportunityScore: 90, domainScores: [ds("sales", 90), ds("marketing", 90)] });
    expect(recId([biz("A", { profile: p, staleDomains: ["sales"] })])).toBe("A");
    expect(recId([biz("A", { profile: p, staleDomains: ["sales", "marketing"] })])).toBeNull();
  });
  it("growth signal that cannot be traced to a domain fails closed", () => {
    expect(recId([biz("A", { profile: profile({ domainScores: [] }) })])).toBeNull();
  });
});

describe("A2 — selection among businesses", () => {
  it("a blocked top candidate does not suppress an eligible runner-up", () => {
    const a = biz("A", { profile: profile({ growthOpportunityScore: 95, domainScores: [ds("sales", 95)] }), ownerDecision: decision("A", policy("EVIDENCE_REQUIRED")) });
    const b = biz("B", { profile: profile({ growthOpportunityScore: 80, domainScores: [ds("sales", 80)] }) });
    const v = buildPortfolioView([a, b], { now: NOW });
    expect(v.ranking.bestGrowthCandidateBusinessId).toBe("A");
    expect(v.investmentRecommendation?.businessId).toBe("B");
    expect(v.investmentAssessment.status).toBe("RECOMMENDED");
    expect(v.investmentAssessment.held.map((h) => h.businessId)).toEqual(["A"]);
  });
  it("is input-order independent, tie-broken by businessId asc", () => {
    const a = biz("A"); const b = biz("B");
    expect(recId([a, b])).toBe("A");
    expect(recId([b, a])).toBe("A");
  });
  it("Business A's policy cannot affect Business B", () => {
    const blockedA = biz("A", { ownerDecision: decision("A", policy("PROVISIONAL")) });
    const solo = buildPortfolioView([biz("B")], { now: NOW }).investmentRecommendation;
    const withA = buildPortfolioView([blockedA, biz("B")], { now: NOW }).investmentRecommendation;
    expect(withA).toEqual(solo);
  });
  it("HELD only when none is eligible but some qualified; NO_QUALIFYING_CANDIDATE when none qualified", () => {
    const held = buildPortfolioView([biz("A", { ownerDecision: decision("A", policy("REFRESH_REQUIRED")) })], { now: NOW });
    expect(held.investmentAssessment.status).toBe("HELD");
    const none = buildPortfolioView([biz("A", { profile: profile({ survivalRiskScore: 90 }) })], { now: NOW });
    expect(none.investmentAssessment.status).toBe("NO_QUALIFYING_CANDIDATE");
  });
  it("held copy is plain language: no enum names, no confidence %, no absolute safety claim", () => {
    const v = buildPortfolioView([biz("A", { ownerDecision: decision("A", policy("CONFLICT", "SURVIVAL_CASH"), "SURVIVAL_CASH") })], { now: NOW });
    const text = JSON.stringify([v.investmentAssessment.summary, v.investmentAssessment.held]);
    expect(text).not.toMatch(/[A-Z]{3,}_[A-Z_]+/);
    expect(text).not.toMatch(/confidence|\d+\s?%|\bsafe\b/i);
  });
  it("ranking fields are unchanged by eligibility (bestGrowthCandidate stays a ranking)", () => {
    const v = buildPortfolioView([biz("A", { ownerDecision: decision("A", policy("EVIDENCE_REQUIRED")) })], { now: NOW });
    expect(v.ranking.bestGrowthCandidateBusinessId).toBe("A");
  });
});

describe("A2 — helper contract", () => {
  it("returns eligible:true only on the full pass", () => {
    expect(assessPortfolioInvestmentEligibility(biz("A"), PORTFOLIO_THRESHOLDS)).toEqual({ eligible: true });
  });
  it("is deterministic and does not mutate its input", () => {
    const i = biz("A", { ownerDecision: decision("A", policy("PROVISIONAL")) });
    const before = JSON.stringify(i);
    expect(assessPortfolioInvestmentEligibility(i, PORTFOLIO_THRESHOLDS)).toEqual(assessPortfolioInvestmentEligibility(i, PORTFOLIO_THRESHOLDS));
    expect(JSON.stringify(i)).toBe(before);
  });
});
