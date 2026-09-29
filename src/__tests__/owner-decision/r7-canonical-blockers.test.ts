/**
 * Round-7 regressions on the pure owner decision (canonical eligibility, blocker naming, change history)
 * and the plan-analysis reconciler:
 *   - a cash-safety block is named and routed by what DRIVES it: cash → "Stabilise cash"; a profit-driven
 *     Finance state → "Restore profitability" (Finance, profit class); figures that are not current →
 *     "Confirm current cash and Finance figures" (a data request) — a margin problem is never "Stabilise cash";
 *   - the do-not-repeat blocker routes to the rule's own control and is worded by what the rule matches;
 *   - a safety-gate blocker's confidence reflects its evidence (Round 8: recorded facts high, data-derived capped);
 *   - a held step says what holds it and what clears it;
 *   - change history: a tier change of one lever is one issue changing severity (never resolved + new);
 *     a diagnosis that could not measure never reports an issue as resolved;
 *   - plan-analysis softening removes ordering words only from owner-directed imperatives, never from facts.
 */
import { describe, it, expect } from "vitest";
import {
  canonicalEligibility,
  classifyOwnerFindingCode,
  describeOwnerChanges,
  ownerGateHoldText,
  OWNER_DNR_RULES_ROUTE,
  ownerDnrRuleRoute,
  resolveOwnerDecision,
  type OwnerDecisionCandidate,
  type ResolveOwnerDecisionInput,
} from "@/domain/owner-spine/owner-decision";
import { NO_OWNER_GATE_CONSTRAINTS, type OwnerGateConstraints } from "@/domain/owner-mode/owner-action-gate-policy";
import { neutralizePlanImperatives } from "@/domain/owner-spine/owner-imperatives";
import { issuesOf } from "@/services/owner-home/owner-change-facts";
import { NO_CHANGE_FACTS } from "./change-facts-fixture";

const BIZ = "biz-1";
const WS = "ws-1";

