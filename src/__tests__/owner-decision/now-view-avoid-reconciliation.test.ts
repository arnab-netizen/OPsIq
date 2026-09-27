/**
 * Hostile review A P1-2: Now View's "do not" list must never veto the owner's canonical main target.
 * When the main target is itself a growth step, the fail-closed growth gate becomes a precondition on
 * HOW to do it (a small trial) instead of "do not pursue growth"; unrelated avoids are untouched.
 */
import { describe, it, expect } from "vitest";
import { reconcileAvoidsWithOwnerDecision } from "@/services/owner-guidance/owner-now-view.service";
import { resolveOwnerDecision, type OwnerDecisionCandidate, type OwnerPriorityClass } from "@/domain/owner-spine/owner-decision";
import type { ActionToAvoid } from "@/domain/owner-guidance/next-best-step";
import { IssueCategory } from "@/domain/owner-guidance/issue-priority";
import { BusinessFunction } from "@/domain/owner-guidance/business-function";

const growthGate: ActionToAvoid = {
  id: "avoid_growth_before_gates",
  avoid: "Do not pursue growth/expansion until cash, profit, capacity, workload and quality gates pass",
  reason: "stabilization gates are not yet satisfied; growth now compounds risk",
  businessFunction: [BusinessFunction.GROWTH_READINESS],
  triggeredBy: [IssueCategory.GROWTH_OPPORTUNITY],
};
const overload: ActionToAvoid = {
  id: "avoid_new_tasks_on_overload",
  avoid: "Do not assign new non-critical tasks to staff or the owner",
  reason: "staff/owner are already overloaded",
  businessFunction: [BusinessFunction.EMPLOYEE_WORKLOAD],
  triggeredBy: [IssueCategory.OVERLOAD],
};

function decisionWith(priorityClass: OwnerPriorityClass, title: string, domain: OwnerDecisionCandidate["domain"] = "sales") {
  const c: OwnerDecisionCandidate = {
    candidateId: `domain_action:${domain}:a1`, businessId: "b", workspaceId: "w", source: "domain_action", domain, sourceId: "a1",
    priorityClass, findingCode: "SALES_OPP_WINBACK", findingId: null, title, explanation: "", severity: "medium", priorityScore: 50,
    expectedImpactScore: 50, confidence: 0.8, effortScore: 30, status: "proposed", ownerActionRequired: true, blocking: false,
    evidence: [], missingData: [], verificationMetric: null, evidenceAsOf: null, stale: false, exclusion: null, targetRoute: "/owner/sales",
  };
  return resolveOwnerDecision({
    businessId: "b", workspaceId: "w", candidates: [c], diagnosedDomains: [domain as never],
    dataSufficiency: { status: "sufficient", lowestDataConfidenceScore: 90, lowConfidenceDomains: [], missingCriticalData: [] },
    staleDomains: [], strategy: null, reassessment: { days: 7, reason: "weekly" }, previous: null, events: [],
    now: new Date("2026-09-27T00:00:00Z"),
  });
}

