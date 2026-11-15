/**
 * P2 regressions — secondary-system imperatives beside the ONE canonical decision.
 *
 *  - Whole-business superlatives/imperatives ("before anything else", "outranks everything", "Do not
 *    act", "the single thing most holding the business back") are removed at their SOURCE producers.
 *  - Guardrails name intent/lever, never a domain, so a Marketing/Sales repair target is not forbidden
 *    by wording; Recovery's growth blocks constrain GROW only, via the shared reconciler.
 *  - The reconciler covers the main target AND supporting steps; a condition states the permitted
 *    scope of the step it qualifies and never forbids it.
 *  - The plan `cash_margin` card and the Recovery fallback reconcile against primary + supporting.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  ownerImperativeContext,
  planConstraintAsCondition,
  reconcilePlanCards,
  reconcilePlanProse,
  reconcileRecoveryBlocks,
  reconcileRecoveryGrowthGate,
  domainDataGapNotice,
} from "@/domain/owner-spine/owner-imperatives";
import { resolveOwnerDecision, classifyOwnerFindingCode, type OwnerDecisionCandidate } from "@/domain/owner-spine/owner-decision";
import { reconcileAvoidsWithOwnerDecision } from "@/services/owner-guidance/owner-now-view.service";
import { deriveActionsToAvoid } from "@/domain/owner-guidance/next-best-step";
import { IssueCategory } from "@/domain/owner-guidance/issue-priority";
import { buildOwnerControlCenter } from "@/domain/owner-mode/owner-control-center";
import { planBusinessSurvivalRecovery } from "@/domain/owner-mode/business-survival-recovery";
import { NO_CHANGE_FACTS } from "@/__tests__/owner-decision/change-facts-fixture";

const ROOT = process.cwd();
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

function cand(p: Partial<OwnerDecisionCandidate> & { findingCode: string; title: string }): OwnerDecisionCandidate {
  return {
    candidateId: `domain_action:${p.findingCode}`, businessId: "b", workspaceId: "w", source: "domain_action", domain: p.domain ?? "marketing",
    sourceId: p.findingCode, priorityClass: classifyOwnerFindingCode(p.findingCode), findingId: null, explanation: "", severity: "high",
    priorityScore: 50, expectedImpactScore: 50, confidence: 0.9, effortScore: 30, status: "proposed", ownerActionRequired: true, blocking: false,
    evidence: [], missingData: [], verificationMetric: null, evidenceAsOf: null, stale: false, exclusion: null, targetRoute: "/owner/marketing", ...p,
  };
}

function decide(candidates: OwnerDecisionCandidate[]) {
  return resolveOwnerDecision({
    businessId: "b", workspaceId: "w", candidates, diagnosedDomains: ["marketing", "finance"],
    dataSufficiency: { status: "sufficient", lowestDataConfidenceScore: 90, lowConfidenceDomains: [], missingCriticalData: [] },
    staleDomains: [], strategy: null, reassessment: { days: 7, reason: "r" }, changeFacts: NO_CHANGE_FACTS, now: new Date("2026-09-27T00:00:00Z"),
  });
}

describe("P2 — whole-business superlatives are gone at their source producers", () => {
  const PRODUCERS = [
    "src/domain/owner-mode/supervisor-summary.ts",
    "src/domain/owner-mode/command-center-priorities.ts",
    "src/domain/owner-mode/business-survival-recovery.ts",
    "src/domain/owner-mode/owner-recovery-status.ts",
    "src/domain/owner-mode/owner-control-center.ts",
    "src/domain/owner-guidance/next-best-step.ts",
    "src/services/owner-guidance/owner-now-view.service.ts",
    "src/domain/owner-guidance/guidance-orchestrator.ts",
    "src/domain/owner-spine/owner-decision.ts",
  ];
  const BANNED = [
    /before anything else/i, /outranks everything/i, /before any other problem/i, /Do not act —/, /single thing most holding/i,
    // Domain-worded vetoes (guardrails name intent/lever, never a domain).
    /growth\/marketing/i, /marketing\/growth/i, /marketing\/ad campaign/i, /growth\/expansion/i, /pursue growth/i,
    /growth or investment work/i, /commit to growth/i, /growth remains blocked/i, /scale marketing/i,
  ];

  it.each(PRODUCERS)("%s emits none of the banned superlatives / domain-worded vetoes", (file) => {
    const src = stripComments(readFileSync(join(ROOT, file), "utf8"));
    for (const re of BANNED) expect(src, `${file} ${re}`).not.toMatch(re);
  });

  it("the Recovery caveat carries no growth veto", async () => {
    const src = stripComments(readFileSync(join(ROOT, "src/domain/owner-mode/owner-recovery-status.ts"), "utf8"));
    expect(src).not.toMatch(/growth remains blocked/i);
  });

  it("Recovery's growth temptations are named by intent/lever, never 'marketing before …'", () => {
    const plan = planBusinessSurvivalRecovery({
      crisisCaseId: "c", workspaceArchetype: "laundry_local_service", cashPressure: "HIGH", revenuePressure: "NONE", customerPressure: "NONE",
      qualityPressure: "NONE", operationalPressure: "NONE", staffCapacityPressure: "NONE", ownerWorkloadPressure: "NONE",
      legalContractTenderRisk: "NONE", opportunityTemptation: "MARKETING",
    } as never);
    expect(plan).not.toBeNull();
    const blocked = plan!.blockedUnsafeActions;
    expect(blocked).toContain("scaling acquisition spend before stabilization + validation");
    expect(blocked.join(" ")).not.toMatch(/marketing before/i);
    expect(plan!.survivalTopAction.title ?? "").not.toMatch(/before anything else/i);
  });
});

describe("P2 — Recovery fallback and blocks reconcile against primary + supporting, GROW only", () => {
  const blocks = [
    "Scaling (acquisition spend, campaign expansion, new launches) stays blocked until stabilization is proven.",
    "scaling acquisition spend before stabilization + validation",
    "auto customer/tenant/buyer contact or auto-send of any draft",
  ];

  it("a Marketing REPAIR target is untouched: blocks stand as-is and none names the Marketing domain", () => {
    const ctx = ownerImperativeContext(decide([cand({ findingCode: "MKT_WASTED_SPEND", title: "Stop the loss-making spend" })]));
    const r = reconcileRecoveryBlocks(blocks, ctx);
    expect(r).toEqual({ blocked: blocks, conditions: [] });
    expect(r.blocked.join(" ")).not.toMatch(/marketing/i);
  });

  it("a GROW supporting step (not only the main target) turns the growth blocks into ONE condition on it", () => {
    const d = decide([
      cand({ findingCode: "MKT_WASTED_SPEND", title: "Stop the loss-making spend", severity: "critical" }),
      cand({ findingCode: "MKT_OPP_SCALE_WINNER", title: "Scale the winning campaign", severity: "low" }),
    ]);
    expect(d.supportingSteps.map((t) => t.title)).toEqual(["Scale the winning campaign"]);
    const r = reconcileRecoveryBlocks(blocks, ownerImperativeContext(d));
    expect(r.conditions).toEqual(['Run only the next validated step of "Scale the winning campaign", within its existing budget, until stabilisation is proven.']);
    expect(r.blocked).toEqual([blocks[2]]);
    expect(reconcileRecoveryGrowthGate("Growth blocked until stabilization", ownerImperativeContext(d))).toBe(
      'Growth blocked until stabilization — "Scale the winning campaign" runs only as a validated next step until then'
    );
  });
});

describe("P2 — supporting-step guardrail reconciliation and conditions that never forbid their target", () => {
  const supportingGrowth = () => decide([
    cand({ findingCode: "MKT_WASTED_SPEND", title: "Stop the loss-making spend", severity: "critical" }),
    cand({ findingCode: "MKT_OPP_SCALE_WINNER", title: "Scale the winning campaign", severity: "low" }),
  ]);

  it("Now View: growth/volume/discount avoids touching a GROW SUPPORTING step become conditions on it (never a veto)", () => {
    const avoids = deriveActionsToAvoid([
      { category: IssueCategory.CASH_DANGER, severity: "HIGH" },
      { category: IssueCategory.CUSTOMER_SERVICE_FAILURE, severity: "HIGH" },
      { category: IssueCategory.CAPACITY_BOTTLENECK, severity: "HIGH" },
    ] as never);
    const out = reconcileAvoidsWithOwnerDecision(avoids, supportingGrowth());
    const conditions = out.filter((a) => a.conditionOn);
    expect(conditions.map((a) => a.id).sort()).toEqual(["avoid_discount_on_cash_danger", "avoid_growth_on_cash_danger", "avoid_marketing_on_service_failure", "avoid_volume_on_capacity"].sort());
    for (const c of conditions) {
      expect(c.conditionOn).toEqual(["Scale the winning campaign"]);
      // The permitted scope of the step — never a "do not" that forbids it.
      expect(c.avoid).toMatch(/"Scale the winning campaign"/);
      expect(c.avoid).not.toMatch(/^(Do not|Don't)\b/);
    }
    // The hiring rule names no target work: kept as a prohibition.
    expect(out.find((a) => a.id === "avoid_hire_on_cash_danger")?.conditionOn).toBeUndefined();
  });

  it("Control center: a capacity/spend guardrail touching a GROW supporting step becomes its permitted scope", () => {
    const d = supportingGrowth();
    const cc = buildOwnerControlCenter({
      dataSufficiencyStatus: "sufficient", lowConfidenceDomains: [], blockedRecommendations: 0, proofBlocked: 0, financeBlocked: 1,
      sopsNeedingReview: 0, trainingRecommendations: 0, equipmentBottlenecks: ["Oven"], processReviewsDue: 0, ownerApprovalsRequired: 0,
      reassessmentsDue: 0, approvalsAvoided: 0, attention: { criticalUnresolved: 0, ownerDecisionsRequired: 0, handledByOpsIQ: 0 } as never,
      mainTarget: d.primaryTarget!, supportingSteps: d.supportingSteps,
    });
    expect(cc.whatNotToDo).toEqual([]);
    expect(cc.conditions).toEqual([
      'Run "Scale the winning campaign" only within its existing budget and at normal prices while cash/margin guardrails are blocking.',
      'Run "Scale the winning campaign" only up to what current capacity can deliver until the bottleneck is cleared.',
    ]);
  });

  it("the decision's own growth guard: a same-lever growth item is positive guidance in `conditions`, never in whatNotToDo", () => {
    const d = decide([
      cand({ findingCode: "MKT_NO_FOLLOWUP", title: "Add follow-up to every campaign", severity: "high" }),
      cand({ findingCode: "FIN_HIGH_RECEIVABLES", title: "Collect overdue invoices", domain: "finance", severity: "medium" }),
      cand({ findingCode: "MKT_OPP_ADD_FOLLOWUP", title: "Capture demand with follow-up", severity: "low" }),
    ]);
    expect(d.whatNotToDo.join(" ")).not.toMatch(/follow-up/);
    expect(d.conditions).toHaveLength(1);
    expect(d.conditions[0]).toMatch(/^"Capture demand with follow-up" moves the same lever as "Add follow-up to every campaign"/);
  });
});

describe("P2 — the plan's cash_margin card is context for the canonical steps, never a second 'do this first'", () => {
  it("its step is replaced by the context note and its wording carries no superlative", () => {
    const d = decide([cand({ findingCode: "MKT_OPP_SCALE_WINNER", title: "Scale the winning campaign" })]);
    const [card] = reconcilePlanCards([{ id: "cash_margin", whatIsWrong: "A cash or margin domain is in the red.", whyItMatters: "Financial risk can threaten survival; your main business target above decides what comes first.", nextStep: "Pause all marketing now" }], ownerImperativeContext(d));
    expect(card.nextStep).toBe("Context for your main target, not a separate instruction.");
    expect(`${card.whatIsWrong} ${card.whyItMatters}`).not.toMatch(/before anything else/i);
  });
});

describe("P2 — low-data Finance page: consistent with the canonical decision (never 'don't act' on the main target)", () => {
  it("owning a canonical step: the issue needs attention; only the score is provisional", () => {
    expect(domainDataGapNotice("Finance", ["cash on hand"], true, "should not be acted on")).toBe("The Finance issue needs attention now, but its numerical score is provisional until cash on hand is supplied.");
    expect(domainDataGapNotice("Finance", ["cash on hand"], false, "fallback caution")).toBe("fallback caution");
  });

  it("the Finance page renders the shared notice (never a hard-coded 'should not be acted on' beside its own main target)", () => {
    const page = readFileSync(join(ROOT, "src/app/(authenticated)/owner/finance/page.tsx"), "utf8");
    expect(page).toMatch(/<DomainDataGapNotice\s+revision=\{cycle\}\s+domain="finance"/);
  });
});

describe("P2 — the target is visible on the destination domain page", () => {
  it.each(["finance", "cashflow", "sales", "operations", "execution", "marketing", "strategy"])("the %s page renders the canonical main-target context", (page) => {
    const src = readFileSync(join(ROOT, `src/app/(authenticated)/owner/${page}/page.tsx`), "utf8");
    // The page's data is the revision: every reload after a mutation refetches the canonical decision.
    expect(src).toMatch(/<DomainMainTargetContext domain="[a-z]+" businessId=\{dashboard\?\.selectedBusinessId\} revision=\{dashboard\} \/>/);
  });

  it("the decision card's go link lands on the domain page's main-target anchor", () => {
    const src = readFileSync(join(ROOT, "src/components/owner/OwnerDecisionCard.tsx"), "utf8");
    expect(src).toMatch(/href=\{ownerTargetHref\(p\)\}/);
    const home = readFileSync(join(ROOT, "src/app/(authenticated)/owner/home/page.tsx"), "utf8");
    expect(home).toMatch(/href=\{i === 0 \? ownerTargetHref\(a\) : a\.targetRoute\}/);
    const priorities = readFileSync(join(ROOT, "src/app/(authenticated)/owner/priorities/page.tsx"), "utf8");
    expect(priorities).toMatch(/href=\{i === 0 \? ownerTargetHref\(t\) : t\.targetRoute\}/);
    const ctx = readFileSync(join(ROOT, "src/components/owner/DomainMainTargetContext.tsx"), "utf8");
    expect(ctx).toMatch(/OWNER_MAIN_TARGET_ANCHOR = "main-target"/);
  });
});

describe("P2 — plan analysis never instructs beside the canonical decision (constraints, prose, cards)", () => {
  const grow = () => ownerImperativeContext(decide([cand({ findingCode: "MKT_OPP_SCALE_WINNER", title: "Scale the winning campaign" })]));

  it("a plan stop item becomes a description with the GROW step's permitted scope — no 'do not' inside the condition", () => {
    const out = planConstraintAsCondition("Do not: Raise ad spend 3x (blocked by cash_survival)", grow());
    expect(out).toBe('Plan constraint (context, not an instruction): the plan analysis holds back Raise ad spend 3x (blocked by cash survival). Where "Scale the winning campaign" touches it, run only the next validated step within the existing budget.');
    expect(out).not.toMatch(/\b(do not|don't|stop)\b/i);
  });

  it("plan prose: imperatives and 'first' become description, reconciled against the GROW step", () => {
    const out = reconcilePlanProse("Do not scale yet — gates failing: cash_survival. Stabilise first, then re-test the growth gates.", grow());
    expect(out).not.toMatch(/\b(do not|don't)\b/i);
    expect(out).not.toMatch(/\bfirst\b/i);
    expect(out).toMatch(/^Plan analysis \(context\): the plan analysis holds back scale yet — gates failing: cash survival\. Stabilise, then re-test the growth gates\./);
    expect(out).toMatch(/Where "Scale the winning campaign" touches it, run only the next validated step within the existing budget\.$/);
  });

  it("the stop card no longer calls itself a stop instruction", () => {
    const [card] = reconcilePlanCards([{ id: "do_not_do", whatIsWrong: "Stop: Pause marketing spend", whyItMatters: "x", nextStep: "Hold this action until the constraint above is cleared.", proof: "No proof needed — this is a stop instruction." }], grow());
    expect(card.proof).toBe("Not an action — context for your canonical steps.");
    expect(JSON.stringify(card)).not.toMatch(/stop instruction|Hold this/);
  });

  it("the discount guardrail is never folded into the scale condition (it stays a prohibition)", () => {
    const r = reconcileRecoveryBlocks(["scaling acquisition spend before stabilization + validation", "discount before margin/cash impact is known"], grow());
    expect(r.blocked).toEqual(["discount before margin/cash impact is known"]);
    expect(r.conditions).toHaveLength(1);
  });

  it("an OPEN growth gate adds no limit to the growth step", () => {
    expect(reconcileRecoveryGrowthGate("ELIGIBLE", grow(), false)).toBe("ELIGIBLE");
    expect(reconcileRecoveryGrowthGate("BLOCKED", grow(), true)).toMatch(/runs only as a validated next step until then$/);
  });

  it("the producers' plan cards carry no 'main target above' claim of their own (the reconciler adds context only beside a decision)", () => {
    const src = stripComments(readFileSync(join(ROOT, "src/domain/owner-mode/command-center-priorities.ts"), "utf8"));
    expect(src).not.toMatch(/main business target above/);
  });
});
