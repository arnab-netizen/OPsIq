/**
 * P1 — Command Center plan analysis cannot veto the canonical target. Only CurrentOwnerDecision issues
 * whole-business imperatives: the page passes the plan analysis through the shared reconciler, so the
 * rendered supervisor summary and plan checkpoints carry constraints and suggestions, never "Stop:",
 * "Do not act" or "Hold this" orders beside the decision.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { readFileSync } from "fs";
import { join } from "path";
import { SupervisorSummary, type SupervisorSummaryView } from "@/components/owner/SupervisorSummary";
import { PriorityCommandStrip } from "@/components/owner/PriorityCommandStrip";
import { ownerImperativeContext, reconcilePlanCards, reconcilePlanSummary } from "@/domain/owner-spine/owner-imperatives";
import { resolveOwnerDecision } from "@/domain/owner-spine/owner-decision";
import { NO_CHANGE_FACTS } from "@/__tests__/owner-decision/change-facts-fixture";

afterEach(() => cleanup());

const DECISION = resolveOwnerDecision({
  businessId: "b", workspaceId: "w", diagnosedDomains: ["marketing"],
  candidates: [{
    candidateId: "domain_action:marketing:a1", businessId: "b", workspaceId: "w", source: "domain_action", domain: "marketing", sourceId: "a1",
    priorityClass: "GROWTH_OPPORTUNITY", findingCode: "MKT_OPP_SCALE_WINNER", findingId: null, title: "Scale the winning campaign", explanation: "",
    severity: "medium", priorityScore: 50, expectedImpactScore: 50, confidence: 0.8, effortScore: 30, status: "proposed", ownerActionRequired: true,
    blocking: false, evidence: [], missingData: [], verificationMetric: null, evidenceAsOf: null, stale: false, exclusion: null, targetRoute: "/owner/marketing",
  }],
  dataSufficiency: { status: "sufficient", lowestDataConfidenceScore: 90, lowConfidenceDomains: [], missingCriticalData: [] },
  staleDomains: [], strategy: null, reassessment: { days: 7, reason: "weekly" }, changeFacts: NO_CHANGE_FACTS, now: new Date("2026-09-27T00:00:00Z"),
});

const SUPERVISOR: SupervisorSummaryView = {
  found: true, emergency: false, mainIssue: "Cash runway is short", whyItMatters: "x", doNow: "Cut costs", doNotDo: ["Pause marketing spend"],
  ownerDecisionRequired: null, delegateToStaff: [], opsiqPreparedWork: [], proofNeeded: [], confidence: "medium", actionStatus: "blocked", canProceed: false,
  ledger: { knownFacts: [], assumptions: [], missingData: [], confidenceReason: "", whatWouldChange: "" },
  impact: [], supportingFigures: [], missingForQuantification: [],
  cadence: { now: "Cut costs", today: "—", thisWeek: "Stabilise", reassessmentTrigger: "weekly", kpiWatch: "runway", stopLoss: "The plan's suggested action is gated until its gate clears.", nextReview: "weekly" },
  topPriorities: [
    { severity: "high", whatIsWrong: "Biggest constraint: cash runway.", doNext: "Cut costs" },
    { severity: "high", whatIsWrong: "Stop: Pause marketing spend", doNext: "Hold this until the constraint above clears." },
  ],
};
const CARDS = [
  { id: "do_not_do", severity: "high" as const, whatIsWrong: "Stop: Pause marketing spend", whyItMatters: "Doing this now would make the dominant constraint worse.", nextStep: "Hold this action until the constraint above is cleared.", owner: "Owner", proof: "—", reassess: "—", confidenceNote: "—" },
];

describe("Command Center plan analysis beside the canonical decision", () => {
  it("renders constraints, never whole-business stop / do-not / hold orders", () => {
    const ctx = ownerImperativeContext(DECISION);
    const { container } = render(<>
      <SupervisorSummary summary={reconcilePlanSummary(SUPERVISOR, ctx)} />
      <PriorityCommandStrip cards={reconcilePlanCards(CARDS, ctx)} />
    </>);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/Stop:/);
    expect(text).not.toMatch(/Do not act/);
    expect(text).not.toMatch(/Hold this/);
    expect(text).not.toMatch(/Do not:/);
    expect(text).toMatch(/Plan constraint \(context, not an instruction\): the plan analysis holds back: Pause marketing spend\. Where "Scale the winning campaign" touches it, run only the next validated step within the existing budget\./);
    expect(text).not.toMatch(/stop instruction/);
  });

  it("the Command Center page passes the plan analysis through the shared reconciler (never raw)", () => {
    const src = readFileSync(join(process.cwd(), "src/app/(authenticated)/owner/page.tsx"), "utf8");
    expect(src).toMatch(/<SupervisorSummary summary=\{reconcilePlanSummary\(wbp\.supervisor, imperativeCtx\)\} \/>/);
    expect(src).toMatch(/<PriorityCommandStrip cards=\{reconcilePlanCards\(priorities\.cards, imperativeCtx\)\} \/>/);
    expect(src).toMatch(/planConstraintAsCondition\(x, imperativeCtx\)/);
    expect(src).toMatch(/reconcilePlanGrowthGate\(wbp\.growth, imperativeCtx\)/);
    expect(src).not.toMatch(/wbp\.growth\.scaleAllowed \? "scale allowed/);
  });
});