describe("Now View avoid list vs the canonical main target", () => {
  it("a growth main target is never told 'do not pursue growth' — the gate becomes a precondition on how to do it", () => {
    const out = reconcileAvoidsWithOwnerDecision([growthGate, overload], decisionWith("GROWTH_OPPORTUNITY", "Launch referral offer"));
    expect(out.map((a) => a.avoid).join(" ")).not.toMatch(/Do not pursue growth/);
    expect(out[0].avoid).toBe('Do not scale "Launch referral offer" beyond a small trial until cash, profit, capacity, workload and quality gates pass');
    // Workload rule: the main target is never "new non-critical work" — it applies to everything else.
    expect(out[1]).toEqual({ ...overload, avoid: 'Apart from "Launch referral offer", do not assign new non-critical tasks to staff or the owner' });
  });

  it("every growth/marketing veto (cash danger, service failure) becomes a precondition that keeps its reason", () => {
    const cash: ActionToAvoid = { id: "avoid_growth_on_cash_danger", avoid: "Do not start a new marketing/ad campaign or expand this week", reason: "cash", businessFunction: [BusinessFunction.CASH_FLOW], triggeredBy: [IssueCategory.CASH_DANGER] };
    const service: ActionToAvoid = { id: "avoid_marketing_on_service_failure", avoid: "Do not scale marketing or acquisition before fixing service quality", reason: "service", businessFunction: [BusinessFunction.MARKETING], triggeredBy: [IssueCategory.CUSTOMER_SERVICE_FAILURE] };
    const out = reconcileAvoidsWithOwnerDecision([cash, service], decisionWith("GROWTH_OPPORTUNITY", "Add a referral ask"));
    expect(out.map((a) => a.avoid)).toEqual([
      'Keep "Add a referral ask" to a small, low-cost trial while cash is in danger — no new paid campaign or expansion this week',
      'Do not scale "Add a referral ask" beyond a small trial until service quality is fixed',
    ]);
    expect(out.map((a) => a.reason)).toEqual(["cash", "service"]);
  });

  it("with a main target that is not a demand step (operations, profit class), demand rules are unchanged", () => {
    const out = reconcileAvoidsWithOwnerDecision([growthGate], decisionWith("PROFIT_LOSS", "Cut rework on large orders", "operations"));
    expect(out).toEqual([growthGate]);
  });

  it("a Marketing/Sales REPAIR target (profit class) is not growth demand: growth, volume and discount rules stand unchanged", () => {
    const capacity: ActionToAvoid = { id: "avoid_volume_on_capacity", avoid: "Do not accept more volume than current capacity can deliver", reason: "capacity", businessFunction: [BusinessFunction.CAPACITY], triggeredBy: [IssueCategory.CAPACITY_BOTTLENECK] };
    const discount: ActionToAvoid = { id: "avoid_discount_on_cash_danger", avoid: "Do not offer discounts or take on low-margin work to chase volume", reason: "discount", businessFunction: [BusinessFunction.PRICING], triggeredBy: [IssueCategory.CASH_DANGER] };
    const out = reconcileAvoidsWithOwnerDecision([growthGate, capacity, discount], decisionWith("PROFIT_LOSS", "Follow up every enquiry within a day", "marketing"));
    expect(out).toEqual([growthGate, capacity, discount]);
  });

  it("a refresh (data-request) main target leaves every avoid unchanged, even when it stands in for a growth item", () => {
    const refresh = resolveOwnerDecision({
      businessId: "b", workspaceId: "w", diagnosedDomains: ["marketing"],
      candidates: [{
        candidateId: "domain_action:marketing:a1", businessId: "b", workspaceId: "w", source: "domain_action", domain: "marketing", sourceId: "a1",
        priorityClass: "GROWTH_OPPORTUNITY", findingCode: "MKT_LOW_REFERRAL", findingId: null, title: "Add a referral ask", explanation: "", severity: "medium",
        priorityScore: 50, expectedImpactScore: 50, confidence: 0.8, effortScore: 30, status: "proposed", ownerActionRequired: true, blocking: false,
        evidence: [], missingData: [], verificationMetric: null, evidenceAsOf: null, stale: true, exclusion: null, targetRoute: "/owner/marketing",
      }],
      dataSufficiency: { status: "sufficient", lowestDataConfidenceScore: 90, lowConfidenceDomains: [], missingCriticalData: [] },
      staleDomains: ["marketing"], strategy: null, reassessment: { days: 7, reason: "weekly" }, previous: null, events: [],
      now: new Date("2026-09-27T00:00:00Z"),
    });
    expect(refresh.primaryTarget?.source).toBe("evidence_refresh");
    expect(reconcileAvoidsWithOwnerDecision([growthGate, overload], refresh)).toEqual([growthGate, overload]);
  });
});