function cand(p: Partial<OwnerDecisionCandidate> & { findingCode: string; title: string; domain: OwnerDecisionCandidate["domain"] }): OwnerDecisionCandidate {
  const sourceId = p.sourceId ?? `${p.findingCode}-${p.title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return {
    candidateId: p.candidateId ?? `domain_action:${sourceId}`,
    businessId: BIZ, workspaceId: WS, source: p.source ?? "domain_action", domain: p.domain, sourceId,
    priorityClass: p.priorityClass ?? classifyOwnerFindingCode(p.findingCode), findingCode: p.findingCode, findingId: p.findingId ?? null,
    title: p.title, explanation: "", severity: p.severity === undefined ? "high" : p.severity, priorityScore: p.priorityScore ?? 60,
    expectedImpactScore: 50, confidence: p.confidence ?? 0.9, effortScore: 40, status: "proposed", ownerActionRequired: true, blocking: p.blocking ?? false,
    evidence: [], missingData: [], verificationMetric: null, evidenceAsOf: null, stale: false, exclusion: null, targetRoute: `/owner/${p.domain}`,
  };
}
function input(candidates: OwnerDecisionCandidate[], gate: OwnerGateConstraints | null, over: Partial<ResolveOwnerDecisionInput> = {}): ResolveOwnerDecisionInput {
  return {
    businessId: BIZ, workspaceId: WS, candidates, diagnosedDomains: ["finance", "marketing", "sales", "cashflow"],
    dataSufficiency: { status: "sufficient", lowestDataConfidenceScore: 90, lowConfidenceDomains: [], missingCriticalData: [] },
    staleDomains: [], strategy: null, reassessment: { days: 14, reason: "test" }, changeFacts: NO_CHANGE_FACTS, gate, now: new Date("2026-09-27T00:00:00Z"), ...over,
  };
}
const gate = (over: Partial<OwnerGateConstraints>): OwnerGateConstraints => ({ ...NO_OWNER_GATE_CONSTRAINTS, ...over });
const cashGate = (driver: "cash" | "finance_profit" | "unverified") => gate({ cash: { gateState: "AT_RISK", basis: "", driver } });
const scale = cand({ domain: "marketing", findingCode: "MKT_OPP_SCALE_WINNER", title: "Scale the winning campaign" });

describe("a cash-safety block is named and routed by what drives it", () => {
  it("cash → 'Stabilise cash' (Cash flow, survival class)", () => {
    const d = resolveOwnerDecision(input([scale], cashGate("cash")));
    expect(d.primaryTarget).toMatchObject({ source: "safety_gate", findingCode: "GATE_CASH_UNSAFE", priorityClass: "SURVIVAL_CASH", domain: "cashflow", targetRoute: "/owner/cashflow" });
    expect(d.primaryTarget!.title).toBe("Stabilise cash before advancing the work it holds back");
  });

  it("a profit-driven Finance state → 'Restore profitability' (Finance, profit class) — never 'Stabilise cash'", () => {
    const d = resolveOwnerDecision(input([scale], cashGate("finance_profit")));
    expect(d.primaryTarget).toMatchObject({ source: "safety_gate", findingCode: "GATE_PROFIT_UNSAFE", priorityClass: "PROFIT_LOSS", domain: "finance", targetRoute: "/owner/finance" });
    expect(d.primaryTarget!.title).toBe("Restore profitability before advancing the work it holds back");
    expect(d.attention.map((t) => t.title).join(" ")).not.toMatch(/Stabilise cash/);
  });

  it("…and an eligible Finance profit repair already addresses it (no synthesized blocker)", () => {
    const repair = cand({ domain: "finance", findingCode: "FIN_NEGATIVE_NET_MARGIN", title: "Cut the loss-making line" });
    const { ranked } = canonicalEligibility([scale, repair], { businessId: BIZ, workspaceId: WS, gate: cashGate("finance_profit") });
    expect(ranked.some((c) => c.source === "safety_gate")).toBe(false);
    expect(ranked[0].candidateId).toBe(repair.candidateId);
  });

  it("figures that are not current → 'Confirm current cash and Finance figures' (a data request), addressed by a refresh of those figures", () => {
    const d = resolveOwnerDecision(input([scale], cashGate("unverified")));
    expect(d.primaryTarget).toMatchObject({ source: "safety_gate", findingCode: "GATE_CASH_UNVERIFIED", priorityClass: "MISSING_CRITICAL_EVIDENCE" });
    expect(d.primaryTarget!.title).toBe("Confirm current cash and Finance figures before advancing the work they hold back");
    const staleCash = { ...cand({ domain: "cashflow", findingCode: "CF_LOW_RUNWAY", title: "Extend runway" }), stale: true };
    const { ranked } = canonicalEligibility([scale, staleCash], { businessId: BIZ, workspaceId: WS, gate: cashGate("unverified") });
    expect(ranked.some((c) => c.source === "safety_gate")).toBe(false);
    expect(ranked.some((c) => c.source === "evidence_refresh" && c.domain === "cashflow")).toBe(true);
  });
});

describe("the do-not-repeat blocker routes to the rule and is worded by what it matches", () => {
  it("broad area rule → 'growth step', routed to that rule in Cockpit → Do-not-repeat rules (Round 9: the exact rule)", () => {
    const g = gate({ doNotRepeat: [{ id: "r1", domain: "marketing", match: "broad", findingId: null }] });
    const d = resolveOwnerDecision(input([scale], g));
    expect(d.primaryTarget).toMatchObject({ source: "safety_gate", findingCode: "GATE_DO_NOT_REPEAT_REVIEW", ruleId: "r1", targetRoute: ownerDnrRuleRoute("r1") });
    expect(ownerDnrRuleRoute("r1").startsWith(OWNER_DNR_RULES_ROUTE.split("#")[0])).toBe(true);
    expect(d.primaryTarget!.title).toMatch(/growth step$/);
  });

  it("exact finding rule on growth work → 'that step' (it may hold any step for that finding, not only growth)", () => {
    const repeat = cand({ domain: "sales", findingCode: "SALES_OPP_WINBACK", title: "Win back lapsed customers", findingId: "f-1" });
    const g = gate({ doNotRepeat: [{ id: "r2", domain: "sales", match: "exact", findingId: "f-1" }] });
    const d = resolveOwnerDecision(input([repeat], g));
    expect(d.primaryTarget!.title).toBe("Review the earlier Sales result marked do-not-repeat before repeating that step");
    expect(d.primaryTarget!.targetRoute).toBe(ownerDnrRuleRoute("r2"));
  });

  it("exact finding rule on work that answers a present problem → the problem stays visible, with the rule review as its step (Round 8; Round 9 wording: the ISSUE, the step quoted)", () => {
    const repeat = cand({ domain: "sales", findingCode: "SALES_LOW_CONVERSION", title: "Retrain on follow-up", findingId: "f-1" });
    const g = gate({ doNotRepeat: [{ id: "r2", domain: "sales", match: "exact", findingId: "f-1" }] });
    const d = resolveOwnerDecision(input([repeat], g));
    expect(d.primaryTarget!.title).toMatch(/in Sales is still open, and its planned step "Retrain on follow-up" is marked do-not-repeat — respond another way or review that rule$/);
    expect(d.primaryTarget!.priorityClass).toBe(classifyOwnerFindingCode("SALES_LOW_CONVERSION"));
    expect(d.primaryTarget!.targetRoute).toBe(ownerDnrRuleRoute("r2"));
  });
});

describe("a safety-gate blocker's confidence reflects its evidence (Round 8, Decision 4)", () => {
  it("a data-derived cash blocker is capped by business-wide data shortage and says so; an unknown source is never high", () => {
    const d = resolveOwnerDecision(input([scale], cashGate("cash"), {
      dataSufficiency: { status: "insufficient", lowestDataConfidenceScore: 20, lowConfidenceDomains: ["sales"], missingCriticalData: [] },
    }));
    expect(d.primaryTarget!.source).toBe("safety_gate");
    expect(d.confidence.score).toBeLessThanOrEqual(40);
    expect(d.confidence.reasons.join(" ")).toMatch(/provisional/);
  });
  it("a recorded fact (an expired obligation with a known expiry) is not capped", () => {
    const d = resolveOwnerDecision(input([scale], gate({ expiredCompliance: { name: "Trade licence", kind: "licence" } }), {
      dataSufficiency: { status: "insufficient", lowestDataConfidenceScore: 20, lowConfidenceDomains: ["sales"], missingCriticalData: [] },
    }));
    expect(d.primaryTarget!.findingCode).toBe("GATE_COMPLIANCE_EXPIRED");
    expect(d.confidence.score).toBe(100);
  });
});

describe("a held step says what holds it and what clears it", () => {
  it.each([
    [cashGate("cash"), "CASH_SAFETY_BLOCKED", "This step is currently held by the cash safety limit. Stabilise cash before proceeding."],
    [cashGate("finance_profit"), "CASH_SAFETY_BLOCKED", "This step is currently held by the profitability safety limit. Restore profitability before proceeding."],
    [cashGate("unverified"), "CASH_SAFETY_BLOCKED", "This step is currently held by cash and Finance figures that are not current. Confirm current cash and Finance figures before proceeding."],
    [gate({ grossMarginPct: 5 }), "MARGIN_SAFETY_BLOCKED", "This step is currently held by the gross-margin safety floor. Restore gross margin above the floor before proceeding."],
    [gate({ capacity: { status: "blocked", reason: "Oven down", bottlenecks: ["Oven"] } }), "CAPACITY_BLOCKED", "This step is currently held by the capacity limit. Clear the capacity bottleneck before proceeding."],
    [gate({ expiredCompliance: { name: "Trade licence", kind: "licence" } }), "COMPLIANCE_BLOCKED", 'This step is currently held by the expired compliance obligation "Trade licence". Renew "Trade licence" (or get professional review) before proceeding.'],
  ] as const)("%#", (g, code, text) => {
    expect(ownerGateHoldText(code, g)).toBe(text);
  });
});

describe("change history follows one issue per business lever", () => {
  it("a runway tier change (CF_INSOLVENT_RUNWAY → CF_LOW_RUNWAY) is one issue whose severity changed — never resolved + new", () => {
    const previousIssues = issuesOf("cashflow", [{ code: "CF_INSOLVENT_RUNWAY", severity: "critical", title: "Cash runs out within days" }]);
    const currentIssues = issuesOf("cashflow", [{ code: "CF_LOW_RUNWAY", severity: "high", title: "Cash runway is short" }]);
    expect(Object.keys(previousIssues)).toEqual(Object.keys(currentIssues));
    const changes = describeOwnerChanges({
      ...NO_CHANGE_FACTS, since: new Date("2026-09-01T00:00:00Z"),
      transitions: [{ domain: "cashflow", previousEvidenceId: "s1", currentEvidenceId: "s2", newerEvidence: true, at: new Date("2026-09-20T00:00:00Z"), previousIssues, currentIssues }],
    });
    const kinds = changes.map((c) => c.kind);
    expect(kinds).toContain("SEVERITY_DECREASED");
    expect(kinds).not.toContain("CRITICAL_ISSUE_RESOLVED");
    expect(kinds).not.toContain("CRITICAL_ISSUE_APPEARED");
  });

  it("a diagnosis that could not measure never reports an earlier critical issue as resolved (a data gap is not a fix)", () => {
    const previousIssues = issuesOf("sales", [{ code: "SALES_HIGH_REFUND_RATE", severity: "critical", title: "Refunds are high" }]);
    const currentIssues = issuesOf("sales", [{ code: "SALES_MISSING_CRITICAL_DATA", severity: "high", title: "Key sales figures missing" }]);
    const base = { domain: "sales" as const, previousEvidenceId: "s1", currentEvidenceId: "s2", newerEvidence: true, at: new Date("2026-09-20T00:00:00Z"), previousIssues, currentIssues };
    const unproven = describeOwnerChanges({ ...NO_CHANGE_FACTS, since: new Date("2026-09-01T00:00:00Z"), transitions: [{ ...base, resolutionUnproven: true }] });
    expect(unproven.map((c) => c.kind)).not.toContain("CRITICAL_ISSUE_RESOLVED");
    const measured = describeOwnerChanges({ ...NO_CHANGE_FACTS, since: new Date("2026-09-01T00:00:00Z"), transitions: [{ ...base, resolutionUnproven: false }] });
    expect(measured.map((c) => c.kind)).toContain("CRITICAL_ISSUE_RESOLVED");
  });
});

describe("plan-analysis softening touches owner-directed imperatives only", () => {
  it.each([
    "Revenue dropped immediately after the price rise.",
    "The loan is repaid first.",
    "Payroll must be paid by Friday.",
    "No more than two suppliers deliver on time.",
  ])("factual prose is left exactly as written: %s", (fact) => {
    expect(neutralizePlanImperatives(fact).text).toBe(fact);
  });

  it("an owner-directed imperative loses its ordering claim", () => {
    expect(neutralizePlanImperatives("Collect overdue receivables first.").text).toBe("Collect overdue receivables.");
    expect(neutralizePlanImperatives("Reduce stock immediately before any new spend on marketing.").text).toBe("Reduce stock.");
    expect(neutralizePlanImperatives("Start with the payroll reserve.").text).toBe("The payroll reserve.");
    expect(neutralizePlanImperatives("Do not hire this quarter.")).toEqual({ text: "the plan analysis holds back hire this quarter.", heldBack: true });
  });
});
