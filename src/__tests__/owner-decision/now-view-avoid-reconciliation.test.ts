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

function decisionWith(priorityClass: OwnerPriorityClass, title: string) {
  const c: OwnerDecisionCandidate = {
    candidateId: "domain_action:sales:a1", businessId: "b", workspaceId: "w", source: "domain_action", domain: "sales", sourceId: "a1",
    priorityClass, findingCode: "SALES_OPP_WINBACK", findingId: null, title, explanation: "", severity: "medium", priorityScore: 50,
    expectedImpactScore: 50, confidence: 0.8, effortScore: 30, status: "proposed", ownerActionRequired: true, blocking: false,
    evidence: [], missingData: [], verificationMetric: null, evidenceAsOf: null, stale: false, exclusion: null, targetRoute: "/owner/sales",
  };
  return resolveOwnerDecision({
    businessId: "b", workspaceId: "w", candidates: [c], diagnosedDomains: ["sales"],
    dataSufficiency: { status: "sufficient", lowestDataConfidenceScore: 90, lowConfidenceDomains: [], missingCriticalData: [] },
    staleDomains: [], strategy: null, reassessment: { days: 7, reason: "weekly" }, previous: null, events: [], domainsDiagnosedSince: [],
    now: new Date("2026-09-27T00:00:00Z"),
  });
}

describe("Now View avoid list vs the canonical main target", () => {
  it("a growth main target is never told 'do not pursue growth' — the gate becomes a precondition on how to do it", () => {
    const out = reconcileAvoidsWithOwnerDecision([growthGate, overload], decisionWith("GROWTH_OPPORTUNITY", "Launch referral offer"));
    expect(out.map((a) => a.avoid).join(" ")).not.toMatch(/Do not pursue growth/);
    expect(out[0].avoid).toBe('Do not scale "Launch referral offer" beyond a small trial until cash, profit, capacity, workload and quality gates pass');
    expect(out[1]).toEqual(overload);
  });

  it("with a non-growth main target, the growth gate is unchanged", () => {
    const out = reconcileAvoidsWithOwnerDecision([growthGate], decisionWith("PROFIT_LOSS", "Stop the discount leak"));
    expect(out).toEqual([growthGate]);
  });
});
