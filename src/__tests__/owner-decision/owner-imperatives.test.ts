/**
 * Target intent, business lever and the ONE owner-imperative reconciler.
 *
 * P1 regressions:
 *   - a Sales/Marketing REPAIR target is not treated as growth demand (domain is never intent);
 *   - a same-lever target and prohibition never contradict each other;
 *   - Command Center plan analysis cannot veto the canonical target (its imperatives become constraints).
 * P2 regressions: Recovery no-scaling reconciliation; Finance confidence warning reconciliation;
 * refresh target vs the genuine missing-data guardrail.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  OWNER_LEVER_CODES,
  OWNER_TARGET_INTENTS,
  ownerFindingIntent,
  ownerImperativeContext,
  ownerLeverKey,
  ownerTargetIntent,
  planConstraintAsCondition,
  reconcileOwnerProhibition,
  reconcilePlanCards,
  reconcilePlanGrowthGate,
  reconcilePlanSummary,
  reconcileRecoveryBlocks,
} from "@/domain/owner-spine/owner-imperatives";
import {
  OWNER_PRIORITY_CLASS_BY_CODE,
  classifyOwnerFindingCode,
  resolveOwnerDecision,
  type OwnerDecisionCandidate,
  type ResolveOwnerDecisionInput,
} from "@/domain/owner-spine/owner-decision";
import { reconcileAvoidsWithOwnerDecision } from "@/services/owner-guidance/owner-now-view.service";
import { buildOwnerControlCenter } from "@/domain/owner-mode/owner-control-center";
import type { ActionToAvoid } from "@/domain/owner-guidance/next-best-step";
import { IssueCategory } from "@/domain/owner-guidance/issue-priority";
import { BusinessFunction } from "@/domain/owner-guidance/business-function";

const CTX = { businessId: "b", workspaceId: "w" };

function cand(p: Partial<OwnerDecisionCandidate> & { findingCode: string; title: string; domain: OwnerDecisionCandidate["domain"] }): OwnerDecisionCandidate {
  return {
    candidateId: p.candidateId ?? `domain_action:${p.domain}:${p.findingCode}`, ...CTX, source: p.source ?? "domain_action", domain: p.domain, sourceId: p.findingCode,
    priorityClass: p.priorityClass ?? classifyOwnerFindingCode(p.findingCode), findingCode: p.findingCode, findingId: null, title: p.title, explanation: "",
    severity: p.severity === undefined ? "high" : p.severity, priorityScore: p.priorityScore ?? 60, expectedImpactScore: 50, confidence: p.confidence ?? 0.9, effortScore: 30,
    status: "proposed", ownerActionRequired: true, blocking: false, evidence: [], missingData: [], verificationMetric: null, evidenceAsOf: null, stale: p.stale ?? false,
    exclusion: null, targetRoute: `/owner/${p.domain}`,
  };
}

function input(candidates: OwnerDecisionCandidate[], over: Partial<ResolveOwnerDecisionInput> = {}): ResolveOwnerDecisionInput {
  return {
    ...CTX, candidates, diagnosedDomains: ["finance", "sales", "marketing", "operations"],
    dataSufficiency: { status: "sufficient", lowestDataConfidenceScore: 90, lowConfidenceDomains: [], missingCriticalData: [] },
    staleDomains: [], strategy: null, reassessment: { days: 7, reason: "r" }, previous: null, events: [], now: new Date("2026-09-27T00:00:00Z"), ...over,
  };
}

const avoid = (id: string, text: string): ActionToAvoid => ({ id, avoid: text, reason: `${id} reason`, businessFunction: [BusinessFunction.GROWTH_READINESS], triggeredBy: [IssueCategory.GROWTH_OPPORTUNITY] });
const GROWTH_GATE = avoid("avoid_growth_before_gates", "Do not pursue growth/expansion until cash, profit, capacity, workload and quality gates pass");
const SERVICE = avoid("avoid_marketing_on_service_failure", "Do not scale marketing or acquisition before fixing service quality");
const CASH = avoid("avoid_growth_on_cash_danger", "Do not start a new marketing/ad campaign or expand this week");
const HIRE = avoid("avoid_hire_on_cash_danger", "Do not hire until payroll affordability is proven");

describe("target intent — from canonical class/finding semantics, never the domain", () => {
  it("brief examples", () => {
    expect(ownerFindingIntent("MKT_WASTED_SPEND")).toBe("REPAIR");
    expect(ownerFindingIntent("SALES_HIGH_COMPLAINT_RATIO")).toBe("REPAIR");
    expect(ownerFindingIntent("MKT_OPP_SCALE_WINNER")).toBe("GROW");
    expect(ownerFindingIntent("SALES_OPP_CONVERT_PIPELINE")).toBe("GROW");
    expect(ownerFindingIntent("FIN_INSOLVENT_RUNWAY")).toBe("STABILISE");
    expect(ownerFindingIntent("SALES_MISSING_CRITICAL_DATA")).toBe("EVIDENCE");
    expect(ownerFindingIntent("STR_MISSING_CASH")).toBe("EVIDENCE");
    expect(ownerTargetIntent({ source: "evidence_refresh", priorityClass: "GROWTH_OPPORTUNITY", findingCode: "EVIDENCE_REFRESH" })).toBe("EVIDENCE");
  });

  it("is total over every classified finding code, and GROW only for genuine growth work", () => {
    for (const [code, cls] of Object.entries(OWNER_PRIORITY_CLASS_BY_CODE)) {
      const intent = ownerFindingIntent(code);
      expect(OWNER_TARGET_INTENTS).toContain(intent);
      if (intent === "GROW") expect(cls === "GROWTH_OPPORTUNITY" || code === "OPS_OPP_USE_CAPACITY_HEADROOM", code).toBe(true);
      if (cls === "PROFIT_LOSS" || cls === "CUSTOMER_SERVICE_FAILURE") expect(intent, code).toBe("REPAIR");
    }
  });

  it("every Sales/Marketing code that is not growth-class is not GROW (domain never decides)", () => {
    const salesMarketing = Object.keys(OWNER_PRIORITY_CLASS_BY_CODE).filter((c) => /^(SALES|MKT)_/.test(c) && OWNER_PRIORITY_CLASS_BY_CODE[c] !== "GROWTH_OPPORTUNITY");
    expect(salesMarketing.length).toBeGreaterThan(5);
    for (const c of salesMarketing) expect(ownerFindingIntent(c), c).not.toBe("GROW");
  });
});

describe("business lever — a fixed map proven by the rule definitions", () => {
  // code → sourceMetric, read from the rule files that emit each code.
  const RULE_FILES = ["finance", "cashflow", "sales", "operations", "sop", "marketing", "strategy"].flatMap((d) =>
    ["risk-rules.ts", "opportunity-rules.ts"].map((f) => join(process.cwd(), `src/domain/owner-${d}/${f}`))
  );
  const metricsByCode = new Map<string, Set<string>>();
  for (const file of RULE_FILES) {
    const src = readFileSync(file, "utf8");
    const re = /code:\s*"([A-Z0-9_]+)"[\s\S]{0,600}?sourceMetric:\s*"([A-Za-z0-9_]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) metricsByCode.set(m[1], new Set([...(metricsByCode.get(m[1]) ?? []), m[2]]));
  }

  it("every lever groups codes whose rules measure one shared source metric", () => {
    for (const [lever, codes] of Object.entries(OWNER_LEVER_CODES)) {
      expect(codes.length, lever).toBeGreaterThanOrEqual(2);
      const shared = codes.map((c) => metricsByCode.get(c) ?? new Set<string>()).reduce((a, b) => new Set([...a].filter((x) => b.has(x))));
      expect(shared.size, `${lever}: ${codes.join(", ")}`).toBeGreaterThan(0);
    }
  });

  it("the brief's follow-up example is one lever; unrelated survival findings are not", () => {
    expect(ownerLeverKey("MKT_NO_FOLLOWUP")).toBe("marketing_followup");
    expect(ownerLeverKey("MKT_OPP_ADD_FOLLOWUP")).toBe("marketing_followup");
    expect(ownerLeverKey("FIN_INSOLVENT_RUNWAY")).not.toBe(ownerLeverKey("FIN_HIGH_PAYABLES"));
    expect(ownerLeverKey("EVIDENCE_REFRESH")).toBeNull();
  });
});

describe("P1 — a Sales/Marketing REPAIR target is not treated as growth demand", () => {
  it("Now View: a complaint-fix (Sales) target keeps 'don't scale marketing before fixing service' unchanged", () => {
    const d = resolveOwnerDecision(input([cand({ findingCode: "SALES_HIGH_COMPLAINT_RATIO", title: "Fix the top complaint driver", domain: "sales" })]));
    expect(reconcileAvoidsWithOwnerDecision([SERVICE, GROWTH_GATE], d)).toEqual([SERVICE, GROWTH_GATE]);
  });

  it("Now View: a wasted-spend (Marketing) target is never capped to 'a small trial'", () => {
    const d = resolveOwnerDecision(input([cand({ findingCode: "MKT_WASTED_SPEND", title: "Stop the loss-making spend", domain: "marketing" })]));
    const out = reconcileAvoidsWithOwnerDecision([CASH, GROWTH_GATE], d);
    expect(out.map((a) => a.avoid).join(" ")).not.toMatch(/small trial|small, low-cost trial/);
    expect(out).toEqual([CASH, GROWTH_GATE]);
  });

  it("Now View: a genuine GROW target turns growth vetoes into conditions that keep their reason", () => {
    const d = resolveOwnerDecision(input([cand({ findingCode: "MKT_OPP_SCALE_WINNER", title: "Scale the winning campaign", domain: "marketing" })]));
    const out = reconcileAvoidsWithOwnerDecision([CASH, SERVICE, HIRE], d);
    expect(out[0].avoid).toBe('Keep "Scale the winning campaign" to a small, low-cost trial while cash is in danger — no new paid campaign or expansion this week');
    expect(out[1].avoid).toBe('Do not scale "Scale the winning campaign" beyond a small trial until service quality is fixed');
    expect(out[2]).toEqual(HIRE); // the hiring rule names no target work
    expect(out.map((a) => a.reason)).toEqual([CASH.reason, SERVICE.reason, HIRE.reason]);
  });

  it("Control center: a Marketing repair target leaves growth/spend guardrails as they are", () => {
    const cc = buildOwnerControlCenter({
      dataSufficiencyStatus: "sufficient", lowConfidenceDomains: [], blockedRecommendations: 0, proofBlocked: 0, financeBlocked: 1,
      sopsNeedingReview: 0, trainingRecommendations: 0, equipmentBottlenecks: ["Oven"], processReviewsDue: 0, ownerApprovalsRequired: 0,
      reassessmentsDue: 0, approvalsAvoided: 0,
      attention: { criticalUnresolved: 0, ownerDecisionsRequired: 0, handledByOpsIQ: 0 } as never,
      mainTarget: { title: "Stop the loss-making spend", priorityClass: "PROFIT_LOSS", source: "domain_action", findingCode: "MKT_WASTED_SPEND" },
    });
    expect(cc.whatNotToDo).toEqual([
      "Do not spend or discount while cash/margin guardrails are blocking.",
      "Do not pursue growth/marketing until the capacity bottleneck is cleared.",
    ]);
  });
});

describe("P1 — a same-lever target and prohibition never contradict each other", () => {
  it("target MKT_NO_FOLLOWUP with an open MKT_OPP_ADD_FOLLOWUP: the decision never says not to add follow-up", () => {
    const d = resolveOwnerDecision(input([
      cand({ findingCode: "MKT_NO_FOLLOWUP", title: "Add follow-up to every campaign", domain: "marketing", severity: "high" }),
      cand({ findingCode: "FIN_HIGH_RECEIVABLES", title: "Collect overdue invoices", domain: "finance", severity: "medium" }),
      cand({ findingCode: "MKT_OPP_ADD_FOLLOWUP", title: "Capture demand with follow-up", domain: "marketing", severity: "low" }),
    ]));
    expect(d.primaryTarget?.findingCode).toBe("MKT_NO_FOLLOWUP");
    const text = d.whatNotToDo.join(" ");
    expect(text).not.toMatch(/Don't start growth or investment work such as "Capture demand with follow-up"/);
    expect(text).toMatch(/"Capture demand with follow-up" moves the same lever as "Add follow-up to every campaign"/);
  });

  it("a DIFFERENT-lever growth item is still held back behind the target", () => {
    const d = resolveOwnerDecision(input([
      cand({ findingCode: "MKT_NO_FOLLOWUP", title: "Add follow-up to every campaign", domain: "marketing", severity: "high" }),
      cand({ findingCode: "FIN_HIGH_RECEIVABLES", title: "Collect overdue invoices", domain: "finance", severity: "medium" }),
      cand({ findingCode: "MKT_OPP_SCALE_WINNER", title: "Scale the winning campaign", domain: "marketing", severity: "low" }),
    ]));
    expect(d.whatNotToDo).toContain('Don\'t start growth or investment work such as "Scale the winning campaign" until "Add follow-up to every campaign" is handled.');
  });

  it("the shared reconciler converts a lever-matching prohibition into a condition on the matching target", () => {
    const ctx = ownerImperativeContext({ primaryTarget: { title: "Add follow-up", source: "domain_action", priorityClass: "PROFIT_LOSS", findingCode: "MKT_NO_FOLLOWUP" }, supportingSteps: [] });
    const r = reconcileOwnerProhibition({ text: "Don't add follow-up", vetoes: "NONE", levers: ["marketing_followup"], asCondition: (t) => `Do "${t}" with a controlled rollout` }, ctx);
    expect(r).toEqual({ text: 'Do "Add follow-up" with a controlled rollout', conditionOn: "Add follow-up" });
  });
});

describe("P1 — Command Center plan analysis cannot veto the canonical target", () => {
  const decision = resolveOwnerDecision(input([cand({ findingCode: "MKT_OPP_SCALE_WINNER", title: "Scale the winning campaign", domain: "marketing" })]));
  const ctx = ownerImperativeContext(decision);
  const summary = {
    doNotDo: ["Pause marketing spend"],
    topPriorities: [
      { severity: "high", whatIsWrong: "Biggest constraint: cash runway.", doNext: "Cut costs" },
      { severity: "high", whatIsWrong: "Stop: Pause marketing spend", doNext: "Hold this until the constraint above clears." },
    ],
    cadence: { now: "Cut costs", thisWeek: "Stabilise", stopLoss: "Do not act — this is blocked until the gate clears." },
  };

  it("stop / do-not / now are restated as constraints and suggestions, never whole-business orders", () => {
    const r = reconcilePlanSummary(summary, ctx);
    const all = [...r.doNotDo, ...r.topPriorities.flatMap((p) => [p.whatIsWrong, p.doNext]), r.cadence.now, r.cadence.thisWeek, r.cadence.stopLoss].join(" | ");
    expect(all).not.toMatch(/(^|\| )Stop:/);
    expect(all).not.toMatch(/Do not act/);
    expect(all).not.toMatch(/Hold this until/);
    expect(r.stopItemsAreConstraints).toBe(true);
    expect(r.doNotDo[0]).toBe('Plan constraint: Pause marketing spend — if "Scale the winning campaign" involves this, keep it within that limit.');
    expect(r.topPriorities[0].whatIsWrong).toBe("Plan analysis constraint: cash runway.");
    expect(r.cadence.now).toBe("Plan analysis suggestion: Cut costs");
  });

  it("the stop card and the growth gate become conditions on a GROW target", () => {
    const cards = reconcilePlanCards([{ id: "do_not_do", whatIsWrong: "Stop: Pause marketing spend", whyItMatters: "x", nextStep: "Hold this action until the constraint above is cleared." }], ctx);
    expect(cards[0].whatIsWrong).toMatch(/^Plan constraint: Pause marketing spend/);
    expect(cards[0].nextStep).not.toMatch(/Hold this/);
    expect(reconcilePlanGrowthGate({ scaleAllowed: false, blockedBy: ["cash_runway"] }, ctx)).toBe('keep "Scale the winning campaign" to a controlled first step — scaling is gated by: cash runway');
  });

  it("without a canonical decision on the page the plan output is unchanged", () => {
    const none = ownerImperativeContext(null);
    expect(reconcilePlanSummary(summary, none)).toBe(summary);
    expect(planConstraintAsCondition("Pause marketing spend", none)).toBe("Pause marketing spend");
  });
});

describe("P2 — Recovery, Finance confidence warning, missing-data guardrail", () => {
  const BLOCKS = ["scale / growth / expansion before stabilization is proven", "auto customer/tenant/buyer contact or auto-send of any draft"];

  it("Recovery 'no scaling' becomes a condition on a genuine growth target and stays as context otherwise", () => {
    const grow = ownerImperativeContext(resolveOwnerDecision(input([cand({ findingCode: "MKT_OPP_SCALE_WINNER", title: "Scale the winning campaign", domain: "marketing" })])));
    const repair = ownerImperativeContext(resolveOwnerDecision(input([cand({ findingCode: "FIN_HIGH_RECEIVABLES", title: "Collect overdue invoices", domain: "finance" })])));
    const g = reconcileRecoveryBlocks(BLOCKS, grow);
    expect(g[0]).toBe('taking "Scale the winning campaign" beyond a small, controlled first step until stabilisation is proven (scale / growth / expansion before stabilization is proven)');
    expect(g[1]).toBe(BLOCKS[1]);
    expect(reconcileRecoveryBlocks(BLOCKS, repair)).toEqual(BLOCKS);
  });

  it("a Finance main target is never told not to rely on Finance: the score is provisional, the issue is real", () => {
    const d = resolveOwnerDecision(input([cand({ findingCode: "FIN_HIGH_RECEIVABLES", title: "Collect overdue invoices", domain: "finance" })], {
      dataSufficiency: { status: "insufficient", lowestDataConfidenceScore: 20, lowConfidenceDomains: ["finance", "sales"], missingCriticalData: ["cashOnHand"] },
    }));
    const text = d.whatNotToDo.join(" ");
    expect(text).not.toMatch(/Don't rely on the Finance/);
    expect(text).toMatch(/The Finance issue in "Collect overdue invoices" is real enough to address, but its Finance score is provisional/);
    expect(d.whatNotToDo).toContain("Don't rely on the Sales scores yet — they are based on incomplete data.");
  });

  it("a stale-data refresh target never rewrites the genuine missing-data guardrail", () => {
    const cc = buildOwnerControlCenter({
      dataSufficiencyStatus: "insufficient", lowConfidenceDomains: ["finance"], blockedRecommendations: 0, proofBlocked: 0, financeBlocked: 0,
      sopsNeedingReview: 0, trainingRecommendations: 0, equipmentBottlenecks: [], processReviewsDue: 0, ownerApprovalsRequired: 0,
      reassessmentsDue: 0, approvalsAvoided: 0,
      attention: { criticalUnresolved: 0, ownerDecisionsRequired: 0, handledByOpsIQ: 0 } as never,
      mainTarget: { title: "Update the figures in Finance before acting on them", priorityClass: "SURVIVAL_CASH", source: "evidence_refresh", findingCode: "EVIDENCE_REFRESH" },
    });
    expect(cc.whatNotToDo).toEqual(["Do not make material decisions until the missing data is provided."]);
  });
});
